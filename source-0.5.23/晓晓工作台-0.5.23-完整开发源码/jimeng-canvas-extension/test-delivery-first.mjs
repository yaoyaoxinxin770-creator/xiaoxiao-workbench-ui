import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");
const messages = [];
const chrome = {
  runtime: {
    onMessage: { addListener() {} },
    async sendMessage(message) {
      messages.push(message);
      if (message.type === "TRUSTED_CLICK") return { ok: true, clicked: true };
      return { ok: true, active: true, paused: false };
    },
  },
};
const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder, chrome, self: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, context);

const fullText = "必须成功送达的完整提示词";
const editor = {};
const arrow = {
  getBoundingClientRect() { return { left: 10, top: 20, width: 30, height: 30 }; },
};
const acknowledgementTimeouts = [];
context.editorPromptText = () => fullText;
context.batchPauseRequested = async () => false;
context.waitForFinalSendButton = async () => arrow;
context.submitAccepted = () => false;
context.waitForSubmitAck = async (_before, timeoutMs) => {
  acknowledgementTimeouts.push(timeoutMs);
  return acknowledgementTimeouts.length >= 2;
};
context.sleep = async () => {};

await context.submitUntilAccepted(editor, fullText, "video06");

const submitClicks = messages.filter((message) =>
  message.type === "TRUSTED_CLICK" && message.intent === "submit_until_accepted");
// 第一次点击没被确认，等满确认窗口后才点第二次；第二次确认后立刻停手。
assert.equal(submitClicks.length, 2, "an unconfirmed click must be retried once more, not fired in a burst");
assert.deepEqual(acknowledgementTimeouts, [3000, 3000], "every click must be followed by a three-second confirmation window");
assert.ok(messages.some((message) => message.state === "retrying_submit"));
assert.ok(messages.some((message) => message.state === "confirmed"));

console.log("[OK] delivery-first spaces each retry by a three-second confirmation window");
