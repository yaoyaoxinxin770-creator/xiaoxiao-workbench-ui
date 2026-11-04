import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../desktop-app/browser-bridge.js", import.meta.url), "utf8");
const window = { desktopBridge: {} };
vm.runInNewContext(source, {window, setTimeout, Promise, Number, Math});
const { runSequentialBatch } = window.WorkbenchBatch;

const order = [];
let waitedMs = 0;
const result = await runSequentialBatch({
  items: [0, 1, 2],
  delayMs: 60_000,
  execute: async (index) => {
    order.push(`send:${index}`);
    return { ok: true };
  },
  onWaiting: (nextIndex, delayMs) => order.push(`wait:${nextIndex}:${delayMs}`),
  sleep: async (ms) => { waitedMs += ms; },
});

assert.deepEqual(order, [
  "send:0", "wait:1:60000",
  "send:1", "wait:2:60000",
  "send:2",
]);
assert.equal(waitedMs, 120_000);
assert.equal(result.ok, true);
assert.equal(result.completed, 3);

const stoppedAfterFailure = [];
const failed = await runSequentialBatch({
  items: [0, 1, 2],
  delayMs: 60_000,
  execute: async (index) => {
    stoppedAfterFailure.push(index);
    return { ok: index !== 1 };
  },
  sleep: async () => {},
});
assert.deepEqual(stoppedAfterFailure, [0, 1]);
assert.equal(failed.ok, false);
assert.equal(failed.stoppedOnFailure, true);
assert.equal(failed.completed, 1);

console.log("[OK] workbench all-groups runner sends every group at 60-second intervals and stops on delivery failure");
