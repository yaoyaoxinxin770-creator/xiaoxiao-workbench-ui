import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright-core'),{CdpBridge}=require('./cdp-bridge');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jimeng-cdp-browser-'));
const executablePath=process.env.JIMENG_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert.ok(fs.existsSync(executablePath),'Chrome integration test requires installed Chrome; test may not silently skip');
let context,bridge;
const url='https://jimeng.jianying.com/ai-tool/canvas/cdp-fixture';
const html=`<!doctype html><meta charset="utf-8">
  <style>
    body{margin:0}.central-composer{position:absolute;left:10px;top:400px;width:320px;height:80px}
    .chat-container-test{position:absolute;left:500px;top:10px;width:600px;height:600px}
    .layout-test{width:560px;height:500px}.tiptap{width:500px;height:250px;border:1px solid}
    button{width:80px;height:50px}.credit-drawer-test{position:absolute;inset:0;background:white;z-index:20}
    .credit-drawer-test[hidden]{display:none}
  </style>
  <button id="credit" class="credit-amount-container-test">1.2万</button>
  <div id="creditDrawer" class="credit-drawer-test" hidden>
    <div><span>积分详情</span><span id="exactCredit" class="credits-test">12000</span></div>
    <button class="CommerceDrawer_closeButton-test">关闭</button>
  </div>
  <div class="central-composer tiptap ProseMirror" contenteditable="true"></div>
  <div class="chat-container-test"><div class="layout-test">
    <div class="tiptap ProseMirror" contenteditable="true"></div>
    <button class="submit-button-test"><svg><path d="M12.002 3 V19.5"></path></svg></button>
  </div></div><div id="cards"></div>
  <script>
    window.clicks=0;window.stopClicks=0;window.action='match';window.balance=12000;
    const drawer=document.querySelector('#creditDrawer'),exactCredit=document.querySelector('#exactCredit');
    document.querySelector('#credit').onclick=event=>{if(!event.isTrusted)throw Error('untrusted click');exactCredit.textContent=String(balance);drawer.hidden=false;};
    document.querySelector('.CommerceDrawer_closeButton-test').onclick=event=>{if(!event.isTrusted)throw Error('untrusted click');drawer.hidden=true;};
    window.makeCard=(id,text)=>{const card=document.createElement('div');card.id=id;card.dataset.type='E';const input=document.createElement('input');input.value='视频';card.append(input,document.createTextNode(text));document.querySelector('#cards').append(card)};
    document.querySelector('.submit-button-test').onclick=event=>{if(!event.isTrusted)throw Error('untrusted click');const path=document.querySelector('.submit-button-test svg path');if(String(path.getAttribute('d')).startsWith('M4.5 10.9')){window.stopClicks++;path.setAttribute('d','M12.002 3 V19.5');return;}window.clicks++;const editor=document.querySelector('.chat-container-test .tiptap');window.lastPrompt=editor.textContent;if(window.action==='match')window.makeCard('task-'+clicks,lastPrompt);if(window.action==='unrelated')window.makeCard('task-'+clicks,'别人的无关提示词');if(window.action==='match'||window.action==='turn')window.balance-=36;editor.textContent='';};
  </script>`;
try {
  context=await chromium.launchPersistentContext(path.join(temp,'profile'),{executablePath,headless:true,viewport:{width:1280,height:800},args:['--remote-debugging-port=0','--disable-background-timer-throttling']});
  await context.route('https://jimeng.jianying.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
  const page=context.pages()[0];await page.goto(url);
  const port=Number(fs.readFileSync(path.join(temp,'profile/DevToolsActivePort'),'utf8').split('\n')[0]);
  const fastContentPath=path.join(temp,'content-fast.js');
  const productionContent=fs.readFileSync(path.join(import.meta.dirname,'../jimeng-canvas-extension/content.js'),'utf8');
  fs.writeFileSync(fastContentPath,productionContent
    .replace('CREDIT_CONFIRM_INITIAL_DELAY_MS = 60_000','CREDIT_CONFIRM_INITIAL_DELAY_MS = 10')
    .replace('CREDIT_WATCH_POLL_INTERVAL_MS = 10_000','CREDIT_WATCH_POLL_INTERVAL_MS = 10'));
  bridge=new CdpBridge({stateDir:path.join(temp,'state'),contentPath:fastContentPath});
  await bridge.configure({mode:'cdp',port});
  const status=await bridge.status();assert.equal(status.online,true,JSON.stringify(status));
  bridge.config.targetId='stale-id-after-browser-restart';
  const quickConnection=await bridge.openAndConnect();
  assert.equal(quickConnection.online,true,JSON.stringify(quickConnection));
  assert.notEqual(bridge.config.targetId,'stale-id-after-browser-restart');
  assert.equal(bridge.config.lastCanvasUrl,url);
  assert.equal(await page.evaluate(()=>window.__jimengCDP),undefined,'executor lives outside website main world');
  const payload={source:'desktop-workbench',bridgeProtocolVersion:1,promptIsFinal:true,segment:{prompt:'本次分镜原文验证：小猫站在蓝色窗台看雨。'}};
  const result=await bridge.execute(payload);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.confirmed,true);
  assert.equal(result.creditConfirmation.source,'exact-credit-deduction');
  assert.equal(result.creditConfirmation.consumed,36);
  assert.equal(await page.evaluate(()=>clicks),1);assert.equal(bridge.pending,null);
  // A new card with unrelated text is not confirmation, even after reconnect.
  await page.evaluate(()=>{action='unrelated';});
  const running=bridge.execute({...payload,segment:{prompt:'第二次分镜原文验证：小狗穿过绿色森林。'}});
  await page.waitForFunction(()=>clicks===2,{},{timeout:15000});
  await bridge.detach();
  const health=await bridge.status();assert.equal(health.online,true,JSON.stringify(health));
  assert.equal((await bridge.execute(payload)).code,'CDP_BUSY','a second Send is refused only while this machine is mid-execution');
  assert.equal((await bridge.recover()).finished,false);
  await bridge.cancel();
  assert.ok(bridge.pending,'a post-send pause preserves the durable record while balance is unchanged');
  // A pause after Send does not abort read-only balance verification. A later
  // account-level deduction completes the original group without replaying it.
  await page.evaluate(()=>{balance-=36;});
  const pausedResult=await running;assert.equal(pausedResult.ok,true,JSON.stringify(pausedResult));assert.equal(bridge.pending,null);
  assert.equal(await page.evaluate(()=>clicks),2);
  // Actual Jimeng September DOM: canvas cards omit prompts; the same NEW chat
  // turn contains prompt fragments and a video-nodes task block.
  await page.evaluate(()=>{
    const list=document.createElement('div');list.id='scroll-list-fixture';
    const old=document.createElement('div');old.id='item_fixture_old';old.dataset.id='old';old.dataset.index='0';list.append(old);
    document.querySelector('.chat-container-test').append(list);
    const original=document.querySelector('.submit-button-test').onclick;
    document.querySelector('.submit-button-test').onclick=event=>{
      original(event);
      for(const row of list.children)row.dataset.index=Number(row.dataset.index)+1;
      const turn=document.createElement('div');turn.id='item_fixture_'+clicks;turn.dataset.id='turn-'+clicks;turn.dataset.index='0';
      const user=document.createElement('div');user.className='user-message-fixture';
      const bubble=document.createElement('div');bubble.className='bubble-fixture';
      const part1=document.createElement('span');part1.className='prompt-value-container-fixture';part1.textContent=lastPrompt.slice(0,8);
      const tag=document.createElement('span');tag.className='tag-fixture';tag.textContent='额外图片引用标签';
      const part2=document.createElement('span');part2.className='prompt-value-container-fixture';part2.textContent=lastPrompt.slice(8);
      bubble.append(part1,tag,part2);user.append(bubble);turn.append(user);
      if(action==='turn'){
        const video=document.createElement('div');video.className='video-nodes-container-fixture';
        const nodes=document.createElement('div');nodes.className='nodes-container-fixture';
        const card=document.createElement('div');card.className='card-wrapper-fixture';card.textContent='排队加速中';
        nodes.append(card);video.append(nodes);turn.append(video);
      }else turn.append(document.createTextNode('以上内容由 AI 生成 本次消耗 0 积分'));
      list.prepend(turn);
    };
    action='turn';
  });
  const turnResult=await bridge.execute({...payload,segment:{prompt:'同轮任务验证：蓝色机器人在公园散步。'}});
  assert.equal(turnResult.ok,true,JSON.stringify(turnResult));
  assert.equal(turnResult.creditConfirmation.source,'exact-credit-deduction');
  assert.equal(turnResult.creditConfirmation.turnProof[0].turnId,'turn-3');
  await page.evaluate(()=>{action='turnzero';});
  const zeroRunning=bridge.execute({...payload,segment:{prompt:'只有零积分对话回执，没有新视频任务。'}});
  await page.waitForFunction(()=>clicks===4,{},{timeout:15000});
  assert.equal((await bridge.recover()).finished,false,'zero-credit reply is not a video task');
  await bridge.cancel();
  await page.evaluate(()=>{balance-=36;});
  assert.equal((await zeroRunning).ok,true,'post-send pause keeps exact-credit verification alive');
  assert.equal(bridge.pending,null);

  // A Send click must end in a send. A live reply is waited out — never clicked
  // through and never stopped without authorization — and the send then happens
  // by itself the moment the arrow comes back.
  await page.evaluate(()=>{action='match';document.querySelector('svg path').setAttribute('d','M4.5 10.9 v2.2');});
  const waiting=bridge.execute({...payload,segment:{prompt:'等待箭头恢复后再发送：红色气球飞过山谷。'}});
  for(let i=0;i<100&&(await bridge.recover()).phase!=='waiting_previous_reply';i++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal((await bridge.recover()).phase,'waiting_previous_reply');
  assert.equal(await page.evaluate(()=>clicks),4,'a live reply is waited out, not clicked through');
  assert.equal(await page.evaluate(()=>stopClicks),0,'without a confirmed predecessor CDP must not stop a live reply');
  await page.evaluate(()=>{document.querySelector('svg path').setAttribute('d','M12.002 3 V19.5');});
  const waited=await waiting;assert.equal(waited.ok,true,JSON.stringify(waited));
  assert.equal(await page.evaluate(()=>clicks),5,'the waited group sends itself once the arrow returns');
  assert.equal(await page.evaluate(()=>stopClicks),0);
  // A confirmed predecessor still authorizes stopping its reply outright.
  await page.evaluate(()=>{document.querySelector('svg path').setAttribute('d','M4.5 10.9 v2.2');});
  const continued=await bridge.execute({...payload,allowStopPreviousReply:true,segment:{prompt:'已确认扣费后停止回复：蓝色风筝掠过湖面。'}});
  assert.equal(continued.ok,true,JSON.stringify(continued));
  assert.equal(continued.creditConfirmation.consumed,36);
  assert.equal(await page.evaluate(()=>stopClicks),1,'a confirmed predecessor authorizes one inherited-reply stop');
  assert.equal(await page.evaluate(()=>clicks),6,'the next prompt is formally sent once after the arrow recovers');
  // The one refusal the user kept: leftover text in the box. Nothing is sent,
  // nothing is charged, and the user's own draft is left exactly as it was.
  const unclean={...payload,segment:{prompt:'输入框未清理时不发送：金色沙漠上的驼队。'}};
  await page.evaluate(()=>{document.querySelector('.chat-container-test .tiptap').textContent='用户草稿';});
  const draft=await bridge.execute(unclean);assert.equal(draft.ok,false);
  assert.equal(draft.code,'CDP_COMPOSER_NOT_CLEAN');assert.match(draft.error,/请先清理/);
  assert.equal(await page.evaluate(()=>clicks),6,'an unclean composer is a refusal before any click');
  assert.equal(await page.locator('.chat-container-test .tiptap').textContent(),'用户草稿');
  assert.equal(bridge.pending,null,'a refusal before any click leaves no lock behind');
  await page.evaluate(()=>{document.querySelector('.chat-container-test .tiptap').textContent='';});
  // And once it is cleared, the very same group goes through on the next click.
  const cleared=await bridge.execute(unclean);
  assert.equal(cleared.ok,true,JSON.stringify(cleared));
  assert.equal(await page.evaluate(()=>clicks),7,'clearing the box is all it takes to send');
  // A prompt the log knows was charged is not quietly sent again; one explicit
  // confirmation from the user is enough to override that.
  const again=await bridge.execute(unclean);
  assert.equal(again.code,'CDP_ALREADY_CONFIRMED');
  assert.equal(again.charged.consumed,36);
  assert.equal(await page.evaluate(()=>clicks),7,'a charged prompt is not resent without confirmation');
  const forced=await bridge.execute({...unclean,confirmResend:true});
  assert.equal(forced.ok,true,JSON.stringify(forced));
  assert.equal(await page.evaluate(()=>clicks),8,'confirming the resend sends exactly once more');
  await page.evaluate(()=>document.querySelector('.chat-container-test').remove());
  const panelClosed=await bridge.status();
  assert.equal(panelClosed.online,true,'the central canvas keeps CDP dispatchable while the Agent panel is closed');
  assert.equal(panelClosed.connector.canvasReady,true);
  assert.equal(panelClosed.connector.conversationReady,false);
  // The production settings UI operates in both file and HTTP workbenches.
  const ui=await context.newPage();await ui.route('http://127.0.0.1:17842/**',route=>route.fulfill({body:'<div class="top-actions"><span id="bridgeStatus">未连接</span><button id="checkBrowser">检查即梦浏览器</button></div>',contentType:'text/html'}));
  await ui.goto('http://127.0.0.1:17842/ui-fixture');
  await ui.evaluate(()=>{window.openCalls=0;window.desktopBridge={cdpOpenAndConnect:async()=>{window.openCalls++;return {online:true,connector:{url:'https://jimeng.jianying.com/ai-tool/canvas/a'}};},cdpSettings:async()=>({mode:'cdp',port:9333}),cdpTargets:async()=>[{id:'a',url:'https://jimeng.jianying.com/ai-tool/canvas/a',title:'测试画布'}]};});
  await ui.addScriptTag({path:path.join(import.meta.dirname,'cdp-controls.js')});
  await ui.getByRole('button',{name:'打开并连接即梦浏览器',exact:true}).click();
  await ui.waitForFunction(()=>document.querySelector('#bridgeStatus').textContent==='已连接即梦画布');
  assert.equal(await ui.evaluate(()=>openCalls),1,'the main button opens and connects through one bridge action');
  await ui.getByText('即梦直连设置',{exact:true}).click();
  await ui.getByText('刷新画布列表',{exact:true}).click();
  await ui.waitForFunction(()=>document.querySelector('#cdpTarget').options.length===2);
  assert.equal(await ui.locator('#cdpMode').inputValue(),'cdp');
  fs.mkdirSync(path.join(import.meta.dirname,'../output/cdp-verification'),{recursive:true});
  await ui.screenshot({path:path.join(import.meta.dirname,'../output/cdp-verification/settings.png')});
  console.log('Real Chrome CDP: isolated executor, trusted single send, exact new-card attribution, reconnect without replay, delayed original-task recovery, stop-square/draft protection and settings UI: PASS');
} finally {
  if(bridge)await bridge.detach();
  if(context)await context.close();
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('jimeng-cdp-browser-'));
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
