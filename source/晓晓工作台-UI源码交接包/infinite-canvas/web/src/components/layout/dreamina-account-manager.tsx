"use client";
import {useState} from "react";
import {App,Button,Input,Modal,Select,Tag} from "antd";
import {workbench} from "@/services/api/workbench";
export type DreaminaAccount={profile:string;name:string;category:string;accountId?:string;loggedIn?:boolean;checkedAt?:number};
export type DreaminaAccountList={revision?:number;activeProfile:string;accounts:DreaminaAccount[]};
export function DreaminaAccountManager({open,onClose,data,onChange,onSelect,onAuthorize}:{open:boolean;onClose:()=>void;data:DreaminaAccountList;onChange:(value:DreaminaAccountList)=>void;onSelect:(profile:string)=>Promise<void>;onAuthorize:(profile:string)=>Promise<void>}){
 const {message}=App.useApp(),[category,setCategory]=useState(""),[editing,setEditing]=useState<string|null>(null),[name,setName]=useState(""),[group,setGroup]=useState("未分类"),[busy,setBusy]=useState(false);
 const action=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}catch(e){message.error(e instanceof Error?e.message:"账号操作失败");}finally{setBusy(false);}};
 const save=()=>action(async()=>{onChange(editing?await workbench().dreaminaAccountEdit({profile:editing,name,category:group}):await workbench().dreaminaAccountCreate({name,category:group}));setEditing(null);setName("");setGroup("未分类");message.success(editing?"账号备注已保存":"账号配置已添加，请点击授权");});
 const groups=[...new Set(data.accounts.map(a=>a.category))];
 return <Modal title="即梦账号管理" open={open} onCancel={onClose} width={720} footer={<Button onClick={onClose}>关闭</Button>}>
  <p className="mb-4 text-sm text-muted-foreground">新版账号独立授权；切换用于后续任务，已有任务继续使用原账号。授权时请在官网确认选中的是目标账号。</p>
  <div className="mb-3 flex items-center gap-3"><Select aria-label="筛选即梦账号分类" className="min-w-40" value={category} options={[{value:"",label:"全部分类"},...groups.map(value=>({value,label:value}))]} onChange={setCategory}/><span className="text-xs text-muted-foreground">{data.accounts.length} 个配置</span></div>
  <div className="max-h-80 space-y-2 overflow-y-auto">{data.accounts.filter(a=>!category||a.category===category).map(a=><div key={a.profile} data-dreamina-account={a.profile} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
   <div className="min-w-40 flex-1"><div className="flex items-center gap-2"><strong>{a.name}</strong><Tag>{a.category}</Tag>{a.profile===data.activeProfile&&<span className="text-xs text-primary">当前</span>}</div><p className="mt-1 text-xs text-muted-foreground">{a.loggedIn===true?"已授权":a.loggedIn===false?"待授权":"状态待检查"}{a.accountId?" · 账号 "+a.accountId:""}</p></div>
   <Button size="small" disabled={busy||a.profile===data.activeProfile} onClick={()=>void action(()=>onSelect(a.profile))}>切换</Button>
   <Button size="small" disabled={busy} onClick={()=>void action(()=>onAuthorize(a.profile))}>{a.loggedIn?"检查授权":"授权"}</Button>
   <Button size="small" disabled={busy} onClick={()=>{setEditing(a.profile);setName(a.name);setGroup(a.category);}}>编辑</Button>
   <Button size="small" disabled={busy} onClick={()=>void action(async()=>{await workbench().dreaminaStatus("canvas",a.profile);onChange(await workbench().dreaminaAccounts());})}>刷新</Button>
  </div>)}</div>
  <div className="mt-5 grid gap-3 border-t border-border pt-4"><strong className="text-sm">{editing?"编辑账号备注":"新增账号"}</strong><div className="flex flex-wrap gap-2"><Input aria-label="即梦账号名称" className="!w-56" maxLength={40} placeholder="账号名称，如主号、备用号" value={name} onChange={e=>setName(e.target.value)}/><Input aria-label="即梦账号分类" className="!w-40" maxLength={40} placeholder="分类，如个人、团队" value={group} onChange={e=>setGroup(e.target.value)}/><Button type="primary" loading={busy} disabled={!name.trim()||!group.trim()} onClick={()=>void save()}>{editing?"保存备注":"添加账号"}</Button>{editing&&<Button onClick={()=>{setEditing(null);setName("");setGroup("未分类");}}>取消编辑</Button>}</div></div>
 </Modal>;
}
