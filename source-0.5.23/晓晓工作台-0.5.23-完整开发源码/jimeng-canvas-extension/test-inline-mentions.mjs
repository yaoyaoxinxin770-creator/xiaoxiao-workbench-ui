import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");
const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder,
  chrome: { runtime: { onMessage: { addListener() {} } } },
  self: {},
};
vm.runInNewContext(source, context);

const prompt = `角色站位：胡离看向玄寂。
【出场人物】
胡离：开镜在场
玄寂：开镜在场
【镜头01】胡离转身。`;
const huLiEnd = prompt.indexOf("胡离：") + "胡离".length;
const xuanJiEnd = prompt.indexOf("玄寂：", huLiEnd) + "玄寂".length;
const fullText = `固定前缀：${prompt}`;
const placements = context.resolveLockPlacements(fullText, prompt, [
  { kind: "subject", name: "玄寂", anchor: "玄寂", offset: xuanJiEnd, occurrence: 2 },
  { kind: "subject", name: "胡离", anchor: "胡离", offset: huLiEnd, occurrence: 2 },
]);

assert.equal(placements.length, 2);
assert.deepEqual(Array.from(placements, (item) => item.name), ["胡离", "玄寂"]);
assert.equal(fullText.slice(placements[0].end - 2, placements[0].end), "胡离");
assert.equal(fullText.slice(placements[1].end - 2, placements[1].end), "玄寂");
assert.ok(placements[0].end < placements[1].end);

assert.equal(
  context.roleNameForMentionPlacement({ kind: "subject", name: "阮乔" }),
  "阮乔",
);
assert.equal(
  context.roleNameForMentionPlacement({
    kind: "image",
    name: "阮乔-宽松睡衣",
    sourceSubjectName: "阮乔",
  }),
  "阮乔",
);
assert.equal(
  context.roleNameForMentionPlacement({ kind: "image", name: "阮乔卧室" }),
  "",
  "普通场景图片不能误触发角色音频",
);

const roleAudio = [{
  name: "阮乔.mp3",
  transferId: "audio-ruan-qiao",
  roleBindings: ["阮乔"],
}];
const uploadedRoleAudio = new Set();
const firstAudio = context.pendingRoleAudioFor("阮乔", roleAudio, uploadedRoleAudio);
assert.equal(firstAudio.length, 1);
firstAudio.forEach((item) => uploadedRoleAudio.add(item.transferId || item.name));
assert.equal(
  context.pendingRoleAudioFor("阮乔", roleAudio, uploadedRoleAudio).length,
  0,
  "afterMention must not select an already confirmed role audio again",
);

// 分镜30 的真实形状：音频开场白把每个角色名都提前重复了一遍，角色形象 @ 的
// 锚点却在正文。写死 occurrence:1 会让光标退回开场白，芯片插到文本中间，
// 即梦的 mention 插件顺手吃掉后面一个字（这是张叔的音色 → 这是张叔的色），
// 发送前正文校验因此连续 20 次不一致。
const introRoles = ["张叔", "宋柏峰", "何诞（人形）"];
const intro = `30\n${introRoles.map((role) => `这是${role}的音色`).join("，")}\n`;
const body = `【出场人物】\n张叔：开镜在场\n宋柏峰：开镜在场\n【镜头01】张叔看向宋柏峰，宋柏峰没理张叔。`;
const introPrompt = intro + body;
const introFullText = `使用Seedance 2.0生成，提示词内容：${introPrompt}`;
const prefixLength = introFullText.length - introPrompt.length;
// 偏移量按提示词正文计算，和工作台发过来的一致（前缀由 promptStart 补上）。
const roleEnd = (role) => intro.length + body.indexOf(role) + role.length;
const audioEnd = (role) => introPrompt.indexOf(`这是${role}的音色`) + `这是${role}的音色`.length;
const introPlacements = context.resolveLockPlacements(introFullText, introPrompt, [
  { kind: "image", name: "张叔·管家爷爷", anchor: "张叔", offset: roleEnd("张叔") , occurrence: 1 },
  { kind: "image", name: "宋柏峰", anchor: "宋柏峰", offset: roleEnd("宋柏峰"), occurrence: 1 },
  { kind: "audio", name: "张叔", anchor: "这是张叔的音色", offset: audioEnd("张叔"), occurrence: 1 },
]);
const placementFor = (name) => introPlacements.find((item) => item.name === name);
for (const [name, role] of [["张叔·管家爷爷", "张叔"], ["宋柏峰", "宋柏峰"]]) {
  const placement = placementFor(name);
  assert.equal(introFullText.slice(placement.end - role.length, placement.end), role);
  assert.ok(placement.end > prefixLength + intro.length, `${name} 必须锚在正文，不能退回音色开场白`);
  // setCaretAfterOccurrence scans the live editor by this index, so it must name
  // the very occurrence the resolved position points at.
  assert.equal(
    context.occurrenceEnd(introFullText, role, placement.occurrence),
    placement.end,
    `${name} 的 occurrence 必须指向已解析的位置`,
  );
}
assert.equal(placementFor("张叔·管家爷爷").occurrence, 2, "音色开场白里的“张叔”是第 1 个，正文里的才是第 2 个");
assert.equal(placementFor("张叔").occurrence, 1, "整句音色锚点唯一，仍是第 1 个");
assert.equal(
  context.occurrenceEnd(introFullText, "这是张叔的音色", placementFor("张叔").occurrence),
  placementFor("张叔").end,
);

console.log("[OK] inline mentions preserve order and confirmed afterMention audio is selected only once");
