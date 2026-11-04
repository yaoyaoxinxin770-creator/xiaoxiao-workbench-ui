type Completion={id:string;status:string;model?:string;completionNotifiedAt?:number};
// Called only when settling an actual task, never when loading history.
export function shouldNotifyVideoCompletion(log:Completion,previous:Completion|null,seen:Set<string>) {
 if(log.status!=='成功'||log.model==='导入视频'||log.completionNotifiedAt||previous?.status==='成功'||previous?.completionNotifiedAt||seen.has(log.id))return false;
 seen.add(log.id);return true;
}

type Failure={id:string;status:string;failureNotifiedAt?:number;task?:{id:string}};
// The saved failure state is the durable de-duplication boundary, across page reloads.
export function shouldNotifyVideoFailure(log:Failure,previous:Failure|null,seen:Set<string>){
 const key=log.task?.id||log.id;
 if(log.status!=='失败'||log.failureNotifiedAt||previous?.failureNotifiedAt||previous?.status==='失败'&&previous?.task?.id===log.task?.id||seen.has(key))return false;
 seen.add(key);return true;
}
