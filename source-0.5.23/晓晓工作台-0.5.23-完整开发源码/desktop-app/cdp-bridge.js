'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const {chromium}=require('playwright-core');
const {buildExecutorSource}=require('./cdp-executor');
const WORLD='jimeng-workbench-cdp-v2';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isCanvas=url=>{try{const u=new URL(url);return u.origin==='https://jimeng.jianying.com'&&u.pathname.startsWith('/ai-tool/canvas/');}catch{return false;}};
const sameCanvasPath=(left,right)=>isCanvas(left)&&isCanvas(right)&&new URL(left).pathname===new URL(right).pathname;
function selectTarget(targets, pinned) {
  const candidates=targets.filter(t=>isCanvas(t.url));
  if(pinned){const found=candidates.find(t=>t.id===pinned);if(!found)throw new Error('原即梦标签已关闭或离开画布；不会切换到其他标签执行');return found;}
  if(candidates.length!==1)throw new Error(candidates.length?'检测到多个即梦画布，请在直连设置中选择目标':'请在专用浏览器中登录即梦并打开一个画布项目');
  return candidates[0];
}
function buildJob(payload,id,files=[]) {
  const segment=payload.segment||{};
  const source=String(payload.source||segment.source||'');
  const bridgeProtocolVersion=Number(payload.bridgeProtocolVersion??segment.bridgeProtocolVersion??0);
  return {...segment,id,mode:'conversation',prompt:segment.prompt||'',
    prefix:segment.prefix||(payload.mode==='queue'?payload.prefix:payload.draftPrefix)||'',
    files:[...(segment.files||[]),...files],source,bridgeProtocolVersion,
    promptIsFinal:(payload.promptIsFinal===true||segment.promptIsFinal===true)&&source==='desktop-workbench'&&bridgeProtocolVersion===1,
    allowStopPreviousReply:Boolean(payload.allowStopPreviousReply||segment.allowStopPreviousReply)};
}
function jobRecord(job){
  const name=item=>String(item?.displayName||item?.name||item?.title||item?.relativePath||'').trim();
  return {
    videoNumbers:[...(job.videoNumbers||[])],
    selectedCharacters:(job.selectedCharacterAssets||[]).map(name).filter(Boolean),
    selectedSubjects:(job.lockedSubjects||[]).map(item=>name(item)||String(item?.sourceSubjectName||'')).filter(Boolean),
    selectedScenes:(job.lockedImages||[]).map(name).filter(Boolean),
    uploadedFiles:(job.files||[]).map(item=>({name:name(item),type:String(item?.type||''),roleBindings:[...(item?.roleBindings||[])]})),
  };
}
class CdpBridge {
  constructor({stateDir,connect=endpoint=>chromium.connectOverCDP(endpoint,{timeout:4000}),contentPath=path.join(__dirname,'../jimeng-canvas-extension/content.js')}){
    this.stateDir=stateDir;this.connect=connect;this.contentPath=contentPath;
    this.config=this.read('cdp-config.json',{mode:'cdp',port:9333,targetId:null});
    this.pending=this.read('cdp-pending.json',null);
    this.browser=null;this.session=null;this.binding=null;this.connecting=null;this.running=false;
    this.sources=new Map();this.lastError='';
  }
  read(name,fallback){try{return JSON.parse(fs.readFileSync(path.join(this.stateDir,name),'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw new Error('桥接记录损坏，须先检查 '+name);}}
  save(name,value){fs.mkdirSync(this.stateDir,{recursive:true});const file=path.join(this.stateDir,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);}
  record(patch){this.pending={...this.pending,...patch,updatedAt:new Date().toISOString()};this.save('cdp-pending.json',this.pending);}
  recordCreditResult(credit){
    if(!this.pending||!credit)return;
    const baseline=Number(credit.baselineBalance),current=Number(credit.currentBalance);
    if(![baseline,current].every(Number.isFinite))return;
    this.record({creditBaseline:baseline,creditAfter:current,creditConsumed:Math.max(0,baseline-current),
      ...(current<baseline?{creditConfirmedAt:this.pending.creditConfirmedAt||new Date().toISOString()}: {})});
  }
  saveResult(result){
    const entry={...this.pending,result,finishedAt:new Date().toISOString()};
    this.save('cdp-last-result.json',entry);
    const history=this.read('cdp-execution-log.json',[]);
    history.push(entry);
    this.save('cdp-execution-log.json',history.slice(-5000));
  }
  markPreviousNextStart(startedAt){
    const history=this.read('cdp-execution-log.json',[]);
    if(!history.length||history.at(-1).nextGroupStartedAt)return;
    history[history.length-1]={...history.at(-1),nextGroupStartedAt:startedAt};
    this.save('cdp-execution-log.json',history);
  }
  promptHashOf(payload={}){return crypto.createHash('sha256').update(String(payload.segment?.prompt||payload.prompt||'')).digest('hex');}
  // 分镜23 was charged while its queue status still said "failed": the user had
  // stopped it after the click. The durable log is the only thing that knows a
  // prompt was actually paid for, so consult it before sending the same text
  // again. One confirmation from the user overrides this — it never refuses twice.
  confirmedHistoryEntry(hash){
    if(!hash)return null;
    const history=this.read('cdp-execution-log.json',[]);
    for(let index=history.length-1;index>=0;index--){
      const entry=history[index];
      if(entry?.promptHash===hash&&entry?.result?.confirmed)return entry;
    }
    return null;
  }
  // Pressing Send in the workbench is the authority on what gets sent. A record
  // left behind by an earlier group is retired into the durable log instead of
  // refusing the new group; the log still shows it was never confirmed.
  retirePending(reason){
    if(!this.pending)return null;
    const retired=this.pending;
    this.saveResult({ok:false,retired:true,reason,finished:true});
    this.save('cdp-pending.json',null);this.pending=null;
    return retired;
  }
  // Chrome gives a reloaded, restored or duplicated tab a brand new target ID.
  // Re-pin to the very same canvas path so one reload cannot strand the bridge,
  // while a different project can still never inherit the pin.
  resolveTarget(items){
    const pinned=this.pending?.targetId||this.config.targetId;
    if(pinned&&!items.some(item=>item.id===pinned)){
      const savedUrl=this.savedCanvasUrl();
      const same=savedUrl?items.filter(item=>sameCanvasPath(item.url,savedUrl)):[];
      if(same.length===1)return {...same[0],reacquired:true};
    }
    return selectTarget(items,pinned);
  }
  repin(target){
    if(!target?.reacquired)return;
    this.config={...this.config,targetId:target.id,lastCanvasUrl:target.url};
    this.save('cdp-config.json',this.config);
    if(this.pending)this.record({targetId:target.id,url:target.url,reacquiredAt:new Date().toISOString()});
  }
  async configure(value={}){
    // A leftover record no longer freezes the settings: it is kept on disk and
    // still guards a repeat send of the very same prompt. Only a live execution
    // may not have the transport pulled out from under it.
    if(this.running||this.legacyReadBusy)throw new Error('本机正在执行一组或读取成片，请等它返回后再切换连接方式或画布');
    const port=Number(value.port??this.config.port);
    if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('调试端口须为 1024–65535 的整数');
    const mode=value.mode??this.config.mode;
    if(!['cdp','extension'].includes(mode))throw new Error('不支持的连接方式');
    await this.detach();
    this.config={mode,port,targetId:value.targetId||null,lastCanvasUrl:this.savedCanvasUrl()};this.save('cdp-config.json',this.config);
    return {ok:true,...this.config};
  }
  async detach(){
    if(this.session)await this.session.detach().catch(()=>{});
    // connectOverCDP Browser.close detaches this client; the existing Chrome
    // process is owned by the user and must remain open.
    if(this.browser)await this.browser.close().catch(()=>{});
    this.session=null;this.browser=null;
  }
  async browserConnection(){
    if(this.browser?.isConnected())return this.browser;
    if(!this.connecting)this.connecting=(async()=>{
      const browser=await this.connect('http://127.0.0.1:'+this.config.port);
      this.browser=browser;
      browser.on('disconnected',()=>{if(this.browser===browser){this.browser=null;this.session=null;}});
      return browser;
    })().finally(()=>{this.connecting=null;});
    return this.connecting;
  }
  async targets(){
    const browser=await this.browserConnection();
    const session=await browser.newBrowserCDPSession();
    try{return (await session.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page'&&isCanvas(t.url)).map(t=>({id:t.targetId,url:t.url,title:t.title}));}
    finally{await session.detach().catch(()=>{});}
  }
  async ensure(){
    if(this.ensuring)return this.ensuring;
    this.ensuring=this.ensureOnce().finally(()=>{this.ensuring=null;});
    return this.ensuring;
  }
  async ensureOnce(){
    const browser=await this.browserConnection();
    const selected=this.resolveTarget(await this.targets());
    this.repin(selected);
    if(this.config.lastCanvasUrl!==selected.url){this.config.lastCanvasUrl=selected.url;this.save('cdp-config.json',this.config);}
    if(this.session && this.target?.id===selected.id){
      try{await this.evaluate('1');return;}catch{await this.session.detach().catch(()=>{});this.session=null;}
    }
    let session;
    for(const context of browser.contexts())for(const page of context.pages()){
      const probe=await context.newCDPSession(page);
      const info=await probe.send('Target.getTargetInfo');
      if(info.targetInfo.targetId===selected.id){session=probe;break;}
      await probe.detach();
    }
    if(!session)throw new Error('目标标签无法建立 CDP 会话');
    this.session=session;this.target=selected;
    await session.send('Page.enable');
    const tree=await session.send('Page.getFrameTree');
    const world=await session.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:WORLD});
    this.contextId=world.executionContextId;
    await session.send('Runtime.enable');
    session.on('Runtime.bindingCalled',event=>{
      if(event.name!=='__jimengHost'||event.executionContextId!==this.contextId||this.session!==session)return;
      this.handleBinding(event,session).catch(()=>{});
    });
    await session.send('Runtime.addBinding',{name:'__jimengHost',executionContextId:this.contextId});
    await this.evaluate(buildExecutorSource(fs.readFileSync(this.contentPath,'utf8')));
  }
  async evaluate(expression){
    const result=await this.session.send('Runtime.evaluate',{expression,contextId:this.contextId,returnByValue:true,awaitPromise:true,timeout:5000});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result?.value;
  }
  async status(){
    try{
      await this.ensure();
      const info=await this.evaluate('window.__jimengInspect()');
      // The isolated executor is the CDP readiness boundary. The Agent panel
      // may be collapsed after a normal page reload; executeJob opens it only
      // after the durable task record is written. Requiring an already-visible
      // conversation composer here deadlocks dispatch before that can happen.
      const online=Boolean(info?.version);
      const conversationReady=Boolean(info?.conversationReady??info?.ready);
      return {ok:true,online,verified:online,runtimeReady:true,executorReady:true,canvasReady:online,transport:'cdp',
        connector:{...this.target,executorVersion:info.version,executorReady:true,runtimeReady:true,canvasReady:online,conversationReady,verified:online},
        pending:this.pending,phase:info.phase,detail:info.detail,config:this.config,
        error:online?null:'CDP 执行器尚未注入画布'};
    }catch(error){this.lastError=String(error.message||error);return {ok:true,online:false,verified:false,runtimeReady:false,executorReady:false,canvasReady:false,transport:'cdp',config:this.config,pending:this.pending,error:'CDP 直连未就绪：'+this.lastError};}
  }
  async handleBinding(event,session){
    let envelope;
    try{envelope=JSON.parse(event.payload);}catch{return;}
    let value;
    try{value=await this.message(envelope.message);}catch(error){value={ok:false,clicked:Boolean(this.pending?.clickAttempted),error:String(error.message||error)};}
    if(this.session===session)await this.evaluate('window.__jimengReply('+JSON.stringify(envelope.id)+','+JSON.stringify(value)+')');
  }
  async ensureAgentMode(){
    if(!this.pending||this.pending.cancelled||this.pending.clickAttempted)throw new Error('任务已停止或已经发送，不能切换创作类型');
    const page=await this.pageForTarget(this.pending.targetId);
    if(!page||!sameCanvasPath(page.url(),this.pending.url))throw new Error('原画布已变化，未切换模式或发送');
    const selector=page.locator('[class*="chat-container-"] [role="combobox"][aria-label="创作类型"]:visible');
    if(await selector.count()!==1)throw new Error('找不到唯一的右侧创作类型控件；本条未发送');
    const menu=async()=>{
      if(await selector.getAttribute('aria-expanded')!=='true')await selector.press('Space',{timeout:3000});
      const id=await selector.getAttribute('aria-controls');
      if(!id)throw new Error('创作类型菜单缺少公开编号；本条未发送');
      const list=page.locator('[id='+JSON.stringify(id)+']');
      await list.waitFor({state:'visible',timeout:5000});
      return list;
    };
    try{
      let list=await menu(),option=list.getByRole('option',{name:/^Agent\s*模式$/,exact:true});
      if(await option.count()!==1)throw new Error('官网没有提供唯一的 Agent 模式选项；本条未发送');
      if(await option.getAttribute('aria-selected')!=='true'){
        this.record({phase:'preparing',detail:'正在把原画布右侧输入区切换到 Agent 模式；尚未发送'});
        await option.click({timeout:3000});
        list=await menu();option=list.getByRole('option',{name:/^Agent\s*模式$/,exact:true});
      }
      if(await option.getAttribute('aria-selected')!=='true')throw new Error('官网未确认切换到 Agent 模式；本条未发送');
      return {ok:true,mode:'agent'};
    }finally{
      if(await selector.getAttribute('aria-expanded').catch(()=>null)==='true')await selector.press('Escape',{timeout:2000}).catch(()=>{});
    }
  }
  async message(message){
    if(!this.pending)throw new Error('没有活动任务');
    if(message.type==='JOB_STATUS'){
      this.record({phase:message.state,detail:String(message.detail||'').slice(0,1500)});
      return {ok:true};
    }
    if(message.type==='GET_BATCH_STATE')return {active:true,paused:Boolean(this.pending.cancelled)};
    if(message.type==='CREDIT_BASELINE'){
      const creditBaseline=Number(message.balance);
      if(!Number.isFinite(creditBaseline)||creditBaseline<0)throw new Error('积分基线无效');
      this.record({creditBaseline,creditBaselineCapturedAt:new Date().toISOString()});
      return {ok:true};
    }
    if(message.type==='CREDIT_CHECK'){
      const poll=Number(message.poll),baselineBalance=Number(message.baselineBalance),currentBalance=Number(message.currentBalance);
      if(!Number.isInteger(poll)||poll<1||![baselineBalance,currentBalance].every(Number.isFinite))throw new Error('积分检查记录无效');
      const checkedAt=new Date().toISOString(),confirmed=currentBalance<baselineBalance;
      this.record({creditPollCount:poll,firstCreditCheckAt:this.pending.firstCreditCheckAt||checkedAt,lastCreditCheckAt:checkedAt,
        creditBaseline:baselineBalance,creditAfter:currentBalance,creditConsumed:Math.max(0,baselineBalance-currentBalance),
        ...(confirmed?{creditConfirmedAt:checkedAt}: {})});
      return {ok:true};
    }
    const creditRecoveryClick=message.type==='TRUSTED_CLICK' &&
      ['open_credit_balance','close_credit_balance'].includes(message.intent);
    if(this.pending.cancelled&&!creditRecoveryClick)throw new Error('任务已停止，拒绝继续页面操作');
    if(message.type==='ENSURE_AGENT_MODE')return this.ensureAgentMode();
    if(message.type==='GET_STAGED_FILE_CHUNK'){
      const item=this.sources.get(message.transferId),index=Number(message.chunkIndex);
      if(!item||!Number.isInteger(index)||index<0||index>=item.totalChunks)throw new Error('素材分块凭据无效');
      const buffer=Buffer.alloc(Math.min(2*1024*1024,item.size-index*2*1024*1024));
      const file=fs.openSync(item.file,'r');
      try{const size=fs.readSync(file,buffer,0,buffer.length,index*2*1024*1024);if(size!==buffer.length)throw new Error('素材在上传期间发生变化');return {ok:true,base64:buffer.toString('base64')};}
      finally{fs.closeSync(file);}
    }
    if(message.type==='TRUSTED_CLICK'){
      if(!await this.evaluate('window.__jimengVerifyClick('+JSON.stringify(message)+')'))throw new Error('点击目标已变化，未执行点击');
      if(message.intent==='cdp_submit_once'){
        if(!this.pending || this.pending.cancelled)throw new Error('任务已停止');
        if(this.pending.clickAttempted)throw new Error('本条已经尝试发送，禁止重复点击');
        // Write-ahead: persist BEFORE either mouse event. A lost response can
        // never make this command eligible for another formal Send.
        this.record({clickAttempted:true,clickAttemptedAt:new Date().toISOString(),phase:'sending'});
        await this.evaluate('window.__jimengCDP.clicked=true');
      }else if(/stop/.test(message.intent||'')){
        const allowed=message.intent==='stop_inherited' && this.pending.allowStopPreviousReply && !this.pending.clickAttempted;
        if(!allowed)throw new Error('只有上一组已确认扣费后，直连模式才允许停止其 Agent 回复');
      }
      const {x,y}=message.point;
      await this.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await this.session.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
      await this.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
      return {ok:true,clicked:true};
    }
    if(message.type==='TRUSTED_INSERT_TEXT'){
      const text=String(message.text||'');if(!text||text.length>200)throw new Error('文字输入长度无效');
      await this.session.send('Input.insertText',{text});return {ok:true,inserted:true};
    }
    if(message.type==='TRUSTED_SHIFT_AT'){
      try{
        await this.session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Shift',code:'ShiftLeft',modifiers:8,windowsVirtualKeyCode:16});
        await this.session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'@',code:'Digit2',modifiers:8,windowsVirtualKeyCode:50});
        await this.session.send('Input.dispatchKeyEvent',{type:'char',key:'@',code:'Digit2',text:'@',modifiers:8,windowsVirtualKeyCode:50});
      }finally{
        await this.session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'@',code:'Digit2',modifiers:8,windowsVirtualKeyCode:50}).catch(()=>{});
        await this.session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',modifiers:0,windowsVirtualKeyCode:16}).catch(()=>{});
      }
      return {ok:true,dispatched:true};
    }
    if(message.type==='TRUSTED_DRAG'){
      const {from,to}=message;
      if(![from?.x,from?.y,to?.x,to?.y].every(Number.isFinite))throw new Error('拖拽坐标无效');
      try{
        await this.session.send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
        for(let i=1;i<=5;i++)await this.session.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(to.x-from.x)*i/5,y:from.y+(to.y-from.y)*i/5,button:'left',buttons:1});
      }finally{await this.session.send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1}).catch(()=>{});}
      return {ok:true,dragged:true};
    }
    throw new Error('不支持的页面执行请求：'+message.type);
  }
  stage(files=[]){
    return files.map(item=>{
      // inside validates ordinary project files and explicitly bound source folders,
      // including realpath/symlink boundaries within each chosen folder.
      const file=fs.realpathSync(require('./asset-store').inside(item.root,item.relativePath));
      const stat=fs.statSync(file);if(!stat.isFile())throw new Error('素材不是文件');
      const transferId=crypto.randomUUID(),totalChunks=Math.ceil(stat.size/(2*1024*1024));
      this.sources.set(transferId,{file,size:stat.size,totalChunks});
      return {...item,name:item.name||path.basename(file),type:item.type||'application/octet-stream',lastModified:stat.mtimeMs,size:stat.size,transferId,totalChunks};
    });
  }
  async execute(payload={}){
    if(payload.action==='pause')return this.cancel();
    if(this.running||this.legacyReadBusy)return {ok:false,code:'CDP_BUSY',error:'本机正在执行上一组或读取成片，请等它返回后再发送'};
    // The Send click decides. Three things may still refuse it, and none of them
    // is a leftover record from another group: an unclean composer (checked on
    // the page), and the two ways the very same prompt would be paid for twice —
    // it already reached the write-ahead click record, or the durable log shows
    // it was charged. The second of those is overridable with one confirmation.
    const promptHash=this.promptHashOf(payload);
    if(this.pending?.clickAttempted&&this.pending.promptHash===promptHash)
      return {ok:false,code:'CDP_DUPLICATE_SEND',pending:this.pending,
        error:'这组提示词上次已经点过发送，可能已经扣过费，未重复发送。确认要再发一次，请先在“即梦直连设置”里点“人工核对后结束本条”。'};
    if(!payload.confirmResend){
      const charged=this.confirmedHistoryEntry(promptHash);
      if(charged)return {ok:false,code:'CDP_ALREADY_CONFIRMED',
        charged:{videoNumbers:charged.videoNumbers||[],consumed:charged.result?.creditConfirmation?.consumed??null,finishedAt:charged.finishedAt},
        error:'这条提示词之前已经确认扣费'+(charged.result?.creditConfirmation?.consumed!=null?('（'+charged.result.creditConfirmation.consumed+' 积分）'):'')+
          '，本次没有重复发送。如果确实要再发一次，请在弹出的确认里选“仍然发送”。'};
    }
    const retired=this.retirePending('superseded-by-user-send');
    this.running=true;
    let handedOff=false;
    try{
      await this.ensure();
      if(payload.expectedCanvasUrl&&!sameCanvasPath(this.target.url,payload.expectedCanvasUrl))throw new Error('当前连接的画布已变化，未发送本条任务');
      this.config.targetId=this.target.id;this.save('cdp-config.json',this.config);
      const files=this.stage(payload.localFiles),id=crypto.randomUUID(),job=buildJob(payload,id,files);
      if(!job.prompt.trim())throw new Error('提示词为空');
      await this.releasePageTask();
      const startedAt=new Date().toISOString();
      this.markPreviousNextStart(startedAt);
      this.record({id,targetId:this.target.id,url:this.target.url,promptHash:crypto.createHash('sha256').update(job.prompt).digest('hex'),
        startedAt,phase:'preparing',clickAttempted:false,clientTaskId:job.clientTaskId,allowStopPreviousReply:job.allowStopPreviousReply,...jobRecord(job)});
      handedOff=true;
      await this.evaluate('window.__jimengStart('+JSON.stringify(id)+','+JSON.stringify(job)+')');
      // Credit deduction is the acceptance boundary. Keep the state machine
      // alive until that evidence appears or the user pauses; a fixed CDP-side
      // timeout used to abandon valid slow Agent requests after a few minutes.
      while(true){
        const result=await this.recover();
        if(result.finished||result.code==='CDP_CONTEXT_LOST'){
          const page=await this.pageForTarget(this.target.id).catch(()=>null);
          return {...result,executionId:id,canvasUrl:page?.url()||this.target.url,...(retired?{retired}:{})};
        }
        await delay(1000);
      }
    }catch(error){
      if(handedOff)this.record({phase:'unknown',error:String(error.message||error)});
      return {ok:false,code:handedOff?'CDP_PENDING_REVIEW':'CDP_NOT_DISPATCHED',error:String(error.message||error),...(retired?{retired}:{})};
    }finally{this.running=false;this.sources.clear();}
  }
  // A new Send supersedes whatever the page still holds. Ask that job to stop
  // and wait for it to actually settle before clearing its slot: a half-stopped
  // loop left running behind a new job could still touch the page.
  async releasePageTask(timeoutMs=30000){
    if(!(await this.evaluate('window.__jimengInspect()'))?.request)return null;
    const deadline=Date.now()+timeoutMs;
    while(true){
      const outcome=await this.evaluate('window.__jimengRelease()');
      if(outcome?.released)return outcome;
      if(Date.now()>=deadline)throw new Error('页面上一组任务仍未停止（'+(outcome?.phase||'未知')+'），未发送本组；请在即梦页面核对后重试');
      await delay(500);
    }
  }
  async recover(){
    if(!this.recovering)this.recovering=this.recoverOnce().finally(()=>{this.recovering=null;});
    return this.recovering;
  }
  async recoverOnce(){
    if(!this.pending){const last=this.read('cdp-last-result.json',null);return last?{...last.result,finished:true}:{ok:true,finished:true,noPending:true};}
    try{
      await this.ensure();
      const info=await this.evaluate('window.__jimengInspect()');
      if(info.request!==this.pending.id){
        // A page refresh cannot turn an operation that never reached the
        // write-ahead click record into a submitted job. Clear that stale lock
        // automatically so one safe pre-send failure cannot block the batch.
        if(!this.pending.clickAttempted){
          const result={ok:false,clicked:false,finished:true,code:'CDP_CONTEXT_LOST_BEFORE_SEND',error:'原页面已刷新，且发送按钮从未点击；已安全释放本组，可重新执行'};
          this.saveResult(result);
          this.save('cdp-pending.json',null);this.pending=null;
          return result;
        }
        const credit=await this.recoverCreditDeduction();
        if(credit?.confirmed){
          this.recordCreditResult(credit);
          const result={ok:true,clicked:true,confirmed:true,finished:true,creditConfirmation:{...credit,source:'recovered-exact-credit-deduction'}};
          this.saveResult(result);
          this.save('cdp-pending.json',null);this.pending=null;
          return result;
        }
        return {ok:false,finished:true,code:'CDP_CONTEXT_LOST',error:'原页面已刷新或执行记录丢失；提交状态未知，只能人工核对，不会重放'};
      }
      if(!info.result)return {ok:false,finished:false,phase:info.phase,detail:info.detail};
      let result={...info.result,finished:true};
      // The single refusal the user asked to keep: nothing was sent, and the
      // only thing to do is clear the composer by hand.
      if(!result.ok&&!result.clicked&&/请先清理/.test(String(result.error||'')))result.code='CDP_COMPOSER_NOT_CLEAN';
      if(!result.ok&&result.clicked&&this.pending.clickAttempted){
        const credit=await this.recoverCreditDeduction();
        if(credit?.confirmed){this.recordCreditResult(credit);result={ok:true,clicked:true,confirmed:true,finished:true,creditConfirmation:{...credit,source:'recovered-exact-credit-deduction'}};}
      }
      if(result.ok||(!result.clicked&&!this.pending.clickAttempted)){
        await this.finish(result);
      }else this.record({phase:'unknown',result});
      return result;
    }catch(error){return {ok:false,finished:false,code:'CDP_RECONNECTING',error:String(error.message||error)};}
  }
  async recoverCreditDeduction(){
    const rawBaseline=this.pending?.creditBaseline;
    if(rawBaseline===null||rawBaseline===undefined||rawBaseline==='')return null;
    const baseline=Number(rawBaseline);
    if(!Number.isFinite(baseline))return null;
    try{return await this.evaluate('window.__jimengRecoverCredit('+JSON.stringify(baseline)+')');}
    catch(error){return {ok:false,confirmed:false,error:String(error.message||error)};}
  }
  async finish(result){
    const id=this.pending.id;
    // Clear in-page lock first. A crash between page reset and disk commit
    // retains the durable lock and requires review rather than allowing replay.
    await this.evaluate('window.__jimengReset('+JSON.stringify(id)+')');
    this.saveResult(result);
    this.save('cdp-pending.json',null);this.pending=null;
  }
  async cancel(){
    if(!this.pending)return {ok:true,cancelled:false};
    this.record({cancelled:true});
    try{await this.ensure();await this.evaluate('window.__jimengCDP.stopped=true');}catch{}
    return {ok:true,cancelled:true,delivered:true,pendingReview:true};
  }
  async acknowledge(){
    if(this.running)throw new Error('执行尚未返回，请先停止并等待');
    if(!this.pending)return {ok:true};
    await this.cancel();
    try{
      await this.ensure();
      const info=await this.evaluate('window.__jimengInspect()');
      if(info.request===this.pending.id){
        if(!info.result)throw new Error('页面执行器仍未停止，请稍后再核对结束');
        await this.evaluate('window.__jimengReset('+JSON.stringify(this.pending.id)+')');
      }
    }catch(error){
      // Only a definitively closed original tab permits offline acknowledgement.
      const targets=await this.targets();
      if(targets.some(t=>t.id===this.pending.targetId))throw error;
    }
    this.saveResult({ok:false,manuallyReviewed:true});
    this.save('cdp-pending.json',null);this.pending=null;return {ok:true};
  }
  savedCanvasUrl(){
    const candidates=[this.pending?.url,this.config.lastCanvasUrl,this.target?.url,this.read('cdp-last-result.json',null)?.url];
    return candidates.find(isCanvas)||null;
  }
  async pageForTarget(id){
    const browser=await this.browserConnection();
    for(const context of browser.contexts())for(const page of context.pages()){
      const probe=await context.newCDPSession(page);
      try{if((await probe.send('Target.getTargetInfo')).targetInfo.targetId===id)return page;}
      finally{await probe.detach().catch(()=>{});}
    }
    return null;
  }
  async openAndConnect(){
    if(!this.opening)this.opening=this.openAndConnectOnce().finally(()=>{this.opening=null;});
    return this.opening;
  }
  async openAndConnectOnce(){
    const launched=await this.launch(),browser=await this.browserConnection();
    const front=async()=>{const page=browser.contexts().flatMap(context=>context.pages())[0];if(page)await page.bringToFront().catch(()=>{});};
    let items=await this.targets();
    const pinned=this.pending?.targetId||this.config.targetId;
    let selected=items.find(item=>item.id===pinned);
    const savedUrl=this.savedCanvasUrl();
    // A closed or reloaded tab must not turn this button into a dead end. Match
    // the remembered canvas by its own path — never another project — and, when
    // a record is still open, move its pin along so 核对 can reach the page.
    if(!selected&&savedUrl){
      const same=items.filter(item=>sameCanvasPath(item.url,savedUrl));
      if(same.length===1)selected={...same[0],reacquired:true};
      else if(same.length>1)return {...await this.status(),browserOpened:true,needsTargetSelection:true,pending:this.pending,
        error:'浏览器已打开，同一个画布开了多个标签，请在下面选择要投放的那一个。'};
    }
    if(!selected&&savedUrl){
      const context=browser.contexts()[0];
      if(!context)throw new Error('浏览器个人资料尚未就绪，请稍后再试');
      const page=launched.alreadyRunning?await context.newPage():(context.pages()[0]||await context.newPage());
      await page.goto(savedUrl,{waitUntil:'domcontentloaded',timeout:60000});
      items=await this.targets();
      const restored=items.find(item=>sameCanvasPath(item.url,savedUrl));
      if(restored)selected={...restored,reacquired:true};
      await page.bringToFront();
    }
    if(!selected&&items.length===1)selected={...items[0],reacquired:Boolean(pinned)};
    if(!selected){
      if(!items.length&&!savedUrl){
        const context=browser.contexts()[0];
        const page=context&&(context.pages()[0]||await context.newPage());
        if(page)await page.goto('https://jimeng.jianying.com/ai-tool/home',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
      }
      await front();
      return {ok:true,online:false,browserOpened:true,needsTargetSelection:items.length>1,needsCanvas:items.length===0,pending:this.pending,
        error:items.length>1?'浏览器已打开，检测到多个画布，请选择目标画布。':'浏览器已用原登录资料打开，请打开一个即梦画布后再点此按钮。'};
    }
    this.config={...this.config,mode:'cdp',targetId:selected.id,lastCanvasUrl:selected.url};
    this.save('cdp-config.json',this.config);
    if(this.pending&&this.pending.targetId!==selected.id)this.record({targetId:selected.id,url:selected.url,reacquiredAt:new Date().toISOString()});
    const page=await this.pageForTarget(selected.id);
    if(page){await page.bringToFront();await page.waitForLoadState?.('domcontentloaded',{timeout:30000}).catch(()=>{});}
    // Chrome's restored/startup tab may momentarily leave the canvas URL while
    // loading. Do not expose that first transient failure as a finished click.
    const deadline=Date.now()+30000;
    let result;
    do{
      result=await this.status();
      if(result.online)break;
      await delay(500);
      const current=(await this.targets()).find(item=>sameCanvasPath(item.url,selected.url));
      if(current&&current.id!==this.config.targetId){
        this.config={...this.config,targetId:current.id,lastCanvasUrl:current.url};
        this.save('cdp-config.json',this.config);
        if(this.pending)this.record({targetId:current.id,url:current.url,reacquiredAt:new Date().toISOString()});
      }
    }while(Date.now()<deadline);
    return {...result,browserOpened:true,alreadyRunning:Boolean(launched.alreadyRunning),
      ...(this.pending?{pending:this.pending,pendingReview:true,
        pendingNotice:'已连接。上一条记录（分镜 '+((this.pending.videoNumbers||[]).join('、')||'未知')+'）还没有扣费确认，已保留；它不会挡住新的发送，只会拦住同一条提示词重复发送。'}:{})};
  }
  async openCanvasHome(){
    if(this.running)throw new Error('当前正在发送，不能打开新建入口');
    await this.launch();
    const browser=await this.browserConnection(),context=browser.contexts()[0];
    if(!context)throw new Error('即梦浏览器尚未就绪');
    const page=await context.newPage();
    await page.goto('https://jimeng.jianying.com/ai-tool/home',{waitUntil:'domcontentloaded',timeout:60000});
    await page.bringToFront();
    return {ok:true,url:page.url(),requiresCanvasCreation:true};
  }
  async launch(){
    try{await this.browserConnection();return {ok:true,alreadyRunning:true,port:this.config.port};}catch{}
    const candidates=[process.env.JIMENG_CHROME_PATH,
      path.join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Google/Chrome/Application/chrome.exe'),
      path.join(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe')].filter(Boolean);
    const executable=candidates.find(file=>fs.existsSync(file));
    if(!executable)throw new Error('找不到 Chrome；可通过 JIMENG_CHROME_PATH 指定 chrome.exe');
    const profile=path.join(this.stateDir,'chrome-profile');
    const child=spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+this.config.port,
      '--user-data-dir='+profile,'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      '--no-first-run',this.savedCanvasUrl()||'https://jimeng.jianying.com/ai-tool/home'],{detached:true,stdio:'ignore',windowsHide:true});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref();
    for(let i=0;i<30;i++){await delay(500);try{await this.browserConnection();return {ok:true,port:this.config.port,profile};}catch{}}
    // Chrome forwards the command line to an already-running process that owns
    // this profile and exits; the debug port then never appears. Say exactly
    // that, because retrying the button can never fix it.
    const running=fs.existsSync(path.join(profile,'lockfile'))||fs.existsSync(path.join(profile,'SingletonLock'));
    throw new Error(running
      ? '这套登录资料的 Chrome 窗口已经开着，但它不是用调试端口启动的，工作台连不上。请把那个即梦浏览器窗口全部关掉，再点一次“打开并连接即梦浏览器”。'
      : '端口 '+this.config.port+' 未就绪；请确认该端口没有被其他程序占用，或在“即梦直连设置”里换一个端口。');
  }
}
module.exports={CdpBridge,selectTarget,buildJob,isCanvas};
