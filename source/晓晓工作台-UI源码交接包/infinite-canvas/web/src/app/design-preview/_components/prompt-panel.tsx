"use client";
// 浮动提示词面板预览，对应生产 video/page.tsx 中 layout==="bottom" 的 结构：
// 参考素材条 → 高亮提示词编辑区（右上角缩放手柄）→ 底部工具栏（@ / 模型 / 生成参数胶囊 / 视频组切换 / 垃圾桶 / 收起 / 重新匹配 / 圆形开始创作）。
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Popover, Select, Slider, Tooltip } from "antd";
import { ArrowUp, AtSign, ChevronDown, ChevronLeft, ChevronRight, Grip, Music2, Plus, RotateCcw, Trash2, Video, X } from "lucide-react";
import { longPrompt, mockGroups, mockReferences, type MockReference } from "../_mock/mock-data";
import { AudioWave, PortraitArt, SceneArt } from "../_mock/mock-art";

const REF_NAMES = mockReferences.map((r) => r.name).sort((a, b) => b.length - a.length);
const TOKEN = new RegExp(
    [
        "(?<title>^【[^】\\n]*】)",
        "(?<shot>镜头\\d+（[^）\\n]*）：)",
        "(?<field>(?:台词|画面风格|负面要求|背景音|运镜|场景|人物)：)",
        "(?<quote>“[^”\\n]*”)",
        `(?<ref>@(?:${REF_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|[^\\s，。；：、“”]+))`,
    ].join("|"),
    "gm",
);

export function highlightPrompt(text: string): ReactNode[] {
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN)) {
        const i = m.index ?? 0;
        if (i > last) out.push(text.slice(last, i));
        const g = m.groups || {};
        const kind = Object.keys(g).find((k) => g[k] !== undefined) || "plain";
        const missing = kind === "ref" && !mockReferences.some((r) => "@" + r.name === m[0] && !r.missing);
        out.push(
            <span key={i} className={"dp-hl-" + kind} data-missing={missing || undefined}>
                {m[0]}
            </span>,
        );
        last = i + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    out.push("\n");
    return out;
}

function HighlightEditor({ value, onChange, height }: { value: string; onChange: (v: string) => void; height: number }) {
    const pre = useRef<HTMLPreElement>(null);
    const nodes = useMemo(() => highlightPrompt(value), [value]);
    return (
        <div className="dp-editor" style={{ height }}>
            <pre ref={pre} aria-hidden className="dp-editor-layer">
                {nodes}
            </pre>
            <textarea
                aria-label="视频提示词"
                className="dp-editor-input"
                spellCheck={false}
                value={value}
                placeholder="请描述你想制作的视频，可结合上方图片和音频作为参考"
                onChange={(e) => onChange(e.target.value)}
                onScroll={(e) => {
                    if (pre.current) pre.current.scrollTop = e.currentTarget.scrollTop;
                }}
            />
        </div>
    );
}

function RefCard({ item, index, onRemove }: { item: MockReference; index: number; onRemove: () => void }) {
    const { message } = App.useApp();
    if (item.missing)
        return (
            <div className="dp-ref dp-ref-missing" title={"提示词引用了「" + item.name + "」，尚未绑定素材"}>
                <div className="dp-ref-thumb">
                    <Plus size={15} />
                    <span className="dp-ref-missing-label">待补</span>
                    <div className="dp-ref-actions">
                        <button type="button" onClick={() => message.info("预览：打开 @ 素材库绑定")}>
                            绑定
                        </button>
                    </div>
                </div>
                <span className="dp-ref-name">{item.name}</span>
            </div>
        );
    return (
        <div className="dp-ref" data-kind={item.kind}>
            <div className="dp-ref-thumb">
                {item.kind === "image" && (item.portrait !== undefined ? <PortraitArt index={item.portrait} square /> : <SceneArt scene={item.scene || "harbor"} seed={item.seed} />)}
                {item.kind === "audio" && (
                    <span className="dp-ref-audio">
                        <Music2 size={13} />
                        <AudioWave seed={index + 2} bars={12} className="dp-ref-wave" />
                    </span>
                )}
                {item.kind === "video" && (
                    <>
                        <SceneArt scene={item.scene || "station"} seed={item.seed} />
                        <span className="dp-ref-video-badge">
                            <Video size={10} />
                        </span>
                    </>
                )}
                <span className="dp-ref-number">{index + 1}</span>
                {item.seconds && <span className="dp-ref-sec">{item.seconds}s</span>}
                <button type="button" className="dp-ref-remove" aria-label={"移除 " + item.name} onClick={onRemove}>
                    <X size={11} />
                </button>
                <div className="dp-ref-actions">
                    <button type="button" onClick={() => message.info("预览：绑定 " + item.name)}>
                        绑定
                    </button>
                    <button type="button" onClick={() => message.info("预览：在提示词中定位 " + item.name)}>
                        定位
                    </button>
                </div>
            </div>
            <span className="dp-ref-name" title={item.name}>
                {item.name}
            </span>
        </div>
    );
}

const RATIOS = [
    { v: "21:9", w: 42, h: 18, label: "超宽" },
    { v: "16:9", w: 38, h: 21, label: "横屏" },
    { v: "4:3", w: 32, h: 24, label: "横屏" },
    { v: "1:1", w: 26, h: 26, label: "方形" },
    { v: "3:4", w: 24, h: 32, label: "竖屏" },
    { v: "9:16", w: 21, h: 38, label: "竖屏" },
];

export interface GenParams {
    seconds: number;
    ratio: string;
    resolution: string;
    fps: "不补帧" | "30 FPS" | "60 FPS";
}
export const DEFAULT_PARAMS: GenParams = { seconds: 15, ratio: "16:9", resolution: "720P", fps: "30 FPS" };

export function ParamsCapsule({ value, onChange, defaultOpen = false }: { value: GenParams; onChange: (v: GenParams) => void; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const [focus, setFocus] = useState<string>("seconds");
    const body = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => body.current?.querySelector<HTMLElement>(`[data-param-section="${focus}"]`)?.scrollIntoView({ block: "nearest" }), 30);
        return () => window.clearTimeout(t);
    }, [open, focus]);
    const part = (key: string, label: string) => (
        <span
            role="button"
            tabIndex={-1}
            className="dp-capsule-part"
            data-active={open && focus === key}
            onClick={(e) => {
                // 点击胶囊中的具体参数：直接打开并定位到对应设置区，不让外层触发器把面板切换关闭。
                e.stopPropagation();
                setFocus(key);
                setOpen(true);
            }}
        >
            {label}
        </span>
    );
    const content = (
        <div className="dp-params" ref={body} role="dialog" aria-label="生成参数">
            <section data-param-section="seconds" data-focus={focus === "seconds"}>
                <header>
                    <strong>时长</strong>
                    <span className="dp-params-value">{value.seconds}s</span>
                </header>
                <Slider min={4} max={15} value={value.seconds} onChange={(s) => onChange({ ...value, seconds: s })} marks={{ 4: "4s", 8: "8s", 12: "12s", 15: "15s" }} />
            </section>
            <section data-param-section="ratio" data-focus={focus === "ratio"}>
                <header>
                    <strong>画幅比例</strong>
                </header>
                <div className="dp-ratio-grid">
                    {RATIOS.map((r) => (
                        <button key={r.v} type="button" aria-pressed={value.ratio === r.v} onClick={() => onChange({ ...value, ratio: r.v })}>
                            <i style={{ width: r.w * 0.7, height: r.h * 0.7 }} />
                            <b>{r.v}</b>
                            <small>{r.label}</small>
                        </button>
                    ))}
                </div>
            </section>
            <section data-param-section="resolution" data-focus={focus === "resolution"}>
                <header>
                    <strong>清晰度</strong>
                </header>
                <div className="dp-seg">
                    {["480P", "720P", "1080P"].map((r) => (
                        <button key={r} type="button" aria-pressed={value.resolution === r} onClick={() => onChange({ ...value, resolution: r })}>
                            {r}
                        </button>
                    ))}
                </div>
            </section>
            <section data-param-section="fps" data-focus={focus === "fps"}>
                <header>
                    <strong>补帧</strong>
                    <span className="dp-params-hint">即梦官方后台补帧</span>
                </header>
                <div className="dp-seg">
                    {(["不补帧", "30 FPS", "60 FPS"] as const).map((r) => (
                        <button key={r} type="button" aria-pressed={value.fps === r} onClick={() => onChange({ ...value, fps: r })}>
                            {r}
                        </button>
                    ))}
                </div>
            </section>
            <footer>
                <button type="button" className="dp-link-btn" onClick={() => onChange(DEFAULT_PARAMS)}>
                    恢复该模型默认参数
                </button>
                <button type="button" className="dp-small-btn" onClick={() => setOpen(false)}>
                    完成
                </button>
            </footer>
        </div>
    );
    return (
        <Popover trigger="click" placement="topLeft" open={open} onOpenChange={setOpen} content={content} arrow={false} classNames={{ root: "dp-params-popover" }}>
            <button type="button" className="dp-capsule" aria-label="生成参数" aria-expanded={open}>
                {part("seconds", value.seconds + "s")}
                <i>·</i>
                {part("ratio", value.ratio)}
                <i>·</i>
                {part("resolution", value.resolution)}
                <i>·</i>
                {part("fps", value.fps)}
                <ChevronDown size={13} />
            </button>
        </Popover>
    );
}

export function PromptPanel({ onCollapse, width, paramsOpen = false }: { onCollapse: () => void; width: number; paramsOpen?: boolean }) {
    const { message } = App.useApp();
    const [prompt, setPrompt] = useState(longPrompt);
    const [refs, setRefs] = useState(mockReferences);
    const [params, setParams] = useState<GenParams>(DEFAULT_PARAMS);
    const [model, setModel] = useState("seedance_2.5_draft");
    const [group, setGroup] = useState(6);
    const [height, setHeight] = useState(116);
    const [panelWidth, setPanelWidth] = useState(width);
    const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
    useEffect(() => setPanelWidth(width), [width]);
    const g = mockGroups[group];
    return (
        <div className="dp-composer" style={{ width: panelWidth }}>
            <div className="dp-ref-strip" aria-label="参考素材">
                {refs.map((r, i) => (
                    <RefCard key={r.id} item={r} index={i} onRemove={() => setRefs((list) => list.filter((x) => x.id !== r.id))} />
                ))}
            </div>
            <div className="dp-editor-wrap">
                <HighlightEditor value={prompt} onChange={setPrompt} height={height} />
                <button
                    type="button"
                    className="dp-grip"
                    aria-label="拖动调整提示词区宽度和高度"
                    title="向右拖动加宽，向上拖动加高，向下拖动缩小；双击恢复默认大小"
                    onDoubleClick={() => {
                        setPanelWidth(width);
                        setHeight(116);
                    }}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = { x: e.clientX, y: e.clientY, w: panelWidth, h: height };
                    }}
                    onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d) return;
                        setPanelWidth(Math.max(560, Math.min(window.innerWidth - 120, d.w + (e.clientX - d.x) * 2)));
                        setHeight(Math.max(80, Math.min(window.innerHeight - 360, d.h + d.y - e.clientY)));
                    }}
                    onPointerUp={() => (drag.current = null)}
                >
                    <Grip size={14} />
                </button>
            </div>
            <div className="dp-gen-toolbar">
                <div className="dp-gen-left">
                    <Tooltip title="@ 引用素材">
                        <button type="button" className="dp-tool-btn" aria-label="@ 引用素材">
                            <AtSign size={15} />
                        </button>
                    </Tooltip>
                    <Select
                        aria-label="视频模型"
                        className="dp-model-select"
                        variant="borderless"
                        popupMatchSelectWidth={false}
                        value={model}
                        onChange={setModel}
                        options={[
                            {
                                label: "即梦 CLI",
                                options: [
                                    { value: "seedance_2.5_draft", label: "seedance 2.5 draft" },
                                    { value: "seedance_2.5", label: "seedance 2.5" },
                                    { value: "seedance_2.0", label: "seedance 2.0" },
                                    { value: "seedance_2.0_fast", label: "seedance 2.0 fast" },
                                ],
                            },
                            { label: "Oii", options: [{ value: "oii", label: "oii-motion-1（固定参考 · 2秒打折）" }] },
                        ]}
                    />
                    <ParamsCapsule value={params} onChange={setParams} defaultOpen={paramsOpen} />
                    <nav className="dp-group-nav" aria-label="切换视频组">
                        <button type="button" aria-label="载入上一组" disabled={group <= 0} onClick={() => setGroup((v) => v - 1)}>
                            <ChevronLeft size={14} />
                        </button>
                        <Select
                            aria-label="当前视频组"
                            size="small"
                            variant="borderless"
                            popupMatchSelectWidth={false}
                            styles={{ popup: { root: { minWidth: 240 } } }}
                            value={g.id}
                            labelRender={() => <span className="dp-group-label">{g.id}</span>}
                            onChange={(id) => setGroup(mockGroups.findIndex((x) => x.id === id))}
                            options={mockGroups.map((x, i) => ({ value: x.id, label: `${x.id} · ${x.title}（${i + 1}/${mockGroups.length}）` }))}
                        />
                        <button type="button" aria-label="载入下一组" disabled={group >= mockGroups.length - 1} onClick={() => setGroup((v) => v + 1)}>
                            <ChevronRight size={14} />
                        </button>
                    </nav>
                </div>
                <div className="dp-gen-right">
                    <Tooltip title="清空输入">
                        <button type="button" className="dp-tool-btn" aria-label="清空提示词和参考素材" onClick={() => message.info("预览：清空前可 Ctrl+Z 撤销")}>
                            <Trash2 size={15} />
                        </button>
                    </Tooltip>
                    <Tooltip title="隐藏提示词区域">
                        <button type="button" className="dp-tool-btn" aria-label="收起提示词区域" onClick={onCollapse}>
                            <ChevronDown size={16} />
                        </button>
                    </Tooltip>
                    <Tooltip title="重新匹配（只重新识别当前提示词，不改变开关；已手动删除的素材仍保持排除）">
                        <button type="button" className="dp-tool-btn" aria-label="重新匹配" onClick={() => message.success("预览：已模拟重新匹配一次（不改变自动匹配开关）")}>
                            <RotateCcw size={14} />
                        </button>
                    </Tooltip>
                    <Tooltip title={model.endsWith("_draft") ? "开始创作 · 样片" : "开始创作"}>
                        <button type="button" className="dp-generate" aria-label={model.endsWith("_draft") ? "开始创作 · 样片" : "开始创作"} onClick={() => message.warning("预览模式：不会提交真实生成，也不会扣费")}>
                            <ArrowUp size={17} />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

export function MiniDock({ onExpand }: { onExpand: () => void }) {
    return (
        <footer className="dp-mini-dock">
            <button type="button" aria-label="展开提示词区域" title="点击展开提示词台" onClick={onExpand}>
                <span className="dp-mini-chip">
                    <b>图</b>林雾 居家睡衣
                </span>
                <span className="dp-mini-chip">
                    <b>音</b>雨声环境音
                </span>
                <span className="dp-mini-text">【视频编号V07｜第7组·雨夜渡口重逢】镜头1（0-4s）：远景，雨夜渡口，霓虹在积水里碎成光斑…</span>
            </button>
        </footer>
    );
}
