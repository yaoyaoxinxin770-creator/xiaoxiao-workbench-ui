"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { mountPersonalWorkbench } from "./personal-workbench-runtime";
import { activateLocalProject, workbench } from "@/services/api/workbench";
import { projectTabId, useWorkspaceTabsStore } from "@/stores/use-workspace-tabs-store";

type Runtime = Awaited<ReturnType<typeof mountPersonalWorkbench>>;
export function PersonalWorkbenchHost() {
    const pathname=usePathname(), params=useSearchParams();
    const root=useRef<HTMLDivElement>(null), sessions=useRef(new Map<string,{runtime:Runtime;node:HTMLDivElement}>());
    const serial=useRef(Promise.resolve()), initialized=useRef(false), alive=useRef(true);
    const [retry,setRetry]=useState(0);
    const requested=params.get("project") || "";
    useEffect(()=>{const rename=(event:Event)=>{const {target,name}=(event as CustomEvent).detail;sessions.current.get(projectTabId("jimeng",target))?.runtime.globals.workbenchRenameProject?.(name);};window.addEventListener("xiaoxiao:rename-project",rename);return()=>window.removeEventListener("xiaoxiao:rename-project",rename);},[]);
    useEffect(()=>{const listener=()=>setRetry(n=>n+1);window.addEventListener("xiaoxiao:retry-project",listener);return()=>window.removeEventListener("xiaoxiao:retry-project",listener);},[]);
    useEffect(()=>{
        if(!["/jimeng","/typetale"].includes(pathname)||!root.current)return;
        let canceled=false;
        serial.current=serial.current.catch(()=>{}).then(async()=>{
            let target=requested;
            const tabs=useWorkspaceTabsStore.getState();
            try {
                if(!initialized.current){const snapshot=await workbench().legacyWorkbenchState();for(const [key,value] of Object.entries(snapshot||{}))if(!localStorage.getItem(key)&&typeof value==="string")localStorage.setItem(key,value);initialized.current=true;}
                if(!target){try{target=JSON.parse(localStorage.getItem("jimeng-workbench-project")||"{}").projectPath||"";}catch{}}
                const id=projectTabId("jimeng",target);
                let session=sessions.current.get(id);
                tabs.setError(id,"");
                if(!session){
                    if(target) await activateLocalProject({path:target,name:"",workspace:"jimeng"});
                    if(canceled||!alive.current)return;
                    const node=document.createElement("div");node.className="xiaoxiao-module";node.setAttribute("data-personal-workbench-root","");root.current!.appendChild(node);
                    try{session={runtime:await mountPersonalWorkbench(node,url=>window.dispatchEvent(new CustomEvent("xiaoxiao:navigate",{detail:url})),id),node};sessions.current.set(id,session);}catch(error){node.remove();throw error;}
                }
                if(canceled||!alive.current)return;
                for(const item of sessions.current.values())item.node.dataset.active=String(item===session);
                window.personalWorkbench=session.runtime.globals;
                session.runtime.globals.workbenchShowScene(pathname==="/typetale"?"typetale":"jimeng");
                if(target && pathname==="/jimeng")tabs.open({kind:"jimeng",target,name:tabs.tabs.find(t=>t.id===id)?.name||session.runtime.globals.workbenchDisplayName?.()||target.split(/[\\/]/).pop()||target,href:"/jimeng?project="+encodeURIComponent(target)});
                // Assets load independently; an unavailable asset must not leave project navigation waiting forever.
                Promise.resolve(session.runtime.globals.renderProjectAssetIndex?.(target)).catch(error=>tabs.setError(id,String(error.message||error)));
                window.dispatchEvent(new Event("xiaoxiao:project-ready"));
            }catch(error){tabs.setError(projectTabId("jimeng",target),error instanceof Error?error.message:String(error));}
        });
        return()=>{canceled=true;};
    },[pathname,requested,retry]);
    useEffect(()=>{
        alive.current=true;
        const timer=setInterval(()=>{const state=useWorkspaceTabsStore.getState();for(const [id,item] of sessions.current)state.setBusy(id,item.runtime.busy());},500);
        return()=>{alive.current=false;clearInterval(timer);for(const item of sessions.current.values())item.runtime.destroy();sessions.current.clear();};
    },[]);
    return <section hidden className="h-full overflow-auto" aria-label="个人创作工具"><link rel="stylesheet" href="/xiaoxiao/modules.css"/><div ref={root}/></section>;
}
