"use client";
import { useEffect, useState } from "react";
import { App, Button, Input, Select } from "antd";
import { AtSign, Copy, Expand, Sparkles, Star, X } from "lucide-react";
import copy from "copy-to-clipboard";
import type { Asset } from "@/stores/use-asset-store";
import type { ElementReferenceRule, StudioProject } from "../studio-model";
import {useElementMoves} from '../use-element-moves';
import { ELEMENT_CATEGORIES, elementCategory } from "../element-model";
import { ElementThumbnail } from "./element-asset-card";
import { ElementAudioStripCard } from "./element-audio-strip";

type InspectorProps = {
    asset: Asset | null;
    groupName?: string;
    groupItems: Asset[];
    project: StudioProject;
    onSelectVariant: (asset: Asset) => void;
    onUpdateAsset: (id: string, patch: Partial<Asset>) => void;
    onSaveRule: (id: string, patch: ElementReferenceRule) => void;
    onReference: (asset: Asset) => void;
    onOpenModal: (asset: Asset) => void;
    onClose: () => void;
};

export function ElementInspectorPanel({
    asset,
    groupName,
    groupItems,
    project,
    onSelectVariant,
    onUpdateAsset,
    onSaveRule,
    onReference,
    onOpenModal,
    onClose,
}: InspectorProps) {
    const { message } = App.useApp();
    const moves=useElementMoves();
    const [aliasDraft,setAliasDraft]=useState("");
    const [nameDraft, setNameDraft] = useState(asset?.title || "");
    const [performerDraft, setPerformerDraft] = useState("");

    useEffect(() => {
        if (!asset) return;
        setNameDraft(asset.title);setAliasDraft(Array.isArray(asset.metadata?.elementAliases)?asset.metadata.elementAliases.join("、"):"");
        const manual = typeof asset.metadata?.elementPerformer === "string" ? asset.metadata.elementPerformer : "";
        setPerformerDraft(manual || groupName || "");
    }, [asset?.id, asset?.title, asset?.metadata?.elementPerformer, asset?.metadata?.elementAliases, groupName]);

    const category = asset ? elementCategory(asset) : "未分类";
    const rule = asset ? project.elementRules?.[asset.id] : undefined;
    const effectiveName = (groupName || asset?.title || "").trim();
    const triggerToken = category === "人物" || category === "音频" ? `@${effectiveName}` : `【${effectiveName}】`;

    const commitTitle = () => {
        if (!asset) return;
        const trimmed = nameDraft.trim();
        if (trimmed && trimmed !== asset.title) {
            onUpdateAsset(asset.id, { title: trimmed });
            message.success("已更新资产名称");
        } else {
            setNameDraft(asset.title);
        }
    };

    const commitPerformer = () => {
        if (!asset) return;
        const trimmed = performerDraft.trim();
        const prev = typeof asset.metadata?.elementPerformer === "string" ? asset.metadata.elementPerformer : "";
        if (trimmed !== prev) {
            onUpdateAsset(asset.id, { metadata: { ...asset.metadata, elementPerformer: trimmed, elementManualGroup:trimmed, elementRoleGroup: undefined } });
            message.success("已更新分组归属");
        }
    };

    return (
        <aside data-element-inspector aria-label="资产属性检查器" className="wb-inspector-panel">
            <div className="wb-inspector-head">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sparkles size={14} className="text-primary" />
                    <span>资产属性</span>
                </div>
                <button
                    type="button"
                    aria-label="收起属性检查器"
                    title="收起右侧检查器"
                    onClick={onClose}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                    <X size={14} />
                </button>
            </div>

            {!asset ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                    <span>点击左侧任意资产</span>
                    <span>即可快速设置优先级、分类与分组归属</span>
                </div>
            ) : (
                <div className="wb-inspector-body">
                    {/* 预览头：保持 shrink-0 与原始 4/3 比例，避免被下方表单挤压裁切 */}
                    {asset.kind === "audio" ? (
                        <div className="shrink-0">
                            <ElementAudioStripCard
                                asset={asset}
                                roleName={effectiveName}
                                onEdit={() => onOpenModal(asset)}
                                onReference={() => onReference(asset)}
                            />
                        </div>
                    ) : (
                        <div className="relative shrink-0 overflow-hidden rounded-xl border border-border bg-secondary/40">
                            <button
                                type="button"
                                aria-label={"放大查看 " + asset.title}
                                title="点击放大查看高清大图"
                                onClick={() => onOpenModal(asset)}
                                className="block w-full text-left"
                            >
                                <ElementThumbnail asset={asset} eager />
                            </button>
                            <button
                                type="button"
                                aria-label={"放大编辑 " + asset.title}
                                title="打开高清大图与完整弹窗"
                                onClick={() => onOpenModal(asset)}
                                className="absolute right-2 top-2 z-[2] inline-flex items-center gap-1 rounded-lg bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-sm transition hover:bg-black/75"
                            >
                                <Expand size={12} />大图查看
                            </button>
                            {Number(rule?.priority) > 0 && !rule?.disabled && (
                                <span className="wb-priority-chip pointer-events-none absolute bottom-2 left-2 z-[2]">
                                    <Star size={10} />优先 {rule?.priority}
                                </span>
                            )}
                        </div>
                    )}

                    {/* 引用标识与一键插入 */}
                    <section className="shrink-0 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-secondary-foreground">
                            <span>提示词引用标识</span>
                            <button
                                type="button"
                                onClick={() => {
                                    copy(triggerToken);
                                    message.success(`已复制 ${triggerToken}`);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
                            >
                                <Copy size={11} />复制标识
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-primary">
                                {triggerToken}
                            </code>
                            <Button
                                size="small"
                                type="primary"
                                disabled={Boolean(rule?.disabled)}
                                icon={<AtSign className="size-3.5" />}
                                onClick={() => onReference(asset)}
                            >
                                插入草稿
                            </Button>
                        </div>
                    </section>

                    {/* 快捷优先级与启用控制 */}
                    <section className="shrink-0 space-y-1.5">
                        <span className="block text-xs font-semibold text-secondary-foreground">自动匹配权重</span>
                        <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1 text-xs">
                            {[
                                { label: "普通", active: !rule?.disabled && !rule?.priority, apply: () => onSaveRule(asset.id, { disabled: false, priority: 0 }) },
                                { label: "优先1", active: !rule?.disabled && rule?.priority === 1, apply: () => onSaveRule(asset.id, { disabled: false, priority: 1 }) },
                                { label: "优先2", active: !rule?.disabled && (rule?.priority || 0) >= 2, apply: () => onSaveRule(asset.id, { disabled: false, priority: 2 }) },
                                { label: "禁用", active: Boolean(rule?.disabled), apply: () => onSaveRule(asset.id, { disabled: true }) },
                            ].map(opt => (
                                <button
                                    key={opt.label}
                                    type="button"
                                    onClick={opt.apply}
                                    className={
                                        "rounded-lg py-1 font-medium transition " +
                                        (opt.active ? "bg-card text-primary shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground")
                                    }
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* 名称、分类与角色归属直改 */}
                    <section className="grid shrink-0 gap-2.5 rounded-xl border border-border bg-background/60 p-2.5 text-xs">
                        <label className="grid gap-1">
                            <span className="text-muted-foreground">素材名称</span>
                            <Input
                                size="small"
                                value={nameDraft}
                                onChange={e => setNameDraft(e.target.value)}
                                onBlur={commitTitle}
                                onPressEnter={commitTitle}
                            />
                        </label>
                        <label className="grid gap-1"><span className="text-muted-foreground">别名（参与提示词匹配）</span><Input size="small" aria-label="检查器素材别名" value={aliasDraft} onChange={e=>setAliasDraft(e.target.value)} onBlur={()=>onUpdateAsset(asset.id,{metadata:{...asset.metadata,elementAliases:[...new Set(aliasDraft.split(/[、,，;；]+/).map(v=>v.trim()).filter(Boolean))]}})} placeholder="多个别名用顿号分隔"/></label><div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1">
                                <span className="text-muted-foreground">所属分类</span>
                                <Select
                                    size="small"
                                    value={category}
                                    onChange={val => moves.move([asset],{kind:"category",name:val})}
                                    options={[...ELEMENT_CATEGORIES.slice(1), "视频", "未分类"].map(v => ({ value: v, label: v }))}
                                />
                            </label>
                            <label className="grid gap-1">
                                <span className="text-muted-foreground">归属角色/组名</span>
                                <Input
                                    size="small"
                                    placeholder="如：陆霖辞"
                                    value={performerDraft}
                                    onChange={e => setPerformerDraft(e.target.value)}
                                    onBlur={commitPerformer}
                                    onPressEnter={commitPerformer}
                                />
                            </label>
                        </div>
                    </section>

                    <Button size="small" onClick={()=>moves.move([asset],{kind:"category",name:"未分类"})}>移出角色库</Button>
                    {/* 同组变体栈快速切换 */}
                    {groupItems.length > 1 && (
                        <section className="shrink-0 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-secondary-foreground">同组设定变体 ({groupItems.length})</span>
                                <span className="text-muted-foreground">单击切换</span>
                            </div>
                            <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
                                {groupItems.map(item => {
                                    const itemRule = project.elementRules?.[item.id];
                                    const isCurrent = item.id === asset.id;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => onSelectVariant(item)}
                                            onDoubleClick={() => onOpenModal(item)}
                                            className={
                                                "flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition " +
                                                (isCurrent ? "border-primary bg-accent/60 font-semibold" : "border-border bg-card hover:bg-secondary/60")
                                            }
                                        >
                                            <span className="size-7 shrink-0 overflow-hidden rounded bg-secondary">
                                                <ElementThumbnail asset={item} />
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                            {itemRule?.disabled ? (
                                                <span className="shrink-0 text-xs text-muted-foreground">禁用</span>
                                            ) : Number(itemRule?.priority) > 0 ? (
                                                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                                                    优先{itemRule?.priority}
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        onSaveRule(item.id, { disabled: false, priority: 1 });
                                                    }}
                                                    className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-primary"
                                                >
                                                    设优先
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </aside>
    );
}
