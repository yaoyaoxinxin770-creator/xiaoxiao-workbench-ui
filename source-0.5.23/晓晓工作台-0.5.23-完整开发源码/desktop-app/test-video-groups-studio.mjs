import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json')),ts=require('typescript');
const localRequire=createRequire(import.meta.url),{g25,g26,markdown,sectioned}=localRequire('./video-group-import-fixture.cjs');
function load(file,stubs={}){const exports={};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(path.join(web,'src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>name in stubs?stubs[name]:name.startsWith("@/")?load(name.slice(2)+".ts",stubs):require(name),exports,{exports});return exports;}
const parse=load('app/(user)/video/video-group-parser.ts').splitSourceSegments,reference=localRequire('./asset-store.js').splitSourceSegments;
for(const text of [sectioned,markdown,g25+'\r\n'+g26,'','【承接视频编号24】\n承接段不是视频组']){
 assert.deepEqual(parse(text),reference(text),'与即梦整稿分组规则一致');
}
assert.deepEqual(parse(sectioned),[{id:'25',prompt:g25},{id:'26',prompt:g26}],'只导入第三部分代码块正文，不带任何外层标题、前后说明或其他章节');
assert.deepEqual(parse(markdown).map(g=>g.id),['25','26']);
assert.ok(!parse(markdown)[0].prompt.includes('【视频编号26'));
const data=new Map(),idbStore={createStore:()=>({getItem:async k=>data.get(k)||null,setItem:async(k,v)=>data.set(k,v),removeItem:async k=>data.delete(k)})};
const model=load('app/(user)/video/studio-model.ts'),stubs={'@/lib/idb-store':idbStore,'@/app/(user)/video/studio-model':model};
const store=load('stores/use-video-studio-store.ts',stubs).useVideoStudioStore;await store.persist.rehydrate();
store.getState().addFolder('第6集');const folder=store.getState().folderId,projectId=store.getState().activeProjectId;
assert.equal(store.getState().importGroups(parse(markdown),folder),2);
assert.equal(store.getState().importGroups(parse(markdown),folder),0,'重复粘贴正文不重复入队');
assert.throws(()=>store.getState().importGroups(parse(markdown),'missing-folder'),/有效/);
assert.deepEqual(store.getState().groups.map(g=>g.number),['25','26']);
assert.ok(store.getState().groups.every(g=>g.folderId===folder&&g.projectId===projectId&&!g.logIds.length));
store.getState().linkGroup(store.getState().groups[0].id,['log-1','log-1']);assert.deepEqual(store.getState().groups[0].logIds,['log-1']);
store.getState().createProject('另一部');assert.equal(store.getState().importGroups(parse(markdown),''),2,'项目间队列隔离');
await new Promise(r=>setTimeout(r,0));
const reopened=load('stores/use-video-studio-store.ts',stubs).useVideoStudioStore;await reopened.persist.rehydrate();
assert.equal(reopened.getState().groups.length,4);assert.equal(reopened.getState().groups[0].prompt,parse(markdown)[0].prompt);assert.deepEqual(reopened.getState().groups[0].logIds,['log-1']);
const removed=reopened.getState().groups[0];reopened.getState().removeGroup(removed.id);assert.equal(reopened.getState().groups.length,3);assert.equal(reopened.getState().removedGroups[0].prompt,removed.prompt);reopened.getState().linkGroup(removed.id,['late-result']);assert.ok(reopened.getState().removedGroups[0].logIds.includes('late-result'));reopened.getState().place(['late-result'],{projectId,folderId:folder});reopened.getState().wrapVideo({id:'late-result',title:'existing',prompt:removed.prompt});assert.equal(reopened.getState().groups.length,4);assert.equal(reopened.getState().groups.find(g=>g.id===removed.id).prompt,removed.prompt);assert.equal(reopened.getState().removedGroups.length,0);reopened.getState().removeGroup(removed.id);reopened.getState().deleteFolder(folder,projectId);reopened.getState().restoreGroup(removed.id);assert.equal(reopened.getState().groups.find(g=>g.id===removed.id).folderId,'');reopened.getState().addGroupElements(projectId+':'+removed.id,['a','a','b']);assert.deepEqual(reopened.getState().groupElementIds[projectId+':'+removed.id],['a','b']);
const match=load('app/(user)/video/prompt-references.ts').matchPromptAssets;
const assets=[{id:'scene',kind:'image',category:'场景',title:'路边炸串摊（黄昏）'},{id:'girl',kind:'image',title:'妹妹女主_upscayl_4x'},{id:'voice',kind:'audio',title:'苏瑶-萌'},{id:'silent',kind:'image',title:'周桉'}];
const report=match('【场景与连续状态】\n场景：傍晚/外，【路边炸串摊】。\n【出场人物】\n苏瑶：开镜在场｜资产【妹妹女主】\n周桉：开镜在场\n【声音锁定】\n@苏瑶｜声线：清亮\n@缺失角色｜声线：低沉',assets);
assert.deepEqual(new Set(report.matches.map(a=>a.id)),new Set(['scene','girl','voice','silent']));
assert.deepEqual(report.missing,['缺失角色']);
assert.equal(match('对白提到周桉',assets).matches.length,0,'普通对白不构造绑定');
assert.equal(match('【场景与连续状态】\n场景：主卧·夜·内。',[{id:'bath',kind:'image',category:'场景',title:'主卧浴室'}]).matches.length,0,'不要把主卧绑定浴室');
assert.deepEqual(match('【声音锁定】\n@苏瑶｜声线：清亮',[...assets,{id:'v2',kind:'audio',title:'苏瑶-稳'}]).ambiguous,['苏瑶']);
assert.deepEqual(match('【出场人物】\n苏瑶（OS/vo）：仅画外声音',assets).matches,[],'画外音角色不强制图片');
assert.equal(match('【出场人物】\n妹妹女主：资产【妹妹女主】\n【声音锁定】\n@妹妹女主｜声线：清亮',[{id:'i',kind:'image',title:'妹妹女主'},{id:'a',kind:'audio',title:'妹妹女主'}]).matches.length,2,'同一名称的图片和音频分别绑定');
const {LocalAssetLinks}=localRequire('./local-asset-links.js'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'studio-folder-'));
try{
 const folder=path.join(temp,'素材'),chars=path.join(folder,'人物'),voices=path.join(folder,'音频');fs.mkdirSync(chars,{recursive:true});fs.mkdirSync(voices);
 for(let i=0;i<105;i++)fs.writeFileSync(path.join(chars,'角色'+i+'.png'),'image');
 fs.writeFileSync(path.join(voices,'角色.wav'),'audio');fs.writeFileSync(path.join(folder,'说明.txt'),'not media');
 const links=new LocalAssetLinks(path.join(temp,'profile','index.json'),()=> 'http://localhost');
 const imported=links.registerSelection([folder]);assert.equal(imported.length,106,'遍历子文件夹，无100个静默截断');assert.equal(imported.filter(a=>a.category==='人物').length,105);assert.equal(imported.filter(a=>a.kind==='audio').length,1);
 assert.equal(links.registerSelection([folder,imported[0].path]).length,106,'重复文件去重');assert.equal(Object.keys(links.entries).length,106);
 assert.throws(()=>links.registerSelection(['relative']));assert.equal(links.registerSelection([]).length,0);
 assert.deepEqual(fs.readdirSync(path.join(temp,'profile')),['index.json'],'导入仅存索引，没有复制媒体');
 const restarted=new LocalAssetLinks(path.join(temp,'profile','index.json'),()=> 'http://localhost');assert.equal(restarted.describe(imported[0].id).path,imported[0].path);
}finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
console.log('视频组拆分/目标文件夹/去重/重启/队列状态；场景人物声音匹配与歧义；递归文件夹106素材无截断：PASS');

const numbered='【视频编号V01｜剧本1-1】\n总时长：23.2秒\n【承接视频编号V00】\n正文';const numberedGroups=parse(numbered);assert.deepEqual(numberedGroups,[{id:'V01',prompt:numbered}]);assert.deepEqual(numberedGroups,reference(numbered));store.getState().createProject('V格式项目');store.getState().addFolder('第2幕');const vProject=store.getState().activeProjectId,vFolder=store.getState().folderId;assert.equal(store.getState().importGroups(numberedGroups,vFolder),1);assert.equal(store.getState().importGroups(numberedGroups,vFolder),0);const importedV=store.getState().groups.filter(g=>g.projectId===vProject);assert.equal(importedV[0].folderId,vFolder);assert.equal(importedV[0].number,'V01');assert.equal(importedV[0].prompt,numbered);assert.equal(model.studioVideoNumber({id:'v-log',prompt:numbered},99),'V01');console.log('V前缀编号：正文原样、指定第2幕、去重及视频编号显示：PASS');
