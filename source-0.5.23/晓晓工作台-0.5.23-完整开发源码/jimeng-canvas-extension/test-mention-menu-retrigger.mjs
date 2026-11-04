import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");
const chrome = {
  runtime: {
    onMessage: { addListener() {} },
    async sendMessage() { return { ok: true }; },
  },
};
const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder, chrome, self: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, context);

const typed = [];
context.setCaretAtEnd = () => {};
context.insertTrustedShiftAtCurrentCaret = async () => {};
context.insertTrustedTextAtCurrentCaret = async (_editor, text) => { typed.push(text); };
context.waitForOptional = async (_getter, timeoutMs) => {
  assert.equal(timeoutMs, 3000, "the asset menu may only get three seconds to open");
  return null;
};

await assert.rejects(
  context.insertMentionAttempt({}, "禅房", "image", "图片", {}, 0),
  /未唤出资产库菜单，立即清理并重新 @/,
);
assert.deepEqual(typed, [" "], "a failed menu opening must abort before entering a long exact-name wait");

console.log("[OK] a missing @ asset menu aborts after three seconds so the outer loop can retrigger it");
