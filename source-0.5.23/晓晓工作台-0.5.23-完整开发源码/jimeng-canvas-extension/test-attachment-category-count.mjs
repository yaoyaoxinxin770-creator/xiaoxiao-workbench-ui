import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const rootDir = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(rootDir, "content.js"), "utf8");
const messages = [];
class MockDataTransfer {
  constructor() {
    this.files = [];
    this.items = { add: (file) => this.files.push(file) };
  }
}
class MockEvent {
  constructor(type) { this.type = type; }
}
const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder,
  chrome: { runtime: {
    onMessage: { addListener() {} },
    async sendMessage(message) { messages.push(message); return { ok: true }; },
  } },
  self: {},
  window: { innerWidth: 1920, innerHeight: 1080 },
  getComputedStyle() {
    return { display: "block", visibility: "visible", pointerEvents: "auto", opacity: "1" };
  },
  DataTransfer: MockDataTransfer,
  Event: MockEvent,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(source, context);

function button(text) {
  return { isConnected: true, textContent: text };
}

function tablist(labels) {
  return {
    isConnected: true,
    parentElement: null,
    querySelectorAll(selector) {
      return selector === "button[role='tab']" ? labels.map(button) : [];
    },
    getBoundingClientRect() {
      return { x: 10, y: 10, left: 10, top: 10, right: 510, bottom: 50, width: 500, height: 40 };
    },
  };
}

function tabRoot(tablists) {
  return {
    querySelectorAll(selector) {
      return selector === "[role='tablist']" ? tablists : [];
    },
  };
}

const duplicated = [
  tablist(["全部 (3)", "图片 (2)", "视频", "音频 (1)", "文档"]),
  tablist(["全部 (3)", "图片 (2)", "视频", "音频 (1)", "文档"]),
];
const duplicatedRoot = tabRoot(duplicated);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.readAttachmentTabCounts(duplicatedRoot))),
  { all: 3, images: 2, videos: 0, audios: 1, docs: 0 },
  "duplicate virtualized tablists must not be added together",
);
const duplicateDiagnostic = context.attachmentCountDiagnostic({ closest: () => duplicatedRoot });
assert.equal(duplicateDiagnostic.attachmentTab.tablistCount, 2);
assert.equal(duplicateDiagnostic.attachmentTab.selectedIndex, 0);
console.log("[PASS] duplicate tablists use the first category counts without doubling");

const tolerantRoot = tabRoot([tablist([
  "  所有（ 7 ） ", " 图片（4）", "视频 (2)", " 音频 ", "文档", "其他 (99)",
])]);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.readAttachmentTabCounts(tolerantRoot))),
  { all: 7, images: 4, videos: 2, audios: 0, docs: 0 },
);
assert.equal(context.readAttachmentTabCounts(tabRoot([])), null, "no attachments may have no tablist");

let fakeNow = 0;
context.Date = { now: () => fakeNow };
context.sleep = async (ms) => { fakeNow += ms; };
const delayedCounts = tablist(["全部 (3)", "图片 (3)", "视频", "音频", "文档"]);
const delayedRoot = {
  querySelectorAll(selector) {
    return selector === "[role='tablist']" && fakeNow >= 9000 ? [delayedCounts] : [];
  },
};
const delayedEditor = { closest: () => delayedRoot, parentElement: delayedRoot };
const delayedState = context.createAttachmentUploadState();
const delayedOutcome = await context.waitForAttachmentBatch(
  delayedEditor,
  { all: 0, images: 0, videos: 0, audios: 0, docs: 0 },
  { all: 3, images: 3, videos: 0, audios: 0, docs: 0 },
  30000,
  "delayed-tabs",
  delayedState,
);
assert.equal(delayedOutcome.state, "CONFIRMED");
assert.ok(fakeNow >= 9000, "the old eight-second partial-settle rule must not finish observation");
console.log("[PASS] delayed tablist remains pending past eight seconds and then confirms");

fakeNow = 0;
const absentRoot = tabRoot([]);
const absentOutcome = await context.waitForAttachmentBatch(
  { closest: () => absentRoot, parentElement: absentRoot },
  { all: 0, images: 0, videos: 0, audios: 0, docs: 0 },
  { all: 1, images: 1, videos: 0, audios: 0, docs: 0 },
  1000,
  "absent-tabs",
  context.createAttachmentUploadState(),
);
assert.equal(absentOutcome.state, "UNOBSERVABLE_AFTER_UPLOAD");

fakeNow = 0;
const incompleteRoot = {
  querySelectorAll(selector) {
    if (selector !== "[role='tablist']") return [];
    return [tablist(fakeNow >= 1250
      ? ["全部 (3)", "图片 (3)", "视频", "音频", "文档"]
      : ["全部 (2)", "图片 (2)", "视频", "音频", "文档"])];
  },
};
const incompleteOutcome = await context.waitForAttachmentBatch(
  { closest: () => incompleteRoot, parentElement: incompleteRoot },
  { all: 0, images: 0, videos: 0, audios: 0, docs: 0 },
  { all: 3, images: 3, videos: 0, audios: 0, docs: 0 },
  1000,
  "incomplete-images",
  context.createAttachmentUploadState(),
);
assert.equal(incompleteOutcome.state, "CONFIRMED");
assert.ok(fakeNow >= 1250, "an observed partial upload must remain alive beyond the old timeout");

let audioUploaded = false;
const audioEvents = [];
const audioInput = {
  value: "",
  files: [],
  dispatchEvent(event) {
    audioEvents.push(event.type);
    if (event.type === "change") audioUploaded = true;
  },
};
const audioRoot = {
  querySelectorAll(selector) {
    if (selector !== "[role='tablist']" || !audioUploaded) return [];
    return [tablist(["全部 (4)", "图片 (3)", "视频", "音频 (1)", "文档"])];
  },
};
const audioEditor = { closest: () => audioRoot, parentElement: audioRoot };
context.getActiveFileInput = () => audioInput;
context.logFileInputDiagnostic = () => {};
context.logAttachmentCountDiagnostic = () => {};
fakeNow = 0;
const audioState = context.createAttachmentUploadState();
audioState.confirmedCounts = { all: 3, images: 3, videos: 0, audios: 0, docs: 0 };
audioState.confirmedFileCount = 3;
const audioMessageStart = messages.length;
const audioResult = await context.uploadFiles(
  audioEditor,
  [{ name: "阮乔.mp3", type: "audio/mpeg", file: { name: "阮乔.mp3" } }],
  "single-audio",
  audioState,
);
assert.equal(audioResult.counts.audios, 1);
assert.deepEqual(audioEvents, ["input", "change"], "one confirmed audio must be dispatched exactly once");
assert.ok(messages.slice(audioMessageStart).some((message) =>
  String(message.detail || "").includes('"to":"BASELINE_CACHED"')));
console.log("[PASS] cached image baseline lets one audio dispatch input/change exactly once");

console.log("[OK] ARIA attachment categories handle duplicate tabs, delayed tabs, missing tabs, and one-shot audio");
