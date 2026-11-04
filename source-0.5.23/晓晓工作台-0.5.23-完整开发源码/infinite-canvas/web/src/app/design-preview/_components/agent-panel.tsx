"use client";
// Agent 侧栏预览，对应生产 codex-agent-panel.tsx：标题区（模型徽标/清空/加宽/收起）、对话、快捷指令胶囊、回填开关、输入框与可点击暂停的旋转按钮。
import { useEffect, useRef, useState } from "react";
import { App, Switch, Tooltip } from "antd";
import { ArrowUp, Bot, Maximize2, Minimize2, PanelLeftClose, Pencil, Settings, Square, Trash2 } from "lucide-react";
import { agentQuickCommands, mockAgentMessages, type MockAgentMessage } from "../_mock/mock-data";

export function AgentPanel({ onClose, target }: { onClose: () => void; target?: string }) {
    const { message } = App.useApp();
    const [wide, setWide] = useState(false);
    const [messages, setMessages] = useState<MockAgentMessage[]>(mockAgentMessages);
    const [input, setInput] = useState("");
    const [thinking, setThinking] = useState(false);
    const [autoFill, setAutoFill] = useState(true);
    const timer = useRef<number | null>(null);
    const scroll = useRef<HTMLDivElement>(null);
    useEffect(() => {
        scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
    }, [messages, thinking]);
    useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
    const send = (text: string) => {
        if (!text.trim() || thinking) return;
        setMessages((m) => [...m, { id: "u" + Date.now(), role: "user", text }]);
        setInput("");
        setThinking(true);
        timer.current = window.setTimeout(() => {
            setThinking(false);
            setMessages((m) => [
                ...m,
                {
                    id: "a" + Date.now(),
                    role: "assistant",
                    text: "（预览模拟回复）已按你的要求改写，保留原台词与参考素材：",
                    patch: { before: "镜头3（9-15s）：特写", after: "镜头3（11-15s）：特写，4 秒内完成情绪转折" },
                },
            ]);
        }, 2200);
    };
    const stop = () => {
        if (timer.current) window.clearTimeout(timer.current);
        setThinking(false);
        setMessages((m) => [...m, { id: "s" + Date.now(), role: "status", text: "已暂停思考", paused: true }]);
    };
    return (
        <aside className="dp-agent" aria-label="Agent 创作助手侧栏" style={{ width: wide ? 500 : 372 }}>
            <header className="dp-agent-head">
                <span className="dp-agent-logo">
                    <Bot size={16} />
                </span>
                <div className="dp-agent-title">
                    <strong>Agent 创作助手</strong>
                    <p>
                        <button type="button" className="dp-agent-model" aria-label="配置 Agent 模型" onClick={() => message.info("预览：打开模型配置（Codex 本地模型 / 自定义 OpenAI 兼容接口 / DeepSeek 预设）")}>
                            Codex · GPT-5.2
                            <Settings size={10} />
                        </button>
                        <span className="dp-agent-ready" title="本机 Codex 额度已就绪">
                            <i />
                            已就绪
                        </span>
                    </p>
                </div>
                <div className="dp-agent-tools">
                    <Tooltip title="清空当前项目对话">
                        <button type="button" className="dp-tool-btn" aria-label="清空 Agent 对话" onClick={() => setMessages([])}>
                            <Trash2 size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip title={wide ? "恢复标准侧栏宽度" : "加宽侧栏，方便查看对话"}>
                        <button type="button" className="dp-tool-btn" aria-label={wide ? "恢复标准侧栏宽度" : "加宽侧栏"} onClick={() => setWide((v) => !v)}>
                            {wide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    </Tooltip>
                    <Tooltip title="收起 Agent 侧边栏">
                        <button type="button" className="dp-tool-btn" aria-label="收起 Agent 侧边栏" onClick={onClose}>
                            <PanelLeftClose size={15} />
                        </button>
                    </Tooltip>
                </div>
            </header>
            {target && (
                <div className="dp-agent-target">
                    <span>当前对象</span>
                    <strong>{target}</strong>
                </div>
            )}
            <div className="dp-agent-body" ref={scroll}>
                {messages.length === 0 && (
                    <div className="dp-agent-empty">
                        <strong>怎么用 Agent 改有毛病的视频？</strong>
                        <p>在视频卡片上点「发给 Agent」，或右键选择「发给 Agent 修改…」，提示词和上下文会自动带进来。</p>
                    </div>
                )}
                {messages.map((m) =>
                    m.role === "status" ? (
                        <div key={m.id} className="dp-agent-status" data-paused={m.paused}>
                            <Square size={10} />
                            {m.text}
                        </div>
                    ) : (
                        <div key={m.id} className="dp-msg" data-role={m.role}>
                            <p>{m.text}</p>
                            {m.patch && (
                                <div className="dp-patch">
                                    <div className="dp-patch-del">− {m.patch.before}</div>
                                    <div className="dp-patch-add">+ {m.patch.after}</div>
                                    <div className="dp-patch-actions">
                                        <button type="button" className="dp-small-btn dp-small-btn-primary" onClick={() => message.success("预览：已回填到提示词（不会自动生成）")}>
                                            应用到提示词
                                        </button>
                                        <button type="button" className="dp-small-btn">
                                            复制
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ),
                )}
                {thinking && (
                    <div className="dp-msg dp-msg-thinking" data-role="assistant">
                        <span className="dp-dots">
                            <i />
                            <i />
                            <i />
                        </span>
                        正在思考，读取 V07 提示词与 8 个参考素材…
                    </div>
                )}
            </div>
            <footer className="dp-agent-foot">
                <div className="dp-quick" aria-label="快捷指令">
                    {agentQuickCommands.map((c) => (
                        <button key={c} type="button" onClick={() => send(c)}>
                            {c}
                        </button>
                    ))}
                    <Tooltip title="编辑快捷指令">
                        <button type="button" className="dp-quick-edit" aria-label="编辑快捷指令">
                            <Pencil size={11} />
                        </button>
                    </Tooltip>
                </div>
                <div className="dp-agent-input">
                    <textarea
                        aria-label="给 Agent 的指令"
                        placeholder="描述要怎么改提示词，Enter 发送，Shift+Enter 换行"
                        value={input}
                        rows={2}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                send(input);
                            }
                        }}
                    />
                    <div className="dp-agent-input-bar">
                        <label className="dp-autofill">
                            <Switch size="small" checked={autoFill} onChange={setAutoFill} aria-label="自动回填提示词" />
                            自动回填
                        </label>
                        <span className="dp-agent-note">只改提示词，不会自动扣费生成</span>
                        {thinking ? (
                            <Tooltip title="暂停思考（安全中止后台请求）">
                                <button type="button" className="dp-agent-send dp-agent-stop" aria-label="暂停思考" onClick={stop}>
                                    <span className="dp-ring" />
                                    <Square size={10} />
                                </button>
                            </Tooltip>
                        ) : (
                            <button type="button" className="dp-agent-send" aria-label="发送给 Agent" disabled={!input.trim()} onClick={() => send(input)}>
                                <ArrowUp size={15} />
                            </button>
                        )}
                    </div>
                </div>
            </footer>
        </aside>
    );
}
