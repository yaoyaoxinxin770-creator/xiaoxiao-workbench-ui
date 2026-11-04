const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const {DreaminaService,parseJson}=require('./dreamina-service');
const nodeId=()=>"node_"+Array.from(randomBytes(10),n=>"0123456789abcdefghjkmnpqrstvwxyz"[n&31]).join("");
const MAX_BYTES=128*1024*1024;
const formats={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a'};
function catalogFromModels(items){
 if(!Array.isArray(items)||!items.length)throw Error('新版即梦没有返回可用视频模型');
 const models=[],specs={};
 for(const item of items){
  const modes=item.modes?.filter(m=>['t2v','m2v','first_last_frame'].includes(m.name)),mode=modes?.find(m=>m.name==='m2v')||modes?.find(m=>m.name==='t2v');
  if(!mode||typeof item.model!=='string')continue;
  const flag=name=>mode.flags.find(f=>f.flag==='--'+name),ratio=flag('ratio'),duration=flag('duration'),resolution=flag('resolution');
  if(!ratio?.values?.length||!resolution?.values?.length||!Number.isFinite(duration?.min)||!Number.isFinite(duration?.max))throw Error('新版即梦模型规格不完整');
  const ref=kind=>mode.references?.types?.find(t=>t.mediaType===kind)?.max||0;
  models.push(item.model);specs[item.model]={ratio:{options:ratio.values,default:ratio.values.includes('16:9')?'16:9':ratio.values[0]},resolution:{options:resolution.values,default:resolution.values.find(v=>v.toLowerCase()==='720p')||resolution.values[0]},duration:{min:duration.min,max:duration.max,step:duration.step||1,default:Math.max(duration.min,Math.min(5,duration.max))},references:{images:ref('image'),videos:ref('video'),audios:ref('audio'),total:mode.references?.max||0},modes};
 }
 if(!models.length)throw Error('新版即梦没有可接入的视频模型');
 return {models,specs,modelCapabilities:Object.fromEntries(models.map(m=>[m,'video']))};
}
class DreaminaCanvasService extends DreaminaService {
 constructor(options){super(options);this.interpolator=options.interpolator;this.projects=new Map();this.preparingCanvases=new Set();this.drafts=new (require('./dreamina-canvas-drafts').DreaminaCanvasDrafts)(this);this.targets=new (require('./dreamina-canvas-targets').DreaminaCanvasTargets)(this);this.referenceCache=new (require('./dreamina-reference-cache').DreaminaReferenceCache)(this,nodeId);}
 async envelope(args){let result;try{result=await this.raw([...args,'--format','json','--non-interactive']);}catch(error){result=error;}for(const output of [result.stdout,result.stderr]){try{const r=parseJson(output);if(typeof r.ok==='boolean')return r;}catch{}}const error=Error('新版即梦请求结果不确定，请核对原画布任务');if(typeof result.code==='string')error.code=result.code;throw error;}
 async command(args){const r=await this.envelope(args);if(r.ok!==true){const stage=args[0]==='node'&&args[1]==='create'&&args[2]==='video'?'保存视频节点':args[0]==='node'&&args[1]==='quote'?'计算视频积分':'';const config=['mode','model','ratio','resolution','duration','count'].flatMap(name=>{const i=args.indexOf('--'+name);return i>=0?[name+'='+args[i+1]]:[];}).join(' ');const details=[r.error?.code,r.error?.serviceCode,r.meta?.requestId||r.error?.requestId,config].filter(Boolean).join(' · ');const e=Error((stage?'即梦'+stage+'失败：':'')+(r.error?.message||'新版即梦请求失败')+(stage&&details?'（'+details+'）':''));e.code=r.error?.code;e.class=r.error?.class;e.retryable=r.error?.retryable;e.serviceCode=r.error?.serviceCode;e.requiredAction=r.error?.requiredAction;e.requestId=r.meta?.requestId||r.error?.requestId;throw e;}return r.data;}
 async status(){try{const s=await this.command(['auth','status']);if(!s.loggedIn)return {logged_in:false,balance:null};const a=await this.command(['auth','account']);return {logged_in:Number(a.userId)>0,balance:null,accountId:String(a.userId)};}catch(e){if(e.requiredAction==='login')return {logged_in:false,balance:null};throw e;}}
 async credits(){const s=await this.status();if(!s.logged_in)throw Error('新版即梦尚未授权');return {balance:null};}
 async account(){const a=await this.command(['auth','account']);if(!(Number(a.userId)>0))throw Error('新版即梦未返回有效账号');if(this.expectedAccount&&this.expectedAccount!==String(a.userId))throw Error('此授权配置已变成另一即梦账号，请重新核对账号管理；已阻止发送');return String(a.userId);}
 async login(){if((await this.status()).logged_in)return {logged_in:true};if(this.loginChallenge){const c=this.loginChallenge;return {logged_in:false,url:c.verificationUriComplete||c.verificationUri,code:c.userCode};}const s=await this.command(['auth','login']);if(s.status==='authenticated')return this.status();const c=s.challenge,url=c?.verificationUriComplete||c?.verificationUri;if(!c?.deviceCode||!c.userCode||!url||new URL(url).protocol!=='https:')throw Error('新版即梦未返回完整授权信息');this.loginChallenge=c;return {logged_in:false,url,code:c.userCode};}
 async checkLogin(){if(this.loginChallenge){const r=await this.envelope(['auth','wait','--device-code',this.loginChallenge.deviceCode,'--timeout','1s']);if(!r.ok&&r.error?.requiredAction!=='resume')throw Error(r.error?.message||'授权确认失败');}const s=await this.status();if(s.logged_in)this.loginChallenge=null;return s;}
 async models(){const catalog=catalogFromModels((await this.command(['model','list','--type','video'])).items),names=catalog.models.filter(name=>catalog.specs[name].references.videos||catalog.specs[name].references.audios);
   if(names.length){const matches=(await Promise.all(names.map(name=>this.command(['model',name])))).flatMap(full=>full.matches||[]);for(const item of matches){const g=item.generation,refs=catalog.specs[g?.model]?.references;if(!refs||g.mode!=='m2v'||!g.materials)continue;const kinds=g.materials.types||[],audio=kinds.find(t=>t.mediaType==='audio')?.limits,video=kinds.find(t=>t.mediaType==='video')?.limits;Object.assign(refs,{...(audio?.minDurationMs!==undefined?{audioMinDurationMs:audio.minDurationMs}:{}),...(audio?.maxDurationMs!==undefined?{audioMaxDurationMs:audio.maxDurationMs}:{}),...(g.materials.maxTotalAudioDurationMs!==undefined?{totalAudioDurationMs:g.materials.maxTotalAudioDurationMs}:{}),...(video?.minDurationMs!==undefined?{videoMinDurationMs:video.minDurationMs}:{}),...(video?.maxDurationMs!==undefined?{maxDurationMs:video.maxDurationMs}:{}),...(g.materials.maxTotalVideoDurationMs!==undefined?{totalDurationMs:g.materials.maxTotalVideoDurationMs}:{}),...(video?.maxFileSizeBytes!==undefined?{videoMaxBytes:video.maxFileSizeBytes}:{}),...(audio?.maxFileSizeBytes!==undefined?{audioMaxBytes:audio.maxFileSizeBytes}:{})});}}return catalog;}

 taskDir(id){if(typeof id!=='string'||!/^dreamina-canvas:[a-zA-Z0-9_-]{1,120}$/.test(id))throw Error('无效的新版即梦任务编号');return path.join(this.dataDir,id.slice(16));}
 async referenceNeeds(payload){
  const context=payload.promptContext;if(!context||context.autoMatch===false||payload.firstLast)return {assetIds:[]};
  if(typeof payload.prompt!=='string'||!Array.isArray(context.assets)||context.assets.length>3000||!payload.canvasCapture)throw Error('素材自动检查参数无效');
  const account=await this.account(),target=await this.targets.captured(payload.canvasCapture,payload.projectKey,account),assets=context.assets,refs=payload.references||[];
  const selections=refs.map((r,i)=>({assetId:r.assetId,kind:r.kind,name:r.name,nodeId:'check_selected_'+(r.dataUrl?createHash('sha256').update(r.kind).update(r.dataUrl).digest('hex'):r.assetId||i)}));
  const virtual=selections.filter((r,i,list)=>list.findIndex(x=>x.nodeId===r.nodeId)===i).map(r=>({nodeId:r.nodeId,type:r.kind,title:r.name,resources:[{type:r.kind,status:'success'}]}));
  const plan=require('./dreamina-canvas-drafts').planGroup({prompt:payload.prompt,bindings:context.bindings,autoMatch:true},virtual,assets,[],selections);
  return {assetIds:[...new Set(plan.issues.filter(i=>i.reasonCode==='local_unbound').flatMap(i=>i.candidates.map(c=>c.assetId).filter(Boolean)))]};
 }
 async project(projectKey,account){return this.targets.project(projectKey,account);}

 view(task){return {id:task.id,status:task.status,model:task.model,canvasNodeId:task.nodeId,canvasUrl:task.webUrl,canvasName:task.canvasName,...(task.returnMode?{returnMode:task.returnMode}:{}),...(task.interpolatedNodeId?{interpolatedNodeId:task.interpolatedNodeId}:{}),...(task.interpolationFps!==undefined?{interpolationFps:task.interpolationFps}:{}),...(task.interpolatedFps?{interpolatedFps:task.interpolatedFps}:{}),...(task.interpolation?{interpolation:{state:task.interpolation.state,message:task.interpolation.message}}:{}),...(task.error?{error:{...task.errorInfo,message:task.error}}:{}),...(task.quote?{quote:{credits:task.quote.totalMaxCredits,confirmable:task.quote.confirmable!==false}}:{})};}
 submit(payload){payload=structuredClone(payload);const id='dreamina-canvas:'+(payload.clientTaskId||randomUUID());this.taskDir(id);const signature=createHash('sha256').update(JSON.stringify(payload)).digest('hex');if(this.pending.has(id)){const p=this.pending.get(id);if(p.signature!==signature)throw Error('同一任务编号不能用于不同内容');return p.promise;}const entry={signature,stage:'queued',model:payload.model};this.pending.set(id,entry);const promise=this.submitOnce(id,payload).finally(()=>{this.pending.delete(id);this.drainPreparations();});entry.promise=promise;return promise;}
 queuePreparation(id,target,action){const entry=this.pending.get(id);return new Promise((resolve,reject)=>{Object.assign(entry,{target,action,resolve,reject});this.drainPreparations();});}
 drainPreparations(){for(const entry of this.pending.values()){
  if(!entry.signature||entry.stage!=='queued')continue;
  // Preserve click order while earlier requests are still resolving their destination.
  if(!entry.action)break;
  const key=entry.target.projectId;if(this.preparingCanvases.has(key))continue;
  this.preparingCanvases.add(key);entry.stage='preparing';
  Promise.resolve().then(entry.action).then(entry.resolve,entry.reject).finally(()=>{this.preparingCanvases.delete(key);entry.stage='prepared';this.drainPreparations();});
 }}
 query(id,options){this.taskDir(id);if(options?.returnMode==='interpolated')return this.targets.serial(this.taskDir(id)+'-return-policy',async()=>{const task=await this.read(this.taskDir(id));if(!task)throw Error('新版即梦任务不存在');if(await this.account()!==task.account)throw Error('该任务属于另一即梦账号');if(!task.returnMode&&task.status!=='completed'){task.returnMode='interpolated';await this.save(this.taskDir(id),task);}return this.query(id);});const entry=this.pending.get(id);if(entry?.signature&&['queued','preparing'].includes(entry.stage))return Promise.resolve({id,model:entry.model,status:entry.stage,progress:0,...(entry.target?{canvasUrl:entry.target.webUrl,canvasName:entry.target.name}:{}),queuePosition:entry.stage==='queued'?[...this.pending.values()].filter(e=>e.signature&&e.stage==='queued'&&(!e.target||!entry.target||e.target.projectId===entry.target.projectId)).indexOf(entry)+1:0});return super.query(id);}
 async submitOnce(id,payload){
  const {planGroup,referencesInPrompt,videoNodeTitle,isPreservedReference,assetsForSelectedReferences}=require('./dreamina-canvas-drafts');
  const dir=this.taskDir(id),signature=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),previous=await this.read(dir);
  if(previous){if(previous.signature!==signature)throw Error('同一任务编号不能用于不同内容');if(previous.account!==await this.account())throw Error('该任务属于另一即梦账号');if(!['preparing','awaiting_confirmation'].includes(previous.status))return this.view(previous);const observed=await this.queryOnce(id);if(observed.status!=='preparing')return observed;const shown=await this.command(['node','show','--project-id',previous.projectId,'--node-id',previous.nodeId]);if(shown.nodes?.some(n=>n.result==='FOUND'&&n.node?.nodeId===previous.nodeId))return this.verifyPrepared(previous,previous.preparedPrompt||payload.prompt);}
  if(payload.interpolationFps!==undefined&&![0,30,60].includes(payload.interpolationFps))throw Error("补帧选项无效");
  const {model,prompt,ratio,resolution,duration,firstLast}=payload,autoMatch=payload.promptContext?.autoMatch!==false,bindings=payload.promptContext?.bindings||{},assets=assetsForSelectedReferences(payload.promptContext?.assets||[],bindings,payload.references||[]);
  const refs=(payload.references||[]).filter(r=>{if(r.assetId&&bindings['omit:asset:'+r.assetId]||bindings['omit:'+r.kind+':'+String(r.name||'').normalize('NFKC').trim()])return false;if(isPreservedReference(r,bindings))return true;const hit=assets.filter(a=>a.kind===r.kind&&(r.assetId?a.id===r.assetId:a.title===r.name));if(!hit.length)return true;if(!r.assetId&&hit.length>1&&hit.some(a=>a.referenceRule?.disabled))return false;
   if(!autoMatch)return hit.some(a=>!a.referenceRule?.disabled);
   const {codeName}=require('./dreamina-canvas-targets'),matches=(a,name)=>[a.title,a.referenceRule?.name].some(n=>n&&codeName(n)===codeName(name))||(!a.referenceRule?.name&&codeName(a.title).startsWith(codeName(name))&&/^[-_\s·（(【.]/u.test(codeName(a.title).slice(codeName(name).length))),tokens=referencesInPrompt(prompt,assets.map(a=>a.referenceRule?.name||a.title),assets);
   return hit.some(a=>!a.referenceRule?.disabled&&!tokens.some(t=>{
    if((t.kind!=='any'&&t.kind!==a.kind)||!matches(a,t.name))return false;
    const manualId=bindings['manual:'+t.kind+':'+t.name],manual=assets.find(m=>m.id===manualId&&m.kind===a.kind&&!m.referenceRule?.disabled);
    if(manual)return a.id!==manual.id;
    return assets.some(other=>other.kind===a.kind&&!other.referenceRule?.disabled&&matches(other,t.name)&&Number(other.referenceRule?.priority||0)>Number(a.referenceRule?.priority||0));
   }));});
  const missingHistory=Object.keys(bindings).filter(key=>key.startsWith('preserve:asset:')).map(key=>key.slice(15)).filter(id=>{const ref=(payload.references||[]).find(r=>r.assetId===id),asset=assets.find(a=>a.id===id);return isPreservedReference(ref||{assetId:id,name:asset?.title,kind:asset?.kind},bindings)&&!refs.some(r=>r.assetId===id);});
  if(missingHistory.length)throw Error('原视频历史参考素材未完整载入，已停止提交；请重新载入原视频并核对素材，不会删减后继续生成');
  if(firstLast&&refs.length!==(payload.references||[]).length)throw Error('首尾帧含已禁用元素，请重新选择');
  if(typeof prompt!=='string'||!prompt.trim()||!Array.isArray(refs)||refs.some(r=>!['image','video','audio'].includes(r.kind))||!Array.isArray(assets)||assets.length>3000||assets.some(a=>!a||typeof a.id!=='string'||typeof a.title!=='string'||!['image','video','audio'].includes(a.kind))||!bindings||Array.isArray(bindings)||typeof bindings!=='object')throw Error('请填写有效提示词和参考素材');
  const spec=await this.describe(model);
  const validate=(list,text)=>{
   const modeName=firstLast?'first_last_frame':list.length?'m2v':'t2v',counts=Object.fromEntries(['image','video','audio'].map(k=>[k,list.filter(r=>r.kind===k).length]));
   const mode=spec.modes.find(m=>m.name===modeName&&list.length>=(m.references?.min??0)&&list.length<=(m.references?.max??0)&&Object.entries(counts).every(([kind,n])=>{const t=m.references?.types?.find(t=>t.mediaType===kind);return n>=(t?.min||0)&&n<=(t?.max||0);})&&(!m.references?.requireAnyOfTypes?.length||m.references.requireAnyOfTypes.some(k=>counts[k]>0)));
   if(!mode)throw Error('新版即梦模型不支持所选参考方式或素材数量');
   const f=name=>mode.flags.find(f=>f.flag==='--'+name),d=f('duration');
   if(text.length>(f('prompt')?.maxLength??0)||!f('ratio')?.values.includes(ratio)||!f('resolution')?.values.includes(resolution)||!Number.isFinite(duration)||duration<d.min||duration>d.max||(duration-d.min)%(d.step||1)!==0)throw Error('新版即梦不支持所选提示词长度、比例、清晰度或时长');
   return modeName;
  };
  let total=0;const media=refs.map((r,i)=>{const m=/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(r.dataUrl||''),ext=formats[m?.[1]];if(!ext||!m[1].startsWith(r.kind+'/'))throw Error('参考素材格式不支持');const bytes=Buffer.from(m[2],'base64');total+=bytes.length;if(!bytes.length||total>MAX_BYTES)throw Error('参考素材总大小须在 128 MB 以内');return {assetId:r.assetId,kind:r.kind,name:String(r.name||'参考素材').slice(0,100),bytes,ext,index:i};});
  if(firstLast&&media.length===2&&media[0].kind===media[1].kind&&createHash('sha256').update(media[0].bytes).digest('hex')===createHash('sha256').update(media[1].bytes).digest('hex'))throw Error('当前接入无法用同一素材身份分别锁定首尾帧，请先核对首尾帧选择');
  // Freeze the destination before matching, reading or uploading any source material.
  const account=await this.account(),target=previous?.target||(payload.canvasCapture?await this.targets.captured(payload.canvasCapture,payload.projectKey,account):await this.project(payload.projectKey,account));
  return this.queuePreparation(id,target,async()=>{
  if(await this.account()!==account)throw Error('即梦账号已变化，已阻止创建节点');
  const tokens=referencesInPrompt(prompt,[...assets.map(a=>a.title),...media.map(r=>r.name)],assets),group={prompt,bindings,autoMatch};
  const canvasNodes=autoMatch&&tokens.length&&!firstLast?await this.drafts.show(target.projectId,(await this.targets.nodes(target.projectId)).map(n=>n.nodeId)):[];
  const localSelections=media.map((r,i)=>({assetId:r.assetId,kind:r.kind,name:r.name,nodeId:'local_selected_'+createHash('sha256').update(r.kind).update(r.bytes).digest('hex')})),virtual=localSelections.filter((r,i,list)=>list.findIndex(x=>x.nodeId===r.nodeId)===i).map(r=>({nodeId:r.nodeId,type:r.kind,title:'Local selection '+r.nodeId,resources:[{type:r.kind,status:'success'}]}));
  const checkIssues=plan=>{const blocking=plan.issues.filter(i=>i.reasonCode!=='not_found');if(blocking.length){const e=Error('素材引用未就绪：'+blocking.map(i=>({image:'图片',video:'视频',audio:'音频',any:'素材'}[i.kind]+'「'+i.name+'」：'+i.reason)).join('；')+'。请用自动匹配或绑定补齐后重试；仅准备草稿可在“准备画布草稿”中保留缺失文字。');e.code='workbench.references_unresolved';e.issues=blocking.map(({kind,name,reason})=>({kind,name,reason}));throw e;}};
  const initial=planGroup(group,[...canvasNodes,...virtual],assets,target.bindings||[],localSelections);checkIssues(initial);
  const {codeName}=require('./dreamina-canvas-targets');const initialReferences=[...initial.references,...localSelections.filter(r=>!initial.references.some(x=>x.nodeId===r.nodeId||(x.kind===r.kind&&codeName(x.name)===codeName(r.name))))];
  validate(initialReferences,initial.prompt);
  const task=previous||{id,signature,account,model,nodeId:nodeId(),updateId:randomUUID(),submitId:randomUUID(),projectId:target.projectId,webUrl:target.webUrl,canvasName:target.name,target,status:'preparing',references:[],originalPrompt:prompt,...(['original','interpolated'].includes(payload.returnMode)?{returnMode:payload.returnMode,interpolationFps:payload.returnMode==='original'?0:payload.interpolationFps??30}:{})};await this.save(dir,task);
  const selections=[];for(const r of media){const source={account,projectId:task.projectId},ref=await this.referenceCache.ready(source,r)||await this.targets.resolve(task.target||source,r,{preferCurrent:true})||await this.referenceCache.resolve(source,r);selections.push({...ref,assetId:r.assetId,name:r.name,kind:r.kind});task.references=selections.filter((r,i,list)=>list.findIndex(x=>x.nodeId===r.nodeId)===i);await this.save(dir,task);}
  if(firstLast&&task.references.length!==media.length)throw Error('首尾帧必须绑定不同的画布节点');
  let prepared={prompt,references:[],mentions:[]};if(tokens.length){
   const missingIds=selections.filter(r=>!canvasNodes.some(n=>n.nodeId===r.nodeId)).map(r=>r.nodeId);
   const selectedNodes=missingIds.length?await this.drafts.show(target.projectId,[...new Set(missingIds)]):[];
   const selectionBindings=selections.filter(r=>!(target.bindings||[]).some(b=>b.kind===r.kind&&codeName(b.name)===codeName(r.name))).map(r=>({kind:r.kind,name:r.name,nodeId:r.nodeId}));
   prepared=planGroup(group,[...canvasNodes,...selectedNodes],assets,[...(target.bindings||[]),...selectionBindings],selections);checkIssues(prepared);
  }
  if(firstLast&&prepared.references.some(r=>!selections.some(s=>s.nodeId===r.nodeId)))throw Error('首尾帧不能增加其他场景、人物或音频引用，请改用全能参考');
  task.references=firstLast?task.references:[...prepared.references,...task.references.filter(r=>!prepared.references.some(x=>x.nodeId===r.nodeId))];
  const historical=media.filter(r=>isPreservedReference(r,bindings));
  if(historical.some(r=>!selections.some(s=>s.assetId===r.assetId&&s.kind===r.kind&&task.references.some(t=>t.nodeId===s.nodeId&&t.kind===s.kind))))throw Error('原视频参考素材未完整保留，已停止提交；请保留草稿并核对原素材，不会删减后继续生成');
  task.omittedReferences=(prepared.issues||[]).filter(i=>i.reasonCode==='not_found').map(({kind,name})=>({kind,name}));task.preparedPrompt=prepared.prompt;task.originalPrompt=prompt;task.inlineReferences=prepared.mentions;task.firstLast=Boolean(firstLast);const modeName=validate(task.references,task.preparedPrompt);await this.save(dir,task);
  const args=['node','create','video','--project-id',task.projectId,'--node-id',task.nodeId,'--update-id',task.updateId,'--title',videoNodeTitle(prompt),'--mode',modeName,'--model',model,'--prompt',task.preparedPrompt,'--ratio',ratio,'--resolution',resolution,'--duration',String(duration),'--count','1'];for(const r of task.references)args.push('--ref','node:'+r.nodeId);
  const saved=await this.command(args);if(saved.node?.nodeId!==task.nodeId)throw Error('保存的视频节点身份不匹配');
  return this.verifyPrepared(task,task.preparedPrompt);
  });
 }
 async verifyPrepared(task,prompt){
  const {verifyPromptReferences}=require('./dreamina-canvas-drafts');
  const shown=await this.command(['node','show','--project-id',task.projectId,'--node-id',task.nodeId]),node=shown.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===task.nodeId)?.node;
  const refs=node?.generation?.references||[],expected=task.references.map(r=>r.nodeId);
  if(node?.generation?.prompt!==prompt||!verifyPromptReferences(node?.generation,prompt)||expected.some(id=>!node.upstreamNodeIds?.includes(id))||refs.length!==expected.length||new Set(refs.map(r=>r.id)).size!==refs.length||refs.some(r=>r.kind!=='node'||!expected.includes(r.id))||(task.firstLast&&expected.some((id,i)=>refs[i]?.id!==id)))throw Error('画布提示词、正文 @资产标签或参考连线未确认，原草稿已保留');
  task.quote=await this.command(['node','quote','--project-id',task.projectId,'--node-id',task.nodeId]);task.status='awaiting_confirmation';await this.save(this.taskDir(task.id),task);return this.view(task);
 }
 async prepare({id,prompt}){const task=await this.read(this.taskDir(id));if(!task)throw Error('新版即梦任务不存在');if(await this.account()!==task.account)throw Error('该任务属于另一即梦账号');if(!['preparing','awaiting_confirmation'].includes(task.status))return this.view(task);if(typeof prompt!=='string'||!prompt.trim()||(task.originalPrompt&&task.originalPrompt!==prompt))throw Error('请提供原草稿提示词');const observed=await this.queryOnce(task.id);return ['preparing','awaiting_confirmation'].includes(observed.status)?this.verifyPrepared(task,task.preparedPrompt||prompt):observed;}
 confirm({id,creditCeiling}){this.taskDir(id);if(this.pending.has(id))return this.pending.get(id).promise;const promise=this.confirmOnce(id,creditCeiling).finally(()=>this.pending.delete(id));this.pending.set(id,{promise});return promise;}
 async confirmOnce(id,creditCeiling){const dir=this.taskDir(id),task=await this.read(dir);if(!task)throw Error('新版即梦任务不存在');if(await this.account()!==task.account)throw Error('该任务属于另一即梦账号');if(task.status!=='awaiting_confirmation')return this.view(task);const observed=await this.queryOnce(id);if(observed.status!=='awaiting_confirmation')return observed;if(!Number.isInteger(creditCeiling)||creditCeiling<0||!Number.isInteger(task.quote?.totalMaxCredits)||creditCeiling<task.quote.totalMaxCredits)throw Error('请明确批准本次积分上限');
  const c=await this.command(['node','confirm','--project-id',task.projectId,'--node-id',task.nodeId,'--credit-ceiling',String(creditCeiling)]);if(!c.creditConfirmationToken)throw Error('新版即梦未返回积分批准结果');task.creditCeiling=creditCeiling;task.status='unknown';await this.save(dir,task);
  let r;try{r=await this.envelope(['node','run','--project-id',task.projectId,'--node-id',task.nodeId,'--submit-id',task.submitId,'--credit-token',c.creditConfirmationToken]);}catch(error){return this.uncertain(task,error,"submit");}task.runReceipt={ok:r.ok,items:r.data?.items?.map(i=>({nodeId:i.nodeId,submitId:i.submitId,state:i.state,resourceCount:i.resources?.length,error:i.error&&{message:i.error.message,serviceCode:i.error.serviceCode}})),error:r.error&&{code:r.error.code,class:r.error.class,message:r.error.message,...(r.error.localStorage?{localStorage:{store:r.error.localStorage.store,stage:r.error.localStorage.stage,reason:r.error.localStorage.reason,submissionPhase:r.error.localStorage.submissionPhase}}:{})},requestId:r.meta?.requestId};const item=r.data?.items?.find(i=>i.submitId===task.submitId&&i.nodeId===task.nodeId);if(item?.state==='accepted'){task.status='processing';delete task.error;delete task.errorInfo;await this.save(dir,task);return this.view(task);}if(item?.state==='rejected'){task.status='failed';task.error=item.error?.message||'新版即梦未受理本次生成';await this.save(dir,task);return {...this.view(task),error:{message:task.error}};}return this.uncertain(task,{...r.error,requestId:r.meta?.requestId||r.error?.requestId},"submit");
 }
 async uncertain(task,error,source="query"){task.status='unknown';task.errorInfo=Object.fromEntries(['code','class','serviceCode','requiredAction','requestId'].filter(k=>typeof error?.[k]==='string').map(k=>[k,error[k]]));task.error=error?.code==='cli.operation_submission_absent'?'官网暂未查到原提交记录，可能未送达或已过期。请核对原画布，避免重复发送。':error?.message||'提交结果待核对，原任务已保留，请勿重复发送';if(source==='submit'){const local=error?.localStorage;if(local?.submissionPhase==='before_submit'){task.error='即梦尚未发送：本地任务记录目录无法安全写入，请修复目录权限后核对原草稿。';task.errorInfo.localStorage={store:local.store,stage:local.stage,reason:local.reason,submissionPhase:local.submissionPhase};}task.submissionError={...task.errorInfo,message:task.error};}else if(task.submissionError?.message&&task.submissionError.message!==task.error)task.error='原提交：'+task.submissionError.message+'；'+task.error;await this.save(this.taskDir(task.id),task);return this.view(task);}
 async delivered(task){
  const dir=this.taskDir(task.id),outputDir=path.join(dir,'output');await fs.mkdir(outputDir,{recursive:true});
  const realDir=await fs.realpath(outputDir),result=task.result||[],media=[];let total=0;
  for(const resourceId of task.resourceIds){
   let entry=result.find(x=>x.resourceId===resourceId);if(entry){try{await fs.access(entry.path);}catch(e){if(e.code!=='ENOENT')throw e;result.splice(result.indexOf(entry),1);entry=undefined;}}
   if(!entry){if(typeof resourceId!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(resourceId))throw Error('无效的即梦资源编号');const resource=await this.command(['resource','get',resourceId,'--project-id',task.projectId]);if(resource.resourceId!==resourceId||resource.type!=='video'||resource.status!=='success')throw Error('即梦资源尚未成为可用视频');const output=path.join(outputDir,resourceId+'.mp4'),r=await this.command(['resource','download',resourceId,'--project-id',task.projectId,'--output',output]);if(r.resourceId!==resourceId||!Number.isInteger(r.size)||r.size<=0||typeof r.sha256!=='string')throw Error('即梦视频下载结果不完整');entry={resourceId,path:r.path,size:r.size,sha256:r.sha256};}
   const file=await fs.realpath(entry.path),relative=path.relative(realDir,file);if(relative.startsWith('..')||path.isAbsolute(relative)||path.extname(file).toLowerCase()!=='.mp4')throw Error('即梦结果路径或格式不正确');
   const size=(await fs.stat(file)).size;total+=size;if(size<=0||size!==entry.size||total>MAX_BYTES)throw Error('即梦视频大小异常或超过 128 MB，请在原画布核对');
   const bytes=await fs.readFile(file);if(bytes.toString('ascii',4,8)!=='ftyp'||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('即梦视频文件校验失败');
   media.push({dataUrl:'data:video/mp4;base64,'+bytes.toString('base64'),mimeType:'video/mp4'});if(!result.includes(entry))result.push(entry);
  }
  task.result=result;task.status='completed';delete task.error;delete task.errorInfo;await this.save(dir,task);return {...this.view(task),progress:100,media};
 }
 async queryOnce(id){const dir=this.taskDir(id),task=await this.read(dir);if(!task)throw Error('新版即梦任务不存在');if(await this.account()!==task.account)throw Error('该任务属于另一即梦账号');
  if(task.result?.length&&task.resourceIds?.length)return this.delivered(task);
  if(task.returnMode==='original'&&!task.runReceipt){
   const shown=await this.command(['node','show','--project-id',task.projectId,'--node-id',task.nodeId]),node=shown.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===task.nodeId)?.node;
   if(!node)throw Error('原画布视频节点不存在，请在官网核对');
   const videos=(node.resources||[]).filter(r=>r.type==='video');if(videos.length>1)throw Error('原节点存在多份视频，请在官网核对要回传的结果');
   if(videos[0]?.status==='success'){task.resourceIds=[videos[0].resourceId];await this.save(dir,task);return this.delivered(task);}
   if(videos.some(r=>['failed','canceled'].includes(r.status)))throw Error('画布视频生成失败，请在官网核对');return this.view(task);
  }
  if(task.returnMode==='interpolated'){
   const result=await require('./dreamina-canvas-results').interpolatedResult(this,task);
   if(result){
    delete task.error;delete task.errorInfo;
    if(result.waiting){task.status='awaiting_interpolation';if(result.message)task.interpolation={...task.interpolation,state:'action_required',message:result.message};if(result.hasCandidate)task.interpolation={...task.interpolation,state:'processing',message:'官方补帧正在处理，完成后自动回传'};await this.save(dir,task);if(result.sourceReady&&!result.hasCandidate&&this.interpolator)await this.interpolator.ensure(this,task,result.source);return this.view(task);}
    task.interpolatedNodeId=result.nodeId;if(task.interpolation?.attemptedAt)task.interpolatedFps=task.interpolation.fps||30;task.resourceIds=[result.resourceId];await this.save(dir,task);return this.delivered(task);
   }
  }
  if(task.status==='awaiting_confirmation'||task.status==='preparing'){
   // A successful submit can outlive a lost local write. Only adopt this exact original operation.
   const shown=await this.command(['node','show','--project-id',task.projectId,'--node-id',task.nodeId]),node=shown.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===task.nodeId)?.node;
   if(!node?.resources?.some(r=>r.submitId===task.submitId))return this.view(task);
  }
  if(task.status==='failed')return {...this.view(task),error:{message:task.error}};
  let r;try{r=await this.command(['operation','status',task.submitId,'--project-id',task.projectId]);}catch(error){return this.uncertain(task,error);}if(r.operationRef!==task.submitId)throw Error('新版即梦查询返回了其他任务');const resources=r.resources||[];
  if(resources.length&&resources.every(x=>x.state==='succeeded')){if(task.returnMode==='interpolated'){task.status='awaiting_interpolation';await this.save(dir,task);const next=await require('./dreamina-canvas-results').interpolatedResult(this,task);if(next?.waiting&&next.sourceReady&&!next.hasCandidate&&this.interpolator)await this.interpolator.ensure(this,task,next.source);return this.view(task);}task.resourceIds=resources.map(r=>r.resourceId);task.status='processing';await this.save(dir,task);return this.delivered(task);}
  if(r.state==='failed'||r.submission?.state==='rejected'||resources.some(x=>x.state==='failed')){task.status='failed';task.error=r.submissionError?.message||'新版即梦生成失败';await this.save(dir,task);return {...this.view(task),error:{message:task.error}};}
  if(r.submission?.state==='accepted'||['pending','running'].includes(r.state)){task.status='processing';delete task.error;delete task.errorInfo;await this.save(dir,task);}return this.view(task);
 }
}
class DreaminaRouter {
 constructor({canvas,legacy,accounts,agent}){this.canvas=canvas;this.legacy=legacy;this.accounts=accounts;this.agent=agent;}
 service(version='canvas',profile){if(!['canvas','legacy'].includes(version))throw Error('未知即梦版本');return version==='canvas'&&this.accounts?this.accounts.service(profile):this[version];}
 status(v,profile){return (v||'canvas')==='canvas'&&this.accounts?this.accounts.status(profile):this.service(v).status();}
 credits(v,profile){return this.service(v,profile).credits();} login(v,profile){return (v||'canvas')==='canvas'&&this.accounts?this.accounts.login(profile):this.service(v).login();} checkLogin(v,profile){return (v||'canvas')==='canvas'&&this.accounts?this.accounts.checkLogin(profile):this.service(v).checkLogin();} models(v,profile){return this.service(v,profile).models();} describe(m,v,profile){return this.service(v,profile).describe(m);} submit(p){if(p.version==='legacy'&&p.legacyMode==='agent'){if(!this.agent)throw Error('旧画布 Agent 服务未就绪');return this.agent.submit(p);}return (p.version||'canvas')==='canvas'&&this.accounts?this.accounts.submit(p):this.service(p.version).submit(p);} prepare(p){return (this.accounts||this.canvas).prepare(p);} confirm(p){return (this.accounts||this.canvas).confirm(p);} query(id,options){return (id.startsWith('dreamina-agent:')?this.agent:id.startsWith('dreamina-canvas:')?this.accounts||this.canvas:id.startsWith('dreamina:')?this.legacy:this.service('invalid')).query(id,options);}
}
module.exports={DreaminaCanvasService,DreaminaRouter,catalogFromModels,nodeId};
