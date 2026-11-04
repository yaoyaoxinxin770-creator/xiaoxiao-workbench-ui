import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),store=require('./asset-store'),{loadAnalyzer}=require('./project-assets');
const analyzer=loadAnalyzer(path.resolve(import.meta.dirname,'../jimeng-canvas-extension/analyzer.js'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'jimeng-asset-test-'));
const put=(rel,content='fixture')=>{const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,content);return f;};
try {
  assert.equal(analyzer.matchCharacterPrefix('阮乔-常服.jpeg',['阮','阮乔']),'阮乔');
  assert.equal(analyzer.matchCharacterPrefix('阮乔乔-常服.jpeg',['阮乔']),'');
  assert.equal(analyzer.matchCharacterPrefix('ChatGPT Image 2026.png',['阮乔']),'');
  put('人物/阮乔-常服.jpeg');put('人物/阮乔-睡衣.jpeg');put('人物/ChatGPT Image 2026.png');put('场景/大厅.png');put('音色/阮乔.wav');put('未知目录/霍砚.mp3');put('视频素材/ignored.png');
  const source='视频编号01（总时长：12s）｜场景：大厅｜人物：阮乔、霍砚\n镜头01｜大厅';
  let result=store.collect(root,analyzer,source);
  assert.equal(result.assets.length,6);assert.equal(result.assets.filter(a=>a.role==='阮乔'&&a.mediaType==='image').length,2);assert.equal(result.assets.filter(a=>a.kind==='audio').length,2);
  assert.equal(result.assets.find(a=>a.relativePath.includes('ChatGPT')).kind,'pending');
  store.edit(root,'人物/ChatGPT Image 2026.png',{displayName:'霍砚-西装',category:'characters',role:'霍砚',audio:'未知目录/霍砚.mp3'});
  result=store.collect(root,analyzer,source);
  assert.equal(result.assets.find(a=>a.displayName==='霍砚-西装').role,'霍砚');assert.ok(fs.existsSync(path.join(root,'人物/ChatGPT Image 2026.png')));
  assert.equal(result.config.audioBindings['霍砚'],'未知目录/霍砚.mp3');
  store.bind(root,'video:01:0','characters','人物/ChatGPT Image 2026.png');store.bind(root,'video:01:0','characters','人物/ChatGPT Image 2026.png');
  assert.equal(store.read(root).segmentAssetBindings['video:01:0'].characters.length,1);
  store.bindSegmentAudio(root,'video:01:0','阮乔','音色/阮乔.wav');
  assert.equal(store.read(root).segmentAudioBindings['video:01:0']['阮乔'],'音色/阮乔.wav');
  store.bindSegmentAudio(root,'video:01:0','霍砚','',true);
  assert.equal(store.read(root).segmentAudioBindings['video:01:0']['霍砚'],false);
  assert.throws(()=>store.bindSegmentAudio(root,'video:01:0','阮乔','人物/阮乔-常服.jpeg'));
  assert.throws(()=>store.inside(root,'../escape.png'));assert.throws(()=>store.inside(root,'.jimeng/project.json'));assert.throws(()=>store.edit(root,'人物/阮乔-睡衣.jpeg',{role:'__proto__'}));
  assert.throws(()=>store.bind(root,'__proto__','characters','人物/阮乔-常服.jpeg'));
  const original=put('imports/新图片.png','original');
  const externalProp=put('道具源/TT Image 2.png','prop');
  const externalScene=put('场景源/宋宅餐厅.png','scene');
  const externalCharacter=put('人物源/何诞·初化人形睡衣.png','character');
  assert.equal(store.inferCategory(externalProp,'auto'),'props');assert.equal(store.inferCategory(externalScene,'auto'),'scenes');assert.equal(store.inferCategory(externalCharacter,'auto'),'characters');
  const automatic=store.importImages(root,[externalProp,externalScene,externalCharacter],'auto');
  assert.ok(automatic.some(p=>p.startsWith('道具/')));assert.ok(automatic.some(p=>p.startsWith('场景/')));assert.ok(automatic.some(p=>p.startsWith('人物/')));
  const added=store.importImages(root,[original],'scenes');const again=store.importImages(root,[original],'scenes');
  assert.notEqual(added[0],again[0]);assert.equal(fs.readFileSync(original,'utf8'),'original');assert.equal(fs.readFileSync(path.join(root,added[0]),'utf8'),'original');
  store.removeFile(root,'人物/ChatGPT Image 2026.png');assert.equal(fs.existsSync(path.join(root,'人物/ChatGPT Image 2026.png')),false);assert.deepEqual(store.read(root).segmentAssetBindings['video:01:0'].characters,[]);
  store.removeFile(root,'未知目录/霍砚.mp3');assert.equal(store.read(root).audioBindings['霍砚'],undefined);
  store.removeFile(root,'音色/阮乔.wav');assert.equal(store.read(root).segmentAudioBindings['video:01:0']['阮乔'],undefined);
  const recoveryRoot=path.join(root,'配置恢复');fs.mkdirSync(recoveryRoot);
  store.write(recoveryRoot,{revision:1,kept:'上一份有效配置'});store.write(recoveryRoot,{revision:2});
  fs.writeFileSync(path.join(recoveryRoot,'.jimeng/project.json'),'');
  assert.deepEqual(store.read(recoveryRoot),{revision:1,kept:'上一份有效配置'});
  assert.ok(fs.readdirSync(path.join(recoveryRoot,'.jimeng')).some(name=>name.startsWith('project.json.corrupt-')));
  const emptyRoot=path.join(root,'空配置恢复');fs.mkdirSync(emptyRoot);fs.mkdirSync(path.join(emptyRoot,'.jimeng'));fs.writeFileSync(path.join(emptyRoot,'.jimeng/project.json'),'');
  assert.deepEqual(store.read(emptyRoot),{});assert.equal(fs.readFileSync(path.join(emptyRoot,'.jimeng/project.json'),'utf8').trim(),'{}');
  for(let i=0;i<120;i++)put(`场景/场景${i}.png`);
  const timings=Array.from({length:5},()=>store.collect(root,analyzer,source).scanMs);
  const text=fs.readFileSync(path.join(root,'.jimeng/project.json'),'utf8');assert.ok(!text.includes('base64'));assert.ok(!text.includes(root));
  console.log('Asset scan/group/override/audio/import/delete/path boundaries passed; 127 assets scan ms: '+timings.join(', '));
} finally {const resolved=path.resolve(root);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('jimeng-asset-test-'));fs.rmSync(resolved,{recursive:true,force:true});}

// 本组不使用某个角色：与音色的“不上传”同一套语义，存成 false 而不是删除条目。
// 删除条目只是取消手动指定、回到自动匹配，两者必须能区分开。
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jimeng-exclude-'));
  try {
    fs.mkdirSync(path.join(root, '人物'));
    fs.writeFileSync(path.join(root, '人物', '阮乔.png'), 'png');
    store.bindCharacter(root, 'video:01:0', '阮乔', '人物/阮乔.png');
    assert.equal(store.read(root).segmentCharacterBindings['video:01:0']['阮乔'], '人物/阮乔.png');

    const excluded = store.bindCharacter(root, 'video:01:0', '阮乔', '', false, true);
    assert.equal(excluded.segmentCharacterBindings['video:01:0']['阮乔'], false,
      '排除必须存成 false，才能和“未指定”区分开');
    assert.equal(store.read(root).segmentCharacterBindings['video:01:0']['阮乔'], false,
      '排除必须写盘，重开项目后仍然生效');

    // 排除不需要也不应该校验文件路径。
    store.bindCharacter(root, 'video:01:0', '小满', '', false, true);
    assert.equal(store.read(root).segmentCharacterBindings['video:01:0']['小满'], false);

    const restored = store.bindCharacter(root, 'video:01:0', '阮乔', '人物/阮乔.png');
    assert.equal(restored.segmentCharacterBindings['video:01:0']['阮乔'], '人物/阮乔.png',
      '重新选择形象必须能取消排除');

    const cleared = store.bindCharacter(root, 'video:01:0', '阮乔', '', true);
    assert.equal(Object.hasOwn(cleared.segmentCharacterBindings['video:01:0'] || {}, '阮乔'), false,
      '删除条目是回到自动匹配，不能留下 false');
  } finally {
    fs.rmSync(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }
}
console.log('Per-group character exclusion stored as false, distinct from clearing a manual choice');
