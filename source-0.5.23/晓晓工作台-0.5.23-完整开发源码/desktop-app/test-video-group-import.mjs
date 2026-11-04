import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {splitSourceSegments}=require('./asset-store.js');
const {g25,g26,markdown,sectioned}=require('./video-group-import-fixture.cjs');
const source=fs.readFileSync(new URL('../jimeng-canvas-extension/workbench.js',import.meta.url),'utf8');
const input={value:''};let busy=false,saves=0;
const episode={segmentProgress:{25:{status:'done'}}};
const state={project:{source:'视频编号01\n原有正文',segments:[{id:'01',prompt:'视频编号01\n原有正文',status:'done'}]},selected:0};
const context=vm.createContext({state,window:{dispatchEvent(){}},Event:class{},queueBusy:()=>busy,$:()=>input,activeEpisode:()=>episode,renderQueue(){},selectSegment(index){state.selected=index;},persist(){saves++;}});
vm.runInContext(source.slice(source.indexOf('  function splitSourceSegments'),source.indexOf('  function renderQueue')),context);
vm.runInContext(source.slice(source.indexOf('  window.workbenchParseVideoGroups'),source.indexOf('  window.workbenchReplaceText')),context);
const parse=text=>Array.from(context.window.workbenchParseVideoGroups(text),group=>({id:group.id,prompt:group.prompt}));
const expected=[{id:'25',prompt:g25},{id:'26',prompt:g26}];
const tick=String.fromCharCode(96),escapedFence=Array(3).fill(String.fromCharCode(92)+tick).join('');
for(const text of [sectioned,sectioned.replaceAll('\n','\r\n'),markdown,g25+'\n\n'+g26,markdown.replaceAll(tick.repeat(3),escapedFence),markdown.replaceAll('\n','\r\n')]){
 assert.deepEqual(parse(text),expected);assert.deepEqual(splitSourceSegments(text),expected);
}
const a='【视频编号01-1｜第1集第1组】\n总时长：22.1秒\n【全局视觉】\n完整正文',b='【视频编号02-1｜第2组】\n正文二',fence='`'.repeat(3);
const currentMd=['## 第一部分：资产','## 想请你确认','前面的资产备注','## 第三部分：纯视频生成提示词','### 第1集第1组（不导入的标题）',fence+'plaintext',a,fence,'### 第2组（不导入的标题）',fence+'plaintext',b,fence,'---','## 想请你确认','1. 多余结尾'].join('\n');
for(const source of [currentMd,currentMd.replace(fence+'\n---','---'),currentMd.replaceAll('\n','\r\n')]){assert.deepEqual(parse(source),[{id:'01-1',prompt:a},{id:'02-1',prompt:b}]);assert.deepEqual(splitSourceSegments(source),[{id:'01-1',prompt:a},{id:'02-1',prompt:b}]);}
assert.deepEqual(parse(a+'\n---\n## 想请你确认\n结尾说明'),[{id:'01-1',prompt:a}]);
const legacy='【项目规格】\n画幅：16:9\n【视频编号01】\n镜头01｜第一组\n\n【项目规格】\n画幅：16:9\n【视频编号02】\n镜头01｜第二组';
assert.deepEqual(parse(legacy),splitSourceSegments(legacy));assert.equal(parse(legacy).length,2);assert.ok(parse(legacy)[0].prompt.startsWith('【项目规格】'));
assert.deepEqual(parse('【承接视频编号24】\n上一编号结束在：视频编号25'),[]);
const importGroups=context.window.workbenchImportVideoGroups;
assert.equal(importGroups(markdown).ok,true);assert.deepEqual(Array.from(state.project.segments,group=>group.id),['01','25','26']);assert.equal(state.project.segments[0].status,'done');assert.equal(state.selected,1);assert.equal(input.value,state.project.source);assert.ok(input.value.endsWith(g26));assert.equal(saves,1);
const saved=JSON.stringify(state.project);assert.equal(importGroups(markdown).ok,false);assert.equal(JSON.stringify(state.project),saved);
assert.equal(importGroups(g25+'\n\n'+g25,'replace').ok,false);assert.equal(JSON.stringify(state.project),saved);
busy=true;assert.equal(importGroups(markdown,'replace').ok,false);assert.equal(JSON.stringify(state.project),saved);busy=false;
assert.equal(importGroups(markdown,'replace').ok,true);assert.deepEqual(Array.from(state.project.segments,group=>group.id),['25','26']);assert.equal(Object.keys(episode.segmentProgress).length,0);assert.ok(state.project.segments.every(group=>group.status==='ready'));
const v01='【视频编号V01｜剧本1-1】\n总时长：23.2秒\n完整提示词',v14='【视频编号V14｜剧本1-8】\n【承接视频编号V13】\n保留正文';
const prefixed=['## 第一部分：资产','【视频编号V99规划｜不导入】','## 第三部分：纯视频生成提示词','### V01｜不带标题',fence+'plaintext',v01,fence,'### V14｜不带标题',fence+'plaintext',v14,fence,'## 想请你确认','V15不要导入'].join('\n');
for(const text of [prefixed,prefixed.replaceAll('\n','\r\n'),v01+'\n\n'+v14]){const result=[{id:'V01',prompt:v01},{id:'V14',prompt:v14}];assert.deepEqual(parse(text),result);assert.deepEqual(splitSourceSegments(text),result);}assert.deepEqual(parse('【承接视频编号V13】\n上一组V14'),[]);
console.log('PASS: 25/26 Markdown/plain/escaped/CRLF split; continuation excluded; legacy specifications retained; append, duplicate, busy and replace guards verified.');
