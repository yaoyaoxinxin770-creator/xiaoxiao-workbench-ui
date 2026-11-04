import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

class MockDataTransfer {
  constructor() {
    this.files = [];
    this.items = { add: (file) => this.files.push(file) };
  }
}

class MockDragEvent {
  constructor(type, options) {
    this.type = type;
    this.bubbles = options.bubbles;
    this.cancelable = options.cancelable;
    this.dataTransfer = options.dataTransfer;
  }
}

const context = {
  queueMicrotask,
  structuredClone,
  AbortController,
  TextEncoder,
  TextDecoder,
  self: {},
  DataTransfer: MockDataTransfer,
  DragEvent: MockDragEvent,
  Event,
  Uint8Array,
  atob,
  chrome: { runtime: { onMessage: { addListener() {} }, async sendMessage() { return { ok: true }; } } },
};
vm.runInNewContext(source, context);

const dropped = [];
const target = { dispatchEvent(event) { dropped.push(event); } };
const files = [
  { name: "宴会厅夜宴.png", type: "image/png", file: { name: "宴会厅夜宴.png", type: "image/png" } },
  { name: "何诞.png", type: "image/png", file: { name: "何诞.png", type: "image/png" } },
  { name: "何诞.wav", type: "audio/wav", file: { name: "何诞.wav", type: "audio/wav" } },
];

context.dispatchFileDrop(target, files);
assert.equal(dropped.length, 1, "Agent upload card must receive exactly one drop batch");
assert.equal(dropped[0].type, "drop");
assert.equal(dropped[0].bubbles, true);
assert.equal(dropped[0].cancelable, true);
assert.deepEqual(Array.from(dropped[0].dataTransfer.files, (file) => file.name), files.map((file) => file.name));
assert.equal(context.uploadBatchPlan(null, files).length, files.length,
  "drop fallback must plan one batch per file");
assert.deepEqual(context.uploadBatchPlan(null, files).map((batch) => batch[0].name),
  files.map((file) => file.name));
assert.equal(context.uploadBatchPlan({}, files)[0], files,
  "a native file input should retain one multi-file batch");

let anchors = [];
context.SELECTORS = { fileUpload: "[class*=reference-upload-]" };
context.composerRoot = () => ({ querySelectorAll: () => anchors });
context.isInteractable = (anchor) => anchor.visible;
context.isRectInsideViewport = () => true;
const near = {
  visible: true,
  getAttribute: () => null,
  getBoundingClientRect: () => ({ left: 40, top: 10, width: 40, height: 40 }),
};
const far = {
  visible: true,
  getAttribute: () => null,
  getBoundingClientRect: () => ({ left: 900, top: 700, width: 40, height: 40 }),
};
anchors = [far, near];
const editor = { getBoundingClientRect: () => ({ left: 100, top: 10, width: 500, height: 100 }) };
assert.equal(context.getActiveFileDropTarget(editor), near, "the drop target nearest the active editor must win");

console.log("[OK] Agent upload card receives one native FileList drop and selects the nearest composer");
