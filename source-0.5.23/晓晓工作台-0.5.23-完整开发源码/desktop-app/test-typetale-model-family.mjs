import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const mf = require('./typetale-model-family');
const core = require('./typetale-core');

// ---- 出厂族表与 kind 隔离 -------------------------------------------------
assert.equal(mf.safeKind('IMAGE'), 'image');
assert.equal(mf.safeKind('乱写'), 'video', '非法 kind 必须回落 video');
assert.deepEqual(mf.mediaKeysFor('image'), ['image'], '图片族只有图片一种媒体');
assert.deepEqual(mf.mediaKeysFor('video'), ['image', 'video', 'audio']);
assert.ok(mf.builtinFamilyIds('video').includes('jimeng_2_0'));
assert.ok(!mf.builtinFamilyIds('image').includes('jimeng_2_0'), '视频族不能出现在图片族表里');

// ---- token 渲染 -----------------------------------------------------------
const jimeng = mf.getFamily('video', 'jimeng_2_0');
assert.equal(mf.chipToken(jimeng, 'image', 3), '@图片3');
assert.equal(mf.prefixSentence(jimeng, 'image', 1, '张三'), '图1是张三');
assert.equal(mf.prefixSentence(jimeng, 'image', '1、3', '张三'), '图1、3是张三', '合并标签复用同一套模板');

const h3 = mf.getFamily('video', 'h3');
assert.equal(mf.chipToken(h3, 'image', 2), '<Picture 2>');
assert.equal(mf.mergeLabelsEnabled(h3), false, 'H3 不允许合并：<Picture 1、3> 不是合法标签');

const none = mf.getFamily('video', 'none');
assert.equal(mf.chipToken(none, 'image', 1), '', '默认族不展开 chip，返回空串让调用方保持原文');
assert.equal(mf.emitPrefixEnabled(none), true, '缺 emit_prefix 字段按开启处理');

// ---- 上限与截断 -----------------------------------------------------------
assert.equal(mf.familyLimit(none, 'image'), null, '没有 limits 就是不限');
assert.deepEqual(mf.clampToLimit([1, 2, 3], none, 'image'), {within: [1, 2, 3], overflow: []});
assert.deepEqual(
  mf.clampToLimit(['a', 'b', 'c'], mf.getFamily('video', 'wan_3_0'), 'image'),
  {within: ['a', 'b', 'c'], overflow: []},
);
const twoImages = mf.normalizeFamily({id: 'two', name: '两张图', limits: {images: 2}}, 'video');
assert.deepEqual(mf.clampToLimit(['a', 'b', 'c'], twoImages, 'image'), {within: ['a', 'b'], overflow: ['c']});
assert.deepEqual(mf.familyLimits(twoImages), {images: 2, videos: null, audios: null});

// ---- 名字推断（只用于默认显示，绝不写盘）---------------------------------
assert.equal(mf.inferModelFamily('video', 'seedance-2.5-pro'), 'jimeng_2_5');
assert.equal(mf.inferModelFamily('video', 'seedance-2.0-mini'), 'jimeng_2_0', '去点号再匹配 25 会误命中 2.0-mini');
assert.equal(mf.inferModelFamily('video', 'wan2.6-i2v'), 'wan_3_0');
assert.equal(mf.inferModelFamily('image', 'nano-banana'), 'omni_nano');
assert.equal(mf.inferModelFamily('video', '某个没人认识的模型'), 'none');
assert.equal(mf.inferModelFamily('video', ''), 'none');

// 自建族的关键词优先于出厂族
const customOverrides = {mine: {id: 'mine', name: '我的族', kind: 'video', infer_keywords: ['seedance']}};
assert.equal(mf.inferModelFamily('video', 'seedance-2.0', customOverrides), 'mine');

// ---- 覆盖层 ---------------------------------------------------------------
const overridden = mf.listFamilies('video', {jimeng_2_0: {limits: {images: 3}}});
const patched = overridden.find(family => family.id === 'jimeng_2_0');
assert.equal(patched.modified, true, '被覆盖的出厂族要带 modified 标记供 UI 显示 badge');
assert.equal(patched.limits.images, 3);
assert.equal(patched.builtin, true);
const withCustom = mf.listFamilies('video', {zz_custom: {id: 'zz_custom', name: '自建', kind: 'video'}});
assert.equal(withCustom.at(-1).id, 'zz_custom', '自建族追加在出厂族之后');
assert.equal(withCustom.at(-1).builtin, false);
// 出厂族本身不能被覆盖层污染（返回的是深拷贝）
assert.equal(mf.getFamily('video', 'jimeng_2_0').limits.images, 10);

// ---- 校验 -----------------------------------------------------------------
assert.deepEqual(mf.validateFamily(mf.getFamily('video', 'jimeng_2_0'), 'video'), []);
const errors = mf.validateFamily({
  id: '带 空格', name: '', expand_chips: true,
  chip_tokens: {image: '图片', video: '@视频{n}', audio: ''},
  prefix_tokens: {image: '图{n}', video: '视频{n}', audio: '音频{n}'},
  prefix_template: '{token}', limits: {images: -1},
}, 'video');
assert.ok(errors.some(item => item.includes('族 id')));
assert.ok(errors.some(item => item.includes('族名称')));
assert.ok(errors.some(item => item.includes('chip_tokens.image 必须包含 {n}')));
assert.ok(errors.some(item => item.includes('chip_tokens.audio 不能为空')));
assert.ok(errors.some(item => item.includes('prefix_template 必须包含 {label}')));
assert.ok(errors.some(item => item.includes('limits.images 不能为负数')));
// 图片族不校验 video / audio 的 token
assert.deepEqual(
  mf.validateFamily({id: 'img', name: '图片族', expand_chips: true, chip_tokens: {image: '@图片{n}'}, prefix_tokens: {image: '图{n}'}, prefix_template: '{token}是{label}'}, 'image'),
  [],
);

// ---- 样例预览 -------------------------------------------------------------
const preview = mf.samplePreview(mf.getFamily('video', 'jimeng_2_0'), 'video');
assert.deepEqual(preview.chips, ['@图片1', '@图片2', '@图片3', '@视频1', '@音频1']);
assert.equal(preview.prefixes[0], '图1是角色');
assert.equal(preview.merged, '图1、2是角色');
assert.equal(mf.samplePreview(mf.getFamily('image', 'omni_nano'), 'image').chips.length, 0, '不展开 chip 的族没有 chip 样例');

// ---- 归属解析优先级（显式落盘值 > 名字推断 > 默认族）---------------------
assert.equal(core.resolveFamily({kind: 'video', model: 'seedance-2.5'}).id, 'jimeng_2_5');
assert.equal(core.resolveFamily({kind: 'video', model: 'seedance-2.5', modelFamily: 'h3'}).id, 'h3', '用户选过的族不能被模型名推断冲掉');
assert.equal(core.resolveFamily({kind: 'video', model: ''}).id, 'none');
assert.equal(core.resolveFamily({kind: 'image', model: 'seedance-2.5'}).kind, 'image', '图片通道只能解析出图片族');

console.log('TypeTale 模型族：kind 隔离、token 渲染、上限截断、名字推断、覆盖层、校验与归属解析通过');
