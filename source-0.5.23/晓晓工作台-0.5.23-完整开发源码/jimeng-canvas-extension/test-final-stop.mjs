import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");
const messages = [];
let stopClicks = 0;
const chrome = {
  runtime: {
    onMessage: { addListener() {} },
    async sendMessage(message) {
      messages.push(message);
      if (message.type === "TRUSTED_CLICK") {
        if (message.intent === "stop_before_send") stopClicks += 1;
        return { ok: true, clicked: true };
      }
      return { ok: true };
    },
  },
};
const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder, chrome, self: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, context);

const fullText = "完整提示词";
const arrow = { isConnected: true };
const stopButton = {
  isConnected: true,
  getBoundingClientRect() { return { left: 100, top: 200, width: 36, height: 36 }; },
};
const editor = {
  querySelectorAll(selector) {
    if (selector === ".node-subject-mention-tag") return { length: 2 };
    if (selector === ".node-reference-mention-tag") return { length: 1 };
    return { length: 0 };
  },
};

context.editorPromptText = () => fullText;
context.attachmentCount = () => 1;
context.getNearestSendButton = () => stopClicks >= 3 ? arrow : null;
context.getNearestBusyButton = () => stopButton;
context.batchPauseRequested = async () => false;
context.sleep = async () => {};

const result = await context.stopBusyBeforeSend(editor, stopButton, fullText, "video02");
assert.equal(result, arrow, "the first recovered arrow must be returned for immediate sending");
const clicks = messages.filter((message) =>
  message.type === "TRUSTED_CLICK" && message.intent === "stop_before_send");
assert.equal(clicks.length, 3, "the stop circle must be clicked repeatedly until the arrow appears");
const click = clicks[0];
assert.ok(click);
assert.equal(click.intent, "stop_before_send");
assert.deepEqual(JSON.parse(JSON.stringify(click.point)), { x: 118, y: 218 });
assert.ok(messages.some((message) => message.state === "stopping_before_send"));
assert.ok(messages.some((message) => String(message.detail || "").includes("仍是圆圈")));

console.log("[OK] the stop circle is clicked repeatedly until the first send arrow appears");
