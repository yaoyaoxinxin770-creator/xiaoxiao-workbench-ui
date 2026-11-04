"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { App, Button, Checkbox, Dropdown, Empty, Input, Modal, Pagination, Popover, Select, Slider, Switch, Table, Tag, Tooltip, Tree, type TreeDataNode } from "antd";
import { ArrowLeft, ArrowRight, AtSign, Bot, CheckSquare, Download, FileText, Folder, FolderPlus, LayoutGrid, LoaderCircle, MoreHorizontal, Pencil, PanelLeftClose, PanelLeftOpen, Play, Plus, Search, SlidersHorizontal, Trash2, Video, X, SquareDashed, RotateCcw, ChevronDown } from "lucide-react";
import { CodexAgentPanel, type AgentTargetInfo } from "./codex-agent-panel";
import { syncStudioDirectory, archiveStudioVideo, archiveStudioProject, openStudioDirectory, moveStudioVideos, saveStudioVideoShortcuts } from "@/services/api/video-studio-files";
import { useRouter,useSearchParams } from "next/navigation";
import { nanoid } from "nanoid";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";
import { useShallow } from "zustand/react/shallow";
import {useWorkbenchLayoutStore} from "@/stores/use-workbench-layout-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { studioVideoNumber, studioFileError, descendantFolderIds, folderTrail, inStudioScope, placementFor, REVIEW_OPTIONS, type ReviewState, type StudioFolder, type StudioVideoGroup } from "../studio-model";
import {groupNeedsPlaceholder,visibleStudioLogs,compareStudioResults,studioResultRank,shortcutScopeIds,isUnreadVideo,studioVideoChannel,isInterpolatedVideoLog,projectUsedModels} from '../studio-results';
import type { GenerationLog } from "../page";
import { VideoGallery, StudioTile } from "./video-gallery";
import { stopActivePreview } from "../hover-playback";
import {PippitCanvasSettings} from "./pippit-canvas-settings";
import {VideoPromptReplace} from "./video-prompt-replace";
import {ProjectPromptSettings} from "./project-prompt-settings";
import {DreaminaCreationMode} from "./dreamina-video-channel";
import {ElementThumbnail} from "./element-asset-card";
import { VideoElements } from "./video-elements";
import {MarkdownFileImport,readMarkdownFile} from "@/components/markdown-file-import";
import {VIDEO_COLORS,videoColorFor,videoColorLabel} from "../video-colors";
import { splitSourceSegments } from "../video-group-parser";

type Props = {
    logs: GenerationLog[]; composer: (onHide:()=>void)=>ReactNode; running: boolean;
    onReset: () => void; onUploadReferences: () => void;
    onPickAsset: () => void; onUseAsset: (asset: Asset) => void;
    onDownload: (video: NonNullable<GenerationLog["video"]>, logId?: string, title?: string) => Promise<boolean>;
    renderDetail: (log: GenerationLog) => ReactNode;
    onLoadGroup:(group:StudioVideoGroup)=>Promise<void>; onEditLog:(log:GenerationLog)=>Promise<void>; onResumeDraft:(log:GenerationLog)=>Promise<void>; onStopLog?:(log:GenerationLog)=>Promise<void>;
    agentParams?: Pick<AgentTargetInfo, "seconds" | "size" | "resolution" | "model">;
    onApplyAgentResult?:(payload:{prompt:string;params?:{seconds?:string;size?:string;resolution?:string;model?:string};autoStart?:boolean})=>void;
};
export function VideoStudio({ logs, composer, running, onReset, onUploadReferences, onPickAsset, onUseAsset, onDownload, renderDetail, onLoadGroup, onEditLog, onResumeDraft, onStopLog, onApplyAgentResult, agentParams }: Props) {
    const studio = useVideoStudioStore(useShallow(({drafts, ...state}) => state));
    const router=useRouter(),locationParams=useSearchParams(),requestedVideo=locationParams.get('video')||'',locatedVideo=useRef('');
    const autoMatch=useWorkbenchLayoutStore(s=>s.autoMatchReferences),setAutoMatch=useWorkbenchLayoutStore(s=>s.setAutoMatchReferences);
    const assets = useAssetStore(s => s.assets);
    const { message,modal } = App.useApp();
    const project = studio.projects.find(p => p.id === studio.activeProjectId) || studio.projects[0];
    const [section, setSection] = useState(studio.views[project.id]?.section === "brief" ? "results" : studio.views[project.id]?.section || "results");
    useEffect(()=>{const show=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.projectId){useVideoStudioStore.getState().selectProject(detail.projectId);setSection('elements');setDetailId('');}};window.addEventListener('workbench:show-asset',show);return()=>window.removeEventListener('workbench:show-asset',show);},[]);
    const [search, setSearch] = useState(studio.views[project.id]?.search ?? "");
    const [channel, setChannel] = useState(studio.views[project.id]?.channel ?? "all");
    const [interpolation, setInterpolation] = useState(studio.views[project.id]?.interpolation ?? "all");
    const [model, setModel] = useState(studio.views[project.id]?.model ?? "all");
    const [sort, setSort] = useState(studio.views[project.id]?.sort ?? "name");
    const [layout, setLayout] = useState(studio.views[project.id]?.layout || "masonry");
    const [columns, setColumns] = useState(studio.views[project.id]?.columns || 4);
    const includeChildren = false;
    const [hideFailed, setHideFailed] = useState(studio.views[project.id]?.hideFailed ?? false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const composerDockRef=useRef<HTMLDivElement>(null),[composerHeight,setComposerHeight]=useState(0);
    const [selected, setSelected] = useState<string[]>(studio.views[project.id]?.selected||[]);
    const [selectionOpen, setSelectionOpen] = useState(false);

    const [page, setPage] = useState(studio.views[project.id]?.page||1);
    const [detailId, setDetailId] = useState("");
    const [naming, setNaming] = useState<"project" | "folder" | "rename" | "">("");
    const [name, setName] = useState("");
    const [sidebar, setSidebar] = useState(studio.views[project.id]?.sidebar ?? true);
    const [sidebarWidth,setSidebarWidth]=useState(Math.max(170,Math.min(420,Number(studio.views[project.id]?.sidebarWidth)||208)));
    const sidebarDrag=useRef<{x:number;width:number}|null>(null);
    const [expanded, setExpanded] = useState<string[]>([]);
    const [composerVisible,setComposerVisible]=useState(studio.views[project.id]?.composerVisible ?? true);
    const [elementsVisited,setElementsVisited]=useState(section==="elements");
    useEffect(()=>{if(section==="elements")setElementsVisited(true);},[section]);
    const [toolbarTarget,setToolbarTarget]=useState<HTMLDivElement|null>(null);
    const [sidebarTarget,setSidebarTarget]=useState<HTMLDivElement|null>(null);
    const [inspectorTarget,setInspectorTarget]=useState<HTMLDivElement|null>(null);
    const currentDraft = useVideoStudioStore(s => s.drafts[project.id]);
    const [importOpen,setImportOpen]=useState(false),[importSource,setImportSource]=useState(""),[importFolder,setImportFolder]=useState("");
    const [importDragging,setImportDragging]=useState(false);
    const parsedGroups=useMemo(()=>splitSourceSegments(importSource),[importSource]);
    const [hiddenColors,setHiddenColors]=useState<string[]>(studio.views[project.id]?.hiddenColors||[]);
    const [colorFilter,setColorFilter]=useState<string[]>(studio.views[project.id]?.colorFilter||[]);
    const [noteTarget,setNoteTarget]=useState<string>(""),[noteDraft,setNoteDraft]=useState("");
    const [agentOpen,setAgentOpen]=useState(Boolean(studio.views[project.id]?.agentOpen));
    const [agentTarget,setAgentTarget]=useState<AgentTargetInfo|null>(null);
    useLayoutEffect(()=>{const dock=composerDockRef.current;if(!dock){setComposerHeight(0);return;}const measure=()=>setComposerHeight(Math.ceil(dock.getBoundingClientRect().height));measure();const observer=new ResizeObserver(measure);observer.observe(dock);return()=>observer.disconnect();},[composerVisible,section]);
    const colorOf=(log:GenerationLog)=>videoColorFor(log.id,studio.groups,studio.placements);
    const labelColor=(ids:string[],color:string)=>{useVideoStudioStore.setState(s=>{const groups=s.groups.filter(g=>g.projectId===project.id&&g.logIds.some(id=>ids.includes(id))&&g.color!==undefined),placements={...s.placements};for(const group of groups)for(const id of group.logIds)if(placements[id]?.color===undefined)placements[id]={...placementFor(s.placements,id),color:group.color};return {placements,groups:s.groups.map(g=>groups.some(group=>group.id===g.id)?{...g,color:undefined}:g)};});studio.place(ids,{color});};
    const deleteVideoGroup=(group:StudioVideoGroup)=>{if(logs.some(log=>group.logIds.includes(log.id)&&log.status==='生成中')){message.info('请等待本组任务完成后再删除');return;}modal.confirm({title:'删除视频组 '+group.number,content:'删除本组占位及分组；已有视频移到回收站，原文件和官网节点保留。',okText:'删除视频组',cancelText:'取消',okButtonProps:{danger:true},onOk:()=>{studio.place(group.logIds,{trashedAt:Date.now()});studio.removeGroup(group.id);}});};
    const colorContent=<div data-video-colors className="w-80 space-y-3"><p className="text-xs text-muted-foreground">下面勾选只控制视频上的颜色圆点，不隐藏视频。按颜色筛选视频请使用下方独立筛选。</p>{[{id:'',name:'未标色',hex:'transparent'},...VIDEO_COLORS].map(c=><div key={c.id} className="flex items-center gap-2"><Checkbox aria-label={'显示颜色 '+(c.name)} checked={!hiddenColors.includes(c.id)} onChange={e=>setHiddenColors(values=>e.target.checked?values.filter(v=>v!==c.id):[...values,c.id])}/><span className="size-3 shrink-0 rounded-full border border-border" style={{background:c.hex}}/>{c.id?<Input size="small" aria-label={'颜色用途 '+c.name} placeholder={c.name} value={project.videoColorLabels?.[c.id]||''} onChange={e=>useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===project.id?{...p,videoColorLabels:{...p.videoColorLabels,[c.id]:e.target.value}}:p)}))}/>:<span>未标色</span>}</div>)}{selected.length>0&&<div className="flex flex-wrap gap-1"><span className="w-full text-xs">为已选 {selected.length} 个视频标色</span>{[{id:'',name:'取消',hex:'transparent'},...VIDEO_COLORS].map(c=><Button size="small" key={c.id} onClick={()=>labelColor(selected,c.id)}>{videoColorLabel(c.id,project.videoColorLabels)}</Button>)}</div>}<Button size="small" onClick={()=>setHiddenColors([])}>显示全部颜色</Button><div className="border-t border-border pt-3"><p className="mb-2 text-xs">按颜色筛选视频（不选时显示全部视频）</p><Select mode="multiple" aria-label="按颜色筛选视频" className="w-full" placeholder="全部颜色的视频" value={colorFilter} onChange={setColorFilter} options={[{value:"",label:"未标色"},...VIDEO_COLORS.map(c=>({value:c.id,label:videoColorLabel(c.id,project.videoColorLabels)}))]}/></div></div>;
    const queue=useMemo(()=>studio.groups.filter(group=>(!colorFilter.length||group.logIds.length>0||colorFilter.includes(group.color||''))&&inStudioScope({projectId:group.projectId,folderId:group.folderId,review:"none"},project,studio.folderId,false)&&(!search||(group.title+" "+group.prompt).toLowerCase().includes(search.toLowerCase()))),[studio.groups,project,studio.folderId,search,colorFilter]);
    const loadImportSource=(text:string)=>{const groups=splitSourceSegments(text);if(!groups.length)throw Error("文件中没有可导入的视频提示词，请检查第三部分和视频编号");setImportSource(groups.map(group=>group.prompt).join("\n\n"));};
    const openImport=()=>{setImportFolder(studio.folderId);setImportSource("");setImportOpen(true);};
    useEffect(() => { setExpanded(keys => [...new Set([...keys, ...folderTrail(project.folders, studio.folderId).map(f => f.id)])]); }, [project.id, studio.folderId]);
    const trash = section === "trash";
    const viewMounted=useRef(false);
    useEffect(() => { if(!viewMounted.current){viewMounted.current=true;return;}setSelected([]); setPage(1); setDetailId(""); setSearch(""); setChannel("all"); setInterpolation("all"); setModel("all"); }, [project.id, studio.folderId, section]);
    const filtersMounted=useRef(false),scrollMounted=useRef(false);
    useEffect(() => { if(!filtersMounted.current){filtersMounted.current=true;return;}setPage(1); }, [search, channel, interpolation, model, sort, hideFailed, includeChildren, layout, colorFilter]);
    useEffect(() => { if(!scrollMounted.current){scrollMounted.current=true;return;}if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [project.id, studio.folderId, section, search, channel, interpolation, model, hideFailed, includeChildren, colorFilter]);
    const projectLogs = useMemo(()=>logs.filter(log => placementFor(studio.placements, log.id).projectId === project.id),[logs,studio.placements,project.id]);
    const displayLogs=useMemo(()=>visibleStudioLogs(projectLogs,studio.groups,studio.placements),[projectLogs,studio.groups,studio.placements]);
    const projectModels = useMemo(() => projectUsedModels(displayLogs, studio.placements, project.id, trash), [displayLogs, studio.placements, project.id, trash]);
    const hasOtherChannel = useMemo(() => displayLogs.some(log => inStudioScope(placementFor(studio.placements, log.id), project, "", trash) && studioVideoChannel(log) === "other"), [displayLogs, studio.placements, project, trash]);
    const activeModel = model !== "all" && projectModels.includes(model) ? model : "all";
    const displayGroups=useMemo(()=>{const ids=new Set(displayLogs.map(log=>log.id));return studio.groups.map(group=>({...group,logIds:group.logIds.filter(id=>ids.has(id))}));},[displayLogs,studio.groups]);
    const stableNumbers=useMemo(()=>new Map(projectLogs.slice().sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).map((log,index)=>[log.id,index+1])),[projectLogs]);
    const counts = (folderId: string) => displayLogs.filter(log => inStudioScope(placementFor(studio.placements, log.id), project, folderId, false)).length + studio.groups.filter(group=>!group.logIds.length&&inStudioScope({projectId:group.projectId,folderId:group.folderId,review:"none"},project,folderId,false)).length;
    const trashCount = projectLogs.filter(log => placementFor(studio.placements, log.id).trashedAt).length;
    const filtered = useMemo(()=>displayLogs.filter(log => inStudioScope(placementFor(studio.placements, log.id), project, trash ? "" : studio.folderId, trash)
        && (includeChildren || trash || !studio.folderId || placementFor(studio.placements,log.id).folderId === studio.folderId)
        && (!colorFilter.length||colorFilter.includes(colorOf(log)))
        && (!hideFailed || log.status !== "失败")
        && (channel === "all" || studioVideoChannel(log) === channel)
        && (interpolation === "all" || (interpolation === "interpolated" ? isInterpolatedVideoLog(log) : !isInterpolatedVideoLog(log)))
        && (!search || `${log.title} ${log.prompt} ${log.model}`.toLowerCase().includes(search.toLowerCase()))
        && (activeModel === "all" || log.model === activeModel))
        .sort((a,b) => compareStudioResults(a,b,sort,displayGroups)),[displayLogs,displayGroups,project,studio.placements,studio.folderId,trash,includeChildren,hideFailed,channel,interpolation,search,activeModel,sort,colorFilter,studio.groups]);
    const [previewOrder,setPreviewOrder]=useState<string[]|null>(null);
    useEffect(()=>setPreviewOrder(null),[project.id,studio.folderId,section]);
    const savedOrder=studio.views[project.id]?.videoOrder;
    const {combined,wrappers}=useMemo(()=>{
        const groupedIds=new Set(queue.flatMap(group=>group.logIds));
        const wrappers=new Map<string,{group:StudioVideoGroup,index:number}>(),combined:GenerationLog[]=[];
        for(const queued of queue){const group=displayGroups.find(g=>g.id===queued.id)||queued,ids=new Set(group.logIds),groupLogs=filtered.filter(log=>ids.has(log.id));for(const [index,log] of (groupLogs.length?groupLogs:groupNeedsPlaceholder(group,displayLogs,hideFailed,studio.placements)&&!trash&&channel==="all"&&interpolation==="all"&&activeModel==="all"?[{id:"group:"+group.id,size:"16:9"} as GenerationLog]:[]).entries()){wrappers.set(log.id,{group,index});combined.push(log);}}
        combined.push(...filtered.filter(log=>!groupedIds.has(log.id)));
        const order:string[]=previewOrder||savedOrder||[];
        combined.sort((a,b)=>previewOrder||sort==="manual"?studioResultRank(a,order,studio.groups)-studioResultRank(b,order,studio.groups):compareStudioResults(a,b,sort,displayGroups));return {combined,wrappers};
    },[queue,filtered,previewOrder,savedOrder,sort,displayGroups,displayLogs,hideFailed,studio.groups,studio.placements,trash,channel,interpolation,activeModel]);
    const commitOrder=(ids:string[])=>{studio.saveView(project.id,{...studio.views[project.id],videoOrder:ids,sort:"manual"});setSort("manual");setPreviewOrder(null);};
    const paginated = layout === "table" || layout === "kanban";
    const visible = paginated ? filtered.slice((page-1)*60,page*60) : filtered;
    const projectCover = assets.find(asset => project.elementIds.includes(asset.id) && asset.kind === "image");
    const elementCount = assets.filter(asset => project.elementIds.includes(asset.id)).length;
    const detail = logs.find(log => log.id === detailId);
    const detailIndex = filtered.findIndex(log=>log.id===detailId);
    const openDetail = (log: GenerationLog) => { stopActivePreview(); studio.place([log.id],{lastViewedAt:Date.now()});setDetailId(log.id); };
    useEffect(()=>{if(!requestedVideo){locatedVideo.current='';return;}if(locatedVideo.current===requestedVideo)return;const log=logs.find(l=>l.id===requestedVideo);if(!log)return;const place=placementFor(studio.placements,log.id);if(project.id!==place.projectId){studio.selectProject(place.projectId);return;}if(studio.folderId!==place.folderId)studio.selectFolder(place.folderId);setSection(place.trashedAt?'trash':'results');setSearch('');setChannel('all');setInterpolation('all');setModel('all');setHideFailed(false);},[requestedVideo,logs,project.id,studio.folderId]);
    useEffect(()=>{if(!requestedVideo||locatedVideo.current===requestedVideo)return;const log=logs.find(l=>l.id===requestedVideo);if(!log)return;const place=placementFor(studio.placements,log.id);if(place.projectId!==project.id||place.folderId!==studio.folderId||section!==(place.trashedAt?'trash':'results')||search||channel!=='all'||interpolation!=='all'||activeModel!=='all'||hideFailed)return;const index=combined.findIndex(l=>l.id===log.id);if(index<0)return;if(paginated&&page!==Math.floor(index/60)+1){setPage(Math.floor(index/60)+1);return;}const timer=requestAnimationFrame(()=>{locatedVideo.current=requestedVideo;setSelected([log.id]);openDetail(log);document.querySelector('[data-sort-key="'+CSS.escape(log.id)+'"]')?.scrollIntoView({block:'center'});});return()=>cancelAnimationFrame(timer);},[requestedVideo,logs,project.id,studio.folderId,section,search,channel,interpolation,activeModel,hideFailed,combined,paginated,page]);
    const stepDetail = (offset: number) => { const next=filtered[detailIndex+offset];if(detailIndex>=0&&next)openDetail(next); };
    useEffect(()=>{
        if(!detailId)return;
        const keyDown=(event:KeyboardEvent)=>{
            const target=event.target as HTMLElement;
            if(target.closest('input,textarea,select,[contenteditable=true],[role=combobox]') || event.altKey || event.ctrlKey || event.metaKey)return;
            if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();stepDetail(event.key==="ArrowLeft"?-1:1);}
        };
        document.addEventListener("keydown",keyDown);return()=>document.removeEventListener("keydown",keyDown);
    },[detailId,detailIndex,filtered]);
    const [diskBusy,setDiskBusy]=useState(false),[diskError,setDiskError]=useState("");
    useEffect(()=>{if(!diskError)return;const timer=setTimeout(()=>setDiskError(""),8000);return()=>clearTimeout(timer);},[diskError]);
    useEffect(()=>setDiskError(""),[project.id,studio.folderId,section]);
    const diskAction=async(action:()=>Promise<void>)=>{if(diskBusy)return;setDiskBusy(true);try{await action();setDiskError("");}catch(error){const text=studioFileError(error);setDiskError(text);message.error(text,5);}finally{setDiskBusy(false);}};
    useEffect(()=>{if(studio.ready&&window.desktopBridge?.videoStudioSync)void syncStudioDirectory(project).catch(error=>setDiskError(studioFileError(error)));},[studio.ready,project.id]);
    const restoreScroll=useRef(studio.views[project.id]?.scrollTop||0);
    useLayoutEffect(()=>{const scroll=scrollRef.current;if(scroll && restoreScroll.current && scroll.scrollHeight>scroll.clientHeight){scroll.scrollTop=restoreScroll.current;restoreScroll.current=0;}},[logs.length,queue.length,section]);
    useEffect(()=>{const view={...studio.views[project.id],hiddenColors,colorFilter,composerVisible,sidebar,sidebarWidth,section,layout,columns,search,channel,interpolation,model:activeModel,sort,includeChildren,hideFailed,selected,page,scrollTop:restoreScroll.current||scrollRef.current?.scrollTop||0};studio.saveView(project.id,view);const scroll=scrollRef.current;return()=>{studio.saveView(project.id,{...view,videoOrder:useVideoStudioStore.getState().views[project.id]?.videoOrder,scrollTop:scroll?.scrollTop||0});};},[hiddenColors,colorFilter,composerVisible,sidebar,sidebarWidth,section,layout,columns,search,channel,interpolation,activeModel,sort,includeChildren,hideFailed,selected,page,project.id]);
    useEffect(()=>{if(!studio.ready||!window.desktopBridge?.videoStudioSync)return;let canceled=false;(async()=>{for(const log of logs.filter(log=>log.video&&placementFor(studio.placements,log.id).projectId===project.id)){if(canceled)return;await archiveStudioVideo(log);}})().catch(error=>{if(!canceled)setDiskError("视频归档尚未完成："+studioFileError(error));});return()=>{canceled=true;};},[studio.ready,project.id,logs]);
    const openStorage=async(folderId:string)=>{await openStudioDirectory(project,folderId);};
    const deleteFolder=async(id:string)=>{await archiveStudioProject(project,logs);const removed=descendantFolderIds(project.folders,id);await syncStudioDirectory({...project,folders:project.folders.filter(f=>!removed.has(f.id))},true);studio.deleteFolder(id,project.id);message.success("本地文件夹已删除，视频和队列已移到全部视频");};
    const saveShortcuts=async(ids:string[])=>{const result=await saveStudioVideoShortcuts(project,logs,ids);if(!result.canceled)message.success("已建立 "+result.created+" 个快捷方式"+(result.existing?"，已有 "+result.existing+" 个":""));};
    const saveScopeShortcuts=(folderId:string)=>saveShortcuts(shortcutScopeIds(projectLogs,project,folderId,studio.placements));
    const treeNodes = (parentId: string): TreeDataNode[] => project.folders.filter(f => f.parentId === parentId).map(f => ({ key:f.id, title:<Dropdown trigger={["contextMenu"]} menu={{items:[{key:"open",label:"打开本地文件夹"},{key:"shortcuts",label:"保存此文件夹全部视频快捷方式…",disabled:diskBusy},{key:"delete",label:"删除文件夹",danger:true,disabled:running||diskBusy}],onClick:({key})=>{void diskAction(()=>key==="open"?openStorage(f.id):key==="shortcuts"?saveScopeShortcuts(f.id):deleteFolder(f.id));}}}><span data-studio-folder={f.id} title="按住拖动可调整同级顺序；右键管理文件夹" className="flex items-center gap-2"><Folder className="size-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs opacity-50">{counts(f.id)}</span><Button size="small" type="text" aria-label={"重命名文件夹 "+f.name} title="重命名文件夹" icon={<Pencil className="size-3"/>} onClick={event=>{event.stopPropagation();studio.selectFolder(f.id);setName(f.name);setNaming("rename");}}/></span></Dropdown>, children:treeNodes(f.id) }));
    const move = (folderId: string) => {const ids=[...selected];void diskAction(async()=>{await moveStudioVideos(project,logs,ids,folderId);setSelected([]);message.success("视频和本地文件已移动到所选文件夹");});};
    const toggle = (id: string, checked: boolean) => setSelected(ids => checked ? [...new Set([...ids,id])] : ids.filter(value=>value!==id));
    const selectPage = (checked: boolean) => setSelected(ids => checked ? [...new Set([...ids,...visible.map(log=>log.id)])] : ids.filter(id=>!visible.some(log=>log.id===id)));
    const clearFilters = () => { setSearch("");setChannel("all");setInterpolation("all");setModel("all");setHideFailed(false); };
    const openNaming = (kind: typeof naming) => { setName(kind === "rename" ? project.folders.find(f=>f.id===studio.folderId)?.name || project.name : "");setNaming(kind); };
    const nameSubmit = () => { if(!name.trim())return;void diskAction(async()=>{
        if(naming==="project"){const created={id:nanoid(),name:name.trim(),brief:"",folders:[],elementIds:[]};await syncStudioDirectory(created);useVideoStudioStore.setState(s=>({projects:[...s.projects,created],activeProjectId:created.id,folderId:""}));router.push("/video?project="+created.id);setSection("results");}
        else if(naming==="folder"){const folder={id:nanoid(),name:name.trim(),parentId:studio.folderId};await syncStudioDirectory({...project,folders:[...project.folders,folder]},true);useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===project.id?{...p,folders:[...p.folders,folder]}:p),folderId:s.activeProjectId===project.id?folder.id:s.folderId,selectedFolders:{...s.selectedFolders,[project.id]:folder.id}}));}
        else if(studio.folderId){await syncStudioDirectory({...project,folders:project.folders.map(f=>f.id===studio.folderId?{...f,name:name.trim()}:f)},true);studio.renameFolder(studio.folderId,name,project.id);}
        else {await syncStudioDirectory({...project,name:name.trim()},true);studio.editProject({name:name.trim()},project.id);}setNaming("");
    });};
    const download = async (log: GenerationLog) => { if (log.video && await onDownload(log.video, log.id, log.title)) studio.place([log.id], { downloadedAt: Date.now() }); };
    const sendToAgent = (log: GenerationLog, group?: StudioVideoGroup, empty = false) => {
        const num = studioVideoNumber(log, stableNumbers.get(log.id) || 1, group || displayGroups.find(g => g.logIds.includes(log.id)));
        const title = num ? `视频 ${num}` : log.title || "当前视频";
        const promptText = empty && group ? group.prompt : log.prompt;
        studio.selectFolder(empty && group ? group.folderId : placementFor(studio.placements, log.id).folderId);
        void (empty && group ? onLoadGroup(group) : onEditLog(log));
        setAgentTarget({ id: log.id, title, prompt: promptText, seconds: log.seconds, size: log.size, resolution: log.resolution, model: log.model });
        setDetailId("");
        setAgentOpen(true);
    };
    useEffect(() => {
        const onSend = (event: Event) => {
            const logId = (event as CustomEvent).detail?.logId;
            if (!logId) return;
            const log = logs.find(l => l.id === logId);
            if (!log) return;
            const group = displayGroups.find(g => g.logIds.includes(log.id));
            sendToAgent(log, group, false);
        };
        window.addEventListener("xiaoxiao:send-to-agent", onSend);
        return () => window.removeEventListener("xiaoxiao:send-to-agent", onSend);
    }, [logs, displayGroups, studio.placements]);
    const card = (log: GenerationLog) => {
        const wrap=wrappers.get(log.id),group=wrap?.group,empty=log.id.startsWith("group:");
        const edit=()=>{studio.selectFolder(empty&&group?group.folderId:placementFor(studio.placements,log.id).folderId);void (empty&&group?onLoadGroup(group):onEditLog(log));};
        return <StudioTile key={log.id} log={log} agentLinked={agentDock==="open"&&Boolean(effectiveAgentTarget.id)&&(log.id===effectiveAgentTarget.id||group?.id===effectiveAgentTarget.id)} flash={flashId===log.id} unread={isUnreadVideo(log,placementFor(studio.placements,log.id))} number={studioVideoNumber(log,stableNumbers.get(log.id)||1,group||displayGroups.find(g=>g.logIds.includes(log.id)))} groupNumber={group?.number} empty={empty} onEdit={edit} onSendToAgent={()=>sendToAgent(log,group,empty)} color={hiddenColors.includes(empty?group?.color||"":colorOf(log))?"":empty?group?.color||"":colorOf(log)} note={studio.placements[log.id]?.note} onNote={()=>{setNoteTarget(log.id);setNoteDraft(studio.placements[log.id]?.note||"");}} colorLabels={project.videoColorLabels} onColor={color=>{if(group&&empty)useVideoStudioStore.setState(s=>({groups:s.groups.map(g=>g.id===group.id?{...g,color}:g)}));else labelColor([log.id],color);}} onOpenFolder={()=>void diskAction(async()=>{if(log.video)await archiveStudioVideo(log);await openStorage(empty&&group?group.folderId:placementFor(studio.placements,log.id).folderId);})} onHide={group?()=>deleteVideoGroup(group):undefined} onResume={Boolean(log.interruptedAt)||["失败","待核对"].includes(log.status)&&log.task?.id.startsWith("dreamina-canvas:")?()=>void onResumeDraft(log):undefined} onStop={!empty&&!log.interruptedAt&&["生成中","待核对"].includes(log.status)&&onStopLog?()=>void onStopLog(log):undefined} onWrap={empty||studio.groups.some(g=>g.logIds.includes(log.id))?undefined:()=>studio.wrapVideo(log)} compact={!paginated} selected={selected.includes(log.id)} review={placementFor(studio.placements,log.id).review} liked={placementFor(studio.placements,log.id).liked} onLike={()=>studio.place([log.id],{liked:!placementFor(studio.placements,log.id).liked})} onSelect={checked=>toggle(log.id,checked)} onOpen={()=>openDetail(log)} onSaveShortcut={log.video?()=>void diskAction(()=>saveShortcuts([log.id])):undefined} onDownload={()=>void download(log)} />;
    };
    const channelOptions=[{value:"all",label:"全部"},{value:"dreamina",label:"即梦"},{value:"oiioii",label:"Oii"},{value:"pippit",label:"小云雀"},...(hasOtherChannel||channel==="other"?[{value:"other",label:"其他渠道"}]:[])];
    const filterContent = <div data-video-filter-panel className="grid w-64 gap-3"><label>生成渠道<Select aria-label="筛选生成渠道" className="w-full" value={channel} onChange={setChannel} options={channelOptions}/></label><label>补帧状态<Select aria-label="筛选补帧状态" className="w-full" value={interpolation} onChange={setInterpolation} options={[{value:"all",label:"全部"},{value:"interpolated",label:"已补帧"},{value:"uninterpolated",label:"未补帧"}]}/></label><label>模型<Select aria-label="筛选生成模型" className="w-full" value={activeModel} onChange={setModel} options={[{value:"all",label:"全部"},...projectModels.map(value=>({value,label:value}))]}/></label><label>排序<Select aria-label="结果排序" className="w-full" value={sort} onChange={setSort} options={[{value:"newest",label:"最新生成"},{value:"oldest",label:"最早生成"},{value:"name",label:"名称（编号顺序）"},{value:"manual",label:"手动拖拽顺序"}]}/></label><label className="flex justify-between">隐藏失败<Switch aria-label="隐藏失败的视频" checked={hideFailed} onChange={setHideFailed}/></label><Button onClick={clearFilters}>清除筛选</Button></div>;
    const selectionContent = <div data-video-selection className="flex max-w-[min(560px,85vw)] flex-wrap items-center gap-2 p-1 text-xs"><div className="mb-2 w-full"><VideoPromptReplace search={search} onSearch={setSearch} disabled={trash}/></div><Checkbox aria-label="本页视频全选" checked={Boolean(visible.length)&&visible.every(log=>selected.includes(log.id))} onChange={e=>selectPage(e.target.checked)}>{paginated?"本页全选":"全选筛选结果"}</Checkbox><span className="text-muted-foreground">已选 {selected.length}</span>{selected.length>0&&<>{trash?<Button size="small" onClick={()=>{studio.place(selected,{trashedAt:undefined});setSelected([]);}}>恢复视频</Button>:<><Select aria-label="批量审片状态" placeholder="标记审片状态" className="w-32" value={undefined} options={REVIEW_OPTIONS} onChange={value=>studio.place(selected,{review:value})}/><Select aria-label="移动视频到文件夹" placeholder="移动到…" className="w-40" value={undefined} options={[{value:"",label:"项目根目录"},...project.folders.map(f=>({value:f.id,label:folderTrail(project.folders,f.id).map(v=>v.name).join(" / ")}))]} onChange={move}/><Button size="small" icon={<Download className="size-3.5"/>} onClick={()=>{const files=logs.filter(log=>selected.includes(log.id)&&log.video);files.forEach(log=>void download(log));if(!files.length)message.warning("所选任务还没有可下载的视频");}}>下载所选</Button><Button size="small" disabled={diskBusy} onClick={()=>void diskAction(async()=>{await saveShortcuts([...selected]);})}>保存视频快捷方式…</Button><Button size="small" danger icon={<Trash2 className="size-3.5"/>} onClick={()=>{studio.place(selected,{trashedAt:Date.now()});setSelected([]);}}>移到回收站</Button></>}<Button size="small" type="text" onClick={()=>setSelected([])}>取消选择</Button></>}</div>;
    const viewContent = <div className="grid w-60 gap-3"><Button icon={<SquareDashed className="size-4"/>} disabled={!filtered.length} onClick={()=>{for(const log of filtered)studio.wrapVideo(log);message.success("已添加或恢复视频编号块");}}>恢复当前视频编号块</Button>{studio.removedGroups.filter(g=>g.projectId===project.id).map(g=><Button key={g.id} icon={<RotateCcw className="size-4"/>} onClick={()=>studio.restoreGroup(g.id)}>{"恢复 "+g.title}</Button>)}<label>布局<Select aria-label="视频结果布局" className="w-full" value={layout} onChange={setLayout} options={[{value:"grid",label:"方形网格"},{value:"masonry",label:"原比例瀑布流"},{value:"kanban",label:"审片看板"},{value:"table",label:"表格"}]}/></label><label>卡片密度 · 每行约 {columns} 张<Slider aria-label="视频卡片大小" min={1} max={8} value={columns} onChange={setColumns}/></label></div>;
    const draftRefChips = useMemo(() => {
        const imgs = Array.isArray(currentDraft?.references) ? currentDraft.references : [];
        const auds = Array.isArray(currentDraft?.audioReferences) ? currentDraft.audioReferences : [];
        const vids = Array.isArray(currentDraft?.videoReferences) ? currentDraft.videoReferences : [];
        return [
            ...imgs.map((r: any, i: number) => ({ key: `img-${r.id || i}`, label: r.name || "参考图", badge: "图" })),
            ...auds.map((a: any, i: number) => ({ key: `aud-${a.id || i}`, label: a.name || "配音", badge: "音" })),
            ...vids.map((v: any, i: number) => ({ key: `vid-${v.id || i}`, label: v.name || "视频", badge: "视" })),
        ];
    }, [currentDraft]);
    const draftSnippet = typeof currentDraft?.prompt === "string" ? currentDraft.prompt.replace(/\s+/g, " ").trim() : "";
    const loadedDraftGroup = studio.groups.find(g => g.id === currentDraft?.loadedGroup);
    const effectiveAgentTarget: AgentTargetInfo = {
        id: currentDraft?.loadedGroup || agentTarget?.id,
        title: loadedDraftGroup ? `视频 ${loadedDraftGroup.number}` : agentTarget?.title || "当前提示词台",
        prompt: typeof currentDraft?.prompt === "string" ? currentDraft.prompt : agentTarget?.prompt || "",
        seconds: agentParams?.seconds ?? agentTarget?.seconds,
        size: agentParams?.size ?? agentTarget?.size,
        resolution: agentParams?.resolution ?? agentTarget?.resolution,
        model: agentParams?.model ?? agentTarget?.model,
    };
    // Agent 侧栏与视频台衔接：打开时侧栏滑入，收起时先停止思考并滑出再卸载；视频区随宽度变化柔和过渡。
    const agentVisible = agentOpen && (section === "results" || trash);
    const [agentDock, setAgentDock] = useState<"open" | "closing" | "closed">(agentVisible ? "open" : "closed");
    useEffect(() => { setAgentDock(state => (agentVisible ? "open" : state === "open" ? "closing" : state)); }, [agentVisible]);
    useEffect(() => {
        if (agentDock !== "closing") return;
        const timer = setTimeout(() => setAgentDock(state => (state === "closing" ? "closed" : state)), 180);
        return () => clearTimeout(timer);
    }, [agentDock]);
    const dockSettled = useRef(false);
    useEffect(() => {
        if (!dockSettled.current) { dockSettled.current = true; return; }
        const el = scrollRef.current;
        if (agentDock === "closing" || !el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        el.animate([{ opacity: 0.6, transform: `translateX(${agentDock === "open" ? -10 : 10}px)` }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
    }, [agentDock]);
    const [agentLocate, setAgentLocate] = useState<{ id: string; nonce: number } | undefined>();
    const [flashId, setFlashId] = useState("");
    useEffect(() => { if (!flashId) return; const timer = setTimeout(() => setFlashId(""), 1600); return () => clearTimeout(timer); }, [flashId]);
    const locateAgentTarget = () => {
        const id = effectiveAgentTarget.id;
        const log = paginated ? undefined : combined.find(item => item.id === id || wrappers.get(item.id)?.group.id === id);
        if (!log) { message.info("该视频不在当前目录、筛选结果或视图中"); return; }
        setAgentLocate({ id: log.id, nonce: Date.now() });
        setFlashId(log.id);
    };
    const [composerPulse, setComposerPulse] = useState(0);
    useEffect(() => { if (!composerPulse) return; const timer = setTimeout(() => setComposerPulse(0), 1400); return () => clearTimeout(timer); }, [composerPulse]);

    return <div data-video-studio className="flex h-full min-h-0 bg-background text-foreground">
        <aside aria-label="视频项目导航" data-sidebar-collapsed={!sidebar} style={{width:sidebar?sidebarWidth:56}} className="relative flex shrink-0 flex-col border-r border-border bg-card/50">{!sidebar&&<Button type="text" aria-label={sidebar?"收起项目栏":"展开项目栏"} title={sidebar?"收起项目栏":"展开项目栏"} className="!mx-2 !my-1 !self-start" icon={sidebar?<PanelLeftClose className="size-4"/>:<PanelLeftOpen className="size-4"/>} onClick={()=>setSidebar(!sidebar)}/>} {sidebar?<><div data-expanded-project-nav className="flex min-h-0 flex-1 flex-col">
            <div className="project-nav-top">
                <div className="project-section-switch" role="tablist" aria-label="项目内容"><button type="button" role="tab" aria-label="项目视频" aria-selected={section!=="elements"} onClick={()=>setSection("results")}>视频 <span>{counts("")}</span></button><button type="button" role="tab" aria-label="项目素材" aria-selected={section==="elements"} onClick={()=>setSection("elements")}>资产 <span>{elementCount}</span></button></div>
            </div>
            <div ref={setSidebarTarget} data-asset-sidebar hidden={section!=="elements"} className="min-h-0 flex-1 overflow-auto"/>
            <div hidden={section==="elements"} className="min-h-0 flex-1 flex-col" style={{display:section==="elements"?"none":"flex"}}>
            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground"><span>剧集目录</span><Button size="small" type="text" title="添加文件夹" disabled={!studio.ready} icon={<FolderPlus className="size-4"/>} onClick={()=>openNaming("folder")}/></div>
            <div className="min-h-0 flex-1 overflow-auto px-2"><Dropdown trigger={["contextMenu"]} menu={{items:[{key:"shortcuts",label:"保存全部视频快捷方式…",disabled:diskBusy}],onClick:()=>void diskAction(()=>saveScopeShortcuts(""))}}><div><StudioNav active={section==="results"&&!studio.folderId} onClick={()=>{studio.selectFolder("");setSection("results");}} icon={<LayoutGrid className="size-4"/>}><span className="flex-1">全部视频</span><span className="text-xs opacity-50">{counts("")}</span></StudioNav></div></Dropdown><Tree blockNode draggable={running?false:{icon:false}} allowDrop={({dragNode,dropNode,dropPosition})=>dropPosition!==0&&project.folders.find(f=>f.id===String(dragNode.key))?.parentId===project.folders.find(f=>f.id===String(dropNode.key))?.parentId} onDrop={info=>{if(!info.dropToGap)return;const position=info.dropPosition-Number(info.node.pos.split("-").at(-1));studio.reorderFolder(String(info.dragNode.key),String(info.node.key),position>0);}} expandedKeys={expanded} onExpand={keys=>setExpanded(keys.map(String))} selectedKeys={section==="results"?[studio.folderId]:[]} treeData={treeNodes("")} onSelect={keys=>{if(keys.length){studio.selectFolder(String(keys[0]));setSection("results");}}}/></div>
            </div>
            <div className="border-t border-border p-2"><StudioNav active={trash} onClick={()=>setSection("trash")} icon={<Trash2 className="size-4"/>}><span className="flex-1">回收站</span><span>{trashCount}</span></StudioNav><p className="px-3 pt-1.5 text-xs text-muted-foreground">本地归档已实时同步</p></div>
        </div></>:<><div className="flex flex-col items-center gap-1 py-2"><Tooltip title="项目管理" placement="right"><Button type="text" aria-label="项目管理" icon={<ArrowLeft className="size-4"/>} onClick={()=>router.push("/projects")}/></Tooltip>{[{label:"Elements 素材",icon:<AtSign className="size-4"/>,action:()=>setSection("elements")},{label:"全部视频",icon:<LayoutGrid className="size-4"/>,action:()=>{studio.selectFolder("");setSection("results");}},{label:"添加文件夹",icon:<FolderPlus className="size-4"/>,action:()=>openNaming("folder")}].map(item=><Tooltip key={item.label} title={item.label} placement="right"><Button type="text" aria-label={item.label} icon={item.icon} onClick={item.action}/></Tooltip>)}</div><div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-auto py-1">{project.folders.map(folder=><Tooltip key={folder.id} title={folderTrail(project.folders,folder.id).map(f=>f.name).join(" / ")} placement="right"><Button aria-label={"打开文件夹 "+folder.name} type={section==="results"&&studio.folderId===folder.id?"primary":"text"} icon={<Folder className="size-4"/>} onClick={()=>{studio.selectFolder(folder.id);setSection("results");}}/></Tooltip>)}</div><Tooltip title={"回收站 "+trashCount} placement="right"><Button className="!mx-2 !my-2" aria-label="回收站" type={trash?"primary":"text"} icon={<Trash2 className="size-4"/>} onClick={()=>setSection("trash")}/></Tooltip></>}
        <div data-project-resizer role="separator" aria-label="调整项目栏宽度" aria-orientation="vertical" aria-valuemin={56} aria-valuemax={420} aria-valuenow={sidebar?sidebarWidth:56} tabIndex={0} title="拖动调整宽度，向左压缩可收起；双击收起或展开" onDoubleClick={()=>setSidebar(!sidebar)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();setSidebar(!sidebar);}else if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();const width=(sidebar?sidebarWidth:56)+(event.key==="ArrowRight"?20:-20);if(!sidebar&&event.key==="ArrowRight")setSidebar(true);else if(width<=150)setSidebar(false);else {setSidebar(true);setSidebarWidth(Math.max(170,Math.min(420,width)));}}}} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);sidebarDrag.current={x:event.clientX,width:sidebar?sidebarWidth:56};}} onPointerMove={event=>{const drag=sidebarDrag.current;if(!drag)return;const width=drag.width+event.clientX-drag.x;if(width<=130)setSidebar(false);else {setSidebar(true);setSidebarWidth(Math.max(170,Math.min(420,width)));}}} onPointerUp={event=>{sidebarDrag.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{sidebarDrag.current=null;}} onLostPointerCapture={()=>{sidebarDrag.current=null;}}/>
        </aside>
        <PippitCanvasSettings logs={projectLogs} hideTrigger/><main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <header data-elements-header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3 py-2" hidden={section!=="elements"} style={section!=="elements"?{display:"none"}:undefined}><Button size="small" type="text" aria-label={sidebar?"收起项目栏":"展开项目栏"} title={sidebar?"收起项目栏":"展开项目栏"} icon={sidebar?<PanelLeftClose className="size-4"/>:<PanelLeftOpen className="size-4"/>} onClick={()=>setSidebar(!sidebar)}/><span className="shrink-0 text-xs text-muted-foreground"><strong className="text-foreground">资产</strong> <span>{elementCount}</span></span><div ref={setToolbarTarget} className="flex min-w-0 flex-1"/></header>
            <header data-video-toolbar style={section==="elements"?{display:"none"}:undefined} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><div className="flex min-w-0 items-center gap-2"><Button type="text" size="small" aria-label={sidebar?"收起项目栏":"展开项目栏"} title={sidebar?"收起项目栏":"展开项目栏"} onClick={()=>setSidebar(!sidebar)} icon={sidebar?<PanelLeftClose className="size-4"/>:<PanelLeftOpen className="size-4"/>}/><button type="button" className="text-sm font-semibold" onClick={()=>{studio.selectFolder("");setSection("results");}}>全部视频</button>{section==="results"&&folderTrail(project.folders,studio.folderId).map(folder=><span key={folder.id} className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">/</span><button type="button" onClick={()=>studio.selectFolder(folder.id)}>{folder.name}</button></span>)}<Tag>{section==="elements"?elementCount:filtered.length}</Tag></div><div className="ml-auto flex flex-wrap gap-2" data-toolbar-actions><div data-toolbar-group="create" className="flex flex-wrap items-center gap-2">{(section==="results"||trash)&&<Button data-agent-toggle aria-label="Agent 创作助手" aria-pressed={agentOpen} type={agentOpen?"primary":"default"} icon={<Bot className="size-4"/>} title="打开 Codex Agent 提示词修改助手" onClick={()=>setAgentOpen(v=>!v)}>Agent</Button>}{(section==="results"||trash)&&<DreaminaCreationMode/>}{(section==="results"||trash)&&<Button data-auto-match-toggle aria-label="自动匹配" aria-pressed={autoMatch} disabled={running} type={autoMatch?"primary":"default"} title="载入视频组、粘贴和创作时自动匹配本组素材" onClick={()=>setAutoMatch(!autoMatch)}>自动匹配 · {autoMatch?"开":"关"}</Button>}</div><div data-toolbar-group="view" className="flex flex-wrap items-center gap-2">{(section==="results"||trash)&&<Popover trigger="click" placement="bottomRight" open={selectionOpen} onOpenChange={setSelectionOpen} content={selectionContent}><Button aria-label="视频选择操作" aria-expanded={selectionOpen} title={selected.length?"已选 "+selected.length+" 个视频":"选择视频"} type={selected.length?"primary":"default"} icon={<CheckSquare className="size-4"/>}>{selected.length||null}</Button></Popover>}{section!=="brief"&&section!=="elements"&&<><Popover trigger="click" content={colorContent}><Button aria-label="视频颜色分组">颜色分组</Button></Popover><Popover trigger="click" content={filterContent}><Button icon={<SlidersHorizontal className="size-4"/>}>筛选</Button></Popover><Popover trigger="click" content={viewContent}><Button icon={<LayoutGrid className="size-4"/>}>视图</Button></Popover><ProjectPromptSettings key={project.id}/><Button icon={<FileText className="size-4"/>} disabled={!studio.ready} onClick={openImport}>导入视频组</Button></>}</div></div></header>
            {!studio.ready && <p role="status" className="px-4 py-2 text-sm">正在读取本地视频项目…</p>}

            {diskError&&<p role="alert" className="flex gap-2 px-4 py-2 text-xs text-destructive">本地文件：{diskError}<button className="underline" onClick={()=>void diskAction(()=>archiveStudioProject(project,logs))}>重试保存视频</button><button aria-label="关闭本地文件错误提示" className="ml-auto" onClick={()=>setDiskError("")}><X className="size-4"/></button></p>}

            <div className="flex min-h-0 min-w-0 flex-1">
                {agentDock !== "closed" && (
                    <CodexAgentPanel
                        projectId={project.id}
                        projectName={project.name}
                        globalPrompt={project.globalPrompt?.enabled ? project.globalPrompt.text : ""}
                        projectAssets={assets.filter(a => project.elementIds.includes(a.id))}
                        elementRules={project.elementRules}
                        target={effectiveAgentTarget}
                        closing={agentDock === "closing"}
                        onLocateTarget={locateAgentTarget}
                        onApplyResult={payload => {
                            setComposerVisible(true);
                            onApplyAgentResult?.(payload);
                            setComposerPulse(Date.now());
                        }}
                        onClose={() => setAgentOpen(false)}
                    />
                )}
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    <div ref={scrollRef} data-video-results-scroll style={{paddingBottom:section==="results"||section==="elements"?composerHeight+24:undefined}} className={`min-h-0 flex-1 overflow-auto ${section === "results" ? "p-1" : trash ? "p-1" : "p-3"}`}>
                        {section==="results"&&!paginated&&combined.length>0&&<section data-video-group-queue className="p-2"><VideoGallery key={project.id+":"+studio.folderId} logs={combined} columns={columns} square={layout==="grid"} scrollRef={scrollRef} onPreviewOrder={setPreviewOrder} onCommitOrder={commitOrder} renderTile={card} locate={agentLocate}/></section>}
                        {(elementsVisited||section==="elements")&&<div hidden={section!=="elements"} style={section!=="elements"?{display:"none"}:undefined}><VideoElements key={project.id} active={section==="elements"} search={search} onSearch={setSearch} toolbarTarget={toolbarTarget} sidebarTarget={sidebarTarget} inspectorTarget={inspectorTarget} onUseAsset={asset=>{setComposerVisible(true);onUseAsset(asset);}}/></div>}
                        {section==="elements"?null:filtered.length?<>
                            {layout==="table"?<Table size="small" rowKey="id" pagination={false} dataSource={visible} rowSelection={{selectedRowKeys:selected,onChange:keys=>setSelected(keys.map(String))}} columns={[{title:"视频",dataIndex:"title",render:(title:string,log:GenerationLog)=><Button type="link" onClick={()=>openDetail(log)}>{title||"未命名视频"}</Button>},{title:"模型",dataIndex:"model"},{title:"生成状态",dataIndex:"status"},{title:"审片",render:(_:unknown,log:GenerationLog)=>REVIEW_OPTIONS.find(o=>o.value===placementFor(studio.placements,log.id).review)?.label},{title:"时长",dataIndex:"seconds",render:(value:string)=>`${value}s`},{title:"创建时间",dataIndex:"createdAt",render:(value:number)=>new Date(value).toLocaleString("zh-CN")}]}/>:layout==="kanban"?<div className="flex gap-3 overflow-auto">{REVIEW_OPTIONS.map(option=><section key={option.value} className="w-64 shrink-0"><h2 className="mb-3 flex justify-between text-sm font-medium">{option.label}<span className="text-muted-foreground">{filtered.filter(log=>placementFor(studio.placements,log.id).review===option.value).length}</span></h2><div className="space-y-3">{visible.filter(log=>placementFor(studio.placements,log.id).review===option.value).map(card)}</div></section>)}</div>:section==="results"?null:<VideoGallery logs={filtered} columns={columns} square={layout==="grid"} scrollRef={scrollRef} renderTile={card}/> }
                            {paginated&&filtered.length>60&&<Pagination className="mt-5" pageSize={60} current={page} total={filtered.length} onChange={setPage} showSizeChanger={false}/>}</>:queue.length&&section==="results"?null:<div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center"><Folder className="size-10 text-muted-foreground/50"/><h2 className="text-lg font-semibold">{trash?"回收站为空":search||channel!=="all"||interpolation!=="all"||activeModel!=="all"||colorFilter.length>0?"没有符合筛选条件的视频":"这里还没有视频"}</h2><p className="text-sm text-muted-foreground">{trash?"移入回收站的视频可以恢复": "在下方输入提示词并生成，视频将自动保存到当前项目和文件夹"}</p></div>}
                    </div>
                    {(section==="results"||section==="elements")&&composerVisible&&<div ref={composerDockRef} data-composer-floating data-agent-pulse={composerPulse?"on":undefined} className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center [&>*]:pointer-events-auto">{composer(()=>setComposerVisible(false))}</div>}
                    {(section==="results"||section==="elements")&&!composerVisible&&(
                        <footer ref={composerDockRef} data-composer-collapsed data-composer-mini-dock className="wb-mini-composer-dock">
                            <button
                                type="button"
                                aria-label="展开提示词区域"
                                title="点击展开提示词台"
                                onClick={() => setComposerVisible(true)}
                                className="wb-mini-dock-prompt-bar"
                            >
                                <span className="truncate">
                                    {draftSnippet || <span className="text-muted-foreground">输入提示词生成视频…</span>}
                                </span>
                            </button>
                        </footer>
                    )}
                </div>
                <div ref={setInspectorTarget} data-inspector-host hidden={section!=="elements"} style={section!=="elements"?{display:"none"}:undefined} className="shrink-0" />
            </div>
        </main>
        <Modal title="视频备注" open={Boolean(noteTarget)} onCancel={()=>setNoteTarget("")} onOk={()=>{studio.place([noteTarget],{note:noteDraft.trim()});setNoteTarget("");}} okText="保存备注" cancelText="取消"><Input.TextArea aria-label="视频备注内容" rows={4} value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="备注仅保存在这条视频，不影响其他版本"/></Modal>
        <Modal title={naming==="project"?"新建视频项目":naming==="folder"?"添加文件夹":"重命名"} open={Boolean(naming)} onCancel={()=>setNaming("")} onOk={nameSubmit} confirmLoading={diskBusy} okButtonProps={{disabled:!name.trim()}} okText="保存" cancelText="取消"><Input aria-label="项目或文件夹名称" value={name} onChange={e=>setName(e.target.value)} onPressEnter={nameSubmit} placeholder={naming==="folder"?"例如：第一集 / 场景一 / 镜头 1-1":"项目名称"}/>{naming==="folder"&&<p className="mt-2 text-xs text-muted-foreground">创建在 {folderTrail(project.folders,studio.folderId).map(f=>f.name).join(" / ")||"项目根目录"} 下</p>}</Modal>
        <Modal title="导入视频组" open={importOpen} onCancel={()=>setImportOpen(false)} onOk={()=>{try{const count=studio.importGroups(parsedGroups,importFolder);setImportOpen(false);studio.selectFolder(importFolder);setSection("results");message.success("已导入 "+count+" 组"+(count<parsedGroups.length?"，相同正文已跳过":""));}catch(error){message.error(error instanceof Error?error.message:"导入失败");}}} okText={"导入 "+parsedGroups.length+" 组"} okButtonProps={{disabled:!parsedGroups.length||!studio.ready}} cancelText="取消" width={760}>
            <label className="mb-3 block">保存到文件夹<Select aria-label="视频组导入目标文件夹" className="mt-1 w-full" value={importFolder} onChange={setImportFolder} options={[{value:"",label:"项目根目录"},...project.folders.map(folder=>({value:folder.id,label:folderTrail(project.folders,folder.id).map(f=>f.name).join(" / ")}))]}/></label>
            <div className="mb-3 flex items-center gap-3"><MarkdownFileImport onImport={loadImportSource}/><span className="text-xs text-muted-foreground">整稿只导入第三部分的提示词正文，忽略末尾确认事项。</span></div>
            <div data-md-drop-zone className={importDragging?"rounded-lg ring-2 ring-primary":""} onDragOver={event=>{if(event.dataTransfer.types.includes("Files")){event.preventDefault();event.stopPropagation();setImportDragging(true);}}} onDragLeave={()=>setImportDragging(false)} onDrop={async event=>{if(!event.dataTransfer.files.length)return;event.preventDefault();event.stopPropagation();setImportDragging(false);const files=Array.from(event.dataTransfer.files);try{if(files.length!==1)throw Error("每次请拖入一个 MD 文件");loadImportSource(await readMarkdownFile(files[0]));message.success("已读取 "+files[0].name);}catch(error){message.error(error instanceof Error?error.message:"读取 MD 文件失败");}}}>
            <Input.TextArea aria-label="粘贴视频组总稿" value={importSource} onChange={event=>setImportSource(event.target.value)} rows={12} placeholder="拖入 MD 文件，或粘贴多组完整提示词，使用【视频编号25｜第25组…】、【视频编号V01｜…】或 视频编号25 分组；支持 Markdown 代码块。"/>
            </div>
            <p className="mt-3 text-sm">{parsedGroups.length?"识别到 "+parsedGroups.length+" 组："+parsedGroups.map(group=>group.id).join("、"):"等待粘贴带视频编号的整稿"}</p>
        </Modal>
        <Modal title={detail?.title||"视频详情"} open={Boolean(detail)} onCancel={()=>setDetailId("")} footer={null} width="min(1280px, 96vw)" centered destroyOnHidden><div className="mb-3 flex flex-wrap items-center gap-2"><Button aria-label="上一个视频结果" disabled={detailIndex<=0} icon={<ArrowLeft className="size-4"/>} onClick={()=>stepDetail(-1)}/><Button aria-label="下一个视频结果" disabled={detailIndex<0||detailIndex>=filtered.length-1} icon={<ArrowRight className="size-4"/>} onClick={()=>stepDetail(1)}/><span className="mr-auto text-xs text-muted-foreground">{detailIndex>=0?`${detailIndex+1} / ${filtered.length}`:""}</span><Select aria-label="视频详情审片状态" className="w-36" value={detail?placementFor(studio.placements,detail.id).review:"none"} options={REVIEW_OPTIONS} onChange={value=>detail&&studio.place([detail.id],{review:value})}/><Select aria-label="视频详情归档文件夹" className="w-60" value={detail?placementFor(studio.placements,detail.id).folderId:""} options={[{value:"",label:"项目根目录"},...project.folders.map(f=>({value:f.id,label:folderTrail(project.folders,f.id).map(v=>v.name).join(" / ")}))]} onChange={value=>detail&&void diskAction(()=>moveStudioVideos(project,logs,[detail.id],value))}/>{trash&&detail&&<Button onClick={()=>{studio.place([detail.id],{trashedAt:undefined});setDetailId("");}}>恢复视频</Button>}</div>{detail&&renderDetail(detail)}</Modal>
    </div>;
}
function StudioNav({active,onClick,icon,children}:{active:boolean;onClick:()=>void;icon:ReactNode;children:ReactNode}){return <button type="button" className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${active?"bg-accent font-medium":"hover:bg-accent/50"}`} onClick={onClick}>{icon}{children}</button>;}