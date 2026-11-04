import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");
const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder,
  chrome: { runtime: { onMessage: { addListener() {} } } },
  self: {},
};
vm.runInNewContext(source, context);

const normalArrowPath = "M12.002 3c.424 0 .806.177 1.079.46 V19.5";
const stopSquarePath = "M4.5 10.9c0-2.24 0-3.36.436-4.216 v2.2";
const buttonWithPath = (d) => ({
  querySelectorAll(selector) {
    assert.equal(selector, "svg path");
    return [{ getAttribute: (name) => name === "d" ? d : null }];
  },
});

assert.equal(context.isSendArrowButton(buttonWithPath(normalArrowPath)), true);
assert.equal(context.isSendArrowButton(buttonWithPath("M8 8h8v8H8z")), false);
assert.equal(context.isSendArrowButton(buttonWithPath("")), false);
assert.equal(context.isStopButton(buttonWithPath(stopSquarePath)), true);
assert.equal(context.isStopButton(buttonWithPath(normalArrowPath)), false);
assert.equal(context.isVideoQueueTitle("视频"), true);
assert.equal(context.isVideoQueueTitle("视..."), true);
assert.equal(context.isVideoQueueTitle("视…"), true);
assert.equal(context.isVideoQueueTitle("生成..."), false);
assert.equal(context.isVideoQueueTitle("未命名"), false);
assert.deepEqual(
  [...context.newVideoQueueCardIds(["old-a", "old-b"], { cardIds: ["old-a", "new-c", "old-b"] })],
  ["new-c"],
);
assert.ok(source.indexOf("stopInheritedBusyState(editor, job.id)") < source.indexOf("replaceEditorText(editor, fullText)"));
assert.ok(source.indexOf("await insertMention(editor, name, { kind: \"subject\" })") <
  source.indexOf("await submitUntilAccepted(editor, fullText, job.id)"));
assert.ok(source.indexOf("await waitForReadableBackendCreditBalance(job.id)") <
  source.indexOf("await submitUntilAccepted(editor, fullText, job.id)"));
assert.ok(source.indexOf("await submitUntilAccepted(editor, fullText, job.id)") <
  source.indexOf("await waitForCreditDeduction(creditBaseline, job.id, queueBaseline)"));

console.log("[OK] live stop-square control is distinct from the real send arrow");
