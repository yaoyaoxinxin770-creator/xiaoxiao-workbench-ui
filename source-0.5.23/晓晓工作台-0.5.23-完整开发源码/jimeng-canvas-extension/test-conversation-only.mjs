// 任务必须在右侧 Agent 对话里执行。中央画布输入框跑同样的流程会失败，而以前
// getComposer("conversation") 在对话面板没打开时会悄悄回落到 candidates[0]
// ——也就是中央画布输入框，整组任务跑错地方且必定失败，界面上却看不出来。
//
// 另外发送前的积分基线读取原本是 while(true)：抽屉打开又读不出数字时会永远
// 重试，页面被抽屉挡住，整组停住不动。这一步在点击发送之前，放弃是安全的。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

const composer = source.slice(source.indexOf("function getComposer("));
const conversationBranch = composer.slice(0, composer.indexOf("} else {"));
assert.match(conversationBranch, /return dialogue\[0\]\?\.element \|\| null;/,
  "对话模式必须只返回对话面板内的输入框");
assert.equal(/if \(dialogue\[0\]\?\.element\) return dialogue\[0\]\.element;/.test(conversationBranch), false,
  "对话模式不能再穿透到通用回落分支");

const execute = source.slice(source.indexOf("async function executeJob("));
const preamble = execute.slice(0, execute.indexOf("await stopInheritedBusyState"));
assert.match(preamble, /await openConversationPanel\(\)/,
  "执行前必须先确保右侧对话面板已打开");
assert.ok(
  preamble.indexOf("openConversationPanel") < preamble.indexOf("waitFor(() => getComposer(mode)"),
  "必须先打开对话面板，再等待输入框",
);

const baseline = source.slice(
  source.indexOf("async function waitForReadableBackendCreditBalance("),
  source.indexOf("async function waitForCreditDeduction("),
);
assert.equal(/while \(true\)/.test(baseline), false, "发送前的余额读取不能无限重试");
assert.match(baseline, /CREDIT_BASELINE_MAX_ATTEMPTS/, "必须有明确的重试上限");
assert.match(baseline, /closeCreditDrawer\(\)/, "每次重试前必须收起积分抽屉");
assert.match(baseline, /没有产生扣费/, "放弃时必须说明尚未扣费");
assert.match(baseline, /submitError\(/, "放弃必须走统一的失败通道");
const limit = source.match(/const CREDIT_BASELINE_MAX_ATTEMPTS = (\d+);/);
assert.ok(limit && Number(limit[1]) >= 3 && Number(limit[1]) <= 12,
  `重试上限应当在 3–12 次之间，实际 ${limit && limit[1]}`);

// 中央画布分支保持原样：它本来就允许回落，只有对话模式收紧。
const canvasBranch = composer.slice(composer.indexOf("} else {"));
assert.match(canvasBranch, /return candidates\[0\]\?\.element \|\| null;/,
  "非对话模式保留原有回落，不改变既有行为");

console.log("[OK] jobs run only in the right-side Agent conversation; credit baseline gives up safely instead of hanging");
