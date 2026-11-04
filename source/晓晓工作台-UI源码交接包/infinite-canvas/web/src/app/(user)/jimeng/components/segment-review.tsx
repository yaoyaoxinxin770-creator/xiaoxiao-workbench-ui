"use client";

import { useEffect, useRef, useState } from "react";
import { App, Button, Empty, Input, Modal, Popconfirm } from "antd";
import { Check, FileAudio, Image as ImageIcon, Play, X } from "lucide-react";
import { workbench } from "@/services/api/workbench";
import styles from "../review.module.css";
import { LegacySlot } from "@/components/storyboard/legacy-slot";
import { useJimengEngine } from "../use-jimeng-engine";

const filename = (path: string) => String(path || "").split(/[\\/]/).pop() || path;
// SegmentReview 以 segmentKey 为 key 重挂载，滚动位置只能放在模块级变量里。
let keptScroll = 0;

function ReviewAsset({ file, root, active, onLocate, onExclude }: { file: any; root: string; active: boolean; onLocate: () => void; onExclude?: () => void }) {
    const [src, setSrc] = useState("");
    const [error, setError] = useState("");
    const [full, setFull] = useState("");
    const [audio, setAudio] = useState("");
    const [loading, setLoading] = useState(false);
    const isAudio = file.type.startsWith("audio/");
    const { message } = App.useApp();
    useEffect(() => {
        let alive = true;
        if (isAudio) return;
        workbench().assetThumb(root, file.relativePath, 512).then(result => {
            if (!alive) return;
            if (result?.preview) setSrc(result.preview);
            else throw new Error(result?.error || "图片文件不可读");
        }).catch(err => { if (alive) { setError(String(err.message)); } });
        return () => { alive = false; };
        // File changes remount this card through its parent key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root, file.relativePath, isAudio]);
    useEffect(() => { if (!full) return; const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(""); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [full]);
    const preview = async () => {
        setLoading(true);
        try {
            const result = await (isAudio ? workbench().assetAudioPreview(root, file.relativePath) : workbench().assetFullImage(root, file.relativePath));
            const source = isAudio ? result?.preview : result?.image;
            if (!source) throw new Error(result?.error || "素材文件不可读");
            if (isAudio) setAudio(source); else setFull(source);
        } catch (err: any) { setError(err.message); message.error(err.message); }
        finally { setLoading(false); }
    };
    return (
        <article data-review-asset={file.relativePath} style={{backgroundColor:"var(--review-material, var(--secondary))",borderColor:active?undefined:"var(--review-material-border, var(--border))"}} className={"min-w-0 rounded-xl border p-3 shadow-sm transition-colors " + (active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card")}>
            {isAudio ? <div className="flex items-center gap-2 text-primary"><FileAudio className="size-5 shrink-0" /><span className="text-xs">{file.roles.join("、") || "参考音频"}</span></div> : (
                <button type="button" aria-label={"放大 " + filename(file.relativePath)} onClick={preview} style={{backgroundColor:"var(--review-image, var(--background))"}} className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-background">
                    {src ? <img src={src} alt={filename(file.relativePath)} className="size-full object-contain" /> : error ? <span className="text-4xl text-primary/60">?</span> : <ImageIcon className="size-7 text-muted-foreground" />}
                </button>
            )}
            <p className="mt-2 break-all text-xs font-medium leading-5 text-primary" data-review-filename>{filename(file.relativePath)}</p>
            {!isAudio ? <p className="text-xs text-muted-foreground">{file.roles.join("、") || "场景参考"}</p> : null}
            <p className={"mt-1 text-[11px] " + (error || file.websiteSkipped ? "text-destructive" : "text-muted-foreground")}>{error || (file.websiteSkipped ? "? 画布未找到该引用，已跳过" : file.websiteVerified ? "画布已引用" : file.references ? "已定位本地引用 · 官网待核验" : "附件上传 · 无正文引用")}</p>
            <div className="mt-2 flex flex-wrap gap-1">
                {isAudio ? <Button size="small" loading={loading} icon={<Play className="size-3" />} onClick={preview}>试听</Button> : null}
                <Button size="small" type="text" className="!text-primary" onClick={onLocate}>定位引用</Button>
                {onExclude ? <Popconfirm title="本组不再使用此素材？" onConfirm={onExclude}><Button size="small" type="text">移出</Button></Popconfirm> : null}
            </div>
            {audio ? <audio controls autoPlay preload="metadata" src={audio} onPlay={event => document.querySelectorAll("audio").forEach(other => { if (other !== event.currentTarget) other.pause(); })} className="mt-2 h-9 w-full" aria-label={filename(file.relativePath)} /> : null}
            {full ? <div role="dialog" aria-modal="true" aria-label="图片预览" className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/95 p-8" onClick={() => setFull("")}>
                <button type="button" autoFocus aria-label="关闭图片预览" className="absolute right-6 top-6 rounded-lg border border-border p-2" onClick={() => setFull("")}><X /></button>
                <button type="button" aria-label="点击图片返回工作台" className="flex h-full max-w-full items-center justify-center" onClick={() => setFull("")}><img src={full} alt={filename(file.relativePath)} className="max-h-full max-w-full object-contain" /></button>
            </div> : null}
        </article>
    );
}

// 核验缺项渲染成与 ReviewAsset 同尺寸的虚线占位卡，点「＋绑定」直接打开该角色的 @ 绑定。
function MissingAsset({ slot, onBind, onLocate }: { slot: { role: string; reason: string; type: string }; onBind: (anchor: HTMLElement) => void; onLocate: () => void }) {
    return <article data-review-placeholder={slot.role} data-placeholder-kind={slot.type} className="flex min-w-0 flex-col rounded-xl border border-dashed border-primary/40 bg-secondary/30 p-3">
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg"><span className="text-4xl text-primary/60">?</span></div>
        <p className="mt-2 truncate text-xs font-medium leading-5 text-primary">{slot.role}</p>
        <p className="line-clamp-2 text-[11px] text-muted-foreground">{slot.reason}</p>
        <div className="mt-2 flex flex-wrap gap-1"><Button size="small" type="text" className="!text-primary" onClick={event => onBind(event.currentTarget)}>＋绑定</Button><Button size="small" type="text" className="!text-primary" onClick={onLocate}>定位引用</Button></div>
    </article>;
}

export function SegmentReview({ index, engine, onNext }: { index: number; engine: ReturnType<typeof useJimengEngine>; onNext: () => void }) {
    const { message, modal } = App.useApp();
    const material = engine.reviewMaterial(index);
    const segment = engine.snap.segments[index];
    const root = engine.snap.context?.root || "";
    const [prefix, setPrefix] = useState(engine.snap.prefixTemplate);
    const [dialog, setDialog] = useState<"" | "prefix">("");
    useEffect(() => { setPrefix(engine.snap.prefixTemplate); }, [engine.snap.prefixTemplate]);
    useEffect(() => { const editor = document.getElementById("promptPreview"); if (editor) editor.contentEditable = String(!engine.busy()); }, [engine.snap.status?.running]);
    useEffect(() => {
        const editor = document.getElementById("promptPreview");
        if (!editor) return;
        const onScroll = () => { keptScroll = editor.scrollTop; };
        editor.addEventListener("scroll", onScroll);
        return () => editor.removeEventListener("scroll", onScroll);
    }, []);
    useEffect(() => {
        engine.g()?.workbenchSyncPromptEditor?.(segment?.prompt || "");
        requestAnimationFrame(() => { const editor = document.getElementById("promptPreview"); if (editor) editor.scrollTop = keptScroll; });
    }, [index, segment?.prompt]);
    // 每组固定从【场景与连续状态】开始看；该节缺失时退回上次滚动位置。
    // LegacySlot 用 150ms 轮询把节点搬进来，编辑器未布局时滚动无效，所以轮询到可用为止。
    useEffect(() => {
        let tries = 0;
        const timer = setInterval(() => {
            const editor = document.getElementById("promptPreview");
            if (!editor || editor.getBoundingClientRect().height <= 0) { if (++tries > 25) clearInterval(timer); return; }
            clearInterval(timer);
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode as Text, at = node.textContent?.indexOf("【场景与连续状态】") ?? -1;
                if (at < 0) continue;
                const range = document.createRange();
                range.setStart(node, at); range.setEnd(node, Math.min(at + 8, (node.textContent || "").length));
                editor.scrollTop += range.getBoundingClientRect().top - editor.getBoundingClientRect().top - 12;
                keptScroll = editor.scrollTop;
                return;
            }
            editor.scrollTop = keptScroll;
        }, 60);
        return () => clearInterval(timer);
    }, [index]);
    const [focused, setFocused] = useState("");
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => { setFocused(""); }, [material?.fingerprint]);
    if (!segment || !material) return <Empty description="选择一个视频组开始审阅" />;
    const locks = [...material.lockedImages, ...material.lockedAudio].sort((a, b) => a.offset - b.offset);
    const characterRoles = new Map((material.assets.characters || []).map((asset: any) => [asset.relativePath, asset.role]));
    const audioRoles = new Map((material.assets.audio || []).map((asset: any) => [asset.relativePath, asset.role]));
    const skippedPaths = new Set(locks.filter(lock => material.website?.skippedReferences?.some((item: any) => item.kind === lock.kind && item.name === lock.name)).map(lock => lock.relativePath || lock.extraFileKey));
    const files = material.localFiles.map((file: any) => ({ ...file, websiteSkipped: skippedPaths.has(file.relativePath), websiteVerified: material.website?.verified && !skippedPaths.has(file.relativePath), kind: file.type.startsWith("audio/") ? "audio" : characterRoles.has(file.relativePath) ? "character" : "scene", role: characterRoles.get(file.relativePath) || audioRoles.get(file.relativePath) || "", references: locks.filter(lock => (lock.relativePath || lock.extraFileKey) === file.relativePath).length, roles: [...new Set([...(material.assets.characters || []), ...(material.assets.scenes || []), ...(material.assets.audio || [])].filter(a => a.relativePath === file.relativePath).map(a => a.role || a.displayName).filter(Boolean))] }));
    const images = files.filter((file: any) => file.type.startsWith("image/"));
    const audio = files.filter((file: any) => file.type.startsWith("audio/"));
    // 「X：原因」格式的缺项变成占位卡；无法归类的条目仍显示为红色小字。
    const slots: { role: string; reason: string; type: "image" | "audio" }[] = [], strayIssues: string[] = [];
    for (const entry of [...material.issues, ...material.notes]) {
        const match = /^([^：:]+)[：:]([\s\S]*)$/.exec(String(entry).trim());
        const role = match?.[1]?.trim() || "", reason = (match?.[2] || "").trim();
        const type = !role ? null : /音频|音色/.test(reason) ? "audio" as const : /图片|角色|形象|核对/.test(reason) ? "image" as const : null;
        if (type) { if (!slots.some(slot => slot.role === role && slot.type === type)) slots.push({ role, reason, type }); }
        else strayIssues.push(entry);
    }
    const imageSlots = slots.filter(slot => slot.type === "image"), audioSlots = slots.filter(slot => slot.type === "audio");
    // 缺项占位卡的定位：滚到该角色的声明行——图片找出场人物/资产行，音频找声线行。
    const locateRole = (role: string, type: "image" | "audio") => {
        const editor = host.current?.querySelector<HTMLElement>("#promptPreview");
        if (!editor) return;
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT), hits: { node: Text; at: number; line: string }[] = [];
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            if (node.parentElement?.closest(".aw-mention-state")) continue;
            const text = node.textContent || "";
            let at = -1;
            while ((at = text.indexOf(role, at + 1)) >= 0) hits.push({ node, at, line: text.slice(text.lastIndexOf("\n", at) + 1, text.indexOf("\n", at) < 0 ? undefined : text.indexOf("\n", at)) });
        }
        const hit = hits.find(h => type === "audio" ? /声线|音色|声音/.test(h.line) || h.line.includes("@" + role) : /资产|首次使用|开镜在场/.test(h.line) || h.line.trim().startsWith(role)) || hits[0];
        if (!hit) { message.info("提示词里没有找到 " + role); return; }
        const range = document.createRange();
        range.setStart(hit.node, hit.at); range.setEnd(hit.node, hit.at + role.length);
        const rect = range.getBoundingClientRect(), viewport = editor.getBoundingClientRect();
        if (rect.top < viewport.top + 12 || rect.bottom > viewport.bottom - 12) editor.scrollTo({ top: editor.scrollTop + rect.top - viewport.top - 24, behavior: "auto" });
        editor.focus({ preventScroll: true });
        window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
    };
    const locate = (path: string, target: "asset" | "prompt") => {
        setFocused(path);
        const attribute = target === "asset" ? "data-review-asset" : "data-review-reference";
        const container = host.current?.querySelector<HTMLElement>(target === "prompt" ? "#promptPreview" : '[aria-label="本组完整素材清单"]');
        const node = [...(container?.querySelectorAll<HTMLElement>("[" + attribute + "]") || [])].find(el => el.getAttribute(attribute) === path);
        let anchorRange: Range | null = null;
        if (!node && container && target === "prompt" && material.prompt.endsWith(segment.prompt)) {
            const bodyStart = material.prompt.length - segment.prompt.length;
            const lock = locks.find(lock => (lock.relativePath || lock.extraFileKey) === path && lock.offset - lock.anchor.length >= bodyStart);
            if (lock) {
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
                while (walker.nextNode()) if (!walker.currentNode.parentElement?.closest(".aw-at,.aw-mention-state")) nodes.push(walker.currentNode as Text);
                const start = nodes.map(n => n.textContent).join("").indexOf(lock.anchor);
                if (start >= 0) {
                    let offset = 0; const range = document.createRange();
                    for (const text of nodes) {
                        const end = offset + text.length;
                        if (offset <= start && start < end) range.setStart(text, start - offset);
                        if (offset < start + lock.anchor.length && start + lock.anchor.length <= end) { range.setEnd(text, start + lock.anchor.length - offset); break; }
                        offset = end;
                    }
                    anchorRange = range;
                    container.focus({ preventScroll: true }); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
                }
            }
        }
        if ((node || anchorRange) && container) {
            const rect = (node || anchorRange)!.getBoundingClientRect(), viewport = container.getBoundingClientRect();
            container.querySelectorAll<HTMLElement>("[data-review-reference]").forEach(el => { el.dataset.reviewActive = String(el.getAttribute(attribute) === path); });
            if (rect.top < viewport.top + 12 || rect.bottom > viewport.bottom - 12) container.scrollTo({ top: container.scrollTop + rect.top - viewport.top - 24, behavior: "auto" });
        }
        if (!node && !anchorRange && target === "prompt") message.info(locks.some(lock => (lock.relativePath || lock.extraFileKey) === path) ? "引用位于自动添加的发送开头部分，正文没有对应锚点。" : "此素材作为附件上传，正文中没有引用锚点。");
    };
    const mark = () => {
        const result = engine.markReviewed(index, material.fingerprint);
        if (!result?.ok) return message.warning(result?.error || "审阅未保存");
        message.success("本组已审阅"); onNext();
    };
    return (
        <div ref={host} data-testid="segment-review" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] xl:overflow-hidden">
                <section aria-label="本组提示词编辑区" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                    <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2">
                        <h3 className="text-sm font-semibold">本组提示词</h3>
                        <Button size="small" onClick={() => setDialog("prefix")}>全局开头提示词</Button>
                        <Button size="small" danger disabled={engine.busy()} onClick={() => modal.confirm({ title: "删除视频 " + segment.id + "？整稿中的这一组也会移除。", okText: "删除本组", okButtonProps: { danger: true }, onOk: () => engine.deleteSegment(index) })}>删除本组</Button>
                    </div>
                    <div data-testid="segment-prompt-editor" className="mx-3 mb-3 flex min-h-48 flex-1 flex-col overflow-hidden rounded-xl border border-primary/30 bg-white dark:bg-card"><LegacySlot selector="#promptPreview" className={styles.promptSlot+" flex min-h-0 flex-1 flex-col overflow-hidden [&_#promptPreview]:!h-full [&_#promptPreview]:!flex-1 [&_#promptPreview]:!m-0 [&_#promptPreview]:!min-h-full [&_#promptPreview]:!max-h-none [&_#promptPreview]:!border-0 [&_#promptPreview]:!bg-white [&_#promptPreview]:!p-3 [&_#promptPreview]:!font-sans [&_#promptPreview]:!text-[15px] [&_#promptPreview]:!leading-7 [&_#promptPreview]:!text-foreground [&_#promptPreview]:!whitespace-pre-wrap"} /></div>
                </section>
                <section className="flex min-h-0 flex-col gap-3 overflow-auto rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="本组完整素材清单">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-accent px-2 py-1 text-xs text-primary">02</span><h2 className="text-sm font-semibold">视频 {segment.id}</h2><span className="text-xs text-muted-foreground">{images.length} 图 · {audio.length} 音频 · {locks.length} 引用</span>
                        <div className="ml-auto flex flex-wrap items-center gap-1.5" data-testid="material-review-actions">
                            <Button size="small" disabled={engine.busy()} icon={<Check className="size-3" />} onClick={mark}>{material.reviewed ? "已审阅，下一组" : "标记已审阅，下一组"}</Button>
                            <Button size="small" disabled={engine.busy()} onClick={() => { const result = engine.markAllReviewed(); if (!result?.ok) message.warning(result?.error || "审阅未保存"); else message.success("本集 " + result.count + " 组全部审阅成功"); }}>全部审阅成功</Button>
                            <Button size="small" type="primary" disabled={engine.busy() || !material.reviewed} onClick={() => { engine.select(index); engine.runCurrent(); }}>发送本组</Button>
                            <Button size="small" disabled={engine.busy()} onClick={() => engine.setFlags(index, { selected: !segment.selected })}>{segment.selected ? "移出批次" : "加入批次"}</Button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2"><Button size="small" disabled={engine.busy()} onMouseDown={e=>e.preventDefault()} onClick={e=>{e.stopPropagation();engine.g()?.workbenchOpenMentionPicker?.(e.currentTarget);}}>@ 绑定图片 / 音频</Button><Button size="small" disabled={engine.busy()} onClick={()=>engine.g()?.workbenchRematchAssets?.("segment")}>重新匹配本组</Button></div>
                    {segment.error ? <p className="text-xs text-destructive">上次发送：{segment.error}</p> : null}
                    {strayIssues.length ? <div className="space-y-1">{strayIssues.map((text: string, i: number) => <p key={i} className="text-xs text-destructive">{text}</p>)}</div> : null}
                    <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">{images.map((file: any) => <ReviewAsset key={root + file.relativePath + material.fingerprint} file={file} root={root} active={focused === file.relativePath} onLocate={() => locate(file.relativePath, "prompt")} onExclude={file.kind ? () => engine.g()?.workbenchSegmentExclude?.(file.kind, file.role, file.relativePath) : undefined} />)}{imageSlots.map(slot => <MissingAsset key={"missing-image-" + slot.role} slot={slot} onBind={anchor => engine.g()?.workbenchOpenRoleBinding?.(slot.role, slot.type, anchor)} onLocate={() => locateRole(slot.role, slot.type)} />)}</div>
                    {!images.length && !imageSlots.length ? <p className="text-xs text-muted-foreground">本组没有发送图片</p> : null}
                    <h3 className="text-sm font-medium">音频素材 <span className="text-muted-foreground">{audio.length} 个</span></h3>
                    <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">{audio.map((file: any) => <ReviewAsset key={root + file.relativePath + material.fingerprint} file={file} root={root} active={focused === file.relativePath} onLocate={() => locate(file.relativePath, "prompt")} onExclude={file.kind ? () => engine.g()?.workbenchSegmentExclude?.(file.kind, file.role, file.relativePath) : undefined} />)}{audioSlots.map(slot => <MissingAsset key={"missing-audio-" + slot.role} slot={slot} onBind={anchor => engine.g()?.workbenchOpenRoleBinding?.(slot.role, slot.type, anchor)} onLocate={() => locateRole(slot.role, slot.type)} />)}</div>
                    {!audio.length && !audioSlots.length ? <p className="text-xs text-muted-foreground">本组没有发送音频；可用上方「@ 绑定图片 / 音频」选择音色。</p> : null}
                    {material.assets.excluded?.length ? <div className="border-t border-border pt-3"><h3 className="mb-2 text-xs font-medium">未进入发送清单</h3>{material.assets.excluded.map((asset: any, i: number) => <p key={i} className="mb-2 flex items-center gap-1 break-all text-xs text-muted-foreground">{asset.role || filename(asset.relativePath) || "素材"} · {asset.reason}{asset.reason === "本组不使用" ? <Button size="small" type="link" className="!h-auto !px-1 !py-0 text-xs" onClick={() => engine.g()?.workbenchSegmentRestore?.(asset.kind === "audio" ? "audio" : "character", asset.role)}>恢复</Button> : null}</p>)}</div> : null}
                </section>
            </div>
            <Modal open={dialog === "prefix"} title="全局开头提示词" onCancel={() => setDialog("")} footer={null} width={640}>
                <p className="mb-2 text-xs text-muted-foreground">每个视频组发送时都会添加这个开头；留空则不添加。</p>
                <Input.TextArea aria-label="全局开头提示词" disabled={engine.busy()} value={prefix} onChange={e=>{const next=e.target.value;const result=engine.updatePrefix(next);if(result?.ok===false)message.error(result.error);else setPrefix(next);}} autoSize={{minRows:4,maxRows:10}} />
            </Modal>
            <LegacySlot selector=".aw-at-picker" className={styles.mentionSlot} keepHidden />
        </div>
    );
}
