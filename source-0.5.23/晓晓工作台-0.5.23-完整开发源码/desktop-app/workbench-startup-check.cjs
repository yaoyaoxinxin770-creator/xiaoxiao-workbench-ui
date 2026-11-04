const {app,BrowserWindow,Tray}=require('electron');
let trayMenu;const originalSetMenu=Tray.prototype.setContextMenu;Tray.prototype.setContextMenu=function(menu){trayMenu=menu;return originalSetMenu.call(this,menu);};
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const temporary=process.env.WORKBENCH_PROFILE_DIR;assert.ok(temporary);app.setPath('userData',temporary);app.disableHardwareAcceleration();
if(process.argv.includes('--second-launch')){require('./main');}
else{
  const fixture=require('./native-ui-fixture.cjs');
  const Service=require('./infinite-canvas-service').InfiniteCanvasService;
  const start=Service.prototype.start;let first=true;
  Service.prototype.start=function(){if(first){first=false;return Promise.resolve({ok:false,error:'验收：端口 17843 已被占用'});}return start.call(this);};
  process.on('unhandledRejection',error=>{console.error(error);app.exit(1);});
  app.whenReady().then(async()=>{
    try{
      require('./main');
      let splash;await fixture.until(()=>{splash=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/startup.html'));return Boolean(splash);},'可见启动窗口');
      const runSplash=s=>splash.webContents.executeJavaScript(s);
      await fixture.until(()=>runSplash('document.getElementById("error").textContent.includes("已被占用")'),'失败提示与重试入口');
      assert.equal(splash.isVisible(),true);assert.equal(await runSplash('document.getElementById("retry").hidden'),false);
      await runSplash('document.getElementById("retry").click()');
      const win=await fixture.nativeWindow();await fixture.until(()=>BrowserWindow.getAllWindows().length===1,'启动窗口收起');
      assert.equal(win.isVisible(),true);
      const service=fixture.services[0],pid=service.child.pid,webPid=service.webChild.pid;
      async function launchAgain(){
        const child=spawn(process.execPath,['--disable-gpu',__filename,'--second-launch'],{env:{...process.env},windowsHide:true,stdio:['ignore','pipe','pipe']});
        let error='';child.stderr.on('data',d=>error+=d);child.stdout.resume();
        const code=await Promise.race([new Promise(resolve=>child.once('exit',resolve)),fixture.sleep(10000).then(()=>{child.kill();throw Error('重复实例未及时退出');})]);
        assert.equal(code,0,error);
        await fixture.until(()=>win.isVisible()&&!win.isMinimized(),'重复打开恢复窗口');
        assert.equal(service.child.pid,pid);assert.equal(service.webChild.pid,webPid);assert.equal(BrowserWindow.getAllWindows().length,1);
      }
      await win.webContents.executeJavaScript('window.__trayProbe="保留草稿";window.desktopBridge.windowControl("close")');await fixture.until(()=>!win.isVisible(),'标题栏关闭收进托盘');assert.equal(win.isDestroyed(),false);assert.equal(service.child.pid,pid);assert.equal(service.webChild.pid,webPid);await launchAgain();assert.equal(await win.webContents.executeJavaScript('window.__trayProbe'),'保留草稿','托盘恢复不重建窗口或丢失草稿');
      win.minimize();await launchAgain();
      win.setBounds({x:-10000,y:-10000,width:1500,height:920});win.hide();await launchAgain();assert.ok(win.getBounds().x>-10000);
      const screenshot=path.resolve(__dirname,'../output/startup-0.4.40.png');fs.writeFileSync(screenshot,(await win.webContents.capturePage()).toPNG());
      assert.ok(trayMenu?.items.find(item=>item.label==='退出工作台'));await win.webContents.executeJavaScript('window.desktopBridge.windowControl("close")');assert.equal(win.isVisible(),false);console.log('启动恢复验收通过：失败窗口可见并可重试、最小化/隐藏/屏外恢复、双实例真实启动、服务不重复、标题栏收进托盘保留草稿、托盘菜单真正退出');setTimeout(()=>{console.error('托盘退出未结束进程');app.exit(1);},5000).unref();trayMenu.items.find(item=>item.label==='退出工作台').click();
    }catch(error){console.error(error);app.exit(1);}
  });
}
