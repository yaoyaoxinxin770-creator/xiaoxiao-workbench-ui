/* Canvas generation uses visible official controls in the user's existing Chrome profile.
 * It never calls a private generation API or falls back to the generic project generator. */
(() => {
 const BASE='http://127.0.0.1:17842/workbench/pippit-canvas',PANEL='[role="dialog"][aria-label="视频节点视频生成面板"]';
 const labels={'Seedance_2.5_draft':['Seedance 2.5 Draft','SD 2.5 Draft'],'Seedance_2.5':['Seedance 2.5','SD 2.5']};
 let busy=false,identity,token;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const targetOf=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='xyq.jianying.com'&&u.pathname==='/project'?{projectId:u.searchParams.get('projectId'),canvasId:u.searchParams.get('canvasId')}:null;}catch{return null;}};
 const same=(url,t)=>{const actual=targetOf(url);return actual&&actual.projectId===t.projectId&&actual.canvasId===t.canvasId;};
 async function post(route,body){const response=await fetch(BASE+'/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Extension':chrome.runtime.id},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const value=await response.json();if(!response.ok||value.error)throw Error(value.error||'工作台连接失败');return value;}
 async function checked(job){const tab=await chrome.tabs.get(job.tabId);if(!same(tab.url,job.target))throw Error('浏览器目标画布已变化，已停止操作');}
 async function command(job,name,args){await checked(job);return chrome.debugger.sendCommand({tabId:job.tabId},name,args);}
 async function dom(job,fn,arg){const response=await command(job,'Runtime.evaluate',{expression:'('+fn.toString()+')('+JSON.stringify(arg)+')',returnByValue:true,awaitPromise:false});if(response.exceptionDetails)throw Error('官网界面结构已变化，请核对节点');return response.result?.value;}
 async function wait(job,fn,arg){for(let i=0;i<80;i++){try{const value=await dom(job,fn,arg);if(value)return value;}catch(e){if(!/Cannot find context|Execution context.*destroyed|context.*not found|Inspected target navigated/i.test(e.message))throw e;}await pause(250);}throw Error('官网控件未就绪（'+(arg?.selector||arg?.text||'视频节点面板')+'），草稿已保留，尚未确认生成');}
 function point({selector,text,prefix,scope}){const root=scope?document.querySelector(scope):document;if(!root)return null;const nodes=[...root.querySelectorAll(selector||'[role="menuitem"],button,div,span')].filter(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height||r.right<=0||r.bottom<=0||r.x>=innerWidth||r.y>=innerHeight)return false;const t=(e.getAttribute('aria-label')||e.textContent||'').trim();if(text!==undefined&&(prefix?!t.startsWith(text):t!==text))return false;return e.contains(document.elementFromPoint((Math.max(0,r.x)+Math.min(innerWidth,r.right))/2,(Math.max(0,r.y)+Math.min(innerHeight,r.bottom))/2));});const e=nodes.sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.width*x.height-y.width*y.height;})[0];if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:(Math.max(0,r.x)+Math.min(innerWidth,r.right))/2,y:(Math.max(0,r.y)+Math.min(innerHeight,r.bottom))/2};}
 async function click(job,arg){const p=await wait(job,point,arg);await command(job,'Input.dispatchMouseEvent',{type:'mouseMoved',...p});await command(job,'Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await command(job,'Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await pause(200);}
 async function textInput(job,selector,text){await click(job,{selector});await command(job,'Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await command(job,'Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await command(job,'Input.insertText',{text});await command(job,'Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await command(job,'Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await pause(250);}
 function form({nodeId,panel}){const p=document.querySelector(panel),n=document.querySelector('.react-flow__node[data-id="'+nodeId+'"]');if(!p||!n||Number(n.style.zIndex)!==10)return null;const elevated=[...document.querySelectorAll('.react-flow__node')].filter(e=>Number(e.style.zIndex)>=10);if(elevated.length!==1||elevated[0]!==n)return null;const controls={};for(const e of p.querySelectorAll('[data-action]')){const r=e.getBoundingClientRect();if(r.x>=0&&r.y>=0&&r.width&&r.height&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))controls[e.getAttribute('data-action')]=(e.textContent||'').trim();}const editor=p.querySelector('[data-testid="canvas-generation-prompt-editor"]'),clone=editor?.cloneNode(true),referenceIds=[...editor?.querySelectorAll('[data-node-asset-id]')||[]].map(e=>e.getAttribute('data-node-asset-id'));clone?.querySelectorAll('[data-node-asset-id]').forEach(e=>e.remove());const paragraphs=[...clone?.querySelectorAll('p')||[]];return {nodeId,prompt:paragraphs.length?paragraphs.map(e=>e.textContent).join('\n'):clone?.textContent||'',referenceIds,draftCount:Number(controls['open-video-sample-count-settings']?.match(/[:：]\s*(\d+)\s*$/)?.[1]||0),controls,enabled:!!p.querySelector('[data-action="video-generate-submit"]:not(:disabled)')};}
 function assertForm(job,state){const label=labels[job.model];if(!label)throw Error('画布直生成当前支持 Seedance 2.5 和 Seedance 2.5 Draft');if(!state||state.nodeId!==job.nodeId||!state.prompt.trim())throw Error('官网没有选中本次视频节点');const normal=s=>s.replace(/\s+/g,' ').trim();if(normal(state.prompt)!==normal(job.prompt)||(job.referenceIds||[]).some(id=>!state.referenceIds?.includes(id)))throw Error('官网提示词或参考素材与本次任务不一致');const c=state.controls;if(job.model.endsWith('_draft')&&state.draftCount!==1)throw Error('官网样片数量不是本次单节点的一条，已停止发送');if(c['select-video-model']!==label[1]||!c['open-video-ratio-settings']?.startsWith(job.ratio==='adaptive'?'自动':job.ratio)||c['open-video-duration-settings']!==job.duration+'s'||c['select-video-reference-mode']!=='全参考'||(job.resolution&&!job.model.endsWith('_draft')&&c['select-video-resolution']?.toLowerCase()!==job.resolution.toLowerCase())||!state.enabled)throw Error('官网视频节点参数或素材尚未就绪，已停止发送');}
 // Pan only empty canvas background with trusted input; never move nodes.
 async function pointerTool(job,hand){
  await click(job,{selector:'[data-action="toggle-pointer-tool-menu"]'});
  const wasHand=await dom(job,()=>document.querySelector('[data-action="select-pointer-hand-tool"]')?.dataset.active==='true');
  await click(job,{selector:hand?'[data-action="select-pointer-hand-tool"]':'[role="menuitem"][aria-label="选择移动工具"]'});return wasHand;
 }
 async function revealPanel(job){
  for(let i=0;i<4;i++){
   const move=await dom(job,({panel})=>{const p=document.querySelector(panel);if(!p)return null;const buttons=[...p.querySelectorAll('[data-action="select-video-model"],[data-action="video-generate-submit"]')].filter(e=>e.getBoundingClientRect().x>=0),r=buttons.at(-1)?.getBoundingClientRect();if(!r||r.bottom<innerHeight-50)return null;const pane=document.querySelector('.react-flow__pane');if(!pane)return null;const box=pane.getBoundingClientRect();for(const x of [box.right-35,box.left+35]){const y=Math.min(innerHeight-100,box.top+box.height/2);if(document.elementFromPoint(x,y)===pane)return {x,y,dy:Math.min(250,r.bottom-innerHeight+100)};}return null;},{panel:PANEL});
   if(!move)return;
   const wasHand=await pointerTool(job,true);
   try{await command(job,'Input.dispatchMouseEvent',{type:'mouseMoved',x:move.x,y:move.y});
   await command(job,'Input.dispatchMouseEvent',{type:'mousePressed',x:move.x,y:move.y,button:'left',clickCount:1});
   await command(job,'Input.dispatchMouseEvent',{type:'mouseMoved',x:move.x,y:move.y-move.dy,button:'left',buttons:1});
   await command(job,'Input.dispatchMouseEvent',{type:'mouseReleased',x:move.x,y:move.y-move.dy,button:'left',clickCount:1});await pause(250);
   }finally{await pointerTool(job,wasHand);}
   // Background panning may dismiss selection; restore only the original node.
   if(!await dom(job,form,{nodeId:job.nodeId,panel:PANEL}))await click(job,{selector:'.react-flow__node[data-id="'+job.nodeId+'"] [data-xyq-node-title-text="true"]'});
  }
 }
 async function returnToCanvas(job){
  if(!await dom(job,()=>document.querySelector('[role="radio"][aria-label="画布"]')?.getAttribute('aria-checked')==='true'))await click(job,{selector:'[role="radio"]',text:'画布'});
 }
 async function prepare(job){if(!labels[job.model])throw Error('画布直生成当前支持 Seedance 2.5 和 Seedance 2.5 Draft');
  // List material selection may already return to canvas and select the node.
  let state=await dom(job,form,{nodeId:job.nodeId,panel:PANEL});
  if(!state){
   const onCanvas=await dom(job,()=>document.querySelector('[role="radio"][aria-checked="true"]')?.textContent?.trim()==='画布');
   const node={selector:'.react-flow__node[data-id="'+job.nodeId+'"] [data-xyq-node-title-text="true"]'};
   if(onCanvas&&await dom(job,point,node))await click(job,node);
   else{
    try{
    await click(job,{selector:'[role="radio"]',text:'列表'});await click(job,{selector:'[role="tab"]',text:'视频',prefix:true});
    await textInput(job,'input[type="search"][aria-label="搜索资产"]',job.nodeName);
    await click(job,{selector:'[data-action="novel-detail-asset-select-material"][data-action-object-id="'+job.nodeId+'"]'});
    }finally{await returnToCanvas(job);}
   }
   state=await wait(job,form,{nodeId:job.nodeId,panel:PANEL});
  }
  await revealPanel(job);
  // The SDK supplied prompt and all reference edges. Do not erase the editor's mention atoms.
  const normal=s=>s.replace(/\s+/g,' ').trim();if(normal(state.prompt)!==normal(job.prompt)||(job.referenceIds||[]).some(id=>!state.referenceIds?.includes(id)))throw Error('官网节点提示词或素材与本次任务不一致');
  if(state.controls['select-video-model']!==labels[job.model][1]){await click(job,{selector:'[data-action="select-video-model"]',scope:PANEL});await click(job,{text:labels[job.model][0]});}
  state=await wait(job,form,{nodeId:job.nodeId,panel:PANEL});const wantedRatio=job.ratio==='adaptive'?'自动':job.ratio;
  if(!state.controls['open-video-ratio-settings']?.startsWith(wantedRatio)){await click(job,{selector:'[data-action="open-video-ratio-settings"]',scope:PANEL});await click(job,{selector:'[role="menuitem"]',text:wantedRatio,prefix:true});}
  if(!job.model.endsWith('_draft')&&job.resolution){state=await wait(job,form,{nodeId:job.nodeId,panel:PANEL});if(state.controls['select-video-resolution']?.toLowerCase()!==job.resolution.toLowerCase()){await click(job,{selector:'[data-action="select-video-resolution"]',scope:PANEL});await click(job,{text:job.resolution.toUpperCase()});}}
  state=await wait(job,form,{nodeId:job.nodeId,panel:PANEL});if(state.controls['open-video-duration-settings']!==job.duration+'s'){await click(job,{selector:'[data-action="open-video-duration-settings"]',scope:PANEL});await textInput(job,'input[aria-label="视频时长秒数"]',String(job.duration));await click(job,{selector:'[data-testid="canvas-generation-prompt-editor"]',scope:PANEL});}
  state=await wait(job,form,{nodeId:job.nodeId,panel:PANEL});assertForm(job,state);return state;
 }
 async function execute(job){await checked(job);await chrome.debugger.attach({tabId:job.tabId},'1.3');try{if(job.action==='probe'){const loaded=await wait(job,point,{selector:'[role="radio"]',text:'列表'});if(!loaded)throw Error('官网画布尚未加载');return {canvasId:job.target.canvasId,projectId:job.target.projectId};}const state=await prepare(job);if(job.action==='prepare')return {nodeId:state.nodeId};if(job.action!=='submit')throw Error('未知画布操作');
  const key='xyq-canvas-click:'+job.id;if((await chrome.storage.local.get(key))[key])throw Error('本次画布发送已执行，禁止重复');await chrome.storage.local.set({[key]:{nodeId:job.nodeId,at:Date.now()}});assertForm(job,await dom(job,form,{nodeId:job.nodeId,panel:PANEL}));await click(job,{selector:'[data-action="video-generate-submit"]',scope:PANEL});return {nodeId:job.nodeId,clicked:true};
 }finally{await chrome.debugger.detach({tabId:job.tabId}).catch(()=>{});}}
 async function tick(){if(busy)return;busy=true;try{if(!identity){const saved=await chrome.storage.local.get(['xyq-canvas-connector','xyq-canvas-session']);token=saved['xyq-canvas-session'];identity=saved['xyq-canvas-connector']||crypto.randomUUID();await chrome.storage.local.set({'xyq-canvas-connector':identity});}const tabs=(await chrome.tabs.query({url:'https://xyq.jianying.com/project*'})).filter(t=>targetOf(t.url)?.canvasId);const response=await post('heartbeat',{connectorId:identity,token,tabs:tabs.map(t=>({id:t.id,url:t.url}))});token=response.token;await chrome.storage.local.set({'xyq-canvas-session':token,'xyq-canvas-status':{connected:true,tabs:tabs.length,at:Date.now()}});await chrome.action?.setBadgeText({text:tabs.length?'●':''});await chrome.action?.setBadgeBackgroundColor({color:'#2b9361'});if(response.job){let result,error;const keepAlive=setInterval(()=>void post('heartbeat',{connectorId:identity,token,busy:true,tabs:tabs.map(t=>({id:t.id,url:t.url}))}).catch(()=>{}),5000);try{result=await execute(response.job);}catch(e){error=e.message;}finally{clearInterval(keepAlive);}await post('result',{connectorId:identity,token,id:response.job.id,result,error});}}catch(e){if(/凭据已失效/.test(e.message)){token=undefined;await chrome.storage.local.remove('xyq-canvas-session');}await chrome.storage.local.set({'xyq-canvas-status':{connected:false,at:Date.now(),error:'工作台尚未连接，将自动重连'}});await chrome.action?.setBadgeText({text:'…'});}finally{busy=false;}}
 if(typeof module!=='undefined')module.exports={targetOf,same,labels,assertForm,form,point,returnToCanvas,tick};
 if(typeof chrome!=='undefined'&&chrome.tabs&&chrome.debugger){chrome.tabs.onUpdated.addListener((_id,change,tab)=>{if(change.status==='complete'&&targetOf(tab.url))void tick();});chrome.tabs.onActivated.addListener(()=>void tick());chrome.runtime.onStartup.addListener(()=>void tick());chrome.runtime.onInstalled.addListener(()=>{void chrome.alarms.create('xyq-canvas-heartbeat',{periodInMinutes:0.5});void tick();});chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='xyq-canvas-heartbeat')void tick();});chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message?.type==='XYQ_CANVAS_WAKE'&&(sender.id===chrome.runtime.id)&&(!sender.tab||targetOf(sender.tab.url))){void tick().then(()=>reply({ok:true}));return true;}});void chrome.alarms.create('xyq-canvas-heartbeat',{periodInMinutes:0.5});setInterval(()=>void tick(),5000);void tick();}
})();
