// Tests use real production main/preload/Next/Go, with isolated random ports and an isolated profile.
const {app,BrowserWindow,shell,Notification}=require('electron');
const completionNotices=[];let completionSounds=0;shell.beep=()=>completionSounds++;Notification.prototype.show=function(){completionNotices.push({title:this.title,body:this.body});};
const services=[];
const moduleService=require('./infinite-canvas-service');
const Original=moduleService.InfiniteCanvasService;
moduleService.InfiniteCanvasService=class extends Original {
  constructor(options){super({...options,port:0,backendPort:0});services.push(this);}
};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const end=Date.now()+30000;while(Date.now()<end){if(await check())return;await sleep(80);}throw new Error('界面等待超时：'+label);}
async function nativeWindow(){let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>/^http:\/\/127\.0\.0\.1:/.test(w.webContents.getURL())&&!w.webContents.isLoading());return Boolean(win);},'原生主窗口');await until(()=>win.webContents.executeJavaScript('[...document.querySelectorAll("button")].some(button=>button.textContent.includes("新建画布")&&!button.disabled)'), '原生应用交互初始化');return win;}
const originalExit=app.exit.bind(app);
app.exit=code=>{services.forEach(s=>s.stop());originalExit(code);};
module.exports={services,sleep,until,nativeWindow,completionNotices,get completionSounds(){return completionSounds;}};
