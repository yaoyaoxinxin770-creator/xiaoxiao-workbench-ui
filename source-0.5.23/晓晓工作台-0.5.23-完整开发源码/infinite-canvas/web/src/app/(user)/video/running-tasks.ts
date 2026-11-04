import type {GenerationLog} from './page';
import {placementFor,studioVideoNumber,type StudioProject,type StudioVideoGroup,type Placement} from './studio-model';
export type WorkbenchTaskItem={id:string;projectId:string;projectName:string;folderId:string;title:string;phase:string;active:boolean;progress?:number};
export function runningTaskItems(logs:GenerationLog[],projects:StudioProject[],groups:StudioVideoGroup[],placements:Record<string,Placement>):WorkbenchTaskItem[]{
 const seen=new Set<string>(),unique=[...logs].filter(log=>!placementFor(placements,log.id).trashedAt).sort((a,b)=>b.createdAt-a.createdAt).filter(log=>{const key=log.task?.id||log.id;if(seen.has(key))return false;seen.add(key);return true;});
 return unique.filter(log=>!log.video&&log.status!=='成功'&&log.status!=='失败').map(log=>{const p=placementFor(placements,log.id),state=(log.task?.status||'').toLowerCase();let active=log.status==='生成中',phase='生成中';
 if(log.interruptedAt){active=false;phase='本地已中断';}
 else if(log.status==='待核对'||['unknown','failed','error','completed','success','succeeded','cancelled','canceled'].includes(state)){active=false;phase='结果待核对';}
 else if(state==='awaiting_confirmation'){active=false;phase=log.task?.preparationOnly?'等待官网生成':'等待确认';}
 else if(['awaiting_interpolation','interpolating'].includes(state))phase='补帧中';
 else if(['queued','preparing'].includes(state)||!log.task)phase='正在建立节点';
 return {id:log.id,projectId:p.projectId,folderId:p.folderId,projectName:projects.find(x=>x.id===p.projectId)?.name||'视频项目',title:'视频 '+studioVideoNumber(log,1,groups.find(g=>g.logIds.includes(log.id))),phase,active,progress:log.task?.progress};});
}
export const videoLocationUrl=(projectId:string,id:string)=>'/video?project='+encodeURIComponent(projectId)+'&video='+encodeURIComponent(id);
