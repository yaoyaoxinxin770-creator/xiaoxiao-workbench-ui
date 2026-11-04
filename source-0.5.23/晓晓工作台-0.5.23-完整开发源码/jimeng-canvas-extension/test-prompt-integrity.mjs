import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");
const validationSource = source.slice(
  source.indexOf("function promptValidationText"),
  source.indexOf("function requiredMentionCounts"),
);
const waitSource = source.slice(
  source.indexOf("async function waitForPromptIntegrity"),
  source.indexOf("function rollbackTrailingMentionText"),
);
const statuses = [];
let missingChecks = 0;
let missingUntil = 0;
const context = {
  normalize: (value) => String(value || "").replace(/\s+/g, "").trim(),
  editorPromptText: (editor) => editor.text,
  missingRequiredMentions: () => (++missingChecks <= missingUntil ? ["宋柏峰音频"] : []),
  batchPauseRequested: async () => false,
  status: (...args) => statuses.push(args),
  sleep: async () => {},
  submitError: (message, clicked) => Object.assign(new Error(message), {
    formalClickAttempted: Boolean(clicked),
  }),
  Math,
  String,
  Error,
};
vm.createContext(context);
vm.runInContext(`
  const PROMPT_INTEGRITY_MAX_ATTEMPTS = 2;
  const PROMPT_INTEGRITY_RETRY_MS = 1000;
  ${validationSource}
  ${waitSource}
  globalThis.api = { promptValidationText, waitForPromptIntegrity };
`, context);

assert.equal(
  context.api.promptValidationText("正\u200B文\uFFFC@"),
  "正文",
  "ProseMirror caret guards and inline-object placeholders are not prompt text",
);
await context.api.waitForPromptIntegrity(
  { text: "完\u200B整\u2060正\uFFFC文@" },
  "完整正文",
  [],
  "safe",
);

missingChecks = 0;
missingUntil = 3;
await context.api.waitForPromptIntegrity(
  { text: "完整正文" },
  "完整正文",
  [{ kind: "audio", name: "宋柏峰" }],
  "slow-audio",
);
assert.equal(missingChecks, 4, "missing audio references keep retrying beyond the text-mismatch limit");
assert.ok(statuses.some((entry) => String(entry[2]).includes("缺少：宋柏峰音频")));
statuses.length = 0;
missingChecks = 0;
missingUntil = 0;

let failure;
try {
  await context.api.waitForPromptIntegrity({ text: "被改写正文" }, "完整正文", [], "bad");
} catch (error) {
  failure = error;
}
assert.ok(failure);
assert.equal(failure.formalClickAttempted, false);
assert.match(failure.message, /发送前正文连续 2 次校验不一致/);
assert.match(failure.message, /编辑器 5 字 \/ 原文 4 字/);
assert.match(failure.message, /未点击发送，已安全释放本组/);
assert.equal(statuses.length, 1, "corrupted text still has a bounded retry and never loops forever");

console.log("[OK] prompt integrity waits indefinitely for loading references but bounds corrupted text retries");
