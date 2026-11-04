import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{DreaminaService,catalogFromHelp}=require('./dreamina-service'),{DreaminaLegacyAgentService,agentPrompt,sameCanvas}=require('./dreamina-legacy-agent-service'),{DreaminaRouter}=require('./dreamina-canvas-service'),{assertMediaUrl}=require('./dreamina-legacy-agent-page');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'legacy-agent-test-'));
const help=JSON.parse(await fs.readFile(new URL('./dreamina-runtime/capabilities.json',import.meta.url),'utf8')),catalog=catalogFromHelp(help.text2video,help.multimodal2video);
const url='https://jimeng.jianying.com/ai-tool/canvas/22899680134924?from_page=assets',other='https://jimeng.jianying.com/ai-tool/canvas/12345';
let cliGenerations=0,executeCount=0,observation={status:'processing',turnId:'new-turn'},lost=false;
const legacy=new DreaminaService({executable:'test-only',dataDir:path.join(root,'direct'),execute:async(_exe,args)=>{if(args.includes('-h'))return {stdout:args[0]==='text2video'?help.text2video:help.multimodal2video};cliGenerations++;throw Error('不允许真实CLI生成');}});
const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom-test-media')]);
const response={ok:()=>true,headers:()=>({'content-length':String(mp4.length)}),body:async()=>mp4,dispose:async()=>{}};
const bridge={config:{mode:'cdp'},target:{id:'A',url},running:false,pending:null,targets:async()=>[{id:'A',url,title:'原画布'},{id:'B',url:other,title:'其他画布'}],
 configure:async function(value){this.config={...this.config,...value};this.target=(await this.targets()).find(t=>t.id===value.targetId);},status:async()=>({online:true}),ensure:async()=>{},
 evaluate:async expression=>expression.startsWith('[...document')?['old-turn']:observation,
 pageForTarget:async()=>({context:()=>({request:{get:async()=>response}})}),
 execute:async p=>{executeCount++;assert.equal(p.segment.requireAgentMode,true);assert.equal(p.segment.expectedVideoCount,1);assert.equal(p.expectedCanvasUrl,url);assert.equal(p.promptIsFinal,true);const record=await service.read(service.taskDir('dreamina-agent:'+p.segment.clientTaskId));assert.equal(record.status,'submitting','发送前必须持久化记录');if(lost)throw Error('响应丢失');return {ok:true,confirmed:true,executionId:'execution-'+executeCount,canvasUrl:url+'&workspace=987',creditConfirmation:{consumed:12,turnProof:[{turnId:'new-turn'}]}};}};
const service=new DreaminaLegacyAgentService({legacy,bridge,dataDir:path.join(root,'agent')});
const payload={version:'legacy',legacyMode:'agent',projectKey:'project-A',clientTaskId:'one',model:'seedance2.0',prompt:'小猫跳舞 & 原文不改',duration:4,ratio:'16:9',resolution:'720p',references:[]};
try{
 assert.equal(sameCanvas(url,url+'&workspace=987'),true);assert.equal(sameCanvas(url,other),false);assert.equal(sameCanvas(url.replace('jimeng.jianying.com','jimeng.jianying.com.evil'),url),false);
 assert.match(agentPrompt(payload),/标准版，非VIP、非Fast、非Mini/);assert.ok(agentPrompt(payload).endsWith(payload.prompt));assert.match(agentPrompt({...payload,model:'seedance2.0_vip'}),/Seedance 2.0 VIP/);
 await assert.rejects(()=>service.capture('project-A'),/先.*绑定/);
 await service.bind({projectKey:'project-A',targetId:'A'});const capture=await service.capture('project-A');assert.equal(capture.url,url);
 await service.bind({projectKey:'project-B',targetId:'B'});assert.equal((await service.settings('project-A')).url,url);assert.equal((await service.settings('project-B')).url,other);
 await assert.rejects(()=>service.submit({...payload,legacyAgentCapture:capture}),/其他画布/);assert.equal(executeCount,0);
 await bridge.configure({mode:'cdp',targetId:'A'});
 const [a,b]=await Promise.all([service.submit({...payload,legacyAgentCapture:capture}),service.submit({...payload,legacyAgentCapture:capture})]);assert.equal(a.id,'dreamina-agent:one');assert.equal(a.status,'processing');assert.deepEqual(a,b);assert.equal(executeCount,1);assert.equal(cliGenerations,0);
 await service.submit({...payload,legacyAgentCapture:capture});assert.equal(executeCount,1);await assert.rejects(()=>service.submit({...payload,prompt:'不同原文',legacyAgentCapture:capture}),/不同生成内容/);
 const router=new DreaminaRouter({legacy,agent:service});assert.equal((await router.submit({...payload,legacyAgentCapture:capture})).id,a.id);assert.equal((await router.query(a.id)).status,'processing');
 const record=await service.read(service.taskDir(a.id));assert.equal(record.turnId,'new-turn');assert.equal(record.target.url,url);assert.deepEqual(record.baselineIds,['old-turn']);
 observation={status:'ready',turnId:'new-turn',url:'https://v9-artist.vlabvod.com/test.mp4',duration:4.1};const done=await service.query(a.id);assert.equal(done.status,'completed');assert.equal(done.media.length,1);assert.equal(Buffer.from(done.media[0].dataUrl.split(',')[1],'base64').toString(),mp4.toString());
 const restarted=new DreaminaLegacyAgentService({legacy,bridge:{ensure:async()=>assert.fail('本地成片不能再连接浏览器')},dataDir:service.dataDir});assert.equal((await restarted.query(a.id)).status,'completed');assert.equal((await restarted.submit({...payload,legacyAgentCapture:capture})).status,'completed');assert.equal(executeCount,1);
 lost=true;const unknown=await service.submit({...payload,clientTaskId:'lost',prompt:'小狗跳舞'});assert.equal(unknown.status,'unknown');await service.submit({...payload,clientTaskId:'lost',prompt:'小狗跳舞'});assert.equal(executeCount,2,'响应丢失后不可重发');lost=false;
 observation={status:'processing',turnId:'dog-turn'};assert.equal((await service.query(unknown.id)).status,'processing');
 observation={status:'failed',turnId:'dog-turn',detail:'审核未通过'};assert.equal((await service.query(unknown.id)).status,'failed');assert.equal(executeCount,2);
 await assert.rejects(()=>service.submit({...payload,clientTaskId:'bad-seconds',duration:1}),/时长/);await assert.rejects(()=>service.submit({...payload,clientTaskId:'bad-model',model:'unknown'}),/不支持该模型/);await assert.rejects(()=>service.submit({...payload,clientTaskId:'audio',references:[{kind:'audio'}]}),/至少需要/);
 bridge.config.mode='extension';await assert.rejects(()=>service.submit({...payload,clientTaskId:'no-cdp'}),/浏览器直连/);bridge.config.mode='cdp';
 assert.throws(()=>service.taskDir('dreamina-agent:../escape'),/无效/);assert.throws(()=>assertMediaUrl('http://v9-artist.vlabvod.com/a'),/域名/);assert.throws(()=>assertMediaUrl('https://127.0.0.1/a'),/域名/);assert.throws(()=>assertMediaUrl('https://v9-artist.vlabvod.com.evil/a'),/域名/);assert.throws(()=>assertMediaUrl('https://user:secret@v9-artist.vlabvod.com/a'),/域名/);
 assert.equal(JSON.stringify(await service.read(service.taskDir(a.id))).includes('test.mp4'),false,'不持久化临时下载地址');
 assert.ok(catalog.models.includes('seedance2.0'));assert.equal(cliGenerations,0);console.log('旧画布 Agent 服务：绑定隔离、画布快照、发送前记录、并发去重、响应丢失不重发、排队与失败、成片下载与重启恢复、模型参数、媒体域名均通过；零付费生成。');
}finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
