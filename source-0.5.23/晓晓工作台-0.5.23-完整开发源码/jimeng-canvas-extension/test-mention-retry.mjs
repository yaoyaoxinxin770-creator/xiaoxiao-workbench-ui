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
      return { ok: true, active: true, paused: false };
    },
  },
};
const context = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder, chrome, self: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, context);

let attempts = 0;
let expansions = 0;
let rollbacks = 0;
context.mentionChipCount = () => 0;
context.editorPromptText = () => "提示词中的玄寂";
context.batchPauseRequested = async () => false;
context.ensureComposerExpandedForMention = async () => { expansions += 1; };
context.insertMentionAttempt = async () => {
  attempts += 1;
  if (attempts < 3) throw new Error("candidate missing");
};
context.rollbackTrailingMentionText = () => { rollbacks += 1; };
context.sleep = async () => {};

assert.equal(
  await context.insertMention({}, "玄寂", { kind: "subject", jobId: "video09" }),
  true,
);
assert.equal(attempts, 3, "a missing @ chip must be retried until it succeeds");
assert.equal(expansions, 3, "the composer must be checked/reactivated before every @ attempt");
assert.equal(rollbacks, 2, "failed @ search text must be cleaned before retrying");
assert.ok(messages.some((message) => message.state === "locking_retry"));

attempts = 0;
context.insertMentionAttempt = async () => { attempts += 1; throw new Error("candidate click rewrote editor"); };
context.rollbackTrailingMentionText = () => { throw new Error("composer text no longer has safe prefix"); };
const corrupted = await context.insertMention({}, "会场图", { kind: "image", jobId: "video-rebuild" })
  .then(() => null, error => error);
assert.equal(corrupted?.mentionComposerCorrupted, true,
  "an unsafe inline rollback must request a full prompt rebuild");
assert.equal(corrupted?.mentionName, "会场图");

let rebuildMentions = 0;
let fullRewrites = 0;
let clears = 0;
const realInsertMention = context.insertMention;
context.resolveLockPlacements = () => [{
  kind: "image", name: "会场图", anchor: "会场", occurrence: 1, end: 2,
}];
context.replaceEditorText = () => { fullRewrites += 1; };
context.insertTextAtEnd = () => {};
context.insertMention = async () => {
  rebuildMentions += 1;
  if (rebuildMentions === 1) {
    const error = new Error("editor truncated");
    error.mentionComposerCorrupted = true;
    throw error;
  }
  return true;
};
context.clearEditorContent = () => { clears += 1; };
context.batchPauseRequested = async () => false;
context.sleep = async () => {};
await context.writePromptWithInlineMentions({}, "会场后续正文", "会场后续正文", [{}], "video-rebuild");
assert.equal(rebuildMentions, 2, "the whole inline mention pass must restart after editor corruption");
assert.equal(fullRewrites, 2, "the second attempt must rewrite the prompt from its trusted source");
assert.equal(clears, 1, "the corrupted partial prompt must be cleared before rebuilding");
assert.ok(messages.some((message) => message.state === "rebuilding_mention_prompt"));
context.insertMention = realInsertMention;

attempts = 0;
expansions = 0;
rollbacks = 0;
context.rollbackTrailingMentionText = () => { rollbacks += 1; };
context.batchPauseRequested = async () => false;
context.insertMentionAttempt = async () => {
  attempts += 1;
  const error = new Error("exact subject missing");
  error.assetUnavailable = true;
  throw error;
};
assert.equal(
  await context.insertMention({}, "主体库没有的人", { kind: "subject", jobId: "video10" }),
  false,
  "a subject absent from the library must be skipped",
);
assert.equal(attempts, 1, "a subject with a loaded menu but no exact candidate is skipped safely");
assert.equal(rollbacks, 1, "a skipped subject search must clean its trailing search text");
assert.ok(messages.some((message) =>
  message.state === "locking_skipped" && message.detail.includes("主体库中未找到精确同名主体")));

attempts = 0;
rollbacks = 0;
context.batchPauseRequested = async () => false;
context.insertMentionAttempt = async () => { attempts += 1; if (attempts < 4) throw new Error("transient exact subject miss"); };
assert.equal(
  await context.insertMention({}, "必须精准锁定的人", { kind: "subject", jobId: "calibration-job", required: true }),
  true,
);
assert.equal(attempts, 4, "a required calibration subject retries past three failures until success");
assert.equal(rollbacks, 3, "only failed attempts roll back");

attempts = 0;
rollbacks = 0;
context.batchPauseRequested = async () => false;
context.insertMentionAttempt = async () => {
  attempts += 1;
  const error = new Error("calibration subject is absent");
  error.assetUnavailable = true;
  throw error;
};
assert.equal(
  await context.insertMention({}, "校准稿中不存在的主体", {
    kind: "subject", jobId: "calibration-job", required: true,
  }),
  false,
  "a required calibration subject that is absent from the library must be skipped",
);
assert.equal(attempts, 1, "library absence is not an @ delivery failure");
assert.equal(rollbacks, 1, "a skipped required subject still cleans search text");

assert.equal(
  context.isConfirmedMissingSubject({
    kind: "subject", menuLoaded: true, queryMatched: true,
    noResult: true, optionsChanged: false, loading: false,
  }),
  true,
  "an explicitly empty, finished subject search is skippable",
);
assert.equal(
  context.isConfirmedMissingSubject({
    kind: "subject", menuLoaded: false, queryMatched: true,
    noResult: false, optionsChanged: false, loading: false, stableCatalog: true,
  }),
  true,
  "a popup that closed after search still uses the cached complete catalog",
);
assert.equal(
  context.isConfirmedMissingSubject({
    kind: "subject", menuLoaded: false, queryMatched: false,
    noResult: false, optionsChanged: false, loading: false,
  }),
  false,
  "a missing menu is a transient @ failure, not proof of a missing subject",
);
assert.equal(
  context.isConfirmedMissingSubject({
    kind: "subject", menuLoaded: true, queryMatched: true,
    noResult: false, optionsChanged: true, loading: true,
  }),
  false,
  "a still-loading menu must continue retrying",
);

attempts = 0;
rollbacks = 0;
context.batchPauseRequested = async () => attempts >= 4;
context.insertMentionAttempt = async () => { attempts += 1; throw new Error("still unavailable"); };
await assert.rejects(
  context.insertMention({}, "必须精准锁定的人", {
    kind: "subject", jobId: "calibration-job", required: true,
  }),
  /已按用户要求停止 @必须精准锁定的人 的持续重试/,
);
assert.equal(attempts, 4, "a required calibration subject keeps retrying after three failures until paused");
assert.equal(rollbacks, 4, "required mention failures must still leave no search-text residue");


// 手动审阅后的图片、音频确实缺失时跳过；普通缺芯片仍重试。
for (const kind of ["image", "audio"]) {
  attempts = 0; rollbacks = 0;
  context.batchPauseRequested = async () => false;
  context.insertMentionAttempt = async () => { attempts += 1; const e = new Error("confirmed missing"); e.assetUnavailable = true; throw e; };
  assert.equal(await context.insertMention({}, "已批准缺项", {kind, allowMissing: true, jobId:"manual-review"}), false);
  assert.equal(attempts, 1); assert.equal(rollbacks, 1);
  attempts = 0;
  context.insertMentionAttempt = async () => { attempts += 1; if (attempts < 2) { const e = new Error("missing but unapproved"); e.assetUnavailable = true; throw e; } };
  assert.equal(await context.insertMention({}, "未批准缺项", {kind, required: true}), true);
  assert.equal(attempts, 2, "没有人工批准不能跳过图片或音频");
  attempts = 0;
  context.insertMentionAttempt = async () => { attempts += 1; if (attempts < 2) throw new Error("menu delayed"); };
  assert.equal(await context.insertMention({}, "仍要重试", {kind, allowMissing: true}), true);
  assert.equal(attempts, 2, "人工审阅不把暂时失焦当成缺项");
}

const compactEditor = {
  parentElement: null,
  getBoundingClientRect() { return { width: 500, height: 60 }; },
};
context.editorUserText = () => "长".repeat(500);
assert.equal(context.collapsedComposerShell(compactEditor), compactEditor);
assert.match(source, /主体候选通常带头像/);
assert.match(source, /class\*="avatar"/);

// 即梦未命中主体时的真实 DOM 形态：搜索词在 suggestion 前一个文本节点，
// suggestion 本身只显示“@”；完整主体目录已挂载，但没有“律师”。
const previousNode = { nodeType: 3, textContent: "、律师" };
const emptySuggestion = { previousSibling: previousNode };
context.document = {
  querySelectorAll(selector) {
    if (selector.includes("suggestion")) return [emptySuggestion];
    return [];
  },
  activeElement: null,
};
context.Node = { TEXT_NODE: 3 };
context.editorUserText = () => "、律师@";
assert.equal(
  context.mentionSearchQueryAppears("律师", {}, "、", "律师@"),
  true,
  "a suggestion node following the plain search text must count as a matched query",
);
assert.equal(
  context.isConfirmedMissingSubject({
    kind: "subject", menuLoaded: true, queryMatched: true,
    noResult: false, optionsChanged: false, loading: false, stableCatalog: true,
  }),
  true,
  "a stable full subject catalog without the exact name is skippable",
);

console.log("[OK] transient @ failures keep retrying; a confirmed missing library subject is skipped safely");
