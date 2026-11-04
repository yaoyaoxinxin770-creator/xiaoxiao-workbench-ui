"use client";
import {VIDEO_COLORS,videoColorLabel} from "../video-colors";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, Dropdown, Tooltip } from "antd";
import { Bot, Star, Pencil, LoaderCircle, Play, Video } from "lucide-react";
import { MediaSelection } from "./media-selection";
import { useVideoReorder } from "./use-video-reorder";
import { galleryRows, videoAspect } from "../gallery-layout";
import { requestVideoPoster } from "../video-poster";
import { resolveLogVideoCandidates } from "@/services/api/video-studio-files";
import { videoCardError } from "../video-error";
import { acquirePreview } from "../hover-playback";
import { type ReviewState } from "../studio-model";
import {manualGenerationLabel} from "../studio-results";
import type { GenerationLog } from "../page";

export function VideoGallery({ logs, columns, square, scrollRef, renderTile, headerHeight, onPreviewOrder, onCommitOrder }: {
    logs: GenerationLog[]; columns: number; square: boolean;
    scrollRef: RefObject<HTMLDivElement | null>; renderTile: (log: GenerationLog) => ReactNode;
    headerHeight?: (log:GenerationLog)=>number; onPreviewOrder?:(ids:string[])=>void; onCommitOrder?:(ids:string[])=>void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => { const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
    useVideoReorder(ref,logs.map(l=>l.id),onPreviewOrder,onCommitOrder);
    const geometry = useMemo(() => {if(width<=0)return {rows:[],height:0};if(!headerHeight)return galleryRows(logs,width,columns,square);const count=Math.min(columns,Math.max(1,Math.floor(width/280))),w=(width-8*(count-1))/count,rows:{top:number;height:number;boxes:{index:number;left:number;width:number;height:number}[]}[]=[];let top=0;for(let i=0;i<logs.length;i+=count){const boxes=logs.slice(i,i+count).map((log,j)=>({index:i+j,left:j*(w+8),width:w,height:w/(square?1:log.video?videoAspect(log):16/9)+headerHeight(log)})),height=Math.max(...boxes.map(b=>b.height))+8;rows.push({top,height,boxes});top+=height;}return {rows,height:top};}, [logs, width, columns, square, headerHeight]);
    const virtual = useVirtualizer({ count: geometry.rows.length, getScrollElement: () => scrollRef.current,
        estimateSize: i => geometry.rows[i].height, overscan: 2, getItemKey: i => logs[geometry.rows[i].boxes[0].index].id });
    useEffect(() => { virtual.measure(); }, [geometry, virtual]);
    return <div ref={ref} data-video-gallery data-total-assets={logs.length} className="relative w-full" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map(row => <div key={row.key} className="absolute left-0 top-0 w-full" style={{ height: row.size, transform: `translateY(${row.start}px)` }}>
            {geometry.rows[row.index].boxes.map(box => <div key={logs[box.index].id} data-sort-key={logs[box.index].id} className="absolute overflow-hidden" style={{ left: box.left, top: 0, width: box.width, height: box.height }}>{renderTile(logs[box.index])}</div>)}
        </div>)}
    </div>;
}

export function StudioTile({ log, selected, review, liked = false, compact = true, onSelect, onOpen, onDownload, onSaveShortcut, onOpenFolder, onLike, onWrap, onResume, onStop, onEdit, onSendToAgent, number, groupNumber, empty = false, onHide, color="",colorLabels,onColor,note,onNote, unread = false }: {
    log: GenerationLog; selected: boolean; review: ReviewState; liked?: boolean; compact?: boolean; unread?: boolean;
    onSelect: (checked: boolean) => void; onOpen: () => void; onDownload: () => void; onSaveShortcut?:()=>void; onOpenFolder?:()=>void; onLike: () => void; onWrap?:()=>void; onResume?:()=>void; onStop?:()=>void; onEdit:()=>void; onSendToAgent?:()=>void; number?:string; groupNumber?:string; empty?:boolean; onHide?:()=>void;color?:string;note?:string;onNote?:()=>void;colorLabels?:Record<string,string>;onColor?:(value:string)=>void;
}) {
    const ref = useRef<HTMLElement>(null), videoRef = useRef<HTMLVideoElement>(null), release = useRef<null | (() => void)>(null);
    const [soundBlocked, setSoundBlocked] = useState(false);
    const [poster, setPoster] = useState("");
    const [candidates, setCandidates] = useState<string[]>([]);
    const [candidateIndex, setCandidateIndex] = useState(0);
    const sourceUrl = candidates[candidateIndex] || "";
    const sequence = useRef(0), loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [preview, setPreview] = useState(0), [playing, setPlaying] = useState(false), [blocked, setBlocked] = useState(false);
    useEffect(() => {
        setPoster("");
        if (!log.video) return;
        const abort = new AbortController(); let objectUrl = "";
        requestVideoPoster({ ...log.video, logId: log.id, taskId: log.task?.id }, abort.signal).then(blob => { if (blob && !abort.signal.aborted) { objectUrl = URL.createObjectURL(blob); setPoster(objectUrl); } });
        return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [log.id, log.task?.id, log.video?.storageKey, log.video?.url, log.video?.bytes]);
    const clearLoading = () => { if (loadingTimer.current) clearTimeout(loadingTimer.current); loadingTimer.current = null; };
    const reset = () => { sequence.current++; clearLoading(); release.current = null; const video = videoRef.current; if (video) { video.pause(); video.removeAttribute("src"); video.load(); } setPlaying(false); setPreview(0); setCandidates([]); setCandidateIndex(0); };
    const stop = () => { const end = release.current; if (end) end(); else reset(); };
    const start = () => {
        if (!log.video || release.current || document.hidden) return;
        setBlocked(false); setSoundBlocked(false); setPlaying(false); setCandidates([]); setCandidateIndex(0);
        release.current = acquirePreview(reset);
        setPreview(++sequence.current);
    };
    useEffect(() => {
        const visibility = () => { if (document.hidden) stop(); };
        const observer = new IntersectionObserver(entries => { if (!entries.some(e => e.isIntersecting)) stop(); });
        if (ref.current) observer.observe(ref.current); document.addEventListener("visibilitychange", visibility);
        return () => { stop(); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
    }, []);
    useEffect(() => { if (!preview) return; const leave = (event: MouseEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) stop(); }; document.addEventListener("mousemove", leave, { passive: true }); return () => document.removeEventListener("mousemove", leave); }, [preview]);
    useEffect(() => {
        if (!preview || !log.video) return;
        let active = true;
        const current = () => active && sequence.current === preview;
        loadingTimer.current = setTimeout(() => { if (current()) { setBlocked(true); setPlaying(false); } }, 8000);
        resolveLogVideoCandidates(log).then(({ candidates: urls }) => {
            if (!current()) return;
            if (urls.length) { setCandidates(urls); setCandidateIndex(0); }
            else { clearLoading(); setBlocked(true); }
        }).catch(() => { if (current()) { clearLoading(); setBlocked(true); } });
        return () => { active = false; clearLoading(); };
    }, [preview, log.id, log.task?.id, log.video?.storageKey, log.video?.url, log.video?.bytes]);
    useEffect(() => {
        const video = videoRef.current;
        if (!preview || !sourceUrl || !video) return;
        let active = true;
        const current = () => active && videoRef.current === video && sequence.current === preview;
        const tryNextOrFail = () => {
            if (!current()) return;
            if (candidateIndex + 1 < candidates.length) { setCandidateIndex(idx => idx + 1); return; }
            clearLoading(); setBlocked(true); setPlaying(false);
        };
        const started = () => { if (current()) { clearLoading(); setPlaying(true); setBlocked(false); } };
        const onTimeUpdate = () => { if (video.currentTime > 0 && !video.paused) started(); };
        video.addEventListener("playing", started);
        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("error", tryNextOrFail);
        // Calling play immediately also starts loading when Chromium defers preload.
        // Waiting for canplay before play can otherwise leave a valid clip spinning.
        void video.play().catch(error => {
            if (!current()) return;
            if (error.name === "NotAllowedError") {
                video.muted = true; setSoundBlocked(true);
                void video.play().catch(() => tryNextOrFail());
            } else if (error.name !== "AbortError") tryNextOrFail();
        });
        return () => { active = false; video.removeEventListener("playing", started); video.removeEventListener("timeupdate", onTimeUpdate); video.removeEventListener("error", tryNextOrFail); video.pause(); };
    }, [preview, sourceUrl, candidateIndex, candidates.length]);
    const enableSound = () => { const video=videoRef.current,session=sequence.current;if(video){video.muted=false;setSoundBlocked(false);void video.play().then(()=>{if(videoRef.current===video&&sequence.current===session)setSoundBlocked(false);}).catch(()=>{if(videoRef.current===video&&sequence.current===session){video.muted=true;setSoundBlocked(true);}});} };
    const preparation=log.config?.videoChannelId==="local-dreamina-canvas"?log.task?.status:"";
    return <Dropdown trigger={["contextMenu"]} menu={{items:[...(onSendToAgent?[{key:"agent",label:"发给 Agent 修改…"}]:[]),...(onResume?[{key:"resume",label:log.interruptedAt?"恢复原任务查询":log.status==="待核对"?"核对原画布任务":"继续原画布草稿"}]:[]),...(onStop?[{key:"stop",label:"中断本地等待…"}]:[]),...(onWrap?[{key:"wrap",label:"关联视频组"}]:[]),...(onColor?[{key:"colors",label:"标记颜色",children:[{key:"color:",label:"取消颜色"},...VIDEO_COLORS.map(c=>({key:"color:"+c.id,label:<span className="flex items-center gap-2"><span aria-hidden data-color-menu-dot={c.id} className="size-2.5 shrink-0 rounded-full" style={{background:c.hex}}/>{videoColorLabel(c.id,colorLabels)}</span>}))]}]:[]),...(onSaveShortcut?[{key:"shortcut",label:"保存视频快捷…"}]:[]),...(onOpenFolder?[{key:"open-folder",label:"打开视频文件夹位置"}]:[]),...(onHide?[{key:"delete-group",label:"删除视频组",danger:true}]:[])],onClick:({key})=>{if(key==="agent")onSendToAgent?.();else if(key==="shortcut")onSaveShortcut?.();else if(key==="open-folder")onOpenFolder?.();else if(key==="resume")onResume?.();else if(key==="stop")onStop?.();else if(key==="wrap")onWrap?.();else if(key==="delete-group")onHide?.();else if(key.startsWith("color:"))onColor?.(key.slice(6));}}}><article ref={ref} data-video-tile data-video-group={groupNumber} data-generation-attempt={empty?"pending":log.id} data-group-result={empty?undefined:log.id} data-preview-active={Boolean(preview)} className={`group relative overflow-hidden bg-card ${compact ? "size-full" : "aspect-video"}`} aria-label={`视频 ${log.title}`}
        onMouseEnter={start} onMouseMove={e => { if (!preview && !blocked && ref.current?.contains(e.target as Node)) start(); }} onMouseLeave={() => { setBlocked(false); stop(); }} onFocusCapture={start} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setBlocked(false); stop(); } }}>
        {poster && <img alt={log.title} src={poster} loading="lazy" className="size-full object-cover"/>}
        {preview > 0 && log.video && sourceUrl && <video key={preview + ":" + candidateIndex} ref={videoRef} aria-label={`悬停预览 ${log.title}`} src={sourceUrl} muted={soundBlocked} loop playsInline preload="auto" className="absolute inset-0 size-full object-cover" style={{ opacity: playing ? 1 : 0 }}/>} 
        <button type="button" data-video-drag-surface aria-label={`查看视频 ${log.title}`} data-load-video-group={empty?true:undefined} onClick={()=>{stop();if(empty)onEdit();else onOpen();}} className="absolute inset-0 flex items-center justify-center text-white drop-shadow" style={{ background: poster || playing ? undefined : "var(--accent)" }}>
            {empty ? <span className="rounded bg-card/70 px-4 py-2 text-sm text-foreground backdrop-blur-sm">载入本组</span> : log.task?.status==="awaiting_interpolation" ? <span className="px-4 text-sm text-foreground">{log.task.interpolation?.message||"样片已生成，等待官方补帧完成后回传"}</span> : log.task?.preparationOnly&&log.task.status==="awaiting_confirmation" ? <span className="px-4 text-sm text-foreground">{manualGenerationLabel(log)}</span> : log.status === "待核对" ? <span className="flex flex-col items-center gap-2 px-5 text-foreground"><span>待核对</span><span className="line-clamp-3 text-xs text-muted-foreground">{log.error||"原任务已保留，请核对画布提交状态"}</span></span> : log.status === "生成中" ? <span className="flex flex-col items-center gap-2 text-foreground"><LoaderCircle className="size-6 animate-spin"/>{preparation==="queued"?`排队创建节点${log.task?.queuePosition?" · 第 "+log.task?.queuePosition+" 个":""}`:preparation==="preparing"?"正在创建节点":preparation==="awaiting_confirmation"?"草稿已就绪 · 等待确认":`生成中 ${log.task?.progress??0}%`}</span> : log.video ? !playing && (preview && !blocked ? <LoaderCircle className="size-7 animate-spin"/> : poster ? <Play className="size-8 fill-white/50 stroke-none opacity-70"/> : <Video className="size-8 text-muted-foreground"/>) : log.task?.remoteOnly&&log.task.canvasUrl ? <span className="px-4 text-sm text-foreground">已生成 · 在即梦画布查看</span> : <span title={log.error} className="line-clamp-3 break-words px-4 text-xs text-destructive">{videoCardError(log.error || "")}</span>}
        </button>
        {log.status === "生成中" && onStop && <button type="button" aria-label={`中断等待 ${log.title}`} title="停止本地等待并保留原任务；不会误报官网已经取消" onClick={e => { e.stopPropagation(); onStop(); }} className="absolute bottom-2.5 left-1/2 z-[2] -translate-x-1/2 rounded-full border border-border bg-card/90 px-2.5 py-0.5 text-xs text-secondary-foreground shadow-sm backdrop-blur-sm transition hover:border-primary hover:text-primary">中断等待</button>}
        {preview > 0 && soundBlocked && <Button className="!absolute bottom-9 left-2" size="small" onClick={enableSound}>开启预览声音</Button>}
        {unread && <span data-unread-video role="img" aria-label="未查看的新视频" title="未查看的新视频" className="pointer-events-none absolute bottom-2 left-2 size-2.5 rounded-full bg-primary ring-2 ring-background"/>}
        {color&&<Tooltip mouseEnterDelay={0} mouseLeaveDelay={0} placement="topRight" title={<span data-video-note-tooltip className="whitespace-pre-wrap">{note||videoColorLabel(color,colorLabels)+" · 点击添加备注"}</span>}><button type="button" data-video-color={color} aria-label={"视频备注 "+log.title} onClick={e=>{e.stopPropagation();onNote?.();}} className="absolute bottom-2 right-2 z-[3] size-3 rounded-full ring-2 ring-white/80" style={{background:VIDEO_COLORS.find(c=>c.id===color)?.hex}}/></Tooltip>}
        {number && <span data-video-number className="pointer-events-none absolute left-2 top-2 text-sm font-semibold text-white drop-shadow-md">{number}</span>}
        {!empty && <MediaSelection label={`选择视频 ${log.title}`} selected={selected} onChange={onSelect}/>}
        {!empty && <div data-video-actions className="absolute right-2 top-2 flex flex-col gap-1">
            <button type="button" data-load-video-group={groupNumber?true:undefined} aria-label={`重新编辑视频 ${log.title}`} title="重新编辑" onClick={onEdit} className="flex size-7 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><Pencil className="size-4"/></button>
            {onSendToAgent && <button type="button" data-send-to-agent aria-label={`发给 Agent ${log.title}`} title="发给 Agent 修改提示词" onClick={e=>{e.stopPropagation();onSendToAgent();}} className="flex size-7 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-primary group-hover:opacity-100 group-focus-within:opacity-100"><Bot className="size-4"/></button>}
            <button type="button" aria-label={`收藏视频 ${log.title}`} aria-pressed={liked} title={liked?"取消收藏":"收藏"} className={`flex size-7 items-center justify-center rounded-full transition-opacity ${liked?"text-primary":"bg-black/30 text-white opacity-0 backdrop-blur-sm group-hover:opacity-100 group-focus-within:opacity-100"}`} onClick={onLike}><Star className={`size-4 ${liked?"fill-current drop-shadow":""}`}/></button>
        </div>}
        {preview > 0 && blocked && <span className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs text-foreground">点击打开视频播放</span>}
    </article></Dropdown>;
}
