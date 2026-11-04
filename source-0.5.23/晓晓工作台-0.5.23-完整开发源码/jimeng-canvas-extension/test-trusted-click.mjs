import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "service-worker.js"), "utf8");
let listener;
let failRelease = false;
const calls = [];
const chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(callback) { listener = callback; } },
    sendMessage: async () => {},
  },
  sidePanel: { setPanelBehavior: async () => {} },
  tabs: { update: async (...args) => calls.push(["tabs.update", ...args]) },
  windows: { update: async (...args) => calls.push(["windows.update", ...args]) },
  debugger: {
    async attach(target, version) { calls.push(["attach", target, version]); },
    async sendCommand(target, method, params) {
      calls.push([method, target, params]);
      if (failRelease && params.type === "mouseReleased") throw new Error("release failed");
    },
    async detach(target) { calls.push(["detach", target]); },
  },
};

vm.runInNewContext(source, { chrome, setTimeout, clearTimeout, Promise, Error, String, Number });
assert.equal(typeof listener, "function");

async function sendTrustedClick() {
  return await new Promise((resolve) => {
    const keepChannel = listener(
      { type: "TRUSTED_CLICK", point: { x: 12.5, y: 34.5 } },
      { tab: { id: 123, windowId: 456 } },
      resolve,
    );
    assert.equal(keepChannel, true);
  });
}

async function sendUploadClick() {
  return await new Promise((resolve) => {
    const keepChannel = listener(
      { type: "TRUSTED_CLICK", intent: "open_attachment_upload", point: { x: 12.5, y: 34.5 } },
      { tab: { id: 123, windowId: 456 } },
      resolve,
    );
    assert.equal(keepChannel, true);
  });
}

const success = await sendTrustedClick();
assert.equal(success.ok, true);
assert.equal(success.clicked, true);
assert.equal(success.uncertain, false);
assert.deepEqual(
  calls.filter(([name]) => name === "Input.dispatchMouseEvent").map(([, , params]) => params.type),
  ["mouseMoved", "mousePressed", "mouseReleased"],
);
assert.equal(calls.at(-1)[0], "detach");

calls.length = 0;
const upload = await sendUploadClick();
assert.equal(upload.ok, true);
assert.equal(calls[0][0], "windows.update");
assert.equal(calls[1][0], "tabs.update");
assert.deepEqual(
  calls.filter(([name]) => name === "Input.dispatchMouseEvent").map(([, , params]) => params.type),
  ["mouseMoved", "mousePressed", "mouseReleased"],
);

calls.length = 0;
failRelease = true;
const uncertain = await sendTrustedClick();
assert.equal(uncertain.ok, true);
assert.equal(uncertain.clicked, true);
assert.equal(uncertain.uncertain, true);
assert.equal(calls.at(-1)[0], "detach");

calls.length = 0;
failRelease = false;
const typed = await new Promise((resolve) => {
  const keepChannel = listener(
    { type: "TRUSTED_INSERT_TEXT", text: " @古代城镇街道" },
    { tab: { id: 123 } },
    resolve,
  );
  assert.equal(keepChannel, true);
});
assert.equal(typed.ok, true);
assert.equal(typed.inserted, true);
const textCall = calls.find(([name]) => name === "Input.insertText");
assert.equal(textCall[2].text, " @古代城镇街道");
assert.equal(calls.at(-1)[0], "detach");

calls.length = 0;
const shortcut = await new Promise((resolve) => {
  const keepChannel = listener(
    { type: "TRUSTED_SHIFT_AT" },
    { tab: { id: 123 } },
    resolve,
  );
  assert.equal(keepChannel, true);
});
assert.equal(shortcut.ok, true);
assert.equal(shortcut.dispatched, true);
assert.equal(shortcut.shortcut, "Shift+2");
assert.deepEqual(
  calls.filter(([name]) => name === "Input.dispatchKeyEvent").map(([, , params]) => [params.type, params.key, params.code, params.modifiers]),
  [
    ["rawKeyDown", "Shift", "ShiftLeft", 8],
    ["rawKeyDown", "@", "Digit2", 8],
    ["char", "@", "Digit2", 8],
    ["keyUp", "@", "Digit2", 8],
    ["keyUp", "Shift", "ShiftLeft", 0],
  ],
);
assert.equal(calls.at(-1)[0], "detach");

console.log("[OK] trusted click and trusted mention text dispatch");

// 点击前复核：@ 菜单浮在对话图片和附件缩略图条上方，内容脚本算好坐标之后还要
// 跨消息、等 attach，这段窗口里菜单一关，同一坐标下面就变成了别的元素（实测是
// 对话里的 agentic-image-item），点下去弹出放大图并卡死整组。带上期望目标时，
// 必须在已连接的会话里复核，对不上就一次鼠标事件都不许派发。
failRelease = false;
let evaluateResult = JSON.stringify({ hit: true, match: true });
chrome.debugger.sendCommand = async (target, method, params) => {
  calls.push([method, target, params]);
  if (method === "Runtime.evaluate") return { result: { value: evaluateResult } };
  return undefined;
};

async function sendExpectingClick(expect) {
  return await new Promise((resolve) => {
    listener(
      { type: "TRUSTED_CLICK", intent: "select_mention", point: { x: 12.5, y: 34.5 }, expect },
      { tab: { id: 123, windowId: 456 } },
      resolve,
    );
  });
}

calls.length = 0;
const matched = await sendExpectingClick({ text: "阮乔" });
assert.equal(matched.ok, true);
assert.equal(matched.clicked, true);
assert.equal(matched.stale, undefined, "目标没变时不能报复核失败");
const verifyCall = calls.find(([name]) => name === "Runtime.evaluate");
assert.ok(verifyCall, "带期望目标时必须先复核");
assert.match(verifyCall[2].expression, /elementFromPoint\(12\.5, 34\.5\)/, "必须复核实际要点击的坐标");
assert.match(verifyCall[2].expression, /阮乔/);
assert.ok(
  calls.findIndex(([name]) => name === "Runtime.evaluate") <
    calls.findIndex(([, , params]) => params?.type === "mousePressed"),
  "复核必须发生在按下之前",
);

calls.length = 0;
evaluateResult = JSON.stringify({ hit: true, match: false, actual: "排队加速中", className: "agentic-image-item-IWOGp7" });
const stale = await sendExpectingClick({ text: "阮乔" });
assert.equal(stale.ok, true);
assert.equal(stale.clicked, false, "目标已变时绝不能点下去");
assert.equal(stale.stale, true, "必须标记为可安全重试");
assert.match(stale.error, /排队加速中/, "必须说明实际落到了什么元素上");
assert.equal(
  calls.filter(([, , params]) => params?.type === "mousePressed").length,
  0,
  "复核失败时一次鼠标按下都不能派发",
);
assert.equal(calls.at(-1)[0], "detach", "放弃点击后仍必须断开调试器");

calls.length = 0;
evaluateResult = JSON.stringify({ hit: false });
const vanished = await sendExpectingClick({ text: "阮乔" });
assert.equal(vanished.stale, true);
assert.equal(calls.filter(([, , params]) => params?.type === "mousePressed").length, 0);

// 发送按钮等没有期望目标的点击保持原样，不引入额外的复核往返。
calls.length = 0;
const plain = await sendExpectingClick(undefined);
assert.equal(plain.clicked, true);
assert.equal(calls.some(([name]) => name === "Runtime.evaluate"), false, "没带期望目标时不应多一次复核");

console.log("[OK] trusted mention click re-verifies the target inside the attached session and never misclicks");
