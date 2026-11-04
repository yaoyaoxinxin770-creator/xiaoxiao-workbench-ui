import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
let listener;
let nextTabId = 200;
const order = [];
const statuses = [];
const realSetTimeout = setTimeout;

function controlledSetTimeout(callback, ms) {
  if (ms === 20_000) {
    order.push("interval-started");
    // 保持计时器未完成；PAUSE_BATCH 应通过 pausePromise 立即中断等待。
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

function send(message) {
  return new Promise((resolve) => listener(message, {}, resolve));
}

const runPromise = send({
  type: "START_BATCH",
  batchId: "pause-test",
  sourceTabId: 1,
  intervalMs: 60_000,
  jobs: [{ id: "a" }, { id: "b" }, { id: "c" }],
});

for (let attempt = 0; attempt < 20 && !order.includes("interval-started"); attempt += 1) {
  await new Promise((resolve) => queueMicrotask(resolve));
}
assert.deepEqual(order, ["duplicate:201", "send:a@201", "interval-started"]);

const paused = await send({ type: "PAUSE_BATCH", batchId: "pause-test" });
assert.equal(paused.ok, true);
const result = await runPromise;
assert.equal(result.ok, true);
assert.equal(result.paused, true);
assert.equal(result.accepted, 1);
assert.deepEqual(order, ["duplicate:201", "send:a@201", "interval-started"]);
assert.deepEqual(
  statuses.filter((item) => item.state === "paused").map((item) => item.jobId),
  ["b", "c"],
);

console.log("[OK] pause stops unopened jobs and leaves the current send untouched");
