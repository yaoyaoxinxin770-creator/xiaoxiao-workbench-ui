"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Input, Select, Tag } from "antd";
import { X } from "lucide-react";

import { KIND_LABEL, shotResults, useTypetaleStore } from "../stores/use-typetale-store";
import { LinesEditor } from "@/components/storyboard/lines-editor";
import { workbench } from "@/services/api/workbench";

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

function Preview({ shot }: { shot: any }) {
    const projectPath = useTypetaleStore((s) => s.projectPath);
    const results = shotResults(shot);
    const current = results[shot.selectedResult >= 0 ? shot.selectedResult : 0];
    const [image, setImage] = useState("");
    useEffect(() => {
        let alive = true;
        setImage("");
        if (current?.path && IMAGE_EXT.test(current.path)) {
            workbench().assetFullImage?.(projectPath, current.path)
                .then((result: any) => { if (alive && result?.image) setImage(result.image); })
                .catch(() => {});
        }
        return () => { alive = false; };
    }, [projectPath, current?.path]);
    if (!current) return <div className="flex aspect-video items-center justify-center rounded-xl bg-secondary text-sm text-muted-foreground">生成后可在此管理结果</div>;
    if (image) return <img src={image} alt="" className="max-h-72 w-full rounded-xl object-contain bg-secondary" />;
    return (
        <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl bg-secondary text-muted-foreground">
            <span className="text-xs">{current.path.split(/[\\/]/).pop() || current.url}</span>
            {current.path ? <Button size="small" onClick={() => workbench().typetaleOpenPath?.(current.path)}>打开文件</Button> : null}
        </div>
    );
}

export function ShotEditDrawer() {
    const editing = useTypetaleStore((s) => s.editing);
    const state = useTypetaleStore((s) => s.state);
    const store = useTypetaleStore.getState();
    const shot = state.shots.find((item: any) => item.id === state.activeShotId) || null;
    const imageAssets = state.assets.filter((asset: any) => asset.mediaType !== "audio" && asset.mediaType !== "video");
    const frameOptions = [{ value: "", label: "不使用" }, ...imageAssets.map((asset: any) => ({ value: asset.id, label: asset.name }))];
    const bound = (shot?.bindings?.assetIds || []).map((id: string) => state.assets.find((asset: any) => asset.id === id)).filter(Boolean);
    const compiled = useMemo(() => (shot ? store.compileShot(shot) : null), [shot, state.assets, state.providers, state.familyOverrides]);

    const insertMention = (asset: any) => {
        if (!shot) return;
        const ids = new Set(shot.bindings?.assetIds || []);
        ids.add(asset.id);
        store.updateShot(shot.id, { prompt: `${shot.prompt || ""}@${asset.name}`, bindings: { assetIds: [...ids] } });
    };
    const unbind = (asset: any) => {
        store.updateShot(shot.id, { bindings: { assetIds: (shot.bindings?.assetIds || []).filter((id: string) => id !== asset.id) } });
    };

    return (
        <Drawer
            title={shot ? `分镜 ${shot.id} · ${shot.title || "未命名"}` : "编辑分镜"}
            placement="right"
            width={720}
            open={editing}
            onClose={() => store.setEditing(false)}
        >
            {shot ? (
                <div className="flex flex-col gap-5">
                    <Preview shot={shot} />

                    <section>
                        <p className="eyebrow mb-2">参考项</p>
                        <div className="flex flex-wrap gap-1.5">
                            {bound.map((asset: any) => (
                                <Tag key={asset.id} className="!m-0 flex items-center gap-1" title={asset.path}>
                                    {KIND_LABEL[asset.kind] || asset.kind}·{asset.name}
                                    <button type="button" aria-label={`移除 ${asset.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => unbind(asset)}><X className="size-3" /></button>
                                    <button type="button" className="text-primary" onClick={() => insertMention(asset)}>@插入</button>
                                </Tag>
                            ))}
                            {!bound.length ? <span className="text-xs text-muted-foreground">暂无绑定素材；在素材面板勾选或 @插入。</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {state.assets.filter((a: any) => !bound.includes(a)).slice(0, 12).map((asset: any) => (
                                <Button key={asset.id} size="small" onClick={() => insertMention(asset)}>@{asset.name}</Button>
                            ))}
                        </div>
                    </section>

                    <section className="grid grid-cols-2 gap-3">
                        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">首帧</span>
                            <Select size="small" className="w-full" value={shot.frames?.first || ""} options={frameOptions} onChange={(v) => store.updateShot(shot.id, { frames: { ...(shot.frames || {}), first: v } })} />
                        </label>
                        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">尾帧</span>
                            <Select size="small" className="w-full" value={shot.frames?.last || ""} options={frameOptions} onChange={(v) => store.updateShot(shot.id, { frames: { ...(shot.frames || {}), last: v } })} />
                        </label>
                    </section>

                    <section>
                        <p className="eyebrow mb-2">提示词</p>
                        <textarea
                            value={shot.prompt}
                            className="h-36 w-full resize-none rounded-lg border border-border bg-transparent p-2.5 text-sm leading-6 outline-none focus:border-primary"
                            onChange={(e) => store.updateShot(shot.id, { prompt: e.target.value })}
                        />
                        <Input size="small" variant="filled" className="mt-2" placeholder="负向提示词（可留空）" value={shot.negativePrompt} onChange={(e) => store.updateShot(shot.id, { negativePrompt: e.target.value })} />
                    </section>

                    <section>
                        <p className="eyebrow mb-2">编译预览</p>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-5">{compiled?.prompt || "空提示词"}</pre>
                        <div className="mt-2 flex flex-col gap-1">
                            {(compiled?.references || []).map((reference: any) => (
                                <span key={`${reference.mediaType}-${reference.index}`} className="text-xs text-muted-foreground">
                                    {{ image: "图", video: "视频", audio: "音频" }[reference.mediaType as string] || "图"}{reference.index} · {reference.name} {reference.token ? <code className="text-primary">{reference.token}</code> : <i>不展开</i>}
                                </span>
                            ))}
                            {compiled?.frames?.first ? <span className="text-xs text-muted-foreground">首帧 · {compiled.frames.first}</span> : null}
                            {compiled?.frames?.last ? <span className="text-xs text-muted-foreground">尾帧 · {compiled.frames.last}</span> : null}
                            {(compiled?.missingMentions || []).length ? <span className="text-xs text-destructive">未匹配素材：{compiled.missingMentions.join("、")}</span> : null}
                            {(compiled?.overflow || []).map((item: any) => (
                                <span key={item.assetId} className="text-xs text-destructive">超出族上限 · {item.name}（{item.mediaType} 上限 {item.limit}，不会发给模型）</span>
                            ))}
                        </div>
                    </section>

                    <section>
                        <p className="eyebrow mb-2">文案行</p>
                        <div className="rounded-lg border border-border p-2">
                            <LinesEditor lines={Array.isArray(shot.lines) ? shot.lines : []} onChange={(lines) => store.updateShot(shot.id, { lines })} />
                        </div>
                    </section>
                </div>
            ) : null}
        </Drawer>
    );
}
