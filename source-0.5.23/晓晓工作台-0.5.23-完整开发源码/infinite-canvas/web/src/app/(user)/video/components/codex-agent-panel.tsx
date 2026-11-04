"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, Tag, Tooltip } from "antd";
import {
    Bot,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Crosshair,
    LoaderCircle,
    Maximize2,
    Minimize2,
    PanelLeftClose,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Send,
    Settings,
    Sparkles,
    Square,
    Trash2,
    Video,
} from "lucide-react";
import { nanoid } from "nanoid";
import type { Asset } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { AGENT_PANEL_MAX, AGENT_PANEL_MIN, useWorkbenchLayoutStore } from "@/stores/use-workbench-layout-store";
import { diffPromptLines, diffStats } from "../agent-prompt-diff";
import { Input, Modal, Radio, Select, Tabs } from "antd";

export type AgentTargetInfo = {
    id?: string;
    title: string;
    prompt: string;
    seconds?: string;
    size?: string;
    resolution?: string;
    model?: string;
};

type AgentStep = {
    label: string;
    tag: string;
    status: "pending" | "running" | "done" | "error";
};

type AgentMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    targetTitle?: string;
    targetId?: string;
    createdAt: number;
    status?: "running" | "done" | "error";
    steps?: AgentStep[];
    stepsOpen?: boolean;
    summary?: string;
    changes?: string[];
    revisedPrompt?: string;
    revisedParams?: { seconds?: string; size?: string; resolution?: string; model?: string };
    /** 发送指令时的原提示词，仅用于显示修改对比。 */
    originalPrompt?: string;
    applied?: boolean;
    error?: string;
};

type Props = {
    projectId: string;
    projectName: string;
    globalPrompt?: string;
    projectAssets: Asset[];
    elementRules?: Record<string, { disabled?: boolean }>;
    target: AgentTargetInfo;
    onApplyResult: (payload: {
        prompt: string;
        params?: { seconds?: string; size?: string; resolution?: string; model?: string };
        autoStart?: boolean;
    }) => void;
    onClose: () => void;
    /** 侧栏正在收起：立即停止本次思考（与卸载时相同），并播放收起动画。 */
    closing?: boolean;
    /** 在视频台中定位并高亮当前目标视频。 */
    onLocateTarget?: () => void;
};

type QuickPromptItem = { id: string; label: string; text: string };

const DEFAULT_QUICK_PROMPTS: QuickPromptItem[] = [
    { id: "1", label: "修画面/动作毛病", text: "这个视频出来的画面动作有点怪，请帮我优化动作与镜头稳定性描述，避免人物肢体变形或乱动，保留原有剧情和@素材。" },
    { id: "2", label: "稳住眼神与面部", text: "请强化人物面部表情和眼神稳定度描述，保持视线聚焦自然、五官稳定不崩坏，保留原有分镜与@素材。" },
    { id: "3", label: "精简防吞字", text: "当前提示词有点太碎，请帮我精简紧凑润色，保留核心动作、台词和所有@素材引用。" },
    { id: "4", label: "改4秒快节奏", text: "帮我把这段视频改成4秒的紧凑版本，同步调整里面的分镜时间段，保留核心画面。" },
];

export type AgentModelSettings = {
    provider: "codex" | "custom";
    codexModel?: string; // empty string = auto
    customApi?: {
        baseUrl: string;
        apiKey: string;
        model: string;
        useSavedKey?: boolean;
        hasKey?: boolean;
    };
};

export function CodexAgentPanel({
    projectId,
    projectName,
    globalPrompt,
    projectAssets,
    elementRules,
    target,
    onApplyResult,
    onClose,
    closing = false,
    onLocateTarget,
}: Props) {
    const { message } = App.useApp();
    const configChannels = useConfigStore(s => s.config.localChannels || []);
    const panelWidth = useWorkbenchLayoutStore(s => s.agentPanelWidth);
    const setPanelWidth = useWorkbenchLayoutStore(s => s.setAgentPanelWidth);
    const wide = panelWidth >= 460;
    const [resizing, setResizing] = useState(false);
    const resizeRef = useRef<{ x: number; width: number; frame: number; next?: number } | null>(null);
    const [resultViews, setResultViews] = useState<Record<string, "diff" | "full">>({});
    const [autoApply, setAutoApply] = useState(true);
    const autoApplyRef = useRef(autoApply);
    autoApplyRef.current = autoApply;
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [codexStatus, setCodexStatus] = useState<{ available: boolean; authenticated: boolean; source: string; models?: { slug: string; name: string }[] } | null>(null);
    const [messagesByProject, setMessagesByProject] = useState<Record<string, AgentMessage[]>>({});
    const messages = messagesByProject[projectId] || [];
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const latestTarget = useRef({projectId, ...target});
    latestTarget.current={projectId, ...target};
    useEffect(() => () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setBusy(false);
        setMessagesByProject(previous => ({ ...previous, [projectId]: (previous[projectId] || []).map(item => item.status === "running" ? { ...item, status: "done", summary: "切换目标，已停止本次思考。", stepsOpen: false } : item) }));
    }, [projectId, target.id]);
    useEffect(() => {
        if (!closing) return;
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setBusy(false);
    }, [closing]);

    // Quick prompts state
    const [quickPrompts, setQuickPrompts] = useState<QuickPromptItem[]>(() => {
        try {
            const raw = localStorage.getItem("xiaoxiao:agent-quick-prompts");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch {}
        return DEFAULT_QUICK_PROMPTS;
    });
    const [managePromptsOpen, setManagePromptsOpen] = useState(false);
    const [editingPrompts, setEditingPrompts] = useState<QuickPromptItem[]>([]);

    // Model settings state
    const [modelSettings, setModelSettings] = useState<AgentModelSettings>(() => {
        try {
            const raw = localStorage.getItem("xiaoxiao:agent-model-settings");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") return parsed;
            }
        } catch {}
        return { provider: "codex", codexModel: "" };
    });
    const [modelModalOpen, setModelModalOpen] = useState(false);
    const [tempSettings, setTempSettings] = useState<AgentModelSettings>(modelSettings);
    const [savingSettings, setSavingSettings] = useState(false);

    const updateMessages = (updater: (prev: AgentMessage[]) => AgentMessage[]) => {
        setMessagesByProject(prev => ({
            ...prev,
            [projectId]: updater(prev[projectId] || []),
        }));
    };

    useEffect(() => {
        fetch("/api/codex-agent/settings").then(r=>r.json()).then(d=>{if(d.ok&&d.settings){const settings={...d.settings,customApi:d.settings.customApi?{...d.settings.customApi,useSavedKey:true}:undefined};setModelSettings(settings);setTempSettings(settings);localStorage.setItem("xiaoxiao:agent-model-settings",JSON.stringify(settings));}}).catch(()=>{});
        fetch("/api/codex-agent")
            .then(r => r.json())
            .then(data => {
                if (data?.ok) setCodexStatus(data);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length, busy]);

    const stopThinking = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setBusy(false);
        updateMessages(prev =>
            prev.map(m =>
                m.status === "running"
                    ? {
                          ...m,
                          status: "done",
                          summary: "已暂停 Agent 思考。",
                          error: undefined,
                          steps: m.steps?.map(s => (s.status === "running" ? { ...s, label: s.label + "（已暂停）", status: "done" } : s)),
                      }
                    : m,
            ),
        );
        message.info("已停止 Agent 思考");
    };

    const sendInstruction = async (customText?: string) => {
        const text = (customText ?? input).trim();
        if (!text || busy) return;
        if (!customText) setInput("");

        const userMsg: AgentMessage = {
            id: nanoid(),
            role: "user",
            text,
            targetTitle: target.title,
            targetId: target.id,
            createdAt: Date.now(),
        };
        const assistantId = nanoid();
        const initialSteps: AgentStep[] = [
            { label: `读取目标视频 ${target.title}`, tag: "Canvas", status: "done" },
            { label: "核对当前项目角色与场景资产库", tag: "Assets", status: "done" },
            { label: modelSettings.provider === "custom" ? `调用自定义 API (${modelSettings.customApi?.model || "API"})` : "调用本机 Codex 额度分析并改写提示词", tag: modelSettings.provider === "custom" ? "API" : "Codex", status: "running" },
            { label: "生成修改后提示词与参数建议", tag: "Tool", status: "pending" },
        ];
        const placeholderMsg: AgentMessage = {
            id: assistantId,
            role: "assistant",
            text: "",
            targetTitle: target.title,
            targetId: target.id,
            createdAt: Date.now(),
            status: "running",
            steps: initialSteps,
            stepsOpen: true,
            originalPrompt: target.prompt,
        };

        updateMessages(prev => [...prev, userMsg, placeholderMsg]);
        setBusy(true);

        const origin={...latestTarget.current};
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const activeAssets = projectAssets
                .filter(a => !elementRules?.[a.id]?.disabled)
                .map(a => ({
                    title: a.title,
                    category: a.category || a.kind,
                    aliases: Array.isArray(a.metadata?.elementAliases) ? a.metadata.elementAliases : [],
                }));

            const history = messages
                .filter(m => m.targetId === target.id && m.targetTitle === target.title && m.status !== "running" && (m.text || m.summary))
                .slice(-6)
                .map(m => ({
                    role: m.role,
                    text: m.role === "user" ? m.text : `${m.summary || ""}\n${m.revisedPrompt || ""}`,
                }));

            const res = await fetch("/api/codex-agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    instruction: text,
                    backend: modelSettings.provider === "custom" ? "custom-api" : "codex",
                    model: modelSettings.provider === "codex" ? (modelSettings.codexModel || "") : undefined,
                    customApi: modelSettings.provider === "custom" ? modelSettings.customApi : undefined,
                    targetTitle: target.title,
            targetId: target.id,
                    currentPrompt: target.prompt,
                    globalPrompt: globalPrompt || "",
                    currentParams: {
                        model: target.model,
                        seconds: target.seconds,
                        size: target.size,
                        resolution: target.resolution,
                    },
                    projectAssets: activeAssets,
                    history,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "Agent 调用失败");
            }

            if(controller.signal.aborted||abortControllerRef.current!==controller)return;
            const sameTarget=JSON.stringify(latestTarget.current)===JSON.stringify(origin);
            const shouldAutoApply = autoApplyRef.current && sameTarget && Boolean(data.prompt);
            if (shouldAutoApply) {
                onApplyResult({
                    prompt: data.prompt,
                    params: data.params,
                    autoStart: false,
                });
                message.success(`Agent 已将修改后的提示词填入「${target.title}」（可按 Ctrl+Z 撤回）`);
            }

            updateMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? {
                              ...m,
                              status: "done",
                              steps: data.steps || initialSteps.map(s => ({ ...s, status: "done" })),
                              stepsOpen: false,
                              summary: data.summary,
                              changes: data.changes || [],
                              revisedPrompt: data.prompt,
                              revisedParams: data.params,
                              applied: shouldAutoApply,
                          }
                        : m,
                ),
            );
        } catch (err: any) {
            if (controller.signal.aborted || err?.name === "AbortError" || abortControllerRef.current !== controller) {
                return;
            }
            const errText = err instanceof Error ? err.message : "调用失败";
            updateMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? {
                              ...m,
                              status: "error",
                              error: errText,
                              steps: m.steps?.map(s => (s.status === "running" ? { ...s, status: "error" } : s)),
                              stepsOpen: true,
                          }
                        : m,
                ),
            );
            message.error(errText);
        } finally {
            if(abortControllerRef.current===controller){abortControllerRef.current = null;setBusy(false);}
        }
    };

    const endResize = () => {
        const drag = resizeRef.current;
        if (!drag) return;
        cancelAnimationFrame(drag.frame);
        if (drag.next !== undefined) setPanelWidth(drag.next);
        resizeRef.current = null;
        setResizing(false);
    };
    const codexReady = modelSettings.provider === "custom" || codexStatus?.authenticated !== false;

    return (
        <aside
            data-codex-agent-panel
            data-state={closing ? "closing" : "open"}
            data-busy={busy || undefined}
            data-resizing={resizing || undefined}
            inert={closing || undefined}
            aria-label="Agent 创作助手侧栏"
            style={{ width: panelWidth }}
            className="wb-agent-panel relative flex h-full shrink-0 flex-col border-r border-border bg-card/95"
        >
            {/* Header matching Runow left panel */}
            <header className="wb-agent-head relative flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="wb-agent-logo flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary/15 text-primary">
                        <Bot className="size-4" />
                    </span>
                    <div className="min-w-0">
                        <strong className="block truncate text-sm leading-5">Agent 创作助手</strong>
                        <div className="flex min-w-0 items-center gap-1.5">
                            <button
                                type="button"
                                aria-label="配置 Agent 模型"
                                onClick={() => {
                                    setTempSettings(modelSettings);
                                    setModelModalOpen(true);
                                }}
                                className="wb-agent-model flex max-w-[11rem] shrink-0 items-center gap-1 rounded-full border border-border bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-foreground hover:border-primary hover:text-primary"
                            >
                                <span className="truncate">
                                    {modelSettings.provider === "custom"
                                        ? `API · ${modelSettings.customApi?.model || "自定义"}`
                                        : `Codex · ${codexStatus?.models?.find(m => m.slug === modelSettings.codexModel)?.name || (modelSettings.codexModel || "自动")}`}
                                </span>
                                <Settings className="size-2.5 shrink-0 opacity-60" />
                            </button>
                            <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] text-muted-foreground" title={projectName}>
                                <span aria-hidden className="wb-led" data-tone={busy ? "busy" : codexReady ? "ok" : "warn"} />
                                <span className="truncate">{busy ? "正在思考…" : modelSettings.provider === "custom" ? "自定义 API" : codexStatus?.authenticated !== false ? "本机 Codex 额度已就绪" : "请先登录本机 Codex"}</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                    {messages.length > 0 && (
                        <Tooltip title="清空当前项目对话">
                            <Button
                                size="small"
                                type="text"
                                aria-label="清空 Agent 对话"
                                icon={<Trash2 className="size-3.5" />}
                                onClick={() => updateMessages(() => [])}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title={wide ? "恢复标准侧栏宽度" : "加宽侧栏，方便查看对话"}>
                        <Button
                            size="small"
                            type="text"
                            aria-label={wide ? "恢复标准侧栏宽度" : "加宽侧栏，方便查看对话"}
                            icon={wide ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                            onClick={() => setPanelWidth(wide ? 380 : 520)}
                        />
                    </Tooltip>
                    <Tooltip title="收起 Agent 侧边栏">
                        <Button
                            size="small"
                            type="text"
                            aria-label="收起 Agent 侧边栏"
                            icon={<PanelLeftClose className="size-4" />}
                            onClick={onClose}
                        />
                    </Tooltip>
                </div>
                <span aria-hidden className="wb-agent-scan" />
            </header>

            {/* Conversation body */}
            <div ref={scrollRef} className="wb-agent-body min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {messages.length === 0 ? (
                    <div data-agent-msg="intro" className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-xs leading-5 text-muted-foreground">
                        <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
                            <Sparkles className="size-4 text-primary" />
                            怎么用 Agent 改有毛病的视频？
                        </p>
                        <ol className="list-inside list-decimal space-y-1.5">
                            <li>
                                在右侧任意视频卡片上点 <strong>「发给 Agent」</strong>（或直接载入某组视频）。
                            </li>
                            <li>
                                在下方直接用口语告诉 Agent 哪里不对，例如：
                                <span className="mt-1 block rounded-lg bg-secondary/70 px-2.5 py-1.5 text-foreground">
                                    “第2个女生跳舞视频帮我改成男性，去掉多余路人，生成一个4秒的视频，480p”
                                </span>
                            </li>
                            <li>
                                Agent 会调用<strong>当前选择的模型接口</strong>自动改好提示词并填入下方提示词框（支持 <kbd>Ctrl+Z</kbd> 撤回）。
                            </li>
                        </ol>
                    </div>
                ) : (
                    messages.map(msg =>
                        msg.role === "user" ? (
                            <div key={msg.id} data-agent-msg="user" className="flex flex-col items-end gap-1">
                                {msg.targetTitle && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                                        <Video className="size-3" />
                                        {msg.targetTitle}
                                    </span>
                                )}
                                <div className="wb-agent-bubble max-w-[90%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-xs leading-5 text-primary-foreground shadow-xs whitespace-pre-wrap break-words">
                                    {msg.text}
                                </div>
                            </div>
                        ) : (
                            <div key={msg.id} data-agent-reply data-agent-msg="assistant" data-status={msg.status} className="wb-agent-reply space-y-2 rounded-2xl border border-border bg-background p-3 text-xs shadow-xs">
                                {/* Runow-style 思路与进度 collapsible card */}
                                {msg.steps && msg.steps.length > 0 && (
                                    <div className="wb-agent-steps rounded-xl border border-border/80 bg-secondary/40 p-2.5">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateMessages(prev =>
                                                    prev.map(m => (m.id === msg.id ? { ...m, stepsOpen: !m.stepsOpen } : m)),
                                                )
                                            }
                                            className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                {msg.status === "running" ? (
                                                    <LoaderCircle className="size-3.5 animate-spin text-primary" />
                                                ) : msg.status === "error" ? (
                                                    <span className="text-destructive">!</span>
                                                ) : (
                                                    <Check className="size-3.5 text-emerald-600" />
                                                )}
                                                <span>
                                                    {msg.status === "running"
                                                        ? "思路与进度 · 正在思考改写…"
                                                        : msg.status === "error"
                                                          ? "执行中断"
                                                          : `已完成 ${msg.steps.length} 步 · 思路与进度`}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                {msg.steps.length} 步
                                                {msg.stepsOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                            </span>
                                        </button>
                                        {msg.stepsOpen && (
                                            <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                                                {msg.steps.map((step, idx) => (
                                                    <div key={idx} data-step-status={step.status} className="wb-agent-step flex items-center justify-between gap-2 text-[11px]">
                                                        <span className="truncate text-foreground/90">{step.label}</span>
                                                        <span className=" flex shrink-0 items-center gap-1.5 text-muted-foreground">
                                                            <span className="rounded bg-background px-1.5 py-0.5 text-[10px]">{step.tag}</span>
                                                            {step.status === "running" ? (
                                                                <LoaderCircle className="size-3 animate-spin text-primary" />
                                                            ) : step.status === "done" ? (
                                                                <Check className="size-3 text-emerald-600" />
                                                            ) : step.status === "error" ? (
                                                                <span className="text-destructive">×</span>
                                                            ) : (
                                                                <span>·</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {msg.status === "running" && (
                                    <div aria-hidden className="wb-agent-skeleton">
                                        <i />
                                        <i />
                                        <i />
                                    </div>
                                )}

                                {msg.error && (
                                    <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-wrap">{msg.error}</p>
                                )}

                                {msg.summary && <p className="font-medium leading-5 text-foreground">{msg.summary}</p>}

                                {msg.changes && msg.changes.length > 0 && (
                                    <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                                        {msg.changes.map((item, idx) => (
                                            <li key={idx}>{item}</li>
                                        ))}
                                    </ul>
                                )}

                                {msg.revisedParams &&
                                    Object.values(msg.revisedParams).some(Boolean) && (
                                        <div className="flex flex-wrap gap-1">
                                            {msg.revisedParams.model && <Tag>模型：{msg.revisedParams.model}</Tag>}
                                            {msg.revisedParams.seconds && <Tag>时长：{msg.revisedParams.seconds}s</Tag>}
                                            {msg.revisedParams.size && <Tag>画幅：{msg.revisedParams.size}</Tag>}
                                            {msg.revisedParams.resolution && <Tag>清晰度：{msg.revisedParams.resolution}</Tag>}
                                        </div>
                                    )}

                                {msg.revisedPrompt && (() => {
                                    const canDiff = Boolean(msg.originalPrompt && msg.originalPrompt.trim() && msg.originalPrompt !== msg.revisedPrompt);
                                    const view = canDiff ? resultViews[msg.id] || "diff" : "full";
                                    return (
                                    <div className="wb-agent-result space-y-2 rounded-xl bg-secondary/60 p-2.5" data-applied={msg.applied || undefined}>
                                        <div className="flex items-center justify-between gap-2">
                                            {canDiff ? (
                                                <div role="tablist" aria-label="修改结果显示方式" className="wb-agent-seg flex rounded-lg bg-background/70 p-0.5 text-[11px]">
                                                    <button type="button" role="tab" aria-selected={view === "diff"} onClick={() => setResultViews(prev => ({ ...prev, [msg.id]: "diff" }))} className="rounded-md px-2 py-0.5">
                                                        修改对比
                                                    </button>
                                                    <button type="button" role="tab" aria-selected={view === "full"} onClick={() => setResultViews(prev => ({ ...prev, [msg.id]: "full" }))} className="rounded-md px-2 py-0.5">
                                                        修改后全文
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] font-semibold text-muted-foreground">修改后视频提示词</span>
                                            )}
                                            <Button
                                                size="small"
                                                type="text"
                                                icon={<Copy className="size-3" />}
                                                onClick={() => {
                                                    navigator.clipboard.writeText(msg.revisedPrompt || "");
                                                    message.success("已复制修改后提示词");
                                                }}
                                            >
                                                复制
                                            </Button>
                                        </div>
                                        {view === "diff" ? (
                                            <AgentPromptDiff before={msg.originalPrompt || ""} after={msg.revisedPrompt} />
                                        ) : (
                                            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5">
                                                {msg.revisedPrompt}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <Button
                                                size="small"
                                                type={msg.applied ? "default" : "primary"}
                                                icon={<Check className="size-3.5" />}
                                                onClick={() => {
                                                    if(msg.targetId!==target.id||msg.targetTitle!==target.title){message.warning("请先载入该回复对应的视频组，再应用修改");return;}
                                                    onApplyResult({
                                                        prompt: msg.revisedPrompt!,
                                                        params: msg.revisedParams,
                                                        autoStart: false,
                                                    });
                                                    updateMessages(prev =>
                                                        prev.map(m => (m.id === msg.id ? { ...m, applied: true } : m)),
                                                    );
                                                    message.success("已填入下方提示词框（支持 Ctrl+Z 撤回）");
                                                }}
                                            >
                                                {msg.applied ? "重新填入提示词框" : "填入提示词框"}
                                            </Button>
                                            <Button
                                                size="small"
                                                type="primary"
                                                icon={<Play className="size-3.5" />}
                                                onClick={() => {
                                                    if(msg.targetId!==target.id||msg.targetTitle!==target.title){message.warning("请先载入该回复对应的视频组，再应用修改");return;}
                                                    onApplyResult({
                                                        prompt: msg.revisedPrompt!,
                                                        params: msg.revisedParams,
                                                        autoStart: true,
                                                    });
                                                    updateMessages(prev =>
                                                        prev.map(m => (m.id === msg.id ? { ...m, applied: true } : m)),
                                                    );
                                                }}
                                            >
                                                填入并开始创作
                                            </Button>
                                            {msg.applied && (
                                                <span className="wb-agent-applied inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                    <Check className="size-3" />
                                                    已填入提示词框
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })()}
                            </div>
                        ),
                    )
                )}
            </div>

            {/* Bottom input area matching Runow */}
            <footer className="wb-agent-foot border-t border-border bg-background/90 p-3">
                {/* Target video indicator + quick chips */}
                <div className="wb-agent-target mb-2 flex items-center justify-between gap-2 rounded-lg bg-secondary/70 px-2.5 py-1.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                        <Video className="size-3.5 shrink-0 text-primary" />
                        <span className="truncate">当前目标：{target.title || "当前提示词框"}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        {target.prompt ? `${target.prompt.length} 字` : "空提示词"}
                        {onLocateTarget && target.id && (
                            <button
                                type="button"
                                aria-label="在视频台定位当前目标"
                                title="在右侧视频台中滚动到并高亮该视频"
                                onClick={onLocateTarget}
                                className="wb-agent-locate inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-foreground hover:bg-background hover:text-primary"
                            >
                                <Crosshair className="size-3" />
                                定位
                            </button>
                        )}
                    </span>
                </div>

                <div className="mb-2 flex items-center justify-between gap-1">
                    <div className="flex flex-1 flex-wrap gap-1 overflow-hidden">
                        {quickPrompts.map(item => (
                            <button
                                key={item.id || item.label}
                                type="button"
                                disabled={busy}
                                onClick={() => void sendInstruction(item.text)}
                                title={item.text}
                                className="wb-agent-chip rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <Tooltip title="自定义/编辑快捷指令">
                        <button
                            type="button"
                            aria-label="编辑快捷指令"
                            onClick={() => {
                                setEditingPrompts([...quickPrompts]);
                                setManagePromptsOpen(true);
                            }}
                            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <Pencil className="size-3" />
                        </button>
                    </Tooltip>
                </div>

                <div className="wb-agent-input rounded-2xl border border-border bg-card p-2.5 shadow-xs focus-within:border-primary">
                    <textarea
                        ref={inputRef}
                        aria-label="Agent 修改指令输入"
                        rows={3}
                        value={input}
                        disabled={busy}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void sendInstruction();
                            }
                        }}
                        placeholder="描述你想怎么改这条视频提示词（例如：把第2个镜头改成男性、去掉多余动作、改成4秒）…"
                        className="w-full resize-none bg-transparent text-xs leading-5 outline-none placeholder:text-muted-foreground"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                        <Checkbox
                            checked={autoApply}
                            onChange={e => setAutoApply(e.target.checked)}
                            className="!text-[11px]"
                        >
                            改完自动填入提示词框
                        </Checkbox>
                        {busy ? (
                            <Tooltip title="点击暂停 Agent 思考">
                                <button
                                    type="button"
                                    aria-label="暂停 Agent 思考"
                                    onClick={stopThinking}
                                    className="wb-agent-stop relative flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive text-white shadow-sm transition hover:bg-destructive/90"
                                >
                                    <LoaderCircle className="absolute size-4 animate-spin opacity-80" />
                                    <Square className="size-2 fill-current" />
                                </button>
                            </Tooltip>
                        ) : (
                            <Button
                                type="primary"
                                shape="circle"
                                size="small"
                                aria-label="发送给 Agent"
                                disabled={!input.trim()}
                                icon={<Send className="size-3.5" />}
                                onClick={() => void sendInstruction()}
                            />
                        )}
                    </div>
                </div>
            </footer>

            {/* Manage Quick Prompts Modal */}
            <Modal
                title="自定义 Agent 快捷指令"
                open={managePromptsOpen}
                onCancel={() => setManagePromptsOpen(false)}
                footer={
                    <div className="flex items-center justify-between">
                        <Button
                            size="small"
                            icon={<RotateCcw className="size-3.5" />}
                            onClick={() => setEditingPrompts([...DEFAULT_QUICK_PROMPTS])}
                        >
                            恢复默认
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button size="small" onClick={() => setManagePromptsOpen(false)}>
                                取消
                            </Button>
                            <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                    const cleaned = editingPrompts
                                        .filter(p => p.label.trim())
                                        .map(p => ({ ...p, label: p.label.trim(), text: p.text.trim() }));
                                    setQuickPrompts(cleaned);
                                    try {
                                        localStorage.setItem("xiaoxiao:agent-quick-prompts", JSON.stringify(cleaned));
                                    } catch {}
                                    setManagePromptsOpen(false);
                                    message.success("已保存快捷指令");
                                }}
                            >
                                保存
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="max-h-[60vh] space-y-3 overflow-y-auto p-1">
                    <p className="text-xs text-muted-foreground">
                        自定义输入框上方的快捷胶囊按钮。点击胶囊即可直接把指令发给 Agent。
                    </p>
                    {editingPrompts.map((item, index) => (
                        <div key={item.id} className="space-y-1.5 rounded-xl border border-border p-2.5 bg-secondary/30">
                            <div className="flex items-center justify-between gap-2">
                                <Input
                                    size="small"
                                    aria-label={`快捷指令名称 ${index + 1}`}
                                    value={item.label}
                                    placeholder="胶囊按钮名称（例如：修动作毛病）"
                                    className="font-medium"
                                    onChange={e => {
                                        const val = e.target.value;
                                        setEditingPrompts(prev => prev.map((p, i) => (i === index ? { ...p, label: val } : p)));
                                    }}
                                />
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<Trash2 className="size-3.5" />}
                                    aria-label={`删除快捷指令 ${index + 1}`}
                                    onClick={() => setEditingPrompts(prev => prev.filter((_, i) => i !== index))}
                                />
                            </div>
                            <Input.TextArea
                                rows={2}
                                size="small"
                                aria-label={`快捷指令内容 ${index + 1}`}
                                value={item.text}
                                placeholder="发给 Agent 的完整修改指令内容…"
                                onChange={e => {
                                    const val = e.target.value;
                                    setEditingPrompts(prev => prev.map((p, i) => (i === index ? { ...p, text: val } : p)));
                                }}
                            />
                        </div>
                    ))}
                    <Button
                        block
                        size="small"
                        icon={<Plus className="size-3.5" />}
                        onClick={() =>
                            setEditingPrompts(prev => [
                                ...prev,
                                { id: nanoid(), label: `快捷指令 ${prev.length + 1}`, text: "" },
                            ])
                        }
                    >
                        添加快捷指令
                    </Button>
                </div>
            </Modal>

            {/* Model & API Settings Modal */}
            <Modal
                title="Agent 模型与服务接口设置"
                open={modelModalOpen}
                onCancel={() => setModelModalOpen(false)}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button size="small" onClick={async()=>{try{const r=await fetch("/api/codex-agent/test",{method:"POST"});const d=await r.json();if(d.ok)message.success("授权和所选模型均有效（未调用生成）");else message.error(d.error);}catch{message.error("连接检查失败");}}}>测试已保存的连接</Button>
                        <Button size="small" onClick={() => setModelModalOpen(false)}>
                            取消
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            loading={savingSettings}
                            onClick={async () => {
                                setSavingSettings(true);
                                try {
                                const response=await fetch("/api/codex-agent/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tempSettings)});const saved=await response.json();if(!response.ok||!saved.ok){message.error(saved.error||"配置保存失败");return;}
                                const clean={...saved.settings,customApi:{...saved.settings.customApi,useSavedKey:true}};
                                setModelSettings(clean);
                                try {
                                    localStorage.setItem("xiaoxiao:agent-model-settings", JSON.stringify(clean));
                                } catch {}
                                setModelModalOpen(false);
                                message.success("已更新 Agent 模型配置");
                                } catch { message.error("配置保存失败，请重试"); } finally { setSavingSettings(false); }
                            }}
                        >
                            保存配置
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 p-1">
                    <Tabs
                        activeKey={tempSettings.provider}
                        onChange={key => setTempSettings(prev => ({ ...prev, provider: key as "codex" | "custom" }))}
                        items={[
                            {
                                key: "codex",
                                label: "本机 Codex 额度",
                                children: (
                                    <div className="space-y-3 text-xs">
                                        <div className="rounded-xl bg-secondary/50 p-2.5 leading-5 text-muted-foreground">
                                            使用本机已登录的 Codex 命令行与额度。无需配置第三方 API Key。
                                        </div>
                                        <div>
                                            <label className="mb-1 block font-medium">选择 Codex 模型：</label>
                                            <Select
                                                className="w-full"
                                                aria-label="选择 Codex 模型"
                                                value={tempSettings.codexModel || ""}
                                                onChange={val => setTempSettings(prev => ({ ...prev, codexModel: val }))}
                                                options={[
                                                    { value: "", label: "自动（跟随本机 Codex 默认配置）" },
                                                    ...(codexStatus?.models || [
                                                        { slug: "gpt-6.1-sol", name: "GPT-6.1-Sol" },
                                                        { slug: "gpt-6-astra", name: "GPT-6-Astra" },
                                                        { slug: "gpt-6.1-terra", name: "GPT-6.1 Terra" },
                                                        { slug: "gpt-6-sol", name: "GPT-6-Sol" },
                                                        { slug: "gpt-reserve", name: "GPT-Reserve" },
                                                        { slug: "gpt-6-luna", name: "GPT-6-Luna" },
                                                        { slug: "gpt-5.6-sol", name: "GPT-5.6-Sol" },
                                                    ]).map(m => ({ value: m.slug, label: m.name })),
                                                ]}
                                            />
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {codexStatus?.authenticated !== false
                                                ? "✅ 本机 Codex 授权已就绪"
                                                : "⚠️ 未检测到本机 Codex 授权文件，请先在终端运行 codex 完成登录"}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                key: "custom",
                                label: "自定义 API 接口",
                                children: (
                                    <div className="space-y-3 text-xs">
                                        <Button aria-label="使用 DeepSeek 预设" onClick={()=>setTempSettings(prev=>({...prev,provider:"custom",customApi:{...prev.customApi,baseUrl:"https://api.deepseek.com",apiKey:prev.customApi?.apiKey||"",model:"deepseek-flash"}}))}>DeepSeek 官方预设</Button>
                                        <div className="rounded-xl bg-secondary/50 p-2.5 leading-5 text-muted-foreground">
                                            使用兼容 OpenAI 格式的 API 接口（如 OneAPI、NewAPI、Ollama、vLLM 或第三方大模型中转）。
                                        </div>
                                        {configChannels.filter(c => c.protocol === "openai").length > 0 && (
                                            <div>
                                                <span className="mb-1 block text-[11px] text-muted-foreground">快速从工作台已配渠道复制：</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {configChannels
                                                        .filter(c => c.protocol === "openai")
                                                        .map(c => (
                                                            <Button
                                                                key={c.id}
                                                                size="small"
                                                                onClick={() => {
                                                                    setTempSettings(prev => ({
                                                                        ...prev,
                                                                        provider: "custom",
                                                                        customApi: {
                                                                            baseUrl: c.baseUrl || "",
                                                                            apiKey: c.apiKey || "",
                                                                            model: c.models?.[0] || "",
                                                                        },
                                                                    }));
                                                                    message.info(`已载入「${c.name}」渠道参数`);
                                                                }}
                                                            >
                                                                载入 {c.name}
                                                            </Button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="mb-1 block font-medium">Base URL：</label>
                                            <Input
                                                size="small"
                                                aria-label="自定义 API Base URL"
                                                placeholder="https://api.openai.com/v1 或 http://127.0.0.1:8317/v1"
                                                value={tempSettings.customApi?.baseUrl || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setTempSettings(prev => ({
                                                        ...prev,
                                                        customApi: {
                                                            ...prev.customApi,
                                                            baseUrl: val,
                                                            apiKey: prev.customApi?.apiKey || "",
                                                            model: prev.customApi?.model || "",
                                                        },
                                                    }));
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block font-medium">API Key：</label>
                                            <Input.Password
                                                size="small"
                                                aria-label="自定义 API Key"
                                                placeholder="sk-...（本地无鉴权服务可留空）"
                                                value={tempSettings.customApi?.apiKey || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setTempSettings(prev => ({
                                                        ...prev,
                                                        customApi: {
                                                            ...prev.customApi,
                                                            baseUrl: prev.customApi?.baseUrl || "",
                                                            apiKey: val,
                                                            model: prev.customApi?.model || "",
                                                        },
                                                    }));
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block font-medium">模型名称：</label>
                                            <Input
                                                size="small"
                                                aria-label="自定义 API 模型名称"
                                                placeholder="例如：gpt-4o、deepseek-chat、qwen-max"
                                                value={tempSettings.customApi?.model || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setTempSettings(prev => ({
                                                        ...prev,
                                                        customApi: {
                                                            ...prev.customApi,
                                                            baseUrl: prev.customApi?.baseUrl || "",
                                                            apiKey: prev.customApi?.apiKey || "",
                                                            model: val,
                                                        },
                                                    }));
                                                }}
                                            />
                                        </div>
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            </Modal>
            <div
                data-agent-resizer
                role="separator"
                aria-label="调整 Agent 侧栏宽度"
                aria-orientation="vertical"
                aria-valuemin={AGENT_PANEL_MIN}
                aria-valuemax={AGENT_PANEL_MAX}
                aria-valuenow={panelWidth}
                tabIndex={0}
                title="拖动调整 Agent 侧栏宽度；双击恢复标准宽度"
                onDoubleClick={() => setPanelWidth(380)}
                onKeyDown={event => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    setPanelWidth(panelWidth + (event.key === "ArrowRight" ? 20 : -20));
                }}
                onPointerDown={event => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    resizeRef.current = { x: event.clientX, width: panelWidth, frame: 0 };
                    setResizing(true);
                }}
                onPointerMove={event => {
                    const drag = resizeRef.current;
                    if (!drag) return;
                    drag.next = drag.width + event.clientX - drag.x;
                    cancelAnimationFrame(drag.frame);
                    drag.frame = requestAnimationFrame(() => {
                        if (drag.next !== undefined) setPanelWidth(drag.next);
                    });
                }}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                onLostPointerCapture={endResize}
            />
        </aside>
    );
}

function AgentPromptDiff({ before, after }: { before: string; after: string }) {
    const blocks = useMemo(() => diffPromptLines(before, after), [before, after]);
    if (!blocks) return <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5">{after}</p>;
    if (!blocks.length) return <p className="text-[11px] text-muted-foreground">与发送时的提示词相同，未做文字修改。</p>;
    const stats = diffStats(blocks);
    return (
        <div data-agent-diff className="wb-agent-diff overflow-hidden rounded-lg border border-border bg-background/80">
            <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
                <span className="wb-diff-stat" data-kind="add">+{stats.added} 行</span>
                <span className="wb-diff-stat" data-kind="del">−{stats.removed} 行</span>
                <span className="ml-auto">只显示修改处，未改动部分已折叠</span>
            </div>
            <div className="max-h-56 overflow-y-auto py-1 text-xs leading-5">
                {blocks.map((block, index) =>
                    block.kind === "skip" ? (
                        <div key={index} className="wb-diff-skip px-2 text-[10px] text-muted-foreground">… {block.count} 行未改动</div>
                    ) : (
                        <div key={index} className="wb-diff-line flex gap-1.5 px-2" data-kind={block.kind}>
                            <span aria-hidden className="wb-diff-sign w-3 shrink-0 select-none text-center">{block.kind === "add" ? "+" : block.kind === "del" ? "−" : ""}</span>
                            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                                {block.spans ? block.spans.map((span, i) => (span.changed ? <mark key={i}>{span.text}</mark> : <span key={i}>{span.text}</span>)) : block.text || " "}
                            </span>
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}
