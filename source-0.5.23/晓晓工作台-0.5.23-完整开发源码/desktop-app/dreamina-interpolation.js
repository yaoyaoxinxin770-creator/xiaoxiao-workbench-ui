'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {inspectInterpolationPage}=require('./dreamina-interpolation-page');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const identityHash=value=>createHash('sha256').update(String(value||'')).digest('hex');
function canvasUrl(task){const url=new URL(task.webUrl||'https://jimeng.jianying.com/ai-tool/ai-canvas/'+task.projectId);if(url.origin!=='https://jimeng.jianying.com'||url.pathname!=='/ai-tool/ai-canvas/'+task.projectId||!/^([a-f0-9]{8}-[a-f0-9-]{27})$/.test(task.projectId))throw Error('补帧画布身份不匹配');return url.origin+url.pathname;}
class DreaminaInterpolation{
 constructor({BrowserWindow,dataDir}){this.BrowserWindow=BrowserWindow;this.dataDir=dataDir;this.windows=new Map();this.writes=new Map();this.revoked=new Set();this.pending=new Map();this.queue=Promise.resolve();this.disposing=false;}
 key(profile,account){if(!/^(default|wb-[a-f0-9]{32})$/.test(profile)||!/^\d+$/.test(account))throw Error('补帧账号配置无效');return createHash('sha256').update(profile+'\0'+account).digest('hex');}
 file(key){return path.join(this.dataDir,key+'.json');}
 async read(key){try{return JSON.parse(await fs.readFile(this.file(key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 save(key,state){const work=(this.writes.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{await fs.mkdir(this.dataDir,{recursive:true});const file=this.file(key);await fs.writeFile(file+'.tmp',JSON.stringify(state));await fs.rename(file+'.tmp',file);});this.writes.set(key,work);return work;}
 async status(profile,account){const key=this.key(profile,account),state=await this.read(key),win=this.windows.get(key);return {profile,enabled:!this.revoked.has(key)&&state?.enabled===true&&state.account===account,loginWindowOpen:Boolean(win&&!win.isDestroyed()&&win.isVisible()),background:true,fps:30};}
 window(profile,account){const key=this.key(profile,account);let win=this.windows.get(key);if(win&&!win.isDestroyed())return win;
  win=new this.BrowserWindow({show:false,width:1440,height:960,skipTaskbar:true,paintWhenInitiallyHidden:true,title:'即梦官方补帧 · '+profile,webPreferences:{partition:'persist:official-interpolation-'+key,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,focusOnNavigation:false}});
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,reply)=>reply(false));
  win.setMenu(null);win.on('page-title-updated',event=>event.preventDefault());win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const navigation=(event,url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||!/(^|\.)(jianying|douyin|bytedance)\.com$/.test(u.hostname))event.preventDefault();}catch{event.preventDefault();}};win.webContents.on('will-navigate',navigation);win.webContents.on('will-redirect',navigation);
  win.on('close',event=>{if(!this.disposing){event.preventDefault();win.hide();win.setSkipTaskbar(true);}});win.on('closed',()=>this.windows.delete(key));
  // Normal session rotation is not an account change. Store only hashes of stable user identity cookies.
  win.webContents.session.cookies.on('changed',(_event,cookie,cause,removed)=>{if(!/(^|\.)jianying\.com$/.test(String(cookie.domain||'').replace(/^\./,'')))return;if(removed&&['overwrite','expired-overwrite'].includes(cause))return;const identityChanged=/^uid_tt(?:_ss)?$/.test(cookie.name)&&(removed||win.interpolationIdentity?.[cookie.name]!==identityHash(cookie.value));const loggedOut=/^(sessionid|sessionid_ss|sid_tt)$/.test(cookie.name)&&removed;if(identityChanged||loggedOut){this.revoked.add(key);void this.save(key,{account,enabled:false}).catch(()=>{});}});
  this.windows.set(key,win);return win;
 }
 async open({profile,account,task}){const win=this.window(profile,account);if(this.pending.size)throw Error('正在后台补帧，请等待当前操作结束再打开登录窗口');win.interpolationIdentity=(await this.read(this.key(profile,account)))?.identity;await win.loadURL(canvasUrl(task));win.setSkipTaskbar(false);win.show();win.focus();return this.status(profile,account);}
 async inspect(win,input){if(win.isDestroyed())throw Error('官方补帧网页已关闭');return win.webContents.executeJavaScript('('+inspectInterpolationPage.toString()+')('+JSON.stringify(input)+')');}
 async confirm({profile,account,sameAccountConfirmed}){if(sameAccountConfirmed!==true)throw Error('请明确确认网页登录与当前 CLI 是同一账号');const key=this.key(profile,account),win=this.windows.get(key);if(!win||win.isDestroyed())throw Error('请先打开官方补帧网页登录窗口');const observed=await this.inspect(win,{step:'ready'});if(observed.kind!=='ready')throw Error(observed.message);const identities=(await win.webContents.session.cookies.get({url:'https://jimeng.jianying.com'})).filter(c=>/^uid_tt(?:_ss)?$/.test(c.name)&&c.value);if(!identities.length)throw Error('官网账号身份尚未就绪，请等待登录完成后重试');win.interpolationIdentity=Object.fromEntries(identities.map(c=>[c.name,identityHash(c.value)]));this.revoked.delete(key);await this.save(key,{account,enabled:true,identity:win.interpolationIdentity});win.hide();win.setSkipTaskbar(true);return this.status(profile,account);}
 ensure(service,task,source){const key=this.key(service.profile||'default',task.account)+':'+task.id;if(this.pending.has(key))return this.pending.get(key);const work=this.queue.catch(()=>{}).then(()=>this.once(service,task,source)).catch(error=>this.update(service,task,task.interpolation?.state==='click_attempted'?'uncertain':'action_required',String(error.message||error))).finally(()=>this.pending.delete(key));this.queue=work;this.pending.set(key,work);return work;}
 async update(service,task,state,message){task.interpolation={...task.interpolation,state,message};await service.save(service.taskDir(task.id),task);return task.interpolation;}
 async once(service,task,source){const profile=service.profile||'default',account=await service.account();if(account!==task.account)throw Error('补帧任务属于另一即梦账号');
  if(['click_attempted','submitted','uncertain'].includes(task.interpolation?.state))return this.update(service,task,task.interpolation.state,task.interpolation.state==='uncertain'?'补帧提交待核对，已阻止重复点击；可打开官方补帧窗口检查原节点':'已提交官方补帧，等待成品回传');
  const status=await this.status(profile,account);if(!status.enabled)return this.update(service,task,'needs_login','样片已生成；请在即梦 CLI → 官方补帧设置中登录并启用后台补帧');
  if(status.loginWindowOpen)return this.update(service,task,'needs_confirmation','请完成独立网页登录，并回到官方补帧设置确认同一账号');
  const win=this.window(profile,account),url=canvasUrl(task);win.interpolationIdentity=(await this.read(this.key(profile,account)))?.identity;if(win.webContents.getURL()!==url||win.interpolationTask!==task.id||task.interpolation?.state==='action_required'){await win.loadURL(url);win.interpolationTask=task.id;}
  const fps=task.interpolationFps===60?60:30,input={nodeId:task.nodeId,title:source.title,fps};
  const wait=async step=>{let last;for(let i=0;i<40;i++){if(win.isVisible())throw Error('官方窗口已打开，暂停后台操作以免干扰你');if(canvasUrl({...task,webUrl:win.webContents.getURL()})!==url)throw Error('补帧网页已离开原画布，未继续操作');last=await this.inspect(win,{...input,step});if(last.kind==='needs_login'&&step!=='ready'||last.kind==='approval_required')return last;if(last.kind===step||(step==='ready'&&last.kind==='ready')||(step==='select'&&last.kind==='selected'))return last;await pause(150);}if(step==='ready'&&last?.kind==='needs_login')return last;throw Error(last?.message||'官网补帧控件未就绪');};
  const ready=await wait('ready');if(ready.kind==='needs_login'){await this.save(this.key(profile,account),{account,enabled:false});return this.update(service,task,'needs_login',ready.message);}
  try{
   const debug=win.webContents.debugger;if(!debug.isAttached())debug.attach('1.3');
   const click=async observed=>{const {x,y}=observed.point;if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0)throw Error('补帧控件坐标无效');await debug.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await debug.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});};
   for(const step of ['select','tools','interpolate','fps']){const observed=await wait(step);if(observed.kind!==step)return this.update(service,task,'action_required',observed.message);await click(observed);}
   const observed=await wait('confirm');if(observed.kind!=='confirm')return this.update(service,task,'action_required',observed.message);
   if(await service.account()!==account||(await this.status(profile,account)).enabled!==true)throw Error('补帧账号会话已变化，未提交');
   // Write ahead BEFORE the only submit click. Lost responses and restarts never repeat it.
   task.interpolation={state:'click_attempted',message:'正在提交官方补帧',sourceResourceId:source.resourceId,fps,attemptedAt:Date.now()};await service.save(service.taskDir(task.id),task);
   const fresh=await this.inspect(win,{...input,step:'confirm'});if(fresh.kind!=='confirm'||!(await this.status(profile,account)).enabled)throw Error('提交前官方控件或账号会话已变化，已停止');await click(fresh);return this.update(service,task,'submitted','工作台已提交官方 '+fps+' FPS 补帧，等待成品回传');
  }catch(error){return this.update(service,task,task.interpolation?.state==='click_attempted'?'uncertain':'action_required',String(error.message||error));}
 }
 dispose(){this.disposing=true;for(const win of this.windows.values())if(!win.isDestroyed())win.destroy();this.windows.clear();}
}
module.exports={DreaminaInterpolation,canvasUrl};
