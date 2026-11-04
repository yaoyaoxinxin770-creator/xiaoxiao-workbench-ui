import type {GenerationLog} from './page';
import {type Placement,type StudioProject,type StudioVideoGroup} from './studio-model';
export type PromptChange={id:string;number:string;before:string;after:string;count:number};
export const replacePromptText=(source:string,find:string,replacement:string)=>find?source.split(find).join(replacement):source;
export function previewPromptReplacement(groups:StudioVideoGroup[],project:StudioProject,folderId:string,placements:Record<string,Placement>,find:string,replacement:string,logs:GenerationLog[]=[]):PromptChange[]{
 if(!find||find===replacement)return [];
 const folders=folderId?new Set([folderId]):null;
 return groups.filter(group=>groupCanReplacePrompt(group,logs)&&group.projectId===project.id&&(!group.logIds.length?!folders||folders.has(group.folderId):group.logIds.some(id=>{const place=placements[id];return !place?.trashedAt&&(!folders||folders.has(place?.folderId??group.folderId));}))).flatMap(group=>{const after=replacePromptText(group.prompt,find,replacement);return after===group.prompt?[]:[{id:group.id,number:group.number,before:group.prompt,after,count:group.prompt.split(find).length-1}];});
}

export function groupCanReplacePrompt(group:StudioVideoGroup,logs:GenerationLog[]){
 if(!group.logIds.length)return true;
 return group.logIds.every(id=>{const log=logs.find(l=>l.id===id);if(['unknown','completed','success','succeeded','awaiting_interpolation','interpolating','processing','running'].includes((log?.task?.status||'').toLowerCase()))return false;return Boolean(log&&!log.video&&log.status!=='成功'&&(log.status==='失败'||log.task?.preparationOnly&&log.task?.status==='awaiting_confirmation'));});
}
