"use client";
import {useEffect,useRef,useState} from "react";
import {Button,Checkbox,Modal} from "antd";
import {useConfigStore} from "@/stores/use-config-store";
import {useVideoStudioStore} from "@/stores/use-video-studio-store";
import {useAssetStore} from "@/stores/use-asset-store";
import {workbench} from "@/services/api/workbench";
import {applyProjectPrompt} from "@/app/(user)/video/project-prompt";
type Plan={token:string;name:string;webUrl:string;plans:{groupId:string;number:string;title:string;duration:number;status:string;error?:string;references:{kind:string;name:string}[];issues:{kind:string;name:string;reason:string}[]}[]};
const kindName=(kind:string)=>kind==="audio"?"♫ 音频":kind==="video"?"视频":kind==="image"?"图片":"素材";
export function DreaminaDraftManager({open,onClose,profile}:{open:boolean;onClose:()=>void;profile:string}){
 const projectKey=useVideoStudioStore(s=>s.activeProjectId),projects=useVideoStudioStore(s=>s.projects),allGroups=useVideoStudioStore(s=>s.groups),assets=useAssetStore(s=>s.assets),config=useConfigStore(s=>s.config);
 const project=projects.find(p=>p.id===projectKey),groups=allGroups.filter(g=>g.projectId===projectKey),prefs=config.dreaminaCanvasPreferences||{};
 const [selected,setSelected]=useState<string[]>([]),[plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[allowIncomplete,setAllowIncomplete]=useState(false);
 const generation=useRef(0),creating=useRef(false);
 useEffect(()=>{generation.current++;setPlan(null);setError("");setBusy(false);setAllowIncomplete(false);if(open)setSelected(groups.slice(0,2).map(g=>g.id));},[open,profile,projectKey]);
 const selectionKey=selected.join("|"),inputKey=JSON.stringify([groups,project?.globalPrompt,assets.filter(a=>project?.elementIds.includes(a.id)).map(a=>[a.id,a.title,a.kind,project?.elementRules?.[a.id]]),prefs]);
 useEffect(()=>{generation.current++;setPlan(null);setAllowIncomplete(false);setBusy(false);},[selectionKey,inputKey]);
 const inspect=async()=>{const ticket=++generation.current;setBusy(true);setError("");try{
  const result=await workbench().dreaminaDraftPreview({profile,projectKey,groups:groups.filter(g=>selected.includes(g.id)).map(g=>({...g,prompt:applyProjectPrompt(g.prompt,project?.globalPrompt).prompt})),assets:assets.filter(a=>project?.elementIds.includes(a.id)).map(a=>({id:a.id,title:a.title,kind:a.kind,referenceRule:project?.elementRules?.[a.id]})),model:prefs.videoModel,ratio:prefs.videoSize||"16:9",resolution:prefs.vquality||"720p"});
  if(generation.current===ticket)setPlan(result);
 }catch(e){if(generation.current===ticket)setError(e instanceof Error?e.message:"核对失败");}finally{if(generation.current===ticket)setBusy(false);}};
 const save=async()=>{if(!plan||creating.current)return;const ticket=++generation.current;creating.current=true;setBusy(true);setError("");try{const result=await workbench().dreaminaDraftCreate({profile,token:plan.token,groupIds:plan.plans.map(p=>p.groupId),allowIncomplete});if(generation.current===ticket)setPlan(result);}catch(e){if(generation.current===ticket)setError((e instanceof Error?e.message:"创建失败")+"；已保留原准备记录，再次点击会核对原节点。");}finally{creating.current=false;if(generation.current===ticket)setBusy(false);}};
 const missing=plan?.plans.some(p=>p.issues.length),saved=plan?.plans.every(p=>p.status==="saved");
 return <Modal title="准备画布视频草稿" open={open} width={820} footer={null} onCancel={()=>{if(!busy)onClose();}} closable={!busy} maskClosable={!busy} keyboard={!busy}>
  <div data-dreamina-drafts className="space-y-3">
   <p>{project?.name} · 按下方顺序从上到下排列。只保存草稿，由你在官网手动生成。</p>
   {project?.globalPrompt?.enabled&&<p className="text-xs text-muted-foreground">已启用项目全局提示词，核对与创建时会应用。</p>}
   <p className="text-xs text-muted-foreground">优先匹配锁定画布，再查本项目元素库。缺失与同名歧义会列出；本入口不会上传本地文件。</p>
   <div className="flex flex-wrap gap-3">{groups.map(g=><Checkbox key={g.id} disabled={busy} checked={selected.includes(g.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,g.id]:ids.filter(id=>id!==g.id));}}>{g.number} · {g.title}</Checkbox>)}</div>
   {!groups.length&&<p>本项目还没有视频组，请先导入视频组。</p>}
   <Button disabled={!selected.length} loading={busy} onClick={()=>void inspect()}>核对素材与时长</Button>
   {error&&<p role="alert" className="text-destructive">{error}</p>}
   {plan&&<><p>目标画布：<a href={plan.webUrl} target="_blank" rel="noopener noreferrer">{plan.name}</a></p>
    <div className="max-h-80 space-y-3 overflow-y-auto">{plan.plans.map(p=><section key={p.groupId} className="rounded border border-border p-3" data-draft-group={p.number}>
     <p className="font-medium">{p.number} · {p.title} · {p.duration??"未识别"} 秒 · {p.status==="saved"?"草稿已保存":"待保存"}</p>
     <p className="text-xs">已引用：{p.references.map(r=>kindName(r.kind)+"「"+r.name+"」").join("、")||"无"}</p>
     {p.error&&<p role="alert" className="text-destructive">{p.error}</p>}
     {p.issues.map((i,n)=><p key={n} className="text-xs text-destructive">{kindName(i.kind)}「{i.name}」：{i.reason}</p>)}
    </section>)}</div>
    {missing&&!saved&&<Checkbox checked={allowIncomplete} disabled={busy} onChange={e=>setAllowIncomplete(e.target.checked)}>保留未匹配文字，创建标有“待补素材”的草稿；我会在官网补齐后生成</Checkbox>}
    <Button type="primary" loading={busy} disabled={saved||plan.plans.some(p=>p.error)||Boolean(missing&&!allowIncomplete)} onClick={()=>void save()}>仅创建 {plan.plans.length} 个草稿</Button>
    {saved&&<p role="status">已保存并核对正文 @资产标签、引用和纵向位置。请打开上方画布链接，由你手动生成。</p>}
   </>}
  </div>
 </Modal>;
}
