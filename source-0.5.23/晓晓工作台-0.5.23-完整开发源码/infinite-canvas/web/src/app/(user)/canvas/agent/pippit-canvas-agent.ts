import { nanoid } from "nanoid";
import { workbench } from "@/services/api/workbench";
import type { CanvasNodeData } from "../types";
import { planLocalConnection, planLocalReferences } from "./canvas-agent-references";
import { canvasAgentAllowsArrangement, executeActions, type RunCanvasAgentInput, type RunCanvasAgentResult } from "./canvas-agent-runtime";
import { canvasAgentActionLabel, CANVAS_AGENT_TOOLS, parseCanvasAgentJson } from "./canvas-agent-tools";

const LOCAL_TOOLS = new Set(["get_canvas_summary", "get_selected_nodes", "query_canvas_nodes", "get_node", "get_connected_nodes", "get_upstream_nodes", "get_downstream_nodes", "get_generation_config", "set_node_references", "create_text_node", "update_text_node", "update_node", "create_connection", "delete_connection", "create_group", "arrange_nodes"]);

type Input = RunCanvasAgentInput & {
    nodes: CanvasNodeData[];
    selectedNodeIds: string[];
    threadId?: string;
    pendingRequestId?: string;
    pendingText?: string;
    onRequest: (requestId: string | undefined, threadId?: string) => void;
};

export async function runPippitCanvasAgent(input: Input): Promise<RunCanvasAgentResult> {
    input.signal?.throwIfAborted();
    let state = input.initialState;
    const finish = (reply: string) => ({ reply, state, protocolMessages: [...input.protocolMessages, { role: "user" as const, content: input.userText }, { role: "assistant" as const, content: reply }] });
    const apply = async (actions: Parameters<typeof executeActions>[0]) => {
        input.signal?.throwIfAborted();
        const output = await executeActions(actions, state, input.executeAction, input.signal, input.onEvent);
        state = output.state;
        return output.items.map(item => item.result.message || (item.result.ok ? canvasAgentActionLabel(item.action).replace(/^正在/, "已") : "本地操作未完成，请检查目标节点或资产。")).join("\n");
    };
    if (input.userText.trim().startsWith("{")) {
        const pasted = await parseCanvasAgentJson(input.userText);
        if (pasted.error) return finish("粘贴的画布指令无效：" + pasted.error);
        if (pasted.parsed) {
            if (pasted.actions.some(action => !LOCAL_TOOLS.has(action.name))) return finish("粘贴的指令包含当前模式不支持的操作，本批操作未执行。");
            const actions = pasted.actions.filter(action => action.name !== "arrange_nodes" || canvasAgentAllowsArrangement(input.userText));
            return finish(actions.length ? await apply(actions) : pasted.reply || "没有可执行的本地画布操作。");
        }
    }
    const local = planLocalConnection(input.userText, input.nodes) || planLocalReferences(input.userText, input.nodes, input.selectedNodeIds, input.references.map(item => item.id));
    if (local) return finish(local.actions.length ? await apply(local.actions) : local.reply);
    if (!input.pendingRequestId && /^[0-9０-９一二三四五六七八九十]+[.．、]?$/.test(input.userText.trim())) {
        return finish("只收到「" + input.userText.trim() + "」，无法确定你想操作什么。请写明目标节点和动作，例如「把人物图和温柔配乐引用到镜头一」。");
    }
    if (input.pendingRequestId && input.pendingText !== input.userText) throw new Error("上一条小云雀请求还未查完，请点击原消息的重试继续查询；本地 @ 引用仍可直接使用。");
    const bridge = workbench();
    let requestId = input.pendingRequestId;
    if (!requestId) {
        const context = input.getContext(state);
        const message = JSON.stringify({
            instruction: "你是外部本地画布的指令规划助手，只做文字规划。不要调用小云雀的图片、视频、音频、上传或云端画布工具。下面是本地画布的真实节点与工具定义，不是小云雀云端资产。只能引用真实节点 ID，不得猜测媒体内容。优先用 set_node_references 帮用户把图片、视频和音频 @ 到现有节点；仅返回 JSON：{actions:[{name:工具名,arguments:参数}],reply:中文说明}。不要声称操作已执行。操作将由外部本地工作台执行并验证。没有明确目标或资产时 actions 为空，在 reply 中提问。", 
            context: { ...context, nodes: context.nodes.map(({ mediaUrl: _url, ...node }) => node) },
            references: input.references.map(({ id, title, type, label }) => ({ id, title, type, label })),
            tools: CANVAS_AGENT_TOOLS.filter(tool => LOCAL_TOOLS.has(tool.function.name)),
            userText: input.userText,
        });
        requestId = nanoid();
        input.onRequest(requestId, input.threadId);
        input.onEvent?.({ status: "thinking", label: "正在请小云雀规划本地画布操作" });
        const task = await bridge.pippitAgentSubmit({ requestId, message, threadId: input.threadId });
        input.onRequest(requestId, task.threadId);
    }
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        input.signal?.throwIfAborted();
        const result = await bridge.pippitAgentQuery(requestId);
        input.signal?.throwIfAborted();
        if (result.status === "not_submitted") { input.onRequest(undefined, input.threadId); throw new Error("上一条请求尚未提交，请确认小云雀登录后重试。"); }
        if (result.status === "unknown") throw new Error("小云雀上次提交结果未知，已阻止重复发送；请到小云雀核对会话。");
        if (result.status === "error") { input.onRequest(undefined, result.threadId); throw new Error("小云雀文字任务失败，请查看原会话。"); }
        if (result.status === "completed") {
            input.onRequest(undefined, result.threadId);
            if (!result.reply?.trim()) throw new Error("官网会话可能已有回复，但当前小云雀 CLI 没有把助手正文返回工作台，因此本地操作没有执行。可直接说「把 A 连到 B」，或将官网返回的画布 JSON 粘贴到这里执行。原会话：" + (result.webThreadLink || result.threadId));
            const plan = await parseCanvasAgentJson(result.reply);
            if (plan.error) throw new Error("小云雀返回的指令无效，本地画布未改动：" + plan.error);
            if (!plan.parsed) return finish("小云雀回复了文字，但没有返回本地画布指令，未修改画布：\n" + result.reply);
            if (plan.actions.some(action => !LOCAL_TOOLS.has(action.name))) throw new Error("小云雀返回了当前模式不支持的操作，本批操作未执行；图片、视频生成请使用画布生成按钮。");
            const actions = plan.actions.filter(action => action.name !== "arrange_nodes" || canvasAgentAllowsArrangement(input.userText));
            return finish(actions.length ? await apply(actions) : plan.reply || "小云雀没有返回画布操作，请补充目标节点和参考资产。");
        }
        input.onEvent?.({ status: "thinking", label: "正在等待小云雀文字结果" });
        await pause(2000, input.signal);
    }
    throw new Error("小云雀文字任务仍未查到明确结果，原请求已保留。点击这条消息的重试只继续查询，不会重复发送。");
}

function pause(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const stop = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); reject(new DOMException("已停止", "AbortError")); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve(); }, ms);
        signal?.addEventListener("abort", stop, { once: true });
        if (signal?.aborted) stop();
    });
}
