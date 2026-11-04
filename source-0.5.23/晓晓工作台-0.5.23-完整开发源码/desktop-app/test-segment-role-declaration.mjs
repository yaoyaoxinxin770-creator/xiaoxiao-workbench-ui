// 出场角色必须来自本组的“人物：”声明行，不能拿角色名去整段提示词里搜。
// 真实故障：视频12 的人物行只有 荷包蛋、顾则宁、小满、宋柏峰，但正文里有
// “继承状态：周鸣与宾客乙已离场。”——全文包含匹配把两个已经离场的人也算成
// 出场角色，于是多上传了一张形象图、多 @ 了一个人。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(import.meta.dirname, 'asset-workspace.js'), 'utf8');
const from = source.indexOf('function declaredRoleNames(');
const to = source.indexOf('window.workbenchSegmentRoles=');
assert.ok(from >= 0 && to > from, '必须能取出角色判定的纯函数');
const make = roles => new Function('data', `${source.slice(from, to)}\nreturn segmentRoles;`)({roles});

const roles = ['荷包蛋', '顾则宁', '小满', '宋柏峰', '周鸣', '宾客乙', '何诞'];
const prompt = [
  '视频编号12（总时长：15s）｜场景：庄园花丛｜人物：荷包蛋、顾则宁、小满、宋柏峰',
  '',
  '【场景与连续状态】',
  '场景：复用SC03庄园花丛日母版：中央玫瑰花坛、南侧花架。本编号新增：无。',
  '时间：日。角色站位：荷包蛋趴在花架北侧梧桐枝头；顾则宁与小满并肩由西向东走；宋柏峰的轮椅从东侧宅门方向碾到梧桐树下。',
  '继承状态：周鸣与宾客乙已离场。',
].join('\n');

const picked = make(roles)(prompt);
assert.deepEqual([...picked].sort(), ['宋柏峰', '小满', '荷包蛋', '顾则宁'].sort(),
  `只应取人物声明行里的四个角色，实际 ${JSON.stringify(picked)}`);
assert.equal(picked.includes('周鸣'), false, '已离场的周鸣不能算作出场角色');
assert.equal(picked.includes('宾客乙'), false, '已离场的宾客乙不能算作出场角色');

// “角色站位：”“继承状态：”这类同样带“角色”二字的行不能被当成声明行。
assert.equal(make(roles)('时间：日。角色站位：周鸣站在门口。').includes('周鸣'), true,
  '没有人物声明行时退回全文匹配，不比改之前差');

// 【出场人物】块同样有效。
const blockPrompt = '【出场人物】\n荷包蛋、宋柏峰\n\n继承状态：周鸣已离场。';
assert.deepEqual([...make(roles)(blockPrompt)].sort(), ['宋柏峰', '荷包蛋'].sort());

// 声明里带修饰时按已知角色名做最长前缀匹配。
assert.deepEqual([...make(roles)('人物：荷包蛋（猫形）、宋柏峰')].sort(), ['宋柏峰', '荷包蛋'].sort());

// 同名不同衣服只是一个角色，不应因为素材多而重复。
assert.deepEqual(make(['何诞'])('人物：何诞、何诞'), ['何诞']);

console.log('Segment roles come from the character declaration, not a whole-text name scan');

// 第二种模板：【出场人物】下面一行一个角色，“角色名：描述…”。
// 之前只读了块里的第一行，所以只认出何诞，宋柏峰和宾客若干都被漏掉。
{
  const roles2 = ['何诞', '宋柏峰', '宾客若干', '周鸣'];
  const template = [
    '【项目规格】',
    '',
    '【场景与连续状态】',
    '场景：主卧·夜·内（记忆闪回结束，切回现实）：大床。',
    '角色站位（真实位置）：何诞躺在宋柏峰身侧。',
    '继承状态：承接编号17镜08；周鸣已离场。',
    '',
    '【光线】',
    '',
    '【出场人物】',
    '何诞（人形）：开镜在场｜首次镜头02｜20岁青年，睡衣，沿用既有角色资产（人形）；表演指纹：紧张时身体先于表情反应。',
    '宋柏峰：开镜在场（沉睡）｜首次镜头02｜26岁青年，床上沉睡，沿用既有角色资产；无台词。',
    '宾客若干：开镜在场（入镜虚化背景）｜首次镜头01｜宴会宾客群，仅承担背景。',
    '',
    '【镜头01】1.5s | 特写，俯拍，极轻前推。',
    '构图：摄影机俯拍特写：何诞闭眼沉睡。',
  ].join('\n');

  const picked = make(roles2)(template);
  assert.deepEqual([...picked].sort(), ['何诞', '宋柏峰', '宾客若干'].sort(),
    `一行一个角色的模板必须全部认出来，实际 ${JSON.stringify(picked)}`);
  assert.equal(picked.includes('周鸣'), false, '继承状态里提到的已离场角色仍然不能算出场');

  // 【镜头01】开始就不再属于出场人物块：正文里出现的词即使恰好是已知角色名，
  // 只要本组有正经的出场人物声明，就不能被算进来。
  assert.equal(make([...roles2, '构图'])(template).includes('构图'), false,
    '有出场人物声明时，正文里的词不能被当成角色');

  // 两种模板混在同一个项目里也要各自正确。
  const inline = '视频编号01（总时长：12s）｜场景：大厅｜人物：何诞、宋柏峰\n镜头01｜大厅';
  assert.deepEqual([...make(roles2)(inline)].sort(), ['何诞', '宋柏峰'].sort(),
    '单行“人物：”写法必须继续有效');
}
console.log('Both prompt templates resolve their own cast: one-role-per-line block and inline 人物 header');

// 手动在提示词里打的 @ 必须算作出场角色。执行器真正的 @ 只来自 lockedImages /
// lockedAudio 清单，正文里的“@小满”只是普通文字——不进清单就既不上传图片、
// 也不会在画布上变成真正的 @。所以手动 @ 过的人必须出现在出场角色里。
{
  const roles3 = ['荷包蛋', '小满', '宋柏峰'];
  // 只有荷包蛋写进了【出场人物】，小满是用户在正文里手动 @ 的。
  const manual = [
    '【出场人物】',
    '荷包蛋（猫形）：开镜在场｜首次镜头01｜狸花猫。',
    '',
    '【镜头04】小满@小满 入画，蹲下摸猫。',
  ].join('\n');
  const picked = make(roles3)(manual);
  assert.ok(picked.includes('小满'), `手动 @ 的角色必须算出场，实际 ${JSON.stringify(picked)}`);
  assert.ok(picked.includes('荷包蛋'), '声明里的角色照常保留');
  assert.equal(picked.includes('宋柏峰'), false, '没声明也没 @ 的角色不能混进来');

  // @ 到素材库里没有的名字时不能凭空造一个角色。
  assert.equal(make(roles3)('【出场人物】\n荷包蛋：在场。\n\n@路人甲 走过。').includes('路人甲'), false);

  // 场景的 @ 不应该被当成人物（场景不在角色名册里）。
  assert.deepEqual([...make(roles3)('【出场人物】\n荷包蛋：在场。\n\n场景：庄园花丛@庄园花丛')].sort(),
    ['荷包蛋'], '@ 场景不能变成出场角色');

  // 同一个人既声明又手动 @，只算一次。
  assert.deepEqual([...make(roles3)('【出场人物】\n小满：在场。\n\n小满@小满 蹲下。')], ['小满']);
}
console.log('Manually @-ed characters count as present, so they reach the upload and mention plan');

// 资产【别名】允许带版本后缀的素材名：前缀匹配命中后，别名行的角色也算出场。
{
  const seg = new Function('data', `${source.slice(from, to)}\nreturn segmentRoles;`);
  const aliasData = {
    roles: [],
    assets: [{ mediaType: 'image', displayName: '妹妹女主_upscayl_3x_upscayl-standard-4x' }],
    config: {},
  };
  const aliasPrompt = '【出场人物】\n苏瑶：开镜在场｜资产【妹妹女主】：浅亚麻金色蓬松短发。\n\n【镜头01】';
  assert.ok(seg(aliasData)(aliasPrompt).includes('苏瑶'),
    '资产【妹妹女主】必须命中带版本后缀的素材名');
}
console.log('Asset【alias】declaration matches versioned asset names by prefix');
