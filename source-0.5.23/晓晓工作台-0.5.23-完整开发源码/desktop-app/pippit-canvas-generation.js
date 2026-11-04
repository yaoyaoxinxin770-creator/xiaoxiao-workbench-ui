const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const formats={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3'};
const hash=v=>createHash('sha256').update(v).digest('hex');
function referenceMatches(asset,record,kind){return asset?.type==='biz/'+kind&&asset.content?.source==='uploaded'&&asset.content.pippitAssetId===record.pippitAssetId&&(!record.assetId||asset.content.assetId===record.assetId);}
function referenceData(record,ref){
 const media=record.media?.[ref.kind==='image'?'Image':ref.kind==='video'?'Video':'Audio'],raw=media?.metadata||{};
 const positive=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:undefined;};
 const width=positive(raw.width),height=positive(raw.height),durationMs=positive(raw.duration_ms??raw.durationMs);
 if(ref.kind!=='image'&&!durationMs)throw Error('参考素材缺少有效时长，请核对原素材');
 if(ref.kind==='image'&&(!width||!height)||ref.kind==='video'&&(!width||!height))throw Error('参考素材缺少有效尺寸，请核对原素材');
 const metadata={...raw,...(width?{width}:{}),...(height?{height}:{}),...(durationMs?{duration_ms:durationMs,durationMs}: {})};
 return {name:ref.name,source:'uploaded',uploadPath:'optimized',pippitAssetId:record.pippitAssetId,...(record.assetId?{assetId:record.assetId}:{}),metadata,...(ref.kind==='image'?{naturalWidth:width,naturalHeight:height}:{}),...(ref.kind==='video'?{frameWidth:width,frameHeight:height,durationMs,...(media?.vid?{vid:media.vid}:{})}:{}),...(ref.kind==='audio'?{durationMs}: {})};
}
// Video candidate discovery in this official SDK excludes audio. Its documented
// generation.references draft supplies those identities to the shared tag parser.
function audioPromptReferences(doc,references){
 return references.filter(ref=>ref.kind==='audio').map(ref=>{
  const asset=doc.assets?.[ref.id],content=asset?.content;
  if(asset?.type!=='biz/audio'||content?.source!=='uploaded'||!content.pippitAssetId||!doc.assets[doc.rootCanvasId]?.content?.nodes?.[ref.id])throw Error('音频参考节点未就绪，请核对画布');
  const durationMs=Number(content.durationMs??content.metadata?.durationMs??content.metadata?.duration_ms),sizeBytes=Number(content.sizeBytes??content.metadata?.sizeBytes??content.metadata?.size);
  if(!Number.isFinite(durationMs)||durationMs<=0)throw Error('音频参考缺少有效时长，请核对画布');
  return {id:ref.id,type:'audio',nodeAssetId:ref.id,nodeAssetType:'biz/audio',sourceNodeId:ref.id,sourceNodeType:'biz/audio',referenceSource:'canvas-node',pippitAssetId:content.pippitAssetId,...(content.assetId?{assetId:content.assetId}:{}),...(content.uploadPath?{uploadPath:content.uploadPath}:{}),label:ref.label,metadata:{durationMs,...(Number.isFinite(sizeBytes)&&sizeBytes>0?{sizeBytes}:{})}};
 });
}
class PippitCanvasGeneration{
 constructor({pippit,canvas,broker}){Object.assign(this,{pippit,canvas,broker});this.pending=new Map();this.queue=Promise.resolve();}
 async settings(key){const value=await this.canvas.settings(key);return {...value,browser:value.target?await this.broker.status(value.target):{ready:false}};}
 submit(payload){const id='pippit:'+(payload.clientTaskId||randomUUID());this.pippit.taskDir(id);if(this.pending.has(id)){const active=this.pending.get(id);return active.fingerprint===hash(JSON.stringify(payload))?active.promise:Promise.reject(Error("同一请求 ID 不能用于不同项目或内容"));}const work=this.queue.then(()=>this.submitOnce(id,payload));this.queue=work.catch(()=>{});const pending=work.finally(()=>this.pending.delete(id));this.pending.set(id,{fingerprint:hash(JSON.stringify(payload)),promise:pending});return pending;}
 async account(){const auth=await this.pippit.command(['status']);if(!auth.logged_in||!auth.credential_scope)throw Error('请先登录小云雀 CLI，并在同一账号的 Chrome 打开目标画布');return auth.credential_scope;}
 async allocate(){const value=await this.pippit.command(['canvas','allocate','--count','1']);const id=value.asset_ids?.[0];if(typeof id!=='string'||!/^\d+$/.test(id))throw Error('官网未返回有效画布节点 ID');return id;}
 async submitOnce(id,payload){
  const dir=this.pippit.taskDir(id),fingerprint=hash(JSON.stringify(payload)),previous=await this.pippit.read(dir);
  if(previous){if(!previous.canvasTarget||previous.fingerprint!==fingerprint)throw Error('同一请求 ID 不能用于不同项目或内容');if(await this.account()!==previous.credentialScope)throw Error('原画布任务属于另一个小云雀授权账号');if(previous.status==='prepared'&&previous.creationMode==='draft')return {id,status:'awaiting_confirmation',preparationOnly:true,model:previous.model,canvasNodeId:previous.canvasNodeId,canvasUrl:previous.canvasTarget.url};return {id,status:previous.status==='failed'?'error':previous.status==='unknown'?'unknown':'processing',model:previous.model,canvasNodeId:previous.canvasNodeId,canvasUrl:previous.canvasTarget.url};}
  this.canvas.key(payload.projectKey);const target=(await this.canvas.settings(payload.projectKey)).target;if(!target)throw Error('请先在本项目的小云雀画布设置中保存官网画布链接');if(payload.creationMode!=='draft')await this.broker.connection(target);
  const {model,prompt,ratio='16:9',duration=5,resolution,references=[]}=payload;
   if(payload.creationMode!==undefined&&!['draft','direct'].includes(payload.creationMode))throw Error('无效的小云雀创作方式');
  if(payload.type!=='video'||typeof prompt!=='string'||!prompt.trim()||prompt.length>100000)throw Error('请填写视频提示词');
  if(payload.draftTaskId)throw Error('画布样片请在官网原节点点击渲染成片，工作台不会转用项目列表生成');
  if(payload.firstLast)throw Error('画布直生成目前使用全参考模式；首尾帧请在官网节点设置后生成');
  if(!Array.isArray(references)||references.length>12)throw Error('画布参考素材须为 0–12 项');
  if(!['Seedance_2.5','Seedance_2.5_draft'].includes(model))throw Error('画布直生成当前支持 Seedance 2.5 和 Seedance 2.5 Draft');
  const spec=await this.pippit.describe(model,'video');if(!spec.ratio?.options?.map(String).includes(ratio))throw Error('模型不支持该比例：'+ratio);
  if(!Number.isInteger(duration)||duration<1||(spec.duration?.min!==undefined&&duration<spec.duration.min)||(spec.duration?.max!==undefined&&duration>spec.duration.max)||(spec.duration?.options?.length&&!spec.duration.options.includes(duration)))throw Error('模型不支持该时长：'+duration);
  if(resolution&&!model.endsWith('_draft')&&!spec.resolution?.options?.includes(resolution))throw Error('模型不支持该分辨率：'+resolution);
  // Validate all bytes before any remote write. Canvas uploads are generation inputs, never generic generate-video.
  let total=0;const files=references.map((ref,index)=>{const match=/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(ref.dataUrl||''),ext=formats[match?.[1]];if(!ext||!['image','video','audio'].includes(ref.kind)||!match[1].startsWith(ref.kind+'/'))throw Error('参考素材格式不支持');const bytes=Buffer.from(match[2],'base64');total+=bytes.length;if(!bytes.length||total>128*1024*1024)throw Error('参考素材总量须小于 128 MB');return {kind:ref.kind,name:String(ref.name||ref.kind+(index+1)).slice(0,100),file:path.join(dir,'reference-'+index+'.'+ext),bytes};});
  const scope=await this.account();let doc=await this.canvas.snapshot(target);const probe=payload.creationMode==='draft'?{canvasId:target.canvasId,projectId:target.projectId}:await this.broker.execute(target,{action:"probe"});if(probe?.canvasId!==target.canvasId||probe?.projectId!==target.projectId)throw Error("目标 Chrome 画布连接未确认");await fs.mkdir(dir,{recursive:true});
  const task={id,creationMode:payload.creationMode,type:'video',model,status:'preparing',fingerprint,credentialScope:scope,canvasTarget:target,projectKey:payload.projectKey,createdAt:Date.now(),canvasNodeId:await this.allocate(),referenceNodes:[],referenceFiles:[]};await this.pippit.save(dir,task);
  try{
   for(const [index,ref] of files.entries()){
    await fs.writeFile(ref.file,ref.bytes);const cacheFile=path.join(this.canvas.dataDir,'reference-records',hash(JSON.stringify([scope,target.canvasId,ref.kind,hash(ref.bytes)]))+'.json');let record=await this.canvas.read(cacheFile,{});
    if(record.nodeId&&referenceMatches(doc.assets[record.nodeId],record,ref.kind)&&doc.assets[target.canvasId].content.nodes?.[record.nodeId]){record.phase='confirmed';await this.canvas.save(cacheFile,record);task.referenceNodes.push({id:record.nodeId,kind:ref.kind,label:ref.name});continue;}
    if(record.phase==='confirmed')throw Error('原参考节点已移除或变更，请重新绑定素材');
    if(record.phase==='creating'){
      // Recover only an already-written asset with the original identity. Never re-upload or allocate a second ID.
      if(doc.assets[record.nodeId]||doc.assets[target.canvasId].content.nodes?.[record.nodeId])throw Error('原参考节点已变更，请核对画布');
      const existing=await this.canvas.nodeAsset(record.nodeId);
      if(!referenceMatches(existing,record,ref.kind))throw Error('上次参考素材写入未确认，请核对画布，避免重复上传');
    }
    if(record.phase==='uploading')throw Error('上次参考素材上传未确认，请核对画布，避免重复上传');
    if(!record.pippitAssetId){record={phase:'uploading'};await this.canvas.save(cacheFile,record);const upload=await this.pippit.command(['canvas','upload','--path',ref.file],300000);record={...record,pippitAssetId:upload.pippit_asset_id,assetId:upload.asset?.[ref.kind==='image'?'Image':ref.kind==='video'?'Video':'Audio']?.asset_id,media:upload.asset};await this.canvas.save(cacheFile,record);if(upload.state!=='ready'||!record.pippitAssetId)throw Error('参考素材仍在处理，请到画布核对；不会重复上传');record.phase='uploaded';await this.canvas.save(cacheFile,record);}
    if(!record.nodeId)record.nodeId=await this.allocate();record.phase='creating';await this.canvas.save(cacheFile,record);
    const initialData=referenceData(record,ref);
    const bottom=Math.max(0,...Object.values(doc.assets[target.canvasId].content.nodes||{}).map(n=>Number(n.y||0)+Number(n.h||0)));
    await this.canvas.semantic('create_biz_node',target.canvasId,{nodeKind:ref.kind,id:record.nodeId,center:{x:-650-index*320,y:bottom+220},initialData});
    doc=await this.canvas.snapshot(target);if(!referenceMatches(doc.assets[record.nodeId],record,ref.kind)||!doc.assets[target.canvasId].content.nodes?.[record.nodeId])throw Error('参考素材节点未确认');record.phase='confirmed';await this.canvas.save(cacheFile,record);task.referenceNodes.push({id:record.nodeId,kind:ref.kind,label:ref.name});task.referenceFiles.push({kind:ref.kind,name:ref.name,file:path.basename(ref.file)});await this.pippit.save(dir,task);
   }
   const bottom=Math.max(0,...Object.values(doc.assets[target.canvasId].content.nodes||{}).map(n=>Number(n.y||0)+Number(n.h||0)));const number=/【视频编号\s*([A-Za-z]?\d+(?:[-－][A-Za-z0-9]+)*)/.exec(prompt)?.[1];task.nodeName=(number?'视频编号'+number:'工作台视频')+' · '+id.slice(7);await this.pippit.save(dir,task);
   await this.canvas.semantic('create_biz_node',target.canvasId,{nodeKind:'video',id:task.canvasNodeId,center:{x:0,y:bottom+260},...(ratio==='adaptive'?{}:{defaultVideoRatio:ratio}),initialData:{name:task.nodeName,source:'empty',generation:{modelKey:model,mode:'omni_reference',ratio,durationMs:duration*1000,resolution:resolution||undefined,count:1,references:audioPromptReferences(doc,task.referenceNodes)},playback:{muted:true}}});
   const escape=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   const tagged=task.referenceNodes.map(r=>'<node-asset label="'+escape(r.label)+'">'+r.id+'</node-asset>').join(' ')+(task.referenceNodes.length?'\n':'')+prompt;
   await this.canvas.semantic('xyq.generation.update_prompt',target.canvasId,{nodeId:task.canvasNodeId,prompt:tagged});
   const ready=await this.canvas.snapshot(target),generation=ready.assets[task.canvasNodeId]?.content?.generation;
   if(ready.assets[task.canvasNodeId]?.type!=='biz/video'||!generation?.prompt||task.referenceNodes.some(ref=>!Object.values(ready.assets[target.canvasId].content.edges||{}).some(e=>e.type==='reference'&&e.source===ref.id&&e.target===task.canvasNodeId)&&!generation.references?.some(r=>r.sourceNodeId===ref.id||r.nodeAssetId===ref.id)))throw Error('视频节点提示词或参考素材未就绪，已停止发送');
   const params={nodeId:task.canvasNodeId,nodeName:task.nodeName,model,ratio,duration,resolution:resolution||undefined,prompt,referenceIds:task.referenceNodes.map(r=>r.id),referenceCount:task.referenceNodes.length};
   task.prompt=generation.prompt;task.submitParams=params;task.status='prepared';await this.pippit.save(dir,task);
   if(payload.creationMode==='draft')return {id,status:'awaiting_confirmation',preparationOnly:true,model,canvasNodeId:task.canvasNodeId,canvasUrl:target.url};
   const prepared=await this.broker.execute(target,{action:'prepare',...params});if(prepared?.nodeId!==task.canvasNodeId)throw Error('官方网页未选中目标视频节点');
   // Write-ahead before the only paid UI action. Lost acknowledgements are resolved from this node, never replayed.
   if(await this.account()!==scope)throw Error('小云雀账号已变化，已停止发送');task.status='clicking';await this.pippit.save(dir,task);
   await this.broker.execute(target,{action:'submit',...params});task.status='processing';await this.pippit.save(dir,task);
   return {id,status:'processing',model,canvasNodeId:task.canvasNodeId,canvasUrl:target.url};
  }catch(error){task.status=task.status==='clicking'?'unknown':'failed';task.error=error.message;task.errorPhase=task.status==='unknown'?'submit':task.submitParams?'prepare':'write';await this.pippit.save(dir,task);if(task.status==='unknown')return {id,status:'unknown',model,canvasNodeId:task.canvasNodeId,canvasUrl:target.url,error:{message:'发送结果待核对：'+error.message}};throw error;}
 }
 async query(id){const dir=this.pippit.taskDir(id),task=await this.pippit.read(dir);if(!task?.canvasTarget)throw Error('不是画布直生成任务');if(await this.account()!==task.credentialScope)throw Error('原画布任务属于另一个小云雀授权账号');const doc=await this.canvas.snapshot(task.canvasTarget),asset=doc.assets[task.canvasNodeId];if(asset?.type!=='biz/video')throw Error('原视频节点已不存在，请到官网核对');const gen=asset.content?.generation||{},state=gen.state||{};
  if(state.status==='failed')return {id,status:'error',model:task.model,canvasNodeId:task.canvasNodeId,error:{message:state.errorMessage||task.error||'官网节点生成失败'}};
  const threadId=state.threadId||gen.threadId,runId=state.runId||gen.runId;
  if(threadId&&runId){if(task.thread_id&&task.thread_id!==threadId||task.run_id&&task.run_id!==runId)throw Error('官网节点任务已被替换，已停止回查原视频');task.thread_id=threadId;task.run_id=runId;await this.pippit.save(dir,task);const result=await this.pippit.query(id);return {...result,canvasNodeId:task.canvasNodeId,canvasUrl:task.canvasTarget.url};}
  if(task.status==='prepared'&&task.creationMode==='draft')return {id,status:'awaiting_confirmation',preparationOnly:true,model:task.model,canvasNodeId:task.canvasNodeId,canvasUrl:task.canvasTarget.url};
  if(task.status==='failed')return {id,status:'error',model:task.model,canvasNodeId:task.canvasNodeId,canvasUrl:task.canvasTarget.url,error:{message:task.errorPhase==='prepare'?'画布草稿已保存，尚未发送生成：'+task.error:task.error||'画布任务准备失败'}};
  return {id,status:task.status==='unknown'?'unknown':'processing',model:task.model,canvasNodeId:task.canvasNodeId,canvasUrl:task.canvasTarget.url};
 }
}
module.exports={PippitCanvasGeneration,referenceData,referenceMatches,audioPromptReferences};
