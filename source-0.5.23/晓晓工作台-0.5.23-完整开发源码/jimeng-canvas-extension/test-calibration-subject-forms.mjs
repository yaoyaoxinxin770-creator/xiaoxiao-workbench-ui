import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "calibration.js"), "utf8");
const analyzerSource = await readFile(resolve(root, "analyzer.js"), "utf8");
const context = {
  console: { log() {}, warn() {}, error() {} },
  crypto: { randomUUID: () => "uuid" },
  document: {
    getElementById() {
      return {
        addEventListener() {},
        textContent: "",
        dataset: {},
        disabled: false,
        value: "",
        replaceChildren() {},
        append() {},
        querySelectorAll() { return []; },
      };
    },
  },
  chrome: {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { 
      onMessage: { addListener() {} },
      sendMessage: async () => ({ ok: true }),
    },
    tabs: { query: async () => [{ id: 1, url: "https://jimeng.jianying.com/ai-tool/" }], sendMessage: async () => ({ ok: true }) },
  },
  self: {
    JimengLockAnalyzer: {
      stemOf(name) {
        const value = String(name || "");
        const dot = value.lastIndexOf(".");
        return (dot > 0 ? value.slice(0, dot) : value).trim();
      },
      composePrompt(prefix, prompt) {
        return `${prefix}${prompt}`;
      },
    },
  },
  File: class File {},
  URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
  navigator: { clipboard: { writeText: async () => {} } },
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(source, context);
vm.runInNewContext(analyzerSource, context);

const analyzer = context.self.JimengLockAnalyzer;
assert.ok(analyzer);

const prompt = `视频编号01
【项目规格】
总时长：11.5s
【场景与连续状态】
陆家花园主体草坪区，午后阳光正盛。
【出场人物】
苏晚：全程在场｜成年垂耳兔精形态。
陆泠霜：开镜在场｜黑衣。

视频编号02
【项目规格】
总时长：13s
【场景与连续状态】
陆家客厅，暮春深夜。
【出场人物】
苏晚：现实与闪回中在场｜成年垂耳兔精，宽松睡衣。`;

const parsed = analyzer.parseCalibrationHeaders(prompt);
assert.equal(parsed.subjectPlans.length, 3);
assert.equal(parsed.subjectPlans[0].name, "苏晚");
assert.equal(parsed.subjectPlans[0].description, "全程在场｜成年垂耳兔精形态。");
assert.equal(parsed.subjectPlans[1].name, "陆泠霜");
assert.equal(parsed.subjectPlans[2].description, "现实与闪回中在场｜成年垂耳兔精，宽松睡衣。");

const baseNames = Array.from(parsed.subjectPlans, (item) => item.name);
assert.deepEqual(baseNames, ["苏晚", "陆泠霜", "苏晚"]);

const debug = context.self.JimengCalibrationDebug;
assert.ok(debug);
const resolved01 = debug.resolveCalibrationSubjectPlan(parsed.subjectPlans[0]);
const resolved02 = debug.resolveCalibrationSubjectPlan(parsed.subjectPlans[2]);
assert.equal(resolved01.originalName, "苏晚");
assert.equal(resolved02.originalName, "苏晚");
assert.notEqual(resolved01.videoNumber, resolved02.videoNumber);
assert.equal(resolved01.autoResolvedName, "苏晚");
assert.deepEqual(Array.from(debug.calibrationSubjectPlanChoiceNames(resolved01)), ["苏晚"]);
assert.deepEqual(Array.from(debug.calibrationSubjectPlanChoiceNames(resolved02)), ["苏晚"]);
assert.equal(resolved02.autoResolvedName, "苏晚");
debug.setCalibrationSubjectPlanSelection(resolved02, "苏晚-宽松睡衣");
const manuallyResolved02 = debug.resolveCalibrationSubjectPlan(resolved02);
assert.equal(manuallyResolved02.name, "苏晚", "形态选择不会改变基础角色发送名");
assert.deepEqual(Array.from(debug.expandCalibrationSubjectScanNames([resolved01, resolved02])), ["苏晚"]);

const extraImage = { name: "苏晚-宽松睡衣.jpeg", size: 12, lastModified: 34 };
const roleAudio = { name: "旧音频.mp3", size: 56, lastModified: 78 };
const secondRoleAudio = { name: "另一个旧音频.wav", size: 90, lastModified: 12 };
const imageKey = `${extraImage.name}:${extraImage.size}:${extraImage.lastModified}`;
const audioKey = `${roleAudio.name}:${roleAudio.size}:${roleAudio.lastModified}`;
const secondAudioKey = `${secondRoleAudio.name}:${secondRoleAudio.size}:${secondRoleAudio.lastModified}`;
debug.calibrationExtraFiles.push(extraImage, roleAudio, secondRoleAudio);
debug.calibrationExtraBindings.set(imageKey, ["苏晚"]);
debug.calibrationExtraAliases.set(audioKey, "苏晚");
debug.calibrationExtraAliases.set(secondAudioKey, "陆泠霜");

assert.equal(debug.calibrationSubjectPlanSelectionValue(resolved02), "__base__",
  "主体库即使与额外图片同时存在也必须保持默认");
assert.deepEqual(
  Array.from(debug.calibrationSubjectPlanChoiceNames(resolved02)),
  ["苏晚", "苏晚-宽松睡衣.jpeg"],
);
const extraSelection = `__extra__:${imageKey}`;
debug.setCalibrationSubjectPlanSelection(resolved02, extraSelection);
assert.equal(debug.calibrationSubjectPlanSelectionValue(resolved02), extraSelection);
assert.equal(debug.calibrationSelectedExtraImage(resolved02), extraImage);
const imagePlan = debug.calibrationSubjectImagePlan(resolved02, extraImage);
assert.equal(imagePlan.name, "苏晚-宽松睡衣");
assert.equal(imagePlan.sourceSubjectName, "苏晚");
assert.deepEqual(Array.from(debug.calibrationExtraBindingNames(roleAudio)), ["苏晚"],
  "音频工作台名称应自动成为角色绑定");

const secondVideoStart = prompt.indexOf("视频编号02");
const chunk = {
  prompt,
  start: 0,
  videoNumbers: ["01", "02"],
  segmentStarts: new Map([[0, 0], [secondVideoStart, secondVideoStart]]),
};
const introJob = debug.buildCalibrationChunkJob({
  ...parsed,
  matches: [],
  subjectImagePlans: [],
}, chunk, 0, 1);
assert.equal(introJob.audioIntroMode, true);
assert.equal(introJob.lockedAudio.length, 3, "每个视频只声明本视频出场且已绑定的角色音频");
assert.match(introJob.prompt, /^这是苏晚的音色，这是陆泠霜的音色\n视频编号01/);
assert.match(introJob.prompt, /\n\n这是苏晚的音色\n视频编号02/);
assert.deepEqual(Array.from(introJob.lockedAudio, (item) => item.name), ["苏晚", "陆泠霜", "苏晚"]);
assert.ok(introJob.lockedSubjects.every((item) =>
  introJob.prompt.slice(item.offset - item.anchor.length, item.offset) === item.anchor),
"插入音色前置行后，原人物 @ 的偏移仍必须落在正确人物名后");

console.log("[OK] per-video subjects default to the library, allow a manual extra image, and bind renamed audio by role");
