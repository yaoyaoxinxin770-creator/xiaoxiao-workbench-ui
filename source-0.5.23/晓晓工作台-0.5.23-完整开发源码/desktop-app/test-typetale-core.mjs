import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const core = require('./typetale-core');

const assets = [
  core.normalizeAsset({id:'char-1', name:'苏喻枝', kind:'characters', path:'人物/苏喻枝.png'}),
  core.normalizeAsset({id:'scene-1', name:'现代总裁办公室', kind:'scenes', path:'场景/现代总裁办公室.png'}),
  core.normalizeAsset({id:'prop-1', name:'咖啡杯', kind:'props', path:'道具/咖啡杯.png'}),
];
const source = `【视频编号01】\n@苏喻枝 在 @现代总裁办公室 拿起 @咖啡杯\n【视频编号02】\n@苏喻枝 走出门`;
const shots = core.splitShots(source);
assert.equal(shots.length, 2);
assert.equal(shots[0].id, '01');
assert.match(shots[0].prompt, /@苏喻枝/);
shots[0].bindings.assetIds = ['char-1', 'scene-1', 'prop-1'];
// 默认族不展开 chip：@实体名 保持原文，靠参考前缀声明。
const compiled = core.compilePrompt(shots[0], assets);
assert.equal(compiled.references.length, 3);
assert.equal(compiled.family.id, 'none');
assert.match(compiled.prompt, /图1是苏喻枝/);
assert.match(compiled.prompt, /@苏喻枝/);
assert.equal(compiled.referenceMap[0], '人物/苏喻枝.png');
assert.equal(compiled.referenceMap[2], '道具/咖啡杯.png');
assert.deepEqual(compiled.missingMentions, []);
assert.deepEqual(compiled.overflow, []);

// 即梦族展开成 @图片N，编号与前缀声明、referenceMap 共用同一套槽位号。
const jimeng = core.compilePrompt(shots[0], assets, {provider:{kind:'video', modelFamily:'jimeng_2_0'}});
assert.match(jimeng.prompt, /@图片1 在 @图片2 拿起 @图片3/);
assert.match(jimeng.prompt, /图1是苏喻枝；图2是现代总裁办公室；图3是咖啡杯。/);
assert.equal(jimeng.tokenMap['@图片2'], '场景/现代总裁办公室.png');

// H3 用 <Picture N> 且不允许同标签合并（<Picture 1、3> 不是合法标签）。
const h3 = core.compilePrompt(shots[0], assets, {provider:{kind:'video', modelFamily:'h3'}});
assert.match(h3.prompt, /<Picture 1> 在 <Picture 2> 拿起 <Picture 3>/);
assert.equal(h3.family.merge_labels, false);

// 超限素材既不参与 chip 替换也不进前缀，更不进 payload。
const capped = core.compilePrompt(shots[0], assets, {
  provider:{kind:'video', modelFamily:'tiny'},
  familyOverrides:{video:{tiny:{id:'tiny', name:'只带两张图', kind:'video', expand_chips:true, limits:{images:2}}}},
});
assert.equal(capped.references.filter(reference => reference.mediaType === 'image').length, 2);
assert.deepEqual(capped.overflow.map(item => item.name), ['咖啡杯']);
assert.match(capped.prompt, /@咖啡杯/);
assert.ok(!('2' in capped.referenceMap), '超限素材不能出现在 referenceMap 里');
assert.ok(!capped.prompt.includes('图3是'), '超限素材不能写进参考前缀');

// 音视频与图片各自独立编号，首尾帧不占参考槽位。
const mixed = core.compilePrompt(
  core.normalizeShot({id:'03', prompt:'@苏喻枝 说话', frames:{first:'char-1'}, bindings:{assetIds:['char-1', 'voice-1']}}),
  [...assets, core.normalizeAsset({id:'voice-1', name:'苏喻枝音色', kind:'audio', path:'音色/苏喻枝.wav'})],
  {provider:{kind:'video', modelFamily:'jimeng_2_0'}},
);
assert.equal(mixed.frames.first, '人物/苏喻枝.png');
assert.equal(mixed.references.filter(reference => reference.mediaType === 'image').length, 0, '被选为首帧的素材不再占参考槽位');
assert.equal(mixed.references.filter(reference => reference.mediaType === 'audio')[0].index, 1);

const provider = core.normalizeProvider({
  name:'测试中转站', type:'generic-video', baseUrl:'https://relay.example.com/',
  apiKey:'local-test-key', model:'video-model', duration:'8', aspectRatio:'9:16', resolution:'720p',
});
const request = core.buildExecutionRequest(provider, shots[0], compiled, {projectPath:'F:/project'});
assert.equal(request.kind, 'generic-video');
assert.equal(request.url, 'https://relay.example.com/v1/videos');
assert.equal(request.headers.Authorization, 'Bearer local-test-key');
assert.equal(request.body.model, 'video-model');
assert.equal(request.body.aspect_ratio, '9:16');
assert.equal(request.body.reference_images.length, 3);

const pluginRequest = core.buildExecutionRequest({...provider, type:'typetale-plugin', pluginPath:'plugins/demo'}, shots[0], compiled, {projectPath:'F:/project'});
assert.equal(pluginRequest.kind, 'typetale-plugin');
// 插件协议：reference_images 是 0 基整数键的扁平字典，首尾帧是独立的顶层字段。
// 宿主不替插件包 {"参考图片MAP": ...} —— 插件自己会按需要包，宿主包错一层会让
// reference_images.get("首帧") 永远取不到值。
assert.equal(pluginRequest.context.reference_images[0], '人物/苏喻枝.png');
assert.equal(pluginRequest.context.reference_images[2], '道具/咖啡杯.png');
assert.ok(!('参考图片MAP' in pluginRequest.context.reference_images));
assert.equal(pluginRequest.context.first_frame_path, '');
assert.equal(pluginRequest.context.end_frame_path, '');
for (const field of [
  'prompt', 'negative_prompt', 'reference_images', 'first_frame_path', 'end_frame_path',
  'scene_duration', 'audio_duration', 'audio_path', 'selected_characters', 'selected_locations',
  'is_video', 'batch_num', 'project_path', 'unique_name', 'viewer_index', 'generation_round',
  'output_position', 'model_family', 'plugin_params',
]) assert.ok(field in pluginRequest.context, `插件 context 缺字段 ${field}`);
assert.deepEqual(pluginRequest.context.selected_characters, ['苏喻枝']);
assert.deepEqual(pluginRequest.context.selected_locations, ['现代总裁办公室']);

// batch_num 决定 output_position 的长度，输出文件名沿用字字动画的命名规范。
const batched = core.buildExecutionRequest(
  {...provider, type:'typetale-plugin', pluginPath:'plugins/demo'},
  core.normalizeShot({id:'07', prompt:'x', batchNum:3, viewerIndex:12, generationRound:2}),
  compiled, {projectPath:'F:/project'},
);
assert.deepEqual(batched.context.output_position, [0, 1, 2]);
assert.equal(batched.context.batch_num, 3);
assert.equal(core.outputFileName({id:'07', viewerIndex:12, generationRound:2}, 1, '.png'), '0012_07_2_1.png');

const cliRequest = core.buildExecutionRequest({
  ...provider, type:'cli', command:'tool --prompt {prompt}', argsTemplate:['--shot', '{shotId}', '--ref', '{referenceImage1}'],
}, shots[0], compiled, {projectPath:'F:/project', outputDir:'F:/project/out'});
assert.equal(cliRequest.kind, 'cli');
assert.deepEqual(cliRequest.args.slice(0, 2), ['--shot', '01']);
assert.equal(cliRequest.args[3], '人物/苏喻枝.png');
assert.equal(cliRequest.env.TYPETALE_SHOT_ID, '01');

const normalized = core.normalizeState({projectPath:' F:/project ', assets, providers:[provider], shots});
assert.equal(normalized.projectPath, 'F:/project');
assert.equal(normalized.assets.length, 3);
assert.equal(normalized.providers[0].baseUrl, 'https://relay.example.com');
assert.equal(normalized.activeShotId, '01');

const projectA = 'F:/work/project-a';
const projectB = 'F:/work/project-b';
const scopedAssets = core.scopeAssetsToProject([
  {id:'local-char', name:'本作品角色', kind:'characters', path:'人物/本作品角色.png'},
  {id:'inside-scene', name:'本作品场景', kind:'scenes', path:'F:/work/project-a/场景/本作品场景.png'},
  {id:'outside-char', name:'其他项目角色', kind:'characters', path:'F:/work/project-b/人物/其他角色.png'},
  {id:'tagged-other', name:'其他项目标记', kind:'scenes', path:'场景/其他场景.png', projectPath:projectB},
], projectA);
assert.deepEqual(scopedAssets.map(asset => asset.id), ['local-char', 'inside-scene']);
assert.ok(scopedAssets.every(asset => asset.projectPath === projectA));
assert.equal(core.normalizeAsset({id:'group-1', name:'双人合照', kind:'groups', path:'人物/双人合照.png'}).kind, 'characters');

const normalizedProjectState = core.normalizeState({
  projectPath:projectA,
  assets:[...scopedAssets, {id:'foreign-scene', name:'其他作品场景', kind:'scenes', path:'F:/work/project-b/场景/其他.png'}],
  shots:[{id:'01', prompt:'@本作品角色', bindings:{assetIds:['local-char', 'foreign-scene']}}],
});
assert.deepEqual(normalizedProjectState.assets.map(asset => asset.id), ['local-char', 'inside-scene']);
assert.deepEqual(normalizedProjectState.shots[0].bindings.assetIds, ['local-char']);

// 新分镜字段：文案行、章节、结果历史（最多 4 条）、选中结果、标签、音色。
const extendedShot = core.normalizeShot({id:'09', prompt:'x'});
assert.deepEqual(extendedShot.lines, []);
assert.equal(extendedShot.chapterId, '');
assert.deepEqual(extendedShot.results, []);
assert.equal(extendedShot.selectedResult, -1);
assert.deepEqual(extendedShot.tags, []);
assert.equal(extendedShot.voiceId, '');
const withResults = core.normalizeShot({
  id:'10', prompt:'x', chapterId:'chapter-1', voiceId:'voice-1', tags:['战斗','战斗','夜'],
  lines:['第一句','第二句'], selectedResult:2,
  results:[1,2,3,4,5].map(n => ({path:`out/${n}.mp4`, url:`https://cdn/${n}.mp4`, createdAt:'t'})),
});
assert.equal(withResults.results.length, 5, '完整保留生成历史，展示数量不影响持久化');
assert.equal(withResults.selectedResult, 2);
assert.deepEqual(withResults.lines, ['第一句', '第二句']);
assert.equal(withResults.chapterId, 'chapter-1');
assert.equal(withResults.voiceId, 'voice-1');
assert.deepEqual(withResults.tags, ['战斗', '夜']);
assert.equal(core.normalizeShot({id:'11', results:[{path:'', url:''}]}).results.length, 0, '空结果不落盘');

// 章节：对象数组归一化，无 id 的条目丢弃，默认空数组。
const withChapters = core.normalizeState({
  projectPath:projectA,
  chapters:[{id:'c1', name:'章节1', title:'开端', collapsed:true}, {name:'没有 id'}],
});
assert.deepEqual(withChapters.chapters, [
  {id:'c1', name:'章节1', title:'开端', collapsed:true},
  {id:'chapter-2', name:'没有 id', title:'', collapsed:false},
]);
assert.deepEqual(core.normalizeState({}).chapters, []);

const prunedShots = core.pruneShotAssetBindings([
  {id:'01', prompt:'@本作品角色', bindings:{assetIds:['local-char', 'outside-char', 'tagged-other']}},
], scopedAssets);
assert.deepEqual(prunedShots[0].bindings.assetIds, ['local-char']);

console.log('TypeTale core: 分镜解析、模型族编译、槽位上限、插件协议 context 与项目素材隔离通过');
