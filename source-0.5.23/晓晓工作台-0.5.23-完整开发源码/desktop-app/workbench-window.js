const path=require('node:path');

function revealWindow(win,screen){
  if(!win||win.isDestroyed())return false;
  if(win.isMinimized())win.restore();
  const bounds=win.getBounds();
  const visible=screen.getAllDisplays().some(({workArea:r})=>Math.min(bounds.x+bounds.width,r.x+r.width)-Math.max(bounds.x,r.x)>=100&&Math.min(bounds.y+bounds.height,r.y+r.height)-Math.max(bounds.y,r.y)>=60);
  if(!visible){const r=screen.getPrimaryDisplay().workArea;const width=Math.min(bounds.width,r.width),height=Math.min(bounds.height,r.height);win.setBounds({x:r.x+Math.round((r.width-width)/2),y:r.y+Math.round((r.height-height)/2),width,height});}
  win.setSkipTaskbar(false);win.show();win.moveTop();win.focus();return true;
}

function installWindowAccess({app,BrowserWindow,screen,Tray,Menu,nativeImage,ipcMain,shell,iconPath,dataDir,getWindow,createWindow,onError}){
  let opening=null,splash=null,tray=null,state={message:'正在打开工作台…',error:''};
  const reveal=()=>revealWindow(getWindow()||splash,screen);
  const publish=()=>{if(splash&&!splash.isDestroyed())splash.webContents.send('workbench:startup-state',state);};
  function startupWindow(){
    if(splash&&!splash.isDestroyed())return;
    splash=new BrowserWindow({width:540,height:320,resizable:false,backgroundColor:'#ffffff',title:'晓晓的 AI 工作台',icon:iconPath,show:true,webPreferences:{preload:path.join(__dirname,'startup-preload.js'),contextIsolation:true,nodeIntegration:false}});
    splash.setMenu(null);splash.webContents.setWindowOpenHandler(()=>({action:'deny'}));splash.webContents.on('will-navigate',event=>event.preventDefault());
    splash.webContents.on('did-finish-load',publish);splash.on('closed',()=>{splash=null;app.quit();});
    void splash.loadFile(path.join(__dirname,'startup.html')).catch(onError);
    revealWindow(splash,screen);
  }
  async function open(){
    if(!app.isReady()){await app.whenReady();}
    if(getWindow()&&!getWindow().isDestroyed()){reveal();return;}
    startupWindow();reveal();
    if(opening)return opening;
    state={message:'正在连接本地工作台…',error:''};publish();
    opening=Promise.resolve().then(createWindow).then(()=>{
      if(splash&&!splash.isDestroyed()){splash.removeAllListeners('closed');splash.destroy();splash=null;}
      reveal();
    }).catch(error=>{onError(error);state={message:'工作台暂时无法打开',error:error.message||String(error)};publish();reveal();}).finally(()=>{opening=null;});
    return opening;
  }
  ipcMain.handle('workbench:startup-action',async(event,action)=>{
    if(!splash||event.sender!==splash.webContents)throw Error('启动窗口来源无效');
    if(action==='retry')void open();
    else if(action==='logs')await shell.openPath(dataDir);
    else if(action==='quit')app.quit();
    else throw Error('未知启动操作');
  });
  app.on('second-instance',()=>{void open();});
  app.on('activate',()=>{void open();});
  app.whenReady().then(()=>{
    try{
    const image=nativeImage.createFromPath(iconPath).resize({width:16,height:16});
    tray=new Tray(image);tray.setToolTip('晓晓的 AI 工作台');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'打开工作台',click:()=>{void open();}},{type:'separator'},{label:'退出工作台',click:()=>app.quit()}]));
    tray.on('click',()=>{void open();});tray.on('double-click',()=>{void open();});
    }catch(error){onError(error);}
    void open();
  }).catch(onError);
  app.on('will-quit',()=>{tray?.destroy();tray=null;});
  const hide=()=>{const win=getWindow();if(!tray||!win||win.isDestroyed())return false;win.hide();win.setSkipTaskbar(true);return true;};
  return {open,reveal,hide};
}
module.exports={revealWindow,installWindowAccess};
