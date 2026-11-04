import { nanoid } from "nanoid";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { autoReferenceMedia } from "../utils/canvas-auto-references";
import { buildAllCanvasResourceReferences } from "../utils/canvas-resource-references";

const targetTypes = new Set([CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Config]);

export function planLocalConnection(text: string, nodes: CanvasNodeData[]) {
    if (/(?:不要|不用|取消|删除|断开).{0,6}(?:连线|连接|连到)/.test(text)) return null;
    const parts = text.split(/(?:连接到|连到|接到|接入|指向|连接|→|->)/);
    if (parts.length !== 2 || !/(?:连|接|指向|→|->)/.test(text)) return null;
    const match = (part: string) => {
        const found = nodes.filter(node => node.type !== CanvasNodeType.Group && node.title?.trim().length >= 2 && part.includes(node.title.trim()));
        return found.filter(node => !found.some(other => other !== node && other.title?.trim().includes(node.title.trim()) && part.includes(other.title.trim())));
    };
    const from = match(parts[0]), to = match(parts[1]);
    if (from.length !== 1 || to.length !== 1) return { reply: "请写清两个节点的名称和方向，例如「把穿越重逢视频连到空白视频节点」；同名节点请先改名。", actions: [] };
    if (from[0].id === to[0].id) return { reply: "不能把节点连接到它自己，请指定另一个目标节点。", actions: [] };
    return { reply: "", actions: [{ id: nanoid(), name: "create_connection" as const, arguments: { fromNodeId: from[0].id, toNodeId: to[0].id } }] };
}

export function planLocalReferences(text: string, nodes: CanvasNodeData[], selectedIds: string[], explicitIds: string[] = []) {
    const request = text.replace(/(?:不要|不用|无需|不必).{0,3}(?:生成|制作)/g, "");
    if (!/@|艾特|引用|参考|绑定|配乐|背景音乐|BGM/i.test(request) || /生成|制作|删除|整理|改写|重写|修改/.test(request)) return null;
    const targets = nodes.filter(node => targetTypes.has(node.type));
    const named = targets.filter(node => node.title?.trim().length >= 2 && text.includes(node.title.trim()) && (new RegExp("(?:到|给|为|在|向|至)[「“\\s]*" + escapePattern(node.title.trim())).test(text) || !node.metadata?.content));
    const selected = targets.filter(node => selectedIds.includes(node.id));
    const candidates = named.length ? named : selected;
    if (candidates.length !== 1) return { reply: "请先选中一个图片或视频节点，或明确目标节点名称，再告诉我要引用哪些图片、视频或音频。", actions: [] };
    const target = candidates[0];
    const resources = buildAllCanvasResourceReferences(nodes).filter(item => item.nodeId !== target.id && item.kind !== "text");
    const tokens = [...text.matchAll(/@\[node:([^\]]+)\]/g)].map(match => match[1]);
    const byLabel = resources.filter(item => new RegExp("@?" + escapePattern(item.label) + "(?![0-9])").test(text)).map(item => item.nodeId);
    const explicit = [...new Set([...explicitIds, ...tokens, ...byLabel])].filter(id => resources.some(item => item.nodeId === id));
    const match = autoReferenceMedia(text, resources, explicit);
    if (match.ambiguous.length) return { reply: "这些资产存在同名节点，请手动 @ 选择：" + match.ambiguous.join("、"), actions: [] };
    if (!match.ids.length) return { reply: "请告诉我资产名称，或输入 @ 选择图片、视频和音频。我会把它们引用到「" + target.title + "」。", actions: [] };
    return { reply: "", actions: [{ id: nanoid(), name: "set_node_references" as const, arguments: { nodeId: target.id, sourceNodeIds: match.ids } }] };
}

export function applyNodeReferences(nodes: CanvasNodeData[], connections: CanvasConnection[], nodeId: string, sourceNodeIds: string[]) {
    const target = nodes.find(node => node.id === nodeId);
    if (!target || !targetTypes.has(target.type)) throw new Error("请选择真实的图片、视频或生成配置节点作为引用目标");
    if (!sourceNodeIds.length || sourceNodeIds.length > 50) throw new Error("请选择 1–50 个参考资产");
    const resources = buildAllCanvasResourceReferences(nodes);
    const sources = [...new Set(sourceNodeIds)].map(id => {
        const resource = resources.find(item => item.nodeId === id);
        if (!resource || resource.kind === "text" || id === nodeId) throw new Error("参考资产不存在、尚无内容或引用了目标自身：" + id);
        const mode = target.type === CanvasNodeType.Config ? target.metadata?.generationMode || "image" : target.type;
        if (mode === "image" && resource.kind !== "image") throw new Error("图片节点只能引用图片；音频和视频请引用到视频节点");
        if (mode !== "image" && mode !== "video") throw new Error("当前节点不支持这类参考资产");
        return resource;
    });
    const nextConnections = [...connections];
    for (const source of sources) if (!nextConnections.some(edge => edge.fromNodeId === source.nodeId && edge.toNodeId === nodeId)) nextConnections.push({ id: nanoid(), fromNodeId: source.nodeId, toNodeId: nodeId });
    // Keep existing inputs referenced when adding chips; never replace the user's prompt.
    const allIds = nextConnections.filter(edge => edge.toNodeId === nodeId && resources.some(item => item.nodeId === edge.fromNodeId)).map(edge => edge.fromNodeId);
    const field = target.type === CanvasNodeType.Config ? "composerContent" : "prompt";
    const original = target.metadata?.[field] ?? target.metadata?.prompt ?? "";
    const chips = [...new Set(allIds)].filter(id => !original.includes("@[node:" + id + "]")).map(id => "@[node:" + id + "]");
    const prompt = original + (chips.length ? (original ? "\n" : "") + "参考素材：" + chips.join(" ") : "");
    return { nodes: nodes.map(node => node.id === nodeId ? { ...node, metadata: { ...node.metadata, [field]: prompt } } : node), connections: nextConnections, result: { ok: true, nodeId, referenceNodeIds: sources.map(item => item.nodeId), submitted: false, message: "已将「" + sources.map(item => item.title).join("」、「") + "」引用到「" + target.title + "」，尚未提交生成。" } };
}

function escapePattern(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
