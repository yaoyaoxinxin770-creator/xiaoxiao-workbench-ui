import {downloadRemoteMedia} from '@/services/file-storage';
export function frameAssetTitle(title:string,time:number,fps=30,existing:string[]=[]){
 const code=/视频编号\s*([Vv]?\d+(?:-\d+)*)/.exec(title)?.[1]||title.slice(0,40)||'视频',whole=Math.floor(time),frame=Math.floor((time-whole)*fps+1e-4),base=code+'-帧-'+String(Math.floor(whole/60)).padStart(2,'0')+'m'+String(whole%60).padStart(2,'0')+'s'+String(frame).padStart(2,'0');let name=base,index=2;while(existing.includes(name))name=base+' ('+(index++)+')';return name;
}
export async function seekVideoFrame(video:HTMLVideoElement,time:number){
 const target=Math.max(0,Math.min(time,Math.max(0,video.duration-0.001)));video.pause();
 if(Math.abs(video.currentTime-target)<0.0001&&!video.seeking&&video.readyState>=2)return;
 await new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',success);video.removeEventListener('error',failure);},success=()=>{done();resolve();},failure=()=>{done();reject(Error('视频帧读取失败'));},timer=setTimeout(()=>{done();reject(Error('视频定位超时，请等待视频加载后重试'));},8000);video.addEventListener('seeked',success,{once:true});video.addEventListener('error',failure,{once:true});video.currentTime=target;});
}
async function drawFrame(video:HTMLVideoElement,time:number){await seekVideoFrame(video,time);if(!video.videoWidth||video.readyState<2)throw Error('视频画面尚未加载');const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d')!.drawImage(video,0,0);return new Promise<Blob>((resolve,reject)=>{try{canvas.toBlob(blob=>blob?resolve(blob):reject(Error('截帧图像编码失败')),'image/png');}catch(e){reject(e);}});}
export async function captureVideoFrame(video:HTMLVideoElement,time:number){
 try{return await drawFrame(video,time);}catch(error){if(!(error instanceof DOMException&&error.name==='SecurityError'))throw error;
  const blob=await downloadRemoteMedia(video.currentSrc||video.src),url=URL.createObjectURL(blob),copy=document.createElement('video');copy.muted=true;copy.crossOrigin='anonymous';copy.preload='auto';try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('截帧副本加载超时')),12000);copy.onloadeddata=()=>{clearTimeout(timer);resolve();};copy.onerror=()=>{clearTimeout(timer);reject(Error('此视频无法读取用于截帧'));};copy.src=url;});return await drawFrame(copy,time);}finally{copy.pause();copy.removeAttribute('src');copy.load();URL.revokeObjectURL(url);}
 }
}
