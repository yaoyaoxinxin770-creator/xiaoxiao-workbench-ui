const {app,BrowserWindow,ipcMain,dialog,shell,Menu}=require('electron');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {InfiniteCanvasService}=require('./infinite-canvas-service');
const {PippitService}=require('./pippit-service');
const {DreaminaService}=require('./dreamina-service');
const {LocalAssetLinks}=require('./local-asset-links');
// Never read or migrate the full workbench profile. Each recipient starts with their own data.
app.setName('晓晓视频创作台');
const profile=process.env.VIDEO_STUDIO_TEST_PROFILE || path.join(app.getPath('appData'),'XiaoxiaoVideoStudioShare');
if(!path.isAbsolute(profile))throw Error('数据目录必须是绝对路径');
fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
const resources=app.isPackaged?process.resourcesPath:__dirname;
const canvas=new InfiniteCanvasService({runtimeDir:path.join(resources,'infinite-canvas-runtime'),webDir:path.join(resources,'video-studio-web'),dataDir:path.join(profile,'runtime'),port:17853,backendPort:17855,entryPath:'/video',shell});
const pippit=new PippitService({executable:path.join(resources,'pippit-runtime','pippit-tool-cli.exe'),dataDir:path.join(profile,'pippit')});
const dreamina=new DreaminaService({executable:path.join(resources,'dreamina-runtime','dreamina.exe'),dataDir:path.join(profile,'dreamina')});
let win,origin='',mediaServer;
const links=new LocalAssetLinks(path.join(profile,'local-asset-links.json'),()=> 'http://127.0.0.1:'+mediaServer.address().port);
function trusted(event){if(!origin||event.sender!==win?.webContents||event.senderFrame?.url.split('/').slice(0,3).join('/')!==origin)throw Error('不允许的调用来源');}
const actions={};
for(const [prefix,service,methods] of [['dreamina',dreamina,['status','credits','login','checkLogin','models','describe','submit','query']],['pippit',pippit,['status','credits','login','models','describe','submit','query']]])for(const method of methods)actions[prefix+method[0].toUpperCase()+method.slice(1)]=(...args)=>service[method](...args);
Object.assign(actions,{infiniteCanvasStatus:()=>canvas.status(),infiniteCanvasOpenDataDir:()=>canvas.openDataDir(),localAssetDrop:paths=>links.registerSelection(paths),localAssetResolve:id=>links.describe(id),localAssetChooseFolder:async()=>{const result=await dialog.showOpenDialog(win,{title:'导入素材文件夹（包含子文件夹）',properties:['openDirectory']});return result.canceled?[]:links.registerSelection(result.filePaths);},localAssetChoose:async()=>{const result=await dialog.showOpenDialog(win,{title:'引用本地图片、音频或视频',properties:['openFile','multiSelections'],filters:[{name:'素材',extensions:['png','jpg','jpeg','webp','gif','mp3','wav','m4a','ogg','flac','mp4','webm','mov']}]});return result.canceled?[]:links.register(result.filePaths);}});
for(const [name,action] of Object.entries(actions))ipcMain.handle('workbench:'+name,(event,...args)=>{trusted(event);return action(...args);});
for(const mode of ['confirm','alert'])ipcMain.on('dialog:'+mode+'-sync',(event,payload)=>{trusted(event);const value=dialog.showMessageBoxSync(win,{type:mode==='confirm'?'question':'info',title:String(payload.title||'晓晓视频创作台'),message:String(payload.message||''),buttons:mode==='confirm'?['确定','取消']:['确定'],cancelId:mode==='confirm'?1:0});event.returnValue=mode==='alert'||value===0;});
function cleanup(){canvas.stop();mediaServer?.close();}
app.on('before-quit',cleanup);app.on('window-all-closed',()=>app.quit());
if(!app.requestSingleInstanceLock())app.quit();else {
app.on('second-instance',()=>{win?.show();win?.focus();});
app.whenReady().then(async()=>{
 const status=await canvas.start();if(!status.ok)throw Error(status.error);
 origin=new URL(status.url).origin;
 mediaServer=http.createServer((req,res)=>{if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Cross-Origin-Resource-Policy','cross-origin');const match=/^\/workbench\/local-media\/([a-f0-9]{48})$/.exec(req.url||'');if(match)links.serve(req,res,match[1]);else{res.writeHead(404);res.end();}});
 await new Promise(resolve=>mediaServer.listen(0,'127.0.0.1',resolve));
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'视频创作台',submenu:[{label:'打开本机数据目录',click:()=>shell.openPath(profile)},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'}]));
 win=new BrowserWindow({width:1440,height:940,minWidth:900,minHeight:650,title:'晓晓视频创作台 · 分享版',webPreferences:{preload:path.join(__dirname,'video-share-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:video-studio-share',additionalArguments:['--workbench-origin='+origin]}});
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))void shell.openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();if(/^https?:/.test(url))void shell.openExternal(url);}});
 await win.loadURL(status.url);
}).catch(error=>{cleanup();dialog.showErrorBox('视频创作台启动失败',error.message);app.exit(1);});
}
