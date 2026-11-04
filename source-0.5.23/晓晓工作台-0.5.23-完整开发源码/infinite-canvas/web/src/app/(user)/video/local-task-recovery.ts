export function localTaskId(log:{task?:{id:string};config?:{channelMode?:string;videoChannelId?:string;dreaminaLegacyMode?:string}}):string|undefined {
 const id=log.task?.id;if(!id)return;
 if(/^(oiioii:|pippit:|dreamina-canvas:|dreamina-agent:|dreamina:)/.test(id))return id;
 if(log.config?.channelMode==="local"&&log.config.videoChannelId==="local-dreamina"&&/^client_video_task_[a-zA-Z0-9_-]+$/.test(id))return (log.config.dreaminaLegacyMode==="agent"?"dreamina-agent:":"dreamina:")+id;
 if(log.config?.channelMode==="local"&&log.config.videoChannelId==="local-oiioii"&&/^client_video_task_[a-zA-Z0-9_-]+$/.test(id))return "oiioii:"+id;
 if(log.config?.channelMode==="local"&&log.config.videoChannelId==="local-pippit"&&/^client_video_task_[a-zA-Z0-9_-]+$/.test(id))return "pippit:"+id;
}

export function canRecoverLocalVideoTask(log:{status?:string;interruptedAt?:number;task?:{status?:string}}){
 // Remote terminal failures (including content review) cannot become pending on each local scan.
 return !log.interruptedAt&&!(log.status==='失败'&&['failed','fail','error','cancelled','canceled'].includes((log.task?.status||'').toLowerCase()));
}
