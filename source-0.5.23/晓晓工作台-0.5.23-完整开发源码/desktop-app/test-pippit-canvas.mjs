import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{PippitCanvasService}=require('./pippit-canvas-service'),{PippitService}=require('./pippit-service');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'xiaoxiao-canvas-sync-')),canvasId='4905808735756',projectId='4901767846668',url='https://xyq.jianying.com/project?projectId='+projectId+'&canvasId='+canvasId;
let scope='account-A',uploads=0,creates=0,allocation=0,mode='ok';const docs=new Map(),calls=[];
const fresh=()=>({rootCanvasId:canvasId,assets:{[canvasId]:{type:'canvas',content:{metadata:{title:'指定画布',projectId},nodes:{keep:{id:'keep',x:0,y:0,w:300,h:200}}}},keep:{type:'text',content:{text:'保留原节点'}}}});
const document=()=>{if(!docs.has(scope))docs.set(scope,fresh());return docs.get(scope);};
const execute=async(executable,args,options)=>{assert.equal(options.windowsHide,true);calls.push(args);const name=args[5],input=JSON.parse(await fs.readFile(args[args.indexOf('--file')+1],'utf8'));assert.equal(args[args.indexOf('--canvas-id')+1],canvasId);let result;
 if(name==='get_snapshot')result={ok:true,data:{document:document()}};
 else if(name==='create_biz_node'){creates++;assert.equal(input.nodeKind,'video');assert.equal(input.initialData.source,'uploaded');assert.equal(input.initialData.assetId,'source-video');assert.equal(input.initialData.durationMs,6050);const doc=document();if(mode!=='unknown'){doc.assets[input.id]={type:'biz/video',content:input.initialData};doc.assets[canvasId].content.nodes[input.id]={id:input.id,type:'biz/video',x:0,y:300,w:420,h:236};}if(mode!=='ok')throw Object.assign(Error('连接中断'),{stderr:'事务响应中断'});result={ok:true};}
 else throw Error('未知语义命令 '+name);return {stdout:JSON.stringify(result)};
};
const pippit=new PippitService({executable:'cli.exe',dataDir:path.join(temp,'pippit'),execute:async()=>{throw Error('禁止生成')}});
pippit.command=async args=>{calls.push(args);if(args[0]==='status')return {logged_in:true,credential_scope:scope};if(args[1]==='upload'){uploads++;return {state:'ready',pippit_asset_id:'media-'+uploads,asset_id:'source-video',asset:{Video:{metadata:{width:854,height:480,duration_ms:6050},vid:'vod-video'}}};}if(args[1]==='get')return {assets:[{PippitAssetID:args[3],Video:{asset_id:'source-video',metadata:{width:854,height:480,duration_ms:6050},vid:'vod-video'}}]};if(args[1]==='allocate')return {asset_ids:[String(9000+ ++allocation)]};throw Error('禁止调用 '+args[0]);};
const service=()=>new PippitCanvasService({pippit,dataDir:path.join(temp,'canvas'),canvasEntry:'run.cjs',nodeExecutable:'node.exe',execute});
async function seed(id){const dir=pippit.taskDir(id),output=path.join(dir,'output');await fs.mkdir(output,{recursive:true});const file=path.join(output,'result.mp4');await fs.writeFile(file,'video');await pippit.save(dir,{type:'video',status:'completed',result:{completed:true,videos:[{output_path:file}]}});return file;}
try{
 const svc=service(),id='pippit:completed1';await seed(id);
 assert.equal((await svc.sync({projectKey:'local-project',items:[{taskId:id}],automatic:true})).disabled,true);
 await assert.rejects(()=>svc.configure({projectKey:'local-project',url:'https://evil.test/project?projectId=1&canvasId=2'}),/官网/);
 await assert.rejects(()=>svc.configure({projectKey:'local-project',url:url.replace(projectId,'1')}),/不匹配/);
 await svc.configure({projectKey:'local-project',url,auto:true});const original=JSON.stringify(document().assets.keep);
 const requests={projectKey:'local-project',items:[{taskId:id,title:'视频 01'}]};const result=await Promise.all([svc.sync(requests),svc.sync(requests)]);
 assert.deepEqual(result.map(r=>({synced:r.synced,skipped:r.skipped,failed:r.failed})).sort((a,b)=>b.synced-a.synced),[{synced:1,skipped:0,failed:0},{synced:0,skipped:1,failed:0}],"并发配置读取的完成顺序不保证调用顺序，但必须只同步一次且另一请求复用");assert.equal(uploads,1);assert.equal(creates,1);assert.equal(JSON.stringify(document().assets.keep),original,'不修改已有节点');
 assert.equal((await service().sync(requests)).skipped,1,'重启不重复上传/创建');
 const unknown='pippit:unknown';await seed(unknown);mode='unknown';assert.equal((await svc.sync({...requests,items:[{taskId:unknown}]})).failed,1);const prior=creates;mode='ok';assert.equal((await service().sync({...requests,items:[{taskId:unknown}]})).failed,1);assert.equal(creates,prior,'未确认的写入不盲目重放');
 const lost='pippit:lost-ack';await seed(lost);mode='lost';assert.equal((await svc.sync({...requests,items:[{taskId:lost}]})).synced,1,'响应丢失后回读确认实际节点');mode='ok';
 const processing='pippit:processing';await seed(processing);await svc.save(svc.journal(scope,canvasId,processing,0),{phase:'uploading',uploadedAssetId:'known-media'});const beforeProcessing=uploads;assert.equal((await svc.sync({...requests,items:[{taskId:processing}]})).synced,1,'处理中的已知素材通过回查恢复');assert.equal(uploads,beforeProcessing,'回查不能重新上传');
 scope='account-B';assert.equal((await svc.sync(requests)).synced,1,'不同账号隔离同步记录');scope='account-A';
 await svc.configure({projectKey:'local-project',url,auto:false});assert.equal((await svc.sync({...requests,automatic:true})).disabled,true,'关闭自动同步不影响生成');assert.equal((await svc.sync(requests)).skipped,1,'手动历史同步仍可使用');
 assert.equal((await svc.sync({projectKey:'other-project',items:[{taskId:id}]})).disabled,true,'其他本地项目不能使用这个目标');
 const bad='pippit:outside';const file=await seed(bad),task=await pippit.read(pippit.taskDir(bad));task.result.videos[0].output_path=path.join(temp,'foreign.mp4');await fs.writeFile(task.result.videos[0].output_path,'bad');await pippit.save(pippit.taskDir(bad),task);const up=uploads;assert.equal((await svc.sync({...requests,items:[{taskId:bad}]})).failed,1);assert.equal(uploads,up,'拒绝任务目录外文件');
 assert.ok(!calls.some(args=>String(args[0]).startsWith('generate-')),'同步不能重新生成或转成片');
 console.log('小云雀画布同步：目标验证、原文件安全读取、上传/真实视频字段、回读确认、并发与重启去重、账号/项目隔离、未知事务防重放、自动开关；零生成请求 PASS');
}finally{await fs.rm(temp,{recursive:true,force:true});}
