"use client";
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "antd";
import { AudioLines, Clapperboard, ImageIcon, Play } from "lucide-react";
import { workbench } from "@/services/api/workbench";
import type { LibraryItem } from "@/services/api/project-library";

export const REVIEW = [
    { value: "none", label: "无状态" }, { value: "in-progress", label: "进行中" },
    { value: "pending", label: "待审" }, { value: "approved", label: "已通过" }, { value: "rejected", label: "已拒绝" },
];
export const CATEGORIES = [{ value: "characters", label: "人物" }, { value: "scenes", label: "场景" }, { value: "props", label: "道具" }, { value: "audio", label: "音频" }, { value: "groups", label: "群像" }, { value: "other", label: "其他" }, { value: "pending", label: "待分类" }];
export const categoryName = (value?: string) => CATEGORIES.find(c => c.value === value)?.label || "其他";
export const dateLabel = (value: string) => value ? new Date(value).toLocaleDateString("zh-CN") : "未知日期";

export function LibraryCard({ item, root, selected, masonry, onSelect, onOpen }: { item: LibraryItem; root: string; selected: boolean; masonry?: boolean; onSelect: () => void; onOpen: () => void }) {
    const ref = useRef<HTMLElement>(null);
    const [thumb, setThumb] = useState("");
    useEffect(() => {
        setThumb("");
        if (!item.relativePath || item.missing || item.mediaType === "audio") return;
        let alive = true;
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            workbench().assetThumb(root, item.relativePath, 512).then((result: any) => { if (alive && result.preview) setThumb(result.preview); }).catch(() => {});
        }, { rootMargin: "120px" });
        if (ref.current) observer.observe(ref.current);
        return () => { alive = false; observer.disconnect(); };
    }, [root, item.relativePath, item.missing, item.mediaType]);
    const Icon = item.mediaType === "audio" ? AudioLines : item.mediaType === "video" ? Clapperboard : ImageIcon;
    return <article ref={ref} className={`group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border bg-card transition-colors ${selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}`}>
        <button type="button" aria-label={`查看 ${item.displayName}`} className={`relative flex w-full items-center justify-center overflow-hidden bg-secondary/50 ${masonry && thumb ? "" : "aspect-video"}`} onClick={onOpen}>
            {thumb ? <img src={thumb} alt={item.displayName} className={`w-full ${masonry ? "h-auto" : "h-full object-contain"}`} /> : <Icon className="size-10 text-muted-foreground/50" />}
            {item.mediaType === "video" ? <span className="absolute flex size-9 items-center justify-center rounded-full bg-card/85 text-foreground"><Play size={17} fill="currentColor" /></span> : null}
            {item.missing ? <span className="absolute bottom-2 rounded bg-card/90 px-2 text-xs text-destructive">本地文件缺失</span> : null}
        </button>
        <div className="absolute left-2 top-2 rounded bg-card/90 p-1 leading-none"><Checkbox aria-label={`选择 ${item.displayName}`} checked={selected} onChange={onSelect} /></div>
        <div className="p-3">
            <button className="w-full truncate text-left text-sm font-medium" onClick={onOpen}>{item.displayName}</button>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{item.source === "element" ? categoryName(item.category) : item.model || ({image:"图片",video:"视频",audio:"音频"}[item.mediaType])}</span><span>{dateLabel(item.createdAt)}</span></div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]"><span className="rounded-md bg-secondary px-2 py-0.5">{REVIEW.find(s => s.value === item.status)?.label || "无状态"}</span>{item.source === "element" ? <span className="text-muted-foreground">{item.elementStatus === "draft" ? "草稿" : "已启用"}</span> : null}</div>
        </div>
    </article>;
}
