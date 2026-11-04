import type {GenerationLog} from './page';
import {inStudioScope,placementFor,studioVideoNumber,type Placement,type StudioProject,type StudioVideoGroup} from './studio-model';
// Only known pre-submission failures share a replaceable slot. Uncertain and platform outcomes remain visible.
export function isLocalPreparationFailure(log:GenerationLog){
 if(log.status!=="失败"||log.video)return false;
 if(/违规|审核|内容安全|敏感|moderation|safety/iu.test(log.error||''))return false;
 const state=(log.task?.status||'').toLowerCase();
 if(['failed','fail','error'].includes(state)&&!/素材引用未就绪|锁定画布中未核对到|已取消生成.*未提交扣费/u.test(log.error||''))return false;
 return /素材引用未就绪|锁定画布中未核对到|已取消生成.*未提交扣费/u.test(log.error||'')||!log.task||/^(?:dreamina(?:-canvas)?:)?client_video_task_/.test(log.task.id)&&['queued','preparing',''].includes(state);
}
export function visibleStudioLogs(logs:GenerationLog[],groups:StudioVideoGroup[],placements:Record<string,Placement>){
 const hidden=new Set<string>(),byId=new Map(logs.map(log=>[log.id,log]));
 for(const group of groups){let pending:GenerationLog|undefined;
  const attempts=group.logIds.map(id=>byId.get(id)).filter((log):log is GenerationLog=>Boolean(log)&&!placementFor(placements,log!.id).trashedAt).sort((a,b)=>a.createdAt-b.createdAt||group.logIds.indexOf(a.id)-group.logIds.indexOf(b.id));
  for(const log of attempts){if(isLocalPreparationFailure(log)){if(pending)hidden.add(pending.id);pending=log;}else{if(pending)hidden.add(pending.id);pending=undefined;}}
 }
 return logs.filter(log=>!hidden.has(log.id));
}
export function compareStudioResults(a:GenerationLog,b:GenerationLog,sort:string,groups:StudioVideoGroup[]){
 const group=(log:GenerationLog)=>groups.find(g=>g.logIds.includes(log.id)||log.id==='group:'+g.id);
 const ga=group(a),gb=group(b),date=(log:GenerationLog,g?:StudioVideoGroup)=>g?.createdAt??log.createdAt??0;
 if(sort==='name'){const numbered=(log:GenerationLog,g?:StudioVideoGroup)=>Boolean(g?.number||[log.prompt,log.title].some(text=>/【\s*视频编号\s*[Vv]?\d+/.test(text||'')));if(numbered(a,ga)!==numbered(b,gb))return numbered(a,ga)?-1:1;return studioVideoNumber(a,1,ga).localeCompare(studioVideoNumber(b,1,gb),'zh-CN',{numeric:true})||(a.title||ga?.title||'').localeCompare(b.title||gb?.title||'','zh-CN',{numeric:true})||date(a,ga)-date(b,gb);}
 return sort==='oldest'?date(a,ga)-date(b,gb):date(b,gb)-date(a,ga);
}
// A placeholder and every attempt in its group share the original manual slot.
export function studioResultRank(log:GenerationLog,order:string[],groups:StudioVideoGroup[]){
 const own=order.indexOf(log.id);if(own>=0)return own;
 const group=groups.find(g=>g.logIds.includes(log.id)||log.id==='group:'+g.id);
 if(!group)return order.length;
 const anchor=(g:StudioVideoGroup)=>{const ids=new Set(['group:'+g.id,...g.logIds]);return order.findIndex(id=>ids.has(id));};
 const rank=anchor(group);if(rank>=0)return rank;
 // A group absent from an older saved order belongs beside its imported neighbours.
 const at=groups.indexOf(group),step=groups.length+1;
 for(let i=at+1;i<groups.length;i++){const next=anchor(groups[i]);if(next>=0)return next-(i-at)/step;}
 for(let i=at-1;i>=0;i--){const previous=anchor(groups[i]);if(previous>=0)return previous+(at-i)/step;}
 return order.length+at/step;
}
export function shortcutScopeIds(logs:GenerationLog[],project:StudioProject,folderId:string,placements:Record<string,Placement>){
 return logs.filter(log=>log.video&&inStudioScope(placementFor(placements,log.id),project,folderId,false)).map(log=>log.id);
}
export function studioVideoChannel(log:Pick<GenerationLog,'task'|'config'|'model'>):'dreamina'|'oiioii'|'pippit'|'other'{
 const id=log.task?.id||'',channelId=log.config?.videoChannelId||log.config?.activeChannelId||'';
 if(id.startsWith('dreamina:')||id.startsWith('dreamina-canvas:')||id.startsWith('dreamina-agent:')||channelId.startsWith('local-dreamina'))return 'dreamina';
 if(id.startsWith('oiioii:')||channelId==='local-oiioii')return 'oiioii';
 if(id.startsWith('pippit:')||channelId==='local-pippit')return 'pippit';
 return 'other';
}
export function isInterpolatedVideoLog(log:Pick<GenerationLog,'task'>):boolean{
 return Boolean(log.task?.interpolatedNodeId||(log.task?.interpolatedFps&&log.task.interpolatedFps>0));
}
export function projectUsedModels(logs:Pick<GenerationLog,'id'|'model'>[],placements:Record<string,Placement>,projectId:string,trash=false):string[]{
 return Array.from(new Set(logs.filter(log=>placementFor(placements,log.id).projectId===projectId&&Boolean(placementFor(placements,log.id).trashedAt)===trash&&log.model&&log.model!=='导入视频').map(log=>log.model)));
}
export function manualGenerationLabel(log:GenerationLog){
 const site=studioVideoChannel(log);
 const label=site==='dreamina'?'即梦':site==='oiioii'?'Oii':site==='pippit'?'小云雀':'对应平台';
 return '节点已建立 · '+label+'官网手动生成';
}

export function isUnreadVideo(log:GenerationLog,placement:Placement){
 return log.status==='成功'&&Boolean(log.video)&&log.model!=='导入视频'&&(placement.lastViewedAt||0)<(log.completionNotifiedAt||log.lastPolledAt||log.createdAt);
}

export function groupNeedsPlaceholder(group:StudioVideoGroup,logs:GenerationLog[],hideFailed:boolean,placements:Record<string,Placement>={}){
 const attempts=logs.filter(l=>group.logIds.includes(l.id)&&!placementFor(placements,l.id).trashedAt);
 if(!attempts.length)return true;
 return hideFailed&&attempts.every(l=>l.status==='失败')&&attempts.some(isLocalPreparationFailure);
}
