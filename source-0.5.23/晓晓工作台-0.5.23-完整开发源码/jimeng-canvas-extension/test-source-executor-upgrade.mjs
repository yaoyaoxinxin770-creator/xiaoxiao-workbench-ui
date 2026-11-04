import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
let listener;
let reloaded = false;
let reloadCount = 0;

const chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(callback) { listener = callback; } },
    async sendMessage() {},
    async getPlatformInfo() { return { os: "win" }; },
  },
  sidePanel: { async setPanelBehavior() {} },
  debugger: {},
  scripting: { async executeScript() { throw new Error("source upgrade must use a safe reload, not reinjection"); } },
  tabs: {
    onUpdated: { addListener() {}, removeListener() {} },
    async get(tabId) {
      return { id: tabId, status: "complete", url: "https://jimeng.jianying.com/ai-tool/canvas/123" };
    },
    async reload() { reloaded = true; reloadCount += 1; },
    async sendMessage(_tabId, payload) {
      if (payload.type === "PING_EXECUTOR_V15") {
        return reloaded
          ? { ok: true, ready: true, version: "0.20.3" }
          : { ok: true, ready: true, version: "0.14.5" };
      }
      if (payload.type === "CHECK_SOURCE_CLEAN_V15") {
        return { ok: true, clean: true, hasText: false, attachments: 0 };
      }
      throw new Error(`unexpected message ${payload.type}`);
    },
  },
};

vm.runInNewContext(source, {
  chrome,
  setTimeout,
  clearTimeout,
  Promise,
  Error,
  String,
  Number,
  Math,
  Set,
});

const result = await new Promise((resolveResult) => {
  listener({ type: "ENSURE_SOURCE_EXECUTOR", tabId: 7 }, {}, resolveResult);
});

assert.equal(result.ok, true);
assert.equal(result.refreshed, true);
assert.equal(result.version, "0.20.3");
assert.equal(reloadCount, 1);

console.log("[OK] stale source executor upgrades through one verified-clean page reload");
