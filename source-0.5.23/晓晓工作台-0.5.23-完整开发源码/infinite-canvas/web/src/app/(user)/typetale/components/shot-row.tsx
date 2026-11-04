"use client";

import { Button, Input, InputNumber, Popconfirm, Popover, Select, Tag, Tooltip } from "antd";
import { ArrowDownToLine, ArrowUpToLine, ListPlus, Play, Tag as TagIcon, Trash2, Workflow } from "lucide-react";

import { ShotRowFrame } from "@/components/storyboard/shot-row-frame";
import { LinesEditor } from "@/components/storyboard/lines-editor";
import { ShotMediaGrid } from "./shot-media-grid";
import { KIND_LABEL, STATUS_LABEL, useTypetaleStore } from "../stores/use-typetale-store";
import { workbench } from "@/services/api/workbench";

const STATUS_COLOR: Record<string, string> = { ready: "default", running: "processing", submitted: "cyan", done: "success", error: "error", queued: "warning" };

export function ShotRow({ shot }: { shot: any }) {
    const state = useTypetaleStore((s) => s.state);
    const running = useTypetaleStore((s) => s.running);
    const active = useTypetaleStore((s) => s.state.activeShotId === shot.id);
    const store = useTypetaleStore.getState();
    const assetsById = new Map(state.assets.map((asset: any) => [asset.id, asset]));
    const bound = (shot.bindings?.assetIds || []).map((id: string) => assetsById.get(id)).filter(Boolean);
    const imageAssets = state.assets.filter((asset: any) => asset.mediaType !== "audio" && asset.mediaType !== "video");
    const audioAssets = state.assets.filter((asset: any) => asset.mediaType === "audio");
    const frameOptions = [{ value: "", label: "不使用" }, ...imageAssets.map((asset: any) => ({ value: asset.id, label: asset.name }))];
    const voiceOptions = [{ value: "", label: "默认" }, ...audioAssets.map((asset: any) => ({ value: asset.id, label: asset.name }))];

    const previewVoice = async () => {
        const asset = audioAssets.find((item: any) => item.id === shot.voiceId) || audioAssets[0];
        if (!asset) { store.log("当前项目没有音频素材可试听", "error"); return; }
        const result = await workbench().assetAudioPreview?.(store.projectPath, asset.path).catch(() => null);
        if (result?.preview) new Audio(result.preview).play().catch(() => {});
    };

    return (
        <ShotRowFrame
            id={shot.id}
            className={active ? "ring-2 ring-primary/60" : undefined}
            status={{ label: STATUS_LABEL[shot.status] || shot.status, color: STATUS_COLOR[shot.status] || "default" }}
            left={
                <>
                    <Button type="primary" size="small" icon={<Play className="size-3.5" />} disabled={running} onClick={() => void store.submitShot(shot)}>生成视频</Button>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="whitespace-nowrap">批量</span>
                        <InputNumber size="small" min={1} max={8} value={shot.batchNum} onChange={(v) => store.updateShot(shot.id, { batchNum: Math.max(1, Number(v) || 1) })} className="w-16" />
                        <span className="whitespace-nowrap">轮次</span>
                        <InputNumber size="small" min={0} max={99} value={shot.generationRound} onChange={(v) => store.updateShot(shot.id, { generationRound: Math.max(0, Number(v) || 0) })} className="w-16" />
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                        <Select size="small" value={shot.frames?.first || ""} options={frameOptions} onChange={(v) => store.updateShot(shot.id, { frames: { ...(shot.frames || {}), first: v } })} placeholder="首帧" />
                        <Select size="small" value={shot.frames?.last || ""} options={frameOptions} onChange={(v) => store.updateShot(shot.id, { frames: { ...(shot.frames || {}), last: v } })} placeholder="尾帧" />
                    </div>
                    {bound.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {bound.map((asset: any) => <Tag key={asset.id} className="!m-0" title={asset.path}>{KIND_LABEL[asset.kind] || asset.kind}·{asset.name}</Tag>)}
                        </div>
                    ) : null}
                    <ShotMediaGrid shot={shot} />
                </>
            }
            middle={
                <>
                    <Input
                        size="small"
                        variant="filled"
                        placeholder="负向词（可留空）"
                        value={shot.negativePrompt}
                        onChange={(event) => store.updateShot(shot.id, { negativePrompt: event.target.value })}
                        className="mb-2"
                    />
                    <textarea
                        value={shot.prompt}
                        placeholder="输入视频提示词…（@素材名 绑定参考图）"
                        className="min-h-24 flex-1 resize-none rounded-lg border border-border bg-transparent p-2.5 text-sm leading-6 text-foreground outline-none transition focus:border-primary"
                        onChange={(event) => store.updateShot(shot.id, { prompt: event.target.value })}
                    />
                </>
            }
            middleFooter={
                <>
                    <Button size="small" type="text" onClick={() => store.selectShot(shot.id, true)}>编辑</Button>
                    <Button size="small" type="text" onClick={() => { const compiled = store.compileShot(shot); if (compiled?.missingMentions?.length) store.log(`提示词中有未匹配素材：${compiled.missingMentions.join("、")}`, "error"); for (const item of compiled?.overflow || []) store.log(`${item.name} 超出「${compiled.family.name}」的${item.mediaType}上限（${item.limit}），不会发给模型`, "error"); store.selectShot(shot.id, true); }}>编译</Button>
                    <Popover trigger="click" content={
                        <Input
                            size="small"
                            defaultValue={(shot.tags || []).join(",")}
                            placeholder="逗号分隔"
                            onBlur={(event) => store.updateShot(shot.id, { tags: event.target.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean) })}
                            onPressEnter={(event) => store.updateShot(shot.id, { tags: (event.target as HTMLInputElement).value.split(/[,，]/).map((t) => t.trim()).filter(Boolean) })}
                        />
                    }><Button size="small" type="text" icon={<TagIcon className="size-3.5" />}>标签</Button></Popover>
                    <Button size="small" type="text" onClick={() => store.selectShot(shot.id, true)}>详情</Button>
                    <Button size="small" type="text" icon={<Workflow className="size-3.5" />} disabled title="工作流（下一阶段）">工作流</Button>
                </>
            }
            right={
                <div className="flex-1 rounded-lg border border-border/70 bg-secondary/40 p-1.5">
                    <LinesEditor compact lines={Array.isArray(shot.lines) ? shot.lines : []} onChange={(lines) => store.updateShot(shot.id, { lines })} />
                </div>
            }
            rightFooter={
                <>
                    <Select size="small" className="w-28" value={shot.voiceId || ""} options={voiceOptions} onChange={(v) => store.updateShot(shot.id, { voiceId: v })} placeholder="音色" />
                    <Button size="small" type="text" onClick={() => void previewVoice()}>试听</Button>
                    <Button size="small" type="text" onClick={() => void store.importAssets()}>导入</Button>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <Tooltip title="新建分镜"><Button size="small" type="text" icon={<ListPlus className="size-3.5" />} onClick={() => store.addShotAfter(state.shots.findIndex((item: any) => item.id === shot.id))}>新建分镜</Button></Tooltip>
                    <Popconfirm title="删除这个分镜？" onConfirm={() => store.deleteShot(shot.id)}><Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />}>删除分镜</Button></Popconfirm>
                    <Tooltip title="向上合并"><Button size="small" type="text" icon={<ArrowUpToLine className="size-3.5" />} onClick={() => store.mergeShot(shot.id, "up")} /></Tooltip>
                    <Tooltip title="向下拆分"><Button size="small" type="text" icon={<ArrowDownToLine className="size-3.5" />} onClick={() => store.splitShotAt(shot.id, Math.max(1, Math.ceil((shot.lines || []).length / 2)))} disabled={!(shot.lines || []).length} /></Tooltip>
                </>
            }
        />
    );
}
