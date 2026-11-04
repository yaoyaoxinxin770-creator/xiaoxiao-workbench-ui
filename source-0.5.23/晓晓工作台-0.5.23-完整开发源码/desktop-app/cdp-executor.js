'use strict';
// Runs in a named isolated world. The website and MV3 extension cannot access
// this state or the host binding. Reload destroys it; the host journal survives.
function installTransport() {
  const state = window.__jimengCDP = {version:1, request:null, result:null, stopped:false, clicked:false, phase:'idle', detail:''};
  const replies = new Map();
  let sequence = 0;
  window.__jimengReply = (id, value) => { const entry = replies.get(id); if(entry){clearTimeout(entry.timer); replies.delete(id); entry.resolve(value);} };
  const sendMessage = message => new Promise((resolve, reject) => {
    if(message.type==='JOB_STATUS'){state.phase=message.state;state.detail=String(message.detail||'');}
    const id = ++sequence;
    const timer = setTimeout(() => {replies.delete(id);reject(new Error('CDP 桥接响应超时；操作不会自动重放'));},15000);
    replies.set(id,{resolve,timer});
    window.__jimengHost(JSON.stringify({id,message}));
  });
  return {runtime:{sendMessage,onMessage:{addListener(){}}}};
}

function installPolicy(chrome) {
  const state = window.__jimengCDP;
  // These functions are assigned inside the shared executor's lexical scope.
  // A pause stops any task that has not been sent. Once Send was clicked, the
  // only remaining operation is read-only balance verification; that must keep
  // running so an already charged group is never left ambiguous or replayed.
  batchPauseRequested = async () => state.stopped && !state.clicked;
  const originalSleep = sleep;
  sleep = async ms => {
    if(state.stopped&&!state.clicked)throw submitError('已停止后续页面操作；尚未点击发送',false);
    await originalSleep(ms);
    if(state.stopped&&!state.clicked)throw submitError('已停止后续页面操作；尚未点击发送',false);
  };
  const originalStopInheritedBusyState = stopInheritedBusyState;
  stopInheritedBusyState = async (editor, jobId) => {
    if(state.stopped)throw new Error('已停止，未写入提示词');
    if (getNearestBusyButton(editor)) {
      if(state.allowStopPreviousReply){
        status(jobId,'stopping_previous_reply','上一组已确认扣费，正在停止其 Agent 文字回复并恢复发送箭头');
        await originalStopInheritedBusyState(editor,jobId);
      }else{
        // A Send click must end in a send. Without authorization to stop a live
        // reply, wait it out rather than refuse: the arrow comes back on its
        // own when 即梦 finishes, and nothing of the previous group is lost.
        let waited=0;
        while(getNearestBusyButton(editor)){
          if(state.stopped)throw new Error('已停止，未写入提示词');
          if(waited%3000===0)status(jobId,'waiting_previous_reply',`即梦还在回复上一组，已等待 ${Math.round(waited/1000)} 秒；没有点停止，发送箭头恢复后会自动发送`);
          await sleep(500);waited+=500;
        }
      }
    }
    // The one refusal that remains: leftover text or attachments in the box.
    // Sending on top of them would mix the user's own draft into this group.
    if (editorUserText(editor) || attachmentCount(editor)) throw new Error('即梦输入框里还有没清理干净的文字或图片，请先清理一下再发送（本组未发送，没有扣费）');
  };
  // Keep the extension's proven credit workflow in CDP mode: establish an
  // exact balance before Send, then release the next group only after that
  // balance decreases. Earlier CDP builds replaced both functions and thereby
  // discarded the user's primary acceptance signal.
  const originalWaitForReadableBackendCreditBalance = waitForReadableBackendCreditBalance;
  waitForReadableBackendCreditBalance = async jobId => {
    const balance = await originalWaitForReadableBackendCreditBalance(jobId);
    state.creditBaseline = balance;
    await chrome.runtime.sendMessage({type:'CREDIT_BASELINE',balance});
    return balance;
  };
  creditObservationReporter = async observation => {
    await chrome.runtime.sendMessage({type:'CREDIT_CHECK',...observation});
  };
  waitForFinalSendButton = async (editor,_fullText,jobId) => {
    let stable = 0;
    let lastNotice=0,checks=0;
    while(true){
      if(state.stopped) throw new Error('已停止，未点击发送');
      const button = !getNearestBusyButton(editor) && getNearestSendButton(editor);
      if(button){if(!stable)stable=Date.now(); if(Date.now()-stable>=1500)return button;}else stable=0;
      if(Date.now()-lastNotice>=3000){
        lastNotice=Date.now();checks++;
        status(jobId,'waiting_send_arrow',`发送按钮暂不可用，第 ${checks} 次检查；3 秒后继续，未点击停止或发送`);
      }
      await sleep(200);
    }
  };
  submitUntilAccepted = async (editor, fullText, jobId) => {
    const button = await waitForFinalSendButton(editor,fullText,jobId);
    if(state.stopped || !promptMatches(editor,fullText)) throw new Error('发送前正文校验失败或操作已停止');
    state.fullText = fullText;
    state.baseline = videoQueueSnapshot().cardIds;
    const list = getConversationRoot()?.querySelector('[id^="scroll-list-"]');
    state.turnBaseline = list ? {listId:list.id, ids:[...list.querySelectorAll('[id^="item_"][data-id]')].map(n=>n.id),headId:list.querySelector('[id^="item_"][data-index="0"]')?.id||null} : null;
    const rect = button.getBoundingClientRect();
    const result = await chrome.runtime.sendMessage({type:'TRUSTED_CLICK',intent:'cdp_submit_once',point:{x:rect.left+rect.width/2,y:rect.top+rect.height/2}});
    if(!result?.ok) throw submitError(result?.error || '发送点击未完成',Boolean(result?.clicked));
    state.clicked = true;
    state.phase = 'awaiting_confirmation';
    status(jobId,'awaiting_confirmation','已发送一次，正在核对本次提示词对应的新增任务；不会再次点击发送');
  };
  const evidence = () => {
    const added = newVideoQueueCardIds(state.baseline || [], videoQueueSnapshot());
    const wanted = normalize(state.fullText);
    // A queue increase or balance change alone cannot attribute a task. Require
    // the final prompt in the new card's own public DOM (never a page ancestor).
    const matched = added.filter(id => {
      const card = document.getElementById(id);
      if(!card || wanted.length<8)return false;
      const clone = card.cloneNode(true);
      clone.querySelectorAll('.node-subject-mention-tag,.node-reference-mention-tag').forEach(n=>n.remove());
      const texts = [clone.innerText,clone.textContent,...[...clone.querySelectorAll('textarea,input')].map(n=>n.value)];
      return texts.some(text => normalize(text).includes(wanted));
    });
    const turnProof=[];
    const baseline=state.turnBaseline;
    const list=baseline?.listId && document.getElementById(baseline.listId);
    if(list){
      const turn=list.querySelector('[id^="item_"][data-id][data-index="0"]');
      const oldHead=baseline.headId && document.getElementById(baseline.headId);
      // Same conversation, new newest turn, and the old newest turn moved down:
      // scrolling old history into the DOM cannot masquerade as a new request.
      const advanced=baseline.headId ? Boolean(oldHead && list.contains(oldHead) && Number(oldHead.dataset.index)>0) : baseline.ids.length===0;
      if(turn && advanced && !baseline.ids.includes(turn.id)){
        const bubble=turn.querySelector('[class*="user-message-"] [class*="bubble-"]');
        const fragments=[...(bubble?.querySelectorAll('[class*="prompt-value-container-"]')||[])];
        const sentText=fragments.map(n=>n.textContent).join('');
        if(fragments.length && promptValidationText(sentText)===promptValidationText(state.fullText)){
          const cards=[...turn.querySelectorAll('[class*="video-nodes-container-"] [class*="nodes-container-"] [class*="card-wrapper-"]')];
          const tasks=cards.filter(card=>/排队|生成中|生成失败|任务失败|失败重试/.test(card.textContent)||Boolean(card.querySelector('video[src]')));
          if(tasks.length)turnProof.push({turnId:turn.dataset.id,elementId:turn.id,taskCount:tasks.length,statuses:tasks.map(n=>n.textContent.trim().slice(0,80))});
        }
      }
    }
    const confirmedCount=Math.max(matched.length,...turnProof.map(p=>p.taskCount),0);
    return {addedCardIds:added,matchedCardIds:matched,turnProof,confirmedCount};
  };
  const originalWaitForCreditDeduction = waitForCreditDeduction;
  waitForCreditDeduction = async (...args) => {
    const credit = await originalWaitForCreditDeduction(...args);
    const taskEvidence = evidence();
    return {...credit,...taskEvidence,source:'exact-credit-deduction'};
  };
  // Recovery is explicit and never sends: it only opens the exact-balance
  // drawer, compares against the durable pre-send baseline, and closes it.
  window.__jimengRecoverCredit = async baseline => {
    const baselineBalance=Number(baseline);
    if(!Number.isFinite(baselineBalance))return {ok:false,error:'没有发送前积分基线'};
    try{
      const currentBalance=await readBackendCreditBalance('credit-recovery');
      const consumed=baselineBalance-currentBalance;
      return {ok:true,confirmed:consumed>0,baselineBalance,currentBalance,consumed:Math.max(0,consumed)};
    }catch(error){return {ok:false,error:String(error?.message||error)};}
  };
  window.__jimengInspect = () => {
    const editor=getComposer('conversation');
    // A visible central canvas composer proves that the canvas itself is ready.
    // executeJob will open the right Agent panel through the trusted CDP path
    // after the durable pending record exists. Reporting the page offline here
    // creates a deadlock after every reload: the workbench refuses to dispatch,
    // so executeJob never gets the chance to open that panel.
    const canvasEditor=getComposer('canvas');
    // `ready` is kept as the backward-compatible transport flag for a running
    // desktop host that predates `conversationReady`; this executor can open
    // the panel itself when a job starts.
    return {version:EXECUTOR_VERSION,ready:true,conversationReady:Boolean(editor),centralCanvasReady:Boolean(canvasEditor),request:state.request,result:state.result,phase:state.phase,detail:state.detail,clicked:state.clicked};
  };
  window.__jimengVerifyClick = message => {
    const {x,y}=message.point||{};
    if(!Number.isFinite(x)||!Number.isFinite(y))return false;
    const top=document.elementFromPoint(x,y);
    if(!top)return false;
    if(message.intent==='cdp_submit_once'){
      const editor=getComposer('conversation'),button=editor&&getNearestSendButton(editor);
      return !state.stopped && !state.clicked && Boolean(button && (button===top || button.contains(top)) &&
        !getNearestBusyButton(editor) && promptMatches(editor,state.fullText));
    }
    if(message.intent==='open_credit_balance'){
      const trigger=creditBalanceTrigger();
      return Boolean(trigger && (trigger===top || trigger.contains(top)));
    }
    if(message.intent==='close_credit_balance'){
      const close=creditDrawerCloseButton();
      return Boolean(close && (close===top || close.contains(top)));
    }
    if(message.intent==='stop_inherited'){
      const editor=getComposer('conversation'),stop=editor&&getNearestBusyButton(editor);
      return Boolean(state.allowStopPreviousReply && !state.clicked && stop && (stop===top || stop.contains(top)));
    }
    if(message.expect?.text){
      const wanted=normalize(message.expect.text);
      for(let node=top,depth=0;node&&depth<4;node=node.parentElement,depth++) if(normalize(node.textContent)===wanted)return true;
      return false;
    }
    return !state.stopped;
  };
  window.__jimengStart = (id,job) => {
    if(state.request)throw new Error('此页面已有执行记录，必须先核对结束');
    state.request=id;state.expectedVideoCount=Math.max(1,Number(job.expectedVideoCount)||1);state.phase='preparing';state.result=null;state.stopped=false;state.clicked=false;state.creditBaseline=null;state.allowStopPreviousReply=Boolean(job.allowStopPreviousReply);
    executeJob(job).then(result=>{state.result={ok:true,...result,accepted:1};state.phase='confirmed';},
      error=>{state.result={ok:false,clicked:state.clicked||Boolean(error.formalClickAttempted),error:String(error.message||error)};state.phase=state.result.clicked?'unknown':'failed_before_send';});
    return {started:true};
  };
  window.__jimengReset = id => {
    if(state.request!==id || !state.result)throw new Error('页面任务仍在运行，不能释放');
    state.request=null;state.result=null;state.phase='idle';state.clicked=false;state.stopped=false;
  };
  // A new Send supersedes a record this page still holds. Ask the old job to
  // stop first and report back until it has really settled; the host keeps
  // calling, so the slot is only ever cleared once nothing is still running.
  window.__jimengRelease = () => {
    if(!state.request)return {released:true,idle:true};
    if(!state.result){state.stopped=true;return {released:false,phase:state.phase};}
    const superseded={request:state.request,phase:state.phase,result:state.result};
    state.request=null;state.result=null;state.phase='idle';state.clicked=false;state.stopped=false;
    return {released:true,superseded};
  };
}
function buildExecutorSource(content) {
  // Function declarations from content are enclosed, not installed on the
  // website's main world; the chrome shim only implements executor messages.
  const policy = installPolicy.toString();
  const body = policy.slice(policy.indexOf('{')+1, policy.lastIndexOf('}'));
  return '(function(){if(window.__jimengCDP)return;const chrome=('+installTransport.toString()+')();\n'+content+'\n'+body+'\n})();';
}
module.exports={buildExecutorSource};
