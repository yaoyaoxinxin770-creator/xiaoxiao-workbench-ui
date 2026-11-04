// 回归：额外图片绑定角色后，每个视频的人物卡片必须能在
// “主体库 / 额外上传”两类来源之间选择，且输入即生效、无需失焦或重新校准。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const calibrationSource = await readFile(resolve(root, "calibration.js"), "utf8");
const analyzerSource = await readFile(resolve(root, "analyzer.js"), "utf8");

class El {
  constructor(tag) {
    this.tagName = String(tag || "div").toLowerCase();
    this.children = [];
    this.listeners = new Map();
    this.value = "";
    this.textContent = "";
    this.disabled = false;
    this.checked = false;
    this.dataset = {};
    this.title = "";
    this.className = "";
    this.type = "";
    this.label = "";
  }
  append(...kids) { for (const kid of kids) if (kid) this.children.push(kid); }
  prepend(...kids) { this.children.unshift(...kids.filter(Boolean)); }
  replaceChildren(...kids) { this.children = kids.filter(Boolean); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn({ target: this, ...event });
  }
  querySelectorAll() { return []; }
  walk(visit) {
    visit(this);
    for (const child of this.children) child.walk?.(visit);
  }
}

const elements = new Map();
const documentMock = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new El("input"));
    return elements.get(id);
  },
  createElement(tag) { return new El(tag); },
};

const context = {
  console: { log() {}, warn() {}, error() {} },
  crypto: { randomUUID: () => "uuid" },
  document: documentMock,
  chrome: {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true }) },
    tabs: {
      query: async () => [{ id: 1, url: "https://jimeng.jianying.com/ai-tool/" }],
      sendMessage: async () => ({ ok: true }),
    },
  },
  self: {},
  File: class File {},
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  navigator: { clipboard: { writeText: async () => {} } },
  setTimeout, clearTimeout,
};
vm.createContext(context);
vm.runInContext(analyzerSource, context);
vm.runInContext(calibrationSource, context);
const debug = context.self.JimengCalibrationDebug;

const byId = (id) => documentMock.getElementById(id);

function buildEnvironment(prompt) {
  // calibration.js 在加载时已缓存各控件引用，这里只能复用、不能重建元素表。
  byId("calibration-prompt").value = prompt;
  byId("calibration-prompt").dispatch("input");
  byId("calibration-extra-manager").replaceChildren();
  byId("calibration-asset-summary").replaceChildren();
  debug.calibrationExtraFiles.length = 0;
  debug.calibrationExtraAliases.clear();
  debug.calibrationExtraBindings.clear();
  debug.calibrationSubjectManualOverrides.clear();
  const filesInput = byId("calibration-files");
  return {
    addFiles(files) {
      filesInput.dispatch("change", { target: { files, value: "" } });
    },
    bindingInputForRow(index) {
      return byId("calibration-extra-manager").children[index]
        .children.find((el) => el.className === "extra-manager-binding");
    },
    aliasInputForRow(index) {
      return byId("calibration-extra-manager").children[index]
        .children.find((el) => el.className === "extra-manager-alias");
    },
    inferredBindingForRow(index) {
      return byId("calibration-extra-manager").children[index]
        .children.find((el) => el.className === "extra-manager-inferred-binding");
    },
    groupsInSelect(index = 0) {
      const audit = byId("calibration-asset-summary");
      const selects = [];
      audit.walk((node) => { if (node.tagName === "select") selects.push(node); });
      const select = selects[index];
      assert.ok(select, "应渲染人物来源下拉");
      return select.children.map((group) => ({
        group: group.label,
        options: group.children.map((option) => option.textContent),
      }));
    },
    groupsInFirstSelect() { return this.groupsInSelect(0); },
    auditElements(tagName, textContent = null) {
      const matches = [];
      byId("calibration-asset-summary").walk((node) => {
        if (node.tagName === tagName && (textContent === null || node.textContent === textContent)) matches.push(node);
      });
      return matches;
    },
  };
}

function primeParsedSubjects() {
  byId("calibrate").dispatch("click");
}

const addedCaseFailures = [];
function addedCase(name, run) {
  try {
    run();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    addedCaseFailures.push(error);
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

function buildMultiVideoRoleEnvironment() {
  const env = buildEnvironment(`视频编号60
【场景与连续状态】
卧室，夜晚。
【出场人物】
阮乔：全程可见。

视频编号61
【场景与连续状态】
客厅，白天。
【出场人物】
阮乔：全程可见。
霍祁：全程可见。`);
  const qiaoExtra = { name: "阮乔.jpeg", size: 601, lastModified: 61 };
  const huoExtra = { name: "霍祁.jpeg", size: 602, lastModified: 62 };
  env.addFiles([qiaoExtra, huoExtra]);
  byId("calibrate").dispatch("click");
  const parsed = context.self.JimengLockAnalyzer.parseCalibrationHeaders(byId("calibration-prompt").value);
  const plans = parsed.subjectPlans.map(debug.resolveCalibrationSubjectPlan);
  return {
    env,
    plans,
    qiaoPlans: plans.filter((plan) => debug.calibrationSubjectPlanChoiceNames(plan)[0] === "阮乔"),
    huoPlan: plans.find((plan) => debug.calibrationSubjectPlanChoiceNames(plan)[0] === "霍祁"),
    qiaoValue: `__extra__:${qiaoExtra.name}:${qiaoExtra.size}:${qiaoExtra.lastModified}`,
    huoValue: `__extra__:${huoExtra.name}:${huoExtra.size}:${huoExtra.lastModified}`,
  };
}

// --- 场景 1：输入绑定即生效（不触发 change、不再点校准），下拉立刻出现两类 ---
{
  const env = buildEnvironment(`视频编号40
【场景与连续状态】
阮乔卧室，夜晚。
【出场人物】
阮乔：全程可见｜成年垂耳兔精。`);
  env.addFiles([
    { name: "宽松睡衣.jpeg", size: 100, lastModified: 11 },
    { name: "照片中的匿名成年男性.png", size: 200, lastModified: 22 },
    { name: "受.mp3", size: 300, lastModified: 33 },
  ]);
  byId("calibrate").dispatch("click");
  let groups = env.groupsInFirstSelect();
  assert.equal(groups.length, 1, "绑定前只有主体库一组");
  assert.equal(groups[0].group, "主体库");

  const binding = env.bindingInputForRow(0);
  binding.value = "阮乔";
  binding.dispatch("input"); // 只输入、未失焦，也未重新点校准

  groups = env.groupsInFirstSelect();
  assert.deepEqual(groups.map((g) => g.group), ["主体库", "额外上传（我上传的图片）"],
    "输入绑定后应立即出现主体库与额外上传两组");
  assert.equal(groups[0].options[0], "阮乔（默认）");
  assert.deepEqual(groups[1].options, ["宽松睡衣.jpeg"]);

  // 清空绑定后应回到只有主体库
  binding.value = "";
  binding.dispatch("input");
  groups = env.groupsInFirstSelect();
  assert.equal(groups.length, 1);
}

// --- 场景 2：人名带零宽字符也能匹配上额外图片绑定 ---
{
  const env = buildEnvironment(`视频编号41
【场景与连续状态】
卧室，深夜。
【出场人物】
阮乔​：全程可见。`); // 阮乔后夹带零宽空格 U+200B
  env.addFiles([{ name: "阮乔-宽松睡衣.jpeg", size: 101, lastModified: 12 }]);
  const binding = env.bindingInputForRow(0);
  binding.value = "阮乔";
  binding.dispatch("input");
  const groups = env.groupsInFirstSelect();
  assert.equal(groups.length, 2, "零宽字符不应阻断角色名与绑定的匹配");
  assert.deepEqual(groups[1].options, ["阮乔-宽松睡衣.jpeg"]);
}

// --- 场景 3：同一角色在两个视频里可分别选择不同来源，互不影响 ---
{
  const env = buildEnvironment(`视频编号40
【场景与连续状态】
卧室，夜晚。
【出场人物】
阮乔：全程可见。

视频编号41
【场景与连续状态】
客厅，白天。
【出场人物】
阮乔：全程可见。`);
  const extra = { name: "阮乔-宽松睡衣.jpeg", size: 102, lastModified: 13 };
  env.addFiles([extra]);
  const binding = env.bindingInputForRow(0);
  binding.value = "阮乔";
  binding.dispatch("input");

  const selects = [];
  byId("calibration-asset-summary").walk((node) => {
    if (node.tagName === "select") selects.push(node);
  });
  assert.equal(selects.length, 2, "两个视频各有一个人物来源下拉");
  const extraKey = `${extra.name}:${extra.size}:${extra.lastModified}`;
  const plans = [];
  // 通过 debug 直接验证按视频独立的选择状态
  const parsed = context.self.JimengLockAnalyzer.parseCalibrationHeaders(byId("calibration-prompt").value);
  for (const plan of parsed.subjectPlans) plans.push(debug.resolveCalibrationSubjectPlan(plan));
  debug.setCalibrationSubjectPlanSelection(plans[0], `__extra__:${extraKey}`);
  assert.ok(debug.calibrationSelectedExtraImage(plans[0]), "视频40 选额外图片");
  assert.equal(debug.calibrationSubjectPlanSelectionValue(plans[1]), "__base__",
    "视频41 仍保持主体库默认，互不影响");
}

// --- A-a：图片未手填角色时，工作台名称应自动成为角色绑定 ---
addedCase("A-a alias fallback creates an extra-image candidate", () => {
  const env = buildEnvironment(`视频编号50
【场景与连续状态】
卧室，夜晚。
【出场人物】
阮乔：全程可见。`);
  env.addFiles([{ name: "原始衣服.jpeg", size: 501, lastModified: 51 }]);
  const alias = env.aliasInputForRow(0);
  alias.value = "阮乔";
  alias.dispatch("input");
  const groups = env.groupsInFirstSelect();
  assert.deepEqual(groups.map((item) => item.group), ["主体库", "额外上传（我上传的图片）"]);
  assert.deepEqual(groups[1].options, ["阮乔.jpeg"]);
  assert.equal(env.inferredBindingForRow(0)?.textContent, "自动绑定：阮乔");
});

// --- A-b：手填角色必须覆盖与之不同的工作台名称 ---
addedCase("A-b manual binding overrides the alias fallback", () => {
  const env = buildEnvironment(`视频编号51
【场景与连续状态】
客厅，白天。
【出场人物】
阮乔：全程可见。
霍祁：全程可见。`);
  env.addFiles([{ name: "原始衣服.jpeg", size: 502, lastModified: 52 }]);
  const alias = env.aliasInputForRow(0);
  alias.value = "阮乔";
  alias.dispatch("input");
  assert.equal(env.inferredBindingForRow(0)?.textContent, "自动绑定：阮乔");
  const binding = env.bindingInputForRow(0);
  binding.value = "霍祁";
  binding.dispatch("input");
  assert.equal(env.inferredBindingForRow(0)?.textContent, "", "手填后自动推断提示必须隐藏");
  assert.equal(env.groupsInSelect(0).length, 1, "阮乔不应得到该图片");
  assert.deepEqual(env.groupsInSelect(1)[1].options, ["阮乔.jpeg"], "霍祁应得到手填绑定的图片");
});

// --- A-c：自动推断名称与人物无关时，不得制造候选 ---
addedCase("A-c unrelated original filename does not create a role candidate", () => {
  const env = buildEnvironment(`视频编号52
【场景与连续状态】
走廊，白天。
【出场人物】
阮乔：全程可见。`);
  env.addFiles([{ name: "匿名服装.jpeg", size: 503, lastModified: 53 }]);
  byId("calibrate").dispatch("click");
  assert.equal(env.inferredBindingForRow(0)?.textContent, "自动绑定：匿名服装");
  assert.equal(env.groupsInFirstSelect().length, 1);
});

// --- A-d：已有显式额外图选择不被自动推断改写 ---
addedCase("A-d an existing explicit extra selection remains unchanged", () => {
  const env = buildEnvironment(`视频编号53
【场景与连续状态】
卧室，夜晚。
【出场人物】
阮乔：全程可见。`);
  const extra = { name: "睡衣.jpeg", size: 504, lastModified: 54 };
  env.addFiles([extra]);
  const binding = env.bindingInputForRow(0);
  binding.value = "阮乔";
  binding.dispatch("input");
  const parsed = context.self.JimengLockAnalyzer.parseCalibrationHeaders(byId("calibration-prompt").value);
  const plan = debug.resolveCalibrationSubjectPlan(parsed.subjectPlans[0]);
  const value = `__extra__:${extra.name}:${extra.size}:${extra.lastModified}`;
  debug.setCalibrationSubjectPlanSelection(plan, value);
  assert.equal(debug.calibrationSubjectPlanSelectionValue(plan), value);
  byId("calibrate").dispatch("click");
  assert.equal(debug.calibrationSubjectPlanSelectionValue(plan), value);
});

// --- D-a：角色名 + 服装后缀应按整稿角色前缀自动绑定 ---
addedCase("D-a known role prefix binds a versioned image", () => {
  const env = buildEnvironment(`视频编号54
【场景与连续状态】
卧室，夜晚。
【出场人物】
阮乔：全程可见。`);
  primeParsedSubjects();
  env.addFiles([{ name: "阮乔-宽松睡衣.jpeg", size: 505, lastModified: 55 }]);
  const groups = env.groupsInFirstSelect();
  assert.deepEqual(groups.map((item) => item.group), ["主体库", "额外上传（我上传的图片）"]);
  assert.deepEqual(groups[1].options, ["阮乔-宽松睡衣.jpeg"]);
  assert.equal(env.inferredBindingForRow(0)?.textContent, "自动绑定：阮乔");
});

// --- D-b：多个角色名都是前缀时必须取归一化后的最长名称 ---
addedCase("D-b longest known role prefix wins", () => {
  const env = buildEnvironment(`视频编号55
【场景与连续状态】
卧室，夜晚。
【出场人物】
阮：全程可见。
阮乔：全程可见。`);
  primeParsedSubjects();
  env.addFiles([{ name: "阮乔-宽松睡衣.jpeg", size: 506, lastModified: 56 }]);
  assert.equal(env.groupsInSelect(0).length, 1, "短名阮不应得到该图片");
  assert.deepEqual(env.groupsInSelect(1)[1].options, ["阮乔-宽松睡衣.jpeg"]);
  assert.equal(env.inferredBindingForRow(0)?.textContent, "自动绑定：阮乔");
});

// --- D-c：手填绑定非空时不得再采用角色名前缀推断 ---
addedCase("D-c manual binding suppresses prefix inference", () => {
  const env = buildEnvironment(`视频编号56
【场景与连续状态】
客厅，白天。
【出场人物】
阮乔：全程可见。
霍祁：全程可见。`);
  primeParsedSubjects();
  env.addFiles([{ name: "阮乔-宽松睡衣.jpeg", size: 507, lastModified: 57 }]);
  assert.deepEqual(env.groupsInSelect(0)[1].options, ["阮乔-宽松睡衣.jpeg"],
    "手填前应先按角色名前缀自动绑定阮乔");
  const binding = env.bindingInputForRow(0);
  binding.value = "霍祁";
  binding.dispatch("input");
  assert.equal(env.groupsInSelect(0).length, 1, "阮乔不应得到手填给霍祁的图片");
  assert.deepEqual(env.groupsInSelect(1)[1].options, ["阮乔-宽松睡衣.jpeg"]);
  assert.equal(env.inferredBindingForRow(0)?.textContent, "");
});

// --- D-d：没有已知角色前缀时回退完整 stem，但不误入角色候选 ---
addedCase("D-d unmatched stem does not create a role candidate", () => {
  const env = buildEnvironment(`视频编号57
【场景与连续状态】
走廊，白天。
【出场人物】
阮乔：全程可见。`);
  primeParsedSubjects();
  env.addFiles([
    { name: "阮乔-宽松睡衣.jpeg", size: 508, lastModified: 58 },
    { name: "匿名服装-雨夜.jpeg", size: 510, lastModified: 60 },
  ]);
  assert.deepEqual(env.groupsInFirstSelect()[1].options, ["阮乔-宽松睡衣.jpeg"],
    "匹配项应证明角色前缀推断链路已启用");
  assert.equal(env.inferredBindingForRow(1)?.textContent, "自动绑定：匿名服装-雨夜");
});

// --- D-e：绑定名可以缩短，但下拉及 @ 计划仍保留完整显示名 ---
addedCase("D-e dropdown and mention plan keep the full display name", () => {
  const env = buildEnvironment(`视频编号58
【场景与连续状态】
卧室，夜晚。
【出场人物】
阮乔：全程可见。`);
  primeParsedSubjects();
  const extra = { name: "阮乔-宽松睡衣.jpeg", size: 509, lastModified: 59 };
  env.addFiles([extra]);
  const groups = env.groupsInFirstSelect();
  assert.deepEqual(groups[1].options, ["阮乔-宽松睡衣.jpeg"]);
  const parsed = context.self.JimengLockAnalyzer.parseCalibrationHeaders(byId("calibration-prompt").value);
  const plan = debug.resolveCalibrationSubjectPlan(parsed.subjectPlans[0]);
  const imagePlan = debug.calibrationSubjectImagePlan(plan, extra);
  assert.equal(imagePlan.name, "阮乔-宽松睡衣");
});

// --- C-a：批量应用额外图时，同角色所有视频写入同一显式 override ---
addedCase("C-a applies one extra image to every video for the role", () => {
  const setup = buildMultiVideoRoleEnvironment();
  const outcome = debug.applyCalibrationSubjectSelectionToAll(setup.plans, setup.qiaoPlans[0], setup.qiaoValue);
  assert.equal(outcome.appliedCount, 2);
  assert.equal(outcome.fallbackCount, 0);
  for (const plan of setup.qiaoPlans) {
    assert.equal(debug.calibrationSubjectManualOverrides.get(`${plan.videoNumber}\0阮乔`), setup.qiaoValue);
  }
});

// --- C-b：批量应用主体库时，同角色所有 key 都删除，不写 __base__ ---
addedCase("C-b applies the implicit base default by deleting role overrides", () => {
  const setup = buildMultiVideoRoleEnvironment();
  debug.applyCalibrationSubjectSelectionToAll(setup.plans, setup.qiaoPlans[0], setup.qiaoValue);
  const outcome = debug.applyCalibrationSubjectSelectionToAll(setup.plans, setup.qiaoPlans[0], "__base__");
  assert.equal(outcome.appliedCount, 2);
  assert.equal(outcome.fallbackCount, 0);
  for (const plan of setup.qiaoPlans) {
    assert.equal(debug.calibrationSubjectManualOverrides.has(`${plan.videoNumber}\0阮乔`), false);
    assert.equal(debug.calibrationSubjectPlanSelectionValue(plan), "__base__");
  }
});

// --- C-c：按角色批量写入不得改变其他角色的 override ---
addedCase("C-c isolates bulk selection changes to the normalized role", () => {
  const setup = buildMultiVideoRoleEnvironment();
  debug.setCalibrationSubjectPlanSelection(setup.huoPlan, setup.huoValue);
  debug.applyCalibrationSubjectSelectionToAll(setup.plans, setup.qiaoPlans[0], setup.qiaoValue);
  assert.equal(debug.calibrationSubjectPlanSelectionValue(setup.huoPlan), setup.huoValue);
});

// --- C-d：额外图无效时复用 setter 的主体库回落并准确计数 ---
addedCase("C-d counts unavailable extra-image fallbacks", () => {
  const setup = buildMultiVideoRoleEnvironment();
  const outcome = debug.applyCalibrationSubjectSelectionToAll(
    setup.plans,
    setup.qiaoPlans[0],
    "__extra__:missing.jpeg:999:999",
  );
  assert.equal(outcome.appliedCount, 2);
  assert.equal(outcome.fallbackCount, 2);
  for (const plan of setup.qiaoPlans) {
    assert.equal(debug.calibrationSubjectPlanSelectionValue(plan), "__base__");
  }
});

// --- C-e：重绘只读取现有 Map，批量结果不得丢失 ---
addedCase("C-e preserves bulk selections after recalibration", () => {
  const setup = buildMultiVideoRoleEnvironment();
  debug.applyCalibrationSubjectSelectionToAll(setup.plans, setup.qiaoPlans[0], setup.qiaoValue);
  byId("calibrate").dispatch("click");
  for (const plan of setup.qiaoPlans) {
    assert.equal(debug.calibrationSubjectPlanSelectionValue(plan), setup.qiaoValue);
  }
});

// --- C-f：卡片按钮读取当前下拉值，并在既有状态区反馈批量结果 ---
addedCase("C-f bulk action button reports its result in the existing status area", () => {
  const setup = buildMultiVideoRoleEnvironment();
  const selects = setup.env.auditElements("select");
  const buttons = setup.env.auditElements("button", "应用到该角色全部视频");
  assert.equal(buttons.length, 3, "每张人物卡片都应有批量应用按钮");
  selects[0].value = setup.qiaoValue;
  buttons[0].dispatch("click");
  assert.equal(byId("calibration-status").textContent, "已应用 2 处，其中 0 处因额外图不可用回落到主体库");
});

if (addedCaseFailures.length) {
  throw new AggregateError(addedCaseFailures, `${addedCaseFailures.length} added regression case(s) failed`);
}

console.log("[OK] extra-image source selection covers automatic binding, manual priority, and stable overrides");
