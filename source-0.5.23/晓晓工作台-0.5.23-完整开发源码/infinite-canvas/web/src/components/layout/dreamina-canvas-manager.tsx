"use client";
import {useEffect,useRef,useState} from "react";
import {App,Button,Input,Modal,Select,Tag} from "antd";
import {workbench} from "@/services/api/workbench";
import {useVideoStudioStore} from "@/stores/use-video-studio-store";
import {useAssetStore} from "@/stores/use-asset-store";
import {chooseBinding,sameBinding,suggestBindings,type Binding,type BindingSuggestion,type CanvasNode} from "./dreamina-binding-suggestions";
export type CanvasTarget={projectId:string;name?:string;webUrl:string;locked?:boolean;existingOnly?:boolean;bindings?:Binding[]};

export function DreaminaCanvasManager({open,onClose,profile,accountName,onChange}:{open:boolean;onClose:()=>void;profile:string;accountName:string;onChange:(target:CanvasTarget)=>void}){
 const {message}=App.useApp(),projectKey=useVideoStudioStore(s=>s.activeProjectId),projects=useVideoStudioStore(s=>s.projects),assets=useAssetStore(s=>s.assets),project=projects.find(p=>p.id===projectKey);
 const [target,setTarget]=useState<CanvasTarget|null>(null),[canvases,setCanvases]=useState<CanvasTarget[]>([]),[nodes,setNodes]=useState<CanvasNode[]>([]),[url,setUrl]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[bindings,setBindings]=useState<Binding[]>([]);
 const [suggestions,setSuggestions]=useState<BindingSuggestion[]|null>(null);
 const generation=useRef(0);
 const accept=(t:CanvasTarget|null)=>{setSuggestions(null);setTarget(t);setBindings(t?.bindings||[]);};
 useEffect(()=>{const ticket=++generation.current;setTarget(null);setNodes([]);setCanvases([]);setBindings([]);setUrl("");setError("");setSuggestions(null);if(!open)return;setBusy(true);Promise.all([workbench().dreaminaCanvasSettings({profile,projectKey}),workbench().dreaminaCanvasList({profile})]).then(async([t,list])=>{if(generation.current!==ticket)return;accept(t);setCanvases(list);if(t){const found=await workbench().dreaminaCanvasNodes({profile,projectId:t.projectId});if(generation.current===ticket)setNodes(found);}}).catch(e=>{if(generation.current===ticket)setError(e.message);}).finally(()=>{if(generation.current===ticket)setBusy(false);});return()=>{generation.current++;};},[open,profile,projectKey]);
 const action=async(fn:()=>Promise<CanvasTarget>)=>{const ticket=generation.current;setBusy(true);setError("");try{const value=await fn();if(ticket!==generation.current)return;accept(value);onChange(value);const found=await workbench().dreaminaCanvasNodes({profile,projectId:value.projectId});if(ticket!==generation.current)return;setNodes(found);if(ticket===generation.current)message.success("当前项目画布设置已保存");}catch(e){if(ticket===generation.current)setError(e instanceof Error?e.message:"画布操作失败");}finally{if(ticket===generation.current)setBusy(false);}};
 const bind=(value:string)=>action(()=>workbench().dreaminaCanvasBind({profile,projectKey,url:value}));
 const local=assets.filter(a=>project?.elementIds.includes(a.id)&&!project?.elementRules?.[a.id]?.disabled&&["image","video","audio"].includes(a.kind));
 const suggest=()=>{const result=suggestBindings(local,nodes,bindings);setBindings(result.bindings);setSuggestions(result.results);};
 const dirty=Boolean(target)&&JSON.stringify(bindings)!==JSON.stringify(target?.bindings||[]);
 const counts=(state:BindingSuggestion['state'])=>suggestions?.filter(r=>r.state===state).length||0;
 const duplicates=suggestions?.filter(r=>r.state==='ambiguous')||[];
 const kindLabel=(kind:string)=>({image:"图片",video:"视频",audio:"音频"}[kind]||kind);
 return <Modal title="即梦画布管理" open={open} onCancel={onClose} width={880} footer={<Button onClick={onClose}>关闭</Button>}>
  <p className="mb-3 text-sm">项目：<strong>{project?.name||projectKey}</strong> · 账号：<strong>{accountName}</strong></p>
  <p className="mb-4 text-xs text-muted-foreground">每个项目和账号分别记住画布。切换只影响后续任务，旧任务继续查询原画布。</p>
  {error&&<p role="alert" className="mb-3 text-sm text-red-500">{error}</p>}
  <div className="mb-4 rounded-xl border border-border p-3"><strong>{target?.name||"尚未指定画布"}</strong>{target?.locked&&<Tag className="ml-2">已锁定</Tag>}{target&&<a className="ml-3" href={target.webUrl} target="_blank" rel="noopener noreferrer">打开官网画布</a>}<p className="mt-1 text-xs text-muted-foreground">{target?.projectId||"未指定时，第一次提交会创建本项目的独立画布。"}</p></div>
  <div className="mb-3 flex gap-2"><Select aria-label="选择已有即梦画布" className="min-w-0 flex-1" showSearch optionFilterProp="label" placeholder="选择当前 CLI 账号下的已有画布" disabled={busy} value={target?.projectId} options={canvases.map(c=>({value:c.projectId,label:c.name||c.projectId}))} onChange={id=>void bind(id)}/><Button loading={busy} onClick={()=>{const ticket=generation.current;void workbench().dreaminaCanvasList({profile}).then(value=>{if(ticket===generation.current)setCanvases(value);}).catch(e=>{if(ticket===generation.current)message.error(e.message);});}}>刷新列表</Button></div>
  <div className="mb-5 flex gap-2"><Input aria-label="即梦画布链接" value={url} onChange={e=>setUrl(e.target.value)} placeholder="粘贴已有画布链接" disabled={busy}/><Button type="primary" disabled={busy||!url.trim()} onClick={()=>void bind(url.trim())}>锁定此画布</Button></div>
  {target&&<><p data-canvas-auto-upload className="mb-3 text-sm">自动补齐素材：优先复用画布素材；画布没有时，将元素库中本次引用的图片、视频或音频上传并建立素材节点。</p><strong>手动指定画布素材（可选）</strong><p className="my-2 text-xs text-muted-foreground">一般无需手动绑定。画布素材改过名、经过转码，或同名有多个版本时，可在这里指定对应节点；已有绑定继续优先使用。</p>
   {suggestions&&<section aria-label="名称绑定建议结果" className="my-3 rounded-xl border border-border p-3 text-sm">
    <p role="status">唯一匹配 {counts('unique')} 项 · 同名待选 {duplicates.filter(r=>!bindings.some(b=>sameBinding(b,{kind:r.kind,title:r.name})&&b.nodeId)).length} 项 · 未找到 {counts('missing')} 项 · 保留已有绑定 {counts('bound')} 项</p>
    {!suggestions.length&&<p className="mt-2 text-xs text-muted-foreground">本项目没有可参与匹配的素材，请先在元素库添加或启用素材。</p>}
    {counts('unique')>0&&<p className="mt-2 text-xs text-muted-foreground">唯一匹配已填入下方绑定列表，请核对后保存。</p>}
    {!!duplicates.length&&<div className="mt-3 max-h-64 space-y-3 overflow-auto">{duplicates.map((r,i)=>{const selected=bindings.find(b=>sameBinding(b,{kind:r.kind,title:r.name}))?.nodeId;return <div key={r.kind+':'+r.name} data-binding-ambiguity>
     <p>{kindLabel(r.kind)}「{r.name}」：找到 {r.matches.length} 个同名节点{selected?'，已选择，保存后用于后续任务':'，请选择要引用的一个'}</p>
     <Select aria-label={`同名候选 ${i+1}`} className="mt-1 w-full" showSearch optionFilterProp="label" placeholder="选择画布节点（末尾编号可区分同名素材）" disabled={busy} value={selected||undefined} options={r.matches.map(n=>({value:n.nodeId,label:(n.title||n.nodeId)+" · "+n.nodeId.slice(-6)}))} onChange={nodeId=>setBindings(v=>chooseBinding(v,{kind:r.kind,title:r.name},nodeId))}/>
    </div>;})}</div>}
    {counts('missing')>0&&<details className="mt-3"><summary>查看未找到的 {counts('missing')} 项</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{suggestions.filter(r=>r.state==='missing').map(r=><li key={r.kind+':'+r.name}>{kindLabel(r.kind)}「{r.name}」：当前画布未找到同名节点，可在下方手动绑定其他名称的节点。</li>)}</ul></details>}
   </section>}
   <p role="status" className="mt-3 text-xs text-muted-foreground">{dirty?'有修改待保存，点击“保存引用设置”后生效。':'引用设置已保存。'}旧失败记录不会自动重试，请重新载入本组后创建。</p>
   <div className="my-3 max-h-72 space-y-2 overflow-auto">{bindings.map((b,i)=><div key={i} className="flex flex-wrap gap-2">
    <Select aria-label={`绑定素材类型 ${i+1}`} className="!w-24" value={b.kind} disabled={busy} options={[{value:"image",label:"图片"},{value:"video",label:"视频"},{value:"audio",label:"音频"}]} onChange={kind=>setBindings(v=>v.map((x,j)=>j===i?{...x,kind,nodeId:""}:x))}/>
    <Input aria-label={`本地素材名称 ${i+1}`} className="!w-48" list={`dreamina-local-${i}`} maxLength={100} value={b.name} placeholder="本地素材名称" disabled={busy} onChange={e=>setBindings(v=>v.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/><datalist id={`dreamina-local-${i}`}>{local.filter(a=>a.kind===b.kind).map(a=><option key={a.id} value={a.title}/>)}</datalist>
    <Select aria-label={`已有画布素材 ${i+1}`} className="min-w-52 flex-1" showSearch optionFilterProp="label" placeholder="选择已有节点" value={b.nodeId||undefined} disabled={busy} options={nodes.filter(n=>n.type===b.kind).map(n=>({value:n.nodeId,label:(n.title||n.nodeId)+" · "+n.nodeId.slice(-6)}))} onChange={nodeId=>setBindings(v=>v.map((x,j)=>j===i?{...x,nodeId}:x))}/><Button disabled={busy} onClick={()=>setBindings(v=>v.filter((_,j)=>j!==i))}>移除</Button>
   </div>)}</div>
   <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={suggest}>按名称建议绑定</Button><Button disabled={busy} onClick={()=>setBindings(v=>[...v,{kind:"image",name:"",nodeId:""}])}>添加素材绑定</Button><Button type="primary" loading={busy} disabled={bindings.some(b=>!b.name.trim()||!b.nodeId)} onClick={()=>void action(()=>workbench().dreaminaCanvasConfigure({profile,projectKey,projectId:target.projectId,existingOnly:false,bindings}))}>保存引用设置</Button><span className="self-center text-xs text-muted-foreground">已读取 {nodes.length} 个媒体节点</span></div>
  </>}
 </Modal>;
}
