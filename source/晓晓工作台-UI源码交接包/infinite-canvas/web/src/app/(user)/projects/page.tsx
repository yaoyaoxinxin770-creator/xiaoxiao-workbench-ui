"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Card, Empty, Tag, Select, Checkbox, Dropdown, Input, Modal } from "antd";
import { FolderPlus, Maximize2, RefreshCw, ScanSearch, Pencil, Search, Plus, MoreHorizontal, LoaderCircle } from "lucide-react";
import { activateLocalProject, registerLocalProject, workbench, type LocalProject, type Workspace } from "@/services/api/workbench";
import { useTypetaleStore } from "@/app/(user)/typetale/stores/use-typetale-store";
import { useCanvasStore } from "@/app/(user)/canvas/stores/use-canvas-store";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";
import { projectTabId, useWorkspaceTabsStore } from "@/stores/use-workspace-tabs-store";
import { syncStudioDirectory, archiveStudioProject, recycleStudioProject, openStudioDirectory } from "@/services/api/video-studio-files";
import { createStore } from "@/lib/idb-store";
import {placementFor} from "../video/studio-model";
import {requestVideoPoster} from "../video/video-poster";
import type { GenerationLog } from "../video/page";
import { libraryHref } from "@/services/api/project-library";

export default function ProjectsPage() {
    const { message, modal } = App.useApp();
    const router = useRouter();
    const studio=useVideoStudioStore(), tabs=useWorkspaceTabsStore(), canvas=useCanvasStore();
    const [rename,setRename]=useState<{kind:"video"|"jimeng";id:string;name:string;item?:LocalProject}|null>(null);
    const [renaming,setRenaming]=useState(false);
    const [creating,setCreating]=useState<{kind:"video"|"canvas"|"jimeng";name:string}|null>(null);
    const [projects, setProjects] = useState<(LocalProject & {info:any;runs:any[]})[]>([]);
    const [projectSearch,setProjectSearch]=useState("");
    const [projectSort,setProjectSort]=useState("recent");
    const [projectLogs,setProjectLogs]=useState<GenerationLog[]>([]);
    useEffect(()=>{let active=true;const logs:GenerationLog[]=[];createStore("video_generation_logs").iterate<GenerationLog,void>(log=>{logs.push(log);}).then(()=>{if(active)setProjectLogs(logs);}).catch(()=>{});return()=>{active=false;};},[]);
    const projectResults=(id:string)=>projectLogs.filter(log=>{const place=placementFor(studio.placements,log.id);return place.projectId===id&&!place.trashedAt;});
    const orderedProjects=useMemo(()=>studio.projects.filter(p=>p.name.toLowerCase().includes(projectSearch.toLowerCase())).slice().sort((a,b)=>projectSort==="name"?a.name.localeCompare(b.name,"zh-CN",{numeric:true}):Math.max(0,...projectResults(b.id).map(l=>l.createdAt),...studio.groups.filter(g=>g.projectId===b.id).map(g=>g.createdAt))-Math.max(0,...projectResults(a.id).map(l=>l.createdAt),...studio.groups.filter(g=>g.projectId===a.id).map(g=>g.createdAt))),[studio.projects,studio.groups,studio.placements,projectLogs,projectSearch,projectSort]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [scan, setScan] = useState<any[]>([]);
    const isRunning = () => useTypetaleStore.getState().isBusy() || Boolean(window.personalWorkbench?.typetaleIsRunning?.()) || /运行中|已暂停/.test(document.getElementById("runStatus")?.textContent || "");
    const refresh = async () => {
        try {
            const recent = await workbench().readRecent();
            const items = await Promise.all((recent.projects || []).map(async (item:LocalProject) => {
                const info=await workbench().inspectProject(item.path);
                const runs=(await workbench().readRuns(item.path)).runs || [];
                for(const episode of info.project?.episodes || []) runs.push(...Object.values(episode.segmentProgress || {}));
                return {...item,workspace:item.workspace === "typetale" ? "typetale" : "jimeng",info,runs};
            }));
            setProjects(items);setError("");
        } catch(e:any) { setError(e.message); }
    };
    useEffect(()=>{void refresh();},[]);
    const open = async (item: LocalProject, configure = false) => {
        setBusy(true);
        try { window.dispatchEvent(new CustomEvent("xiaoxiao:navigate",{detail:`/${item.workspace}?project=${encodeURIComponent(item.path)}${configure?"&view=elements":""}`})); }
        catch(e:any) { message.error(e.message); }
        finally { setBusy(false); }
    };
    // 选一个文件夹：已有即梦配置的直接打开，全新文件夹先进 Elements 绑定素材目录。
    const choose = async (workspace: Workspace) => {
        if(isRunning()) return message.warning("任务仍在执行，请先停止再切换项目。");
        try { const path=await workbench().chooseDirectory();if(!path)return;const info=await workbench().inspectProject(path);await open(await registerLocalProject(path,workspace),!info.hasProjectConfig); }
        catch(e:any) {message.error(e.message);}
    };
    const createNamed = async () => {
        const name=creating?.name.trim();if(!creating||!name)return;
        if(creating.kind==="jimeng"){
            if(isRunning())return message.warning("任务仍在执行，请先停止再切换项目。");
            try{
                const {path}=await workbench().createJimengProject(name);
                const item=await registerLocalProject(path,"jimeng");
                setCreating(null);await refresh();await open(item,true);
            }catch(e:any){message.error(e.message);}
            return;
        }
        if(creating.kind==="video"){studio.createProject(name);const id=useVideoStudioStore.getState().activeProjectId;setCreating(null);window.dispatchEvent(new CustomEvent("xiaoxiao:navigate",{detail:"/video?project="+encodeURIComponent(id)}));}
        else{const id=canvas.createProject(name);setCreating(null);router.push("/canvas/"+id);}
    };
    const createMenu = { items: [
        { key: "jimeng", label: "即梦自动发送项目", extra: "输入名称" },
        { key: "video", label: "视频创作台项目", extra: "输入名称" },
        { key: "canvas", label: "画布项目", extra: "输入名称", disabled: !canvas.hydrated },
    ], onClick: ({ key }: { key: string }) => key === "jimeng" ? setCreating({kind:"jimeng",name:"即梦项目 "+(projects.filter(p=>p.workspace==="jimeng").length+1)}) : setCreating({ kind: key as "video" | "canvas", name: key === "video" ? "视频项目 " + (studio.projects.length + 1) : "无限画布 " + (canvas.projects.length + 1) }) };
    const relocate = async (item: LocalProject) => {
        if(isRunning()) return message.warning("任务仍在执行，请先停止再重新定位项目。");
        try {
            const path=await workbench().chooseDirectory();if(!path)return;
            await registerLocalProject(path,item.workspace);
            const recent=await workbench().readRecent();
            await workbench().writeRecent(recent.projects.filter((p:LocalProject)=>p.path!==item.path));
            await refresh();message.success("项目路径已更新，原目录中的文件保留。");
        }catch(e:any){message.error(e.message);}
    };
    const scanRoot = async () => {
        try {const result=await workbench().scanProjectsRoot();if(!result.canceled)setScan((result.candidates || []).filter((p:any)=>p.info?.project?.workspace !== "typetale" && !p.info?.hasTypetaleState).map((p:any)=>({...p,selected:false,workspace:p.info?.project?.workspace || (p.info?.hasTypetaleState ? "typetale" : "jimeng")})));}
        catch(e:any){message.error(e.message);}
    };
    const importScanned = async () => {
        setBusy(true);
        try {for(const item of scan.filter(p=>p.selected))await registerLocalProject(item.path,item.workspace);setScan([]);await refresh();message.success("已纳入项目管理");}
        catch(e:any){message.error(e.message);}
        finally{setBusy(false);}
    };
    const renameProject=async()=>{
        if(!rename?.name.trim())return;setRenaming(true);
        try{const name=rename.name.trim();
            if(rename.kind==="video"){const project=studio.projects.find(p=>p.id===rename.id)!;await syncStudioDirectory({...project,name},true);useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===project.id?{...p,name}:p)}));}
            else{const item=rename.item!,info=await workbench().inspectProject(item.path);const result=await workbench().saveProject(item.path,{...info.project,name});if(!result.ok)throw Error("重命名保存失败");const recent=await workbench().readRecent();await workbench().writeRecent(recent.projects.map((p:LocalProject)=>p.path===item.path?{...p,name}:p));await refresh();window.dispatchEvent(new CustomEvent("xiaoxiao:rename-project",{detail:{target:item.path,name}}));}
            tabs.rename(projectTabId(rename.kind,rename.id),name);setRename(null);message.success("项目已重命名");
        }catch(error:any){message.error(error.message);}finally{setRenaming(false);}
    };
    const deleteProject=(kind:"video"|"jimeng",id:string,name:string)=>{
        if(tabs.busy[projectTabId(kind,id)])return message.warning("该项目仍有任务运行，请先停止");
        modal.confirm({title:"确定删除项目「"+name+"」？",content:kind==="video"?"将移除项目、文件夹和队列；本地视频文件夹会移到创作台回收目录，原图片、音频和授权配置保留。":"将从项目管理移除该项目，原文件夹中的素材和即梦数据保留。",okText:"确定删除",okButtonProps:{danger:true},cancelText:"取消",onOk:async()=>{
            try{if(kind==="video"){const project=studio.projects.find(p=>p.id===id)!;const store=createStore("video_generation_logs"),logs:GenerationLog[]=[];await store.iterate<GenerationLog,void>(log=>{logs.push(log);});await archiveStudioProject(project,logs);await recycleStudioProject(id);studio.deleteProject(id);if(!useVideoStudioStore.getState().projects.length)studio.createProject("默认视频项目");}
                else{const recent=await workbench().readRecent();await workbench().writeRecent(recent.projects.filter((p:LocalProject)=>p.path!==id));await refresh();}
                tabs.close(projectTabId(kind,id));message.success("项目已删除");
            }catch(error:any){message.error(error.message);throw error;}
        }});
    };
    return <main className="h-full overflow-auto">
        <div className="projects-v2 page-reveal mx-auto flex max-w-6xl flex-col gap-8 px-8 py-10">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div><p className="eyebrow">晓晓工作台 · 本地创作项目</p><h1 className="mt-3 text-[30px] font-semibold tracking-tight">项目管理</h1></div>
                <div className="flex flex-wrap gap-2"><Input aria-label="搜索项目" placeholder="搜索项目" prefix={<Search size={15}/>} value={projectSearch} onChange={e=>setProjectSearch(e.target.value)} allowClear className="!w-52"/><Select aria-label="项目排序" value={projectSort} onChange={setProjectSort} options={[{value:"recent",label:"最近活动"},{value:"name",label:"项目名称"}]}/>
                    <Button onClick={()=>void refresh()} icon={<RefreshCw size={16}/>} disabled={busy}>刷新</Button>
                    <Button onClick={()=>void scanRoot()} icon={<ScanSearch size={16}/>} disabled={busy}>扫描目录</Button>
                    <Dropdown trigger={["click"]} menu={createMenu} disabled={busy}><Button type="primary" icon={<FolderPlus size={16}/>} aria-label="新建项目">新建项目</Button></Dropdown>
                </div>
            </header>
            <Modal title={creating?.kind==="video"?"新建视频创作台项目":creating?.kind==="jimeng"?"新建即梦自动发送项目":"新建画布项目"} open={Boolean(creating)} onCancel={()=>setCreating(null)} onOk={()=>void createNamed()} okText="创建并打开" cancelText="取消" okButtonProps={{disabled:!creating?.name.trim()}} footer={creating?.kind==="jimeng"?[<Button key="pick" onClick={()=>{setCreating(null);void choose("jimeng");}}>选择已有文件夹…</Button>,<Button key="cancel" onClick={()=>setCreating(null)}>取消</Button>,<Button key="ok" type="primary" disabled={!creating.name.trim()} onClick={()=>void createNamed()}>创建并打开</Button>]:undefined} destroyOnHidden><Input autoFocus aria-label="新项目名称" value={creating?.name||""} maxLength={80} onChange={event=>setCreating(value=>value?{...value,name:event.target.value}:null)} onPressEnter={()=>void createNamed()}/></Modal>
            <section className="project-canvas-entry"><Maximize2 className="size-5 text-primary"/><div className="flex-1"><h2>画布与 Agent</h2><p>继续在你的画布中整理素材和创作</p></div><Link href="/canvas"><Button>打开我的画布</Button></Link></section>
            <section><h2 className="mb-4 flex items-baseline gap-2 text-lg font-semibold">视频创作台项目<span className="text-xs font-normal text-muted-foreground">{orderedProjects.length} 个</span></h2><div className="project-grid">{orderedProjects.map(project=>{const results=projectResults(project.id).sort((a,b)=>b.createdAt-a.createdAt),recent=results[0]?.createdAt,openProject=()=>{studio.selectProject(project.id);window.dispatchEvent(new CustomEvent("xiaoxiao:navigate",{detail:'/video?project='+encodeURIComponent(project.id)}));},items=[{key:"rename",label:"重命名项目"},{key:"open",label:"打开本地文件夹"},{key:"delete",label:"删除项目",danger:true}],menu={items,onClick:({key}:{key:string})=>{if(key==="rename")setRename({kind:"video",id:project.id,name:project.name});else if(key==="delete")deleteProject("video",project.id,project.name);else void openStudioDirectory(project,"").catch(error=>message.error(error.message));}};return <Dropdown key={project.id} trigger={["contextMenu"]} menu={menu}><article data-managed-video-project={project.id} role="button" tabIndex={0} aria-label={"打开视频项目 "+project.name} className="project-v2-card" onClick={openProject} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openProject();}}}><ProjectCover name={project.name} logs={results.filter(l=>l.video).slice(0,4)} busy={Boolean(tabs.busy[projectTabId("video",project.id)])}/><div className="project-card-info"><div className="min-w-0 flex-1"><h3 className="truncate" title={project.name}>{project.name}</h3><p>{studio.groups.filter(g=>g.projectId===project.id).length} 视频组 · {project.elementIds.length} 素材 · {project.folders.length} 文件夹</p><p>{recent?"最近生成 "+new Date(recent).toLocaleString("zh-CN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"尚无生成记录"}</p></div><div onClick={e=>e.stopPropagation()}><Dropdown trigger={["click"]} menu={menu}><Button type="text" size="small" aria-label={project.name+" 更多操作"} icon={<MoreHorizontal size={18}/>}/></Dropdown></div></div></article></Dropdown>;})}<button className="project-new-card" onClick={()=>setCreating({kind:"video",name:"视频项目 "+(studio.projects.length+1)})}><Plus size={22}/>新建视频项目</button></div></section>
            <Modal title="重命名项目" open={Boolean(rename)} onCancel={()=>setRename(null)} onOk={()=>void renameProject()} confirmLoading={renaming} okText="保存" cancelText="取消" okButtonProps={{disabled:!rename?.name.trim()}}><Input aria-label="项目新名称" value={rename?.name||""} onChange={event=>setRename(value=>value?{...value,name:event.target.value}:null)} onPressEnter={()=>void renameProject()}/></Modal>
            {error ? <p role="alert" className="text-destructive">{error}</p> : null}
            {scan.length ? <Card title="扫描结果"><div className="flex flex-col gap-3">{scan.map((item,i)=><div key={item.path} className="flex flex-wrap items-center gap-3"><Checkbox checked={item.selected} onChange={e=>setScan(scan.map((p,n)=>n===i?{...p,selected:e.target.checked}:p))}>{item.name}</Checkbox><span className="text-xs text-muted-foreground">{item.usable?"检测到素材或文档":item.reason}</span><Select value={item.workspace} onChange={workspace=>setScan(scan.map((p,n)=>n===i?{...p,workspace}:p))} options={[{value:"jimeng",label:"即梦自动发送"}]}/></div>)}<Button type="primary" disabled={busy || !scan.some(p=>p.selected)} onClick={()=>void importScanned()}>纳入所选项目</Button></div></Card> : null}
            {!projects.length && !studio.projects.length && !error ? <Empty description="还没有项目，可以新建或扫描目录"/> : null}
            {(["jimeng"] as const).map(workspace=>{
                const items = projects.filter(p=>p.workspace===workspace&&p.name.toLowerCase().includes(projectSearch.toLowerCase()));
                const label = workspace==="jimeng"?"即梦自动发送项目":"字字动画项目";
                if(!items.length)return null;
                return <section key={workspace}><h2 className="mb-4 flex items-baseline gap-2 text-lg font-semibold tracking-tight">{label}<span className="text-xs font-normal text-muted-foreground">{items.length} 个</span></h2><div className="grid gap-4 md:grid-cols-2">{items.map(item=><Dropdown key={item.path} trigger={["contextMenu"]} menu={{items:[{key:"rename",label:"重命名项目"},{key:"delete",label:"删除项目",danger:true}],onClick:({key})=>key==="rename"?setRename({kind:"jimeng",id:item.path,name:item.name,item}):deleteProject("jimeng",item.path,item.name)}}><article className="surface surface-hover relative flex flex-col overflow-hidden p-5 before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-b-full before:bg-gradient-to-r before:from-primary before:to-gold"><div className="flex items-start justify-between gap-3"><h3 className="truncate text-base font-semibold">{item.name}</h3><Tag>{workspace==="jimeng"?"即梦":"字字动画"}</Tag></div><p className="mt-2 break-all font-mono text-[11px] leading-5 text-muted-foreground">{item.path}</p><div className="mt-3 flex flex-wrap gap-1.5"><span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">人物 {item.info?.counts?.characters || 0}</span><span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">场景 {item.info?.counts?.scenes || 0}</span><span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">音频 {item.info?.counts?.audio || 0}</span>{item.runs.some(r=>["failed","error"].includes(r.status))?<Tag color="error">有失败任务</Tag>:null}</div><Button className="mt-5 self-start" disabled={busy} onClick={()=>void (item.info?.pathAvailable ? open(item) : relocate(item))}>{item.info?.pathAvailable?"打开项目":"重新定位项目"}</Button>{item.info?.pathAvailable ? <div className="mt-3 flex gap-3 text-xs"><Link className="text-primary" href={`/jimeng?project=${encodeURIComponent(item.path)}&view=elements`}>Elements 素材库</Link></div> : null}</article></Dropdown>)}</div></section>;
            })}
        </div>
    </main>;
}

function ProjectCover({name,logs,busy}:{name:string;logs:GenerationLog[];busy:boolean}){const [covers,setCovers]=useState<string[]>([]);const key=logs.map(l=>l.id+":"+l.video?.url).join("|");useEffect(()=>{let live=true;const abort=new AbortController(),urls:string[]=[];setCovers([]);Promise.all(logs.map(async log=>{try{const blob=await requestVideoPoster(log.video!,abort.signal);if(!blob||!live)return "";const url=URL.createObjectURL(blob);urls.push(url);return url;}catch{return "";}})).then(next=>{if(live)setCovers(next);});return()=>{live=false;abort.abort();urls.forEach(url=>URL.revokeObjectURL(url));};},[key]);return <div className="project-cover">{covers.some(Boolean)?covers.map((url,i)=>url?<img key={i} src={url} alt={name+" 视频封面 "+(i+1)}/>:<span key={i}/>):<div className="project-cover-empty"><strong>{name.slice(0,2)}</strong><span>{logs.length?"暂无可用的视频封面":"生成第一段视频后自动作为封面"}</span></div>}{busy&&<span className="project-busy"><LoaderCircle size={13} className="animate-spin"/>任务运行中</span>}</div>;}
