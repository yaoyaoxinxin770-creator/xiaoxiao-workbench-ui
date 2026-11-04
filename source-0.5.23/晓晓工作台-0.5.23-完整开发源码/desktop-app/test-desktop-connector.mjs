import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'jimeng-canvas-extension', 'desktop-connector.js'), 'utf8');
const requests = [];
const messages = [];
let delivered = false;
const session = new Map();
const context = {
  location:{href:'https://jimeng.jianying.com/ai-tool/canvas/example', hostname:'jimeng.jianying.com'},
  document:{title:'即梦画布', visibilityState:'visible', hasFocus:()=>true},
  sessionStorage:{getItem:key=>session.get(key)||null, setItem:(key,value)=>session.set(key,value)},
  crypto:{randomUUID:()=> 'connector-test-id'},
  encodeURIComponent,
  setTimeout,
  clearTimeout,
  setInterval:()=>0,
  fetch:async (url, options={}) => {
    requests.push({url, options});
    if (url.includes('/workbench/file?')) return {ok:true, blob:async()=>new Blob([new Uint8Array([1,2,3])], {type:'image/png'})};
    if (url.includes('/workbench/poll')) {
      if (delivered) return {json:async()=>({id:null})};
      delivered = true;
      return {json:async()=>({id:'job-1', payload:{action:'executeSegment', source:'desktop-workbench', bridgeProtocolVersion:1, promptIsFinal:true, sourceTabId:'not-an-integer', localFiles:[{root:'F:/project',relativePath:'人物/小红.png',name:'小红.png',type:'image/png'}], segment:{id:'01', prompt:'最终提示词（含前置词）', prefix:'旧前置词不应再拼接', lockedImages:[{kind:'image',name:'小红'}]}}})};
    }
    return {json:async()=>({ok:true})};
  },
  chrome:{runtime:{id:'extension-test-id',sendMessage:async message => {
    messages.push(message);
    if(message.type==='DESKTOP_CONNECTOR_PING') return {ok:true,ready:true,executorReady:true,canvasReady:true,version:'0.19.0',tabId:7};
    return {ok:true, accepted:1};
  }}},
  Blob,
  Uint8Array,
  btoa,
};
vm.runInNewContext(source, context);
await new Promise(resolve=>setTimeout(resolve, 20));

assert.ok(messages.some(message=>message.type==='STAGE_FILE_BEGIN'&&message.file.name==='小红.png'));
assert.ok(messages.some(message=>message.type==='STAGE_FILE_CHUNK'));
assert.ok(messages.some(message=>message.type==='STAGE_FILE_FINISH'));
const start=messages.find(message=>message.type==='START_BATCH');
assert.ok(start);
assert.equal(Object.hasOwn(start, 'sourceTabId'), false);
assert.equal(start.source, 'desktop-workbench');
assert.equal(start.bridgeProtocolVersion, 1);
assert.equal(start.promptIsFinal, true);
assert.equal(start.jobs[0].files[0].name, '小红.png');
assert.equal(start.jobs[0].source, 'desktop-workbench');
assert.equal(start.jobs[0].bridgeProtocolVersion, 1);
assert.equal(start.jobs[0].promptIsFinal, true);
assert.equal(start.jobs[0].prompt, '最终提示词（含前置词）');
assert.deepEqual(start.jobs[0].lockedImages, [{kind:'image',name:'小红'}]);
assert.ok(requests.some(request=>request.url.endsWith('/workbench/connector')));
assert.ok(requests.some(request=>request.url.includes('connectorId=connector-test-id')));
assert.ok(requests.some(request=>request.url.endsWith('/workbench/result')));
for (const result of [{ok:true,accepted:0,paused:true,stoppedOnFailure:true},{ok:true,accepted:1,paused:true,stoppedOnFailure:true}]) {
  delivered=false;
  requests.length=0;
  context.chrome.runtime.sendMessage=async message=>message.type==='DESKTOP_CONNECTOR_PING'
    ? {ok:true,ready:true,executorReady:true,canvasReady:true,version:'0.19.0',tabId:7}
    : message.type==='START_BATCH'?result:{ok:true};
  vm.runInNewContext(source,context);
  await new Promise(resolve=>setTimeout(resolve,20));
  const report=JSON.parse(requests.find(request=>request.url.endsWith('/workbench/result')).options.body);
  assert.equal(report.ok,false,'a stopped batch must not be reported as sent');
  assert.equal(report.code,'EXECUTOR_NOT_COMPLETED');
}
console.log('Desktop content connector heartbeat, targeted poll and sender-owned tab routing passed');
