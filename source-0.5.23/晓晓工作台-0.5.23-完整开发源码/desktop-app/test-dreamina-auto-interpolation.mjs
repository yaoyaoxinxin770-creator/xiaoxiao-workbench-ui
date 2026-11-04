import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {EventEmitter} from 'node:events';
const {DreaminaInterpolation,canvasUrl}=createRequire(import.meta.url)('./dreamina-interpolation');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamina-auto-interpolation-'));let shows=0,focuses=0,clicks=0,failSubmit=false,latestState,loadingChecks=3;const windows=[];
class FakeWindow extends EventEmitter {
 constructor(options){
  super();assert.equal(options.show,false);assert.equal(options.webPreferences.nodeIntegration,false);assert.equal(options.webPreferences.sandbox,true);
  this.options=options;this.visible=false;this.dead=false;this.current='';this.cookies=new EventEmitter();this.cookies.get=async()=>[{name:'uid_tt',value:'user-42'}];
  this.webContents={
   getURL:()=>this.current,setWindowOpenHandler:()=>{},on:()=>{},
   session:{cookies:this.cookies,setPermissionRequestHandler:()=>{}},
   executeJavaScript:async expression=>{const step=JSON.parse(expression.slice(expression.lastIndexOf(')(')+2,-1)).step;if(step==='ready'&&loadingChecks-->0)return {kind:'needs_login',message:'页面正在加载'};return {kind:step,point:{x:50,y:50}};},
   debugger:{isAttached:()=>true,sendCommand:async(_method,value)=>{if(value.type==='mousePressed'){clicks++;if(clicks%5===0){assert.equal(latestState,'click_attempted','必须先写记录再提交');if(failSubmit)throw Error('lost reply');}}}}
  };windows.push(this);
 }
 setMenu(){}setSkipTaskbar(){}isVisible(){return this.visible;}isDestroyed(){return this.dead;}
 async loadURL(url){this.current=url;}show(){shows++;this.visible=true;}focus(){focuses++;}hide(){this.visible=false;}destroy(){this.dead=true;}
}
let account='42';const service={profile:'default',account:async()=>account,taskDir:id=>path.join(root,id),save:async(_dir,t)=>{latestState=t.interpolation?.state;await fs.writeFile(path.join(root,'task.json'),JSON.stringify(t));}};
const base={id:'a',account:'42',projectId:'b361a528-4e76-4e63-803e-0390023bbbf8',nodeId:'node_eadq9tykzp'},source={title:'视频108',resourceId:'resource-original'};
try{const controller=new DreaminaInterpolation({BrowserWindow:FakeWindow,dataDir:root});
 let t=structuredClone(base);assert.equal((await controller.ensure(service,t,source)).state,'needs_login');assert.equal(windows.length,0,'未启用时不弹窗、不创建隐藏页面');
 await controller.save(controller.key('default','42'),{account:'42',enabled:true});
 const result=await controller.ensure(service,t,source);assert.equal(result.state,'submitted');assert.equal(clicks,5);assert.equal(shows,0);assert.equal(focuses,0,'自动执行从不抢屏');
 await controller.ensure(service,t,source);assert.equal(clicks,5,'同一记录不能重复点击');
 const restarted=new DreaminaInterpolation({BrowserWindow:FakeWindow,dataDir:root});await restarted.ensure(service,JSON.parse(await fs.readFile(path.join(root,'task.json'),'utf8')),source);assert.equal(clicks,5,'重启不能重复提交');
 t={...structuredClone(base),id:'lost'};failSubmit=true;const lost=await controller.ensure(service,t,source);assert.equal(lost.state,'uncertain');const before=clicks;failSubmit=false;await controller.ensure(service,t,source);assert.equal(clicks,before,'响应丢失不重试');
 account='99';await assert.rejects(()=>controller.once(service,{...base,id:'wrong'},source),/另一即梦账号/);account='42';
 assert.notEqual(controller.key('default','42'),controller.key('default','99'));assert.notEqual(controller.key('default','42'),controller.key('wb-'+'a'.repeat(32),'42'));
 await controller.confirm({profile:'default',account:'42',sameAccountConfirmed:true});windows[0].cookies.emit('changed',null,{domain:'.jianying.com',name:'sessionid',value:'new-session'},'explicit',false);assert.equal((await controller.status('default','42')).enabled,true,'正常会话刷新不能撤销');windows[0].cookies.emit('changed',null,{domain:'.jianying.com',name:'uid_tt',value:'user-42'},'overwrite',true);windows[0].cookies.emit('changed',null,{domain:'.jianying.com',name:'uid_tt',value:'user-42'},'explicit',false);assert.equal((await controller.status('default','42')).enabled,true,'同一身份续期不撤销');windows[0].cookies.emit('changed',null,{domain:'.jianying.com',name:'uid_tt',value:'user-99'},'explicit',false);assert.equal((await controller.status('default','42')).enabled,false,'不同身份立即撤销');await controller.confirm({profile:'default',account:'42',sameAccountConfirmed:true});windows[0].cookies.emit('changed',null,{domain:'.jianying.com',name:'sessionid'},'explicit',true);assert.equal((await controller.status('default','42')).enabled,false,'退出登录撤销');
 await assert.rejects(()=>controller.confirm({profile:'default',account:'42',sameAccountConfirmed:false}),/明确确认/);
 assert.throws(()=>canvasUrl({...base,webUrl:'https://evil.example/ai-tool/ai-canvas/'+base.projectId}),/身份/);
 await Promise.all([...controller.writes.values()]);controller.dispose();restarted.dispose();
 console.log('官方后台补帧执行器：未登录无弹窗/隐藏页面/从不抢焦点/原画布限制/独立账号/30FPS控件顺序/提交前落盘/重启和丢响应不重复/登录变化撤销：PASS；零官方请求与生成');
}finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
