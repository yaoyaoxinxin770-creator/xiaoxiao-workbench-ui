const {app,BrowserWindow,dialog,nativeImage,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),{spawnSync,execFile}=require('node:child_process');
const temporary=process.env.INFINITE_CANVAS_UI_TEST_ROOT;
assert.ok(temporary);app.setPath('userData',temporary);app.disableHardwareAcceleration();
process.on('unhandledRejection',error=>{console.error(error);app.exit(1);});
const fixture=require('./native-ui-fixture.cjs');
const {services,sleep,until}=fixture;
const originalCreate=http.createServer;
http.createServer=function(...args){const server=originalCreate.apply(this,args),listen=server.listen;server.listen=function(port,...rest){return listen.call(server,port===17842?0:port,...rest);};return server;};
const project=path.join(temporary,'即梦测试项目'),typetale=path.join(temporary,'字字动画测试项目');
fs.mkdirSync(project);fs.mkdirSync(typetale);
const png=nativeImage.createFromBitmap(Buffer.alloc(64*64*4,180),{width:64,height:64}).toPNG();
for(const [folder,name]of [['人物','阮乔.png'],['场景','大厅.png']]){fs.mkdirSync(path.join(project,folder));fs.writeFileSync(path.join(project,folder,name),png);}
const source='视频编号01（总时长：12s）｜场景：大厅｜人物：阮乔\n镜头01｜阮乔走入大厅\n\n视频编号02（总时长：12s）｜场景：大厅｜人物：阮乔\n镜头01｜阮乔看向窗外';
require('./asset-store').write(project,{workspace:'jimeng',mode:'queue',modeLocked:true});
fs.writeFileSync(path.join(project,'.jimeng/draft.txt'),source);
const choices=[project,project,typetale];
dialog.showOpenDialog=async()=>{const choice=choices.shift();return {canceled:false,filePaths:Array.isArray(choice)?choice:[choice]};};
let executePayload,finishExecution,autoFinishExecution=false;const approvedExecutions=[];
const CdpBridge=require('./cdp-bridge').CdpBridge;
CdpBridge.prototype.targets=async()=>[{id:'canvas-a',title:'测试画布 A',url:'https://jimeng.jianying.com/ai-tool/canvas/test'},{id:'canvas-b',title:'测试画布 B',url:'https://jimeng.jianying.com/ai-tool/canvas/second'}];
CdpBridge.prototype.status=async()=>({online:true,verified:true,runtimeReady:true,executorReady:true,canvasReady:true,connector:{url:'https://jimeng.jianying.com/ai-tool/canvas/test',executorVersion:'fixture'}});
CdpBridge.prototype.execute=async payload=>{executePayload=payload;if(autoFinishExecution)approvedExecutions.push(payload);return new Promise(resolve=>{finishExecution=()=>resolve({ok:true,sent:true,referenceVerification:{verified:true,imageCount:payload.segment.lockedImages.length,audioCount:payload.segment.lockedAudio.length,attachmentCount:payload.localFiles.length}});if(autoFinishExecution)finishExecution();});};
app.whenReady().then(async()=>{
 let exitCode=0;
 try{
 const reader=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 await reader.loadFile(path.join(__dirname,'workbench-state-reader.html'));
 const oldState={projectPath:project,source,segments:[],mode:'queue',migrationMarker:'legacy-state-preserved',prefixTemplate:'测试存储的提示词内容：'};
 await reader.webContents.executeJavaScript('localStorage.setItem("jimeng-workbench-project",'+JSON.stringify(JSON.stringify(oldState))+');localStorage.setItem("jimeng-workbench-logs","[]")');
 require('./main');
  const win=await fixture.nativeWindow();reader.destroy();win.hide();
  const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
  const run=script=>win.webContents.executeJavaScript(script).catch(error=>{console.error("Renderer script failed:",script,"Console errors:",errors);throw error;});
  const readProject=()=>run('(async()=>{const request=indexedDB.open("xiaoxiao-jimeng-sessions");const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{const key="jimeng:"+'+JSON.stringify(project.replace(/[\/]$/,'').toLowerCase())+';const value=await new Promise((resolve,reject)=>{const r=db.transaction("projects","readonly").objectStore("projects").get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return JSON.parse(value["jimeng-workbench-project"]);}finally{db.close();}})()');
  const go=route=>run('window.dispatchEvent(new CustomEvent("xiaoxiao:navigate",{detail:'+JSON.stringify(route)+'}))');
  const clickText=text=>run('[...document.querySelectorAll("button")].find(b=>(b.textContent.trim() || b.ariaLabel || String()).trim()==='+JSON.stringify(text)+').click()');
  // Real OS-level mouse click: DOM .click() bypasses Electron's drag-region hit-testing, so real-pointer verification must inject actual input.
   const osClick=async selector=>{
    win.show();win.focus();win.moveTop();await until(()=>win.isFocused(),'OS 测试窗口已激活');await sleep(300);
    const rect=await run('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)return null;el.scrollIntoView({block:"nearest"});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,viewportWidth:innerWidth,viewportHeight:innerHeight};})()');
    assert.ok(rect,'OS 点击找不到元素 '+selector);
    const handle=win.getNativeWindowHandle().readBigUInt64LE().toString();
    const env={...process.env},pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';env[pathKey]='C:\\Windows\\System32;'+env[pathKey];
    // Measure the actual Win32 client area in the same DPI context as SendInput.
    // Electron DIP conversion can differ from the desktop's Win32 coordinate context.
    const command='Add-Type -MemberDefinition \''+
     '[DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v);'+
     '[DllImport("user32.dll")] public static extern int GetSystemMetrics(int n);'+
     '[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RC r);'+
     '[DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref PT p);'+
     '[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(PT p);'+
     '[DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);'+
     '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint flags);'+
     '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);'+
     '[DllImport("user32.dll",SetLastError=true)] public static extern uint SendInput(uint n,IN[] p,int cb);'+
     'public struct PT{public int x;public int y;}public struct RC{public int left;public int top;public int right;public int bottom;}'+
     '[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] public struct MI{public int dx;public int dy;public uint data;public uint flags;public uint time;public UIntPtr extra;}'+
     '[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] public struct IN{public uint type;public MI mi;}'+
     'public static uint ClickAt(long handle,double cssX,double cssY,double width,double height){SetThreadDpiAwarenessContext(new IntPtr(-4));IntPtr hwnd=new IntPtr(handle);SetWindowPos(hwnd,new IntPtr(-1),0,0,0,0,0x43);SetForegroundWindow(hwnd);RC r;GetClientRect(hwnd,out r);'+
     'PT p=new PT{x=(int)Math.Round(cssX*(r.right-r.left)/width),y=(int)Math.Round(cssY*(r.bottom-r.top)/height)};ClientToScreen(hwnd,ref p);'+
     'int vx=GetSystemMetrics(76),vy=GetSystemMetrics(77),vw=GetSystemMetrics(78),vh=GetSystemMetrics(79);int nx=(p.x-vx)*65535/(vw-1),ny=(p.y-vy)*65535/(vh-1);'+
     'Console.WriteLine("target={0},client={1}x{2},point={3},{4},hit={5}",hwnd,r.right,r.bottom,p.x,p.y,GetAncestor(WindowFromPoint(p),2));'+
     'var a=new IN[2];a[0]=new IN{type=0,mi=new MI{dx=nx,dy=ny,flags=0xC003}};a[1]=new IN{type=0,mi=new MI{dx=nx,dy=ny,flags=0xC005}};return SendInput(2,a,System.Runtime.InteropServices.Marshal.SizeOf(typeof(IN)));}\' -Name U -Namespace W;'+
     'if([W.U]::ClickAt('+handle+','+rect.x+','+rect.y+','+rect.viewportWidth+','+rect.viewportHeight+') -ne 2){exit 1}';
    win.setAlwaysOnTop(true);
    let result;try{await sleep(200);result=await new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8',env,timeout:15000,windowsHide:true},(error,stdout,stderr)=>resolve({status:error?error.code:0,stdout,stderr,error})));await sleep(200);}finally{win.setAlwaysOnTop(false);}
    console.log('OS click diagnostic',JSON.stringify({rect,focused:win.isFocused(),nativeHandle:handle,result:result.stdout}));assert.equal(result.status,0,'OS 点击执行失败 '+selector+' '+(result.stderr||result.error||''));
   };
  assert.equal(new URL(win.webContents.getURL()).pathname,"/canvas");
  assert.equal(await run('document.querySelectorAll("iframe").length'),0,'无限画布必须是主页面');
  assert.equal(await run('typeof window.desktopBridge.inspectProject'),'function');
  assert.equal(await run('Boolean(document.querySelector(".workbench-rail"))'),true,'第二版功能导航默认常驻');
  await run('document.querySelector("[data-rail-toggle]").click()');await until(()=>run('!document.querySelector(".workbench-rail")'),'功能导航可收起');
  await run('document.querySelector("[data-rail-toggle]").click()');await until(()=>run('Boolean(document.querySelector(".workbench-rail"))'),'功能导航可展开');
  const pid=services[0].child.pid,frontendPid=services[0].webChild.pid;
  await until(()=>run('[...document.querySelectorAll("button")].some(b=>(b.textContent.trim() || b.ariaLabel || String()).includes("新建画布")&&!b.disabled)'),'原生画布库');
  await run('[...document.querySelectorAll("button")].find(b=>(b.textContent.trim() || b.ariaLabel || String()).includes("新建画布")&&!b.disabled).click()');
  await until(()=>run('Boolean(document.querySelector(\'button[aria-label="文本"]\'))'),'画布创建');
  const canvasUrl=win.webContents.getURL();
  await run('document.querySelector(\'button[aria-label="文本"]\').click()');
  await until(()=>run('document.querySelectorAll("[data-node-id]").length===1'),'文本节点');
  if(!await run('Boolean(document.querySelector(\'[role="textbox"][aria-label="描述创作目标，或让我继续操作画布"]\'))'))await run('[...document.querySelectorAll("button")].find(b=>/Agent|助手|创作/.test((b.getAttribute("aria-label")||"")+b.textContent)).click()');
  await until(()=>run('Boolean(document.querySelector(\'[role="textbox"][aria-label="描述创作目标，或让我继续操作画布"]\'))'),'原生 Agent');
  assert.equal(await run('Boolean(document.querySelector(\'button[aria-label="Skill"]\'))'),true);
  const screenshotDir=path.resolve(__dirname,'../output/infinite-canvas-integration');fs.mkdirSync(screenshotDir,{recursive:true});
  async function capture(name){win.showInactive();await sleep(250);const image=await Promise.race([win.webContents.capturePage(),sleep(10000).then(()=>{throw Error('截图超时');})]);fs.writeFileSync(path.join(screenshotDir,name),image.toPNG());win.hide();}
  await capture('native-canvas-agent.png');
  const legacy=JSON.parse(fs.readFileSync(path.join(temporary,'legacy-workbench-state.json'),'utf8'));
  assert.equal(JSON.parse(legacy['jimeng-workbench-project']).migrationMarker,'legacy-state-preserved');
  await go('/jimeng');
  await until(()=>run('Boolean(window.personalWorkbench && document.querySelectorAll(".queue-item").length===2)'), '旧工作区状态导入');
  assert.equal(await run('JSON.parse(localStorage.getItem("jimeng-workbench-project")).migrationMarker'),'legacy-state-preserved');
  await go('/projects');
  await until(()=>run('document.querySelector("h1")?.textContent==="项目管理"'),'旧项目迁移后项目页');
  assert.equal(await run('getComputedStyle(document.querySelector("[data-rail-toggle]")).getPropertyValue("-webkit-app-region")'),'no-drag','功能导航按钮不被顶栏拖动区吞掉');
  await osClick('[data-rail-toggle]');await until(()=>run('!document.querySelector(".workbench-rail")'),'真实鼠标收起功能导航');
  await osClick('[data-rail-toggle]');await until(()=>run('Boolean(document.querySelector(".workbench-rail"))'),'真实鼠标展开功能导航');
  assert.notEqual(await run('getComputedStyle(document.querySelector(".workbench-rail")).getPropertyValue("-webkit-app-region")'),'drag','功能导航侧栏不拖动');await capture('native-nav-os-click.png');
  // Canvas persistence is debounced; wait for this project to reach IndexedDB before reloading.
  const canvasId=new URL(canvasUrl).pathname.split('/').pop();
  await until(()=>run('(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open("infinite-canvas");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});try{if(!db.objectStoreNames.contains("app_state"))return false;const val=await new Promise((res,rej)=>{const g=db.transaction("app_state","readonly").objectStore("app_state").get("infinite-canvas:canvas_store");g.onsuccess=()=>res(g.result);g.onerror=()=>rej(g.error)});return String(val).includes('+JSON.stringify(canvasId)+');}finally{db.close()}})()'),'画布项目落盘');
  // Return to the saved native canvas through a normal page load before testing its menu.
  await win.loadURL(canvasUrl);
  await until(()=>run('Boolean(document.querySelector(\'button[aria-label="打开画布菜单"]\'))'),'画布菜单恢复');
  await run('document.querySelector(\'button[aria-label="打开画布菜单"]\').click()');
  await until(()=>run('[...document.querySelectorAll("li")].some(n=>n.textContent.trim()==="项目管理")'),'画布内的项目入口');
  await run('[...document.querySelectorAll("li")].find(n=>n.textContent.trim()==="项目管理").click()');
  await until(()=>run('document.querySelector("h1")?.textContent==="项目管理"'),'原生项目管理');
  await run('document.querySelector("button[aria-label=新建项目]").click()');
  await until(()=>run('[...document.querySelectorAll(".ant-dropdown-menu-item")].some(item=>item.textContent.includes("即梦自动发送项目"))'),'新建项目菜单含即梦入口');
  await run('[...document.querySelectorAll(".ant-dropdown-menu-item")].find(item=>item.textContent.includes("即梦自动发送项目")).click()');
  await until(()=>run('document.querySelector(".ant-modal-title")?.textContent==="新建即梦自动发送项目"'),'即梦项目命名弹窗');
  await run('[...document.querySelectorAll(".ant-modal button")].find(b=>b.textContent.trim()==="选择已有文件夹…").click()');
  await until(()=>run('Boolean(window.personalWorkbench && document.querySelector("#workspaceView") && !document.querySelector("#workspaceView").hidden && document.querySelectorAll(".aw-card").length===2)'),'即梦项目与素材');
  assert.equal(await run('document.querySelectorAll(".queue-item").length'),2);
  assert.equal(await run('window.personalWorkbench.workbenchAssetContext().root'),project);
  assert.equal(await run('document.querySelectorAll("iframe,.scene-sidebar,.scene-brand").length'),0,'迁入功能不得恢复旧工作台外壳');
  assert.equal(await run('document.querySelector("#sourceText").value'),source);
  const material=await run('window.personalWorkbench.workbenchBuildExecutionMaterial()');assert.ok(material.lockedImages.length>=2);assert.ok(material.localFiles.length>=2);
  await capture('native-jimeng.png');
  assert.equal(await run('document.querySelectorAll("[data-shot-row]").length'),2,'即梦分镜行');
  assert.ok(await run('Boolean(document.querySelector("[data-shot-jump]"))'),'即梦分镜定位浮钮');
  await run('document.querySelector("[data-shot-jump] button")?.click()');await sleep(400);
  assert.ok(await run('document.querySelectorAll(".ant-popover .grid button").length>=2'),'即梦分镜定位弹层');
  await run('document.querySelector("[data-shot-jump] button")?.click()');await sleep(300);
  assert.equal(await run('Boolean(document.querySelector("[data-testid=canvas-target]"))'),false,'连接面板默认折叠');
  await clickText('即梦连接与目标');await until(()=>run('Boolean(document.querySelector(".legacy-slot .top-actions"))'),'顶部连接弹层');
  await clickText('即梦连接与目标');
  await run('document.querySelector("#promptPreview").dataset.probe="1"');
  await run('[...document.querySelectorAll("nav[aria-label=项目视图] a")].find(link=>link.textContent==="Elements").click()');
  await until(()=>run('Boolean(document.querySelector("[data-testid=project-library]"))'),'即梦内嵌 Elements');
  assert.equal(new URL(win.webContents.getURL()).pathname,'/jimeng','Elements 保留即梦页面');
  assert.equal(await run('document.querySelector("nav[aria-label=项目视图] [aria-current=page]").textContent'),'Elements','视图切换页签同步');
  assert.ok(await run('Boolean(document.querySelector("header.glass"))'),'Elements 下共用分镜顶栏');
  assert.equal(await run('document.querySelector("nav[aria-label=项目视图]").textContent.includes("资产库")'),false,'合并资产库入口');
  await run('[...document.querySelectorAll("nav[aria-label=项目视图] a")].find(link=>link.textContent==="分镜").click()');
  await until(()=>run('document.querySelectorAll("[data-shot-row]").length===2&&!document.querySelector("[data-shot-row]").closest(".hidden")&&!document.querySelector("[data-testid=project-library]")'),'返回即梦分镜');
  assert.equal(await run('document.querySelector("#promptPreview").dataset.probe'),'1','视图来回切换不重建分镜工作台');
  await clickText('即梦连接与目标');
  // Review a real six-image/two-audio group. The second group must keep its own assets even while the first is selected.
  fs.writeFileSync(path.join(project,'人物','小红.png'),png);
  for(const name of ['花园','厨房','庭院'])fs.writeFileSync(path.join(project,'场景',name+'.png'),png);
  fs.mkdirSync(path.join(project,'音频'));
  const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
  for(const name of ['阮乔','小红'])fs.writeFileSync(path.join(project,'音频',name+'.wav'),wav);
  const originalPrompt=await run('window.personalWorkbench.workbenchSegments()[0].prompt');
  const reviewPrompt=originalPrompt.replace('人物：阮乔','人物：阮乔、小红')+'\n参考场景：花园、厨房、庭院\n阮乔说你好，小红说你好';
  await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,'+JSON.stringify(reviewPrompt)+')');
  const store=require('./asset-store');
  for(const name of ['花园','厨房','庭院'])store.bind(project,'video:01:0','scenes','场景/'+name+'.png',false);
  await run('window.personalWorkbench.renderProjectAssetIndex('+JSON.stringify(project)+')');
  await until(()=>run('document.querySelectorAll("[data-review-asset]").length===8'),'完整六张图片和两个音频');
  assert.equal(await run('[...document.querySelectorAll("[data-review-filename]")].filter(el=>el.textContent.endsWith(".png")).length'),6,'第五、第六张不能被裁掉');
  assert.equal(await run('[...document.querySelectorAll("[data-review-filename]")].filter(el=>el.textContent.endsWith(".wav")).length'),2,'两个音频必须有真实文件名');
  await run('window.desktopBridge.cdpConfigure({mode:"cdp",targetId:"canvas-a"})');
  await until(()=>run('document.querySelector("[data-testid=canvas-target]").textContent.includes("本次目标：测试画布 A")'),'连接后的顶部目标同步');
assert.ok(await run('Boolean([...document.querySelectorAll("section[aria-label=本组提示词编辑区] button")].find(b=>b.textContent.trim()==="删除本组"))'),'左侧直接删除本组入口');
   for(const label of ['发送预览','复制全文','更多','已标记'])assert.equal(await run('[...document.querySelectorAll("[data-testid=segment-review] button")].some(b=>b.textContent.trim()==='+JSON.stringify(label)+')'),false,'移除 '+label);
   assert.ok(await run('[...document.querySelector("[data-testid=material-review-actions]").querySelectorAll("button")].some(b=>(b.textContent.trim() || b.ariaLabel || String()).trim()==="移出批次")'),'右侧直接移出批次');
   assert.equal(await run('[...document.querySelectorAll("[data-testid=segment-review] button")].some(b=>/核验/.test(b.textContent))'),false,'核验只出现在右侧素材卡');
  const actualReview=await run('window.personalWorkbench.workbenchReviewMaterial(0)');
  assert.deepEqual(actualReview.issues,[]);
  for(const name of ['花园','厨房','庭院'])assert.ok(actualReview.lockedImages.some(lock=>lock.anchor===name),'每张场景图必须定位自己的引用而非全堆在大厅');
  assert.equal(await run('window.personalWorkbench.workbenchPrefixTemplate()'),'测试存储的提示词内容：','初始化恢复已保存全局开头');
  assert.ok(actualReview.prompt.includes('提示词内容：'),'最终预览必须包含统一前置词');
  for(const lock of [...actualReview.lockedImages,...actualReview.lockedAudio])assert.equal(actualReview.prompt.slice(lock.offset-lock.anchor.length,lock.offset),lock.anchor,'最终引用偏移必须包括前置词');
  const other=await run('window.personalWorkbench.workbenchExecutionAssets("video:02:1")');
  assert.deepEqual(other.characters.map(asset=>asset.role),['阮乔'],'其他组不能误用选中组的小红');
  assert.deepEqual(other.audio.map(asset=>asset.role),['阮乔'],'其他组不能误用选中组的音频');
  assert.equal(actualReview.website,null,'本地匹配不能冒充官网已完成 @');
  assert.equal(await run('window.personalWorkbench.workbenchMarkReviewed(0,window.personalWorkbench.workbenchReviewMaterial(0).fingerprint).ok'),true);
  assert.equal(await run('window.personalWorkbench.workbenchReviewMaterial(0).reviewed'),true);
  await until(()=>run('Boolean(document.querySelector("#promptPreview[contenteditable=true]"))'),'直接输入提示词');
  await run('(()=>{const el=document.querySelector("#promptPreview[contenteditable=true]");el.textContent='+JSON.stringify(reviewPrompt+'\n新增动作')+';el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await until(()=>run('window.personalWorkbench.workbenchSegments()[0].prompt.endsWith("新增动作")'),'直接编辑进入真实视频组正文');
  assert.equal(await run('document.querySelector("[data-testid=segment-review] footer")'),null,'审阅底栏已移除');
  assert.equal(await run('document.querySelector("[data-testid=review-toolbar]")'),null,'顶部审阅工具栏已移除');
  assert.equal(await run('document.querySelector(".aw-at-picker").hidden'),true,'未输入 @ 时选择器默认收起');
   assert.equal(await run('[...document.querySelectorAll("[data-testid=segment-review] button")].some(b=>b.textContent.trim()==="调整素材")'),false,'调整素材入口移除');
   assert.ok(await run('(()=>{const editor=document.querySelector("#promptPreview"),panel=editor.closest("section"),r=editor.getBoundingClientRect(),p=panel.getBoundingClientRect();const bar=panel.firstElementChild.getBoundingClientRect();return r.top>=bar.bottom-1&&r.bottom>=p.bottom-16&&panel.scrollHeight<=panel.clientHeight+1;})()'),'提示词编辑器接在工具行下并占满左侧剩余空间');
   assert.ok(await run('[...document.querySelector("section[aria-label=本组完整素材清单]").querySelectorAll("button")].some(b=>(b.textContent.trim() || b.ariaLabel || String()).trim()==="@ 绑定图片 / 音频")'),'绑定入口在 02 素材区');
   assert.ok(await run('[...document.querySelector("section[aria-label=本组完整素材清单]").querySelectorAll("button")].some(b=>(b.textContent.trim() || b.ariaLabel || String()).trim()==="重新匹配本组")'),'重新匹配在 02 素材区');
   await clickText('@ 绑定图片 / 音频');
   await until(()=>run('!document.querySelector(".aw-at-picker").hidden&&document.querySelectorAll(".aw-at-row").length>0'),'素材区直接展开 @ 菜单');
   for(const category of ['人物','场景','音频']){
    await run('[...document.querySelectorAll(".aw-at-tab")].find(b=>b.textContent.startsWith('+JSON.stringify(category)+')).click()');
    await sleep(180);
    assert.ok(await run('!document.querySelector(".aw-at-picker").hidden&&[...document.querySelectorAll(".aw-at-tab")].some(b=>b.textContent.startsWith('+JSON.stringify(category)+')&&b.getAttribute("aria-pressed")==="true")'),'切换 '+category+' 后菜单保持展开');
    assert.ok(await run('document.querySelectorAll(".aw-at-row").length>0&&[...document.querySelectorAll(".aw-at-row small")].every(el=>el.textContent.includes('+JSON.stringify(category)+'))'),'分类结果正确 '+category);
   }
   await run('document.querySelector("section[aria-label=本组完整素材清单] h2").click()');
   assert.equal(await run('document.querySelector(".aw-at-picker").hidden'),true,'真正点击菜单外仍可收起');
   for(const name of ["小红-卫衣","小红-礼服"])fs.writeFileSync(path.join(project,"人物",name+".png"),png);
   await run("window.personalWorkbench.renderProjectAssetIndex("+JSON.stringify(project)+")");
   assert.equal(await run('Boolean(document.querySelector("button[aria-label=项目资产]"))'),false,'移除重复项目资产侧栏');
   assert.equal(await run('[...document.querySelector("aside[aria-label=视频组列表]").querySelectorAll("button")].some(b=>(b.textContent.trim() || b.ariaLabel || String()).trim()==="粘贴导入")'),false,'队列不再放重复导入入口');
   await run('(()=>{const el=document.querySelector("#promptPreview");el.textContent="人物：小红\\n@小红-卫";el.dispatchEvent(new Event("input",{bubbles:true}));el.focus();const range=document.createRange();range.setStart(el.firstChild,el.firstChild.textContent.length);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);el.dispatchEvent(new KeyboardEvent("keyup",{key:"卫",bubbles:true}));})()');
   await until(()=>run('Boolean([...document.querySelectorAll(".aw-at-row")].find(b=>b.textContent.includes("小红-卫衣")))&&!document.querySelector(".aw-at-picker").hidden'),'恢复行内 @ 图片选择');
   assert.ok(await run('document.querySelector(".aw-at-picker").getBoundingClientRect().height>0'),'选择器不能藏在旧工作台里');
   await run('[...document.querySelectorAll(".aw-at-row")].find(b=>b.textContent.includes("小红-卫衣")).click()');
   await until(()=>run('window.personalWorkbench.workbenchSegments()[0].prompt.includes("@小红-卫衣")'),'选择图片写入提示词');
   assert.equal(await run('window.personalWorkbench.workbenchSegments()[0].prompt.includes("@@")'),false,'替换完整查询不重复 @');
   assert.ok(await run('window.personalWorkbench.workbenchBuildExecutionMaterial(0).localFiles.some(file=>file.relativePath.includes("卫衣"))'),'选择的图片进入实际发送文件');
   await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,"【出场人物】\\n阮乔：开镜在场｜资产【小红-礼服】：礼服。\\n【声音锁定】\\n@阮乔｜声线：柔和。")');
   const aliased=await run('window.personalWorkbench.workbenchBuildExecutionMaterial(0)');
   assert.ok(aliased.lockedImages.some(lock=>lock.anchor==="小红-礼服"&&lock.relativePath.includes("礼服")),'角色不同名时按明确资产别名绑定');
   assert.ok(aliased.lockedAudio.some(lock=>lock.anchor==="@阮乔"),'声音锁定处产生真实音频引用');
   for(const lock of [...aliased.lockedImages,...aliased.lockedAudio])assert.equal(aliased.prompt.slice(lock.offset-lock.anchor.length,lock.offset),lock.anchor);
   await run('window.desktopBridge.assetBindCharacter('+JSON.stringify(project)+',"video:01:0","小红","",true,false)');
   for(const name of ["小红-卫衣","小红-礼服"])fs.unlinkSync(path.join(project,"人物",name+".png"));
   await run('window.personalWorkbench.renderProjectAssetIndex('+JSON.stringify(project)+')');
   await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,'+JSON.stringify(reviewPrompt)+')');

  await run('[...document.querySelectorAll("section[aria-label=本组提示词编辑区] button")].find(el=>el.textContent.trim()==="全局开头提示词").click()');
  await until(()=>run('Boolean(document.querySelector("textarea[aria-label=全局开头提示词]"))'),'全局开头编辑入口');
  await run('(()=>{const el=document.querySelector("textarea[aria-label=全局开头提示词]");Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set.call(el,"全局测试开头");el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await until(()=>run('window.personalWorkbench.workbenchReviewMaterial(1).prompt.startsWith("全局测试开头")'),'全局开头用于每个视频组');
  await until(async()=>(await readProject()).prefixTemplate==='全局测试开头','当前项目全局开头持久保存');
  assert.equal(await run('JSON.parse(localStorage.getItem("jimeng-workbench-project")).prefixTemplate'),'测试存储的提示词内容：','旧迁移快照不被当前项目覆盖');
  await run('window.personalWorkbench.workbenchUpdatePrefixTemplate("使用Seedance 2.0生成16:9横屏视频，以下提示词的全部内容你都要一比一全部复制粘贴使用，提示词内容：")');
  await run('document.querySelector(".ant-modal-wrap .ant-modal-close")?.click()');
  assert.equal(await run('window.personalWorkbench.workbenchReviewMaterial(0).reviewed'),false,'提示词变更必须使审阅失效');
  assert.equal(await run('window.personalWorkbench.workbenchMarkReviewed(0,'+JSON.stringify(actualReview.fingerprint)+').ok'),false,'旧清单不能被标记已审阅');
  await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,'+JSON.stringify(reviewPrompt)+')');
   await until(()=>run('["花园","厨房","庭院"].every(name=>[...document.querySelectorAll("#promptPreview [data-review-reference]")].some(el=>el.getAttribute("data-review-reference")==="场景/"+name+".png"))'),'正文中的真实引用锚点');
  assert.ok(await run('document.querySelector("#promptPreview").textContent.includes("参考场景")'),'程序化恢复正文也同步可见编辑器');
   const longReview=reviewPrompt.replace('参考场景：花园、厨房、庭院','参考场景：花园、厨房')+'\n'+('继续动作，保持连续。\n').repeat(90)+'参照【庭院】\n【声音锁定】\n@阮乔｜声线：柔和。';
   await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,'+JSON.stringify(longReview)+')');
   await until(()=>run('Boolean([...document.querySelectorAll("#promptPreview [data-review-reference]")].find(el=>el.getAttribute("data-review-reference")==="音频/阮乔.wav"))'),'长提示词图片和音频正文引用');
   await run('[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="@ 绑定图片 / 音频").scrollIntoView({block:"nearest"})');
   await clickText('@ 绑定图片 / 音频');
   await until(()=>run('!document.querySelector(".aw-at-picker").hidden'),'长稿从素材区打开 @ 不依赖末尾光标可见');
   assert.ok(await run('(()=>{const p=document.querySelector(".aw-at-picker").getBoundingClientRect();return p.top>=0&&p.bottom<=innerHeight&&p.left>=0&&p.right<=innerWidth;})()'),'长稿选择器仍在窗口内');
   await run('document.querySelector("section[aria-label=本组完整素材清单] h2").click()');
   const headingTop=await run('document.querySelector("section[aria-label=本组提示词编辑区]").getBoundingClientRect().top');
   for(const relative of ['场景/庭院.png','音频/阮乔.wav']){
    await run('(()=>{const editor=document.querySelector("#promptPreview");editor.scrollTop=0;const card=[...document.querySelectorAll("[data-review-asset]")].find(el=>el.getAttribute("data-review-asset")==='+JSON.stringify(relative)+');[...card.querySelectorAll("button")].find(el=>el.textContent.trim()==="定位引用").click();})()');
    await sleep(600);
    await until(()=>run('(()=>{const editor=document.querySelector("#promptPreview"),node=[...editor.querySelectorAll("[data-review-reference]")].find(el=>el.getAttribute("data-review-reference")==='+JSON.stringify(relative)+');const r=node.getBoundingClientRect(),v=editor.getBoundingClientRect();return editor.scrollTop>0&&r.top>=v.top&&r.bottom<=v.bottom;})()'),'定位 '+relative+' 只滚动正文');
    assert.equal(await run('document.querySelector("section[aria-label=本组提示词编辑区]").scrollTop'),0,'定位不滚走左侧标题');
    assert.equal(await run('document.querySelector("section[aria-label=本组提示词编辑区]").getBoundingClientRect().top'),headingTop,'编辑区保留原位');
   }
   await run('(()=>{const editor=document.querySelector("#promptPreview");editor.textContent='+JSON.stringify(longReview)+';editor.scrollTop=editor.scrollHeight;const card=[...document.querySelectorAll("[data-review-asset]")].find(el=>el.getAttribute("data-review-asset")==="场景/大厅.png");[...card.querySelectorAll("button")].find(el=>el.textContent.trim()==="定位引用").click();})()');
   await until(()=>run('getSelection().toString()==="大厅"&&document.querySelector("#promptPreview").scrollTop<50'),'未装饰的自动场景也定位正文原文');
   assert.equal(await run('document.querySelector("section[aria-label=本组提示词编辑区]").getBoundingClientRect().top'),headingTop,'普通文本锚点也不移动编辑区');
   await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,'+JSON.stringify(reviewPrompt)+');document.querySelector("#promptPreview").scrollTop=0');
   await until(()=>run('document.querySelector("#promptPreview").textContent.includes("参考场景")'),'定位验收恢复原正文');
  await run('[...document.querySelectorAll("[data-review-asset] button")].find(el=>el.textContent.trim()==="试听").click()');
  await until(()=>run('Boolean(document.querySelector("[data-review-asset] audio[src]"))'),'真实本地音频试听');
  await run('document.querySelector("[data-review-asset] button[aria-label^=放大]").click()');
  await until(()=>run('Boolean(document.querySelector("[role=dialog][aria-label=图片预览] img"))'),'原图放大');
  await run('document.querySelector("[role=dialog][aria-label=图片预览] img").click()');
  await until(()=>run('!document.querySelector("[role=dialog][aria-label=图片预览]")'),'点击放大图片自身返回');
  assert.equal(await run('getComputedStyle(document.querySelector("[data-review-asset]")).backgroundColor'),'rgb(255, 241, 245)','素材卡片浅粉色');
  assert.equal(await run('getComputedStyle(document.querySelector("[data-testid=segment-prompt-editor]")).backgroundColor'),'rgb(255, 255, 255)','提示词阅读区为白色');
  assert.equal(await run('document.querySelector("nav")?.textContent.includes("字字动画")'),false,'主导航移除动画入口');
  // 缺项占位卡 / 移出 / 恢复都走真实素材绑定通道。路人甲没有素材产出图片占位；路人乙有图无音频产出音频占位。
  assert.equal(await run('(()=>{const card=[...document.querySelectorAll("[data-review-asset]")].find(el=>el.getAttribute("data-review-asset").endsWith(".wav"));return getComputedStyle(card.parentElement).display;})()'),'grid','音频卡片容器为网格');
  fs.writeFileSync(path.join(project,'人物','路人乙.png'),png);
  await run('window.personalWorkbench.renderProjectAssetIndex('+JSON.stringify(project)+')');
  await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,'+JSON.stringify(reviewPrompt.replace('人物：阮乔、小红','人物：阮乔、小红、路人甲、路人乙'))+')');
  await until(()=>run('document.querySelectorAll("[data-review-placeholder]").length===2'),'缺图缺音频角色各出一张占位卡');
  assert.ok(await run('Boolean(document.querySelector("[data-review-placeholder=路人甲][data-placeholder-kind=image]"))'),'缺图角色出图片占位卡');
  assert.ok(await run('Boolean(document.querySelector("[data-review-placeholder=路人乙][data-placeholder-kind=audio]"))'),'缺音频角色出音频占位卡');
  await run('[...document.querySelectorAll("[data-review-placeholder] button")].find(b=>b.textContent.trim()==="＋绑定").scrollIntoView({block:"center"})');
  await run('[...document.querySelectorAll("[data-review-placeholder] button")].find(b=>b.textContent.trim()==="＋绑定").click()');
  await until(()=>run('!document.querySelector(".aw-at-picker").hidden'),'占位卡打开角色绑定');
  assert.equal(await run('document.querySelector(".aw-at-search").value'),'路人甲','绑定搜索预填角色名');
  await run('document.querySelector("section[aria-label=本组完整素材清单] h2").click()');
  assert.equal(await run('document.querySelector(".aw-at-picker").hidden'),true,'占位卡绑定可收起');
  await run('[...document.querySelectorAll("[data-review-placeholder=路人甲] button")].find(b=>b.textContent.trim()==="定位引用").click()');
  await until(()=>run('window.getSelection()?.toString()==="路人甲"'),'缺图占位卡定位到角色声明');
  await run('[...document.querySelectorAll("[data-review-placeholder=路人乙] button")].find(b=>b.textContent.trim()==="定位引用").click()');
  await until(()=>run('window.getSelection()?.toString()==="路人乙"'),'缺音频占位卡定位到角色行');
   // 人工审阅允许缺项；只上传已有素材，全部审阅结果写入当前分集。
   assert.ok(await run('window.personalWorkbench.workbenchReviewMaterial(0).issues.length>0'),'缺项仍可见');
   await run('[...document.querySelector("[data-testid=material-review-actions]").querySelectorAll("button")].find(b=>(b.textContent.trim() || b.ariaLabel || String()).includes("标记已审阅")).click()');
   await until(()=>run('window.personalWorkbench.workbenchSelectedIndex()===1&&window.personalWorkbench.workbenchReviewMaterial(0).reviewed'),'带缺项也能人工审阅并进入下一组');
   await clickText('全部审阅成功');
   await until(()=>run('[0,1].every(i=>window.personalWorkbench.workbenchReviewMaterial(i).reviewed)'),'全部审阅包含未选中的有缺项组');
   await until(async()=>(await readProject()).segments.every(s=>Boolean(s.reviewFingerprint)),'全部审阅在项目自己的存储中持久保存');
   await run('window.personalWorkbench.workbenchSelectSegment(0)');
   await until(()=>run('document.querySelectorAll("[data-review-placeholder]").length===2'),'审阅后缺项问号卡仍显示');
   assert.equal(await run('[...document.querySelector("[data-testid=material-review-actions]").querySelectorAll("button")].find(b=>(b.textContent.trim() || b.ariaLabel || String()).trim()==="发送本组").disabled'),false,'缺项不再禁用已审阅发送');
   autoFinishExecution=true;
   await run('[...document.querySelector("main>header").querySelectorAll("button")].find(b=>(b.textContent.trim() || b.ariaLabel || String()).trim()==="全部执行").click()');
   await until(()=>run('window.personalWorkbench.workbenchSegments().every(s=>s.status==="done")'),'顶部全部执行发送有缺项的两组');
   autoFinishExecution=false;
   assert.equal(approvedExecutions.length,2,'不是只发当前组');
   for(const payload of approvedExecutions){assert.ok([...payload.segment.lockedImages,...payload.segment.lockedAudio].every(l=>l.allowMissing===true&&!l.required),'人工批准传入画布缺项策略');assert.ok(payload.localFiles.every(f=>!f.relativePath.includes('路人甲')),'缺失素材不产生上传项');}
   await run('window.personalWorkbench.workbenchResetQueue({confirmReset:()=>true})');
   await until(()=>run('window.personalWorkbench.workbenchSegments().every(s=>s.status!=="done")'),'重置受控测试批次');

  await run('(()=>{const card=[...document.querySelectorAll("[data-review-asset]")].find(el=>el.getAttribute("data-review-asset")==="人物/阮乔.png");[...card.querySelectorAll("button")].find(el=>el.textContent.trim()==="移出").click();})()');
  await until(()=>run('Boolean(document.querySelector(".ant-popover .ant-popconfirm-buttons .ant-btn-primary, .ant-popconfirm .ant-btn-primary"))'),'移出确认弹层');
  await run('document.querySelector(".ant-popover .ant-popconfirm-buttons .ant-btn-primary, .ant-popconfirm .ant-btn-primary").click()');
  await until(()=>run('window.personalWorkbench.workbenchExecutionAssets("video:01:0").excluded.some(item=>item.role==="阮乔"&&item.reason==="本组不使用")'),'移出进入未发送清单');
  await until(()=>run('[...document.querySelectorAll("section[aria-label=本组完整素材清单] button")].some(b=>b.textContent.trim()==="恢复")'),'未发送清单出现恢复入口');
  await run('[...document.querySelectorAll("section[aria-label=本组完整素材清单] button")].find(b=>b.textContent.trim()==="恢复").click()');
  await until(()=>run('!window.personalWorkbench.workbenchExecutionAssets("video:01:0").excluded.some(item=>item.role==="阮乔")'),'恢复移出项');
  await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(0,'+JSON.stringify(reviewPrompt)+')');
  await until(()=>run('!document.querySelector("[data-review-placeholder]")'),'恢复正文后占位卡消失');
  fs.unlinkSync(path.join(project,'人物','路人乙.png'));
  await run('window.personalWorkbench.renderProjectAssetIndex('+JSON.stringify(project)+')');
  // 切换视频组后提示词锚定到【场景与连续状态】，不再从头开始。
  const anchorPrompt='【视频编号02】\n'+'承接说明行\n'.repeat(40)+'【场景与连续状态】\n场景：大厅。\n'+'补充行\n'.repeat(60);
  await run('window.personalWorkbench.workbenchUpdateSegmentPrompt(1,'+JSON.stringify(anchorPrompt)+')');
  await run('window.personalWorkbench.workbenchSelectSegment(1)');
  await until(()=>run('document.querySelector("[data-testid=segment-review]")?.textContent.includes("视频 02")'),'切到视频2');
  await until(()=>run('(()=>{const editor=document.querySelector("#promptPreview");if(!editor||editor.scrollTop<=0)return false;const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode,at=(n.textContent||"").indexOf("【场景与连续状态】");if(at<0)continue;const r=document.createRange();r.setStart(n,at);r.setEnd(n,at+2);return Math.abs(r.getBoundingClientRect().top-editor.getBoundingClientRect().top-12)<60;}return false;})()'),'切组后提示词锚定到场景与连续状态');
  await run('window.personalWorkbench.workbenchSelectSegment(0)');
  await until(()=>run('document.querySelector("[data-testid=segment-review]")?.textContent.includes("视频 01")'),'切回视频1');
  await clickText('即梦连接与目标');await run('document.querySelector("section[aria-label=本组完整素材清单]").scrollTop=0');await sleep(350);
  await capture('native-jimeng-review.png');
  const comfortDir=path.resolve(__dirname,'../output/comfort-batch-verification');fs.mkdirSync(comfortDir,{recursive:true});fs.copyFileSync(path.join(screenshotDir,'native-jimeng-review.png'),path.join(comfortDir,'jimeng-comfort.png'));

  // Dispatch through the real preload/backend with a controlled connector fixture, without submitting a paid task.
   finishExecution=null;executePayload=null;
  await run('window.__pendingNativeRun=window.personalWorkbench.workbenchRunCurrent().then(result=>window.__nativeRunResult=result);void 0');
  await until(()=>Boolean(finishExecution),'桌面实际执行通道');
  assert.equal(executePayload.mode,'queue');assert.match(executePayload.segment.prompt,/视频编号01/);
  await go('/projects');await until(()=>run('document.querySelector("h1")?.textContent==="项目管理"'),'执行中切回项目管理');
  // The automation runtime stays mounted while its page is hidden.
  assert.equal(await run('Boolean(window.personalWorkbench)'),true);
  assert.equal(await run('document.querySelector("#runStatus").textContent'),'运行中');
  const backgroundProject=path.join(temporary,'后台切换项目');fs.mkdirSync(backgroundProject);require('./asset-store').write(backgroundProject,{workspace:'jimeng',mode:'queue',modeLocked:true});fs.writeFileSync(path.join(backgroundProject,'.jimeng','draft.txt'),'视频编号03｜镜头01｜项目乙');
  await run('window.__runningProject=window.personalWorkbench;void 0');await go('/jimeng?project='+encodeURIComponent(backgroundProject));
  await until(()=>run('window.personalWorkbench?.workbenchAssetContext?.().root==='+JSON.stringify(backgroundProject)+' && document.querySelector("#promptPreview[contenteditable]")?.textContent.includes("项目乙")'),'甲运行时查看乙').catch(async error=>{console.error('Background switch state:',await run('JSON.stringify({url:location.href,context:window.personalWorkbench?.workbenchAssetContext?.(),roots:document.querySelectorAll("[data-personal-workbench-root]").length,body:document.body.innerText.slice(0,4000)})'),errors);throw error;});
  assert.equal(await run('window.__runningProject.workbenchRunStatus().running'),true,'切换不终止甲发送');
  await until(()=>run('[...document.querySelectorAll("[data-project-tab]")].some(n=>n.title==='+JSON.stringify(project)+' && Boolean(n.querySelector(".animate-spin")))'),'运行中的甲页签显示进度');
  await go('/jimeng?project='+encodeURIComponent(project));await until(()=>run('window.personalWorkbench===window.__runningProject && Boolean(document.querySelector("#runStatus"))'),'回到运行中的甲');
  finishExecution();await until(()=>run('Boolean(window.__nativeRunResult?.ok)'),'隐藏页面的队列继续运行');
  assert.equal(await run('document.querySelector("#runStatus").textContent'),'已发送');
  assert.equal(await run('window.personalWorkbench.workbenchReviewMaterial(0).website?.verified'),true,'官网引用状态必须来自执行器校验回执');
  await capture('native-projects.png');
  // Registering the same folder in the other scene must be rejected.
  assert.equal(await run('document.body.innerText.includes("字字动画项目")'),false,'项目管理移除动画创建入口');
  await win.loadURL(new URL('/typetale?project='+encodeURIComponent(project),canvasUrl).href);await until(()=>run('document.body.innerText.includes("这个文件夹已属于另一个场景")'),'历史工作区仍保护项目归属');
  const recent=await run('window.desktopBridge.readRecent()');assert.equal(recent.projects.length,2);assert.ok(recent.projects.every(p=>p.workspace==='jimeng'));
  await win.loadURL(new URL('/typetale?project='+encodeURIComponent(typetale),canvasUrl).href);
  await until(()=>run('document.querySelector(\'[data-testid="typetale-project-path"]\')?.textContent==='+JSON.stringify(typetale)),'原生字字动画项目');
  await run('document.querySelector(\'button[aria-label="项目设置"]\').click()');
  await until(()=>run('Boolean(document.querySelector(\'[data-testid="typetale-source"]\'))'),'项目设置抽屉');
  await run('(()=>{const el=document.querySelector(\'[data-testid="typetale-source"]\');Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set.call(el,"【视频编号01】测试创作");el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await clickText('解析分镜');
  await until(()=>run('document.querySelectorAll(\'[data-shot-row]\').length===1'),'字字动画分镜');
  assert.ok(await run('Boolean(document.querySelector("[data-shot-jump]"))'),'字字动画分镜定位浮钮');
  await run('document.querySelector("[data-shot-jump] button")?.click()');await sleep(400);
  assert.ok(await run('document.querySelectorAll(".ant-popover .grid button").length>=1'),'字字动画分镜定位弹层');
  await run('document.querySelector("[data-shot-jump] button")?.click()');await sleep(300);
  assert.equal(await run('typeof window.TypeTaleCore.compilePrompt'),'function');
  await clickText('保存工作区');await sleep(700);
  assert.equal(JSON.parse(fs.readFileSync(path.join(typetale,'.typetale/workbench.json'),'utf8')).shots.length,1);
  await run('document.querySelector(\'button[aria-label="模型通道"]\').click()');
  await until(()=>run('Boolean(document.querySelector(\'[data-testid="typetale-provider-kind"]\'))'),'模型通道抽屉');
  for(const id of ['typetale-provider-kind','typetale-provider-family','typetale-provider-plugin','typetale-provider-command','typetale-plugin-detail'])assert.equal(await run('Boolean(document.querySelector(\'[data-testid="'+id+'"]\'))'),true,id);
  await capture('native-automation.png');
  await go('/jimeng?project='+encodeURIComponent(project));await until(()=>run('window.personalWorkbench?.workbenchAssetContext?.().root==='+JSON.stringify(project)+' && document.querySelectorAll(".queue-item").length===2'),'回到原即梦项目');
  assert.equal(await run('document.querySelectorAll(".queue-item").length'),2);assert.equal(await run('window.personalWorkbench.workbenchAssetContext().root'),project);
  // Create a blank project, then bind original folders through the actual native dialog and preload.
  const blank=path.join(temporary,'新项目'),external=path.join(temporary,'原场景目录');fs.mkdirSync(blank);fs.mkdirSync(external);fs.writeFileSync(path.join(external,'新大厅.png'),png);fs.writeFileSync(path.join(external,'视频.mp4'),'excluded');fs.mkdirSync(path.join(external,'未高清'));fs.writeFileSync(path.join(external,'未高清','旧大厅.png'),png);
  choices.length=0;choices.push(blank,external);
  await go('/projects');await until(()=>run('Boolean(document.querySelector("button[aria-label=新建项目]"))'),'新建项目菜单入口');
  await run('document.querySelector("button[aria-label=新建项目]").click()');
  await until(()=>run('[...document.querySelectorAll(".ant-dropdown-menu-item")].some(item=>item.textContent.includes("即梦自动发送项目"))'),'新建即梦菜单项');
  await run('[...document.querySelectorAll(".ant-dropdown-menu-item")].find(item=>item.textContent.includes("即梦自动发送项目")).click()');
  await until(()=>run('document.querySelector(".ant-modal-title")?.textContent==="新建即梦自动发送项目"'),'新建即梦命名弹窗');
  await run('[...document.querySelectorAll(".ant-modal button")].find(b=>b.textContent.trim()==="选择已有文件夹…").click()');
  await until(()=>run('Boolean(document.querySelector("button[aria-label=绑定场景文件夹]"))'),'新项目直接进入目录绑定');
  assert.equal(new URL(win.webContents.getURL()).pathname,'/jimeng');
  await run('document.querySelector("button[aria-label=绑定场景文件夹]").click()');
  await until(()=>run('document.querySelector("[data-testid=library-gallery]").textContent.includes("新大厅")'),'原目录图片进入项目索引');
  assert.equal(await run('document.querySelector("[data-testid=project-library]").textContent.includes("生成结果")'),false,'即梦不展示视频素材及生成结果入口');
  const linked=await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")');assert.equal(linked.assets.length,1);assert.equal(store.inside(blank,linked.assets[0].relativePath),path.join(external,'新大厅.png'));assert.deepEqual(fs.readdirSync(blank),['.jimeng']);
  await capture('native-bound-folders.png');
  const bindingShots=path.resolve(__dirname,'../output/folder-bind-verification');fs.mkdirSync(bindingShots,{recursive:true});fs.copyFileSync(path.join(screenshotDir,'native-bound-folders.png'),path.join(bindingShots,'folder-index.png'));fs.copyFileSync(path.join(screenshotDir,'native-jimeng-review.png'),path.join(bindingShots,'pink-materials.png'));
  await win.reload();await until(()=>run('document.querySelector("[data-testid=library-gallery]")?.textContent.includes("新大厅")'),'重启页面仍读取绑定文件夹');
  await run('[...document.querySelectorAll("button")].find(button=>button.getAttribute("aria-label")==="解除绑定 原场景目录").click()');await until(()=>run('!document.querySelector("[data-testid=library-gallery]").textContent.includes("新大厅")'),'解除目录索引');assert.ok(fs.existsSync(path.join(external,'新大厅.png')));
  fs.writeFileSync(path.join(external,'保留大厅.png'),png);choices.push(external);
  await run("document.querySelector(\"button[aria-label=绑定场景文件夹]\").click()");
  await until(()=>run("document.querySelector(\"[data-testid=library-gallery]\")?.textContent.includes(\"保留大厅\")"),"重新绑定两张外层图");
  assert.equal((await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")')).assets.length,2);
  await run("[...document.querySelectorAll(\"input\")].find(el=>el.getAttribute(\"aria-label\")===\"选择 新大厅\").click()");
  await clickText("清空所选");await until(()=>run("document.body.textContent.includes(\"清空所选 1 个素材引用？\")"),"所选清空确认");
  await clickText("取消");assert.equal((await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")')).assets.length,2);
  await clickText("清空所选");await clickText("清空引用");
  await until(()=>run("!document.querySelector(\"[data-testid=library-gallery]\").textContent.includes(\"新大厅\")"),"仅移除选中引用");
  assert.ok(fs.existsSync(path.join(external,"新大厅.png")));assert.equal((await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")')).assets.length,1);
  await win.reload();await until(()=>run("document.querySelector(\"[data-testid=library-gallery]\")?.textContent.includes(\"保留大厅\")"),"所选清空刷新持久化");
  await run("(()=>{const el=document.querySelector(\"input[aria-label=搜索资产]\");Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,\"value\").set.call(el,\"没有匹配\");el.dispatchEvent(new Event(\"input\",{bubbles:true}));})()");
  await clickText("全部清空");await until(()=>run("document.body.textContent.includes(\"清空全部素材引用？\")"),"全部清空确认");await clickText("清空引用");
  await until(async()=>(await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")')).assets.length===0,"全部清空忽略筛选");
  assert.ok(fs.existsSync(path.join(external,"保留大厅.png")));assert.ok(fs.existsSync(path.join(external,"未高清","旧大厅.png")));assert.equal(store.read(blank).folderLinks.length,0);
  await win.reload();await until(()=>run('Boolean(document.querySelector("button[aria-label=选择场景图片]"))'),'选文件入口重载');
  choices.push([path.join(external,'新大厅.png'),path.join(external,'保留大厅.png')]);
  await run('document.querySelector("button[aria-label=选择场景图片]").click()');
  await until(async()=>(await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")')).assets.length===2,'原生对话框多选图片');
  assert.deepEqual((await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")')).assets.map(item=>item.sourcePath).sort(),[path.join(external,'新大厅.png'),path.join(external,'保留大厅.png')].sort());
  fs.writeFileSync(path.join(external,'对白.wav'),wav);choices.push([path.join(external,'对白.wav')]);await run('document.querySelector("button[aria-label=选择音频文件]").click()');
  await until(async()=>(await run('window.desktopBridge.assetList('+JSON.stringify(blank)+',"")')).assets.length===3,'原生对话框引用音频');
  assert.equal(await run('document.querySelectorAll(".ant-tree-treenode-switcher-close").length'),0,'绑定目录默认展开');
  assert.ok(await run('document.querySelector("[data-testid=library-toolbar]").getBoundingClientRect().height<=48'),'素材工具栏保持单行');
  await capture("native-clear-materials.png");
  const compactShots=path.resolve(__dirname,"../output/compact-review-verification");fs.mkdirSync(compactShots,{recursive:true});fs.copyFileSync(path.join(screenshotDir,"native-clear-materials.png"),path.join(compactShots,"elements.png"));fs.copyFileSync(path.join(screenshotDir,"native-jimeng-review.png"),path.join(compactShots,"review.png"));
  const clearShots=path.resolve(__dirname,"../output/material-clear-verification");fs.mkdirSync(clearShots,{recursive:true});fs.copyFileSync(path.join(screenshotDir,"native-clear-materials.png"),path.join(clearShots,"cleared.png"));

  const groupFixture=require('./video-group-import-fixture.cjs');
  await run('[...document.querySelectorAll("nav[aria-label=项目视图] a")].find(link=>link.textContent==="分镜").click()');
  await until(()=>run('Boolean(document.querySelector("button[aria-label=整稿导入]"))'),'导入前进入空白分镜');
  await run('document.querySelector("button[aria-label=整稿导入]").click()');await clickText('粘贴导入视频组');
  await until(()=>run('Boolean(document.querySelector("textarea[aria-label=批量粘贴视频组]"))'),'可见粘贴导入渠道');
  await run('(()=>{const el=document.querySelector("textarea[aria-label=批量粘贴视频组]");Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set.call(el,'+JSON.stringify(groupFixture.markdown)+');el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await until(()=>run('document.querySelector("[data-testid=video-group-import-count]")?.textContent.includes("2 个")'),'粘贴实时识别25与26');
  const groupShots=path.resolve(__dirname,'../output/group-import-verification');fs.mkdirSync(groupShots,{recursive:true});
  await capture('native-group-import-preview.png');fs.copyFileSync(path.join(screenshotDir,'native-group-import-preview.png'),path.join(groupShots,'import-preview.png'));
  await clickText('导入 2 个视频组');
  await until(()=>run('window.personalWorkbench.workbenchSegments().some(group=>group.id==="26")'),'两组导入实际队列');
  const imported=await run('window.personalWorkbench.workbenchSegments().filter(group=>["25","26"].includes(group.id))');
  assert.deepEqual(imported.map(group=>({id:group.id,prompt:group.prompt})),[{id:'25',prompt:groupFixture.g25},{id:'26',prompt:groupFixture.g26}]);
  await win.reload();await until(()=>run('window.personalWorkbench?.workbenchSegments().some(group=>group.id==="26")'),'导入持久化恢复');
  assert.equal(await run('window.personalWorkbench.workbenchSegments().find(group=>group.id==="25").prompt'),groupFixture.g25);
  await until(()=>run('Boolean(document.querySelector("[data-testid=segment-review]"))'),'重载后的审阅界面就绪');
  const beforePanel=await run('document.querySelector("[data-testid=segment-review]").getBoundingClientRect().width');
  await run('document.querySelector("button[aria-label=批量操作]").click()');
  await until(()=>run('document.querySelector("[data-testid=floating-side-panel]")?.getBoundingClientRect().width>0'),'批量操作独立浮层');
  assert.equal(await run('document.querySelector("[data-testid=segment-review]").getBoundingClientRect().width'),beforePanel,'浮层展开不挤压工作区域');
  await capture('native-floating-panel.png');fs.copyFileSync(path.join(screenshotDir,'native-floating-panel.png'),path.join(groupShots,'floating-panel.png'));
  await run('document.querySelector("[data-testid=floating-side-panel] button[aria-label=关闭]").click()');
  await until(()=>run('document.querySelector("[data-testid=floating-side-panel]").getBoundingClientRect().width===0'),'浮层关闭');
  await run('document.querySelector("button[aria-label=整稿导入]").click()');await clickText('粘贴导入视频组');
  await until(()=>run('Boolean(document.querySelector("textarea[aria-label=批量粘贴视频组]"))'),'再次打开导入');
  await run('(()=>{const el=document.querySelector("textarea[aria-label=批量粘贴视频组]");Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set.call(el,'+JSON.stringify(groupFixture.markdown)+');el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await until(()=>run('[...document.querySelectorAll(".ant-modal button")].some(button=>button.textContent.trim()==="导入 2 个视频组"&&button.disabled)'),'重复编号不能误追加');
  await run('[...document.querySelectorAll(".ant-modal button")].find(button=>button.textContent.replaceAll(" ","")==="取消").click()');

  // The merged 新建项目 menu also creates named video-studio and canvas projects.
  await go('/projects');await until(()=>run('document.querySelector("h1")?.textContent==="项目管理"'),'回到项目管理建视频项目');
  await run('document.querySelector("button[aria-label=新建项目]").click()');
  await until(()=>run('[...document.querySelectorAll(".ant-dropdown-menu-item")].some(item=>item.textContent.includes("视频创作台项目"))'),'视频创作台项目菜单项');
  await run('[...document.querySelectorAll(".ant-dropdown-menu-item")].find(item=>item.textContent.includes("视频创作台项目")).click()');
  await until(()=>run('Boolean(document.querySelector("input[aria-label=新项目名称]"))'),'视频项目命名弹窗');
  await run('(()=>{const el=document.querySelector("input[aria-label=新项目名称]");Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(el,"UI 测试视频项目");el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await run('[...document.querySelectorAll(".ant-modal button")].find(button=>button.textContent.trim()==="创建并打开").click()');
  await until(()=>run('location.pathname==="/video"'),'创建后进入视频创作台');
  await until(()=>run('document.body.innerText.includes("UI 测试视频项目")'),'新视频项目已创建并被选中');
  await go('/projects');await until(()=>run('document.querySelector("h1")?.textContent==="项目管理"'),'回到项目管理建画布项目');
  await run('document.querySelector("button[aria-label=新建项目]").click()');
  await until(()=>run('[...document.querySelectorAll(".ant-dropdown-menu-item")].some(item=>item.textContent.includes("画布项目")&&!item.className.includes("disabled"))'),'画布项目菜单项可用');
  await run('[...document.querySelectorAll(".ant-dropdown-menu-item")].find(item=>item.textContent.includes("画布项目")).click()');
  await until(()=>run('Boolean(document.querySelector("input[aria-label=新项目名称]"))'),'画布项目命名弹窗');
  await run('[...document.querySelectorAll(".ant-modal button")].find(button=>button.textContent.trim()==="创建并打开").click()');
  await until(()=>run('/^\\/canvas\\/[^/]+$/.test(location.pathname)'),'创建后进入新画布');

  // 即梦自动发送项目也可以按名字新建：主进程在数据目录下建空文件夹并直接进入 Elements 绑定。
  await go('/projects');await until(()=>run('document.querySelector("h1")?.textContent==="项目管理"'),'回到项目管理建即梦项目');
  await run('document.querySelector("button[aria-label=新建项目]").click()');
  await until(()=>run('[...document.querySelectorAll(".ant-dropdown-menu-item")].some(item=>item.textContent.includes("即梦自动发送项目"))'),'即梦命名菜单项');
  await run('[...document.querySelectorAll(".ant-dropdown-menu-item")].find(item=>item.textContent.includes("即梦自动发送项目")).click()');
  await until(()=>run('document.querySelector(".ant-modal-title")?.textContent==="新建即梦自动发送项目"'),'即梦项目命名弹窗打开');
  await run('(()=>{const el=document.querySelector("input[aria-label=新项目名称]");Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set.call(el,"UI 测试即梦项目");el.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await run('[...document.querySelectorAll(".ant-modal button")].find(button=>button.textContent.trim()==="创建并打开").click()');
  const createdDir=path.join(temporary,'jimeng-projects','UI 测试即梦项目');
  await until(()=>fs.existsSync(createdDir),'主进程已建项目文件夹');
  await until(()=>run('location.pathname==="/jimeng"&&new URLSearchParams(location.search).get("view")==="elements"'),'新建即梦项目进入 Elements 绑定');
  const createdRecent=await run('window.desktopBridge.readRecent()');
  assert.ok(createdRecent.projects.some(item=>item.path===createdDir&&item.workspace==='jimeng'),'新建即梦项目已登记项目列表');

  await run('window.open(location.origin+"/projects","_blank")');await sleep(100);assert.equal(BrowserWindow.getAllWindows().length,1);
  const origin=new URL(canvasUrl).origin;
  await win.loadURL(canvasUrl);
  await until(()=>run('document.querySelectorAll("[data-node-id]").length===1'),'重新加载保留原生画布');
  assert.equal(services[0].child.pid,pid);assert.equal(services[0].webChild.pid,frontendPid);
  await run('window.location.href="https://example.com";void 0');await sleep(200);assert.equal(new URL(win.webContents.getURL()).origin,origin,'外部网页不能继承桌面权限');
  assert.deepEqual(errors,[],'原生界面不能有运行错误');
  console.log('原生本体验收通过：主页面零 iframe、画布/文本/Agent/Skill、原生项目管理、场景隔离、素材绑定、实际执行 IPC、跨页继续运行、字字动画 API/插件/CLI 控件与状态落盘、刷新持久化与导航权限。');
 }catch(error){exitCode=1;console.error(error);}
 app.exit(exitCode);
});
