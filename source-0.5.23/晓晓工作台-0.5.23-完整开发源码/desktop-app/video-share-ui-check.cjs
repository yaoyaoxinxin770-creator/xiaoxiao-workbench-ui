const {app,BrowserWindow,dialog}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {InfiniteCanvasService}=require('./infinite-canvas-service');const Original=InfiniteCanvasService;let service;require('./infinite-canvas-service').InfiniteCanvasService=class extends Original{constructor(options){super({...options,port:0,backendPort:0});service=this;}};
for(const module of ['pippit-service','dreamina-service','dreamina-canvas-service']){const Service=Object.values(require('./'+module))[0];for(const method of ['submit','prepare','confirm'])Service.prototype[method]=async()=>{throw Error('分享验收禁止生成');};Service.prototype.status=async()=>({installed:true,logged_in:false});Service.prototype.credits=async()=>{throw Error('测试账号未登录');};Service.prototype.describe=async()=>({model:'seedance2.0',references:{images:9,videos:3,audios:3,maxDurationMs:15000},ratio:{default:'16:9',options:['16:9']},duration:{default:5,min:5,max:15,step:1},resolution:{options:['720p']},time:{min:5,max:15},ratios:['16:9']});Service.prototype.models=async()=>({models:[],modelCapabilities:{}});}
app.disableHardwareAcceleration();app.on('browser-window-created',(_event,win)=>{win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error('Renderer:',message);});win.webContents.on('render-process-gone',(_event,details)=>console.error('Renderer exit',details));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+40000;while(Date.now()<end){if(await fn())return;await sleep(100);}console.error('UI facts',await BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript('({text:document.body.innerText,prompt:document.querySelector("[data-prompt-reference-editor]")?.value,refs:document.querySelector("[aria-label=视频参考素材]")?.outerHTML})'));throw Error('等待超时：'+label);}
require('./video-share-v2-main.cjs');
app.whenReady().then(async()=>{let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/video')&&!w.webContents.isLoading());return !!win;},'视频窗口');const js=code=>win.webContents.executeJavaScript(code,true);try{await until(()=>js('!!document.querySelector("[data-video-studio]") && !!document.querySelector("button[aria-label=视频选择操作]")'),'视频创作台初始化');}catch(e){console.error(await js('document.body.innerText'));throw e;}
 await until(()=>js('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("新建项目")&&!b.disabled)'), '本地项目和交互就绪');
 const facts=await js(`(()=>({selectionInHeader:!!document.querySelector('button[aria-label=视频选择操作]')?.closest('header'),links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),projectOptions:document.querySelector('[aria-label="选择视频项目"]')?.textContent,keys:[...Object.keys(localStorage)].filter(k=>/config|session|user/i.test(k)).map(k=>[k,localStorage.getItem(k)]),assets:document.querySelector('[data-video-results-scroll]')?.innerText,bridge:Object.keys(window.desktopBridge),title:document.title}))()`);
 assert.equal(facts.selectionInHeader,true);assert.equal(await js(`document.querySelector('[aria-label="视频生成渠道"]').innerText.includes("其他渠道")`),false);assert.equal(await js(`document.querySelector('[aria-label="视频生成渠道"]').querySelectorAll("button").length`),2);for(const method of ['dreaminaPrepare','dreaminaConfirm','pippitCanvasConfigure','videoStudioWrite','localVideoTaskStates'])assert.ok(facts.bridge.includes(method));assert.match(facts.title,/视频创作台/);assert.ok(!facts.links.some(h=>/^\/(canvas|jimeng|projects|image|admin|login)(\/|$)/.test(h)),JSON.stringify(facts.links));assert.match(facts.assets,/这里还没有视频/);assert.ok(!facts.bridge.includes('legacyWorkbenchState'));assert.ok(!facts.bridge.includes('cdpConfigure'));for(const [key,value]of facts.keys){const parsed=JSON.parse(value);if(key.includes('config'))assert.equal(parsed.state.config.apiKey,'');if(key.includes('user'))assert.ok(!parsed.state.token);}

 await js('document.querySelector("button[aria-label=切换皮肤]").click()');await until(()=>js('document.querySelector(".ant-modal-title")?.textContent==="工作台皮肤"'),'皮肤选项');
 await js('[...document.querySelectorAll(".ant-segmented-item")].find(e=>e.textContent==="黑色").click()');await until(()=>js('document.documentElement.classList.contains("dark")'),'黑色皮肤');
 await js('[...document.querySelectorAll(".ant-segmented-item")].find(e=>e.textContent==="白色").click()');await until(()=>js('!document.documentElement.classList.contains("dark")'),'白色皮肤');await js('document.querySelector(".ant-modal-close").click()');
 await js('[...document.querySelectorAll("[aria-label=视频生成渠道] button")].find(b=>b.textContent==="即梦 CLI").click()');await until(()=>js('[...document.querySelectorAll("[aria-label=视频生成渠道] button")].some(b=>b.textContent==="即梦 CLI"&&b.getAttribute("aria-pressed")==="true")'),'即梦渠道独立切换');
 await js('[...document.querySelectorAll("[aria-label=视频生成渠道] button")].find(b=>b.textContent==="小云雀").click()');await until(()=>js('[...document.querySelectorAll("[aria-label=视频生成渠道] button")].some(b=>b.textContent==="小云雀"&&b.getAttribute("aria-pressed")==="true")'),'返回小云雀渠道');
 // Import a recipient-owned reference through the native file dialog and retain @ matching.
 const image=path.join(process.env.VIDEO_STUDIO_TEST_PROFILE,'测试场景.png');fs.writeFileSync(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[image]});
 await js('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Elements 素材")).click()');
 await until(()=>js('!!document.querySelector("[data-elements-toolbar]")'),'素材入口');
 const menu=async label=>{await js('[...document.querySelectorAll("[data-elements-toolbar] button")].find(b=>b.textContent.includes("添加素材")).click()');await until(()=>js('!!document.querySelector(".ant-dropdown-menu")'),'导入菜单');await js('[...document.querySelectorAll(".ant-dropdown-menu-item")].find(item=>item.textContent==='+JSON.stringify(label)+').click()');};
 await menu('导入选定文件');
 await until(()=>js('document.querySelector("[data-video-results-scroll]").innerText.includes("测试场景")'),'导入好友自己的素材');
 assert.ok(fs.existsSync(path.join(process.env.VIDEO_STUDIO_TEST_PROFILE,'local-asset-links.json')));
 assert.equal(await js('document.querySelector("[data-elements-header]").getBoundingClientRect().height<64'),true,'工具栏只有一行');
 assert.equal(await js('document.querySelector("[data-video-elements]").innerText.includes("引用本地文件")'),false,'消除重复导入行');
 const folder=path.join(process.env.VIDEO_STUDIO_TEST_PROFILE,'导入素材'),character=path.join(folder,'人物','角色.png'),audio=path.join(folder,'音频','角色.wav');
 fs.mkdirSync(path.dirname(character),{recursive:true});fs.mkdirSync(path.dirname(audio),{recursive:true});fs.copyFileSync(image,character);
 fs.writeFileSync(audio,Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=','base64'));
 fs.writeFileSync(path.join(folder,'说明.txt'),'非素材文件');
 dialog.showOpenDialog=async(_win,options)=>{assert.ok(options.properties.includes('openDirectory'));return {canceled:false,filePaths:[folder]};};
 await menu('导入整个文件夹');
 await until(()=>js('document.querySelectorAll("[data-element-card]").length===3'),'递归导入图片和音频');
 assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(process.env.VIDEO_STUDIO_TEST_PROFILE,'local-asset-links.json'),'utf8'))).length,3);
 assert.equal(await js('[...document.querySelectorAll("[data-element-name]")].filter(section=>section.querySelector("h3")?.textContent==="角色").reduce((count,section)=>count+section.querySelectorAll("[data-element-card]").length,0)'),2,'同名角色图片与音频分别按分类整理并保留');
 assert.equal(await js('!!document.querySelector("[data-element-outline]")'),true);
 // Names appear on hover; the jump scrolls the asset pane rather than the entire application.
 win.show();win.focus();win.moveTop();await until(()=>win.isFocused(),"悬停测试窗口已激活");await sleep(200);
 await until(async()=>{
  const outline=await js('(()=>{const node=document.querySelector("[data-element-outline]"),r=node.getBoundingClientRect();return {x:Math.round(r.x+5),y:Math.round(r.y+8)};})()');
  win.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});win.webContents.sendInputEvent({type:'mouseMove',...outline});
  await sleep(120);
  return js('getComputedStyle(document.querySelector("[data-element-outline] button span:last-child")).display!=="none"');
 },'原生鼠标悬停展示名称');
 await js('document.querySelector("[data-element-outline] button").click()');
 assert.equal(await js('!!document.querySelector("[data-prompt-reference-editor]")'),true,'Elements 切换保留创作输入区');
 const setText=async(label,value)=>js('(()=>{const el=document.querySelector("[aria-label='+label+']");Object.getOwnPropertyDescriptor(el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,"value").set.call(el,'+JSON.stringify(value)+');el.dispatchEvent(new Event("input",{bubbles:true}));})()');
 const click=async text=>js('[...document.querySelectorAll("button")].find(button=>button.textContent.replaceAll(" ","").trim()==='+JSON.stringify(text)+').click()');
 await click('全部视频0');await js('document.querySelector("button[title=添加文件夹]").click()');await until(()=>js('!!document.querySelector("[aria-label=项目或文件夹名称]")'),'添加视频文件夹');
 await setText('项目或文件夹名称','第6集');await click('保存');
 await until(()=>js('!!document.querySelector("button[aria-label=\'重命名文件夹 第6集\']")'),'紧凑重命名图标');assert.equal(await js('document.body.innerText.includes("重命名当前文件夹")'),false);
 await click('导入视频组');await until(()=>js('!!document.querySelector("[aria-label=粘贴视频组总稿]")'),'整稿导入');
 const source='【视频编号25｜第25组】\n总时长：14.8秒\n【场景与连续状态】\n场景：测试场景。\n【出场人物】\n角色：资产【角色】\n【声音锁定】\n@角色｜声线：清亮\n\n【视频编号26｜第26组】\n【出场人物】\n缺图：资产【缺图】';
 await setText('粘贴视频组总稿',source);await until(()=>js('document.body.innerText.includes("识别到 2 组")'),'识别多组');await click('导入2组');
 await until(()=>js('document.querySelectorAll("[data-video-group]").length===2'),'视频组保存到当前文件夹');
 await js("[...document.querySelectorAll(\"[data-video-group=\\\"25\\\"] button\")].find(b=>b.textContent.includes(\"载入本组\")).click()");
 await until(()=>js('document.querySelector("[data-prompt-reference-editor]").dataset.value.includes("视频编号25") && document.querySelectorAll("[aria-label=视频参考素材] img").length===2 && document.querySelector("[aria-label=视频参考素材]").innerText.includes("角色")'),'载入视频组自动匹配场景、人物和声音');
 assert.equal(await js('document.querySelector("[data-prompt-reference-editor]").dataset.value.includes("视频编号26")'),false,'分组正文保持完整独立');
 await js("[...document.querySelectorAll(\"[data-video-group=\\\"26\\\"] button\")].find(b=>b.textContent.includes(\"载入本组\")).click()");
 await until(()=>js('document.querySelector("[data-prompt-reference-editor]").dataset.value.includes("视频编号26") && document.querySelector("[data-match-issues]")?.innerText.includes("缺图")'),'缺图显示问号且上一组引用清空');
 assert.equal(await js('document.querySelectorAll("[aria-label=视频参考素材] img").length'),0,'每组引用独立');
 win.webContents.reload();await until(()=>!win.webContents.isLoading()&&js('document.querySelectorAll("[data-video-group]").length===2 && [...document.querySelectorAll("button")].some(b=>b.textContent.includes("导入视频组")&&!b.disabled)'),'重启恢复文件夹队列');
 await click('Elements素材');await until(()=>js('document.querySelectorAll("[data-element-card]").length===3 && !!document.querySelector("[data-elements-toolbar]") && getComputedStyle(document.querySelector("[data-elements-header]")).display!=="none"'),'重启恢复导入素材');await sleep(350);
 const output=path.resolve(__dirname,'../output/studio-redesign');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'elements-native.png'),(await win.webContents.capturePage()).toPNG());
 assert.ok(fs.existsSync(path.join(process.env.VIDEO_STUDIO_TEST_PROFILE,'local-asset-links.json')));assert.equal(app.getPath('userData'),process.env.VIDEO_STUDIO_TEST_PROFILE);fs.writeFileSync(path.join(process.env.VIDEO_STUDIO_TEST_PROFILE,'verified.txt'),'独立视频创作台界面验收通过：全选归位、仅视频入口、空白隐私配置、本地素材可引用。');service.stop();win.destroy();app.exit(0);
}).catch(error=>{console.error(error.stack);service?.stop();app.exit(1);});
