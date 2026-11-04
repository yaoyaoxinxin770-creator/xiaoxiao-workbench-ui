"use client";

import { useEffect, useState } from "react";
import { Drawer, Tag } from "antd";

import { LegacySlot } from "@/components/storyboard/legacy-slot";
import type { useJimengEngine } from "../use-jimeng-engine";

export function SegmentEditDrawer({ open, index, engine, onClose }: {
    open: boolean;
    index: number | null;
    engine: ReturnType<typeof useJimengEngine>;
    onClose: () => void;
}) {
    const segment = index !== null ? engine.snap.segments[index] : null;
    const [material, setMaterial] = useState<any>(null);
    const [materialError, setMaterialError] = useState("");
    const [prompt, setPrompt] = useState("");
    useEffect(() => { if (open) setPrompt(segment?.prompt || ""); }, [open, index]);

    useEffect(() => {
        if (!open || index === null) return;
        try { setMaterial(engine.reviewMaterial(index)); setMaterialError(""); }
        catch (error: any) { setMaterial(null); setMaterialError(String(error?.message || error)); }
    }, [open, index, engine.snap]);

    return (
        <Drawer
            title={segment ? `分镜 ${segment.id} · ${segment.name || "未命名"}` : "编辑分镜"}
            placement="right"
            width={720}
            open={open}
            onClose={onClose}
        >
            {segment && index !== null ? (
                <div className="flex flex-col gap-5">
                    <section>
                        <p className="eyebrow mb-2">提示词</p>
                        <textarea
                            value={prompt}
                            disabled={engine.busy()}
                            className="h-36 w-full resize-none rounded-lg border border-border bg-transparent p-2.5 text-sm leading-6 outline-none focus:border-primary"
                            onChange={(e) => { setPrompt(e.target.value); engine.updatePrompt(index, e.target.value); }}
                        />
                    </section>
                    <section>
                        <p className="eyebrow mb-2">发送内容预览</p>
                        {materialError ? <p className="text-xs text-destructive">{materialError}</p> : null}
                        {material ? (
                            <>
                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-5">{material.prompt || "空提示词"}</pre>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {(material.lockedImages || []).map((item: any, i: number) => <Tag key={`i${i}`} className="!m-0">图 · {item.name}</Tag>)}
                                    {(material.lockedAudio || []).map((item: any, i: number) => <Tag key={`a${i}`} className="!m-0">音频 · {item.name}</Tag>)}
                                    {(material.localFiles || []).map((item: any, i: number) => <Tag key={`f${i}`} className="!m-0" title={item.relativePath}>{item.name}</Tag>)}
                                </div>
                            </>
                        ) : !materialError ? <p className="text-xs text-muted-foreground">暂无可预览的发送内容</p> : null}
                    </section>
                    <section>
                        <p className="eyebrow mb-2">当前分镜的素材绑定</p>
                        <LegacySlot selector=".asset-box" />
                    </section>
                </div>
            ) : null}
        </Drawer>
    );
}
