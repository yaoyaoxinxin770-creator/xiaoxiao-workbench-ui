const {cliEnvironment}=require('./workbench-storage');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {createHash,randomUUID} = require('node:crypto');
const runFile=promisify(execFile), MAX_BYTES=128*1024*1024;
const formats={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','audio/wav':'wav','audio/mpeg':'mp3','audio/mp4':'m4a'};
function parseJson(output) {
  const text=String(output||'').trim();
  try{return JSON.parse(text);}catch{}
  // This release may prepend a logger warning; only consume a complete JSON envelope.
  for(let i=text.indexOf('{');i>=0;i=text.indexOf('{',i+1)){try{return JSON.parse(text.slice(i));}catch{}}
  throw Error('即梦 CLI 未返回有效 JSON，请核对原任务，不要重复提交');
}
function catalogFromHelp(help,multimodalHelp) {
  const models=help.match(/- model_version: ([^\r\n]+)/)?.[1].split(',').map(s=>s.trim());
  const ratios=help.match(/- ratio: ([^\r\n]+)/)?.[1].split(',').map(s=>s.trim());
  if(!models?.length || !ratios?.length)throw Error('当前即梦 CLI 模型说明不兼容，请更新接入适配');
  const specs={};
  for(const model of models){
    const lines=help.split(/\r?\n/), specific=lines.find(l=>l.startsWith('- '+model+' ->'));
    const fallback=lines.find(l=>l.startsWith('- all other models ->'));
    const durationLine=(specific?.includes('duration ')?specific:null)||lines.find(l=>/duration 4-15s/.test(l));
    const range=durationLine?.match(/duration (\d+)-(\d+)s/);
    const resolutionLine=(specific?.includes('video_resolution ')?specific:null)||fallback;
    const resolutions=resolutionLine?.split('->')[1]?.split(';')[0].match(/\d+p|\d+k/g);
    if(!range || !resolutions?.length)throw Error('即梦模型参数缺失：'+model);
    const limitsLine=multimodalHelp.split(/\r?\n/).find(l=>l.startsWith('- '+model+' ->')&&l.includes('total inputs')) || multimodalHelp.split(/\r?\n/).find(l=>l.startsWith('- seedance2.0 family/'));
    const limit=name=>Number(limitsLine?.match(new RegExp(name+'<=([0-9]+)'))?.[1]);
    const total=Number(limitsLine?.match(/total inputs<=([0-9]+)/)?.[1]);
    const maxDurationMs=Number(limitsLine?.match(/duration (?:[0-9]+)-([0-9]+)s/)?.[1])*1000;
    specs[model]={ratio:{default:'16:9',options:ratios},duration:{default:5,min:Number(range[1]),max:Number(range[2]),step:1},resolution:{default:resolutions.includes('720p')?'720p':resolutions[0],options:resolutions},references:{images:limit('image'),videos:limit('video'),audios:limit('audio'),total,maxDurationMs,audioOnly:Boolean(limitsLine?.includes('audio-only is allowed'))}};
    if(Object.values(specs[model].references).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('即梦参考素材参数缺失：'+model);
  }
  return {models,modelCapabilities:Object.fromEntries(models.map(m=>[m,'video'])),specs};
}
class DreaminaService {
 constructor({executable,dataDir,execute=runFile,profile,stateDir}){this.executable=executable;this.dataDir=dataDir;this.execute=execute;this.profile=profile;this.stateDir=stateDir;this.pending=new Map();this.queries=new Map();this.loginChallenge=null;}
 async raw(args,timeout=120000){return this.execute(this.executable,this.profile?[...args,"--profile",this.profile]:args,{windowsHide:true,timeout,maxBuffer:8*1024*1024,env:{...cliEnvironment(),...(this.stateDir?{DREAMINA_CANVAS_STATE_DIR:this.stateDir}:{})}});}
 async command(args,timeout){
  let output;
  try{output=(await this.raw(args,timeout)).stdout;}
  catch(error){let value;try{value=parseJson(error.stdout);}catch{}if(value?.submit_id&&['querying','success','fail'].includes(value.gen_status))return value;throw Error(value?.fail_reason||value?.error?.message||value?.message||(error.code==='ENOENT'?'即梦 CLI 运行程序不存在，请重新打开完整安装包':'即梦 CLI 请求未完成，请核对登录或原任务'));}
  return parseJson(output);
 }
 async status(){const value=await this.command(['user_credit']);const logged_in=Number(value.user_id)>0;return {logged_in,balance:logged_in&&Number.isFinite(Number(value.total_credit))?Number(value.total_credit):null};}
 async credits(){const s=await this.status();if(!s.logged_in)throw Error('即梦生成服务未返回有效账号，请检查授权与账号权限');return {balance:s.balance};}
 async login(){if((await this.status()).logged_in)return {logged_in:true};if(!this.loginChallenge){const output=(await this.raw(['login','--headless'])).stdout;let result;try{result=parseJson(output);}catch(error){const fields=Object.fromEntries(String(output).split(/\r?\n/).flatMap(line=>{const m=/^(verification_uri|user_code|device_code):\s*(.+)$/.exec(line);return m?[[m[1],m[2]]]:[];}));if(fields.verification_uri&&fields.user_code&&fields.device_code)result=fields;else{if(String(output).trim()!=="已复用当前本地 OAuth 登录态。")throw error;return {logged_in:false,reused:true,accountUnavailable:true};}}if(!result.verification_uri||!result.user_code||!result.device_code||new URL(result.verification_uri).protocol!=='https:')throw Error('即梦未返回完整授权信息');this.loginChallenge={url:result.verification_uri,code:result.user_code,deviceCode:result.device_code};}return {logged_in:false,url:this.loginChallenge.url,code:this.loginChallenge.code};}
 async checkLogin(){if(!this.loginChallenge)return this.status();try{await this.command(['login','checklogin','--device_code='+this.loginChallenge.deviceCode,'--poll=0']);}catch(error){const observed=await this.status().catch(()=>null);if(observed?.logged_in){this.loginChallenge=null;return observed;}throw error;}const s=await this.status();if(s.logged_in)this.loginChallenge=null;return s;}
 async models(){const results=await Promise.all([this.raw(['text2video','-h']),this.raw(['multimodal2video','-h'])]);return catalogFromHelp(results[0].stdout,results[1].stdout);}
 async describe(model){const spec=(await this.models()).specs[model];if(!spec)throw Error('当前即梦 CLI 不支持该模型：'+model);return spec;}
 taskDir(id){if(typeof id!=='string'||!/^dreamina:[a-zA-Z0-9_-]{1,120}$/.test(id))throw Error('无效的即梦任务编号');return path.join(this.dataDir,id.slice(9));}
 async read(dir){try{return JSON.parse(await fs.readFile(path.join(dir,'task.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async save(dir,task){await fs.mkdir(dir,{recursive:true});const tmp=path.join(dir,'task.json.tmp');await fs.writeFile(tmp,JSON.stringify(task));await fs.rename(tmp,path.join(dir,'task.json'));}
 submit(payload){const id='dreamina:'+(payload.clientTaskId||randomUUID());this.taskDir(id);const signature=createHash('sha256').update(JSON.stringify(payload)).digest('hex');if(this.pending.has(id)){const existing=this.pending.get(id);if(existing.signature!==signature)throw Error('同一任务编号不能用于不同生成内容');return existing.promise;}const p=this.submitOnce(id,payload).finally(()=>this.pending.delete(id));this.pending.set(id,{promise:p,signature});return p;}
 async submitOnce(id,payload){
  const dir=this.taskDir(id),signature=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),previous=await this.read(dir);
  if(previous){if(previous.signature!==signature)throw Error('同一任务编号不能用于不同生成内容');if(previous.submitId)return {id,status:previous.status==='failed'?'failed':'processing',model:previous.model,...(previous.error?{error:{message:previous.error}}:{})};throw Error('上次即梦提交结果不确定，已阻止重复扣费。请先到即梦核对原任务。');}
  const {model,prompt,duration,ratio,resolution,firstLast}=payload,refs=payload.references||[];
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>100000||!Array.isArray(refs))throw Error('请填写有效的即梦视频提示词和参考素材');
  const spec=await this.describe(model);
  if(!Number.isInteger(duration)||duration<spec.duration.min||duration>spec.duration.max)throw Error('该即梦模型不支持所选时长');
  if(!spec.resolution.options.includes(resolution)||!spec.ratio.options.includes(ratio))throw Error('该即梦模型不支持所选比例或清晰度');
  if(firstLast&&(refs.length<1||refs.length>2||refs.some(r=>r.kind!=='image')))throw Error('首尾帧只能使用一张首帧或两张有序图片');
  const counts=Object.fromEntries(['image','video','audio'].map(kind=>[kind,refs.filter(r=>r.kind===kind).length]));
  if(refs.some(r=>!['image','video','audio'].includes(r.kind))||counts.image>spec.references.images||counts.video>spec.references.videos||counts.audio>spec.references.audios||refs.length>spec.references.total)throw Error('参考素材数量超过即梦模型限制');
  if(counts.audio&&!counts.image&&!counts.video&&!spec.references.audioOnly)throw Error('该即梦模型使用音频时至少需要一张图片或一个视频');
  if(!(await this.status()).logged_in)throw Error('即梦生成服务未返回有效账号，请检查授权与账号权限');
  const command=firstLast?(refs.length===2?'frames2video':'image2video'):refs.length?'multimodal2video':'text2video';
  const args=[command,'--model_version='+model,'--prompt='+prompt,'--duration='+duration,'--video_resolution='+resolution,'--poll=0'];
  // The installed CLI explicitly rejects ratio for Seedance 2.5 frame inputs.
  if(!(firstLast&&model==='seedance2.5'))args.push('--ratio='+ratio);
  await fs.mkdir(dir,{recursive:true});let total=0;
  for(const [index,ref] of refs.entries()){
   const match=/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(ref.dataUrl||''),mime=match?.[1],ext=formats[mime];
   if(!ext||!mime.startsWith(ref.kind+'/'))throw Error('即梦参考素材格式不支持');
   const bytes=Buffer.from(match[2],'base64');total+=bytes.length;if(!bytes.length||total>MAX_BYTES)throw Error('即梦参考素材总大小须在 128 MB 以内');
   const name=String(ref.name||'素材').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\.[^.]+$/,'').slice(0,70);
   const file=path.join(dir,index+'-'+name+'.'+ext);await fs.writeFile(file,bytes);
   args.push('--'+(firstLast&&refs.length===2?(index===0?'first':'last'):ref.kind)+'='+file);
  }
  if(args.reduce((n,a)=>n+a.length+3,0)>30000)throw Error("提示词与素材路径超出 Windows 命令行长度，请缩短提示词");
  const task={id,model,signature,status:'submitting',createdAt:Date.now()};await this.save(dir,task);
  try{const r=await this.command(args,300000);if(typeof r.submit_id!=='string'||! /^[a-zA-Z0-9_-]{1,160}$/.test(r.submit_id)||!['querying','success','fail'].includes(r.gen_status))throw Error(r.fail_reason||'即梦未返回完整任务编号');task.submitId=r.submit_id;task.status=r.gen_status==='fail'?'failed':'processing';task.error=r.fail_reason;await this.save(dir,task);return {id,status:task.status,model,error:task.error?{message:task.error}:undefined};}catch(error){task.status='unknown';await this.save(dir,task);throw error;}
 }
 query(id){this.taskDir(id);if(this.queries.has(id))return this.queries.get(id);const p=this.queryOnce(id).finally(()=>this.queries.delete(id));this.queries.set(id,p);return p;}
 async queryOnce(id){
  const dir=this.taskDir(id),task=await this.read(dir);if(!task?.submitId)return {id,status:'failed',model:task?.model,error:{message:'即梦任务结果不确定，请到即梦核对原任务；已阻止自动重发'}};
  if(task.status==='failed')return {id,status:'failed',model:task.model,error:{message:task.error||'即梦生成失败'}};
  const outputDir=path.join(dir,'output');await fs.mkdir(outputDir,{recursive:true});
  let result=task.result;if(!result){const r=await this.command(['query_result','--submit_id='+task.submitId,'--download_dir='+outputDir]);if(r.submit_id!==task.submitId)throw Error('即梦查询结果与原任务编号不一致');if(r.gen_status==='fail'){task.status='failed';task.error=r.fail_reason||'即梦生成失败';await this.save(dir,task);return {id,status:'failed',model:task.model,error:{message:task.error}};}if(r.gen_status!=='success')return {id,status:'processing',model:task.model};const videos=r.result_json?.videos;if(!Array.isArray(videos)||!videos.length)throw Error('即梦任务结束但没有返回视频');result=videos.map(v=>({path:v.path}));}
  const realDir=await fs.realpath(outputDir),media=[];let total=0;
  for(const entry of result){if(typeof entry.path!=='string')throw Error('即梦视频没有本地下载路径');const file=await fs.realpath(entry.path),relative=path.relative(realDir,file);if(relative.startsWith('..')||path.isAbsolute(relative)||path.extname(file).toLowerCase()!=='.mp4')throw Error('即梦结果路径或文件格式不正确');total+=(await fs.stat(file)).size;if(total>MAX_BYTES)throw Error('视频超过 128 MB，请在即梦下载；原任务已保留');media.push({dataUrl:'data:video/mp4;base64,'+(await fs.readFile(file)).toString('base64'),mimeType:'video/mp4'});}
  task.result=result;task.status='completed';await this.save(dir,task);return {id,status:'completed',progress:100,model:task.model,media};
 }
}
module.exports={DreaminaService,catalogFromHelp,parseJson};
