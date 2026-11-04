"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Popconfirm, Tag, Tooltip } from "antd";
import { Eye, ListPlus, Play, Star, Trash2 } from "lucide-react";

import { ShotRowFrame } from "@/components/storyboard/shot-row-frame";
import { MediaGrid, type MediaItem } from "@/components/storyboard/media-grid";
import { workbench } from "@/services/api/workbench";
import type { useJimengEngine } from "../use-jimeng-engine";

const STATUS: Record<string, { label: string; color: string }> = {
    "": { label: "待准备", color: "default" },
    ready: { label: "待准备", color: "default" },
    running: { label: "执行中", color: "processing" },
    done: { label: "已完成", color: "success" },
    error: { label: "执行失败", color: "error" },
};

const KIND_LABEL: Record<string, string> = { characters: "人物", scenes: "场景", audio: "音频" };
const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

export function SegmentRow({ segment, index, engine, onEdit, className }: {
    segment: any;
    index: number;
    engine: ReturnType<typeof useJimengEngine>;
    onEdit: (index: number) => void;
    className?: string;
}) {
    const key = engine.segmentKey(segment, index);
    const root = engine.snap.context?.root || "";
    const bound = engine.bindings(key);
    const execution = engine.executionAssets(key);
    const roles = engine.roles(segment.prompt);
    const imageAssets = [...(execution.characters || []), ...(execution.scenes || [])].filter((asset: any) => asset?.relativePath && IMAGE_EXT.test(asset.relativePath));
    const audioAssets = execution.audio || [];

    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    useEffect(() => {
        let alive = true;
        for (const asset of imageAssets) {
            const path = asset.relativePath;
            if (thumbs[path]) continue;
            workbench().assetThumb?.(root, path)
                .then((result: any) => { if (alive && result?.preview) setThumbs((prev) => (prev[path] ? prev : { ...prev, [path]: result.preview })); })
                .catch(() => {});
        }
        return () => { alive = false; };
    }, [root, imageAssets.map((a: any) => a?.relativePath).join("|")]);

    const items: MediaItem[] = imageAssets.slice(0, 4).map((asset: any, i: number) => ({
        key: asset.relativePath || i,
        src: thumbs[asset.relativePath] || "",
        label: asset.displayName || asset.relativePath,
    }));

    const [draft, setDraft] = useState(segment.prompt);
    const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => { if (!pending.current) setDraft(segment.prompt); }, [segment.prompt]);
    useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
    const editPrompt = (value: string) => {
        setDraft(value);
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(() => { pending.current = null; engine.updatePrompt(index, value); }, 300);
    };

    const status = STATUS[segment.status] || STATUS[""];

    return (
        <ShotRowFrame
            id={segment.id}
            className={className}
            status={status}
            left={
                <>
                    <Button type="primary" size="small" icon={<Play className="size-3.5" />} disabled={engine.busy()} onClick={() => { engine.select(index); void engine.runCurrent(); }}>执行单组</Button>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                            checked={segment.selected}
                            onChange={(e) => engine.setFlags(index, { selected: e.target.checked })}
                        ><span className="whitespace-nowrap text-xs">选中</span></Checkbox>
                        <Button size="small" type="text" icon={<Star className={`size-3.5 ${segment.marked ? "fill-[var(--gold)] text-[var(--gold)]" : ""}`} />} onClick={() => engine.setFlags(index, { marked: !segment.marked })}><span className="whitespace-nowrap">{segment.marked ? "已标记" : "标记"}</span></Button>
                    </div>
                    {Object.keys(bound).length || execution.scenes?.length || audioAssets.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {Object.entries(bound).map(([role, asset]: [string, any]) => <Tag key={role} className="!m-0" title={asset?.relativePath}>{KIND_LABEL.characters}·{role}</Tag>)}
                            {(execution.scenes || []).map((asset: any) => <Tag key={asset.relativePath} className="!m-0" title={asset.relativePath}>{KIND_LABEL.scenes}·{asset.displayName}</Tag>)}
                            {audioAssets.map((asset: any) => <Tag key={`${asset.role}-${asset.relativePath}`} className="!m-0" title={asset.relativePath}>{KIND_LABEL.audio}·{asset.role || asset.displayName}</Tag>)}
                        </div>
                    ) : null}
                    <MediaGrid items={items} emptyLabel="无参考素材" />
                </>
            }
            middle={
                <textarea
                    value={draft}
                    placeholder="输入该分镜的提示词…"
                    onFocus={() => engine.select(index)}
                    className="min-h-24 flex-1 resize-none rounded-lg border border-border bg-transparent p-2.5 text-sm leading-6 text-foreground outline-none transition focus:border-primary"
                    onChange={(event) => editPrompt(event.target.value)}
                />
            }
            middleFooter={
                <>
                    <Button size="small" type="text" onClick={() => onEdit(index)}>编辑</Button>
                    <Button size="small" type="text" icon={<Eye className="size-3.5" />} onClick={() => onEdit(index)}>预览发送内容</Button>
                </>
            }
            right={
                <div className="flex-1 rounded-lg border border-border/70 bg-secondary/40 p-2.5">
                    {roles.length ? (
                        <div className="flex flex-wrap gap-1">
                            {roles.map((role: string) => <Tag key={role} className="!m-0">{role}</Tag>)}
                        </div>
                    ) : <span className="text-xs text-muted-foreground">提示词中暂未识别到人物角色</span>}
                    {audioAssets.length ? <p className="mt-2 text-xs text-muted-foreground">音频：{audioAssets.map((a: any) => `${a.role}→${a.displayName}`).join("、")}</p> : null}
                    {segment.error ? <Tooltip title={segment.error}><p className="mt-2 line-clamp-2 text-xs text-destructive">{segment.error}</p></Tooltip> : null}
                </div>
            }
            rightFooter={
                <>
                    <Tooltip title="新建分镜"><Button size="small" type="text" icon={<ListPlus className="size-3.5" />} onClick={() => engine.addSegment()}>新建分镜</Button></Tooltip>
                    <Popconfirm title={`删除视频 ${segment.id}？整稿中的这一组也会被移除。`} onConfirm={() => engine.deleteSegment(index)}>
                        <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />}>删除分镜</Button>
                    </Popconfirm>
                </>
            }
        />
    );
}
