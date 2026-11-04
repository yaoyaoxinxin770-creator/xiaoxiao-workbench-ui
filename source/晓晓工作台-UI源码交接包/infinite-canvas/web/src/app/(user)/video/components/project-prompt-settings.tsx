"use client";
import {MarkdownFileImport} from '@/components/markdown-file-import';
import {splitSourceSegments} from '../video-group-parser';
import {useState} from 'react';
import {App,Button,Checkbox,Input,Modal,Select} from 'antd';
import {useVideoStudioStore} from '@/stores/use-video-studio-store';
import {applyProjectPrompt,projectPromptRules,type ProjectPrompt,type ProjectPromptRule} from '../project-prompt';
export function ProjectPromptSettings(){
 const projects=useVideoStudioStore(s=>s.projects),projectId=useVideoStudioStore(s=>s.activeProjectId),groups=useVideoStudioStore(s=>s.groups),drafts=useVideoStudioStore(s=>s.drafts),editProject=useVideoStudioStore(s=>s.editProject),project=projects.find(p=>p.id===projectId);
 const {message}=App.useApp(),[open,setOpen]=useState(false),[rule,setRule]=useState<ProjectPrompt>({enabled:false,text:'',position:'end'});
 const [fileGroups,setFileGroups]=useState<{id:string;prompt:string}[]>([]);
 const entries=projectPromptRules(rule),change=(index:number,patch:Partial<ProjectPromptRule>)=>setRule(value=>index===0?{...value,...patch,...(patch.enabled!==undefined?{enabled:value.enabled,primaryEnabled:patch.enabled}:{})}:{...value,additional:(value.additional||[]).map((entry,i)=>i===index-1?{...entry,...patch}:entry)});
 const invalid=rule.enabled&&(!entries.some(entry=>entry.enabled&&entry.text.trim())||entries.some(entry=>entry.enabled&&entry.text.trim()&&entry.position==='afterHeading'&&!entry.heading?.trim()));
 const source=groups.find(g=>g.projectId===projectId)?.prompt||drafts[projectId]?.prompt||'',preview=applyProjectPrompt(source,rule),missing=groups.filter(g=>g.projectId===projectId&&applyProjectPrompt(g.prompt,rule).missingHeading).length;
 return <><Button type="default" onClick={()=>{setRule(project?.globalPrompt?{...project.globalPrompt,additional:project.globalPrompt.additional?.map(entry=>({...entry}))}:{enabled:false,text:'',position:'end'});setOpen(true);}}>全局提示词</Button>
 <Modal title="项目全局提示词" open={open} onCancel={()=>setOpen(false)} okText="保存设置" cancelText="取消" width={760} styles={{body:{maxHeight:"70vh",overflowY:"auto"}}} okButtonProps={{disabled:invalid}} onOk={()=>{editProject({globalPrompt:{...rule,text:rule.text.trim(),heading:rule.heading?.trim().replace(/^【|】$/g,''),additional:rule.additional?.map(entry=>({...entry,text:entry.text.trim(),heading:entry.heading?.trim().replace(/^【|】$/g,'')}))}},projectId);setOpen(false);message.success('项目全局提示词已保存，应用于后续新建节点');}}>
  <p className="mb-3 text-sm">{project?.name} · 应用于本项目全部视频组，普通创建和准备画布草稿都会使用。原稿保留，已创建的节点不改写。</p>
  <Checkbox checked={rule.enabled} onChange={e=>setRule(v=>({...v,enabled:e.target.checked}))}>启用项目全局提示词</Checkbox>
  {entries.map((entry,index)=><div key={index} className="my-3 rounded-xl border border-border p-3" data-global-prompt-rule={index+1}>
   <div className="flex items-center justify-between"><Checkbox checked={entry.enabled} onChange={e=>change(index,{enabled:e.target.checked})}>提示词 {index+1}</Checkbox>{index>0&&<Button size="small" danger onClick={()=>setRule(value=>({...value,additional:value.additional?.filter((_,i)=>i!==index-1)}))}>删除提示词 {index+1}</Button>}</div>
   <div className="my-3"><MarkdownFileImport onImport={text=>{const groups=splitSourceSegments(text);if(groups.length)setFileGroups(groups);else change(index,{text});}}/></div>
   <label className="my-3 block">提示词内容<Input.TextArea aria-label={index?'全局提示词内容 '+(index+1):'全局提示词内容'} className="mt-1" autoSize={{minRows:3,maxRows:8}} value={entry.text} onChange={e=>change(index,{text:e.target.value})}/></label>
   <label className="mb-3 block">添加位置<Select aria-label={index?'全局提示词位置 '+(index+1):'全局提示词位置'} className="mt-1 w-full" value={entry.position} onChange={position=>change(index,{position})} options={[{value:'start',label:'每组提示词开头'},{value:'end',label:'每组提示词结尾'},{value:'afterHeading',label:'指定标题后面'}]}/></label>
   {entry.position==='afterHeading'&&<label className="mb-3 block">标题名称<Input aria-label={index?'全局提示词目标标题 '+(index+1):'全局提示词目标标题'} className="mt-1" value={entry.heading||''} onChange={e=>change(index,{heading:e.target.value})} placeholder="例如：全局视觉（可带【】）"/><span className="text-xs text-muted-foreground">紧跟标题插入；没有这个标题时追加到结尾。</span></label>}
  </div>)}
  <Button className="mb-3" onClick={()=>setRule(value=>({...value,additional:[...(value.additional||[]),{enabled:true,text:'',position:'start'}]}))}>新增全局提示词</Button>
  {missing>0&&<p className="mb-3 text-xs text-muted-foreground">当前 {missing} 组缺少指定标题，对应内容会追加到结尾。</p>}
  <details><summary>查看第一组应用效果</summary><Input.TextArea aria-label="全局提示词预览" className="mt-2" readOnly autoSize={{minRows:4,maxRows:10}} value={source?preview.prompt:'添加视频组后可预览完整提示词。'}/></details>
 </Modal><Modal title="从 MD 导入视频组" open={fileGroups.length>0} onCancel={()=>setFileGroups([])} okText={"导入 "+fileGroups.length+" 组"} cancelText="取消" onOk={()=>{try{const studio=useVideoStudioStore.getState(),count=studio.importGroups(fileGroups,studio.folderId);setFileGroups([]);setOpen(false);message.success("已导入 "+count+" 组视频提示词");}catch(error){message.error(error instanceof Error?error.message:"导入失败");}}}><p>识别到视频编号：{fileGroups.map(g=>g.id).join("、")}。</p><p className="mt-2 text-sm text-muted-foreground">只取第三部分中的视频提示词正文，忽略组标题和末尾确认事项。</p></Modal></>;
}
