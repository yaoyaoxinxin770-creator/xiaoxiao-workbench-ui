const fs=require('node:fs/promises');
const path=require('node:path');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {createHash,randomUUID}=require('node:crypto');
const {cliEnvironment}=require('./workbench-storage');
const hash=value=>createHash('sha256').update(value).digest('hex');
const formats={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a','audio/ogg':'ogg'};
class OiioiiService {
 constructor({runtimeDir,dataDir,execute=promisify(execFile)}){this.runtimeDir=runtimeDir;this.dataDir=dataDir;this.execute=execute;this.pending=new Map();this.queries=new Map();}
 async command(args,timeout=120000){
  const env=cliEnvironment();for(const key of Object.keys(env))if(key.startsWith('OIIOII_'))delete env[key];
  env.OIIOII_CONFIG_DIR=path.join(this.dataDir,'cli');env.TEMP=env.TMP=path.join(this.dataDir,'tmp');await fs.mkdir(env.TEMP,{recursive:true});
  const argsFile=path.join(env.TEMP,randomUUID()+'.json');await fs.writeFile(argsFile,JSON.stringify([...args,'--json']),{mode:0o600});
  let output;try{output=(await this.execute(path.join(this.runtimeDir,'runtime/node/node.exe'),[path.join(this.runtimeDir,'oiioii-runner.cjs'),path.join(this.runtimeDir,'npm/node_modules/@oiioii/cli/dist/cli.js'),argsFile],{env,windowsHide:true,timeout,maxBuffer:8*1024*1024})).stdout;}catch(error){output=error.stdout;if(!output)throw Error('Oii CLI 执行失败，请检查安装和网络连接');}finally{await fs.rm(argsFile,{force:true});}
  let envelope;try{envelope=JSON.parse(output.trim());}catch{throw Error('Oii CLI 未返回有效 JSON');}
  if(!envelope.ok){const network=envelope.error?.code==='NETWORK_ERROR',upload=args.includes('upload'),creating=args.includes('canvas')&&args.includes('create'),generating=args.some(a=>['generate','edit','text'].includes(a)),name=upload?args[args.indexOf('--name')+1]:'';const message=network?(upload?'Oii 上传参考素材「'+name+'」时网络连接失败，尚未建立本次创作节点。请检查网络后重新创建；账号授权已保留。':creating?'Oii 保存画布节点时连接中断，结果待核对。请先到原画布查看，勿重复创建。':generating?'Oii 提交生成请求时连接中断，生成结果待核对。请先到原画布查看，勿重复提交。':'Oii 网络连接暂时失败，账号授权已保留；请检查网络后点击“刷新连接”。'):(envelope.error?.message||'Oii 请求失败');const error=Error(message);error.code=envelope.error?.code;error.details=envelope.error?.details;throw error;}
  return envelope.data;
 }
 async identity(){let config;try{config=JSON.parse(await fs.readFile(path.join(this.dataDir,'cli/config.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Oii 授权配置无法读取');config={};}return {fingerprint:hash(JSON.stringify([config.baseUrl||'https://api.oiioii.ai',config.apiKey||''])),workspaceId:config.defaultWorkspaceId||''};}
 async status(){const value=await this.command(['auth','status']);return {logged_in:value.authenticated===true,workspaceId:(await this.identity()).workspaceId,loginPending:Boolean(this.loginPending),loginError:this.loginError||''};}
 async login(){if(this.pending.size||this.queries.size)throw Error('Oii 正在提交或查询任务，请稍后再切换授权');if(!this.loginPending){this.loginError='';this.loginPending=this.command(['auth','login'],600000).catch(error=>{this.loginError=error.message;}).finally(()=>{this.loginPending=null;});}return {started:true};}
 async workspaces(){return this.command(['workspaces','list','--limit','50']);}
 async selectWorkspace(id){if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id||''))throw Error('Oii 画布 ID 无效');await this.command(['workspace','set',id]);return this.status();}
 async createWorkspace(name){if(typeof name!=='string'||!name.trim()||name.length>120)throw Error('请填写画布名称');return this.command(['workspace','create','--name',name.trim(),'--language','zh','--set-current']);}
 async models(){const result=await this.command(['inspect','models']);const rows=(result.models||[]).filter(row=>['image','video'].includes(row.domain));const models=[],modelCapabilities={},oiioiiModels={};for(const row of rows){if(!Number.isInteger(row.id))throw Error('Oii 模型 ID 无效');const label=(row.name||row.key)+(row.variant?' · '+row.variant:'')+' [Oii #'+row.id+']';models.push(label);modelCapabilities[label]=row.domain;oiioiiModels[label]=row;}return {models,modelCapabilities,oiioiiModels};}
 taskDir(id){if(!/^oiioii:[a-zA-Z0-9_-]{1,100}$/.test(id||''))throw Error('Oii 任务 ID 无效');return path.join(this.dataDir,'tasks',id.slice(7));}
 async read(dir){try{return JSON.parse(await fs.readFile(path.join(dir,'task.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 async save(dir,value){await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'task.json.tmp'),JSON.stringify(value));await fs.rename(path.join(dir,'task.json.tmp'),path.join(dir,'task.json'));}
 submit(payload){const id='oiioii:'+(payload.clientTaskId||randomUUID());this.taskDir(id);if(this.pending.has(id))return this.pending.get(id);const promise=this.submitOnce(id,payload).finally(()=>this.pending.delete(id));this.pending.set(id,promise);return promise;}
 async submitOnce(id,payload){
  const dir=this.taskDir(id),fingerprint=hash(JSON.stringify(payload)),identity=await this.identity(),prior=await this.read(dir);
  if(prior){if(prior.fingerprint!==fingerprint)throw Error('同一 Oii 请求 ID 不能用于不同内容');if(prior.identity!==identity.fingerprint)throw Error('Oii 账号已变化，请使用原授权查询此任务');if(prior.remoteId)return {id,status:'processing',model:prior.model};if(prior.status==='prepared'&&prior.creationMode==='draft')return {id,status:'awaiting_confirmation',preparationOnly:true,model:prior.model,canvasNodeId:prior.canvasNodeId,canvasUrl:prior.canvasUrl};throw Error('上次 Oii 提交结果待核对，已阻止重复提交。请到 Oii 官网查看原任务。');}
  if(this.loginPending)throw Error('请先完成 Oii 浏览器授权，再开始创作');
  const {type,model,prompt,references=[]}=payload;
  if(payload.creationMode!==undefined&&!['draft','direct'].includes(payload.creationMode))throw Error('无效的 Oii 创作方式');
  if(payload.creationMode==='draft'&&(type!=='video'||typeof prompt!=='string'||prompt.length>20000))throw Error('Oii 只建节点的提示词须在 20000 字以内');
  if(!['image','video'].includes(type)||typeof prompt!=='string'||!prompt.trim()||prompt.length>100000||!Array.isArray(references))throw Error('Oii 提示词或素材格式无效');
  const modelId=/\[Oii #(\d+)\]$/.exec(model||'')?.[1];if(!modelId)throw Error('请刷新并选择 Oii 模型');
  const workspaceId=identity.workspaceId;if(!workspaceId)throw Error('请先在其他渠道的 Oii 设置中选择或新建画布');
  if(!(await this.status()).logged_in)throw Error('请先在其他渠道中登录 Oii');
  if(type==='image'&&references.length>1)throw Error('Oii 图片编辑目前只支持选择一张参考图；视频可使用多种参考素材');
  let total=0;const files=[];for(const [index,ref] of references.entries()){const match=/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(ref.dataUrl||''),ext=formats[match?.[1]];if(!ext||!match[1].startsWith(ref.kind+'/')||!['image','video','audio'].includes(ref.kind)||type==='image'&&ref.kind!=='image')throw Error('Oii 不支持该参考素材格式');const bytes=Buffer.from(match[2],'base64');total+=bytes.length;if(!bytes.length||total>128*1024*1024)throw Error('Oii 单次参考素材总大小须小于 128 MB');files.push({kind:ref.kind,bytes,file:path.join(dir,'reference-'+index+'.'+ext),name:path.basename(ref.name||'reference-'+index+'.'+ext)});}
  const args=['--workspace',workspaceId,type,type==='video'?'generate':files.length?'edit':'text','--model-id',modelId,'--prompt',prompt];
  if(payload.ratio&&payload.ratio!=='adaptive')args.push('--aspect-ratio',payload.ratio);
  if(payload.resolution&&payload.resolution!=='auto')args.push('--resolution',payload.resolution);
  if(type==='video'){if(!Number.isInteger(payload.duration)||payload.duration<1||payload.duration>120)throw Error('Oii 视频时长无效');args.push('--duration',String(payload.duration));if(payload.firstLast)args.push('--mode',files.length===2?'frame2Video':'firstframe2Video');}
  // Persist before any remote mutation; an interrupted submission is never replayed automatically.
  const task={id,model,type,creationMode:payload.creationMode,workspaceId,identity:identity.fingerprint,fingerprint,status:'submitting',createdAt:Date.now()};await this.save(dir,task);
  const uploaded=[];
  try{for(const item of files){if((await this.identity()).fingerprint!==identity.fingerprint)throw Error('Oii 授权已变化，请重新载入本组');await fs.writeFile(item.file,item.bytes);const result=await this.command(['--workspace',workspaceId,'upload','file',item.file,'--name',item.name],660000);const uri=result.file_uri||result.uri;if(!String(uri).startsWith('hogi://'+item.kind+'/'))throw Error('Oii 上传未返回有效素材地址');args.push('--'+item.kind,uri);uploaded.push({kind:'media',media_type:item.kind,uri});}
   const labels={image:'图片',video:'视频',audio:'音频'};let resolvedPrompt=prompt;for(const kind of ['image','video','audio']){const refs=uploaded.filter(r=>r.media_type===kind);resolvedPrompt=resolvedPrompt.replace(new RegExp('@'+labels[kind]+'([1-9]\\d*)','g'),(raw,n)=>{const ref=refs[Number(n)-1];return ref?'['+({image:'Image',video:'Video',audio:'Audio'}[kind])+':'+ref.uri.slice('hogi://'.length)+']':raw;});}args[args.indexOf('--prompt')+1]=resolvedPrompt;
   // The official CLI validates catalog constraints and reference combinations without charging.
   await this.command([...args,'--dry-run']);
   const current=await this.identity();if(current.fingerprint!==identity.fingerprint)throw Error('Oii 授权在准备期间变化，请重新载入本组');
   if(payload.creationMode==='draft'){
    const inputFile=path.join(dir,'canvas-node.json'),title=require('./dreamina-canvas-drafts').videoNodeTitle(prompt);
    await fs.writeFile(inputFile,JSON.stringify({nodes:[{client_id:'video',type:'video',title,prompt:resolvedPrompt,generation_config:{duration:payload.duration,...(payload.ratio&&payload.ratio!=='adaptive'?{ratio:payload.ratio}:{}),...(payload.resolution&&payload.resolution!=='auto'?{resolution:payload.resolution}:{})},references:uploaded}]}));
    const created=await this.command(['workspace','canvas','create',workspaceId,'--input',inputFile,'--idempotency-key',id]);
    const node=created.nodes?.find(n=>n.client_id==='video');if(created.workspace_id!==workspaceId||!node?.asset_id)throw Error('Oii 草稿节点未确认，请到官网核对');
    task.canvasNodeId=node.asset_id;task.canvasUrl='https://www.oiioii.tv/space/'+workspaceId;await this.save(dir,task);
    if((await this.identity()).fingerprint!==identity.fingerprint)throw Error('Oii 授权已变化，请核对原画布草稿');
    await this.command(['--workspace',workspaceId,'workspace','canvas','node','update',node.asset_id,'--model-id',modelId]);
    task.status='prepared';await this.save(dir,task);return {id,status:'awaiting_confirmation',preparationOnly:true,model,canvasNodeId:task.canvasNodeId,canvasUrl:task.canvasUrl};
   }
   const result=await this.command(args,300000);if(!result.task_id)throw Error('Oii 未返回任务 ID，请到官网核对，勿重复生成');
   Object.assign(task,{remoteId:result.task_id,localId:result.local_task_id,status:'processing'});await this.save(dir,task);return {id,status:'processing',model};
  }catch(error){task.status='unknown';task.error=error.message;if(error.details?.local_task_id)task.localId=error.details.local_task_id;await this.save(dir,task);throw error;}
 }
 query(id){this.taskDir(id);if(this.queries.has(id))return this.queries.get(id);const promise=this.queryOnce(id).finally(()=>this.queries.delete(id));this.queries.set(id,promise);return promise;}
 async queryOnce(id){const dir=this.taskDir(id),task=await this.read(dir);if(!task)throw Error('Oii 本地任务不存在');if(task.identity!==(await this.identity()).fingerprint)throw Error('Oii 账号已变化，请使用原授权查询此任务');if(task.status==='prepared'&&task.creationMode==='draft')return {id,status:'awaiting_confirmation',preparationOnly:true,model:task.model,canvasNodeId:task.canvasNodeId,canvasUrl:task.canvasUrl};if(!task.remoteId&&!task.localId)throw Error('Oii 提交结果待核对，请到官网查看原任务；不会重新生成');const result=await this.command(['task','status',task.remoteId||task.localId]),remote=result.task;if(!remote||remote.workspaceId!==task.workspaceId||task.remoteId&&remote.backendTaskId!==task.remoteId)throw Error('Oii 返回的任务与原画布或任务 ID 不一致');if(remote.status==='submitting'&&!remote.backendTaskId)throw Error('Oii 提交结果未知，请到官网核对；不会自动重新生成');if(['failed','cancelled'].includes(remote.status))return {id,status:'failed',error:{message:remote.error?.message||'Oii 生成失败'}};if(remote.status!=='succeeded')return {id,status:'processing',progress:remote.progress||0,model:task.model};
  const outputDir=path.join(dir,'output');await fs.mkdir(outputDir,{recursive:true});const media=[];for(const uri of remote.resourceUris||[]){if(!uri.startsWith('hogi://'+task.type+'/'))throw Error('Oii 产物类型不匹配');const result=await this.command(['record','open',uri,'--output',outputDir,'--no-open'],330000),file=await fs.realpath(result.path),relative=path.relative(await fs.realpath(outputDir),file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Oii 产物路径越界');if((await fs.stat(file)).size>128*1024*1024)throw Error('Oii 产物超过 128 MB，请到官网直接下载');const mime=result.mime_type||Object.keys(formats).find(key=>formats[key]===path.extname(file).slice(1));if(!mime?.startsWith(task.type+'/'))throw Error('Oii 产物媒体格式无效');media.push({dataUrl:'data:'+mime+';base64,'+(await fs.readFile(file)).toString('base64'),mimeType:mime});}if(!media.length)throw Error('Oii 任务完成但没有返回产物');task.status='completed';await this.save(dir,task);return {id,status:'completed',progress:100,model:task.model,media};
 }
}
module.exports={OiioiiService};
