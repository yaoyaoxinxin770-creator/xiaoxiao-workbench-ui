import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

async function run(job) {
  const editor = { innerText: "" };
  const events = [];
  const context = {
    queueMicrotask,
    structuredClone,
    AbortController,
    TextEncoder,
    TextDecoder,
    self: {},
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async () => ({ ok: true }),
      },
    },
  };
  vm.runInNewContext(source, context);
  context.getComposer = () => editor;
  context.waitFor = async (getter) => getter();
  context.stopInheritedBusyState = async () => {};
  context.sleep = async () => {};
  context.status = () => {};
  context.replaceEditorText = (_editor, text) => {
    editor.innerText = text;
    events.push(["text", text]);
  };
  context.editorPromptText = () => editor.innerText;
  context.materializeJobFiles = async (files) => files;
  context.uploadFiles = async (_editor, files) => {
    events.push(["upload", ...files.map((item) => item.name)]);
    return { missingFiles: [] };
  };
  context.submitUntilAccepted = async () => events.push(["send"]);
  context.videoQueueSnapshot = () => ({ cardIds: [] });
  context.waitForReadableBackendCreditBalance = async () => 100;
  context.waitForCreditDeduction = async () => ({ consumed: 36, currentBalance: 64 });
  await context.executeJob({
    id: "prompt-protocol",
    prefix: "旧前置词：",
    lockedSubjects: [],
    lockedImages: [],
    lockedAudio: [],
    files: [],
    characters: [],
    ...job,
  });
  return { text: editor.innerText, events };
}

const final = await run({
  prompt: "最终提示词（工作台已含前置词）",
  source: "desktop-workbench",
  bridgeProtocolVersion: 1,
  promptIsFinal: true,
  files: [
    { name: "主卧.png", type: "image/png" },
    { name: "宋柏峰.mp3", type: "audio/mpeg", roleBindings: ["宋柏峰"] },
  ],
});
assert.equal(final.text, "最终提示词（工作台已含前置词）");
assert.equal(final.events.at(-1)?.[0], "send");
assert.deepEqual(final.events.slice(0, 3).map((event) => event[0]), ["upload", "upload", "text"],
  "desktop final jobs upload every image/audio before writing the final prompt");

const legacy = await run({
  prompt: "正文",
  source: "legacy-sidepanel",
  bridgeProtocolVersion: 0,
  promptIsFinal: true,
});
assert.equal(legacy.text, "旧前置词：正文", "旧插件任务仍走兼容前置词逻辑");
assert.equal(legacy.events.at(-1)?.[0], "send");

console.log("[OK] desktop final-prompt protocol bypasses prefix rewrite while legacy jobs remain compatible");
