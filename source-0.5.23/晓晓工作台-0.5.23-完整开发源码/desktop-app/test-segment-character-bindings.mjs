import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const store=require('./asset-store');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'jimeng-segment-binding-'));
try {
  fs.mkdirSync(path.join(root,'人物'),{recursive:true});
  fs.writeFileSync(path.join(root,'人物','小红-礼服.png'),'image');
  fs.writeFileSync(path.join(root,'人物','小红-卫衣.png'),'image');
  store.write(root,{segmentCharacterBindings:{}});
  const key='video:01:0';
  store.bindCharacter(root,key,'小红','人物/小红-礼服.png');
  assert.equal(store.read(root).segmentCharacterBindings[key]['小红'],'人物/小红-礼服.png');
  store.bindCharacter(root,key,'小红','人物/小红-卫衣.png');
  assert.equal(store.read(root).segmentCharacterBindings[key]['小红'],'人物/小红-卫衣.png');
  store.bindCharacter(root,key,'小红','',true);
  assert.equal(store.read(root).segmentCharacterBindings[key],undefined);
  assert.throws(()=>store.bindCharacter(root,key,'小红','../outside.png'));
  console.log('Per-segment character appearance binding and replacement passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}

// 一个视频组最多带 3 个音频。超过时按角色在提示词中首次出现的先后定优先级：
// 出现得越靠前越先保留。这决定了真实上传哪几个音频文件，必须可预期且稳定。
{
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, 'asset-workspace.js'), 'utf8');
  const limit = source.match(/const MAX_SEGMENT_AUDIO=(\d+);/);
  assert.ok(limit, '必须有明确的音频数量上限常量');
  assert.equal(Number(limit[1]), 3, '上限应当是 3 个');

  // 直接取出纯函数来验算，不依赖浏览器环境。
  // 注意：window.workbenchSegmentAudioLimit 在界面文案里也出现过一次，
  // 必须从常量定义处往后找，否则会截到一段反向的空内容。
  const from = source.indexOf('const MAX_SEGMENT_AUDIO=');
  const block = source.slice(from, source.indexOf('window.workbenchSegmentAudioLimit=', from));
  const limitSegmentAudio = new Function(`${block}
return limitSegmentAudio;`)();

  const prompt = '人物：荷包蛋、顾则宁、小满、宋柏峰、周鸣';
  // 传入顺序故意打乱，结果必须只看提示词里的先后。
  const audio = ['周鸣', '宋柏峰', '荷包蛋', '小满', '顾则宁'].map(role => ({role, displayName: role}));
  const picked = limitSegmentAudio(audio, prompt).map(item => item.role);
  assert.deepEqual(picked, ['荷包蛋', '顾则宁', '小满'],
    '必须保留提示词中最先出现的三个角色的音频');

  // 不足 3 个时原样保留。
  assert.deepEqual(
    limitSegmentAudio(audio.slice(0, 2), prompt).map(item => item.role).sort(),
    ['周鸣', '宋柏峰'].sort());

  // 提示词里没出现的角色排在最后，且不能打乱彼此的相对顺序。
  const withStranger = [{role:'路人甲',displayName:'路人甲'}, ...audio];
  assert.equal(limitSegmentAudio(withStranger, prompt).some(item => item.role === '路人甲'), false,
    '提示词里没出现的角色不应挤掉真正出场的角色');
}
console.log('Segment audio capped at three, prioritised by order of appearance in the prompt');

// 同一个角色常有多套服装，命名形如“何诞·初化人形睡衣”。自动匹配要按服装名和
// 提示词的重合度来挑，而不是永远取第一张——否则提示词写着睡衣、发出去的却是
// 宴会礼服。必须分出唯一最高分才采用，避免每次刷新挑到不同的图。
{
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, 'asset-workspace.js'), 'utf8');
  const from = source.indexOf('function autoCharacterAsset(');
  const to = source.indexOf('window.workbenchAutoCharacterAsset');
  assert.ok(from >= 0 && to > from, '必须能取出服装挑选的纯函数');
  const autoCharacterAsset = new Function(`${source.slice(from, to)}\nreturn autoCharacterAsset;`)();

  const candidates = ['何诞·人形居家常服', '何诞·初化人形睡衣', '何诞·宴会礼服']
    .map(displayName => ({displayName}));
  const pick = prompt => autoCharacterAsset('何诞', candidates, prompt).displayName;

  assert.equal(pick('【出场人物】\n何诞（人形）：开镜在场｜20岁青年，睡衣，沿用既有角色资产（人形）。'),
    '何诞·初化人形睡衣', '提示词写睡衣就要挑睡衣那张');
  assert.equal(pick('【出场人物】\n何诞：开镜在场｜20岁青年，宴会正装，宴会礼服。'),
    '何诞·宴会礼服', '提示词写宴会礼服就要挑宴会那张');
  // 没有线索时保持稳定，不能每次刷新换一张。
  assert.equal(autoCharacterAsset('何诞', candidates, '【出场人物】\n何诞：在场。'), undefined, '无默认且无依据应待核对');
  assert.equal(autoCharacterAsset('何诞', candidates, '【出场人物】\n何诞：在场。'), undefined, '无默认且无依据应待核对');
  // 只有一张时原样返回。
  assert.equal(autoCharacterAsset('小满', [{displayName:'小满'}], '任意提示词').displayName, '小满');
}
console.log('Character outfit is chosen by how well its name overlaps the prompt, and stays stable without hints');

// 拖到出场角色区、但提示词里没有声明的角色，必须作为“额外出场”真实存下来并参与
// 执行。以前这种情况会退而用素材自己的角色名去写 segmentCharacterBindings，
// 但渲染和执行都只遍历本组 roles——那条绑定既不显示也不上传，等于写了个死绑定
// 还报了成功。
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jimeng-extra-'));
  try {
    fs.mkdirSync(path.join(root, '人物'));
    fs.writeFileSync(path.join(root, '人物', '周鸣.png'), 'png');

    const config = store.bind(root, 'video:27:0', 'characters', '人物/周鸣.png');
    assert.deepEqual(config.segmentAssetBindings['video:27:0'].characters, ['人物/周鸣.png'],
      '额外出场的角色要存进 segmentAssetBindings.characters');
    assert.equal(Object.hasOwn(config.segmentCharacterBindings || {}, 'video:27:0'), false,
      '不能再往 segmentCharacterBindings 里写一条谁都不认的假角色');
    assert.deepEqual(store.read(root).segmentAssetBindings['video:27:0'].characters, ['人物/周鸣.png'],
      '必须写盘，重开项目后仍在');

    const removed = store.bind(root, 'video:27:0', 'characters', '人物/周鸣.png', true);
    assert.deepEqual(removed.segmentAssetBindings['video:27:0'].characters, [], '移除要能生效');
  } finally {
    fs.rmSync(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  }

  // 界面和执行两边都要把这些额外角色算进来，并且在没有锚点时如实说明。
  const source = fs.readFileSync(path.resolve(import.meta.dirname, 'asset-workspace.js'), 'utf8');
  assert.match(source, /for\(const relative of data\.config\.segmentAssetBindings\?\.\[key\]\?\.characters\|\|\[\]\)/,
    '执行素材和界面都要遍历额外出场的角色');
  assert.match(source, /暂存，提示词里没有这个名字，本组不发送/,
    '没有锚点时必须如实说明本组不会发送它');
  // 没有锚点 = 不能 @，那就根本不该发送：白占一个附件位，还可能干扰生成结果。
  assert.ok(source.includes("if(!prompt.includes(name))continue;"),
    '提示词里找不到名字的额外角色不能进入执行素材');
  assert.equal(/\|\|missing\|\|asset\.role\|\|asset\.displayName/.test(source), false,
    '不能再凭空编一个角色名去写绑定');
}
console.log('Dropped characters the prompt never names are staged in the workbench only: shown, removable, never sent');
