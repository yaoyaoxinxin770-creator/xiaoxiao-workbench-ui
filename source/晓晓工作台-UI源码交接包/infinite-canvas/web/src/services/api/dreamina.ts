import { nanoid } from "nanoid";
import {SEEDANCE_REFERENCE_LIMITS} from "@/lib/seedance-video";
import type { AiConfig } from "@/stores/use-config-store";
import { channelProtocolForConfig } from "@/stores/use-config-store";
import { uploadMediaFile } from "@/services/file-storage";
import type { ReferenceImage } from "@/types/image";
import type { VideoReferenceInput, VideoResponse } from "./video";
import { imageReferences, mediaReferences, ratioForSize } from "./pippit";
import { workbench } from "./workbench";
export const isDreaminaConfig=(config:AiConfig)=>config.channelMode==="local"&&channelProtocolForConfig(config)==="dreamina-cli";
export const isDreaminaTask=(id?:string)=>Boolean(id?.startsWith("dreamina:")||id?.startsWith("dreamina-canvas:")||id?.startsWith("dreamina-agent:"));
export const dreaminaVersionForConfig=(config:AiConfig)=>config.videoChannelId==="local-dreamina"?"legacy":"canvas";
export function dreaminaReferenceLimits(config:AiConfig,model:string){
 const refs=config.localChannels.find(c=>c.id===config.videoChannelId)?.cliVideoSpecs?.[model]?.references;
 const modern=dreaminaVersionForConfig(config)==='canvas';
 return {...SEEDANCE_REFERENCE_LIMITS,...refs,...(modern?{maxDurationMs:refs?.maxDurationMs??Infinity,totalDurationMs:refs?.totalDurationMs??Infinity,audioMinDurationMs:refs?.audioMinDurationMs??0,audioMaxDurationMs:refs?.audioMaxDurationMs??Infinity,totalAudioDurationMs:refs?.totalAudioDurationMs??Infinity}:{audioMinDurationMs:2000,audioMaxDurationMs:refs?.maxDurationMs??SEEDANCE_REFERENCE_LIMITS.maxDurationMs,totalAudioDurationMs:refs?.totalDurationMs??refs?.maxDurationMs??SEEDANCE_REFERENCE_LIMITS.totalDurationMs,...(refs?.maxDurationMs?{maxDurationMs:refs.maxDurationMs,totalDurationMs:refs.totalDurationMs??refs.maxDurationMs}:{})})};
}
export function dreaminaVideoConfig(base:AiConfig,local:AiConfig):AiConfig {
 const version=local.dreaminaVersion||"canvas",id=version==="canvas"?"local-dreamina-canvas":"local-dreamina",channel=local.localChannels.find(c=>c.id===id),prefs=(version==="canvas"?local.dreaminaCanvasPreferences:local.dreaminaPreferences)||{};
 return {...base,dreaminaVersion:version,dreaminaLegacyMode:local.dreaminaLegacyMode||"direct",dreaminaGenerationMode:version==="canvas"?local.dreaminaGenerationMode:"confirm",dreaminaAccountProfile:local.dreaminaAccountProfile,dreaminaInterpolationFps:local.dreaminaInterpolationFps??30,generationProvider:"other",channelMode:"local",localChannels:channel?[channel]:[],model:prefs.videoModel||channel?.models[0]||"",videoModel:prefs.videoModel||channel?.models[0]||"",videoModels:channel?.models||[],models:channel?.models||[],activeChannelId:id,videoChannelId:id,otherVideoChannelId:id,videoWorkflowRef:undefined,videoSize:prefs.videoSize||"16:9",vquality:prefs.vquality||"720p",videoSeconds:prefs.videoSeconds||"5",videoGenerateAudio:"false"};
}
export type DreaminaPromptContext={autoMatch?:boolean;assets:{id:string;title:string;kind:"image"|"video"|"audio";category?:string;referenceRule?:{disabled?:boolean;priority?:number;name?:string}}[];bindings:Record<string,string>};
export async function submitDreaminaVideo(config:AiConfig,prompt:string,input:VideoReferenceInput,clientTaskId=nanoid(),projectKey?:string,promptContext?:DreaminaPromptContext,onPreparation?:(task:VideoResponse)=>void,onReferencesResolved?:(input:VideoReferenceInput)=>void|Promise<void>):Promise<VideoResponse>{
 const creationMode=dreaminaVersionForConfig(config)==="canvas"?config.dreaminaGenerationMode:"confirm";
 const capturedContext=promptContext?{...(promptContext.autoMatch===undefined?{}:{autoMatch:promptContext.autoMatch}),assets:promptContext.assets.map(a=>({...a,...(a.referenceRule?{referenceRule:{...a.referenceRule}}:{})})),bindings:{...promptContext.bindings}}:undefined;
 const accountProfile=dreaminaVersionForConfig(config)==="canvas"?(config.dreaminaAccountProfile||(await workbench().dreaminaAccounts()).activeProfile):undefined;
 const frames=[input.firstFrame,input.lastFrame].filter((r):r is ReferenceImage=>Boolean(r));
 if(input.lastFrame&&!input.firstFrame)throw Error("请先指定首帧");
 if(frames.length&&((input.references?.length||0)+(input.videoReferences?.length||0)+(input.audioReferences?.length||0)))throw Error("首尾帧与普通参考素材不能混用");
 const canvasCapture=accountProfile&&workbench().dreaminaCanvasCapture?(await workbench().dreaminaCanvasCapture({profile:accountProfile,projectKey})).token:undefined;
 const legacyMode=dreaminaVersionForConfig(config)==="legacy"?config.dreaminaLegacyMode||"direct":undefined;
 const legacyAgentCapture=legacyMode==="agent"?await workbench().dreaminaLegacyAgentCapture({projectKey}):undefined;
 const resolvedInput={...input,references:[...(input.references||[])],videoReferences:[...(input.videoReferences||[])],audioReferences:[...(input.audioReferences||[])]};
 const sources=[...(frames.length?frames:input.references||[]),...input.videoReferences||[],...input.audioReferences||[]];
 const references=[...await imageReferences(frames.length?frames:input.references||[]),...await mediaReferences(input.videoReferences||[],"video"),...await mediaReferences(input.audioReferences||[],"audio")].map((r,i)=>({...r,assetId:sources[i]?.assetId}));
 if(dreaminaVersionForConfig(config)==='canvas'&&capturedContext?.autoMatch!==false&&capturedContext&&frames.length===0){
  const needed=await workbench().dreaminaReferenceNeeds({profile:accountProfile,projectKey,canvasCapture,prompt,promptContext:capturedContext,references,firstLast:false});
  for(const id of needed.assetIds as string[]){const {useAssetStore}=await import('@/stores/use-asset-store'),{refreshLocalAsset}=await import('./local-assets');if(references.some(r=>r.assetId===id))continue;const frozen=capturedContext.assets.find(a=>a.id===id),found=useAssetStore.getState().assets.find(a=>a.id===id);if(!frozen||!found||found.kind==='text'||frozen.referenceRule?.disabled)throw Error('项目参考素材已变化，请重新载入本组');const asset=found.localFile?await refreshLocalAsset(found):found;
   if(asset.kind==='image'){const selected={id:asset.id,assetId:asset.id,name:frozen.title,type:asset.data.mimeType,dataUrl:asset.data.dataUrl,storageKey:asset.data.storageKey};const r=await imageReferences([selected]);references.push({...r[0],assetId:id});resolvedInput.references.push(selected);}
   else if(asset.kind==='audio'||asset.kind==='video'){const selected={id:asset.id,assetId:asset.id,name:frozen.title,type:asset.data.mimeType,url:asset.data.url,storageKey:asset.data.storageKey||'',...(asset.kind==='audio'?{durationMs:asset.data.durationMs}:{})};const r=await mediaReferences([selected],asset.kind);references.push({...r[0],assetId:id});if(asset.kind==='audio')resolvedInput.audioReferences.push(selected);else resolvedInput.videoReferences.push(selected);}
  }
 }
 if(references.length>sources.length)await onReferencesResolved?.(resolvedInput);
 const pending=workbench().dreaminaSubmit({version:dreaminaVersionForConfig(config),returnMode:dreaminaVersionForConfig(config)==='canvas'?(config.dreaminaInterpolationFps===0?'original':'interpolated'):undefined,interpolationFps:dreaminaVersionForConfig(config)==='canvas'?(config.dreaminaInterpolationFps??30):undefined,legacyMode,legacyAgentCapture,accountProfile,projectKey,canvasCapture,model:config.model,prompt,clientTaskId,ratio:ratioForSize(config.size),resolution:config.vquality==="auto"?"720p":/p$|k$/i.test(config.vquality)?config.vquality:config.vquality+"p",duration:Number(config.videoSeconds),firstLast:frames.length>0,references,promptContext:capturedContext});
 let polling=false,finished=false;
 const timer=onPreparation&&dreaminaVersionForConfig(config)==="canvas"?setInterval(async()=>{if(polling||finished)return;polling=true;try{const state=await workbench().dreaminaQuery('dreamina-canvas:'+clientTaskId);if(!finished&&['queued','preparing'].includes(state.status||''))onPreparation(state);}catch{/* Submission owns errors; progress reads never trigger retries. */}finally{polling=false;}},500):undefined;
 let task:VideoResponse;try{task=await pending;}finally{finished=true;if(timer)clearInterval(timer);}
 onPreparation?.(task);
 task=await confirmDreaminaDraft(task,creationMode);
 window.dispatchEvent(new Event("dreamina-credits-changed"));return {...task,channelId:config.videoChannelId,userChannelId:config.videoChannelId};
}
const completed=new Map<string,Promise<VideoResponse>>();
export async function pollDreaminaVideo(id:string,returnMode?:string):Promise<VideoResponse>{
 if(completed.has(id))return completed.get(id)!;
 const task=await workbench().dreaminaQuery(id,...(returnMode==='interpolated'?[{returnMode}]:[]));
 if(task.status!=="completed")return task;
 if(task.remoteOnly&&task.canvasUrl)return task;
 const pending=(async()=>{const media=task.media?.[0];if(!media?.dataUrl)throw Error("即梦生成完成但没有可读取的视频");const stored=await uploadMediaFile(media.dataUrl,"video");return {...task,media:undefined,video_url:stored.url,url:stored.url,storageKey:stored.storageKey};})();
 completed.set(id,pending);try{return await pending;}catch(error){completed.delete(id);throw error;}
}

export async function confirmDreaminaDraft(task:VideoResponse,mode:AiConfig["dreaminaGenerationMode"]="confirm"):Promise<VideoResponse>{
 if(task.status==="awaiting_confirmation"){
  if(mode==="draft")return {...task,preparationOnly:true};
  if(!task.quote?.confirmable||(!Number.isInteger(task.quote.credits)||task.quote.credits<0))throw Error("即梦暂时无法报价，草稿已保留，请在画布核对");
  const creditCeiling=mode==="direct"?task.quote.credits:await new Promise<number|undefined>(resolve=>window.dispatchEvent(new CustomEvent("dreamina-confirm-generation",{detail:{task,resolve}})));
  if(creditCeiling===undefined)throw Error("已取消生成，画布草稿已保留，未提交扣费");
  task=await workbench().dreaminaConfirm({id:task.id,creditCeiling});
 }
 return task;
}
export async function resumeDreaminaDraft(id:string,prompt:string):Promise<VideoResponse>{const task=await workbench().dreaminaPrepare({id,prompt});return task.status==="unknown"?pollDreaminaVideo(id):confirmDreaminaDraft(task);}
