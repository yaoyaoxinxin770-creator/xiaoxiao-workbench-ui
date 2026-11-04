import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{PippitCanvasGeneration,referenceData,audioPromptReferences}=require('./pippit-canvas-generation'),{PippitCanvasService}=require('./pippit-canvas-service'),{PippitService}=require('./pippit-service'),sdk=require('./pippit-canvas-runtime/dist/xyq-canvas-command-runtime.cjs'),{createSchemaFactory}=require('./pippit-canvas-runtime/scripts/canvas-command');
const record={phase:'creating',nodeId:'789',pippitAssetId:'4567',assetId:'8910',media:{Audio:{metadata:{duration_ms:'5198',size:'998128',format:'audio'}}}},ref={kind:'audio',name:'女主.wav'},data=referenceData(record,ref);
assert.equal(data.durationMs,5198);assert.equal(data.metadata.duration_ms,5198);assert.throws(()=>referenceData({...record,media:{Audio:{metadata:{duration_ms:'bad'}}}},ref),/时长/);
// Use the actual official SDK tag resolver and reference controller offline.
// A factory-only test missed the SDK's video candidate filter excluding audio.
const offline=sdk.createXyqCanvasCommandRuntime({canvasId:'123',transportFactory:()=>{throw Error('Network forbidden');}});
try{
 const defs=sdk.createXyqCanvasOpencodeToolDefinitions({runtime:{permissions:['canvas.read','canvas.write','canvas.asset.read','canvas.asset.write'],store:offline.store},schema:createSchemaFactory()});
 const execute=async mutations=>JSON.parse(await defs.apply_mutations.execute({atomic:true,mutations}));
 const refs=[{id:'789',kind:'audio',label:'女主.wav'},{id:'790',kind:'audio',label:'陆霖辞.wav'},{id:'791',kind:'image',label:'场景'},{id:'792',kind:'video',label:'上组视频'}];
 assert.equal((await execute([
  {kind:'create_biz_node',nodeKind:'audio',id:'789',initialData:data},
  {kind:'create_biz_node',nodeKind:'audio',id:'790',initialData:{...data,pippitAssetId:'4568',assetId:'8911'}},
  {kind:'create_biz_node',nodeKind:'image',id:'791',initialData:{name:'场景',source:'uploaded',uploadPath:'optimized',pippitAssetId:'4569',assetId:'8912',naturalWidth:320,naturalHeight:200}},
  {kind:'create_biz_node',nodeKind:'video',id:'792',initialData:{name:'上组视频',source:'uploaded',uploadPath:'optimized',pippitAssetId:'4570',assetId:'8913',frameWidth:320,frameHeight:200,durationMs:2021}},
  {kind:'create_biz_node',nodeKind:'video',id:'998',initialData:{source:'empty',generation:{ratio:'16:9',durationMs:5000,count:1}}}
 ])).ok,true);
 const prompt=refs.map(r=>'<node-asset label="'+r.label+'">'+r.id+'</node-asset>').join(' ')+' 人物自然转身。';
 const update=nodeId=>[{kind:'invoke_command',name:'xyq.generation.update_prompt',args:[{nodeId,prompt}]}];
 const before=structuredClone(offline.store.getState());
 // Regression reproduction uses dryRun on the registered command (not apply_mutations dryRun).
 const unresolved=await execute([{kind:'invoke_command',name:'xyq.generation.update_prompt',args:[{nodeId:'998',prompt,dryRun:true}]}]);
 assert.equal(unresolved.ok,false);assert.match(unresolved.message,/UNRESOLVED_PROMPT_REFERENCE: 789/);assert.deepEqual(offline.store.getState(),before,'failure does not alter the draft');
 const supplied=audioPromptReferences(before,refs);assert.equal(supplied.length,2);assert.equal(supplied[0].metadata.durationMs,5198);assert.equal(supplied[0].metadata.sizeBytes,998128);assert.ok(!JSON.stringify(supplied).includes('url'));
 assert.throws(()=>audioPromptReferences(before,[{id:'404',kind:'audio'}]),/未就绪/);
 assert.equal((await execute([{kind:'create_biz_node',nodeKind:'video',id:'999',initialData:{source:'empty',generation:{ratio:'16:9',durationMs:5000,count:1,references:supplied}}}])).ok,true);
 assert.equal((await execute(update('999'))).ok,true);
 const doc=offline.store.getState(),generation=doc.assets['999'].content.generation;
 assert.equal(doc.assets['789'].content.durationMs,5198);assert.equal(generation.prompt,prompt);
 for(const ref of refs)assert.ok(Object.values(doc.assets['123'].content.edges).some(e=>e.type==='reference'&&e.source===ref.id&&e.target==='999'),'all image/video/audio references connected');
 assert.equal(generation.references.filter(r=>r.type==='audio').length,2);
 assert.equal((await execute(update('999'))).ok,true);assert.equal(Object.keys(offline.store.getState().assets['123'].content.edges).length,4,'idempotent prompt update');
}finally{offline.canvas.dispose();}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'xyq-ref-recovery-'));const target={canvasId:'123',projectId:'234',url:'https://xyq.jianying.com/project?projectId=234&canvasId=123'},hash=v=>createHash('sha256').update(v).digest('hex');let paid=0,uploads=0,creates=0,remoteMode='matching';
const doc={rootCanvasId:'123',assets:{123:{type:'canvas',content:{nodes:{},edges:{}}}}};const p=new PippitService({dataDir:path.join(temp,'tasks')});p.describe=async()=>({ratio:{options:['16:9']},duration:{min:4,max:30}});p.command=async args=>{if(args[0]==='status')return {logged_in:true,credential_scope:'scope'};if(args[1]==='allocate')return {asset_ids:['999']};if(args[1]==='upload'){uploads++;throw Error('Must not reupload');}if(args[1]==='get'){const asset={pippitAssetId:'789',type:'biz/audio',content:{...data,...(remoteMode==='changed'?{pippitAssetId:'foreign'}:{})}};return {assets:remoteMode==='absent'?[]:[{PippitAssetID:'789',TextInfo:{content:JSON.stringify(asset)}}]};}throw Error('Unexpected native command');};
const c=new PippitCanvasService({pippit:p,dataDir:path.join(temp,'canvas')});c.settings=async()=>({target});c.snapshot=async()=>structuredClone(doc);c.semantic=async(name,id,input)=>{if(name==='create_biz_node'){creates++;doc.assets[input.id]={type:'biz/'+input.nodeKind,content:input.initialData};doc.assets['123'].content.nodes[input.id]={id:input.id,type:'biz/'+input.nodeKind,x:0,y:0,w:362,h:218};}else if(name==='xyq.generation.update_prompt'){doc.assets[input.nodeId].content.generation.prompt=input.prompt;doc.assets['123'].content.edges.e={type:'reference',source:'789',target:input.nodeId};}else throw Error('Unexpected semantic command');};
const b={connection:()=>({}),execute:async(t,j)=>{if(j.action==='probe')return {canvasId:'123',projectId:'234'};if(j.action==='prepare')throw Error('Stop before paid generation');paid++;throw Error('Must not click');}};
const cache=path.join(c.dataDir,'reference-records',hash(JSON.stringify(['scope','123','audio',hash(Buffer.from('a'))]))+'.json');const payload={projectKey:'bound',type:'video',model:'Seedance_2.5_draft',prompt:'测试',duration:5,references:[{...ref,dataUrl:'data:audio/wav;base64,YQ=='}]};
try{
 await c.save(cache,record);await assert.rejects(()=>new PippitCanvasGeneration({pippit:p,canvas:c,broker:b}).submit({...payload,clientTaskId:'repair'}),/Stop before/);assert.equal(uploads,0);assert.equal(paid,0);assert.equal(doc.assets['789'].content.durationMs,5198);assert.equal((await c.read(cache)).phase,'confirmed');assert.equal(creates,2,'same reference ID and one video draft');assert.equal(doc.assets['999'].content.generation.references[0].nodeAssetId,'789','production draft supplies the audio identity before updating the prompt');
 delete doc.assets['789'];delete doc.assets['123'].content.nodes['789'];await c.save(cache,record);remoteMode='changed';const before=creates;await assert.rejects(()=>new PippitCanvasGeneration({pippit:p,canvas:c,broker:b}).submit({...payload,clientTaskId:'foreign'}),/未确认/);assert.equal(creates,before,'never overwrite a changed orphan asset');
 await c.save(cache,{...record,phase:'confirmed'});await assert.rejects(()=>new PippitCanvasGeneration({pippit:p,canvas:c,broker:b}).submit({...payload,clientTaskId:'deleted'}),/已移除/);assert.equal(creates,before,'never resurrect a user-deleted confirmed node');await c.save(cache,record);
 remoteMode='absent';await assert.rejects(()=>new PippitCanvasGeneration({pippit:p,canvas:c,broker:b}).submit({...payload,clientTaskId:'missing'}),/未确认/);assert.equal(creates,before,'unknown writes are not replayed');assert.equal(uploads,0);assert.equal(paid,0);
 const errors=new PippitCanvasService({pippit:p,dataDir:path.join(temp,'errors'),canvasEntry:'unused',execute:async()=>{const e=Error('Command failed');e.stdout=JSON.stringify({ok:false,code:'INVARIANT_FAILED',message:'UNRESOLVED_PROMPT_REFERENCE: 789'});e.stderr='[canvas-sdk] transaction aborted '+('stack '.repeat(3000));throw e;}});
 await assert.rejects(()=>errors.semantic('xyq.generation.update_prompt','123',{}),e=>e.message==='UNRESOLVED_PROMPT_REFERENCE: 789');
 console.log('官方 SDK 完整图片/视频/双音频提示词与连线、数字时长、已写入孤立资产原 ID 恢复、未知/变更资产阻止重放、零重复上传与零生成 PASS');
}finally{await fs.rm(temp,{recursive:true,force:true});}
