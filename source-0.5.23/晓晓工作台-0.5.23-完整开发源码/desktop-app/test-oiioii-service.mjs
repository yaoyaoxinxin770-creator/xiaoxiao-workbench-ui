import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{OiioiiService}=require('./oiioii-service');
const dir=await fs.mkdtemp(path.join(path.resolve(import.meta.dirname,'../output'),'oiioii-service-'));
const calls=[],runtimeDir=path.resolve('oiioii-runtime'),dataDir=path.join(dir,'data');
await fs.mkdir(path.join(dataDir,'cli'),{recursive:true});
const configFile=path.join(dataDir,'cli/config.json');
await fs.writeFile(configFile,JSON.stringify({apiKey:'fixture-account-a',defaultWorkspaceId:'space-a'}));
let failSubmit=false,escapeOutput=false;
const execute=async(exe,argv,options)=>{
 assert.equal(options.windowsHide,true);assert.ok(options.env.OIIOII_CONFIG_DIR.startsWith(dir));assert.ok(options.env.TEMP.startsWith(dir));
 const args=JSON.parse(await fs.readFile(argv[2],'utf8'));calls.push(args);
 const ok=data=>({stdout:JSON.stringify({ok:true,data})});
 if(args[0]==='auth')return ok({authenticated:true});
 if(args[0]==='inspect')return ok({models:[{id:50,name:'Seedance',key:'seedance20',variant:'fast',domain:'video',aspect_ratios:['16:9'],sizes:['720p'],durations:['4-15']}]});
 if(args.includes('upload'))return ok({file_uri:'hogi://image/reference'});
 if(args.includes('create')&&args.includes('canvas')){const input=JSON.parse(await fs.readFile(args[args.indexOf('--input')+1],'utf8'));assert.equal(input.nodes[0].prompt,'女主 [Image:image/reference]');assert.equal(input.nodes[0].title,'视频草稿');assert.equal(input.nodes[0].references[0].uri,'hogi://image/reference');return ok({workspace_id:'space-a',nodes:[{client_id:'video',asset_id:'draft-node'}]});}
 if(args.includes('update')&&args.includes('canvas'))return ok({updated:true});
 if(args.includes('--dry-run'))return ok({valid:true});
 if(args.includes('generate')){if(failSubmit)throw {stdout:JSON.stringify({ok:false,error:{code:'NETWORK_ERROR',message:'fixture unknown',details:{local_task_id:'local-unknown'}}})};return ok({task_id:'backend-a',local_task_id:'local-a',status:'queued'});}
 if(args[0]==='task')return ok({task:{id:'local-a',backendTaskId:'backend-a',workspaceId:'space-a',status:'succeeded',resourceUris:['hogi://video/video-a']}});
 if(args[0]==='record'){const output=args[args.indexOf('--output')+1],file=path.join(escapeOutput?dir:output,'video.mp4');await fs.writeFile(file,Buffer.from('fixture-video'));return ok({path:file,mime_type:'video/mp4'});}
 throw Error('unexpected '+args);
};
try{
 const service=new OiioiiService({runtimeDir,dataDir,execute});
 assert.equal((await service.status()).logged_in,true);
 const catalog=await service.models(),model=catalog.models[0];assert.equal(catalog.modelCapabilities[model],'video');assert.equal(catalog.oiioiiModels[model].id,50);
 const payload={clientTaskId:'client-a',type:'video',model,prompt:'长提示词'.repeat(12000),ratio:'16:9',resolution:'720p',duration:8,references:[{kind:'image',name:'角色.png',dataUrl:'data:image/png;base64,YWJj'}]};
 const [a,b]=await Promise.all([service.submit(payload),service.submit(payload)]);assert.equal(a.id,b.id);assert.equal(calls.filter(c=>c.includes('generate')&&!c.includes('--dry-run')).length,1);assert.equal(calls.filter(c=>c.includes('upload')).length,1);
 await service.submit(payload);assert.equal(calls.filter(c=>c.includes('generate')&&!c.includes('--dry-run')).length,1);
 await assert.rejects(service.submit({...payload,prompt:'different'}),/不同内容/);
 const result=await service.query(a.id);assert.equal(result.status,'completed');assert.ok(result.media[0].dataUrl.startsWith('data:video/mp4;base64,'));
 await fs.writeFile(configFile,JSON.stringify({apiKey:'fixture-account-b',defaultWorkspaceId:'space-a'}));await assert.rejects(service.query(a.id),/账号已变化/);
 await fs.writeFile(configFile,JSON.stringify({apiKey:'fixture-account-a',defaultWorkspaceId:'space-a'}));escapeOutput=true;await assert.rejects(service.query(a.id),/路径越界/);escapeOutput=false;
 const paidBefore=calls.filter(c=>c.includes('generate')&&!c.includes('--dry-run')).length,draftPayload={...payload,clientTaskId:'only-node',creationMode:'draft',prompt:'女主 @图片1'};const draft=await service.submit(draftPayload);assert.equal(draft.preparationOnly,true);assert.equal(draft.canvasNodeId,'draft-node');assert.equal((await service.query(draft.id)).preparationOnly,true);await service.submit(draftPayload);assert.equal(calls.filter(c=>c.includes('generate')&&!c.includes('--dry-run')).length,paidBefore);await assert.rejects(()=>service.submit({...draftPayload,creationMode:'direct'}),/不同内容/);await fs.writeFile(configFile,JSON.stringify({apiKey:'fixture-account-b',defaultWorkspaceId:'space-a'}));await assert.rejects(()=>service.query(draft.id),/账号已变化/);await fs.writeFile(configFile,JSON.stringify({apiKey:'fixture-account-a',defaultWorkspaceId:'space-a'}));
 failSubmit=true;await assert.rejects(service.submit({...payload,clientTaskId:'unknown'}),/生成结果待核对/);const before=calls.length;await assert.rejects(service.submit({...payload,clientTaskId:'unknown'}),/阻止重复提交/);assert.equal(calls.length,before);
 await assert.rejects(service.submit({...payload,clientTaskId:'bad',references:[{kind:'image',dataUrl:'data:audio/wav;base64,YWJj'}]}),/格式/);
 const real=new OiioiiService({runtimeDir,dataDir:path.join(dir,'real')});const caps=await real.command(['inspect','capabilities']);assert.ok(caps.capabilities.some(c=>c.domain==='video'));assert.deepEqual(await fs.readdir(path.join(dir,'real/tmp')),[]);
 console.log('Oii: official CLI runner, long prompts, F-drive paths, model IDs, mixed-reference preparation, duplicate prevention, unknown submission, account isolation, result import and path containment passed. No remote generation.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
