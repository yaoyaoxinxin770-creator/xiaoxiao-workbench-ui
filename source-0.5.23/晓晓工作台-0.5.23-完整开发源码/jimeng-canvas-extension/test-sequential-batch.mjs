import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
let listener;
let nextTabId = 100;
const order = [];
const statuses = [];
const realSetTimeout = setTimeout;
let simulatedWait = 0;

function controlledSetTimeout(callback, ms) {
  if (ms === 20_000) {
    simulatedWait += ms;
    if (simulatedWait === 60_000) {
      order.push("wait:60000");
      simulatedWait = 0;
    }
    queueMicrotask(callback);
    return 0;
  }
  return realSetTimeout(callback, ms);
}

const chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(callback) { listener = callback; } },
    async sendMessage(message) { statuses.push(message); },
    async getPlatformInfo() { return { os: "win" }; },
  },
  sidePanel: { async setPanelBehavior() {} },
  debugger: {},
  tabs: {
    onUpdated: { addListener() {}, removeListener() {} },
    async get(tabId) {
      return {
        id: tabId,
        status: "complete",
        url: "https://jimeng.jianying.com/ai-tool/canvas/123",
      };
    },
    async duplicate() {
      const id = ++nextTabId;
      order.push(`duplicate:${id}`);
      return { id, status: "complete" };
    },
    async sendMessage(tabId, payload) {
      if (payload.type === "PING_EXECUTOR") return { ok: true, ready: true, version: "0.20.3" };
      order.push(`send:${payload.job.id}@${tabId}`);
      return { ok: true, clicked: true, confirmed: true };
    },
    async reload() {},
  },
};

vm.runInNewContext(source, {
  chrome,
  setTimeout: controlledSetTimeout,
  clearTimeout,
  queueMicrotask,
  Promise,
  Error,
  String,
  Number,
  Math,
});

const result = await new Promise((resolve) => {
  const keepChannel = listener({
    type: "START_BATCH",
    batchId: "sequential-test",
    sourceTabId: 1,
    intervalMs: 60_000,
    jobs: [{ id: "a" }, { id: "b" }, { id: "c" }],
  }, {}, resolve);
  assert.equal(keepChannel, true);
});

assert.equal(result.ok, true);
assert.equal(result.accepted, 3);
assert.deepEqual(order, [
  "duplicate:101", "send:a@101",
  "wait:60000", "duplicate:102", "send:b@102",
  "wait:60000", "duplicate:103", "send:c@103",
]);
assert.equal(statuses.filter((item) => item.state === "waiting_interval").length, 2);

order.length = 0;
const directResult = await new Promise((resolve) => {
  const keepChannel = listener({
    type: "START_BATCH",
    batchId: "current-tab-test",
    sourceTabId: 1,
    intervalMs: 30_000,
    reuseSourceTab: true,
    jobs: [{ id: "whole-draft" }],
  }, {}, resolve);
  assert.equal(keepChannel, true);
});
assert.equal(directResult.ok, true);
assert.equal(directResult.accepted, 1);
assert.deepEqual(order, ["send:whole-draft@1"]);

order.length = 0;
const splitFirstResult = await new Promise((resolve) => {
  const keepChannel = listener({
    type: "START_BATCH",
    batchId: "split-first-test",
    sourceTabId: 1,
    intervalMs: 60_000,
    reuseSourceTabFirst: true,
    jobs: [{ id: "chunk-1" }, { id: "chunk-2" }],
  }, {}, resolve);
  assert.equal(keepChannel, true);
});
assert.equal(splitFirstResult.ok, true);
assert.equal(splitFirstResult.accepted, 2);
assert.deepEqual(order, [
  "send:chunk-1@1",
  "wait:60000", "duplicate:104", "send:chunk-2@104",
]);

console.log("[OK] queue jobs use copied tabs while one whole draft reuses the current tab");
