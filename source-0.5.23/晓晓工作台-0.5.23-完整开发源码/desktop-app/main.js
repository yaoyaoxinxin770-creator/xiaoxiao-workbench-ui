const {app, BrowserWindow, ipcMain, dialog, nativeImage, shell, Menu, screen, Tray, Notification} = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
// 同一数据目录只运行一个桌面实例，后续双击交给已有实例唤起窗口。
const storagePaths=require('./workbench-storage').configureStorage(app);
if(!app.requestSingleInstanceLock()){app.quit();return;}
app.setAppUserModelId('local.jimeng.workbench');
// The portable build has no installer to register its Windows notification identity.
// Isolated tests must not replace the user's Start Menu entry.
if(process.platform==='win32'&&app.isPackaged&&!process.env.WORKBENCH_PROFILE_DIR)app.whenReady().then(()=>{
  const shortcut=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','晓晓的AI工作台.lnk');
  fs.mkdirSync(path.dirname(shortcut),{recursive:true});
  if(!shell.writeShortcutLink(shortcut,fs.existsSync(shortcut)?'update':'create',{target:process.execPath,cwd:path.dirname(process.execPath),description:'晓晓的AI工作台',icon:path.join(__dirname,'assets','typetale-workbench.ico'),iconIndex:0,appUserModelId:'local.jimeng.workbench'}))throw Error('工作台通知入口注册失败');
}).catch(error=>writeStartupError(error));

const {defaultProject, normalizeProject, safeParseProject, nowIso} = require('./project-model');
const {loadAnalyzer, recognizeProject, groupCharacterFiles, characterNamesFromPrompt, listProjectAssets} = require('./project-assets');
const {createBrowserWorkbenchHandler} = require('./browser-workbench-service');
const {ConnectorBroker} = require('./connector-broker');
const typetaleService = require('./typetale-service');
const {DreaminaService} = require('./dreamina-service');
const {DreaminaCanvasService,DreaminaRouter}=require('./dreamina-canvas-service');
const {PippitService} = require('./pippit-service');
const {OiioiiService}=require('./oiioii-service');
const {InfiniteCanvasService} = require('./infinite-canvas-service');

function startupLogFile(name) {
  const target = String(process.env.WORKBENCH_DEBUG_LOG || '');
  if (/^[a-z]:[\\/]|^\//i.test(target)) return target;
  try { return path.join(app.getPath('userData'), name); } catch (_) { return ''; }
}
function writeStartupError(error) {
  try {
    const file = startupLogFile('startup-error.log');
    if (file) fs.appendFileSync(file, `[${new Date().toISOString()}] ${error?.stack || error}\n`, 'utf8');
  } catch (_) {}
  console.error(error);
}
process.on('uncaughtException', error => { writeStartupError(error); app.exit(1); });
process.on('unhandledRejection', error => { writeStartupError(error); app.exit(1); });
function writeStartupMarker(message) {
  if (!process.env.WORKBENCH_DEBUG_LOG) return;
  try {
    const file = startupLogFile('startup-status.log');
    if (file) fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch (_) {}
}
writeStartupMarker('main module loaded');

const workspaceRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'jimeng-canvas-extension') : path.join(workspaceRoot, 'jimeng-canvas-extension');
const desktopStaticRoot = app.isPackaged ? path.join(process.resourcesPath, 'desktop-app') : __dirname;
const infiniteCanvas = new InfiniteCanvasService({
  ...(process.env.WORKBENCH_PROFILE_DIR ? {port:0, backendPort:0} : {}),
  runtimeDir: app.isPackaged ? path.join(process.resourcesPath, 'infinite-canvas-runtime') : path.join(__dirname, 'infinite-canvas-runtime'),
  webDir: app.isPackaged ? path.join(process.resourcesPath, 'infinite-canvas-web') : path.join(__dirname, 'infinite-canvas-web'),
  dataDir: path.join(app.getPath('userData'), 'infinite-canvas'),
  shell,
});
app.on('before-quit', () => infiniteCanvas.stop());
const oiioii=new OiioiiService({runtimeDir:path.join(app.isPackaged?process.resourcesPath:__dirname,'oiioii-runtime'),dataDir:path.join(app.getPath('userData'),'oiioii')});
const oiioiiActions={oiioiiStatus:()=>oiioii.status(),oiioiiLogin:()=>oiioii.login(),oiioiiModels:()=>oiioii.models(),oiioiiWorkspaces:()=>oiioii.workspaces(),oiioiiSelectWorkspace:id=>oiioii.selectWorkspace(id),oiioiiCreateWorkspace:name=>oiioii.createWorkspace(name),oiioiiSubmit:p=>oiioii.submit(p),oiioiiQuery:id=>oiioii.query(id)};
for(const [name,action] of Object.entries(oiioiiActions))ipcMain.handle('workbench:'+name,(_event,...args)=>action(...args));
const pippit = new PippitService({executable:path.join(app.isPackaged ? process.resourcesPath : __dirname,'pippit-runtime','pippit-tool-cli.exe'),dataDir:path.join(app.getPath('userData'),'pippit')});
const dreaminaLegacy = new DreaminaService({executable:path.join(app.isPackaged ? process.resourcesPath : __dirname,'dreamina-runtime','dreamina.exe'),dataDir:path.join(app.getPath('userData'),'dreamina')});
const dreaminaCanvas=new DreaminaCanvasService({executable:path.join(app.isPackaged ? process.resourcesPath : __dirname,'dreamina-canvas-runtime','dreamina-canvas.exe'),dataDir:path.join(app.getPath('userData'),'dreamina-canvas')});
const {DreaminaInterpolation}=require('./dreamina-interpolation');
const dreaminaInterpolation=new DreaminaInterpolation({BrowserWindow,dataDir:path.join(app.getPath('userData'),'dreamina-interpolation')});dreaminaCanvas.interpolator=dreaminaInterpolation;
app.on('before-quit',()=>dreaminaInterpolation.dispose());
const {DreaminaAccounts}=require('./dreamina-accounts');
const dreaminaAccounts=new DreaminaAccounts({canvas:dreaminaCanvas});
const dreamina=new DreaminaRouter({canvas:dreaminaCanvas,legacy:dreaminaLegacy,accounts:dreaminaAccounts});
const canvasTargets=p=>dreaminaAccounts.service(p?.profile).targets;
const interpolationContext=async p=>{const profile=p?.profile||dreaminaAccounts.state.activeProfile,service=dreaminaAccounts.service(profile),account=await service.account();return {profile,account,accountName:dreaminaAccounts.entry(profile).name,service};};
const interpolationActions={
 dreaminaInterpolationStatus:async p=>{const c=await interpolationContext(p);return {...await dreaminaInterpolation.status(c.profile,c.account),accountName:c.accountName};},
 dreaminaInterpolationOpen:async p=>{const c=await interpolationContext(p),target=await c.service.targets.settings(p.projectKey);if(!target?.projectId||target.account!==c.account)throw Error('请先在画布管理绑定当前项目的即梦画布');return {...await dreaminaInterpolation.open({...c,task:target}),accountName:c.accountName};},
 dreaminaInterpolationConfirm:async p=>{const c=await interpolationContext(p);return {...await dreaminaInterpolation.confirm({...c,sameAccountConfirmed:p.sameAccountConfirmed}),accountName:c.accountName};},
};
const dreaminaActions = {...interpolationActions,dreaminaDraftPreview:p=>dreaminaAccounts.service(p.profile).drafts.preview(p),dreaminaDraftCreate:p=>dreaminaAccounts.service(p.profile).drafts.create(p),dreaminaCanvasSettings:p=>canvasTargets(p).settings(p.projectKey),dreaminaCanvasList:p=>canvasTargets(p).list(),dreaminaCanvasBind:p=>canvasTargets(p).bind(p),dreaminaCanvasNodes:p=>canvasTargets(p).nodes(p.projectId),dreaminaCanvasConfigure:p=>canvasTargets(p).configure(p),dreaminaCanvasCapture:p=>canvasTargets(p).capture(p.projectKey),dreaminaReferenceNeeds:p=>dreaminaAccounts.service(p.profile).referenceNeeds(p),dreaminaAccounts:()=>dreaminaAccounts.list(),dreaminaAccountCreate:payload=>dreaminaAccounts.create(payload),dreaminaAccountEdit:payload=>dreaminaAccounts.edit(payload),dreaminaAccountSelect:profile=>dreaminaAccounts.select(profile),dreaminaStatus:(version,profile)=>dreamina.status(version,profile),dreaminaCredits:(version,profile)=>dreamina.credits(version,profile),dreaminaLogin:(version,profile)=>dreamina.login(version,profile),dreaminaCheckLogin:(version,profile)=>dreamina.checkLogin(version,profile),dreaminaModels:(version,profile)=>dreamina.models(version,profile),dreaminaDescribe:(model,version,profile)=>dreamina.describe(model,version,profile),dreaminaSubmit:payload=>dreamina.submit(payload),dreaminaPrepare:payload=>dreamina.prepare(payload),dreaminaConfirm:payload=>dreamina.confirm(payload),dreaminaQuery:(id,options)=>dreamina.query(id,options)};
for(const [name,action] of Object.entries(dreaminaActions)) ipcMain.handle('workbench:'+name,(_event,...args)=>action(...args));
const {PippitCanvasService}=require('./pippit-canvas-service');
const pippitCanvas=new PippitCanvasService({pippit,dataDir:path.join(app.getPath('userData'),'pippit-canvas'),canvasEntry:path.join(app.isPackaged?process.resourcesPath:__dirname,'pippit-canvas-runtime','run.cjs')});
const {PippitCanvasBroker}=require('./pippit-canvas-broker');
const {PippitCanvasGeneration}=require('./pippit-canvas-generation');
const pippitCanvasBroker=new PippitCanvasBroker();
const {PippitOfficialSession}=require('./pippit-official-session');
const pippitOfficial=new PippitOfficialSession({BrowserWindow,pippit,canvas:pippitCanvas,dataDir:path.join(app.getPath('userData'),'pippit-official')});
app.on('before-quit',()=>pippitOfficial.dispose());
const pippitCanvasGeneration=new PippitCanvasGeneration({pippit,canvas:pippitCanvas,broker:pippitOfficial});
const localVideoTaskStates=async ids=>{if(!Array.isArray(ids)||ids.length>1000)throw Error('任务状态查询数量无效');return Promise.all(ids.map(async id=>{const service=typeof id==='string'&&id.startsWith('oiioii:')?oiioii:typeof id==='string'&&id.startsWith('pippit:')?pippit:typeof id==='string'&&id.startsWith('dreamina-agent:')?dreamina.agent:typeof id==='string'&&id.startsWith('dreamina-canvas:')?await dreaminaAccounts.taskService(id):typeof id==='string'&&id.startsWith('dreamina:')?dreaminaLegacy:null;if(!service)throw Error('任务类型无效');const task=await service.read(service.taskDir(id));return {id,status:task?.status||'missing',...(task?.interpolatedNodeId&&task.interpolation?.attemptedAt?{interpolatedFps:task.interpolatedFps||task.interpolation.fps||30}:task?.interpolatedFps?{interpolatedFps:task.interpolatedFps}:{})};}));};
const pippitActions = {pippitOfficialStatus:()=>pippitOfficial.status(),pippitOfficialOpen:p=>pippitOfficial.open(p.projectKey),pippitOfficialConfirm:p=>pippitOfficial.confirm(p),localVideoTaskStates, pippitCanvasCheck:async key=>{const {target}=await pippitCanvas.settings(key);if(!target)throw Error('请先保存本项目画布链接');const doc=await pippitCanvas.snapshot(target);return {connected:true,title:doc.assets[target.canvasId].content.metadata.title||target.title,nodes:Object.keys(doc.assets[target.canvasId].content.nodes||{}).length};},pippitCanvasSettings:key=>pippitCanvasGeneration.settings(key),pippitCanvasConfigure:async payload=>{await pippitCanvas.configure(payload);return pippitCanvasGeneration.settings(payload.projectKey);},pippitCanvasSync:payload=>pippitCanvas.sync(payload), pippitStatus:()=>pippit.status(), pippitLogin:()=>pippit.login(), pippitCredits:()=>pippit.credits(), pippitModels:()=>pippit.models(), pippitDescribe:(model,type)=>pippit.describe(model,type), pippitSubmit:payload=>payload.type==='video'&&payload.projectKey?pippitCanvasGeneration.submit(payload):pippit.submit(payload), pippitQuery:async id=>(await pippit.read(pippit.taskDir(id)))?.canvasTarget?pippitCanvasGeneration.query(id):pippit.query(id), pippitAgentSubmit:payload=>pippit.agentSubmit(payload), pippitAgentQuery:id=>pippit.agentQuery(id) };
for(const [name,action] of Object.entries(pippitActions)) ipcMain.handle('workbench:'+name,(_event,...args)=>action(...args));
const infiniteCanvasActions = {
  infiniteCanvasStart: () => infiniteCanvas.start(),
  infiniteCanvasStatus: () => infiniteCanvas.status(),
  infiniteCanvasOpenDataDir: () => infiniteCanvas.openDataDir(),
};
for (const [name, action] of Object.entries(infiniteCanvasActions)) ipcMain.handle('workbench:'+name, () => action());
const analyzer = loadAnalyzer(path.join(webRoot, 'analyzer.js'));
writeStartupMarker(`analyzer loaded from ${webRoot}`);
const projectMetaDir = root => path.join(root, '.jimeng');
const projectConfigPath = root => path.join(projectMetaDir(root), 'project.json');
const projectDraftPath = root => path.join(projectMetaDir(root), 'draft.txt');
const projectRunsPath = root => path.join(projectMetaDir(root), 'runs.json');
const recentPath = () => path.join(app.getPath('userData'), 'recent.json');
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function inspectProjectFolder(root) {
  const started = Date.now();
  if (!root || !fs.existsSync(root)) return {ok:false, pathAvailable:false, scanMs:0, counts:{characters:0,scenes:0,audio:0,props:0}, folders:{}, documents:[]};
  const hasProjectConfig = fs.existsSync(projectConfigPath(root));
  const hasTypetaleState = fs.existsSync(path.join(root, '.typetale', 'workbench.json'));
  const existing = hasProjectConfig ? safeParseProject(fs.readFileSync(projectConfigPath(root), 'utf8'), root) : {ok:true, project:defaultProject(root), error:null};
  const scan = recognizeProject(root, existing.project.folderRecognitionOverrides, analyzer);
  const project = normalizeProject(existing.project, root);
  if(project.workspace==='jimeng') scan.folders.videoOutput=null;
  if(project.folderSelection) {
    const indexed=require('./asset-store').collect(root,analyzer,'',{autoBind:false});
    for(const kind of Object.keys(scan.counts)) scan.counts[kind]=indexed.assets.filter(asset=>asset.kind===kind).length;
  }
  project.folders = scan.folders;
  const draftText = fs.existsSync(projectDraftPath(root)) ? fs.readFileSync(projectDraftPath(root), 'utf8') : '';
  const names = characterNamesFromPrompt(draftText, analyzer);
  if (names.length && scan.folders.characters) project.characterGroups = groupCharacterFiles(root, scan.folders.characters.relativePath, names, analyzer);
  project.prompt.hasDraft = Boolean(draftText);
  project.prompt.draftUpdatedAt = draftText && fs.statSync(projectDraftPath(root)).mtime.toISOString();
  project.updatedAt = nowIso();
  return {ok:true, pathAvailable:true, hasProjectConfig, hasTypetaleState, project, configError:existing.ok?null:existing.error, ...scan, scanMs:Date.now()-started};
}

let win;
let initializing = true;
const assetActions = require('./asset-ipc').register({ipcMain,dialog,nativeImage,getWindow:()=>win,analyzer,getMediaOrigin:()=>`http://127.0.0.1:${bridgeServer.address().port}`});
const connectorBroker = new ConnectorBroker();
const typetaleActions = typetaleService.createActions({app, dialog, shell});
for (const [name, action] of Object.entries(typetaleActions)) {
  ipcMain.handle(`typetale:${name}`, async (_event, ...args) => {
    try { return {ok:true, ...await action(...args)}; }
    catch (error) { return {ok:false, error:String(error?.message || error)}; }
  });
}
const {CdpBridge} = require('./cdp-bridge');
const cdpBridge = new CdpBridge({stateDir:path.join(app.getPath('userData'), 'cdp-bridge')});
const {DreaminaLegacyAgentService}=require('./dreamina-legacy-agent-service');
dreamina.agent=new DreaminaLegacyAgentService({legacy:dreaminaLegacy,bridge:cdpBridge,dataDir:path.join(app.getPath('userData'),'dreamina-legacy-agent')});
const legacyAgentActions={dreaminaLegacyAgentSettings:p=>dreamina.agent.settings(p.projectKey),dreaminaLegacyAgentBind:p=>dreamina.agent.bind(p),dreaminaLegacyAgentCapture:p=>dreamina.agent.capture(p.projectKey)};
for(const [name,action] of Object.entries(legacyAgentActions))ipcMain.handle('workbench:'+name,(_event,...args)=>action(...args));
const activeBridge = () => cdpBridge.config.mode === 'extension' ? connectorBroker : cdpBridge;
const cdpActions = {
  cdpSettings: async () => ({...cdpBridge.config, pending:cdpBridge.pending}),
  cdpConfigure: value => {if(connectorBroker.pending)throw new Error('扩展仍有任务运行，不能切换桥接');return cdpBridge.configure(value);},
  cdpTargets: () => cdpBridge.targets(),
  cdpLaunch: options => options?.newCanvas ? cdpBridge.openCanvasHome() : cdpBridge.launch(),
  cdpOpenAndConnect: () => {if(connectorBroker.pending)throw new Error('原扩展仍有任务运行，请先停止原扩展任务');return cdpBridge.openAndConnect();},
  cdpRecover: () => cdpBridge.recover(),
  cdpAcknowledge: () => cdpBridge.acknowledge(),
};
for (const [name, action] of Object.entries(cdpActions)) ipcMain.handle('workbench:'+name, (_event,...args) => action(...args));
async function migrateLegacyState() {
  const file = path.join(app.getPath('userData'), 'legacy-workbench-state.json');
  if(fs.existsSync(file)) return;
  const reader = new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  try {
    await reader.loadFile(path.join(desktopStaticRoot,'workbench-state-reader.html'));
    const snapshot = await reader.webContents.executeJavaScript(`Object.fromEntries(Object.keys(localStorage).filter(key=>/^(jimeng-|typetale-)/.test(key)).map(key=>[key,localStorage.getItem(key)]))`);
    writeJson(file, snapshot);
  } finally { reader.destroy(); }
}
ipcMain.handle('workbench:legacy-state', ()=>readJson(path.join(app.getPath('userData'),'legacy-workbench-state.json'),{}));
ipcMain.on('dialog:confirm-sync', (event, {message, title} = {}) => {
  try {
    const target = BrowserWindow.fromWebContents(event.sender) || win;
    const response = dialog.showMessageBoxSync(target, {type: 'question', title: title || '确认', message: String(message ?? ''), buttons: ['取消', '确定'], defaultId: 1, cancelId: 0});
    event.returnValue = {response};
  } catch (e) { event.returnValue = {response: 0, error: String(e && e.message || e)}; }
});
ipcMain.on('dialog:alert-sync', (event, {message, title} = {}) => {
  try {
    const target = BrowserWindow.fromWebContents(event.sender) || win;
    dialog.showMessageBoxSync(target, {type: 'info', title: title || '提示', message: String(message ?? ''), buttons: ['确定'], defaultId: 0});
    event.returnValue = {ok: true};
  } catch (e) { event.returnValue = {ok: false, error: String(e && e.message || e)}; }
});
async function createWindow() {
  await startBridgeServer();
  await migrateLegacyState();
  const service = await infiniteCanvas.start();
  if(!service.ok)throw Error(service.error);
  const origin = new URL(service.url).origin;
  const deliveryDoc = path.join(workspaceRoot, '晓晓工作台-交付说明.md');
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1080, minHeight: 680,
    frame: false,
    backgroundColor: '#eef1f7',
    icon: path.join(__dirname, 'assets', 'typetale-workbench.ico'),
    title: '晓晓的 AI 工作台',
    // backgroundThrottling 默认开启：窗口被最小化或被别的应用盖住时，渲染进程的
    // 定时器会被压到每分钟一次。批次的组间等待、连接重试、扣费轮询全都靠定时器，
    // 一旦被压，用户切走去做别的事就会发现进度卡住好几分钟。工作台是长时间无人
    // 值守跑批的工具，必须关掉这个节流。
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required", additionalArguments:['--workbench-origin='+origin] }
  });
  // Embedded web content must not open a new Electron window that inherits the desktop preload.
  win.webContents.setWindowOpenHandler(({url}) => {
    if(/^https:\/\//.test(url)) void shell.openExternal(url);
    return {action:'deny'};
  });
  win.webContents.on('will-navigate', (event,url)=>{if(new URL(url).origin !== origin)event.preventDefault();});
  win.webContents.on('before-input-event', (_event, input) => {
    if(input.type==='keyDown'&&(input.control||input.meta)&&['+','=','-','0'].includes(input.key)){_event.preventDefault();const zoom=win.webContents.getZoomLevel();win.webContents.setZoomLevel(input.key==='0'?0:Math.max(-3,Math.min(3,zoom+(input.key==='-'?-0.5:0.5))));}
    if (input.type === 'keyDown' && (input.key === 'F5'||input.control&&input.key.toLowerCase()==='r')) {
      _event.preventDefault();
      win.webContents.reload();
    }
  });
  win.webContents.on('unresponsive', () => {
    if (process.env.INFINITE_CANVAS_UI_TEST_ROOT || process.env.JIMENG_CDP_UI_TEST_ROOT || process.env.TYPETALE_UI_TEST_ROOT || process.env.AGENT_UI_BASE_URL) return;
    if (win.isDestroyed()) return;
    void dialog.showMessageBox(win, {type: 'warning', title: '界面无响应', message: '工作台界面暂时无响应。\n可能是后台任务占用或弹窗异常。', buttons: ['重新加载界面', '继续等待'], defaultId: 0, cancelId: 1})
      .then(({response}) => { if (response === 0 && !win.isDestroyed()) win.webContents.reload(); });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.warn('renderer gone:', details && details.reason);
    if (!initializing && !win.isDestroyed()) win.loadURL(service.url).catch(() => {});
  });
  win.webContents.on('will-prevent-unload', (event) => {
    if (process.env.INFINITE_CANVAS_UI_TEST_ROOT || process.env.JIMENG_CDP_UI_TEST_ROOT || process.env.TYPETALE_UI_TEST_ROOT || process.env.AGENT_UI_BASE_URL) { event.preventDefault(); return; }
    try {
      const response = dialog.showMessageBoxSync(win, {type: 'warning', title: '任务正在运行', message: '有任务仍在运行。刷新界面不会中断已提交到即梦的生成，但页面状态会重置。\n确定刷新吗？', buttons: ['取消', '刷新界面'], defaultId: 0, cancelId: 0});
      if (response === 1) event.preventDefault();
    } catch { event.preventDefault(); }
  });
  try{await win.loadURL(service.url);}catch(error){win.destroy();win=null;throw error;}
  initializing = false;
}
const windowAccess=require('./workbench-window').installWindowAccess({app,BrowserWindow,screen,Tray,Menu,nativeImage,ipcMain,shell,iconPath:path.join(__dirname,'assets','typetale-workbench.ico'),dataDir:app.getPath('userData'),getWindow:()=>win,createWindow,onError:writeStartupError});
app.on('window-all-closed', () => { if (!initializing && process.platform !== 'darwin') app.quit(); });
ipcMain.handle('workbench:choose-file', async () => {
  const result = await dialog.showOpenDialog(win, {properties:['openFile','multiSelections'], filters:[{name:'素材', extensions:['png','jpg','jpeg','webp','mp3','wav','mp4','mov']}]});
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('workbench:choose-directory', async () => {
  const result = await dialog.showOpenDialog(win, {title:'选择或新建即梦项目文件夹',properties:['openDirectory','createDirectory']});
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('workbench:create-jimeng-project', async (_event, name) => browserActions.createJimengProject(name));
ipcMain.handle('workbench:scan-project', async (_event, projectPath) => {
  return inspectProjectFolder(projectPath);
});
ipcMain.handle('workbench:scan-projects-root', async () => {
  const result = await dialog.showOpenDialog(win, {properties:['openDirectory']});
  if (result.canceled) return {canceled:true, candidates:[]};
  const candidates = fs.readdirSync(result.filePaths[0], {withFileTypes:true})
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const root = path.join(result.filePaths[0], entry.name);
      const info = inspectProjectFolder(root);
      const usable = Object.entries(info.folders || {}).some(([kind, value]) => kind !== 'documents' && Boolean(value)) || (info.documents || []).length > 0;
      return {path:root, name:entry.name, usable, reason:usable?'':'未检测到人物、场景、音频或文档', info};
    });
  return {canceled:false, root:result.filePaths[0], candidates};
});
ipcMain.handle('workbench:inspect-project', async (_event, projectPath) => inspectProjectFolder(projectPath));
ipcMain.handle('workbench:save-project', async (_event, projectPath, project) => {
  if (!projectPath || !fs.existsSync(projectPath)) return {ok:false};
  const dir = projectMetaDir(projectPath);
  const existing = require('./asset-store').read(projectPath);
  const normalized = normalizeProject({...existing,...project}, projectPath);
  // Asset edits have their own narrow write API; stale workspace saves must never overwrite them.
  for (const key of require('./asset-store').metaKeys) if (existing[key]) normalized[key]=existing[key];
  delete normalized.draftText;
  delete normalized.source;
  delete normalized.segments;
  delete normalized.projectPath;
  delete normalized.assetFolders;
  fs.mkdirSync(dir, {recursive:true});
  writeJson(projectConfigPath(projectPath), normalized);
  if (typeof project?.draftText === 'string') fs.writeFileSync(projectDraftPath(projectPath), project.draftText, 'utf8');
  if (!fs.existsSync(projectRunsPath(projectPath))) writeJson(projectRunsPath(projectPath), {schemaVersion:1, runs:[]});
  return {ok:true, dir};
});
ipcMain.handle('workbench:read-project', async (_event, projectPath) => inspectProjectFolder(projectPath));
ipcMain.handle('workbench:read-recent', async () => readJson(recentPath(), {schemaVersion:1, projects:[]}));
ipcMain.handle('workbench:write-recent', async (_event, projects) => { writeJson(recentPath(), {schemaVersion:1, projects:Array.isArray(projects)?projects:[]}); return {ok:true}; });
ipcMain.handle('workbench:read-draft', async (_event, projectPath) => ({ok:Boolean(projectPath && fs.existsSync(projectDraftPath(projectPath))), text:projectPath&&fs.existsSync(projectDraftPath(projectPath))?fs.readFileSync(projectDraftPath(projectPath),'utf8'):''}));
ipcMain.handle('workbench:read-document', async (_event, projectPath, relativePath) => {
  const file = path.resolve(projectPath || '', relativePath || '');
  if (!projectPath || !file.startsWith(path.resolve(projectPath) + path.sep) || !fs.existsSync(file)) return {ok:false, error:'文档不存在'};
  if (!/\.(txt|md)$/i.test(file)) return {ok:false, error:'当前仅支持读入 txt/md 文档，docx 仍只做检测'};
  return {ok:true, text:fs.readFileSync(file, 'utf8')};
});
ipcMain.handle('workbench:read-runs', async (_event, projectPath) => readJson(projectRunsPath(projectPath), {schemaVersion:1, runs:[]}));
ipcMain.handle('workbench:group-characters', async (_event, projectPath, folder, characterNames) => ({ok:true, groups:groupCharacterFiles(projectPath, folder, characterNames, analyzer)}));
ipcMain.handle('workbench:list-assets', async (_event, projectPath) => {
  if (!projectPath || !fs.existsSync(projectPath)) return {ok:false, assets:[], error:'项目路径不可用'};
  const info = inspectProjectFolder(projectPath);
  return {ok:true, assets:listProjectAssets(projectPath, info.folders), scanMs:info.scanMs};
});
ipcMain.handle('workbench:connector-status', async () => activeBridge().status());
ipcMain.handle('workbench:execute', async (_event, payload) => activeBridge().execute(payload));
// 停止当前操作必须释放 broker 的待处理槽位：它没有超时，被放弃的 promise 不会
// resolve，不取消就会永久卡在“已有任务正在等待即梦画布处理”。
ipcMain.handle('workbench:cancel-execution', async (_event, reason) => activeBridge().cancel({reason}));

const assetForBrowser = action => async (...args) => {
  try { return {ok:true, ...await action(...args)}; }
  catch (error) { return {ok:false, error:String(error?.message || error)}; }
};
const browserActions = {
  legacyWorkbenchState: async () => readJson(path.join(app.getPath('userData'),'legacy-workbench-state.json'),{}),
  ...infiniteCanvasActions,
  ...pippitActions, ...dreaminaActions, ...legacyAgentActions, ...oiioiiActions,
  ...cdpActions,
  ping: async () => ({ok:true, version:'0.3.0'}),
  connectorStatus: async () => activeBridge().status(),
  chooseFiles: async () => {
    const result = await dialog.showOpenDialog(win, {properties:['openFile','multiSelections'], filters:[{name:'素材', extensions:['png','jpg','jpeg','webp','mp3','wav','mp4','mov']}]});
    return result.canceled ? [] : result.filePaths;
  },
  chooseDirectory: async () => {
    const result = await dialog.showOpenDialog(win, {properties:['openDirectory']});
    return result.canceled ? null : result.filePaths[0];
  },
  // 按名字在数据目录下新建一个空的即梦项目文件夹，重名时自动加序号。
  createJimengProject: async name => {
    const safe = String(name || '').trim();
    if (!safe || safe.length > 100 || /[<>:"/\\|?*\x00-\x1f]/.test(safe) || /[. ]$/.test(safe) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) throw Error('名称不能包含 Windows 路径保留字符或保留名称');
    const root = path.join(app.getPath('userData'), 'jimeng-projects');
    fs.mkdirSync(root, {recursive: true});
    let dir = path.join(root, safe), n = 1;
    while (fs.existsSync(dir)) dir = path.join(root, safe + ' (' + (n++) + ')');
    fs.mkdirSync(dir);
    return {path: dir};
  },
  scanProject: async projectPath => inspectProjectFolder(projectPath),
  inspectProject: async projectPath => inspectProjectFolder(projectPath),
  readProject: async projectPath => inspectProjectFolder(projectPath),
  scanProjectsRoot: async () => {
    const result = await dialog.showOpenDialog(win, {properties:['openDirectory']});
    if (result.canceled) return {canceled:true, candidates:[]};
    const candidates = fs.readdirSync(result.filePaths[0], {withFileTypes:true})
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const root = path.join(result.filePaths[0], entry.name);
        const info = inspectProjectFolder(root);
        const usable = Object.entries(info.folders || {}).some(([kind, value]) => kind !== 'documents' && Boolean(value)) || (info.documents || []).length > 0;
        return {path:root, name:entry.name, usable, reason:usable?'':'未检测到人物、场景、音频或文档', info};
      });
    return {canceled:false, root:result.filePaths[0], candidates};
  },
  saveProject: async (projectPath, project) => {
    if (!projectPath || !fs.existsSync(projectPath)) return {ok:false};
    const dir = projectMetaDir(projectPath);
    const store = require('./asset-store');
    const existing = store.read(projectPath);
    const normalized = normalizeProject({...existing,...project}, projectPath);
    for (const key of store.metaKeys) if (existing[key]) normalized[key]=existing[key];
    delete normalized.draftText;
    delete normalized.source;
    delete normalized.segments;
    delete normalized.projectPath;
    delete normalized.assetFolders;
    fs.mkdirSync(dir, {recursive:true});
    writeJson(projectConfigPath(projectPath), normalized);
    if (typeof project?.draftText === 'string') fs.writeFileSync(projectDraftPath(projectPath), project.draftText, 'utf8');
    if (!fs.existsSync(projectRunsPath(projectPath))) writeJson(projectRunsPath(projectPath), {schemaVersion:1, runs:[]});
    return {ok:true, dir};
  },
  readRecent: async () => readJson(recentPath(), {schemaVersion:1, projects:[]}),
  writeRecent: async projects => { writeJson(recentPath(), {schemaVersion:1, projects:Array.isArray(projects)?projects:[]}); return {ok:true}; },
  readDraft: async projectPath => ({ok:Boolean(projectPath && fs.existsSync(projectDraftPath(projectPath))), text:projectPath&&fs.existsSync(projectDraftPath(projectPath))?fs.readFileSync(projectDraftPath(projectPath),'utf8'):''}),
  readDocument: async (projectPath, relativePath) => {
    const file = path.resolve(projectPath || '', relativePath || '');
    if (!projectPath || !file.startsWith(path.resolve(projectPath) + path.sep) || !fs.existsSync(file)) return {ok:false, error:'文档不存在'};
    if (!/\.(txt|md)$/i.test(file)) return {ok:false, error:'当前仅支持读取 txt/md 文档，docx 仍只做检测'};
    return {ok:true, text:fs.readFileSync(file, 'utf8')};
  },
  readRuns: async projectPath => readJson(projectRunsPath(projectPath), {schemaVersion:1, runs:[]}),
  groupCharacters: async (projectPath, folder, names) => ({ok:true, groups:groupCharacterFiles(projectPath, folder, names, analyzer)}),
  listAssets: async projectPath => {
    if (!projectPath || !fs.existsSync(projectPath)) return {ok:false, assets:[], error:'项目路径不可用'};
    const info = inspectProjectFolder(projectPath);
    return {ok:true, assets:listProjectAssets(projectPath, info.folders), scanMs:info.scanMs};
  },
  execute: async payload => activeBridge().execute(payload),
  // 停止当前操作必须真正释放 broker 的待处理槽位，否则下一次执行会一直被
  // “已有任务正在等待即梦画布处理”挡住。
  cancelExecution: async reason => activeBridge().cancel({reason}),
  assetList: assetForBrowser(assetActions.list),
  assetLinkFiles: assetForBrowser(assetActions.linkFiles),
  assetLinkFolder: assetForBrowser(assetActions.linkFolder),
  assetClearReferences: assetForBrowser(assetActions.clearReferences),
  assetUnlinkFolder: assetForBrowser(assetActions.unlinkFolder),
  libraryList: assetForBrowser(assetActions.libraryList),
  libraryEdit: assetForBrowser(assetActions.libraryEdit),
  libraryBrief: assetForBrowser(assetActions.libraryBrief),
  libraryPreview: assetForBrowser(assetActions.libraryPreview),
  libraryImport: assetForBrowser(assetActions.libraryImport),
  libraryExport: assetForBrowser(assetActions.libraryExport),
  assetEdit: assetForBrowser(assetActions.edit),
  assetBind: assetForBrowser(assetActions.bind),
  assetBindCharacter: assetForBrowser(assetActions.bindCharacter),
  assetBindSegmentAudio: assetForBrowser(assetActions.bindSegmentAudio),
  assetAudioPreview: assetForBrowser(assetActions.audioPreview),
  assetImport: assetForBrowser(assetActions.import),
  assetImportPaths: assetForBrowser(assetActions.importPaths),
  assetDelete: assetForBrowser(assetActions.delete),
  assetThumb: assetForBrowser(assetActions.thumb),
  assetFullImage: assetForBrowser(assetActions.fullImage),
  typetaleReadState: assetForBrowser(typetaleActions.readState),
  typetaleWriteState: assetForBrowser(typetaleActions.writeState),
  typetaleScanPlugins: assetForBrowser(typetaleActions.scanPlugins),
  typetaleChoosePluginDir: assetForBrowser(typetaleActions.choosePluginDir),
  typetaleInspectPlugin: assetForBrowser(typetaleActions.inspectPlugin),
  typetaleReadPluginConfig: assetForBrowser(typetaleActions.readPluginConfig),
  typetaleWritePluginConfig: assetForBrowser(typetaleActions.writePluginConfig),
  typetaleListModelFamilies: assetForBrowser(typetaleActions.listModelFamilies),
  typetaleValidateModelFamily: assetForBrowser(typetaleActions.validateModelFamily),
  typetaleExecute: assetForBrowser(typetaleActions.execute),
  typetaleQueryVideo: assetForBrowser(typetaleActions.queryVideo),
  typetaleDownloadResult: assetForBrowser(typetaleActions.downloadResult),
  typetaleOpenPath: assetForBrowser(typetaleActions.openPath),
  typetaleOpenOutputDir: assetForBrowser(typetaleActions.openOutputDir),
};
const handleLegacyBrowserWorkbench = createBrowserWorkbenchHandler({root:workspaceRoot, appRoot:desktopStaticRoot, webRoot, actions:browserActions});
const handleBrowserWorkbench = async (req,res) => {
  const url = new URL(req.url,'http://127.0.0.1:17842');
  if(['/workbench','/workbench/'].includes(url.pathname) && req.method==='GET' && infiniteCanvas.status().ok) {
    res.writeHead(302,{Location:infiniteCanvas.status().url});res.end();return true;
  }
  return handleLegacyBrowserWorkbench(req,res);
};

function readBridgeJson(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '', size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error('连接器请求过大')); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

// Local bridge for the MV3 extension. The extension can poll this localhost
// endpoint without exposing the desktop window or enabling Node in the UI.
const localAssetLinks = new (require('./local-asset-links').LocalAssetLinks)(path.join(app.getPath('userData'),'local-asset-links.json'),()=> 'http://127.0.0.1:'+bridgeServer.address().port);
function requireLocalAssetSender(event) { if(event.sender.isDestroyed() || event.sender !== win?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('仅工作台主窗口可引用本地文件'); }
const {VideoStudioFiles}=require('./video-studio-files');
const videoStudioFiles=new VideoStudioFiles(path.join(app.getPath('userData'),'video-studio','projects'),{origin:()=> 'http://127.0.0.1:'+bridgeServer.address().port,userDataDir:app.getPath('userData')});
for(const [name,action] of Object.entries({videoStudioSync:project=>videoStudioFiles.sync(project),videoStudioWrite:payload=>videoStudioFiles.write(payload),videoStudioVideoInfo:payload=>videoStudioFiles.videoInfo(payload),videoStudioResolve:payload=>videoStudioFiles.resolveVideo(payload),videoStudioMove:payload=>videoStudioFiles.move(payload),videoStudioRecycle:id=>videoStudioFiles.recycle(id),videoStudioOpenStorageDir:async payload=>{const folder=videoStudioFiles.open(payload);const error=await shell.openPath(folder);if(error)throw Error(error);return {path:folder};}}))ipcMain.handle('workbench:'+name,(event,...args)=>{requireLocalAssetSender(event);return action(...args);});
const videoShortcuts=new (require('./video-shortcuts').VideoShortcuts)({file:path.join(app.getPath('userData'),'video-shortcuts.json'),videos:videoStudioFiles,shell,choose:async defaultPath=>{const r=await dialog.showOpenDialog(win,{title:'选择视频快捷方式保存文件夹（原视频留在工作台）',defaultPath,properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0];}});
ipcMain.handle('workbench:videoStudioShortcuts',(event,payload)=>{requireLocalAssetSender(event);return videoShortcuts.create(payload);});
const completedVideoNotices=new Set(),activeVideoNotices=new Map();
ipcMain.handle('workbench:videoCompletionNotice',(event,payload)=>{
  requireLocalAssetSender(event);
  if(!payload||!/^[-\w]{1,100}$/.test(payload.id||'')||typeof payload.title!=='string'||payload.title.length>200)throw Error('无效的视频完成通知');
  if(payload.projectId!==undefined&&!/^[-\w]{1,100}$/.test(payload.projectId))throw Error('无效的视频项目');
  if(completedVideoNotices.has(payload.id))return {notified:false};
  completedVideoNotices.add(payload.id);shell.beep();
  if(Notification.isSupported()){const notice=new Notification({title:'晓晓的AI工作台',body:payload.title,silent:true,icon:path.join(__dirname,'assets','typetale-workbench.ico')});activeVideoNotices.set(payload.id,notice);notice.on('click',()=>{windowAccess.reveal();if(win&&!win.isDestroyed()&&payload.projectId)win.webContents.send('workbench:video-notice-click',{id:payload.id,projectId:payload.projectId});});notice.on('failed',()=>activeVideoNotices.delete(payload.id));notice.show();}
  return {notified:true};
});
ipcMain.handle('workbench:windowControl',(event,action)=>{requireLocalAssetSender(event);if(action==='minimize')win.minimize();else if(action==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize();}else if(action==='close'){if(!windowAccess.hide())win.close();}else throw Error('未知窗口操作');});
ipcMain.handle('workbench:localAssetDrop',(event,paths)=>{requireLocalAssetSender(event);return localAssetLinks.registerSelection(paths);});
ipcMain.handle('workbench:localAssetResolve',(event,id)=>{requireLocalAssetSender(event);return localAssetLinks.describe(id);});
ipcMain.handle('workbench:localAssetSync',(event,ids)=>{requireLocalAssetSender(event);return localAssetLinks.sync(ids);});
ipcMain.handle('workbench:localAssetOpenFolder',(event,id)=>{requireLocalAssetSender(event);const item=localAssetLinks.describe(id);shell.showItemInFolder(item.path);return {opened:true};});
ipcMain.handle('workbench:localAssetChoose',async event=>{requireLocalAssetSender(event);const result=await dialog.showOpenDialog(win,{title:'引用本地素材（不复制）',properties:['openFile','multiSelections'],filters:[{name:'图片、音频和视频',extensions:['png','jpg','jpeg','webp','gif','mp3','wav','m4a','ogg','flac','mp4','webm','mov']}]});return result.canceled?[]:localAssetLinks.register(result.filePaths);});
ipcMain.handle('workbench:localAssetChooseFolder',async event=>{requireLocalAssetSender(event);const result=await dialog.showOpenDialog(win,{title:'导入素材文件夹（包含子文件夹）',properties:['openDirectory']});return result.canceled?[]:localAssetLinks.registerSelection(result.filePaths);});
ipcMain.handle('workbench:localAssetRelinkSingle',async(event,payload)=>{requireLocalAssetSender(event);const id=String(payload?.id||''),otherIds=Array.isArray(payload?.otherIds)?payload.otherIds:[];const defaultPath=localAssetLinks.defaultRelinkDir([id]);const result=await dialog.showOpenDialog(win,{title:'重新定位原文件',defaultPath,properties:['openFile'],filters:[{name:'图片、音频和视频',extensions:['png','jpg','jpeg','webp','gif','mp3','wav','m4a','ogg','flac','mp4','webm','mov']}]});if(result.canceled||!result.filePaths.length)return {canceled:true};return {canceled:false,...localAssetLinks.relinkSingle(id,result.filePaths[0],otherIds)};});
ipcMain.handle('workbench:localAssetRelinkFolder',async(event,payload)=>{requireLocalAssetSender(event);const ids=Array.isArray(payload?.ids)?payload.ids:[];const defaultPath=localAssetLinks.defaultRelinkDir(ids);const result=await dialog.showOpenDialog(win,{title:'选择文件夹一键批量定位缺失素材（自动匹配子文件夹与同级目录）',defaultPath,properties:['openDirectory']});if(result.canceled||!result.filePaths.length)return {canceled:true,healedCount:0,resolved:{},missing:{}};return {canceled:false,...localAssetLinks.relinkFolder(result.filePaths,ids)};});
const bridgeServer = http.createServer(async (req, res) => {
  if(req.url?.startsWith('/workbench/pippit-canvas/')){
    const origin=String(req.headers.origin||'');
    if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)&&!(origin===''&&/^[a-p]{32}$/.test(String(req.headers['x-workbench-extension']||'')))){res.writeHead(403);return res.end();}
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Workbench-Extension');res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    if(req.method!=='POST'){res.writeHead(405);return res.end();}
    try{const body=await readBridgeJson(req),value=req.url==='/workbench/pippit-canvas/heartbeat'?pippitCanvasBroker.heartbeat(body):req.url==='/workbench/pippit-canvas/result'?(pippitCanvasBroker.complete(body),{ok:true}):null;if(!value)throw Error('未知画布连接入口');res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(value));}catch(error){res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:error.message}));}
  }
  if (await handleBrowserWorkbench(req, res)) return;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if(req.url?.startsWith('/workbench/local-media/')) return localAssetLinks.serve(req,res,req.url.split('/').pop());
  if(req.url?.startsWith('/workbench/studio-video/')) { const parts=req.url.split('?')[0].split('/').filter(Boolean); return videoStudioFiles.serve(req,res,decodeURIComponent(parts[2]||''),decodeURIComponent(parts[3]||'')); }
  if(req.url?.startsWith('/workbench/task-video/')) { const parts=req.url.split('?')[0].split('/').filter(Boolean); return videoStudioFiles.serveTask(req,res,decodeURIComponent(parts[2]||'')); }
  if (req.url === '/workbench/bridge-status' && req.method === 'GET') {
    const status = await activeBridge().status();
    res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
    return res.end(JSON.stringify({workbenchReady:true, ...status}));
  }
  if (req.url?.startsWith('/workbench/file') && req.method === 'GET') {
    try {
      const query = new URL(req.url, 'http://127.0.0.1:17842').searchParams;
      const descriptor = connectorBroker.fileFor(query.get('commandId'), query.get('index'));
      if (!descriptor) throw new Error('素材传输凭据已失效');
      const file = require('./asset-store').inside(descriptor.root, descriptor.relativePath);
      const stat = fs.statSync(file);
      const mime = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.aac':'audio/aac','.flac':'audio/flac'})[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type':mime, 'Content-Length':stat.size, 'Cache-Control':'no-store'});
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(404, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:false, error:String(error?.message || error)}));
    }
    return;
  }
  if (req.url === '/workbench/connector' && req.method === 'POST') {
    try {
      const result = connectorBroker.heartbeat(await readBridgeJson(req));
      res.writeHead(result.ok ? 200 : 400, {'Content-Type':'application/json'});
      return res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({ok:false, error:String(error?.message || error)}));
    }
  }
  if (req.url?.startsWith('/workbench/poll') && req.method === 'GET') {
    const connectorId = new URL(req.url, 'http://127.0.0.1:17842').searchParams.get('connectorId');
    const command = connectorBroker.poll(connectorId);
    res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify(command));
  }
  if (req.url === '/workbench/requeue' && req.method === 'POST') {
    try {
      const result = connectorBroker.requeue(await readBridgeJson(req));
      res.writeHead(result.ok ? 200 : 409, {'Content-Type':'application/json'});
      return res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(400, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({ok:false, error:String(error?.message || error)}));
    }
  }
  if (req.url === '/workbench/result' && req.method === 'POST') {
    try {
      connectorBroker.complete(await readBridgeJson(req));
      res.writeHead(204); res.end();
    } catch (_) {
      res.writeHead(400); res.end();
    }
    return;
  }
  res.writeHead(404); res.end();
});
bridgeServer.on('error', error => writeStartupError(error));
let bridgeStarting=null;
function startBridgeServer(){
  if(bridgeServer.listening)return Promise.resolve();
  if(bridgeStarting)return bridgeStarting;
  bridgeStarting=new Promise((resolve,reject)=>{
    const failed=error=>{bridgeServer.removeListener('listening',listening);reject(new Error(error.code==='EADDRINUSE'?'工作台连接端口 17842 已被占用。请退出其他版本的工作台后点击重新尝试。':error.message));};
    const listening=()=>{bridgeServer.removeListener('error',failed);writeStartupMarker('browser workbench service listening');resolve();};
    bridgeServer.once('error',failed);bridgeServer.once('listening',listening);
    bridgeServer.listen(process.env.WORKBENCH_PROFILE_DIR?0:17842,'127.0.0.1');
  }).finally(()=>{bridgeStarting=null;});
  return bridgeStarting;
}

