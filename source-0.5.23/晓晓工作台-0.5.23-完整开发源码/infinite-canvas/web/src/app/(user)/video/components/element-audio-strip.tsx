"use client";
import {writeElementDrag} from "../element-drag";
import type {ReactNode} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Pause, Pencil, Play, Star } from "lucide-react";
import type { Asset } from "@/stores/use-asset-store";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";
import { notifyLocalAssetLoadError } from "@/services/api/local-assets";
import { LocalAssetMenu } from "./local-asset-menu";

export function buildWaveformHeights(seedText: string, count = 24): number[] {
    let hash = 2166136261;
    for (let i = 0; i < seedText.length; i++) {
        hash ^= seedText.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
        hash ^= i + 0x9e3779b9;
        hash = Math.imul(hash, 2246822507);
        const unit = ((hash >>> 0) % 100) / 100;
        const arch = Math.sin(((i + 1) / (count + 1)) * Math.PI);
        bars.push(Math.round(26 + (unit * 0.62 + arch * 0.38) * 70));
    }
    return bars;
}

export function formatAudioSeconds(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0 && seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

type StripProps = {
    asset: Extract<Asset, { kind: "audio" }>;
    selection?: ReactNode;
    roleName?: string;
    selected?: boolean;
    onInspect?: () => void;
    onEdit: () => void;
    onReference: () => void;
};

export function ElementAudioStripCard({ asset, roleName, selected = false, onInspect, onEdit, onReference, selection }: StripProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState((asset.data.durationMs || 0) / 1000);
    const [error, setError] = useState(false);

    useEffect(() => {
        setError(false);
        audioRef.current?.load();
    }, [asset.data.url]);

    const rule = useVideoStudioStore(s => s.projects.find(p => p.id === s.activeProjectId)?.elementRules?.[asset.id]);
    const bars = useMemo(() => buildWaveformHeights(asset.id + ":" + asset.title, 40), [asset.id, asset.title]);
    const progress = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;

    const togglePlay = () => {
        const el = audioRef.current;
        if (!el) return;
        if (playing) {
            el.pause();
        } else {
            void el.play().catch(() => setError(true));
        }
    };

    return (
        <LocalAssetMenu asset={asset} hideRelink>
            <article
                data-archive-card={`["音频",${JSON.stringify(roleName || asset.title)}]`}
                data-audio-strip={asset.id}
                data-selected={selected || undefined}
                draggable
                onDragStart={event => {
                    writeElementDrag(event.dataTransfer,asset);
                }}
                onClick={() => onInspect?.()}
                onDoubleClick={() => onEdit()}
                className="wb-audio-strip group relative"
            >
                {selection}
                <audio
                    ref={audioRef}
                    preload="metadata"
                    src={asset.data.url}
                    onLoadedMetadata={e => {
                        setError(false);
                        if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
                            setDuration(e.currentTarget.duration);
                        }
                    }}
                    onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                        setPlaying(false);
                        setTime(0);
                    }}
                    onError={() => {
                        setError(true);
                        if (asset.localFile) notifyLocalAssetLoadError(asset);
                    }}
                />

                <button
                    type="button"
                    aria-label={(playing ? "暂停 " : "试听 ") + asset.title}
                    onClick={e => {
                        e.stopPropagation();
                        togglePlay();
                    }}
                    className="wb-audio-play-btn"
                >
                    {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                </button>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                            {Number(rule?.priority) > 0 && (
                                <span className="wb-priority-chip">
                                    <Star size={10} />优先{rule?.priority}
                                </span>
                            )}
                            <span className="truncate text-xs font-semibold text-foreground" title={asset.title}>
                                {error ? `${asset.title}（无法读取）` : asset.title}
                            </span>
                        </div>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatAudioSeconds(playing ? time : duration)}
                        </time>
                    </div>

                    <div
                        role="slider"
                        aria-label={"试听进度 " + asset.title}
                        aria-valuemin={0}
                        aria-valuemax={Math.round(duration || 1)}
                        aria-valuenow={Math.round(time)}
                        tabIndex={0}
                        onClick={e => {
                            e.stopPropagation();
                            if (!audioRef.current || !duration) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                            audioRef.current.currentTime = ratio * duration;
                            setTime(ratio * duration);
                        }}
                        className={"wb-wave-track " + (playing ? "is-playing" : "")}
                    >
                        {bars.map((h, i) => {
                            const activeBar = i / bars.length <= progress && (playing || time > 0);
                            return (
                                <span
                                    key={i}
                                    className={"wb-wave-bar " + (activeBar ? "is-active" : "")}
                                    style={{ height: `${Math.max(22, h)}%` }}
                                />
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">
                            {roleName ? (
                                <>
                                    声线归属：<strong className="font-semibold text-primary">@{roleName}</strong>
                                </>
                            ) : (
                                "独立音频参考"
                            )}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <button
                                type="button"
                                aria-label={"编辑元素 " + asset.title}
                                title="编辑音频属性"
                                onClick={e => {
                                    e.stopPropagation();
                                    onEdit();
                                }}
                                className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                                <Pencil size={12} />
                            </button>
                            <button
                                type="button"
                                disabled={Boolean(rule?.disabled)}
                                aria-label={"引用到提示词 " + asset.title}
                                onClick={e => {
                                    e.stopPropagation();
                                    onReference();
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
                            >
                                <AtSign size={11} />引用音色
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        </LocalAssetMenu>
    );
}
