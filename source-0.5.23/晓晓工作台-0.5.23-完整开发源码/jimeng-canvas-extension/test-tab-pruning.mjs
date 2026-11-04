import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
const removed = [];
const messages = [];
const live = new Set([1, 50, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
let storedIds = [];
const chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener() {} },
    async sendMessage(message) { messages.push(message); },
  },
  sidePanel: { async setPanelBehavior() {} },
  debugger: {},
  storage: {
    local: {
      async get() { return { jimengGeneratedTabIds: storedIds }; },
      async set(value) { storedIds = [...(value.jimengGeneratedTabIds || [])]; },
    },
  },
  tabs: {
    onUpdated: { addListener() {}, removeListener() {} },
    async get(tabId) {
      if (!live.has(tabId)) throw new Error("tab closed");
      return {
        id: tabId,
        url: tabId === 50
          ? "https://example.com/untouched"
          : "https://jimeng.jianying.com/ai-tool/canvas/123",
      };
    },
    async remove(tabId) {
      removed.push(tabId);
      live.delete(tabId);
    },
  },
};
const context = {
  chrome, setTimeout, clearTimeout, Promise, Error, String, Number, Math,
};
vm.runInNewContext(source, context);

for (const tabId of [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]) {
  await context.trackAndPruneGeneratedTab(tabId, 1);
}
assert.deepEqual(removed, [], "ten automation tabs must be retained");

await context.trackAndPruneGeneratedTab(111, 1);
assert.deepEqual(removed, [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
assert.deepEqual(storedIds, [111], "only the newest generated tab remains tracked across batches");
assert.equal(live.has(1), true, "the source canvas must remain open");
assert.equal(live.has(50), true, "an unrelated user tab must remain open");
assert.ok(messages.some((message) =>
  message.type === "BATCH_LOG" && message.detail.includes("只保留最新生成标签")));

console.log("[OK] the eleventh generated tab closes the previous ten without touching source or user tabs");
