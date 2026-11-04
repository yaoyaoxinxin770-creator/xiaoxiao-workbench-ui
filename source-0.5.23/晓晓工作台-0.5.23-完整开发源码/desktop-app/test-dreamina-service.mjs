import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{DreaminaService,catalogFromHelp,parseJson}=require('./dreamina-service');
const help=JSON.parse(await fs.readFile(new URL('./dreamina-runtime/capabilities.json',import.meta.url),'utf8'));
const catalog=catalogFromHelp(help.text2video,help.multimodal2video);
assert.deepEqual(catalog.models,['seedance2.0','seedance2.0fast','seedance2.0_vip','seedance2.0fast_vip','seedance2.0mini','seedance2.5']);
assert.deepEqual(catalog.specs['seedance2.0_vip'].resolution.options,['720p','1080p','4k']);assert.equal(catalog.specs['seedance2.5'].duration.max,30);assert.equal(catalog.specs['seedance2.5'].references.images,30);assert.equal(catalog.specs['seedance2.0'].references.audioOnly,false);
assert.throws(()=>catalogFromHelp('changed help','changed help'),/不兼容/);assert.deepEqual(parseJson('logger warning\n{"gen_status":"querying"}'),{gen_status:'querying'});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'xiaoxiao-dreamina-service-')),calls=[];let mode='pending',paid=0,logged=true,loginChecks=0,reuse=false,badLogin=false,plainLogin=false;
const execute=async(exe,args,options)=>{
 assert.equal(options.windowsHide,true);calls.push(args);
 if(args[0]==='text2video'&&args[1]==='-h')return {stdout:help.text2video};if(args[0]==='multimodal2video'&&args[1]==='-h')return {stdout:help.multimodal2video};
 if(args[0]==='user_credit')return {stdout:JSON.stringify({user_id:logged?123:0,total_credit:logged?1200:0})};
 if(args[0]==='login'&&args.includes('--headless'))return {stdout:badLogin?'unexpected reply':reuse?'已复用当前本地 OAuth 登录态。':plainLogin?'请使用浏览器完成 OAuth Device Flow 登录。\nverification_uri: https://example.com/auth-text\nuser_code: TEXT-CODE\ndevice_code: private-text-challenge\npoll_interval: 1s\n':JSON.stringify({verification_uri:'https://example.com/auth',user_code:'TEST-CODE',device_code:'private-challenge'})};
 if(args[0]==='login'&&args[1]==='checklogin'){loginChecks++;logged=true;return {stdout:'{}'};}
 if(args[0]==='query_result'){
  const id=args.find(a=>a.startsWith('--submit_id=')).slice(12),output=args.find(a=>a.startsWith('--download_dir=')).slice(15);
  if(mode==='bad-id')return {stdout:JSON.stringify({submit_id:'different',gen_status:'success'})};
  if(mode==='fail')return {stdout:JSON.stringify({submit_id:id,gen_status:'fail',fail_reason:'AigcComplianceConfirmationRequired'})};
  if(mode==='error')throw Object.assign(Error('network timeout'),{code:'ETIMEDOUT'});
  if(mode==='pending')return {stdout:JSON.stringify({submit_id:id,gen_status:'querying'})};
  const file=mode==='escape'?path.join(temp,'outside.mp4'):path.join(output,'video.mp4');await fs.writeFile(file,'video');return {stdout:JSON.stringify({submit_id:id,gen_status:'success',result_json:{videos:[{path:file}]}})};
 }
 paid++;if(mode==='lost')throw Object.assign(Error('response lost'),{stdout:''});return {stdout:JSON.stringify({submit_id:'submit-'+paid,gen_status:'querying'})};
};
const payload={clientTaskId:'one',model:'seedance2.0',prompt:'中文 & $(test) 原文 @女主',duration:5,ratio:'16:9',resolution:'720p',references:[]};
try{
 const service=new DreaminaService({executable:'mock-cli',dataDir:temp,execute});
 const results=await Promise.all([service.submit(payload),service.submit(payload)]);assert.equal(paid,1);assert.equal(results[0].id,'dreamina:one');
 await service.submit(payload);assert.equal(paid,1);await assert.rejects(()=>service.submit({...payload,prompt:'changed'}),/不同生成内容/);assert.equal(paid,1);
 const command=calls.find(a=>a[0]==='text2video'&&a.includes('--poll=0'));assert.ok(command.includes('--prompt='+payload.prompt));assert.ok(command.includes('--ratio=16:9'));
 assert.equal((await service.query('dreamina:one')).status,'processing');
 const restarted=new DreaminaService({executable:'mock-cli',dataDir:temp,execute});mode='complete';const completed=await restarted.query('dreamina:one');assert.equal(completed.status,'completed');assert.match(completed.media[0].dataUrl,/^data:video\/mp4;base64,/);const queries=calls.filter(a=>a[0]==='query_result').length;await restarted.query('dreamina:one');assert.equal(calls.filter(a=>a[0]==='query_result').length,queries);assert.equal(paid,1);
 const refs=[{kind:'image',name:'女主.png',dataUrl:'data:image/png;base64,YQ=='},{kind:'video',name:'参考.mp4',dataUrl:'data:video/mp4;base64,YQ=='},{kind:'audio',name:'配音.wav',dataUrl:'data:audio/wav;base64,YQ=='}];
 await service.submit({...payload,clientTaskId:'mixed',references:refs});const multi=calls.find(a=>a[0]==='multimodal2video'&&a.includes('--poll=0'));assert.deepEqual(multi.filter(a=>/^--(?:image|video|audio)=/.test(a)).map(a=>a.split('=')[0]),['--image','--video','--audio']);
 await assert.rejects(()=>service.submit({...payload,clientTaskId:'audio-only',references:[refs[2]]}),/至少需要/);await assert.rejects(()=>service.submit({...payload,clientTaskId:'bad-duration',duration:31}),/时长/);await assert.rejects(()=>service.submit({...payload,clientTaskId:'bad-res',resolution:'1080p'}),/清晰度/);await assert.rejects(()=>service.submit({...payload,clientTaskId:'bad-model',model:'invented'}),/不支持该模型/);
 await service.submit({...payload,clientTaskId:'frames',model:'seedance2.5',firstLast:true,references:[refs[0],refs[0]]});const frames=calls.find(a=>a[0]==='frames2video');assert.ok(!frames.some(a=>a.startsWith('--ratio=')));assert.ok(frames.some(a=>a.startsWith('--first='))&&frames.some(a=>a.startsWith('--last=')));
 await service.submit({...payload,clientTaskId:'first',firstLast:true,references:[refs[0]]});assert.ok(calls.some(a=>a[0]==='image2video'&&a.some(v=>v.startsWith('--image='))));
 mode='fail';assert.equal((await service.query('dreamina:mixed')).status,'failed');const failedPaid=paid,failedQueries=calls.filter(a=>a[0]==='query_result').length;assert.equal((await service.submit({...payload,clientTaskId:'mixed',references:refs})).status,'failed');assert.equal((await service.query('dreamina:mixed')).status,'failed');assert.equal(paid,failedPaid);assert.equal(calls.filter(a=>a[0]==='query_result').length,failedQueries);mode='bad-id';await assert.rejects(()=>service.query('dreamina:frames'),/不一致/);mode='escape';await assert.rejects(()=>service.query('dreamina:first'),/路径/);
 mode='lost';await assert.rejects(()=>service.submit({...payload,clientTaskId:'uncertain'}),/未完成/);const before=paid;await assert.rejects(()=>restarted.submit({...payload,clientTaskId:'uncertain'}),/阻止重复扣费/);assert.equal(paid,before);assert.equal((await restarted.query('dreamina:uncertain')).status,'failed');
 assert.throws(()=>service.query('dreamina:../outside'),/无效/);
 logged=false;assert.equal((await service.status()).logged_in,false);const challenge=await service.login();assert.equal(challenge.code,'TEST-CODE');assert.equal(JSON.stringify(challenge).includes('private-challenge'),false);await service.login();assert.equal(calls.filter(a=>a.includes('--headless')).length,1);assert.equal((await service.checkLogin()).logged_in,true);assert.equal(loginChecks,1);assert.equal((await service.credits()).balance,1200);logged=false;reuse=true;const reused=await service.login();assert.equal(reused.reused,true);assert.equal(reused.logged_in,false);assert.equal(reused.accountUnavailable,true);assert.equal(service.loginChallenge,null);badLogin=true;await assert.rejects(()=>service.login(),/有效 JSON/);badLogin=false;reuse=false;plainLogin=true;const textChallenge=await service.login();assert.equal(textChallenge.url,'https://example.com/auth-text');assert.equal(textChallenge.code,'TEXT-CODE');assert.equal(JSON.stringify(textChallenge).includes('private-text-challenge'),false);assert.equal((await service.checkLogin()).logged_in,true);plainLogin=false;logged=false;await assert.rejects(()=>service.submit({...payload,clientTaskId:"no-account"}),/账号权限/);
 const files=await fs.readdir(temp);for(const dir of files){const stored=await fs.readFile(path.join(temp,dir,'task.json'),'utf8').catch(()=> '');assert.equal(/private-challenge|credit.token|https:|provider/i.test(stored),false);}
 const installed=new DreaminaService({executable:path.join(import.meta.dirname,'dreamina-runtime/dreamina.exe'),dataDir:temp});assert.deepEqual((await installed.models()).models,catalog.models);
 console.log('即梦 CLI 服务测试通过：实际二进制能力发现、参数验证、文生/首尾帧/图视频音频、并发去重、原任务恢复、结果路径、失败与不确定提交保护、授权挑战隔离；零付费生成。');
}finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('xiaoxiao-dreamina-service-'));await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
