"use client";
import {useMemo,useState} from 'react';
import {Button,Select} from 'antd';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {useVideoStudioStore} from '@/stores/use-video-studio-store';
import type {StudioVideoGroup} from '../studio-model';
export function ComposerGroupNavigation({currentId,busy,onLoad}:{currentId:string;busy:boolean;onLoad:(group:StudioVideoGroup)=>Promise<void>}){
 const groups=useVideoStudioStore(s=>s.groups),projectId=useVideoStudioStore(s=>s.activeProjectId),folderId=useVideoStudioStore(s=>s.folderId),[loading,setLoading]=useState(false);
 const current=groups.find(g=>g.id===currentId&&g.projectId===projectId),scope=current?.folderId??folderId;
 const items=useMemo(()=>groups.filter(g=>g.projectId===projectId&&(!scope||g.folderId===scope)).slice().sort((a,b)=>a.number.localeCompare(b.number,'zh-CN',{numeric:true})||a.createdAt-b.createdAt),[groups,projectId,scope]);
 const index=items.findIndex(g=>g.id===currentId),disabled=busy||loading;
 const load=async(id:string)=>{const group=items.find(g=>g.id===id);if(!group||disabled)return;setLoading(true);try{await onLoad(group);}finally{setLoading(false);}};
 if(!items.length)return null;
 return <nav data-composer-group-navigation aria-label="切换视频组" className="inline-flex shrink-0 items-center gap-1"><Button size="small" aria-label="载入上一组" title="载入上一组" className="!h-7 !w-7 !p-0" icon={<ChevronLeft size={14}/>} disabled={disabled||index<=0} onClick={()=>void load(items[index-1].id)}><span className="sr-only">上一组</span></Button><Select size="small" aria-label="当前视频组" className="w-auto min-w-[68px]" popupMatchSelectWidth={false} styles={{popup:{root:{minWidth:220}}}} placeholder="选组" value={current?.id} labelRender={()=>current?<span className="text-xs font-medium">{current.number}</span>:<span className="text-xs text-muted-foreground">选组</span>} disabled={disabled} showSearch optionFilterProp="label" onSelect={id=>void load(id)} options={items.map((g,i)=>({value:g.id,label:g.number+' · '+g.title+'（'+(i+1)+'/'+items.length+'）'}))}/><Button size="small" aria-label="载入下一组" title="载入下一组" className="!h-7 !w-7 !p-0" icon={<ChevronRight size={14}/>} disabled={disabled||index===items.length-1} onClick={()=>void load(items[index+1].id)}><span className="sr-only">下一组</span></Button></nav>;
}
