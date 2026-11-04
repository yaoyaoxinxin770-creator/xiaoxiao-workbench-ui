"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, InputNumber, Popover, Slider } from "antd";
import { ChevronDown, Clock3, RectangleHorizontal, RotateCcw, X } from "lucide-react";
import {workbench} from "@/services/api/workbench";
import { describePippitModel, ratioForSize } from "@/services/api/pippit";

export type VideoSpec = {
    ratio?: { default?: string; options?: string[] };
    duration?: { default?: number; min?: number; max?: number; step?: number; options?: number[] };
    resolution?: { default?: string; options?: string[] };
};

const ratioNames: Record<string, string> = {
    adaptive: "智能比例",
    "16:9": "横屏",
    "21:9": "超宽屏",
    "9:16": "竖屏",
    "4:3": "横屏",
    "3:4": "竖屏",
    "1:1": "方形",
};

function ratioLabel(ratio: string) {
    return ratio === "adaptive" ? ratioNames.adaptive : `${ratio}（${ratioNames[ratio] || "自定义"}）`;
}

function validDuration(value: string, spec: VideoSpec) {
    const duration = spec.duration;
    const options = duration?.options?.filter(Number.isFinite);
    const fallback = duration?.default ?? options?.[0] ?? duration?.min ?? 10;
    const raw = Number(value);
    const requested = Number.isFinite(raw) && raw > 0 ? raw : fallback;
    if (options?.length) return options.includes(requested) ? requested : options.reduce((nearest, option) => Math.abs(option - requested) < Math.abs(nearest - requested) ? option : nearest);
    const min = duration?.min ?? 1;
    const max = duration?.max ?? 30;
    const step = duration?.step ?? 1;
    return Math.min(max, Math.max(min, min + Math.round((requested - min) / step) * step));
}

export function PippitVideoQuickControls({ model, size, seconds, vquality, resolutionOptions, resolutionAriaLabel, interpolationFps, onInterpolationChange, onChange, compact = false, provider = "pippit", dreaminaVersion = "canvas", dreaminaAccountProfile, providedSpec }: {
    providedSpec?:VideoSpec;
    provider?: "pippit" | "dreamina" | "other";
    dreaminaVersion?: "canvas"|"legacy";
    dreaminaAccountProfile?: string;
    compact?: boolean;
    model: string;
    size: string;
    seconds: string;
    vquality?: string;
    resolutionOptions?: string[];
    resolutionAriaLabel?: string;
    interpolationFps?: 0 | 30 | 60;
    onInterpolationChange?: (value: 0 | 30 | 60) => void;
    onChange: (key: any, value: string) => void;
}) {
    const [spec, setSpec] = useState<VideoSpec | null>(null);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [ratioOpen, setRatioOpen] = useState(false);
    const [durationOpen, setDurationOpen] = useState(false);
    const [unifiedOpen, setUnifiedOpen] = useState(false);

    const [activeSection, setActiveSection] = useState<string | null>(null);
    useEffect(()=>{if(!unifiedOpen)return;const t=requestAnimationFrame(()=>document.querySelector(`[data-generation-section="${activeSection||"ratio"}"]`)?.scrollIntoView({block:"nearest"}));return()=>cancelAnimationFrame(t);},[unifiedOpen,activeSection]);

    useEffect(() => {
        const close = () => { setUnifiedOpen(false); setActiveSection(null); };
        window.addEventListener("model-picker-open", close);
        return () => window.removeEventListener("model-picker-open", close);
    }, []);

    useEffect(() => {
        if(provider==="other"){setSpec(providedSpec||{ratio:{options:["16:9","9:16","1:1","4:3","3:4","21:9"]},duration:{min:1,max:30,step:1}});setError("");return;}
        let active = true;
        setSpec(null);
        setError("");
        void (provider === "dreamina" ? workbench().dreaminaDescribe(model,dreaminaVersion,dreaminaAccountProfile) : describePippitModel(model, "video"))
            .then((value: VideoSpec) => { if (active) setSpec(value); })
            .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "模型参数读取失败"); });
        return () => { active = false; };
    }, [model, revision, provider, dreaminaVersion, dreaminaAccountProfile,providedSpec]);

    let selectedRatio = "adaptive";
    try { selectedRatio = ratioForSize(size); } catch { /* The model spec below selects a supported ratio. */ }
    const ratios = spec?.ratio?.options || [];
    const duration = spec?.duration;
    const selectedSeconds = Number(seconds) || 10;
    const durationInvalid=Boolean(spec && validDuration(seconds,spec)!==selectedSeconds);

    useEffect(() => {
        if (!spec) return;
        if (ratios.length && !ratios.includes(selectedRatio)) onChange("size", spec.ratio?.default && ratios.includes(spec.ratio.default) ? spec.ratio.default : ratios[0]);
        if (vquality !== undefined && spec.resolution?.options?.length && !spec.resolution.options.includes(vquality)) {
            onChange("vquality", spec.resolution.default || spec.resolution.options[0]);
        }
    }, [spec, ratios, selectedRatio, selectedSeconds, seconds, duration, vquality, onChange]);

    const durationOptions = duration?.options?.filter(Number.isFinite) || [];
    const min = duration?.min ?? durationOptions[0] ?? 1;
    const max = duration?.max ?? durationOptions[durationOptions.length - 1] ?? 30;
    const durationIndex = durationOptions.indexOf(selectedSeconds);
    const chooseDuration = (value: number | null) => {
        if (value === null || !spec) return;
        onChange("videoSeconds", String(validDuration(String(value), spec)));
    };
    const unavailable = !spec;
    const retry = <div className="w-64 text-sm"><p>{error || `正在读取${provider === "dreamina" ? "即梦" : "小云雀"}模型参数…`}</p>{error ? <button type="button" className="mt-2 text-pink-500" onClick={() => setRevision(value => value + 1)}>重新读取</button> : null}</div>;
    const resList = resolutionOptions || spec?.resolution?.options || [];
    const resAria = resolutionAriaLabel || (provider === "pippit" ? "小云雀清晰度" : provider === "dreamina" ? "即梦清晰度" : "清晰度");
    const toggleSection = (sec: string) => {
        if (!unifiedOpen) { setUnifiedOpen(true); setActiveSection(sec); }
        else if (activeSection === sec) { setUnifiedOpen(false); setActiveSection(null); }
        else { setActiveSection(sec); }
    };

    if (compact) {
        return (
            <Popover
                trigger="click"
                open={unifiedOpen}
                onOpenChange={next => { setUnifiedOpen(next); if (!next) setActiveSection(null); }}
                placement="topLeft"
                content={!unifiedOpen ? null : unavailable ? retry : (
                    <div data-generation-params-popover className="max-h-[min(70vh,620px)] w-[min(430px,calc(100vw-48px))] space-y-5 overflow-y-auto p-2">
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card pb-3"><strong>生成参数</strong><div className="flex gap-2"><Button size="small" type="text" icon={<RotateCcw size={14}/>} onClick={()=>{if(spec?.ratio?.default)onChange("size",spec.ratio.default);if(spec)chooseDuration(spec.duration?.default||min);if(vquality!==undefined&&spec?.resolution?.default)onChange("vquality",spec.resolution.default);}}>恢复默认</Button><Button size="small" type="text" aria-label="关闭生成参数" icon={<X size={16}/>} onClick={()=>setUnifiedOpen(false)}/></div></div>
                        <div data-generation-section="ratio">
                            <div className="mb-1.5 text-xs text-muted-foreground">画幅比例</div>
                            <div className="grid grid-cols-4 gap-2" role="listbox" aria-label="画幅比例">
                                {ratios.map(ratio => (
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={selectedRatio === ratio}
                                        key={ratio}
                                        className={`flex flex-col items-center justify-center min-h-16 gap-1.5 rounded-xl border px-2 py-2 text-sm transition ${selectedRatio === ratio ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-secondary/40 text-foreground hover:border-primary/40"}`}
                                        onClick={() => onChange("size", ratio)}
                                    >
                                        <span aria-hidden className="block max-w-8 border-2 border-current opacity-70" style={{width:24,height:ratio==="adaptive"?18:Math.min(32,24/(Number(ratio.split(":")[0])/Number(ratio.split(":")[1])))}}/><span>{ratio === "adaptive" ? "智能比例" : ratio}</span>
                                        <span className="sr-only">{ratioLabel(ratio)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {vquality !== undefined && (
                            <div data-generation-section="resolution">
                                <div className="mb-1.5 text-xs text-muted-foreground">清晰度</div>
                                {resList.length > 0 ? (
                                    <div role="listbox" aria-label={resAria} className="grid grid-cols-3 gap-1.5">
                                        {resList.map(val => (
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected={val.toLowerCase() === vquality.toLowerCase()}
                                                key={val}
                                                className={`flex items-center justify-center min-h-11 rounded-xl border px-2.5 py-2 text-sm font-medium transition ${val.toLowerCase() === vquality.toLowerCase() ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-foreground hover:border-primary/40"}`}
                                                onClick={() => onChange("vquality", val)}
                                            >
                                                {provider === "pippit" && /_draft$/i.test(model) && val.toLowerCase() === "480p" ? "480P 样片" : val.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground">{error || "该模型未提供可选清晰度"}</div>
                                )}
                            </div>
                        )}
                        <div data-generation-section="duration">
                            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                                <span>视频时长</span>
                                <span>{min}–{max} 秒</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Slider
                                    tooltip={{ formatter: value => value === undefined ? "" : String(durationOptions.length ? durationOptions[value] : value) + " 秒" }}
                                    className="min-w-0 flex-1"
                                    aria-label="视频时长滑块"
                                    min={durationOptions.length ? 0 : min}
                                    max={durationOptions.length ? durationOptions.length - 1 : max}
                                    step={durationOptions.length ? 1 : duration?.step || 1}
                                    value={durationOptions.length ? Math.max(0, durationIndex) : selectedSeconds}
                                    onChange={value => chooseDuration(durationOptions.length ? durationOptions[value] : value)}
                                />
                                <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 px-2">
                                    <InputNumber
                                        aria-label="视频时长秒数"
                                        className="w-12"
                                        variant="borderless"
                                        min={min}
                                        max={max}
                                        step={duration?.step || 1}
                                        precision={0}
                                        value={selectedSeconds}
                                        onChange={chooseDuration}
                                    />
                                    <span className="text-xs text-muted-foreground">秒</span>
                                </div>
                            </div>
                        </div>
                        {interpolationFps !== undefined && onInterpolationChange && (
                            <div data-generation-section="interpolation">
                                <div className="mb-1.5 text-xs text-muted-foreground">补帧帧率</div>
                                <div role="listbox" aria-label="即梦补帧选项" className="grid grid-cols-3 gap-1.5">
                                    {([{ value: 0 as const, label: "不补帧" }, { value: 30 as const, label: "30 FPS" }, { value: 60 as const, label: "60 FPS" }]).map(opt => (
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={interpolationFps === opt.value}
                                            key={opt.value}
                                            className={`flex items-center justify-center min-h-11 rounded-xl border px-2.5 py-2 text-sm font-medium transition ${interpolationFps === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-foreground hover:border-primary/40"}`}
                                            onClick={() => onInterpolationChange(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            >
                <div data-unified-generation-params className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-input bg-accent/40 px-2.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-accent/70">
                    <button type="button" aria-label="视频时长" title={durationInvalid ? "当前模型不支持该时长，请选择其他时长或模型" : "生成参数 · 视频时长"} onClick={e => { e.stopPropagation(); toggleSection("duration"); }} className="inline-flex items-center gap-1 hover:text-primary">
                        <Clock3 className="size-3.5 opacity-70" />
                        <span>{selectedSeconds}s{durationInvalid ? " !" : ""}</span>
                    </button>
                    <span className="text-muted-foreground/40">·</span>
                    <button type="button" aria-label="画幅比例" title="生成参数 · 画幅比例" onClick={e => { e.stopPropagation(); toggleSection("ratio"); }} className="inline-flex items-center gap-1 hover:text-primary">
                        <span>{selectedRatio !== "adaptive" ? selectedRatio : ratioLabel(selectedRatio)}</span>
                    </button>
                    {vquality !== undefined && (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            <button type="button" aria-label={resAria} title="生成参数 · 清晰度" onClick={e => { e.stopPropagation(); toggleSection("resolution"); }} className="inline-flex items-center gap-1 hover:text-primary">
                                <span>{provider === "pippit" && /_draft$/i.test(model) ? "480P 样片" : vquality.toUpperCase()}</span>
                            </button>
                        </>
                    )}
                    {interpolationFps !== undefined && (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            <button type="button" aria-label="即梦补帧" title="补帧帧率" onClick={e => { e.stopPropagation(); toggleSection("interpolation"); }} className="inline-flex items-center gap-1 hover:text-primary">
                                <span>{interpolationFps === 0 ? "不补帧" : `${interpolationFps} FPS`}</span>
                            </button>
                        </>
                    )}
                    <ChevronDown className="ml-0.5 size-3.5 opacity-60" />
                </div>
            </Popover>
        );
    }

    return <>
        <span className="grid min-w-0 gap-1 text-xs text-stone-500 dark:text-stone-400">
            {!compact && "视频时长"}
            <Popover trigger="click" open={durationOpen} onOpenChange={setDurationOpen} content={unavailable ? retry : <div className="w-72 px-2 py-1">
                <div className="mb-3 text-sm text-stone-500 dark:text-stone-400">视频时长</div>
                <div className="flex items-center gap-4">
                    <Slider tooltip={{formatter:value=>value===undefined?"":String(durationOptions.length?durationOptions[value]:value)+" 秒"}} className="min-w-0 flex-1" aria-label="视频时长滑块" min={durationOptions.length ? 0 : min} max={durationOptions.length ? durationOptions.length - 1 : max} step={durationOptions.length ? 1 : duration?.step || 1} value={durationOptions.length ? Math.max(0, durationIndex) : selectedSeconds} onChange={value => chooseDuration(durationOptions.length ? durationOptions[value] : value)} />
                    <div className="flex items-center gap-1 rounded-xl bg-stone-100 px-2 dark:bg-stone-800"><InputNumber aria-label="视频时长秒数" className="w-14" variant="borderless" min={min} max={max} step={duration?.step || 1} precision={0} value={selectedSeconds} onChange={chooseDuration} /><span>秒</span></div>
                </div>
                <div className="mt-1 text-xs opacity-50">{min}–{max} 秒</div>
            </div>}>
                <button type="button" aria-label="视频时长" title={durationInvalid?"当前模型不支持该时长，请选择其他时长或模型":undefined} className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 text-sm text-foreground ${compact ? "h-9 bg-accent/50" : "h-11 border border-border bg-background"}`}>
                    <span className="flex items-center gap-2"><Clock3 className="size-4" />{selectedSeconds}s{durationInvalid?" !":""}</span><ChevronDown className="size-4" />
                </button>
            </Popover>
        </span>
        <span className="grid min-w-0 gap-1 text-xs text-stone-500 dark:text-stone-400">
            {!compact && "画幅比例"}
            <Popover trigger="click" open={ratioOpen} onOpenChange={setRatioOpen} content={unavailable ? retry : <div className="grid min-w-48 gap-1" role="listbox" aria-label="画幅比例">
                <div className="px-2 pb-1 text-xs opacity-60">画幅比例</div>
                {ratios.map(ratio => <button type="button" role="option" aria-selected={selectedRatio === ratio} key={ratio} className={`rounded-lg px-3 py-2 text-left text-sm hover:bg-pink-50 dark:hover:bg-pink-500/10 ${selectedRatio === ratio ? "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-300" : ""}`} onClick={() => { onChange("size", ratio); setRatioOpen(false); }}>{ratioLabel(ratio)}</button>)}
            </div>}>
                <button type="button" aria-label="画幅比例" className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 text-sm text-foreground ${compact ? "h-9 bg-accent/50" : "h-11 border border-border bg-background"}`}>
                    <span className="flex min-w-0 items-center gap-2 truncate"><RectangleHorizontal className="size-4 shrink-0" />{compact&&selectedRatio!=="adaptive"?selectedRatio:ratioLabel(selectedRatio)}</span><ChevronDown className="size-4 shrink-0" />
                </button>
            </Popover>
        </span>
    </>;
}
