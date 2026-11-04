"use client";
import {useEffect,useState,type RefObject} from 'react';
import {App,Button} from 'antd';
import {useAssetStore} from '@/stores/use-asset-store';
import {useVideoStudioStore} from '@/stores/use-video-studio-store';
import {uploadImage} from '@/services/image-storage';
import {placementFor} from '../studio-model';
import {showStudioAsset} from '../asset-navigation';
import {captureVideoFrame,seekVideoFrame,frameAssetTitle} from '../video-frame';
import type {GenerationLog} from '../page';
export function VideoFrameCapture({log,playerRef,onClose}:{log:GenerationLog;playerRef:RefObject<HTMLVideoElement|null>;onClose:()=>void}){
 const {message}=App.useApp(),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[saving,setSaving]=useState(false),fps=log.task?.interpolatedFps||30;
 useEffect(()=>{const video=playerRef.current;if(!video)return;video.pause();const update=()=>{setTime(video.currentTime);setDuration(Number.isFinite(video.duration)?video.duration:0);};update();video.addEventListener('timeupdate',update);video.addEventListener('loadedmetadata',update);return()=>{video.removeEventListener('timeupdate',update);video.removeEventListener('loadedmetadata',update);};},[log.id,playerRef]);
 const seek=(value:number)=>{if(saving)return;const video=playerRef.current;if(video){setTime(Math.max(0,Math.min(value,duration)));video.pause();video.currentTime=Math.max(0,Math.min(value,Math.max(0,duration-0.001)));}};
 const format=(t:number)=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0')+'.'+String(Math.floor((t%1)*fps)).padStart(2,'0');
 const save=async()=>{const video=playerRef.current;if(!video||!duration){message.info('请等待视频画面加载完成');return;}setSaving(true);try{const state=useVideoStudioStore.getState(),projectId=placementFor(state.placements,log.id).projectId,frameTime=video.currentTime;await seekVideoFrame(video,frameTime);const blob=await captureVideoFrame(video,frameTime),assets=useAssetStore.getState().assets,title=frameAssetTitle(log.prompt||log.title,frameTime,fps,assets.map(a=>a.title)),image=await uploadImage(new File([blob],title+'.png',{type:'image/png'}),{localOnly:true});const id=useAssetStore.getState().addAsset({kind:'image',title,category:'视频',tags:[],coverUrl:image.url,data:{...image,dataUrl:image.url},metadata:{source:'视频截帧',sourceLogId:log.id,frameTimeMs:Math.round(frameTime*1000),elementManualCategory:'视频',elementManualGroup:''}});state.addElement(id,projectId);message.success({duration:8,content:<span>已保存到资产库（视频） <Button type="link" size="small" onClick={()=>{onClose();showStudioAsset({projectId,id,category:'视频'});}}>去查看</Button></span>});}catch(e){message.error(e instanceof Error?e.message:'截帧失败');}finally{setSaving(false);}};
 return <section data-video-frame-capture tabIndex={0} aria-label="视频截帧控制" className="space-y-2 border-t border-border bg-background p-3 text-xs outline-none" onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();seek(time+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:1/fps));}}}>
 <input aria-label="截帧时间轴" type="range" disabled={saving} className="w-full accent-[var(--primary)]" min={0} max={duration||0.01} step={1/fps} value={Math.min(time,duration)} onChange={e=>seek(Number(e.target.value))}/>
 <div className="flex flex-wrap items-center gap-2"><Button size="small" disabled={saving} aria-label="后退1秒" onClick={()=>seek(time-1)}>−1秒</Button><Button size="small" aria-label="上一帧" onClick={()=>seek(time-1/fps)}>上一帧</Button><Button size="small" aria-label="下一帧" onClick={()=>seek(time+1/fps)}>下一帧</Button><Button size="small" aria-label="前进1秒" onClick={()=>seek(time+1)}>+1秒</Button><span className="font-mono">{format(time)} / {format(duration)}</span><Button size="small" type="primary" loading={saving} onClick={()=>void save()}>保存到资产库</Button><Button size="small" onClick={onClose}>退出截帧</Button></div>
 </section>;
}
