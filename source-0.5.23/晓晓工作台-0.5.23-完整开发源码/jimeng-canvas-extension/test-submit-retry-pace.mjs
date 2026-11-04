// 送达重试的节奏：第 1 次就是正常发送；没成功就等 3 秒确认窗口，再点第 2 次。
// 不允许连打——原来一轮 3 次点击、间隔仅 300 毫秒，万一其实已经发出去、只是
// 输入框清空得慢没读准，多出来的每一次点击都是一次真实扣费。
// 次数也必须有上限：原来外层是 while(true)，页面一直不确认就会无限点下去。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

const cap = source.match(/const SUBMIT_MAX_ATTEMPTS = (\d+);/);
const ack = source.match(/const SUBMIT_ACK_WAIT_MS = (\d+);/);
assert.ok(cap, "必须存在明确的点击次数上限");
assert.ok(Number(cap[1]) >= 2 && Number(cap[1]) <= 4, `点击上限应当很小，实际 ${cap[1]}`);
assert.ok(ack && Number(ack[1]) >= 2000, `每次点击后的确认窗口不应短于 2 秒，实际 ${ack && ack[1]}`);

const submit = source.slice(
  source.indexOf("async function submitUntilAccepted("),
  source.indexOf("async function batchPauseRequested("),
);
assert.equal(/while \(true\)/.test(submit), false, "送达重试不能无限循环");
assert.equal(/burstClick/.test(submit), false, "不能再有连打三次的写法");
assert.equal(/sleep\(300\)/.test(submit), false, "不能用 300 毫秒的短间隔紧接着再点");
assert.match(submit, /waitForSubmitAck\(\{ editor \}, SUBMIT_ACK_WAIT_MS\)/, "每次点击后都必须先等确认窗口");
assert.match(submit, /提交状态未知/, "到上限必须说明提交状态未知");

// 页面永远不确认：点击次数必须正好收敛到上限，且每次之间都等满确认窗口。
let clicks = 0;
const waits = [];
const editor = { isConnected: true, innerText: "最终提示词" };
const context = {
  queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder,
  self: {},
  chrome: { runtime: {
    onMessage: { addListener() {} },
    sendMessage: async (message) => {
      if (message.type === "TRUSTED_CLICK") { clicks += 1; return { ok: true, clicked: true }; }
      if (message.type === "GET_BATCH_STATE") return { active: true, paused: false };
      return { ok: true };
    },
  } },
};
vm.runInNewContext(source, context);
context.sleep = async () => {};
context.status = () => {};
context.promptMatches = () => true;
context.waitForFinalSendButton = async () => ({
  getBoundingClientRect: () => ({ left: 10, top: 10, width: 20, height: 20 }),
});
context.submitAccepted = () => false;
context.waitForSubmitAck = async (_before, timeoutMs) => { waits.push(timeoutMs); return false; };

let thrown = null;
try {
  await context.submitUntilAccepted(editor, "最终提示词", "job-1");
} catch (error) {
  thrown = error;
}
assert.ok(thrown, "页面始终不确认时必须抛错，而不是无限重试");
assert.equal(clicks, Number(cap[1]), `点击次数必须收敛到 ${cap[1]} 次，实际 ${clicks}`);
assert.deepEqual(waits, new Array(Number(cap[1])).fill(Number(ack[1])),
  "每一次点击后都必须等满确认窗口，而不是紧接着再点");
assert.equal(thrown.formalClickAttempted, true, "必须标记已经正式点击过，供上层按未知状态处理");
assert.match(thrown.message, /提交状态未知/);

// 第一次就被受理时，绝不能再点第二次。
clicks = 0;
context.waitForSubmitAck = async () => true;
await context.submitUntilAccepted(editor, "最终提示词", "job-2");
assert.equal(clicks, 1, `第一次就受理时只能点一次，实际点了 ${clicks} 次`);

// 第一次没出去、第二次受理：正好两次，不多点。
clicks = 0;
context.waitForSubmitAck = async () => clicks >= 2;
await context.submitUntilAccepted(editor, "最终提示词", "job-3");
assert.equal(clicks, 2, `第二次受理后必须立刻停手，实际点了 ${clicks} 次`);

// 连箭头都取不到时不算一次点击，不能白白消耗次数。
clicks = 0;
let looked = 0;
context.waitForSubmitAck = async () => true;
context.waitForFinalSendButton = async () => {
  looked += 1;
  if (looked < 3) throw new Error("箭头还没出现");
  return { getBoundingClientRect: () => ({ left: 10, top: 10, width: 20, height: 20 }) };
};
await context.submitUntilAccepted(editor, "最终提示词", "job-4");
assert.equal(clicks, 1, "等箭头出现的过程不应消耗点击次数");

console.log("[OK] submit clicks are spaced by a confirmation window, capped, and stop the moment the page accepts");
