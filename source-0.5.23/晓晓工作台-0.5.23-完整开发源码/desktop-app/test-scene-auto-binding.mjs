import assert from 'node:assert/strict';
import store from './asset-store.js';
const scene=(displayName,relativePath)=>({displayName,relativePath,kind:'scenes',mediaType:'image'});
const assets=[scene('宴会厅夜宴','场景/宴会厅.png'),scene('庄园花丛','场景/庄园花丛.png')];
assert.equal(store.matchSceneAsset('视频编号01｜场景：宴会厅｜人物：小红\n场景母版ID=SC01宴会厅夜宴；全量包',assets)?.relativePath,'场景/宴会厅.png');
assert.equal(store.matchSceneAsset('视频编号02｜场景：庄园花丛｜人物：小红',assets)?.relativePath,'场景/庄园花丛.png');
assert.equal(store.matchSceneAsset('视频编号02｜场景：宴会厅侧隔间｜人物：小红',assets),null);
assert.equal(store.matchSceneAsset('视频编号01｜场景：宴会厅夜宴', [...assets,scene('宴会厅夜宴','场景/另一张.png')]),null);
assert.equal(store.matchSceneAsset('视频编号01｜场景：宴会厅', [scene('重新命名','场景/宴会厅.png')])?.relativePath,'场景/宴会厅.png');
console.log('Scene master ID, renamed assets, distinct rooms and ambiguity checks passed');

// 场景自动匹配要处理两件事：
// 1) 不同模板把场景写在不同位置。旧模板在首行表头“｜场景：庄园花丛｜”，新模板
//    只写在【场景与连续状态】小节里“场景：主卧·夜·内（…）：大床…”。以前只看第
//    一行，所以新模板完全匹配不到场景。
// 2) 场景名之间互相包含。真实素材里同时存在“主卧”“主卧浴室”“宋宅主卧(管家破门
//    之后)”，必须整名相等才算命中，绝不能把“主卧”匹配成“主卧浴室”。
{
  const names = ['宋宅餐厅','宋宅一层起居区','宋宅主卧(管家破门之后)','宴会厅',
    '宴会厅附属·狭小休息隔间','月亮街雨夜','主卧','主卧浴室','庄园花丛'];
  const sceneAssets = names.map(name => ({
    kind:'scenes', mediaType:'image', displayName:name, relativePath:`场景/${name}.png`,
  }));
  const block = text => `【项目规格】\n\n【场景与连续状态】\n场景：${text}\n空间参照：床沿。`;
  const matched = text => store.matchSceneAsset(block(text), sceneAssets)?.displayName ?? null;

  assert.equal(matched('主卧·夜·内（记忆闪回结束，切回现实）：大床，何诞躺在宋柏峰身边。'), '主卧',
    '新模板的场景写在【场景与连续状态】里，必须能匹配到');
  assert.equal(matched('主卧浴室·夜·内：镜前灯。'), '主卧浴室', '互相包含的名字必须各归各位');
  assert.equal(matched('宋宅主卧(管家破门之后)·夜·内：床。'), '宋宅主卧(管家破门之后)',
    '素材名自带括号时不能被截断');
  // “宴会厅附属·狭小休息隔间”本身带 ·，不能被截成“宴会厅附属”。
  assert.equal(matched('宴会厅附属·狭小休息隔间·夜·内：门与洗手台。'), '宴会厅附属·狭小休息隔间');
  assert.equal(matched('宴会厅·夜·内：吊灯。'), '宴会厅');
  assert.equal(matched('月亮街雨夜·夜·外：积水。'), '月亮街雨夜');
  assert.equal(matched('天台·夜·外：风很大。'), null, '素材库里没有的场景不能硬凑一个');

  // 旧模板的首行表头写法必须继续有效。
  const legacy = '视频编号12（总时长：15s）｜场景：庄园花丛｜人物：荷包蛋\n场景：复用SC03庄园花丛日母版：中央玫瑰花坛。';
  assert.equal(store.matchSceneAsset(legacy, sceneAssets)?.displayName, '庄园花丛');

  // 同名多张时不猜，交给人工绑定。
  const duplicated = [...sceneAssets, {kind:'scenes', mediaType:'image', displayName:'主卧', relativePath:'场景/备选/主卧.png'}];
  assert.equal(store.matchSceneAsset(block('主卧·夜·内：大床。'), duplicated), null,
    '两张同名场景时不应随便挑一张');
}
console.log('Scene matching reads both templates and never confuses 主卧 with 主卧浴室');

// 服务端切分整稿的方式必须和工作台的 parseSource 一致。旧正则是
// /^\s*视频编号\s*\d+/m，要求行首就是“视频编号”；而模板写的是【视频编号06】，
// 行首是【，于是一条都切不出来——这个模板的场景自动匹配从来没运行过。
{
  const template = [
    'OS和必要物理音效。',
    '【视频编号06】',
    '总时长：13.0秒',
    '【场景与连续状态】',
    '场景：庄园花丛·日·外（数日后·上午）：花丛带、花坛。',
    '',
    '【视频编号15】',
    '【场景与连续状态】',
    '场景：月亮街·两年前雨夜·外（记忆闪回：荷包蛋的记忆）：暴雨青石板老街。',
  ].join('\n');
  assert.deepEqual(store.splitSourceSegments(template).map(item => item.id), ['06', '15'],
    '带【】的视频编号必须能切分出来');
  // 旧模板（行首直接写“视频编号01”）必须继续有效。
  const legacy = '视频编号01（总时长：12s）｜场景：大厅\n镜头01\n\n视频编号02（总时长：12s）｜场景：大厅\n镜头01';
  assert.deepEqual(store.splitSourceSegments(legacy).map(item => item.id), ['01', '02']);

  const names = ['宋宅餐厅','宋宅一层起居区','宋宅主卧(管家破门之后)','宴会厅',
    '宴会厅附属·狭小休息隔间','月亮街雨夜','主卧','主卧浴室','庄园花丛'];
  const sceneAssets = names.map(name => ({
    kind:'scenes', mediaType:'image', displayName:name, relativePath:`场景/${name}.png`,
  }));
  const matched = text => store.matchSceneAsset(`【场景与连续状态】\n场景：${text}`, sceneAssets)?.displayName ?? null;

  // 整名对不上时按首段前缀回退：“月亮街·两年前雨夜·外”只有“月亮街雨夜”以它开头。
  assert.equal(matched('月亮街·两年前雨夜·外（记忆闪回：荷包蛋的记忆）：暴雨青石板老街。'), '月亮街雨夜',
    '首段前缀唯一时应当匹配上');
  assert.equal(matched('庄园花丛·日·外（数日后·上午）：花丛带。'), '庄园花丛');
  // 同一前缀有多张时，靠后续段落分出唯一最高分。
  assert.equal(matched('宋宅·餐厅·日·内：长桌。'), '宋宅餐厅');
  // 前缀回退不能破坏原本就该精确命中的几组。
  assert.equal(matched('主卧·夜·内（记忆闪回结束）：大床。'), '主卧');
  assert.equal(matched('主卧浴室·夜·内：镜前灯。'), '主卧浴室');
  assert.equal(matched('宴会厅附属·狭小休息隔间·夜·内：门。'), '宴会厅附属·狭小休息隔间');
  // 前缀分不出唯一结果时宁可不匹配。
  assert.equal(matched('宋宅·日·内：某处。'), null, '只有共同前缀、分不出是哪一张时不应硬猜');
  assert.equal(matched('天台·夜·外：风很大。'), null);
}
console.log('Server-side chunking understands 【视频编号NN】, and scene names fall back to a unique prefix');
