const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),http=require('http');
const temporary=process.env.JIMENG_CDP_UI_TEST_ROOT;
assert.ok(temporary);
app.setPath('userData',temporary);
const originalCreate=http.createServer;
let quickOpenCalls=0;
require('./cdp-bridge').CdpBridge.prototype.openAndConnect=async()=>{quickOpenCalls++;return {ok:true,online:true,connector:{url:'https://jimeng.jianying.com/ai-tool/canvas/ui-fixture'}};};
let server;
http.createServer=function(...args){const value=originalCreate.apply(this,args);const listen=value.listen;value.listen=function(port,...rest){if(port===17842){server=value;return listen.call(value,0,...rest);}return listen.call(value,port,...rest);};return value;};
const fixture=require('./native-ui-fixture.cjs');
require('./main');
app.whenReady().then(async()=>{
  try{
    const win=await fixture.nativeWindow();
    if(!await win.webContents.executeJavaScript('Boolean(document.querySelector(".workbench-rail"))'))await win.webContents.executeJavaScript('document.querySelector("[data-rail-toggle]").click()');
    await fixture.until(()=>win.webContents.executeJavaScript("Boolean(document.querySelector('a[href=\"/jimeng\"]'))"),"展开导航后显示即梦入口");
    await win.webContents.executeJavaScript("document.querySelector('a[href=\"/jimeng\"]').click()");
    await fixture.until(()=>win.webContents.executeJavaScript('Boolean(window.personalWorkbench && document.getElementById("cdpSettingsButton"))'),"即梦原生工具加载");
    if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    assert.ok(await win.webContents.executeJavaScript('document.getElementById("cdpSettingsButton").getBoundingClientRect().width > 0'), 'bridge entry visible on native Jimeng page');
    assert.ok(await win.webContents.executeJavaScript('document.getElementById("cdpOpenBrowserButton").getBoundingClientRect().width > 0'), 'one-click browser button visible on native Jimeng page');
    await win.webContents.executeJavaScript('document.getElementById("cdpOpenBrowserButton").click()');
    const openDeadline=Date.now()+5000;
    while(Date.now()<openDeadline&&quickOpenCalls===0)await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(quickOpenCalls,1,'native page button uses the actual preload IPC');
    await win.webContents.executeJavaScript('document.getElementById("cdpSettingsButton").click()');
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      if(await win.webContents.executeJavaScript('document.getElementById("cdpDetail").textContent.includes("9333")'))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(await win.webContents.executeJavaScript('document.getElementById("cdpSettingsDialog").open'),true);
    const settings=await win.webContents.executeJavaScript('window.desktopBridge.cdpSettings()');
    assert.equal(settings.mode,'cdp');assert.equal(settings.port,9333);
    await win.webContents.executeJavaScript('window.desktopBridge.cdpConfigure({mode:"extension",port:9333})');
    const status=await win.webContents.executeJavaScript('window.desktopBridge.connectorStatus()');
    assert.equal(status.online,false);
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/workbench/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'cdpSettings'})}).then(r=>r.json());
    assert.equal(response.result.mode,'extension');
    const openResponse=await fetch('http://127.0.0.1:'+server.address().port+'/workbench/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'cdpOpenAndConnect'})}).then(r=>r.json());
    assert.equal(openResponse.result.online,true,'browser-hosted workbench exposes the same one-click action');
    assert.equal(quickOpenCalls,2);
    const script=await fetch('http://127.0.0.1:'+server.address().port+'/desktop-app/cdp-controls.js');
    assert.equal(script.status,200);
    win.showInactive();await new Promise(resolve=>setTimeout(resolve,250));
    const screenshot=await Promise.race([win.webContents.capturePage(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("CDP 设置界面截图超时")),10000))]);
    const file=path.join(__dirname,'../output/cdp-verification/desktop-settings.png');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,screenshot.toPNG());
    console.log('Production Electron entry: new bridge modules load, actual preload IPC, settings dialog, mode persistence and localhost API/static route: PASS');
    server.close();app.exit(0);
  }catch(error){console.error(error);server?.close();app.exit(1);}
});
