import {confirmCliVideoGeneration} from './cli-video-mode';
import { nanoid } from "nanoid";
import { transcodeAudioToWav } from "@/lib/audio-wav";
import { readFileAsDataUrl } from "@/lib/image-utils";
import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { channelProtocolForConfig, type AiConfig, type LocalModelChannel } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import type { CanvasImageTask } from "./image";
import type { VideoReferenceInput, VideoResponse } from "./video";
import { workbench } from "./workbench";

export const isPippitConfig = (config: AiConfig) => (config.channelMode === "local" || config.generationProvider === "pippit") && channelProtocolForConfig(config) === "pippit-cli";
export function assertMediaProvider(config: AiConfig) {
    if (config.generationProvider === "pippit" && !isPippitConfig(config)) throw new Error("请选择已同步的小云雀模型，当前模式不会调用其他渠道");
}
export async function fetchPippitModels(): Promise<Pick<LocalModelChannel, "models" | "modelCapabilities">> { return workbench().pippitModels(); }
export const describePippitModel = (model:string,type:"image"|"video") => workbench().pippitDescribe(model,type);
export const imageReferences = (references: ReferenceImage[]) => Promise.all(references.map(async ref => ({kind:"image",name:ref.name,dataUrl:await imageToDataUrl(ref)})));
export async function mediaReferences(references: (ReferenceVideo | ReferenceAudio)[], kind: "video" | "audio") {
    return Promise.all(references.map(async ref => {
        const url=await resolveMediaUrl(ref.storageKey,ref.url);
        if(!url) throw new Error("参考资产无法读取："+ref.name);
        const response=await fetch(url);
        if(!response.ok) throw new Error("参考资产读取失败："+ref.name);
        let blob=await response.blob();
        if(blob.size>128*1024*1024) throw new Error("参考资产超过 128 MB："+ref.name);
        let name=ref.name, type=blob.type || ref.type;
        if(kind==="audio"){ blob=await transcodeAudioToWav(new Blob([blob],{type})); type="audio/wav"; name=name.replace(/\.[^.]+$/,"")+".wav"; }
        return {kind,name,dataUrl:await readFileAsDataUrl(new File([blob],name,{type}))};
    }));
}
export function ratioForSize(size: string) {
    if(!size || size === "auto" || size === "adaptive")return "adaptive";
    if(size.includes(":"))return size;
    const dimensions=/^(\d+)x(\d+)$/.exec(size);
    if(!dimensions)throw new Error("小云雀不支持该画面尺寸，请选择比例："+size);
    const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
    const w=Number(dimensions[1]),h=Number(dimensions[2]),divisor=gcd(w,h);
    return `${w/divisor}:${h/divisor}`;
}
export async function submitPippitImage(config: AiConfig, prompt: string, references: ReferenceImage[], clientTaskId = nanoid(), count=1): Promise<CanvasImageTask> {
    return workbench().pippitSubmit({type:"image",model:config.model,prompt,clientTaskId,count,ratio:ratioForSize(config.size),resolution:config.quality && config.quality!=="auto"?config.quality:undefined,references:await imageReferences(references)});
}
export async function submitPippitVideo(config: AiConfig, prompt: string, input: VideoReferenceInput, clientTaskId = nanoid(), projectKey?:string): Promise<VideoResponse> {
    await confirmCliVideoGeneration("小云雀",config.pippitGenerationMode);
    const frames=[input.firstFrame,input.lastFrame].filter((ref):ref is ReferenceImage=>Boolean(ref));
    if(frames.length && ((input.references?.length || 0)+(input.videoReferences?.length || 0)+(input.audioReferences?.length || 0))) throw new Error("首尾帧与普通参考资产不能混用，请明确选择一种模式");
    if(input.lastFrame && !input.firstFrame)throw new Error("请先指定首帧，再指定尾帧");
    const references=[...await imageReferences(frames.length?frames:input.references || []),...await mediaReferences(input.videoReferences || [],"video"),...await mediaReferences(input.audioReferences || [],"audio")];
    return workbench().pippitSubmit({creationMode:config.pippitGenerationMode=== "draft"?"draft":"direct",type:"video",model:config.model,prompt,clientTaskId,...(projectKey?{projectKey}:{}),ratio:ratioForSize(config.size),resolution:config.model.endsWith("_draft") || config.vquality === "auto"?undefined:config.vquality.endsWith("p") || config.vquality.endsWith("k")?config.vquality:config.vquality+"p",duration:Number(config.videoSeconds),firstLast:frames.length>0,references});
}
export async function renderPippitDraft(model:string,draftTaskId:string,clientTaskId=nanoid()):Promise<VideoResponse> {
    return workbench().pippitSubmit({type:"video",model,prompt:"",draftTaskId,clientTaskId});
}
// Store completed media locally once; task IDs remain usable after a workbench restart.
const completedImages=new Map<string,Promise<CanvasImageTask>>(), completedVideos=new Map<string,Promise<VideoResponse>>();
export async function pollPippitImage(id: string): Promise<CanvasImageTask> {
    if(completedImages.has(id))return completedImages.get(id)!;
    const task=await workbench().pippitQuery(id);
    if(task.status!=="completed")return task;
    const pending=(async()=>{
        const imageStorage=await Promise.all(task.media.map((item:{dataUrl:string})=>uploadImage(item.dataUrl,{localOnly:true})));
        const urls=imageStorage.map(item=>item.url),first=imageStorage[0];
        return {...task,media:undefined,imageStorage,image_urls:urls,image_url:urls[0],url:urls[0],storageKey:first.storageKey,bytes:first.bytes,mimeType:first.mimeType};
    })();
    completedImages.set(id,pending);
    try{return await pending;}catch(error){completedImages.delete(id);throw error;}
}
export async function pollPippitVideo(id: string): Promise<VideoResponse> {
    if(completedVideos.has(id))return completedVideos.get(id)!;
    const task=await workbench().pippitQuery(id);
    if(task.status!=="completed")return task;
    const pending=(async()=>{
        const stored=await uploadMediaFile(task.media[0].dataUrl,"video");
        const draft=task.media[0].draft === false ? false : task.media[0].draft === true || Boolean(task.media[0].draftTaskId);
        return {...task,media:undefined,draft,draftTaskId:draft?task.media[0].draftTaskId:undefined,video_url:stored.url,url:stored.url,storageKey:stored.storageKey};
    })();
    completedVideos.set(id,pending);
    try{return await pending;}catch(error){completedVideos.delete(id);throw error;}
}
