"use client";
import { useEffect, useState } from "react";
import { App, Button } from "antd";
import { workbench } from "@/services/api/workbench";
import { fetchPippitModels } from "@/services/api/pippit";
import { useConfigStore, type LocalModelChannel } from "@/stores/use-config-store";

export function PippitChannelControls({onModels}:{onModels:(patch:Partial<LocalModelChannel>)=>void}) {
    const {message}=App.useApp();
    const [loggedIn,setLoggedIn]=useState<boolean|null>(null),[busy,setBusy]=useState("");
    const check=async()=>{const status=await workbench().pippitStatus();setLoggedIn(status.logged_in);return status.logged_in;};
    useEffect(()=>{void check().catch(()=>setLoggedIn(null));},[]);
    const run=async(action:string)=>{
        setBusy(action);
        try {
            if(action==="login") {message.info("请在打开的浏览器中完成小云雀授权");await workbench().pippitLogin();if(await check()) {const catalog=await fetchPippitModels();useConfigStore.getState().setPippitCatalog(catalog);onModels(catalog);}}
            else if(action==="models") {onModels(await fetchPippitModels());message.success("小云雀模型列表已同步");}
            else await check();
        }catch(error){message.error(error instanceof Error?error.message:"小云雀连接失败");}
        finally{setBusy("");}
    };
    return <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <span className="text-xs text-[var(--ant-color-text-secondary)]">{loggedIn===null?"待检查登录":loggedIn?"已登录小云雀":"小云雀未登录"}</span>
        <Button size="small" loading={busy==="login"} disabled={Boolean(busy)&&busy!=="login"} onClick={()=>void run("login")}>网页登录</Button>
        <Button size="small" loading={busy==="check"} disabled={Boolean(busy)&&busy!=="check"} onClick={()=>void run("check")}>检查登录</Button>
        <Button size="small" loading={busy==="models"} disabled={Boolean(busy)&&busy!=="models"} onClick={()=>void run("models")}>同步模型</Button>
        <span className="text-xs text-[var(--ant-color-text-secondary)]">使用小云雀账号额度；参考资产合计上限 128 MB。</span>
    </div>;
}
