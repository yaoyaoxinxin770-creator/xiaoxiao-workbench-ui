const {cliEnvironment}=require('./workbench-storage');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {randomUUID} = require('node:crypto');
const runFile = promisify(execFile);
const MAX_BYTES = 128 * 1024 * 1024;
const formats = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif', 'image/bmp':'bmp', 'image/svg+xml':'svg', 'video/mp4':'mp4', 'video/quicktime':'mov', 'video/webm':'webm', 'audio/mpeg':'mp3', 'audio/mp3':'mp3', 'audio/wav':'wav', 'audio/x-wav':'wav' };
const mimeFor = ext => Object.entries(formats).find(([,value])=>value===ext)?.[0];

class PippitService {
  constructor({executable, dataDir, execute = runFile}) { this.executable=executable; this.dataDir=dataDir; this.execute=execute; this.pending=new Map(); this.queries=new Map(); }
  async command(args, timeout=120000) {
    let stdout;
    try { ({stdout}=await this.execute(this.executable,['status','login','logout'].includes(args[0])?args:[...args,'--team-id','0'],{windowsHide:true,timeout,maxBuffer:8*1024*1024,env:cliEnvironment()})); }
    catch(error) {
      const lines=String(error.stderr || error.stdout || error.message || '').trim().split(/\r?\n/).filter(Boolean);
      const detail=lines.reverse().find(line=>!/^Command failed:/.test(line)) || '小云雀命令执行失败';
      throw new Error(detail.replace(/^generate-(image|video) 请求返回失败:\s*/,'小云雀拒绝了本次请求：'));
    }
    let value;
    try { value=JSON.parse(stdout.trim()); } catch { throw new Error('小云雀返回了无法读取的结果，请检查 CLI 版本'); }
    if(value.error_message) throw new Error(value.error_message);
    return value;
  }
  agentDir(id) {
    if(typeof id!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('无效的小云雀会话请求 ID');
    return path.join(this.dataDir,'agent',id);
  }
  agentSubmit(payload) {
    const dir=this.agentDir(payload.requestId),key='agent:'+payload.requestId;
    if(this.pending.has(key))return this.pending.get(key);
    const pending=this.agentSubmitOnce(dir,payload).finally(()=>this.pending.delete(key));
    this.pending.set(key,pending);return pending;
  }
  async agentSubmitOnce(dir,{requestId,message,threadId}) {
    if(typeof message!=='string' || !message.trim() || message.length>100000)throw new Error('小云雀画布请求为空或过长');
    if(threadId!==undefined && (typeof threadId!=='string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(threadId)))throw new Error('无效的小云雀会话 ID');
    const existing=await this.read(dir);
    if(existing) {
      if(existing.message!==message || existing.threadId!==threadId)throw new Error('同一请求 ID 不能用于不同会话内容');
      if(existing.thread_id && existing.run_id)return {requestId,threadId:existing.thread_id,runId:existing.run_id,webThreadLink:existing.web_thread_link};
      throw new Error('上次小云雀文字请求结果未知，已阻止重复提交。请到小云雀核对原会话。');
    }
    if(!(await this.status()).logged_in)throw new Error('小云雀尚未登录，请点击对话顶部的小云雀授权');
    await fs.mkdir(dir,{recursive:true});
    const task={requestId,message,threadId,status:'submitting'};await this.save(dir,task);
    const args=['submit-run','--message',message,'--source','codex'];if(threadId)args.push('--thread-id',threadId);
    try {
      const result=await this.command(args);
      if(!result.thread_id || !result.run_id || (threadId && result.thread_id!==threadId))throw new Error('小云雀没有返回匹配的会话标识，请核对原任务，勿重复提交');
      Object.assign(task,result,{status:'processing'});await this.save(dir,task);
      return {requestId,threadId:result.thread_id,runId:result.run_id,webThreadLink:result.web_thread_link};
    }catch(error){task.status='unknown';await this.save(dir,task);throw error;}
  }
  async agentQuery(requestId) {
    const dir=this.agentDir(requestId),task=await this.read(dir);
    if(!task)return {requestId,status:'not_submitted',reply:''};
    if(!task.thread_id || !task.run_id)return {requestId,status:'unknown',reply:''};
    if(task.result)return task.result;
    const {stdout}=await this.execute(this.executable,['get-thread','--thread-id',task.thread_id,'--run-id',task.run_id],{windowsHide:true,timeout:30000,maxBuffer:4*1024*1024,env:cliEnvironment()});
    const text=stdout.trim(),runStart=text.indexOf(task.run_id);
    if(runStart<0)throw new Error('小云雀未返回当前 Run，无法确认本轮结果');
    const runText=text.slice(runStart+task.run_id.length).split(/\n\s*[─-]{2,}\s*Run/)[0];
    const statusText=runText.split(/\[user\]|\[assistant\]/)[0];
    const complete=/状态\s*[:：]\s*(?:已完成|完成|completed|succeeded|success)/i.test(statusText);
    const failed=/状态\s*[:：]\s*(?:失败|已失败|取消|已取消|failed|cancelled|canceled)/i.test(statusText);
    // Role markers must start a line. The request envelope encodes user text as JSON,
    // so echoed user data cannot become an executable assistant response.
    const sections=[...runText.matchAll(/^\s*\[(assistant|user|tool|system)\]\s*/gm)];
    const replies=sections.flatMap((part,index)=>part[1]==='assistant'?[runText.slice(part.index+part[0].length,sections[index+1]?.index || runText.length).trim()]:[]);
    const result={requestId,threadId:task.thread_id,runId:task.run_id,webThreadLink:task.web_thread_link,status:failed?'error':complete?'completed':'processing',reply:replies.join('\n\n')};
    if(complete || failed){task.result=result;await this.save(dir,task);}
    return result;
  }
  async status() { const value=await this.command(['status']); return {logged_in:value.logged_in===true}; }
  async credits() {
    const value=await this.command(['get-credit-balance']);
    const balance=Number(value.total_remain_amount);
    if(value.total_remain_amount===undefined || !Number.isFinite(balance) || balance<0)throw new Error('小云雀没有返回有效积分余额');
    return {balance};
  }
  async login() { await this.command(['login'],300000); return this.status(); }
  async models() {
    const lists = await Promise.all(['image','video'].map(type=>this.command(['model','list','--type',type,'--refresh'])));
    const models=[], modelCapabilities={};
    lists.forEach((list,index)=>{
      for(const entry of list.models || []) {
        const name=index===0?entry.name:entry.key;
        if(!name || modelCapabilities[name]) throw new Error('小云雀模型名称缺失或重复，请检查模型列表');
        models.push(name); modelCapabilities[name]=index===0?'image':'video';
      }
    });
    return {models,modelCapabilities};
  }
  async describe(model,type) { if(typeof model!=='string' || !model.trim() || !['image','video'].includes(type))throw new Error('请选择有效模型'); const result=await this.command(['model','describe',model,'--type',type]); if(!result.model)throw new Error('小云雀未返回模型详情'); return result.model; }
  taskDir(id) {
    if(!/^pippit:[a-zA-Z0-9_-]+$/.test(id)) throw new Error('无效的小云雀任务 ID');
    return path.join(this.dataDir,id.slice(7));
  }
  async save(dir,value) { await fs.writeFile(path.join(dir,'task.json.tmp'),JSON.stringify(value)); await fs.rename(path.join(dir,'task.json.tmp'),path.join(dir,'task.json')); }
  async read(dir) { try { return JSON.parse(await fs.readFile(path.join(dir,'task.json'),'utf8')); } catch(error) { if(error.code==='ENOENT')return null; throw error; } }
  submit(payload) {
    const id='pippit:'+(payload.clientTaskId || randomUUID());
    this.taskDir(id);
    if(this.pending.has(id)) return this.pending.get(id);
    const request=this.submitOnce(id,payload).finally(()=>this.pending.delete(id));
    this.pending.set(id,request); return request;
  }
  async submitOnce(id,payload) {
    const dir=this.taskDir(id), previous=await this.read(dir);
    if(previous) {
      if(previous.thread_id && previous.run_id) return {id,status:'processing',model:previous.model};
      throw new Error('这次提交结果尚不确定，已阻止重复提交以避免重复扣费。请到小云雀查看原任务。');
    }
    if(payload.creationMode=== "draft")throw new Error("只建节点需要先连接本项目的小云雀画布；不会改为付费生成");
    const {type,model,prompt}=payload;
    const draft=type==='video' && typeof model==='string' && model.endsWith('_draft');
    const renderDraft=payload.draftTaskId!==undefined;
    if(renderDraft && (!draft || typeof payload.draftTaskId!=='string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(payload.draftTaskId)))throw new Error('只有有效的小云雀样片任务可转成片');
    if(!['image','video'].includes(type) || typeof model!=='string' || !model.trim() || (!renderDraft && (typeof prompt!=='string' || !prompt.trim()))) throw new Error('请选择小云雀模型并填写提示词');
    if(!(await this.status()).logged_in) throw new Error('小云雀尚未登录，请到配置中的小云雀渠道点击网页登录');
    const spec=await this.describe(model,type);
    const args=['generate-'+type,'--model',model];
    if(renderDraft)args.push('--draft-task-id',payload.draftTaskId);
    else { args.push('--prompt',prompt); if(draft)args.push('--draft'); }
    if(renderDraft && (payload.references?.length || payload.firstLast || payload.ratio || payload.resolution || payload.duration))throw new Error('样片转成片只能使用原样片任务，不可重新传入生成参数');
    if(payload.ratio) {
      const ratio=type==='image'?Object.entries(spec.ratio?.option_labels || {}).find(([,label])=>label===payload.ratio)?.[0]:payload.ratio;
      if(ratio===undefined || !spec.ratio?.options?.map(String).includes(String(ratio))) throw new Error('该小云雀模型不支持所选比例：'+payload.ratio);
      args.push('--ratio',String(ratio));
    }
    if(payload.resolution && !draft) {
      const resolution=type==='image'?payload.resolution.toUpperCase():payload.resolution;
      if(!spec.resolution?.options?.includes(resolution)) throw new Error('该小云雀模型不支持所选分辨率：'+resolution);
      args.push('--resolution',resolution);
    }
    if(type==='video' && payload.duration) {
      if(!Number.isInteger(payload.duration) || payload.duration<1) throw new Error('视频时长必须是正整数');
      if(spec.duration?.options?.length && !spec.duration.options.includes(payload.duration) || spec.duration?.min !== undefined && payload.duration < spec.duration.min || spec.duration?.max !== undefined && payload.duration > spec.duration.max) throw new Error('该小云雀模型不支持所选时长：'+payload.duration);
      args.push('--duration',String(payload.duration));
    }
    if(type==='image') { if(!Number.isInteger(payload.count || 1) || (payload.count || 1)<1 || payload.count>15)throw new Error('图片数量须为 1–15'); args.push('--generate-image-count',String(payload.count || 1)); }
    const refs=payload.references || [];
    if(!Array.isArray(refs))throw new Error('参考资产格式错误');
    if(payload.firstLast && refs.some(ref=>ref.kind!=='image'))throw new Error('首尾帧模式只能传入图片');
    if(payload.firstLast)args.push('--generate-type','1');
    else if(type==='video' && refs.length)args.push('--task-type','reference');
    await fs.mkdir(dir,{recursive:true});
    let total=0;const referenceFiles=[];
    for(const [index,ref] of refs.entries()) {
      if(!['image','video','audio'].includes(ref.kind) || (type==='image' && ref.kind!=='image'))throw new Error('当前生成类型不支持该参考资产');
      const match=/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(ref.dataUrl || '');
      const mime=match?.[1], ext=formats[mime];
      if(!ext || !mime.startsWith(ref.kind+'/'))throw new Error('不支持的参考资产格式：'+(mime || ref.kind));
      const bytes=Buffer.from(match[2],'base64'); total+=bytes.length;
      if(!bytes.length || bytes.length>MAX_BYTES || total>MAX_BYTES)throw new Error('一次参考资产总大小不能超过 128 MB');
      const file=path.join(dir,'reference-'+index+'.'+ext); await fs.writeFile(file,bytes); referenceFiles.push({kind:ref.kind,name:path.basename(String(ref.name||path.basename(file))),file:path.basename(file),mimeType:mime,bytes:bytes.length}); args.push('--'+ref.kind,file);
    }
    const task={id,type,model,status:'submitting',referenceFiles,createdAt:Date.now(),draftTaskId:renderDraft?payload.draftTaskId:undefined};
    await this.save(dir,task);
    // Write ahead: an interrupted paid submission must never be replayed automatically.
    try {
      const result=await this.command(args,300000);
      if(!result.thread_id || !result.run_id)throw new Error('提交未返回完整任务 ID，请到小云雀核对原任务，避免重复扣费');
      Object.assign(task,{thread_id:result.thread_id,run_id:result.run_id,status:'processing'}); await this.save(dir,task);
      return {id,status:task.status,model};
    } catch(error) { task.status='unknown'; task.error=error.message; await this.save(dir,task); throw error; }
  }
  async query(id) {
    this.taskDir(id);
    if(this.queries.has(id))return this.queries.get(id);
    const request=this.queryOnce(id).finally(()=>this.queries.delete(id)); this.queries.set(id,request); return request;
  }
  async queryOnce(id) {
    const dir=this.taskDir(id), task=await this.read(dir);
    if(!task?.thread_id || !task.run_id)throw new Error('任务 ID 不完整，请到小云雀核对原任务；不会重新生成');
    const outputDir=path.join(dir,'output'); await fs.mkdir(outputDir,{recursive:true});
    const result=task.result || await this.command(['query-result','--thread-id',task.thread_id,'--run-id',task.run_id,'--download-dir',outputDir]);
    if(!result.completed)return {id,status:'processing',model:task.model};
    if(result.thread_id && result.thread_id!==task.thread_id || result.run_id && result.run_id!==task.run_id)throw new Error('小云雀结果与原任务 ID 不一致');
    const entries=task.type==='image'?result.images:result.videos;
    if(!entries?.length)throw new Error('小云雀任务结束但没有返回所需媒体，请到小云雀查看原任务');
    const media=[]; let total=0;
    for(const entry of entries) {
      if(!entry.output_path)throw new Error('小云雀产物缺少本地路径');
      const file=await fs.realpath(path.resolve(entry.output_path)), relative=path.relative(await fs.realpath(outputDir),file);
      if(relative.startsWith('..') || path.isAbsolute(relative))throw new Error('小云雀产物路径不属于本次任务');
      const mime=mimeFor(path.extname(file).slice(1).toLowerCase());
      if(!mime?.startsWith(task.type+'/'))throw new Error('小云雀产物格式与任务类型不符');
      total+=(await fs.stat(file)).size;
      if(total>MAX_BYTES)throw new Error('产物超过 128 MB，请在小云雀中下载；原任务已保留，不会重新生成');
      const bytes=await fs.readFile(file); media.push({dataUrl:'data:'+mime+';base64,'+bytes.toString('base64'),mimeType:mime,draft:entry.draft,draftTaskId:entry.draft_task_id});
    }
    task.status='completed'; task.result=result; await this.save(dir,task);
    const isDraft=media[0]?.draft===false?false:Boolean(media[0]?.draft || media[0]?.draftTaskId);
    return {id,status:'completed',progress:100,model:task.model,draft:isDraft,draftTaskId:isDraft?media[0]?.draftTaskId:undefined,media};
  }
}
module.exports={PippitService};
