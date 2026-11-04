'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {inspectAgentTurn,inspectAgentPreview,assertMediaUrl}=require('./dreamina-legacy-agent-page');
const MAX_BYTES=128*1024*1024;
const kinds={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a'};
const sameCanvas=(a,b)=>{try{const left=new URL(a),right=new URL(b);return left.origin==='https://jimeng.jianying.com'&&right.origin===left.origin&&/^\/ai-tool\/canvas\/\d+$/.test(left.pathname)&&left.pathname===right.pathname;}catch{return false;}};
const modelNames={'seedance2.0':'Seedance 2.0（标准版，非VIP、非Fast、非Mini）','seedance2.0fast':'Seedance 2.0 Fast（非VIP）','seedance2.0_vip':'Seedance 2.0 VIP','seedance2.0fast_vip':'Seedance 2.0 Fast VIP','seedance2.0mini':'Seedance 2.0 Mini','seedance2.5':'Seedance 2.5'};
function agentPrompt(p){
  if(!modelNames[p.model])throw Error('旧画布 Agent 尚未适配此模型名称，请使用 CLI 直出');
  return `使用${modelNames[p.model]}生成1个${p.duration}秒的视频，画幅${p.ratio}，分辨率${p.resolution}。严格使用指定模型、时长与数量，提示词原文原样传给生成工具，不要扩写。${p.firstLast?'上传图片按首帧、尾帧顺序使用。':''}\n提示词原文：\n${p.prompt}`;
}
class DreaminaLegacyAgentService {
  constructor({legacy,bridge,dataDir}){this.legacy=legacy;this.bridge=bridge;this.dataDir=dataDir;this.pending=new Map();this.queries=new Map();this.queue=Promise.resolve();this.bindingQueue=Promise.resolve();}
  taskDir(id){if(typeof id!=='string'||!/^dreamina-agent:[a-zA-Z0-9_-]{1,120}$/.test(id))throw Error('无效的旧画布 Agent 任务编号');return path.join(this.dataDir,id.slice(15));}
  read(dir){return this.legacy.read(dir);} save(dir,task){return this.legacy.save(dir,task);}
  async bindings(){try{return JSON.parse(await fs.readFile(path.join(this.dataDir,'bindings.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
  projectKey(value){if(typeof value!=='string'||!value.trim()||value.length>300)throw Error('请先选择视频项目');return createHash('sha256').update(value).digest('hex');}
  async settings(projectKey){const bound=(await this.bindings())[this.projectKey(projectKey)];return bound||null;}
  bind(payload){const result=this.bindingQueue.catch(()=>{}).then(()=>this.bindOnce(payload));this.bindingQueue=result;return result;}
  async bindOnce({projectKey,targetId}){
    if(this.bridge.running)throw Error('正在发送任务，请稍后绑定画布');
    const target=(await this.bridge.targets()).find(t=>t.id===targetId);
    if(!target||!sameCanvas(target.url,target.url))throw Error('目标不是当前已连接浏览器中的旧画布');
    await this.bridge.configure({mode:'cdp',targetId});
    const status=await this.bridge.status();if(!status.online)throw Error(status.error||'画布尚未连接');
    const bound={targetId:target.id,url:target.url,name:target.title||'即梦旧画布'};
    const bindings=await this.bindings();bindings[this.projectKey(projectKey)]=bound;
    await fs.mkdir(this.dataDir,{recursive:true});const file=path.join(this.dataDir,'bindings.json');await fs.writeFile(file+'.tmp',JSON.stringify(bindings));await fs.rename(file+'.tmp',file);return bound;
  }
  async capture(projectKey){const target=await this.settings(projectKey);if(!target)throw Error('请先在旧版渠道绑定目标旧画布');return {...target};}
  async ensureTarget(target){
    if(this.bridge.config.mode!=='cdp')throw Error('旧画布 Agent 需要工作台的浏览器直连，请打开连接设置');
    await this.bridge.ensure();
    if(!sameCanvas(this.bridge.target?.url,target?.url))throw Error('浏览器当前连接了其他画布，请重新连接此任务的原画布；未发送');
  }
  submit(payload){
    const snapshot=structuredClone(payload),id='dreamina-agent:'+(payload.clientTaskId||randomUUID());this.taskDir(id);
    const signature=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    if(this.pending.has(id)){const old=this.pending.get(id);if(old.signature!==signature)throw Error('同一任务编号不能用于不同生成内容');return old.promise;}
    const promise=this.queue.catch(()=>{}).then(()=>this.submitOnce(id,snapshot,signature)).finally(()=>this.pending.delete(id));
    this.queue=promise;this.pending.set(id,{signature,promise});return promise;
  }
  result(task,extra={}){return {id:task.id,status:task.status,model:task.model,canvasUrl:task.canvasUrl,...(task.error?{error:{message:task.error}}:{}),...extra};}
  async submitOnce(id,p,signature){
    const dir=this.taskDir(id),old=await this.read(dir);
    if(old){if(old.signature!==signature)throw Error('同一任务编号不能用于不同生成内容');return this.result(old);}
    if(typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>100000)throw Error('请填写视频提示词');
    const spec=await this.legacy.describe(p.model),refs=p.references||[];
    if(!Number.isInteger(p.duration)||p.duration<spec.duration.min||p.duration>spec.duration.max||!spec.ratio.options.includes(p.ratio)||!spec.resolution.options.includes(p.resolution))throw Error('模型不支持所选时长、比例或分辨率');
    if(!Array.isArray(refs)||refs.length>spec.references.total||refs.some(r=>!['image','video','audio'].includes(r.kind))||['image','video','audio'].some(kind=>refs.filter(r=>r.kind===kind).length>spec.references[kind+'s']))throw Error('参考素材数量超过当前模型限制');
    if(refs.some(r=>r.kind==='audio')&&!refs.some(r=>r.kind==='image'||r.kind==='video')&&!spec.references.audioOnly)throw Error('该模型使用音频时至少需要一张图片或一个视频');
    if(p.firstLast&&(refs.length<1||refs.length>2||refs.some(r=>r.kind!=='image')))throw Error('首尾帧须为一张首帧或两张有序图片');
    const target=p.legacyAgentCapture||await this.capture(p.projectKey),fullText=agentPrompt(p);
    await this.ensureTarget(target);
    if(this.bridge.running)throw Error('浏览器正在发送其他任务，请稍后再开始');
    const baselineIds=await this.bridge.evaluate('[...document.querySelectorAll(\'[id^="item_"][data-id]\')].map(n=>n.dataset.id)');
    const localFiles=[];let total=0;
    for(const [i,ref] of refs.entries()){
      const match=/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(ref.dataUrl||''),ext=kinds[match?.[1]];
      if(!ext||!['image','video','audio'].includes(ref.kind)||!match[1].startsWith(ref.kind+'/'))throw Error('参考素材格式不支持');
      const bytes=Buffer.from(match[2],'base64');total+=bytes.length;if(!bytes.length||total>MAX_BYTES)throw Error('参考素材总大小须在128 MB以内');
      const name=String(ref.name||'素材').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.[^.]+$/,'').slice(0,70),relativePath=`${i}-${name}.${ext}`;
      await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,relativePath),bytes);localFiles.push({root:dir,relativePath,name:`${name}.${ext}`,type:match[1]});
    }
    const task={id,signature,model:p.model,duration:p.duration,prompt:fullText,baselineIds:baselineIds||[],canvasUrl:target.url,target,status:'submitting',createdAt:Date.now(),clientTaskId:p.clientTaskId||id.slice(15)};
    await this.save(dir,task);
    try{
      const result=await this.bridge.execute({expectedCanvasUrl:target.url,source:'desktop-workbench',bridgeProtocolVersion:1,promptIsFinal:true,localFiles,segment:{prompt:fullText,clientTaskId:task.clientTaskId,requireAgentMode:true,expectedVideoCount:1}});
      task.executionId=result.executionId;task.canvasUrl=result.canvasUrl||target.url;
      const proofs=result.creditConfirmation?.turnProof||[];if(proofs.length===1)task.turnId=proofs[0].turnId;
      task.status=result.ok&&result.confirmed?'processing':result.clicked||result.code==='CDP_PENDING_REVIEW'||result.code==='CDP_CONTEXT_LOST'?'unknown':'failed';
      task.error=result.ok?undefined:result.error||'原任务提交状态待核对，请勿重发';
    }catch(error){task.status='unknown';task.error=String(error.message||error);}
    await this.save(dir,task);return this.result(task);
  }
  query(id){this.taskDir(id);if(this.queries.has(id))return this.queries.get(id);const promise=this.queryOnce(id).finally(()=>this.queries.delete(id));this.queries.set(id,promise);return promise;}
  async queryOnce(id){
    const dir=this.taskDir(id),task=await this.read(dir);if(!task)throw Error('旧画布任务记录不存在');
    if(this.pending.has(id))return this.result(task);
    if(task.status==='completed'){const bytes=await fs.readFile(path.join(dir,'output.mp4'));return this.result(task,{progress:100,media:[{dataUrl:'data:video/mp4;base64,'+bytes.toString('base64'),mimeType:'video/mp4'}]});}
    if(task.status==='failed'||task.stopped)return this.result(task);
    try{
      await this.ensureTarget(task.target);
      const observation=await this.bridge.evaluate('('+inspectAgentTurn.toString()+')('+JSON.stringify({turnId:task.turnId,prompt:task.prompt,baselineIds:task.baselineIds})+')');
      if(observation.turnId)task.turnId=observation.turnId;
      if(observation.status==='ready'){
        const media=observation.url?observation:await this.preview(task,observation.previewElementId);
        if(!media){task.status='processing';task.error=undefined;await this.save(dir,task);return this.result(task);}
        if(media.duration&&Math.abs(media.duration-task.duration)>.4)throw Error('官网成片时长与所选时长不一致，请在原画布核对；不会重新生成');
        const url=assertMediaUrl(media.url),page=await this.bridge.pageForTarget(this.bridge.target.id);
        const response=await page.context().request.get(url,{timeout:120000,maxRedirects:0});
        try{
          if(!response.ok()||Number(response.headers()['content-length']||0)>MAX_BYTES)throw Error('官网视频下载失败或超过128 MB，原任务已保留');
          const bytes=await response.body();if(bytes.length>MAX_BYTES||bytes.subarray(4,8).toString()!=='ftyp')throw Error('官网返回的内容不是可验证的MP4视频');
          await fs.writeFile(path.join(dir,'output.mp4'),bytes);task.status='completed';task.error=undefined;await this.save(dir,task);
          return this.result(task,{progress:100,media:[{dataUrl:'data:video/mp4;base64,'+bytes.toString('base64'),mimeType:'video/mp4'}]});
        }finally{await response.dispose();}
      }
      task.status=observation.status;task.error=observation.status==='unknown'||observation.status==='failed'?observation.detail:undefined;
      await this.save(dir,task);return this.result(task);
    }catch(error){return this.result(task,{status:task.status==='submitting'?'unknown':task.status,error:{message:String(error.message||error)}});}
  }
  async preview(task,elementId){
    if(this.bridge.running||this.bridge.pending||this.bridge.legacyReadBusy)return null;
    this.bridge.legacyReadBusy=true;let page,opened=false;
    try{
      if(await this.bridge.evaluate('('+inspectAgentPreview.toString()+')()'))throw Error('请先关闭官网正在查看的其他视频预览，再同步本条结果');
      page=await this.bridge.pageForTarget(this.bridge.target.id);if(!page)return null;
      const turn=page.locator('[id='+JSON.stringify(elementId)+']');
      await turn.getByRole('button',{name:'预览 · 视频',exact:true}).click();opened=true;
      for(let i=0;i<10;i++){const media=await this.bridge.evaluate('('+inspectAgentPreview.toString()+')()');if(media)return media;await new Promise(resolve=>setTimeout(resolve,500));}
      return null;
    }finally{try{if(opened){const close=page.getByRole('button',{name:'关闭',exact:true});if(await close.count()===1)await close.click();}}finally{this.bridge.legacyReadBusy=false;}}
  }
}
module.exports={DreaminaLegacyAgentService,agentPrompt,sameCanvas};
