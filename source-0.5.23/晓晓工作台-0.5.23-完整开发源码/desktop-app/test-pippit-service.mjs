import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{PippitService}=require('./pippit-service');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'xiaoxiao-pippit-'));
const calls=[]; let queryMode='pending', submitMode='ok';
const execute=async(executable,args,options)=>{
  assert.equal(executable,'test-cli.exe');assert.equal(options.windowsHide,true);calls.push(args);if(!['status','login','logout'].includes(args[0]))assert.equal(args[args.indexOf('--team-id')+1],'0','个人版固定个人积分空间');
  let value={};
  if(args[0]==='status')value={logged_in:true,uid:'private-account'};
  if(args[0]==='get-credit-balance')value={total_remain_amount:'15181'};
  if(args[0]==='model' && args[1]==='list'){assert.ok(args.includes('--refresh'),'模型列表须刷新账号当前可用模型');value={models:args[3]==='image'?[{name:'真实图片模型'}]:[{key:'real-video',name:'真实视频模型'},{key:'Seedance_2.5_draft',name:'Seedance 2.5 Draft'}]};}
  if(args[0]==='model' && args[1]==='describe')value={model:{ratio:{options:args[args.indexOf('--type')+1]==='image'?[2,6]:['16:9','1:1'],option_labels:{2:'16:9',6:'1:1'}},resolution:{options:['2K','720p']}}};
  if(args[0].startsWith('generate-')) {
    if(submitMode==='uncertain')throw new Error('连接中断，提交结果未知');
    value={thread_id:'thread-'+args[0],run_id:'run-'+args[0],web_thread_link:'https://xyq.jianying.com/test'};
  }
  if(args[0]==='query-result') {
    assert.match(args[2],/^thread-/);assert.match(args[4],/^run-/);
    value={completed:false};
    if(queryMode==='error')value={completed:true,error_message:'服务端拒绝生成'};
    if(queryMode==='done' || queryMode==='outside') {
      const image=args[2].includes('image'),file=queryMode==='outside'?path.join(temp,'foreign.png'):path.join(args[6],image?'result.png':'result.mp4');
      await fs.writeFile(file,Buffer.from('media'));
      value={completed:true,thread_id:args[2],run_id:args[4],[image?'images':'videos']:[{output_path:file,...(path.basename(path.dirname(args[6]))==='draft1'?{draft:true,draft_task_id:'draft-task-abc'}:path.basename(path.dirname(args[6]))==='final1'?{draft:false,draft_task_id:'draft-task-abc'}:{})}]};
    }
  }
  return {stdout:JSON.stringify(value)};
};
try {
  const service=new PippitService({executable:'test-cli.exe',dataDir:temp,execute});
  assert.deepEqual(await service.status(),{logged_in:true},'不暴露账号凭据');
  assert.deepEqual(await service.credits(),{balance:15181},'使用小云雀账号的实时积分余额');
  assert.deepEqual(await service.models(),{models:['真实图片模型','real-video','Seedance_2.5_draft'],modelCapabilities:{'真实图片模型':'image','real-video':'video','Seedance_2.5_draft':'video'}});
  const image={type:'image',model:'真实图片模型',prompt:'保留原文 " & $(test)',ratio:'1:1',resolution:'2k',clientTaskId:'image1',references:[{kind:'image',dataUrl:'data:image/png;base64,aW1hZ2U='}]};
  const [first,second]=await Promise.all([service.submit(image),service.submit(image)]);
  assert.equal(first.id,second.id);assert.equal(calls.filter(args=>args[0]==='generate-image').length,1,'并发同一 ID 只能提交一次');
  const args=calls.find(args=>args[0]==='generate-image');
  assert.equal(args[args.indexOf('--prompt')+1],image.prompt,'原始提示词由参数数组传入，不能经 shell 执行');
  assert.equal(args[args.indexOf('--ratio')+1],'6');assert.equal(args[args.indexOf('--resolution')+1],'2K');
  assert.equal(await fs.readFile(args[args.indexOf('--image')+1],'utf8'),'image');
  const manifest=JSON.parse(await fs.readFile(path.join(temp,'image1','task.json'),'utf8'));assert.deepEqual(manifest.referenceFiles,[{kind:'image',name:'reference-0.png',file:'reference-0.png',mimeType:'image/png',bytes:5}]);assert.ok(!JSON.stringify(manifest).includes('base64'),'诊断只保存元数据，不复制素材内容');
  assert.equal((await service.query(first.id)).status,'processing');
  queryMode='error';await assert.rejects(()=>service.query(first.id),/服务端拒绝/,'退出码 0 的错误仍须报错');
  const restarted=new PippitService({executable:'test-cli.exe',dataDir:temp,execute});
  await restarted.submit(image);assert.equal(calls.filter(args=>args[0]==='generate-image').length,1,'重启后保留原任务，不能重提');
  queryMode='outside';await assert.rejects(()=>restarted.query(first.id),/不属于本次任务/);
  queryMode='done';assert.match((await restarted.query(first.id)).media[0].dataUrl,/^data:image\/png;base64,/);
  assert.equal((await restarted.submit(image)).status,'processing','重复创建已完成任务仍须先查询实际媒体，不能返回缺少产物的完成状态');
  const simultaneous=await Promise.all([restarted.query(first.id),restarted.query(first.id)]);assert.equal(simultaneous[0].id,simultaneous[1].id);
  const previousQueries=calls.filter(args=>args[0]==='query-result').length;
  await restarted.query(first.id);assert.equal(calls.filter(args=>args[0]==='query-result').length,previousQueries,'已下载结果可以从原任务恢复');
  await assert.rejects(()=>service.submit({...image,clientTaskId:'bad-ratio',ratio:'9:16'}),/不支持所选比例/);
  await assert.rejects(()=>service.submit({...image,clientTaskId:'bad-audio',references:[{kind:'audio',dataUrl:'data:audio/mpeg;base64,YQ=='}]}),/不支持该参考/);
  await assert.rejects(()=>service.query('pippit:../../escape'),/无效/);
  const video=await service.submit({type:'video',model:'real-video',prompt:'使用图和音频',clientTaskId:'video1',ratio:'16:9',resolution:'720p',duration:6,references:[{kind:'image',dataUrl:'data:image/png;base64,YQ=='},{kind:'audio',dataUrl:'data:audio/wav;base64,Yg=='}]});
  const videoArgs=calls.find(args=>args[0]==='generate-video');assert.ok(videoArgs.indexOf('--image')<videoArgs.indexOf('--audio'));assert.equal(videoArgs[videoArgs.indexOf('--task-type')+1],'reference');assert.equal((await service.query(video.id)).media[0].mimeType,'video/mp4');
  await service.submit({type:'video',model:'real-video',prompt:'参考原片',clientTaskId:'video-reference',references:[{kind:'video',dataUrl:'data:video/mp4;base64,YQ=='}]});
  const referenceArgs=calls.filter(args=>args[0]==='generate-video').at(-1);assert.ok(referenceArgs.includes('--video'));assert.equal(referenceArgs[referenceArgs.indexOf('--task-type')+1],'reference','参考视频应走官方参考生成模式，由服务端判定优惠');
  const draft=await service.submit({type:'video',model:'Seedance_2.5_draft',prompt:'测试样片',clientTaskId:'draft1',ratio:'16:9',resolution:'720p',duration:6,references:[]});
  const draftArgs=calls.filter(args=>args[0]==='generate-video').at(-1);
  assert.ok(draftArgs.includes('--draft'),'样片必须使用 CLI 的 draft 参数');
  assert.ok(!draftArgs.includes('--resolution'),'样片分辨率由服务端固定为 480P');
  const draftResult=await service.query(draft.id);
  assert.equal(draftResult.draft,true);assert.equal(draftResult.draftTaskId,'draft-task-abc','样片任务 ID 必须返回给画布以便转成片');
  const final=await service.submit({type:'video',model:'Seedance_2.5_draft',draftTaskId:'draft-task-abc',prompt:'',clientTaskId:'final1'});
  assert.equal(final.status,'processing');
  const finalResult=await service.query(final.id);assert.equal(finalResult.draft,false);assert.equal(finalResult.draftTaskId,undefined,'成片不能再显示转成片入口');
  const finalArgs=calls.filter(args=>args[0]==='generate-video').at(-1);
  assert.equal(finalArgs[finalArgs.indexOf('--draft-task-id')+1],'draft-task-abc');
  assert.ok(!finalArgs.includes('--draft') && !finalArgs.includes('--prompt'),'转成片只引用已存在样片，不再传生成参数');
  await assert.rejects(()=>service.submit({type:'video',model:'real-video',draftTaskId:'draft-task-abc',clientTaskId:'invalid-final'}),/有效的小云雀样片/);
  await assert.rejects(()=>service.submit({type:'video',model:'Seedance_2.5_draft',draftTaskId:'../escape',clientTaskId:'invalid-task-id'}),/有效的小云雀样片/);
  submitMode='uncertain';const uncertain={...image,clientTaskId:'unknown'};
  await assert.rejects(()=>service.submit(uncertain),/结果未知/);
  const count=calls.filter(args=>args[0]==='generate-image').length;
  await assert.rejects(()=>restarted.submit(uncertain),/阻止重复提交/);
  assert.equal(calls.filter(args=>args[0]==='generate-image').length,count);
  const packaged=new PippitService({executable:path.join(import.meta.dirname,'pippit-runtime','pippit-tool-cli.exe'),dataDir:temp});
  assert.equal(typeof (await packaged.status()).logged_in,'boolean','实际打包的 CLI 必须可运行');
  console.log('小云雀测试通过：模型发现、引用落盘、图片/视频、样片及转成片、路径隔离、重启恢复和重复扣费保护；实际 CLI 状态检查完成。');
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(temp).startsWith('xiaoxiao-pippit-'));
  await fs.rm(temp,{recursive:true,force:true});
}
