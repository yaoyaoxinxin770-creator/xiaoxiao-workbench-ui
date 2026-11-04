// 扣费确认不再反复开关积分抽屉：打开一次就留着，每隔几秒直接读页面上的数字，
// 确认扣费之后再统一关闭。关闭必须发生在返回之前——抽屉留着会挡住下一组的
// 发送箭头，那正是之前“必须人工点掉那个叉才发得出去”的原因。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

const watchInterval = source.match(/const CREDIT_WATCH_POLL_INTERVAL_MS = ([\d_]+);/);
assert.ok(watchInterval, "必须有独立的扣费观察间隔常量");
assert.equal(Number(watchInterval[1].replace(/_/g, "")), 10000, "观察间隔应当是 10 秒");
assert.match(source, /const CREDIT_CONFIRM_INITIAL_DELAY_MS = 60_000;/, "首次检查前仍然等 60 秒");

function build({ dropsAtPoll = 2 } = {}) {
  const opens = [];
  const closes = [];
  const sleeps = [];
  let open = false;
  let reads = 0;
  const context = {
    queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder,
    self: {},
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true }) } },
  };
  vm.runInNewContext(source, context);
  context.status = () => {};
  context.sleep = async (ms) => { sleeps.push(ms); };
  context.batchPauseRequested = async () => false;
  context.videoQueueSnapshot = () => ({ cardIds: [] });
  context.waitForOptional = async (getter) => getter();
  context.creditBalanceTrigger = () => ({ id: "trigger" });
  context.trustedClickElement = async (_element, intent) => {
    if (intent === "open_credit_balance") { opens.push(1); open = true; }
  };
  context.closeCreditDrawer = async () => { closes.push(1); open = false; return true; };
  context.backendCreditBalanceFromDocument = () => {
    if (!open) return null;
    reads += 1;
    return { balance: reads >= dropsAtPoll ? 13427 : 13472 };
  };
  return { context, opens, closes, sleeps };
}

const { context, opens, closes, sleeps } = build({ dropsAtPoll: 3 });
const result = await context.waitForCreditDeduction(13472, "job-1", []);

assert.equal(result.consumed, 45, "必须报告真实扣除的积分数");
assert.equal(result.currentBalance, 13427);
assert.equal(opens.length, 1, `抽屉只应打开一次，实际打开了 ${opens.length} 次`);
assert.equal(closes.length, 1, `抽屉必须在确认后关闭一次，实际关闭了 ${closes.length} 次`);
assert.equal(sleeps[0], 60_000, "首次检查前必须先等 60 秒");
assert.ok(sleeps.slice(1).every((ms) => ms === 10000), `后续每次观察间隔必须是 10 秒，实际 ${sleeps.slice(1)}`);

// 中途出错也必须把抽屉收起来，否则下一组的发送箭头会被挡住。
const failing = build({});
failing.context.batchPauseRequested = async () => true;
let thrown = null;
try { await failing.context.waitForCreditDeduction(13472, "job-2", []); } catch (error) { thrown = error; }
assert.ok(thrown, "被停止时必须抛出");
assert.equal(failing.closes.length, 1, "即使中途退出也必须收起抽屉");

console.log("[OK] credit watch opens the drawer once, polls every 10s, and always closes before returning");
