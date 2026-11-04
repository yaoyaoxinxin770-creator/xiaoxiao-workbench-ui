import {useAssetStore} from '@/stores/use-asset-store';
import {oiiGlobalAsset,withOiiGlobalVideo} from '@/app/(user)/video/oii-global-reference';
import {confirmCliVideoGeneration} from './cli-video-mode';
import {matchPromptAssets} from '@/app/(user)/video/prompt-references';
import type {DreaminaPromptContext} from './dreamina';
import {nanoid} from 'nanoid';
import {channelProtocolForConfig,type AiConfig} from '@/stores/use-config-store';
import {workbench} from './workbench';
import {imageReferences,mediaReferences,ratioForSize} from './pippit';
import {uploadImage} from '@/services/image-storage';
import type {ReferenceImage} from '@/types/image';
import type {CanvasImageTask} from './image';
import {uploadMediaFile} from '@/services/file-storage';
import type {VideoReferenceInput,VideoResponse} from './video';
export const isOiioiiConfig=(config:AiConfig)=>config.channelMode==='local'&&channelProtocolForConfig(config)==='oiioii-cli';
export async function submitOiioiiVideo(config:AiConfig,prompt:string,input:VideoReferenceInput,clientTaskId=nanoid(),promptContext?:DreaminaPromptContext):Promise<VideoResponse>{
 const global=oiiGlobalAsset(config,useAssetStore.getState().assets);input={...input,videoReferences:withOiiGlobalVideo(config,useAssetStore.getState().assets,input.videoReferences||[])};
 await confirmCliVideoGeneration("Oii",config.oiioiiGenerationMode);
 const frames=[input.firstFrame,input.lastFrame].filter((ref):ref is NonNullable<typeof ref>=>Boolean(ref));
 if(input.lastFrame&&!input.firstFrame)throw Error('请先选择首帧');
 if(frames.length&&((input.references?.length||0)+(input.videoReferences?.length||0)+(input.audioReferences?.length||0)))throw Error('首尾帧与普通参考素材不能混用');
 const sources=[...(frames.length?frames:input.references||[]).map((r,i)=>({...r,kind:'image',slot:'图片'+(i+1)})),...(input.videoReferences||[]).map((r,i)=>({...r,kind:'video',slot:'视频'+(i+1)})),...(input.audioReferences||[]).map((r,i)=>({...r,kind:'audio',slot:'音频'+(i+1)}))];
 const assets=promptContext?.assets||sources.map(r=>({id:r.assetId||r.id,title:r.name,kind:r.kind}));
 const report=matchPromptAssets(prompt,assets,promptContext?.bindings),insertions=new Map<number,string[]>(),used=new Set<string>();
 for(const b of report.bindings){const ref=sources.find(r=>r.kind===b.kind&&(r.assetId?r.assetId===b.asset.id:r.name===b.asset.title));if(!ref)continue;const tags=insertions.get(b.end)||[];if(!tags.includes('@'+ref.slot))tags.push('@'+ref.slot);insertions.set(b.end,tags);used.add(ref.slot);}
 let resolvedPrompt=prompt;for(const [end,tags] of [...insertions].sort((a,b)=>b[0]-a[0]))resolvedPrompt=resolvedPrompt.slice(0,end)+' '+tags.join(' ')+resolvedPrompt.slice(end);
 const unplaced=sources.filter(r=>!used.has(r.slot)&&!(r.kind==='video'&&r.assetId===global?.id));if(unplaced.length)resolvedPrompt+='\n\n'+unplaced.map(r=>r.name+' @'+r.slot).join('\n');
 return workbench().oiioiiSubmit({creationMode:config.oiioiiGenerationMode==='draft'?'draft':'direct',type:'video',model:config.model,prompt:resolvedPrompt,clientTaskId,ratio:ratioForSize(config.size),resolution:config.vquality==='auto'?undefined:/[pk]$/i.test(config.vquality)?config.vquality:config.vquality+'p',duration:Number(config.videoSeconds),firstLast:frames.length>0,references:[...await imageReferences(frames.length?frames:input.references||[]),...await mediaReferences(input.videoReferences||[],'video'),...await mediaReferences(input.audioReferences||[],'audio')]});
}
const completed=new Map<string,Promise<VideoResponse>>();
export async function pollOiioiiVideo(id:string):Promise<VideoResponse>{
 if(completed.has(id))return completed.get(id)!;
 const task=await workbench().oiioiiQuery(id);if(task.status!=='completed')return task;
 const pending=(async()=>{const media=await uploadMediaFile(task.media[0].dataUrl,'video');return {...task,media:undefined,url:media.url,video_url:media.url,storageKey:media.storageKey};})();completed.set(id,pending);try{return await pending;}catch(e){completed.delete(id);throw e;}
}

export async function submitOiioiiImage(config:AiConfig,prompt:string,references:ReferenceImage[],clientTaskId=nanoid()):Promise<CanvasImageTask>{if(Number(config.count)>1)throw Error('Oii 当前每次创建一张图片，请将张数设为 1');return workbench().oiioiiSubmit({type:'image',model:config.model,prompt,clientTaskId,ratio:ratioForSize(config.size),resolution:config.quality==='auto'?undefined:config.quality,references:await imageReferences(references)});}
const completedImages=new Map<string,Promise<CanvasImageTask>>();
export async function pollOiioiiImage(id:string):Promise<CanvasImageTask>{if(completedImages.has(id))return completedImages.get(id)!;const task=await workbench().oiioiiQuery(id);if(task.status!=='completed')return task;const pending=(async()=>{const imageStorage=await Promise.all(task.media.map((item:{dataUrl:string})=>uploadImage(item.dataUrl,{localOnly:true})));const urls=imageStorage.map(item=>item.url);return {...task,media:undefined,imageStorage,image_urls:urls,image_url:urls[0],url:urls[0],storageKey:imageStorage[0]?.storageKey};})();completedImages.set(id,pending);try{return await pending;}catch(e){completedImages.delete(id);throw e;}}

export function oiioiiReferenceLimits(config:AiConfig,model:string){
 const row=config.localChannels.find(c=>c.id===config.videoChannelId)?.oiioiiModels?.[model],media=row?.generation_input_contract?.media;
 return {images:row?.reference_image_count_max??50,videos:media?.video===false?0:50,audios:media?.audio===false?0:50,imageMaxBytes:128*1024*1024,videoMaxBytes:128*1024*1024,audioMaxBytes:128*1024*1024,maxDurationMs:Infinity,totalDurationMs:Infinity,audioMinDurationMs:0,audioMaxDurationMs:Infinity,totalAudioDurationMs:Infinity};
}
