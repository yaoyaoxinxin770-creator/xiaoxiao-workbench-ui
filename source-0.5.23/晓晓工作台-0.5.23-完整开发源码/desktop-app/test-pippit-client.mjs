import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json')),ts=require('typescript');
const requests=[],persisted=[],transcoded=[];
const bridge={pippitSubmit:async payload=>{requests.push(payload);return {id:'pippit:'+payload.clientTaskId,status:'processing'};},pippitQuery:async id=>({id,status:'completed',progress:100,media:[{dataUrl:id.includes('video')?'data:video/mp4;base64,YQ==':'data:image/png;base64,YQ=='}]})};
const stubs={
  './cli-video-mode':{confirmCliVideoGeneration:async()=>{}},
  './workbench':{workbench:()=>bridge},
  '@/lib/audio-wav':{transcodeAudioToWav:async blob=>{transcoded.push(blob.type);return blob.type.startsWith('audio/wav')?blob:new Blob(['WAV'],{type:'audio/wav'});}},
  '@/stores/use-config-store':{channelProtocolForConfig:()=> 'pippit-cli'},
  '@/services/image-storage':{imageToDataUrl:async ref=>{assert.equal(ref.storageKey,'stored-image');return 'data:image/png;base64,Yg==';},uploadImage:async(dataUrl,options)=>{persisted.push({dataUrl,options});return {url:'blob:stored-image',storageKey:'result-image',mimeType:'image/png',bytes:1};}},
  '@/services/file-storage':{resolveMediaUrl:async(key,fallback)=>{assert.ok(key.startsWith('stored-'));return fallback;},uploadMediaFile:async(dataUrl,prefix)=>{persisted.push({dataUrl,prefix});return {url:'blob:stored-video',storageKey:'result-video'};}},
  '@/lib/image-utils':{readFileAsDataUrl:async file=>'data:'+file.type+';base64,'+Buffer.from(await file.arrayBuffer()).toString('base64')},
};
const source=fs.readFileSync(path.join(web,'src/services/api/pippit.ts'),'utf8'),exports={};
new Function('require','exports','module',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name in stubs?stubs[name]:require(name),exports,{exports});
const config={channelMode:'local',model:'chosen-model',size:'1280x720',quality:'2K',vquality:'720',videoSeconds:'6'};
const image={id:'image-ref',name:'人物.png',type:'image/png',dataUrl:'blob:expired',storageKey:'stored-image'};
await exports.submitPippitImage(config,'原始提示词',[image],'image-client',3);
assert.equal(requests[0].ratio,'16:9');assert.equal(requests[0].resolution,'2K');assert.equal(requests[0].count,3);assert.equal(requests[0].prompt,'原始提示词');assert.match(requests[0].references[0].dataUrl,/^data:image/);
await exports.submitPippitVideo(config,'视频提示词',{references:[image],videoReferences:[{id:'v',name:'视频.mp4',type:'video/mp4',url:'data:video/mp4;base64,Yw==',storageKey:'stored-video'}],audioReferences:[{id:'a',name:'配音.wav',type:'audio/wav',url:'data:audio/wav;base64,ZA==',storageKey:'stored-audio'}]},'video-client');
assert.deepEqual(requests[1].references.map(ref=>ref.kind),['image','video','audio']);assert.equal(requests[1].duration,6);assert.equal(requests[1].resolution,'720p');
assert.equal(requests[1].references[2].dataUrl,'data:audio/wav;base64,ZA==');
assert.deepEqual(transcoded,['audio/wav'],'WAV 参考音频原样通过');
await exports.submitPippitVideo(config,'视频提示词',{audioReferences:[{id:'m',name:'配音.mp3',type:'audio/mpeg',url:'data:audio/mpeg;base64,ZQ==',storageKey:'stored-mp3'}]},'video-mp3-audio');
assert.match(requests.at(-1).references[0].dataUrl,/^data:audio\/wav;base64,/,'MP3 参考音频提交前转成 WAV');
assert.ok(transcoded.includes('audio/mpeg'),'MP3 走解码转码通道');
await assert.rejects(()=>exports.submitPippitVideo(config,'视频',{lastFrame:image},'invalid-last'),/先指定首帧/);
await assert.rejects(()=>exports.submitPippitVideo(config,'视频',{firstFrame:image,audioReferences:[{id:'a'}]},'invalid-mix'),/不能混用/);
await exports.submitPippitVideo({...config,vquality:'auto'},'视频',{firstFrame:image},'video-frame');assert.equal(requests.at(-1).firstLast,true);assert.equal(requests.at(-1).resolution,undefined);
await exports.submitPippitVideo(config,'项目绑定视频',{references:[image]},'video-bound','project-original');assert.equal(requests.at(-1).projectKey,'project-original','视频工作台传递提交时捕获的项目');assert.equal(requests[1].projectKey,undefined,'本地画布原有通用入口保持独立');
const storedImage=await exports.pollPippitImage('pippit:image-client');assert.equal(storedImage.storageKey,'result-image');assert.deepEqual(storedImage.image_urls,['blob:stored-image']);assert.equal(persisted[0].options.localOnly,true);
const count=persisted.length;await exports.pollPippitImage('pippit:image-client');assert.equal(persisted.length,count,'轮询重复完成结果不重复存储');
assert.equal((await exports.pollPippitVideo('pippit:video-client')).storageKey,'result-video');
assert.equal(exports.isPippitConfig({...config,channelMode:'remote'}),false,'云端配置不能被劫持为本机 CLI');
console.log('小云雀前端接入测试通过：存储资产读取、原文/参数转换、图视频音频顺序、首尾帧、结果持久化与去重。');
