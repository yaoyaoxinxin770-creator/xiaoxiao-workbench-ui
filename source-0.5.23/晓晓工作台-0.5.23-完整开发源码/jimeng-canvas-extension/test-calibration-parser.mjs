import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "analyzer.js"), "utf8");
const context = { self: {} };
vm.runInNewContext(source, context);
const analyzer = context.self.JimengLockAnalyzer;

const prompt = `### 视频编号01（总时长：11.5s）｜场景：陆家花园主体草坪区｜人物：苏晚、陆泠霜
【场景与连续状态】
正文中的陆家花园主体草坪区与苏晚不应被锁定。
【出场人物】
苏晚、陆泠霜

## 视频编号02（总时长：13s）｜场景：陆家客厅｜人物：苏晚
【场景与连续状态】
正文
【出场人物】
苏晚

视频编号03（总时长：13s）｜场景：陆家客厅｜人物：苏晚、陆泠霜
【场景与连续状态】
正文
【出场人物】
苏晚、陆泠霜`;

const parsed = analyzer.parseCalibrationHeaders(prompt);
assert.equal(parsed.videos.length, 3);
assert.deepEqual(Array.from(parsed.videos, (item) => item.videoNumber), ["01", "02", "03"]);
assert.deepEqual(Array.from(parsed.videos, (item) => item.duration), ["11.5s", "13s", "13s"]);
assert.equal(parsed.scenePlans.length, 3);
assert.equal(parsed.subjectPlans.length, 5);
for (const plan of [...parsed.scenePlans, ...parsed.subjectPlans]) {
  assert.equal(prompt.slice(plan.offset - plan.anchor.length, plan.offset), plan.anchor);
  const headerEnd = prompt.indexOf("\n", prompt.lastIndexOf("视频编号", plan.offset));
  assert.ok(plan.offset <= headerEnd, `@${plan.name} must be placed in the video header`);
}

const result = analyzer.matchCalibrationSceneFiles(prompt, [
  { name: "陆家花园.png", webkitRelativePath: "场景/陆家花园.png" },
  { name: "陆家客厅.png", webkitRelativePath: "场景/陆家客厅.png" },
]);
assert.equal(result.matches.length, 3);
assert.equal(result.unmatchedScenes.length, 0);
assert.deepEqual(Array.from(result.matches, (item) => item.fileName), [
  "陆家花园.png", "陆家客厅.png", "陆家客厅.png",
]);

const ambiguousFiles = [
  { name: "陆家花园主体草坪区（初夏午后）.png", webkitRelativePath: "场景/陆家花园主体草坪区（初夏午后）.png" },
  { name: "陆家客厅（暮春夜2130）.png", webkitRelativePath: "场景/陆家客厅（暮春夜2130）.png" },
  { name: "陆家客厅（初夏午后）.png", webkitRelativePath: "场景/陆家客厅（初夏午后）.png" },
];
const ambiguous = analyzer.matchCalibrationSceneFiles(prompt, ambiguousFiles);
assert.equal(ambiguous.unmatchedScenes.length, 0);
assert.equal(ambiguous.ambiguousScenes.length, 2);
assert.deepEqual(Array.from(ambiguous.ambiguousScenes, (item) => item.videoNumber), ["02", "03"]);
assert.deepEqual(Array.from(ambiguous.ambiguousScenes, (item) => item.sceneName), ["陆家客厅", "陆家客厅"]);
assert.notEqual(ambiguous.ambiguousScenes[0].sceneKey, ambiguous.ambiguousScenes[1].sceneKey);
assert.equal(ambiguous.ambiguousScenes[0].candidates.length, 2);
assert.equal(ambiguous.ambiguousScenes[1].candidates.length, 2);
assert.equal(ambiguous.matches.length, 1);

const livingRoom02 = ambiguous.ambiguousScenes.find((item) => item.videoNumber === "02");
const livingRoom03 = ambiguous.ambiguousScenes.find((item) => item.videoNumber === "03");
const sharedLivingRoomId = ambiguous.ambiguousScenes[0].candidates[0].id;
const sharedKeyAttempt = analyzer.matchCalibrationSceneFiles(prompt, ambiguousFiles, {
  [ambiguous.ambiguousScenes[0].sharedSceneKey]: sharedLivingRoomId,
});
assert.equal(sharedKeyAttempt.ambiguousScenes.length, 2, "同名场景不能被旧共享键全局套用");
const selectedNightId = livingRoom02.candidates.find((item) => item.fileName.includes("暮春"))?.id;
const selectedAfternoonId = livingRoom03.candidates.find((item) => item.fileName.includes("初夏"))?.id;
const resolved = analyzer.matchCalibrationSceneFiles(prompt, ambiguousFiles, {
  [livingRoom02.sceneKey]: selectedNightId,
  [livingRoom03.sceneKey]: selectedAfternoonId,
});
assert.equal(resolved.ambiguousScenes.length, 0);
assert.equal(resolved.matches.length, 3);
assert.deepEqual(Array.from(resolved.matches, (item) => item.fileName), [
  "陆家花园主体草坪区（初夏午后）.png",
  "陆家客厅（暮春夜2130）.png",
  "陆家客厅（初夏午后）.png",
]);

const flashbackPrompt = `视频编号05（总时长：10s）｜场景：苏晚卧室（闪回）｜人物：苏晚
【场景与连续状态】
正文
【出场人物】
苏晚`;
const flashbackResult = analyzer.matchCalibrationSceneFiles(flashbackPrompt, [
  { name: "苏晚卧室（现代都市·暮春·深夜）.png", webkitRelativePath: "场景/苏晚卧室（现代都市·暮春·深夜）.png" },
]);
assert.equal(flashbackResult.unmatchedScenes.length, 0, "闪回括号不应阻断同名场景匹配");
assert.equal(flashbackResult.matches[0].fileName, "苏晚卧室（现代都市·暮春·深夜）.png");

const sectionTemplatePrompt = `视频编号29
\`\`\`\`plaintext
【项目规格】
【视频编号29】
【场景与连续状态】
白天，妖管局开放式办公区。阮乔站在工位椅前，霍砚位于他右前方约一步距离。
【光线】
冷白办公光。
【出场人物】
霍砚：开镜在场｜黑发黑衣，冷静审视。
阮乔：开镜在场｜白发、深蓝色成熟西装，高度紧张。
\`\`\`\`

视频编号30
\`\`\`plaintext
【项目规格】
【视频编号30】
总时长：14.4秒
【场景与连续状态】
继续白天妖管局开放式办公区。霍砚站在阮乔右前方等待回答。
【光线】
冷白办公光保持连续。
【出场人物】
霍砚：开镜在场｜保持沉默观察。
阮乔：开镜在场｜人类伪装，白发蓝色西装。
\`\`\``;
const sectionParsed = analyzer.parseCalibrationHeaders(sectionTemplatePrompt);
assert.equal(sectionParsed.videos.length, 2);
assert.deepEqual(Array.from(sectionParsed.videos, (item) => item.videoNumber), ["29", "30"]);
assert.deepEqual(Array.from(sectionParsed.videos, (item) => item.sceneName), [
  "妖管局开放式办公区", "妖管局开放式办公区",
]);
assert.deepEqual(Array.from(sectionParsed.videos, (item) => item.duration), ["", "14.4秒"]);
assert.equal(sectionParsed.scenePlans.length, 2);
assert.equal(sectionParsed.subjectPlans.length, 4);
for (const plan of [...sectionParsed.scenePlans, ...sectionParsed.subjectPlans]) {
  assert.equal(
    sectionTemplatePrompt.slice(plan.offset - plan.anchor.length, plan.offset),
    plan.anchor,
    `@${plan.name} 必须落在原文中的精确名称后`,
  );
}
for (const scenePlan of sectionParsed.scenePlans) {
  const videoStart = sectionTemplatePrompt.indexOf(`视频编号${scenePlan.videoNumber}`);
  const sceneSectionStart = sectionTemplatePrompt.indexOf("【场景与连续状态】", videoStart);
  const peopleSectionStart = sectionTemplatePrompt.indexOf("【出场人物】", sceneSectionStart);
  assert.ok(scenePlan.offset > sceneSectionStart && scenePlan.offset < peopleSectionStart);
}
for (const subjectPlan of sectionParsed.subjectPlans) {
  const videoStart = sectionTemplatePrompt.indexOf(`视频编号${subjectPlan.videoNumber}`);
  const peopleSectionStart = sectionTemplatePrompt.indexOf("【出场人物】", videoStart);
  assert.ok(subjectPlan.offset > peopleSectionStart, `@${subjectPlan.name} 必须位于【出场人物】中`);
}
const sectionSceneMatches = analyzer.matchCalibrationSceneFiles(sectionTemplatePrompt, [
  { name: "妖管局开放式办公区.png", webkitRelativePath: "场景/妖管局开放式办公区.png" },
]);
assert.equal(sectionSceneMatches.matches.length, 2);
assert.equal(sectionSceneMatches.unmatchedScenes.length, 0);

const multiAliasSceneFile = {
  name: "妖管局开放式办公区.png",
  webkitRelativePath: "场景/妖管局开放式办公区.png",
  jimengSceneAliases: ["兔妖事务大厅", "妖务办公厅"],
};
const aliasSceneResult = analyzer.matchCalibrationSceneFiles(
  "视频编号31（总时长：4s）｜场景：兔妖事务大厅｜人物：阮乔",
  [multiAliasSceneFile],
);
assert.equal(aliasSceneResult.matches.length, 1, "任一图片别名都应能命中同一张场景图");
assert.equal(aliasSceneResult.matches[0].file, multiAliasSceneFile);
assert.equal(aliasSceneResult.matches[0].name, "妖管局开放式办公区", "@ 搜索仍应使用实际上传文件名");
assert.equal(aliasSceneResult.matches[0].matchedAlias, "兔妖事务大厅");

const segmentedScenesPrompt = `视频编号35

【场景与连续状态】
场景A｜镜头01：深夜，妖管局大楼外景。
场景B｜镜头02—03：深夜妖管局办公区，阮乔独自加班。
场景C｜镜头04：妖管局大楼出口。
场景D｜镜头05—06：阮乔单身公寓门口及玄关。
使用28—65mm焦段。

【出场人物】
阮乔：开镜在场｜白发蓝色西装。`;
const segmentedParsed = analyzer.parseCalibrationHeaders(segmentedScenesPrompt);
assert.equal(segmentedParsed.videos.length, 1);
assert.equal(segmentedParsed.videos[0].scenePlans.length, 4);
assert.deepEqual(Array.from(segmentedParsed.scenePlans, (item) => item.sceneName), [
  "妖管局大楼外景",
  "妖管局办公区",
  "妖管局大楼出口",
  "阮乔单身公寓门口及玄关",
]);
for (const plan of segmentedParsed.scenePlans) {
  assert.equal(segmentedScenesPrompt.slice(plan.offset - plan.anchor.length, plan.offset), plan.anchor);
  assert.notEqual(plan.anchor, `场景${plan.label || ""}`, "场景 A/B/C/D 只是编号，不能作为场景名");
}
const segmentedMatches = analyzer.matchCalibrationSceneFiles(segmentedScenesPrompt, [
  { name: "妖管局大楼外景.png" },
  { name: "妖管局开放式办公区.png", jimengSceneAliases: ["妖管局办公区"] },
  { name: "妖管局大楼出口.png" },
  { name: "阮乔单身公寓门口及玄关.png" },
]);
assert.equal(segmentedMatches.matches.length, 4);
assert.equal(segmentedMatches.unmatchedScenes.length, 0);

const secondSegmentedPrompt = `视频编号36
【场景与连续状态】
场景A｜镜头01—02：阮乔公寓玄关。
场景B｜镜头03—06：公寓浴室，洗手台和镜子为固定空间锚点。
【出场人物】
阮乔：开镜在场。`;
const secondSegmentedParsed = analyzer.parseCalibrationHeaders(secondSegmentedPrompt);
assert.deepEqual(Array.from(secondSegmentedParsed.scenePlans, (item) => item.sceneName), [
  "阮乔公寓玄关",
  "公寓浴室",
]);

const inlineAliasPrompt = `视频编号41
\`\`\`plaintext
【项目规格】
【视频编号41】
【场景与连续状态】
场景：傍晚，路边炸串摊。
【出场人物】
苏瑶：开镜在场｜首次使用镜头02｜资产【妹妹女主】：浅亚麻金色蓬松短发、呆毛。
夏茉：开镜在场｜首次使用镜头01｜资产【夏茉】：黑色长发。
周桉：开镜在场｜资产【周桉】：黑色短发，灰色T恤。
【镜头01】`;
const inlineAliasParsed = analyzer.parseCalibrationHeaders(inlineAliasPrompt);
assert.equal(inlineAliasParsed.videos.length, 1);
assert.deepEqual(Array.from(inlineAliasParsed.videos[0].characters), ["苏瑶", "夏茉", "周桉"],
  "出场人物行内的资产【别名】不能截断小节");

console.log("[OK] whole-draft calibration parses both header and section-based scene/character @ placements");
