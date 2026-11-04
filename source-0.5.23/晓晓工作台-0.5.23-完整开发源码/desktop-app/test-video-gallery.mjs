import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json')),ts=require('typescript');
function load(file){const source=fs.readFileSync(path.join(web,'src/app/(user)/video',file),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const exports={};new Function('require','exports','module',js)(require,exports,{exports});return exports;}
const {galleryRows,videoAspect}=load('gallery-layout.ts');
const items=Array.from({length:4203},(_,i)=>({id:String(i),video:{width:[1920,1080,1200][i%3],height:[1080,1920,900][i%3]},size:'16:9'}));
assert.equal(videoAspect({id:'x',size:'4:3'}),4/3);
assert.equal(videoAspect({id:'x',size:'bad'}),16/9);
for(const width of [320,768,1440])for(const columns of [1,4,8])for(const square of [false,true]){
    const {rows,height}=galleryRows(items,width,columns,square);const boxes=rows.flatMap(r=>r.boxes);
    assert.equal(boxes.length,items.length,'所有结果均可滚动访问，没有截断到 60 条');
    assert.ok(height>0);assert.deepEqual(boxes.map(b=>b.index),items.map((_,i)=>i));
    for(const row of rows){assert.ok(row.height>0);for(const box of row.boxes){assert.ok(box.left>=0&&box.left+box.width<=width+0.01,'不能溢出容器');assert.ok(box.height>0);assert.ok(Math.abs(box.width/box.height-(square?1:videoAspect(items[box.index])))<0.00001,'原比例必须保留');}}
    for(let i=1;i<rows.length;i++)assert.ok(rows[i].top>=rows[i-1].top+rows[i-1].height-0.01,'排版不能叠行');
}
assert.deepEqual(galleryRows([],1440,4,false),{rows:[],height:0});
const {acquirePreview,stopActivePreview}=load('hover-playback.ts');let stoppedA=0,stoppedB=0,stoppedC=0;
const releaseA=acquirePreview(()=>stoppedA++),releaseB=acquirePreview(()=>stoppedB++);
assert.equal(stoppedA,1,'新预览启动前停止旧预览');assert.equal(stoppedB,0);
releaseA();assert.equal(stoppedA,1,'旧预览释放只能执行一次，不能干扰同卡片的新预览');assert.equal(stoppedB,0,'旧卡片的延迟清理不能停止新卡片');releaseB();releaseB();assert.equal(stoppedB,1,'重复移出与清理只释放一次');
acquirePreview(()=>stoppedC++);stopActivePreview();assert.equal(stoppedC,1,'打开视频详情弹窗时立即停止悬停预览');

// Verify collectMediaStorageKeys preserves string[] logKeys and Set<string> so cleanupUnusedMedia never wipes generated videos.
const fileStorageSrc = fs.readFileSync(path.join(web, 'src/services/file-storage.ts'), 'utf8');
const collectFnMatch = fileStorageSrc.match(/export function collectMediaStorageKeys[\s\S]*?\n\}/);
assert.ok(collectFnMatch, 'collectMediaStorageKeys function exists');
const collectJs = ts.transpileModule(collectFnMatch[0], { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const collectExports = {};
new Function('exports', collectJs)(collectExports);
const collected = collectExports.collectMediaStorageKeys({
    assets: [{ data: { storageKey: 'asset-media:1' } }],
    logKeys: ['video:keep-1', 'video-reference:keep-2', 'plain-text-ignored'],
    keySet: new Set(['audio-reference:keep-3']),
    nested: { firstFrame: { storageKey: 'image:keep-4' } },
});
assert.equal(collected.has('asset-media:1'), true);
assert.equal(collected.has('video:keep-1'), true, 'logKeys 字符串数组中的视频 storageKey 不可被清理丢弃');
assert.equal(collected.has('video-reference:keep-2'), true);
assert.equal(collected.has('audio-reference:keep-3'), true);
assert.equal(collected.has('image:keep-4'), true);
assert.equal(collected.has('plain-text-ignored'), false);
console.log('4203 条原比例/方形布局、窄屏/密度/无截断/无重叠与独占悬停切换：PASS');

const {localTaskId}=load("local-task-recovery.ts");assert.equal(localTaskId({task:{id:"client_video_task_original"},config:{channelMode:"local",videoChannelId:"local-pippit"}}),"pippit:client_video_task_original");assert.equal(localTaskId({task:{id:"client_video_task_original"},config:{channelMode:"remote",videoChannelId:"local-pippit"}}),undefined);assert.equal(localTaskId({task:{id:"dreamina-canvas:original"}}),"dreamina-canvas:original");
