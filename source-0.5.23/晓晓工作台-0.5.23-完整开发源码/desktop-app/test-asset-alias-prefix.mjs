// 资产【别名】前缀匹配：素材名以别名开头且紧跟版本分隔符也算命中；
// 多候选取后缀最短的一张，并列最短视为歧义，无分隔符的加长名不算命中。
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('./asset-workspace.js', import.meta.url), 'utf8');
const helpers = source.slice(
  source.indexOf('function nameMatchesAsset('),
  source.indexOf('function segmentRoles('),
);
const block = source.slice(
  source.indexOf('function characterCandidates('),
  source.indexOf('function characterCandidatesFor('),
);
assert.ok(helpers.includes('closestAssets') && block.length > 0, '必须能取出别名匹配的纯函数');
const candidates = new Function('data', 'current', `${helpers}${block}\nreturn characterCandidates;`);

const prompt = '【出场人物】\n苏瑶：开镜在场｜资产【妹妹女主】：浅亚麻金色蓬松短发。\n\n【镜头01】';
const img = displayName => ({ mediaType: 'image', displayName });
const run = assets => candidates(
  { assets, config: {}, roles: [] },
  () => ({ prompt }),
)('苏瑶', prompt);

// ① 别名【妹妹女主】命中带版本后缀的素材名。
{
  const hits = run([img('妹妹女主_upscayl_3x_upscayl-standard-4x')]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].displayName, '妹妹女主_upscayl_3x_upscayl-standard-4x');
}

// ② 两个等长版本并列时返回全部，交给人工裁决，不瞎猜。
{
  const hits = run([img('妹妹女主_v1'), img('妹妹女主_v2')]);
  assert.equal(hits.length, 2, '并列最短必须视为歧义返回全部');
}

// ③ 精确名存在时只返回精确那张。
{
  const hits = run([img('妹妹女主'), img('妹妹女主_v2')]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].displayName, '妹妹女主');
}

// ④ “妹妹女主变装”无分隔符，不算别名命中。
{
  const hits = run([img('妹妹女主变装')]);
  assert.equal(hits.length, 0, '无分隔符的加长名不能命中别名');
}

// 角色素材按扫描器归类带 kind；胡副局在提示词里无声明行，走 images 池。
const char = displayName => ({ mediaType: 'image', displayName, kind: 'characters' });
const runRole = (assets, role) => candidates(
  { assets, config: {}, roles: [] },
  () => ({ prompt }),
)(role, prompt);

// ⑤ 编号前缀素材（C02 胡副局）照常命中角色名。
{
  const hits = runRole([char('C02 胡副局')], '胡副局');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].displayName, 'C02 胡副局');
}

// ⑥ 角色名作为完整词段出现在素材名中部时，按相似度兜底命中。
{
  const hits = runRole([char('场景_胡副局_日景')], '胡副局');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].displayName, '场景_胡副局_日景');
}

// ⑦ 兜底命中仍按相似度取最高：剥前缀后的精确名赢过词段命中。
{
  const hits = runRole([char('场景_胡副局_日景'), char('C02 胡副局')], '胡副局');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].displayName, 'C02 胡副局');
}

console.log('Asset alias prefix match: versioned names hit, ties stay ambiguous, exact wins, no-separator misses, code-prefix and similarity fallback PASS');
