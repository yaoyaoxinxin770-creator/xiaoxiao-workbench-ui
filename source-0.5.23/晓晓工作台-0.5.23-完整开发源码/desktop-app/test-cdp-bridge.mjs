import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {CdpBridge,selectTarget,buildJob,isCanvas}=require('./cdp-bridge');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'jimeng-cdp-unit-'));
try {
  const url='https://jimeng.jianying.com/ai-tool/canvas/test';
  assert.equal(isCanvas(url),true);
  assert.equal(isCanvas('https://jimeng.jianying.com.evil/ai-tool/canvas/test'),false);
  assert.throws(()=>selectTarget([],null),/打开/);
  assert.throws(()=>selectTarget([{id:'a',url},{id:'b',url}],null),/多个/);
  assert.throws(()=>selectTarget([{id:'b',url}],'a'),/原即梦标签/);
  assert.equal(selectTarget([{id:'a',url},{id:'b',url}],'a').id,'a');
  const job=buildJob({promptIsFinal:true,source:'desktop-workbench',bridgeProtocolVersion:1,allowStopPreviousReply:true,segment:{prompt:'精确原文',files:[{name:'inline.png'}]}},'id',[{name:'local.png'}]);
  assert.equal(job.prompt,'精确原文');assert.equal(job.promptIsFinal,true);assert.equal(job.files.length,2);
  assert.equal(job.allowStopPreviousReply,true);
  assert.equal(buildJob({promptIsFinal:true,segment:{}},'x').promptIsFinal,false);
  const bridge=new CdpBridge({stateDir:root});
  bridge.record({id:'first',targetId:'a',clickAttempted:false});
  let inputCalls=0,verifiedCalls=0;
  bridge.evaluate=async expression=>{if(expression.includes('__jimengVerifyClick')){verifiedCalls++;return true;}};
  bridge.session={send:async(method)=>{
    inputCalls++;
    const disk=JSON.parse(fs.readFileSync(path.join(root,'cdp-pending.json')));
    assert.equal(disk.clickAttempted,true,'write-ahead journal precedes all Input events');
    if(method==='Input.dispatchMouseEvent')throw new Error('lost response');
  }};
  await assert.rejects(bridge.message({type:'TRUSTED_CLICK',intent:'cdp_submit_once',point:{x:1,y:2}}),/lost response/);
  assert.equal(inputCalls,1);
  await assert.rejects(bridge.message({type:'TRUSTED_CLICK',intent:'cdp_submit_once',point:{x:1,y:2}}),/禁止重复/);
  assert.equal(inputCalls,1,'no repeated Input events after ambiguous response');
  assert.equal((await bridge.message({type:'CREDIT_BASELINE',balance:13661})).ok,true);
  assert.equal((await bridge.message({type:'CREDIT_CHECK',poll:1,baselineBalance:13661,currentBalance:13625,confirmed:true})).ok,true);
  assert.equal(bridge.pending.creditPollCount,1);
  assert.equal(bridge.pending.creditConsumed,36);
  assert.ok(bridge.pending.firstCreditCheckAt&&bridge.pending.creditConfirmedAt);
  const restarted=new CdpBridge({stateDir:root});
  assert.equal(restarted.pending.clickAttempted,true);
  assert.equal(restarted.pending.creditBaseline,13661,'the exact pre-send balance survives a desktop restart');
  // No unit test may reach a real browser; a refusal must come from policy.
  restarted.ensure=async()=>{throw new Error('单元测试不连接浏览器');};
  restarted.record({promptHash:restarted.promptHashOf({segment:{prompt:'精确原文'}})});
  // The Send click decides. A repeat of the very prompt that already reached the
  // write-ahead click record is the one thing still refused: it would pay twice.
  const repeat=await restarted.execute({segment:{prompt:'精确原文'}});
  assert.equal(repeat.code,'CDP_DUPLICATE_SEND');
  assert.equal(repeat.pending.id,'first','refusing a duplicate keeps the original record for review');
  assert.ok(restarted.pending);
  // Any other group goes through: the leftover record is retired into the log.
  const superseded=await restarted.execute({segment:{prompt:'另一条'}});
  assert.equal(superseded.code,'CDP_NOT_DISPATCHED','a retired record no longer blocks; only the missing browser does');
  assert.equal(superseded.retired.id,'first');
  assert.equal(restarted.pending,null,'the superseded record is retired into the log, not kept as a lock');
  assert.equal(restarted.read('cdp-execution-log.json',[]).at(-1).result.reason,'superseded-by-user-send');
  // 分镜23 was charged while its queue status still read "failed", so the queue
  // alone cannot protect against a repeat. The durable log can, and one explicit
  // confirmation still overrides it.
  restarted.save('cdp-execution-log.json',[...restarted.read('cdp-execution-log.json',[]),
    {promptHash:restarted.promptHashOf({segment:{prompt:'已扣费的原文'}}),videoNumbers:['23'],finishedAt:'2026-09-12T18:00:25.278Z',
      result:{ok:true,confirmed:true,creditConfirmation:{consumed:39}}}]);
  const charged=await restarted.execute({segment:{prompt:'已扣费的原文'}});
  assert.equal(charged.code,'CDP_ALREADY_CONFIRMED');
  assert.equal(charged.charged.consumed,39);
  assert.deepEqual(charged.charged.videoNumbers,['23']);
  assert.equal((await restarted.execute({segment:{prompt:'已扣费的原文'},confirmResend:true})).code,'CDP_NOT_DISPATCHED',
    'one confirmation overrides the charged-prompt guard');
  await restarted.configure({mode:'extension'});
  assert.equal(restarted.config.mode,'extension','settings are not frozen by an unconfirmed record');
  await restarted.configure({mode:'cdp'});
  restarted.record({id:'first',targetId:'a',clickAttempted:true,creditBaseline:13661});
  restarted.ensure=async()=>{};
  restarted.evaluate=async()=>({request:null});
  assert.equal((await restarted.recover()).code,'CDP_CONTEXT_LOST');
  assert.ok(restarted.pending);
  const unsent=new CdpBridge({stateDir:path.join(root,'unsent')});
  unsent.record({id:'unsent-first',targetId:'a',clickAttempted:false});
  unsent.ensure=async()=>{};
  unsent.evaluate=async()=>({request:null});
  const unsentRecovery=await unsent.recover();
  assert.equal(unsentRecovery.code,'CDP_CONTEXT_LOST_BEFORE_SEND');
  assert.equal(unsentRecovery.clicked,false);
  assert.equal(unsent.pending,null,'a lost page before any formal click must not leave a stale batch lock');
  const collapsed=new CdpBridge({stateDir:path.join(root,'collapsed')});
  collapsed.target={id:'a',url};
  collapsed.ensure=async()=>{};
  collapsed.evaluate=async()=>({version:'0.20.1',ready:false,conversationReady:false,phase:'idle',detail:''});
  const collapsedStatus=await collapsed.status();
  assert.equal(collapsedStatus.online,true,'an injected canvas remains dispatchable while its Agent panel is collapsed');
  assert.equal(collapsedStatus.connector.conversationReady,false);
  const credited=new CdpBridge({stateDir:path.join(root,'credited')});
  credited.record({id:'credited-first',targetId:'a',clickAttempted:true,creditBaseline:1000});
  credited.ensure=async()=>{};
  credited.evaluate=async expression=>{
    if(expression.includes('__jimengInspect'))return {request:'credited-first',result:{ok:false,clicked:true,error:'waiting'}};
    if(expression.includes('__jimengRecoverCredit'))return {ok:true,confirmed:true,baselineBalance:1000,currentBalance:964,consumed:36};
    if(expression.includes('__jimengReset'))return true;
  };
  const creditedRecovery=await credited.recover();
  assert.equal(creditedRecovery.ok,true);
  assert.equal(creditedRecovery.creditConfirmation.consumed,36);
  assert.equal(credited.pending,null,'a recovered exact deduction releases the original task without replaying Send');
  const opener=new CdpBridge({stateDir:path.join(root,'opener')});
  opener.config={mode:'cdp',port:9333,targetId:'old-browser-tab',lastCanvasUrl:url};
  let openedUrl='',frontCalls=0;
  const openedPage={goto:async value=>{openedUrl=value;},bringToFront:async()=>{frontCalls++;}};
  const openedContext={pages:()=>[],newPage:async()=>openedPage};
  opener.launch=async()=>({ok:true,alreadyRunning:false});
  opener.browserConnection=async()=>({contexts:()=>[openedContext]});
  opener.targets=async()=>openedUrl?[{id:'new-browser-tab',url}]:[];
  opener.pageForTarget=async()=>openedPage;
  let startupChecks=0;
  opener.status=async()=>({ok:true,online:++startupChecks>1,connector:{id:opener.config.targetId,url}});
  const opened=await opener.openAndConnect();
  assert.equal(opened.online,true);
  assert.equal(openedUrl,url,'one click restores the remembered canvas after Chrome has closed');
  assert.equal(opener.config.targetId,'new-browser-tab','browser restart replaces only the stale idle tab ID');
  assert.ok(frontCalls>0);
  assert.equal(startupChecks,2,'one click retries the transient connection gap while a startup tab is loading');
  const preserved=new CdpBridge({stateDir:path.join(root,'opener-pending')});
  preserved.record({id:'unknown-send',targetId:'closed-original',url,clickAttempted:true,videoNumbers:['23']});
  preserved.launch=opener.launch;preserved.browserConnection=opener.browserConnection;
  preserved.targets=async()=>[{id:'new-tab',url}];
  preserved.pageForTarget=async()=>openedPage;
  preserved.status=async()=>({ok:true,online:true,connector:{id:preserved.config.targetId,url}});
  const review=await preserved.openAndConnect();
  assert.equal(review.online,true,'a closed original tab must not turn this button into a dead end');
  assert.equal(review.pendingReview,true,'the unconfirmed record is reported, not used as a refusal');
  assert.match(review.pendingNotice,/分镜 23/);
  // Re-pinning to the very same canvas path is what lets 核对 reach the page
  // again. It never sends: openAndConnect has no path that clicks anything.
  assert.equal(preserved.pending.targetId,'new-tab');
  assert.equal(preserved.pending.clickAttempted,true,'opening a browser never replays or forgets an unknown paid task');
  assert.equal(preserved.pending.id,'unknown-send');
  const remembered=new CdpBridge({stateDir:path.join(root,'legacy-opener')});
  remembered.save('cdp-last-result.json',{url,result:{ok:true}});
  assert.equal(remembered.savedCanvasUrl(),url,'existing users can restore the last canvas before lastCanvasUrl was introduced');
  const dataRoot=path.join(root,'assets');fs.mkdirSync(dataRoot);
  fs.writeFileSync(path.join(dataRoot,'audio.wav'),Buffer.alloc(2*1024*1024+3,42));
  const staged=bridge.stage([{root:dataRoot,relativePath:'audio.wav',roleBindings:['甲']}])[0];
  assert.equal(staged.totalChunks,2);assert.deepEqual(staged.roleBindings,['甲']);
  const part=await bridge.message({type:'GET_STAGED_FILE_CHUNK',transferId:staged.transferId,chunkIndex:1});
  assert.equal(Buffer.from(part.base64,'base64').length,3);
  await assert.rejects(bridge.message({type:'GET_STAGED_FILE_CHUNK',transferId:staged.transferId,chunkIndex:2}),/凭据/);
  assert.throws(()=>bridge.stage([{root:dataRoot,relativePath:'../cdp-pending.json'}]));
  bridge.record({cancelled:true});
  await assert.rejects(bridge.message({type:'TRUSTED_INSERT_TEXT',text:'@'}),/停止/);
  const concurrent=new CdpBridge({stateDir:path.join(root,'concurrent')});
  let release;concurrent.ensure=()=>new Promise(resolve=>{release=resolve;});
  const first=concurrent.execute({segment:{prompt:'first'}});
  assert.equal((await concurrent.execute({segment:{prompt:'second'}})).code,'CDP_BUSY');
  release();await first;
  const homeBridge=new CdpBridge({stateDir:path.join(root,'new-home')});
  let homeUrl='',fronted=false;
  homeBridge.launch=async()=>({ok:true});
  homeBridge.browserConnection=async()=>({contexts:()=>[{newPage:async()=>({goto:async url=>{homeUrl=url;},bringToFront:async()=>{fronted=true;},url:()=>homeUrl})}]});
  homeBridge.config.targetId='existing-canvas';
  assert.equal((await homeBridge.openCanvasHome()).requiresCanvasCreation,true,'new entry opens home without claiming canvas creation');
  assert.equal(homeUrl,'https://jimeng.jianying.com/ai-tool/home');assert.equal(fronted,true);
  assert.equal(homeBridge.config.targetId,'existing-canvas','new entry must not switch the existing target');
  homeBridge.running=true;await assert.rejects(homeBridge.openCanvasHome(),/正在发送/);

  // Icon-only creation type must be read through the menu's aria-selected state.
  const modeBridge=new CdpBridge({stateDir:path.join(root,'agent-mode')});
  modeBridge.record({id:'mode-test',targetId:'a',url,clickAttempted:false});
  let expanded=false,selected='video',modeClicks=0;
  const selector={count:async()=>1,getAttribute:async n=>n==='aria-expanded'?String(expanded):'creation-menu',press:async key=>{expanded=key==='Space';}};
  const option={count:async()=>1,getAttribute:async()=>String(selected==='agent'),click:async()=>{modeClicks++;selected='agent';expanded=false;}};
  const list={waitFor:async()=>assert.equal(expanded,true),getByRole:()=>option};
  modeBridge.pageForTarget=async()=>({url:()=>url,locator:s=>s.includes('combobox')?selector:list});
  assert.equal((await modeBridge.message({type:'ENSURE_AGENT_MODE'})).mode,'agent');assert.equal(modeClicks,1);assert.equal(expanded,false);
  await modeBridge.message({type:'ENSURE_AGENT_MODE'});assert.equal(modeClicks,1,'already Agent never reselects or sends');
  modeBridge.record({clickAttempted:true});await assert.rejects(()=>modeBridge.message({type:'ENSURE_AGENT_MODE'}),/已经发送/);
  modeBridge.record({clickAttempted:false,cancelled:true});await assert.rejects(()=>modeBridge.message({type:'ENSURE_AGENT_MODE'}),/停止/);
  modeBridge.record({cancelled:false});modeBridge.pageForTarget=async()=>({url:()=>url+'-other'});await assert.rejects(()=>modeBridge.message({type:'ENSURE_AGENT_MODE'}),/画布已变化/);
  console.log('CDP: target isolation, final-prompt protocol, write-ahead single send, safe pre-send unlock, lost-response replay prevention, restart lock, chunk boundaries, cancellation and concurrency: PASS');
} finally {
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('jimeng-cdp-unit-'));
  fs.rmSync(root,{recursive:true,force:true});
}
