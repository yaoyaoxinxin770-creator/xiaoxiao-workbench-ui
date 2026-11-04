import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
let listener;
let snapshotReads = 0;
let waited = 0;
let nextTabId = 80;
const order = [];

const chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(callback) { listener = callback; } },
    async sendMessage() {},
    async getPlatformInfo() { return { os: "win" }; },
  },
  sidePanel: { async setPanelBehavior() {} },
  debugger: {},
  storage: {
    local: {
      async get() { return {}; },
      async set() {},
    },
  },
  tabs: {
    onUpdated: { addListener() {}, removeListener() {} },
    async get(tabId) {
      return { id: tabId, status: "complete", url: "https://jimeng.jianying.com/ai-tool/canvas/123" };
    },
    async duplicate() {
      const id = ++nextTabId;
      order.push(`duplicate:${id}`);
      return { id, status: "complete" };
    },
    async reload() {},
    async remove() {},
    async sendMessage(tabId, payload) {
       if (payload.type === "PING_EXECUTOR") return { ok: true, ready: true, version: "0.20.3" };
      if (payload.type === "GET_VIDEO_QUEUE_SNAPSHOT_V15") {
        snapshotReads += 1;
        if (snapshotReads === 1) return { ok: true, cardIds: ["old"], activeCardIds: ["old"] };
        if (snapshotReads === 2) return { ok: true, cardIds: ["old", "new-1"], activeCardIds: ["old", "new-1"] };
        return {
          ok: true,
          cardIds: ["old", "new-1", "new-2"],
          activeCardIds: ["old", "new-1"],
          failedCardIds: ["new-2"],
        };
      }
      assert.equal(payload.type, "DISPATCH_JOB_V15");
      order.push(`send:${payload.job.id}@${tabId}`);
      return { ok: true, clicked: true, confirmed: true };
    },
  },
};

function controlledSetTimeout(callback, ms) {
  if (ms === 20_000) {
    waited += ms;
    if (waited === 120_000) order.push("wait:120000");
    queueMicrotask(callback);
    return 0;
  }
  if (ms === 15_000 || ms === 500) {
    queueMicrotask(callback);
    return 0;
  }
  return setTimeout(callback, ms);
}

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
  Set,
});

const result = await new Promise((resolveResult) => {
  listener({
    type: "START_BATCH",
    batchId: "queue-gate-test",
    sourceTabId: 1,
    intervalMs: 60_000,
    reuseSourceTabFirst: true,
    jobs: [
      { id: "batch-1", label: "第一批", expectedVideoCount: 2, waitForQueueCards: true },
      { id: "batch-2" },
    ],
  }, {}, resolveResult);
});

assert.equal(result.ok, true);
assert.equal(result.accepted, 2);
assert.equal(snapshotReads, 3, "one baseline plus two post-wait observations are required");
assert.deepEqual(order, [
  "send:batch-1@1",
  "wait:120000",
  "duplicate:81",
  "send:batch-2@81",
]);

console.log("[OK] next calibration chunk waits N minutes and N new queued cards, even if one later fails");
