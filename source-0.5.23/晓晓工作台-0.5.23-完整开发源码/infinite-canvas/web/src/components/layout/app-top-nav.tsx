"use client";
import {videoLocationUrl,type WorkbenchTaskItem} from "@/app/(user)/video/running-tasks";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect,useState } from "react";
import { App, Button, Dropdown, Tooltip, Popover } from "antd";
import { createStore } from "@/lib/idb-store";
import { Plus, X, LoaderCircle, Minus, Square, Video, Send, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { navigationTools } from "@/constant/navigation-tools";
import { AppConfigModal } from "./app-config-modal";
import { UserStatusActions } from "./user-status-actions";
import { useWorkspaceTabsStore, projectTabId } from "@/stores/use-workspace-tabs-store";
import {useWorkbenchLayoutStore} from "@/stores/use-workbench-layout-store";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";

export function AppTopNav() {
    const pathname = usePathname(), params = useSearchParams(), router = useRouter();
    const tabs = useWorkspaceTabsStore(), studio = useVideoStudioStore(), { message } = App.useApp();
    const railCollapsed=useWorkbenchLayoutStore(s=>s.railCollapsed),toggleRail=useWorkbenchLayoutStore(s=>s.toggleRail);
    const [tasksOpen,setTasksOpen]=useState(false),generating=tabs.taskItems.filter(t=>t.active).length;
    const locate=(projectId:string,id:string)=>{studio.selectProject(projectId);setTasksOpen(false);window.dispatchEvent(new CustomEvent('xiaoxiao:navigate',{detail:videoLocationUrl(projectId,id)}));};
    const removeTask=async(item:WorkbenchTaskItem)=>{
        studio.place([item.id],{trashedAt:Date.now()});
        try{const logDb=createStore("video_generation_logs"),rec=await logDb.getItem<Record<string,unknown>>(item.id);if(rec&&!rec.video&&rec.status!=="成功"&&rec.status!=="失败")await logDb.setItem(item.id,{...rec,interruptedAt:rec.interruptedAt||Date.now(),status:"待核对"});}catch{/* ignore */}
        const next=tabs.taskItems.filter(t=>t.id!==item.id);
        tabs.setTaskItems(next);
        const tabId=projectTabId("video",item.projectId),activeCount=next.filter(t=>t.projectId===item.projectId&&t.active).length;
        tabs.setBusy(tabId,activeCount>0);tabs.setTaskCount(tabId,activeCount);
        if(!next.length)setTasksOpen(false);
        window.dispatchEvent(new CustomEvent("xiaoxiao:remove-workbench-task",{detail:{id:item.id}}));
        message.success("已从待处理任务列表删除");
    };
    useEffect(()=>{const stop:unknown=window.desktopBridge?.onVideoCompletionClick?.((item:{id:string;projectId:string})=>locate(item.projectId,item.id));return()=>{if(typeof stop==='function')stop();};},[]);
    const canvas = /^\/canvas\/[^/]+/.test(pathname);
    const target = params.get("project") || "";
    const project = studio.projects.find(p => p.id === studio.activeProjectId);
    useEffect(() => {
        if (pathname === "/video" && studio.ready && project) tabs.open({kind:"video", target:project.id, name:project.name, href:"/video?project="+encodeURIComponent(project.id)});
        if (pathname === "/jimeng" && target) tabs.open({kind:"jimeng", target, name:tabs.tabs.find(t=>t.id===projectTabId("jimeng",target))?.name || target.split(/[\\/]/).filter(Boolean).pop() || target, href:"/jimeng?project="+encodeURIComponent(target)});
    }, [pathname, target, studio.ready, project?.id, project?.name]);
    const visit = (tab: typeof tabs.tabs[number]) => { if(tab.kind==="video") studio.selectProject(tab.target); tabs.open(tab); window.dispatchEvent(new CustomEvent("xiaoxiao:navigate",{detail:tab.href})); };
    const active = pathname==="/video"?projectTabId("video",project?.id||""):pathname==="/jimeng"?(target?projectTabId("jimeng",target):tabs.lastByKind.jimeng||""):"";
    return <>
        <header data-desktop-header className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card/50 px-2" style={{WebkitAppRegion:"drag"} as import("react").CSSProperties}>
        {/* Electron 的拖动区按 DOM 顺序累加：此按钮必须排在 header 之后（即放在其内部），no-drag 才不会被 header 的 drag 盖掉。 */}
        <button type="button" data-rail-toggle aria-label={railCollapsed?"展开功能栏":"收起功能栏"} aria-expanded={!railCollapsed} title={railCollapsed?"展开功能栏":"收起功能栏"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-accent" style={{WebkitAppRegion:"no-drag"} as import("react").CSSProperties} onClick={toggleRail}>{railCollapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button>
        <div role="tablist" aria-label="已打开的项目" data-workspace-tabs className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={{WebkitAppRegion:"drag"} as import("react").CSSProperties}>
            {tabs.tabs.map(tab=><div key={tab.id} data-active={tab.id===active} style={{WebkitAppRegion:"no-drag"} as import("react").CSSProperties} className={"flex h-8 max-w-64 shrink-0 items-center rounded-md "+(tab.id===active?"bg-accent text-accent-foreground":"text-muted-foreground hover:bg-secondary")}>
                <button type="button" role="tab" aria-selected={tab.id===active} title={tab.target} data-project-tab={tab.id} onClick={()=>visit(tab)} className="flex min-w-0 items-center gap-2 px-3 text-xs">{tab.kind==="video"?<Video size={14}/>:<Send size={14}/>}<span className="max-w-36 truncate">{tab.name}</span>{tabs.busy[tab.id]&&<LoaderCircle className="size-3 animate-spin workspace-tab-spinner"/>}{tabs.errors[tab.id]&&<span className="text-destructive" title={tabs.errors[tab.id]}>!</span>}</button>
                <Tooltip title={tabs.busy[tab.id]?"任务仍在运行，请先停止再关闭页签":"关闭页签，保留项目"}><button type="button" aria-label={"关闭页签 "+tab.name} className="mr-1 p-1 hover:text-primary" onClick={()=>{if(tabs.busy[tab.id]){message.warning("任务仍在运行，请先停止再关闭页签");return;}tabs.close(tab.id);if(active===tab.id){const next=useWorkspaceTabsStore.getState().tabs.at(-1);if(next)visit(next);else router.push('/projects');}}}><X className="size-3"/></button></Tooltip>
            </div>)}
            <Button style={{WebkitAppRegion:"no-drag"} as import("react").CSSProperties} type="text" size="small" aria-label="打开其他项目" title="打开其他项目" icon={<Plus className="size-4"/>} onClick={()=>router.push('/projects')}/>
        </div>
        {tabs.taskItems.length>0&&<Popover trigger="click" open={tasksOpen} onOpenChange={setTasksOpen} placement="bottomRight" title="工作台视频任务" content={<div data-workbench-task-list className="max-h-96 w-96 max-w-[80vw] space-y-2 overflow-y-auto">{tabs.taskItems.map(item=><Dropdown key={item.id} trigger={["contextMenu"]} menu={{items:[{key:"delete",label:"删除",danger:true}],onClick:({key})=>{if(key==="delete")void removeTask(item);}}}><button type="button" data-running-task={item.id} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent" onClick={()=>locate(item.projectId,item.id)}><div className="min-w-0 flex-1"><strong className="block truncate">{item.title}</strong><span className="text-xs text-muted-foreground">{item.projectName} · {item.phase}{item.active&&typeof item.progress==='number'?' '+Math.round(item.progress)+'%':''}</span></div><span className="text-xs text-primary">定位</span></button></Dropdown>)}</div>}><button type="button" aria-label="展开工作台任务" className="workspace-task-status" style={{WebkitAppRegion:'no-drag'} as import('react').CSSProperties}><LoaderCircle size={14} className={generating?'animate-spin':''}/><span>{generating?generating+' 个任务生成中':tabs.taskItems.length+' 个任务待处理'}</span></button></Popover>}
        {!canvas&&<div style={{WebkitAppRegion:"no-drag"} as import("react").CSSProperties}><UserStatusActions/></div>}
        <div data-window-controls className="flex shrink-0" style={{WebkitAppRegion:"no-drag"} as import("react").CSSProperties}>{[{action:"minimize",label:"最小化窗口",icon:<Minus className="size-3.5"/>},{action:"maximize",label:"放大或还原窗口",icon:<Square className="size-3"/>},{action:"close",label:"关闭窗口",icon:<X className="size-4"/>}].map(item=><button key={item.action} type="button" aria-label={item.label} title={item.label} className={"flex h-10 w-9 items-center justify-center "+(item.action==="close"?"hover:bg-red-500 hover:text-white":"hover:bg-accent")} onClick={()=>void window.desktopBridge?.windowControl?.(item.action)}>{item.icon}</button>)}</div>
        </header>
        <AppConfigModal/>
    </>;
}
