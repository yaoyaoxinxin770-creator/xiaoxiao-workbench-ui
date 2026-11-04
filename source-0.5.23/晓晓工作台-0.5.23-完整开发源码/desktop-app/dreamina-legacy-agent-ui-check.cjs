const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
app.setPath('userData',process.env.LEGACY_AGENT_UI_TEST_ROOT);app.disableHardwareAcceleration();const fixture=require('./native-ui-fixture.cjs');
const original=http.createServer;http.createServer=function(...args){const server=original.apply(this,args),listen=server.listen;server.listen=function(port,...rest){return listen.call(server,port===17842?0:port,...rest);};return server;};
const {DreaminaService,catalogFromHelp}=require('./dreamina-service'),help=require('./dreamina-runtime/capabilities.json'),catalog=catalogFromHelp(help.text2video,help.multimodal2video);
DreaminaService.prototype.status=async()=>({logged_in:true,balance:1000});DreaminaService.prototype.models=async()=>catalog;DreaminaService.prototype.describe=async model=>catalog.specs[model];
const {DreaminaCanvasService}=require('./dreamina-canvas-service');DreaminaCanvasService.prototype.status=async()=>({logged_in:false,balance:null});DreaminaCanvasService.prototype.models=async()=>({models:[],specs:{},modelCapabilities:{}});
require('./pippit-service').PippitService.prototype.status=async()=>({logged_in:false});require('./dreamina-canvas-targets').DreaminaCanvasTargets.prototype.settings=async()=>null;
const {CdpBridge}=require('./cdp-bridge'),{DreaminaLegacyAgentService}=require('./dreamina-legacy-agent-service');
const url='https://jimeng.jianying.com/ai-tool/canvas/22899680134924?from_page=assets',bindings=[],submits=[];
CdpBridge.prototype.targets=async()=>[{id:'old-canvas',title:'知乎短篇言情',url}];
DreaminaLegacyAgentService.prototype.settings=async()=>bindings.at(-1)||null;DreaminaLegacyAgentService.prototype.bind=async function(p){bindings.push({...p,targetId:p.targetId,url,name:'知乎短篇言情'});return bindings.at(-1);};
DreaminaLegacyAgentService.prototype.capture=async()=>({targetId:'old-canvas',url,name:'知乎短篇言情'});
const mockedTasks=new Map(),reply=(p,prefix)=>{submits.push(p);const error=p.prompt.includes('Agent失败')?'官网Agent模式切换失败；本条未发送':p.prompt.includes('并发拒绝')?'api error: ret=1310, message=ExceedConcurrencyLimit':p.prompt.includes('待核对测试')?'发送响应丢失，请核对原任务':undefined,task={id:prefix+p.clientTaskId,status:p.prompt.includes('待核对测试')?'unknown':error?'failed':'processing',model:p.model,canvasUrl:url,...(error?{error:{message:error}}:{})};mockedTasks.set(task.id,task);return task;};
DreaminaLegacyAgentService.prototype.submit=async p=>reply(p,'dreamina-agent:');DreaminaLegacyAgentService.prototype.query=async id=>mockedTasks.get(id)||({id,status:'processing',canvasUrl:url});
DreaminaService.prototype.submit=async p=>reply(p,'dreamina:');DreaminaService.prototype.query=async id=>{const task=mockedTasks.get(id);return task&&submits.some(p=>id==='dreamina:'+p.clientTaskId&&p.prompt.includes('异步并发'))?{...task,status:'failed',error:{message:'api error: ret=1310, message=ExceedConcurrencyLimit'}}:task;};
app.whenReady().then(async()=>{let code=0;try{
 require('./main');const win=await fixture.nativeWindow();const run=s=>win.webContents.executeJavaScript(s);await win.loadURL(new URL('/video',win.webContents.getURL()).href);
 const click=async label=>{const expr='[...document.querySelectorAll("button")].find(e=>e.getClientRects().length&&(e.textContent.trim() || e.ariaLabel || String()).trim()==='+JSON.stringify(label)+')';await fixture.until(()=>run('Boolean(('+expr+')&&!('+expr+').disabled)'),'按钮 '+label);await run(expr+'.click()');};
 await fixture.until(()=>run('Boolean(document.querySelector("[data-testid=video-cli-channel]"))'),'视频渠道');await click('即梦 CLI');await click('旧版');
 await fixture.until(()=>run('Boolean(document.querySelector("[aria-label=即梦旧版创作方式]"))'),'旧版方式选择');
 const choose=async(selector,text)=>{await fixture.until(()=>run('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');return e&&e.getClientRects().length&&!e.closest(".ant-select-disabled");})()'),"下拉框可用");await fixture.sleep(350);win.show();win.focus();const point=await run('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').closest(".ant-select").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});const expr='[...document.querySelectorAll(".ant-select-item-option")].find(e=>e.getClientRects().length&&e.textContent.includes('+JSON.stringify(text)+'))';await fixture.until(()=>run('Boolean('+expr+')'),'选项 '+text);await run(expr+'.click()');};
 await choose('[aria-label=即梦旧版创作方式]','旧画布 Agent');await fixture.until(()=>run('Boolean(document.querySelector("[data-testid=dreamina-legacy-agent-controls]"))'),'Agent连接入口');await click('连接旧画布');
 await choose('[aria-label="旧画布 Agent 目标画布"]','知乎短篇言情');await click('绑定到当前视频项目');await fixture.until(()=>bindings.length===1,'原画布绑定');assert.equal(bindings[0].targetId,'old-canvas');assert.ok(bindings[0].projectKey);
 await run('(()=>{const e=document.querySelector("[data-prompt-reference-editor]");e.textContent="小猫跳舞";e.dispatchEvent(new Event("input",{bubbles:true}));})()');await click('开始创作');await fixture.until(()=>submits.length===1,'旧版Agent提交');
 assert.equal(submits[0].version,'legacy');assert.equal(submits[0].legacyMode,'agent');assert.equal(submits[0].model,'seedance2.0');assert.equal(submits[0].legacyAgentCapture.targetId,'old-canvas');assert.equal(submits[0].prompt,'小猫跳舞');
 win.reload();await fixture.until(()=>run('document.body.textContent.includes("生成中")'),'重启恢复显示');assert.equal(submits.length,1,'重载不能重新提交');
 await click('即梦 CLI');await fixture.until(()=>run('document.querySelector("[aria-label=即梦旧版创作方式]")?.closest(".ant-select").textContent.includes("旧画布 Agent")'),'模式记忆');

 await click('即梦 CLI'); // Close settings; use the normal workbench composer.
 const send=async text=>{await fixture.until(()=>run('![...document.querySelectorAll(".ant-message-notice")].some(e=>e.textContent.includes("已提交"))'),'旧成功提示结束');await run('(()=>{const e=document.querySelector("[data-prompt-reference-editor]");e.textContent='+JSON.stringify(text)+';e.dispatchEvent(new Event("input",{bubbles:true}));})()');await click('开始创作');};
 await send('Agent失败');
 await fixture.until(()=>run('[...document.querySelectorAll("[data-video-tile]")].some(e=>e.textContent.includes("官网Agent模式切换失败"))'),'Agent拒绝保留错误卡片');
 await fixture.until(()=>run('[...document.querySelectorAll(".ant-message-notice")].some(e=>e.textContent.includes("创建失败")&&e.textContent.includes("本条未发送"))'),'Agent拒绝提示失败');
 assert.equal(await run('[...document.querySelectorAll(".ant-message-notice")].some(e=>e.textContent.includes("已提交"))'),false,'拒绝不能提示创建成功');
 await send('待核对测试');
 await fixture.until(()=>run('[...document.querySelectorAll("[data-video-tile]")].some(e=>e.textContent.includes("待核对")&&e.textContent.includes("发送响应丢失"))'),'不确定任务保留待核对卡片');
 await fixture.until(()=>run('[...document.querySelectorAll(".ant-message-notice")].some(e=>e.textContent.includes("提交结果待核对"))'),'不确定任务明确提示');
 await click('即梦 CLI');await choose('[aria-label=即梦旧版创作方式]','CLI 直接生成');await click('即梦 CLI');
 await send('并发拒绝');
 await fixture.until(()=>run('[...document.querySelectorAll("[data-video-tile]")].some(e=>e.textContent.includes("即梦当前并发任务已满"))'),'并发超限保留中文失败卡片');
 await fixture.until(()=>run('[...document.querySelectorAll(".ant-message-notice")].some(e=>e.textContent.includes("创建失败")&&e.textContent.includes("并发任务已满"))'),'并发拒绝即时提示失败');
 assert.equal(await run('[...document.querySelectorAll(".ant-message-notice")].some(e=>e.textContent.includes("已提交"))'),false,'并发拒绝不能误报成功');
 await send('异步并发');
 await fixture.until(()=>run('[...document.querySelectorAll(".ant-message-notice")].some(e=>e.textContent.includes("视频生成失败：")&&e.textContent.includes("并发任务已满"))'),'后续查询并发拒绝明确通知');
 await fixture.until(()=>run('[...document.querySelectorAll("[data-video-tile]")].filter(e=>e.textContent.includes("并发任务已满")).length===2'),'异步拒绝保留第二张失败卡片');
 const beforeReload=submits.length;win.reload();
 await fixture.until(()=>run('[...document.querySelectorAll("[data-video-tile]")].some(e=>e.textContent.includes("并发任务已满"))&&[...document.querySelectorAll("[data-video-tile]")].some(e=>e.textContent.includes("官网Agent模式切换失败"))'),'刷新保留两类失败记录');
 assert.equal(submits.length,beforeReload,'失败和待核对刷新均不重发');
 writeArtifact(path.resolve(__dirname,'../output/legacy-agent-validation/ui.png'),(await win.webContents.capturePage()).toPNG());
 console.log('旧画布 Agent 原生界面：旧版独立方式、完整URL画布选择、按项目绑定、原参数与原文提交、任务恢复及刷新不重发：PASS；接口全部模拟，零付费生成。');
}catch(e){console.error(e);const win=require('electron').BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/video'));if(win){writeArtifact(path.resolve(__dirname,'../output/legacy-agent-validation/ui-failure.png'),(await win.webContents.capturePage()).toPNG());console.error(await win.webContents.executeJavaScript('document.body.innerText.slice(-6000)'));}code=1;}finally{app.exit(code);}});

function writeArtifact(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
