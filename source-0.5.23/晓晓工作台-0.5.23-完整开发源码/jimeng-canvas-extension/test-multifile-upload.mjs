import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

class MockFile {
  constructor(parts, name, options) {
    this.parts = parts;
    this.name = name;
    this.type = options.type;
    this.lastModified = options.lastModified;
  }
}

class MockDataTransfer {
  constructor() {
    this.files = [];
    this.items = { add: (file) => this.files.push(file) };
  }
}

class MockEvent {
  constructor(type, options) {
    this.type = type;
    this.bubbles = options.bubbles;
  }
}

const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder,
  chrome: { runtime: {
    onMessage: { addListener() {} },
    async sendMessage() { return { ok: true }; },
  } },
  self: {},
  DataTransfer: MockDataTransfer,
  File: MockFile,
  Event: MockEvent,
  Uint8Array,
  atob,
};
vm.runInNewContext(source, context);

const events = [];
const input = {
  value: "old",
  files: [],
  dispatchEvent(event) { events.push(event.type); },
};
const files = ["禅房.png", "无云寺.png", "青竹林.png"].map((name, index) => ({
  name,
  type: "image/png",
  lastModified: 100 + index,
  base64: Buffer.from(`file-${index}`).toString("base64"),
}));

context.dispatchFileBatch(input, files);

assert.equal(input.value, "");
assert.deepEqual(Array.from(input.files, (file) => file.name), ["禅房.png", "无云寺.png", "青竹林.png"]);
assert.deepEqual(events, ["input", "change"]);

context.getActiveFileInput = () => input;
context.composerRoot = () => ({});
context.readAttachmentTabCounts = () => null;
context.logAttachmentCountDiagnostic = () => {};
context.waitForAttachmentBatch = async (_editor, _baseline, _requested, _timeout, _jobId, state) => {
  const counts = { all: 3, images: 3, videos: 0, audios: 0, docs: 0 };
  context.transitionAttachmentState(state, "video03", "CONFIRMED", { parsedCounts: counts });
  return { state: "CONFIRMED", counts };
};
context.sleep = async () => {};
const result = await context.uploadFiles({}, files, "video03");
assert.deepEqual(Array.from(result.acceptedFiles, (file) => file.name), ["禅房.png", "无云寺.png", "青竹林.png"]);
assert.deepEqual(Array.from(result.missingFiles), []);
assert.deepEqual(events.slice(-2), ["input", "change"]);

const beforeFailureEvents = events.length;
context.waitForAttachmentBatch = async () => ({
  state: "INCOMPLETE_OBSERVED",
  counts: { all: 2, images: 2, videos: 0, audios: 0, docs: 0 },
});
await assert.rejects(
  context.uploadFiles({}, files, "video04"),
  /图片确认 2\/3，无法确定具体文件，未补投且未点击发送/,
);
assert.equal(events.length - beforeFailureEvents, 2, "incomplete images must be dispatched only once");

console.log("[OK] native FileList upload confirms full image categories and never infers a missing filename");
