const {app,BrowserWindow,ipcMain,dialog,shell,Menu,screen,Tray,nativeImage}=require('electron');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http');
app.setName('晓晓视频创作台');
const storage=require('./video-share-storage.cjs').configureShareStorage(app),profile=storage.data;
if(!app.requestSingleInstanceLock()){app.quit();return;}
app.setAppUserModelId('local.xiaoxiao.video.studio.share');
const {InfiniteCanvasService}=require('./infinite-canvas-service'),{PippitService}=require('./pippit-service'),{DreaminaService}=require('./dreamina-service');
const {DreaminaCanvasService,DreaminaRouter}=require('./dreamina-canvas-service');
const {PippitCanvasService}=require('./pippit-canvas-service'),{PippitCanvasBroker}=require('./pippit-canvas-broker'),{PippitCanvasGeneration}=require('./pippit-canvas-generation');
const {LocalAssetLinks}=require('./local-asset-links'),{VideoStudioFiles}=require('./video-studio-files');
const resources=app.isPackaged?process.resourcesPath:__dirname;
const canvas=new InfiniteCanvasService({runtimeDir:path.join(resources,'infinite-canvas-runtime'),webDir:path.join(resources,'video-studio-web'),dataDir:path.join(profile,'runtime'),port:0,backendPort:0,entryPath:'/video',shell});
const pippit=new PippitService({executable:path.join(resources,'pippit-runtime','pippit-tool-cli.exe'),dataDir:path.join(profile,'pippit')});
const legacy=new DreaminaService({executable:path.join(resources,'dreamina-runtime','dreamina.exe'),dataDir:path.join(profile,'dreamina')});
const modern=new DreaminaCanvasService({executable:path.join(resources,'dreamina-canvas-runtime','dreamina-canvas.exe'),dataDir:path.join(profile,'dreamina-canvas')});
const dreamina=new DreaminaRouter({canvas:modern,legacy});
const pippitCanvas=new PippitCanvasService({pippit,dataDir:path.join(profile,'pippit-canvas'),canvasEntry:path.join(resources,'pippit-canvas-runtime','run.cjs')});
const broker=new PippitCanvasBroker(),generation=new PippitCanvasGeneration({pippit,canvas:pippitCanvas,broker});
let win,origin='',initializing=true;
const links=new LocalAssetLinks(path.join(profile,'local-asset-links.json'),()=> 'http://127.0.0.1:'+bridge.address().port);
const files=new VideoStudioFiles(path.join(profile,'video-studio','projects'),{origin:()=> 'http://127.0.0.1:'+bridge.address().port,userDataDir:profile});
function trusted(event){if(!origin||event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==origin)throw Error('不允许的调用来源');}
const actions={
 dreaminaStatus:v=>dreamina.status(v),dreaminaCredits:v=>dreamina.credits(v),dreaminaLogin:v=>dreamina.login(v),dreaminaCheckLogin:v=>dreamina.checkLogin(v),dreaminaModels:v=>dreamina.models(v),dreaminaDescribe:(m,v)=>dreamina.describe(m,v),dreaminaSubmit:p=>dreamina.submit(p),dreaminaPrepare:p=>dreamina.prepare(p),dreaminaConfirm:p=>dreamina.confirm(p),dreaminaQuery:id=>dreamina.query(id),
 pippitStatus:()=>pippit.status(),pippitCredits:()=>pippit.credits(),pippitLogin:()=>pippit.login(),pippitModels:()=>pippit.models(),pippitDescribe:(m,t)=>pippit.describe(m,t),pippitSubmit:p=>p.type==='video'&&p.projectKey?generation.submit(p):pippit.submit(p),pippitQuery:async id=>(await pippit.read(pippit.taskDir(id)))?.canvasTarget?generation.query(id):pippit.query(id),
 pippitCanvasSettings:k=>generation.settings(k),pippitCanvasConfigure:async p=>{await pippitCanvas.configure(p);return generation.settings(p.projectKey);},pippitCanvasSync:p=>pippitCanvas.sync(p),
 localVideoTaskStates:async ids=>{if(!Array.isArray(ids)||ids.length>1000)throw Error('任务状态查询数量无效');return Promise.all(ids.map(async id=>{const s=typeof id==='string'&&id.startsWith('pippit:')?pippit:typeof id==='string'&&id.startsWith('dreamina-canvas:')?modern:typeof id==='string'&&id.startsWith('dreamina:')?legacy:null;if(!s)throw Error('任务类型无效');const t=await s.read(s.taskDir(id));return {id,status:t?.status||'missing'};}));},
 infiniteCanvasStatus:()=>canvas.status(),infiniteCanvasOpenDataDir:()=>canvas.openDataDir(),
 videoStudioSync:p=>files.sync(p),videoStudioWrite:p=>files.write(p),videoStudioVideoInfo:p=>files.videoInfo(p),videoStudioResolve:p=>files.resolveVideo(p),videoStudioMove:p=>files.move(p),videoStudioRecycle:id=>files.recycle(id),videoStudioOpenStorageDir:async p=>{const folder=files.open(p),error=await shell.openPath(folder);if(error)throw Error(error);return {path:folder};},
 localAssetDrop:p=>links.registerSelection(p),localAssetResolve:id=>links.describe(id),localAssetSync:ids=>links.sync(ids),localAssetOpenFolder:id=>{const item=links.describe(id);shell.showItemInFolder(item.path);return {opened:true};},
 localAssetRelinkSingle:async p=>{const id=String(p?.id||''),otherIds=Array.isArray(p?.otherIds)?p.otherIds:[];const defaultPath=links.defaultRelinkDir([id]);const r=await dialog.showOpenDialog(win,{title:'重新定位原文件',defaultPath,properties:['openFile'],filters:[{name:'素材',extensions:['png','jpg','jpeg','webp','gif','mp3','wav','m4a','ogg','flac','mp4','webm','mov']}]});return r.canceled||!r.filePaths.length?{canceled:true}:{canceled:false,...links.relinkSingle(id,r.filePaths[0],otherIds)};},
 localAssetRelinkFolder:async p=>{const ids=Array.isArray(p?.ids)?p.ids:[];const defaultPath=links.defaultRelinkDir(ids);const r=await dialog.showOpenDialog(win,{title:'选择文件夹一键批量定位缺失素材',defaultPath,properties:['openDirectory']});return r.canceled||!r.filePaths.length?{canceled:true,healedCount:0,resolved:{},missing:{}}:({canceled:false,...links.relinkFolder(r.filePaths,ids)});},
 localAssetChooseFolder:async()=>{const r=await dialog.showOpenDialog(win,{title:'导入素材文件夹（包含子文件夹）',properties:['openDirectory']});return r.canceled?[]:links.registerSelection(r.filePaths);},
 localAssetChoose:async()=>{const r=await dialog.showOpenDialog(win,{title:'引用自己的图片、音频或视频',properties:['openFile','multiSelections'],filters:[{name:'素材',extensions:['png','jpg','jpeg','webp','gif','mp3','wav','m4a','ogg','flac','mp4','webm','mov']}]});return r.canceled?[]:links.register(r.filePaths);}
};
for(const [name,action] of Object.entries(actions))ipcMain.handle('workbench:'+name,(event,...args)=>{trusted(event);return action(...args);});
for(const mode of ['confirm','alert'])ipcMain.on('dialog:'+mode+'-sync',(event,payload)=>{trusted(event);const value=dialog.showMessageBoxSync(win,{type:mode==='confirm'?'question':'info',title:String(payload.title||'晓晓视频创作台'),message:String(payload.message||''),buttons:mode==='confirm'?['取消','确定']:['确定'],cancelId:0,defaultId:mode==='confirm'?1:0});event.returnValue=mode==='confirm'?{response:value}:{ok:true};});
const bridge=http.createServer(async(req,res)=>{
 if(req.url?.startsWith('/workbench/pippit-canvas/')){
  const requestOrigin=String(req.headers.origin||'');
  if(!/^chrome-extension:\/\/[a-p]{32}$/.test(requestOrigin)&&!(requestOrigin===''&&/^[a-p]{32}$/.test(String(req.headers['x-workbench-extension']||'')))){res.writeHead(403);res.end();return;}
  if(requestOrigin)res.setHeader('Access-Control-Allow-Origin',requestOrigin);res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Workbench-Extension');res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  try{let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('连接请求过大');text+=chunk;}const body=JSON.parse(text),value=req.url==='/workbench/pippit-canvas/heartbeat'?broker.heartbeat(body):req.url==='/workbench/pippit-canvas/result'?(broker.complete(body),{ok:true}):null;if(!value)throw Error('未知画布连接入口');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}return;
 }
 if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin||'*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Range');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const pathname=(req.url||'').split('?')[0];
 const match=/^\/workbench\/local-media\/([a-f0-9]{48})$/.exec(pathname);if(match){links.serve(req,res,match[1]);return;}
 if(pathname.startsWith('/workbench/studio-video/')){const parts=pathname.split('/').filter(Boolean);files.serve(req,res,decodeURIComponent(parts[2]||''),decodeURIComponent(parts[3]||''));return;}
 if(pathname.startsWith('/workbench/task-video/')){const parts=pathname.split('/').filter(Boolean);files.serveTask(req,res,decodeURIComponent(parts[2]||''));return;}
 res.writeHead(404);res.end();
});
function startBridge(){if(bridge.listening)return Promise.resolve();return new Promise((resolve,reject)=>{const failed=e=>{bridge.removeListener('listening',ready);reject(Error(e.code==='EADDRINUSE'?'分享版小云雀连接端口17862已占用，请退出另一份分享版或检查占用程序后重试。':e.message));},ready=()=>{bridge.removeListener('error',failed);resolve();};bridge.once('error',failed);bridge.once('listening',ready);bridge.listen(process.env.VIDEO_STUDIO_TEST_PROFILE?0:17862,'127.0.0.1');});}
const log=e=>{fs.appendFileSync(path.join(storage.logs,'startup.log'),String(e?.stack||e)+'\n');console.error(e);};
app.on('before-quit',()=>{canvas.stop();bridge.close();});app.on('window-all-closed',()=>{if(!initializing)app.quit();});
async function createWindow(){
 await startBridge();const status=await canvas.start();if(!status.ok)throw Error(status.error);origin=new URL(status.url).origin;
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'视频创作台',submenu:[{label:'打开本机数据目录',click:()=>shell.openPath(profile)},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'}]));
 win=new BrowserWindow({width:1440,height:940,minWidth:900,minHeight:650,title:'晓晓视频创作台 · 分享版',icon:path.join(resources,'assets','typetale-workbench.ico'),webPreferences:{preload:path.join(__dirname,'video-share-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:video-studio-share',additionalArguments:['--workbench-origin='+origin]}});
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))void shell.openExternal(url);return {action:'deny'};});win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();if(/^https?:/.test(url))void shell.openExternal(url);}});
 try{await win.loadURL(status.url);initializing=false;}catch(e){win.destroy();win=null;throw e;}
}
require('./workbench-window').installWindowAccess({app,BrowserWindow,screen,Tray,Menu,nativeImage,ipcMain,shell,iconPath:path.join(resources,'assets','typetale-workbench.ico'),dataDir:profile,getWindow:()=>win,createWindow,onError:log});
