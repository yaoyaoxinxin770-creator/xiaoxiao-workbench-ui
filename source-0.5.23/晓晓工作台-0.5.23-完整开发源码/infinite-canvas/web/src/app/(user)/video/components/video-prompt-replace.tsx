"use client";
import {useEffect,useState} from 'react';
import {App,Button,Input} from 'antd';
import {Search} from 'lucide-react';
import {useVideoStudioStore} from '@/stores/use-video-studio-store';
import {createStore} from '@/lib/idb-store';
import type {GenerationLog} from '../page';
import {previewPromptReplacement} from '../prompt-replacement';
const replacementLogs=createStore("video_generation_logs");
export function VideoPromptReplace({search,onSearch,disabled=false}:{search:string;onSearch:(value:string)=>void;disabled?:boolean}){
 const {message}=App.useApp(),projectId=useVideoStudioStore(s=>s.activeProjectId),folderId=useVideoStudioStore(s=>s.folderId);
 const [find,setFind]=useState(search),[replacement,setReplacement]=useState('');
 useEffect(()=>setFind(search),[search,projectId,folderId]);
 const apply=async()=>{const state=useVideoStudioStore.getState(),project=state.projects.find(p=>p.id===projectId);if(!project||!find)return;
  const logs:GenerationLog[]=[];await replacementLogs.iterate<GenerationLog,void>(log=>{logs.push(log);});const changes=previewPromptReplacement(state.groups,project,folderId,state.placements,find,replacement,logs);
  if(!changes.length){message.info('当前范围没有可替换的未生成视频组，已生成及进行中的视频已跳过');return;}
  try{const updated=state.replaceGroupPrompts(projectId,changes,find,replacement,logs);message.success('已替换 '+updated+' 组，共 '+changes.reduce((n,c)=>n+c.count,0)+' 处');}catch(error){message.error(error instanceof Error?error.message:'替换失败');}
 };
 return <div data-prompt-search-replace className="flex w-full items-center gap-2">
  <Input aria-label="搜索视频项目资产" placeholder="搜索名称或提示词" className="min-w-0 flex-1" value={find} onChange={e=>setFind(e.target.value)} onPressEnter={()=>onSearch(find)} suffix={<button type="button" aria-label="搜索视频" title="搜索" onClick={()=>onSearch(find)} className="flex items-center text-muted-foreground"><Search className="size-4"/></button>}/>
  <Button aria-label="替换视频提示词文本" disabled={disabled||!find||find===replacement} title="只替换未生成视频组，已成片和进行中任务保留原参数" onClick={()=>void apply().catch(error=>message.error(error.message||"替换失败"))}>替换</Button>
  <Input aria-label="替换为视频提示词文本" placeholder="替换为（留空则删除）" className="min-w-0 flex-1" value={replacement} onChange={e=>setReplacement(e.target.value)} disabled={disabled}/>
 </div>;
}
