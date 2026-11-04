import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
let listener;
let nextTabId = 200;
const sent = [];
const statuses = [];
const realSetTimeout = setTimeout;
function controlledSetTimeout(callback, ms) {
  if (ms === 20_000 || ms === 10_000) {
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
    async duplicate() { return { id: ++nextTabId, status: "complete" }; },
    async sendMessage(tabId, payload) {
      if (payload.type === "PING_EXECUTOR") return { ok: true, ready: true, version: "0.20.3" };
      sent.push(payload.job.id);
      if (payload.job.id === "b") {
        return { ok: false, clicked: false, error: "@素材失败" };
      }
      return { ok: true, clicked: true, confirmed: true };
    },
    async reload() {},
  },
};

vm.runInNewContext(source, {
  chrome, setTimeout: controlledSetTimeout, clearTimeout, queueMicrotask,
  Promise, Error, String, Number, Math,
});

const result = await new Promise((resolve) => {
  const keep = listener({
    type: "START_BATCH",
    batchId: "stop-test",
    sourceTabId: 1,
    intervalMs: 30_000,
    jobs: [{ id: "a" }, { id: "b" }, { id: "c" }],
  }, {}, resolve);
  assert.equal(keep, true);
});

assert.equal(result.ok, true);
assert.equal(result.stoppedOnFailure, true);
assert.equal(result.error, "@素材失败");
assert.equal(result.failedJobId, "b");
assert.equal(result.paused, true);
assert.equal(result.accepted, 1);
assert.deepEqual(sent, ["a", "b"]);
assert.ok(statuses.some((item) => item.jobId === "b" && item.state === "failed_before_click"));
assert.ok(statuses.some((item) => item.jobId === "c" && item.state === "paused"));

console.log("[OK] first pre-send failure stops the batch and preserves later jobs");
