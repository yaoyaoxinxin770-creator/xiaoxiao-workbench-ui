import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
let listener;
let reloaded = false;
let pingCount = 0;
let dispatchCount = 0;
let reportedVersion = "0.20.3";
const statuses = [];

const chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(callback) { listener = callback; } },
    async sendMessage(message) { statuses.push(message); },
    async getPlatformInfo() { return { os: "win" }; },
  },
  sidePanel: { async setPanelBehavior() {} },
  debugger: {},
  scripting: { async executeScript() { reloaded = true; } },
  tabs: {
    onUpdated: { addListener() {}, removeListener() {} },
    async get(tabId) {
      return {
        id: tabId,
        status: "complete",
        url: "https://jimeng.jianying.com/ai-tool/canvas/123",
      };
    },
    async duplicate() { return { id: 301, status: "complete" }; },
    async reload(tabId) {
      assert.equal(tabId, 301);
      assert.equal(dispatchCount, 0, "reload must happen before the job is dispatched");
      reloaded = true;
    },
    async executeScript() { reloaded = true; },
    async sendMessage(tabId, payload) {
      assert.equal(tabId, 301);
      if (payload.type === "PING_EXECUTOR" || payload.type === "PING_EXECUTOR_V15") {
        pingCount += 1;
        // 已打开标签仍运行旧 content script：虽然 ready=true，也必须刷新。
         if (!reloaded) return { ok: true, ready: true, version: "0.8.9" };
         return { ok: true, ready: true, version: reportedVersion };
      }
      if (payload.type === "PING_CANVAS_EXECUTOR_V16") {
        return { ok: true, ready: true, canvasReady: true, version: reportedVersion };
      }
      assert.equal(payload.type, "DISPATCH_JOB_V15");
      assert.equal(payload.job.source, "desktop-workbench");
      assert.equal(payload.job.bridgeProtocolVersion, 1);
      assert.equal(payload.job.promptIsFinal, true);
      dispatchCount += 1;
      return { ok: true, clicked: true, confirmed: true };
    },
  },
};

function controlledSetTimeout(callback, ms) {
  if (ms === 500) {
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
});

const result = await new Promise((resolveResult) => {
  listener({
    type: "START_BATCH",
    batchId: "executor-handshake-test",
    sourceTabId: 1,
    source: "desktop-workbench",
    bridgeProtocolVersion: 1,
    promptIsFinal: true,
    intervalMs: 60_000,
    jobs: [{ id: "video03", prompt: "最终提示词" }],
  }, {}, resolveResult);
});

assert.equal(result.ok, true);
assert.equal(result.accepted, 1);
assert.equal(reloaded, true);
assert.equal(pingCount, 121);
assert.equal(dispatchCount, 1, "the actual job must be dispatched exactly once");
assert.ok(statuses.some((item) => item.state === "recovering_executor"));
assert.ok(statuses.some((item) => item.state === "executor_ready"));

const health = await new Promise((resolveHealth) => {
  listener({ type: "DESKTOP_CONNECTOR_PING" }, { tab: { id: 301 } }, resolveHealth);
});
assert.equal(health.ok, true);
assert.equal(health.ready, true);
assert.equal(health.executorReady, true);
assert.equal(health.canvasReady, true);
assert.equal(health.tabId, 301);

reportedVersion = "0.20.3";
const newerHealth = await new Promise((resolveHealth) => {
  listener({ type: "DESKTOP_CONNECTOR_PING" }, { tab: { id: 301 } }, resolveHealth);
});
assert.equal(newerHealth.ready, true, "a newer compatible content executor must not be rejected by an older worker");

reportedVersion = "0.18.9";
const olderHealth = await new Promise((resolveHealth) => {
  listener({ type: "DESKTOP_CONNECTOR_PING" }, { tab: { id: 301 } }, resolveHealth);
});
assert.equal(olderHealth.ready, false, "an older content executor must still be rejected");

console.log("[OK] stale executor version reloads safely before one job dispatch");
