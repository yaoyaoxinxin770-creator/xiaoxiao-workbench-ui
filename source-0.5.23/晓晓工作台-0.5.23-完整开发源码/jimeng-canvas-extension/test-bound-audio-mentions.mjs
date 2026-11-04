import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

async function run(failAudio = false, subject = false) {
  const events = [], editor = { innerText: "" };
  const ctx = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder, self: {}, chrome: { runtime: { onMessage: { addListener() {} } } } };
  vm.runInNewContext(source, ctx);
  ctx.getComposer = () => editor;
  ctx.waitFor = async fn => fn();
  ctx.stopInheritedBusyState = async () => {};
  ctx.sleep = async () => {};
  ctx.status = () => {};
  ctx.replaceEditorText = (_ed, text) => { editor.innerText = text; events.push(["text", text]); };
  ctx.insertTextAtEnd = (_ed, text) => { editor.innerText += text; events.push(["text", text]); };
  ctx.editorPromptText = () => editor.innerText;
  ctx.materializeJobFiles = async files => files;
  ctx.uploadFiles = async (_ed, files) => { events.push(["upload", ...files.map(x => x.name)]); return { missingFiles: [] }; };
  ctx.insertMention = async (_ed, name, placement) => {
    events.push([placement.kind, name, placement.afterMention?.name]);
    if (failAudio && placement.kind === "audio") return false;
    return true;
  };
  ctx.submitUntilAccepted = async () => { events.push(["send"]); };
  ctx.videoQueueSnapshot = () => ({ cardIds: [] });
  ctx.waitForReadableBackendCreditBalance = async () => 100;
  ctx.waitForCreditDeduction = async () => ({ consumed: 36, currentBalance: 64 });
  const prompt = "场景：卧室。人物：阮乔：第一段。人物：阮乔：第二段。";
  const roleName = subject ? "阮乔" : "阮乔-宽松睡衣";
  const roleKind = subject ? "subject" : "image";
  const roles = [1, 2].map(occurrence => ({ kind: roleKind, name: roleName, sourceSubjectName: "阮乔", anchor: "阮乔", occurrence }));
  const job = { id: "audio-regression", prompt, characters: [], lockedSubjects: subject ? roles : [],
    lockedImages: [{ kind: "image", name: "卧室", anchor: "卧室" }, ...(subject ? [] : roles)],
    files: [{ name: "卧室.png", type: "image/png" }, { name: "阮乔.mp3", type: "audio/mpeg", roleBindings: ["阮乔"] }] };
  if (failAudio) await assert.rejects(ctx.executeJob(job), /音频.*未生成引用/);
  else await ctx.executeJob(job);
  assert.equal(events.filter(x => x[0] === "upload" && x.includes("阮乔.mp3")).length, 1, "audio file uploads only once");
  assert.equal(events.filter(x => x[0] === "audio").length, failAudio ? 1 : 2, "each role occurrence gets its audio");
  for (const [i, event] of events.entries()) {
    if (event[0] === "audio") {
      assert.equal(event[1], "阮乔");
      assert.equal(event[2], roleName, "audio is anchored after role chip, not role text");
      const preceding = events.slice(0, i).filter(x => ["image", "subject", "audio"].includes(x[0])).at(-1);
      assert.equal(preceding[1], roleName);
    }
  }
  assert.equal(events.some(x => x[0] === "send"), !failAudio, "missing audio reference must prevent sending");
  if (!failAudio) assert.equal(editor.innerText, prompt, "prompt stays unchanged");
  return ctx;
}
const ctx = await run();
await run(false, true);
await run(true);

async function runIntroMode() {
  const events = [], editor = { innerText: "" };
  const introCtx = { queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder, self: {}, chrome: { runtime: { onMessage: { addListener() {} } } } };
  vm.runInNewContext(source, introCtx);
  introCtx.getComposer = () => editor;
  introCtx.waitFor = async fn => fn();
  introCtx.stopInheritedBusyState = async () => {};
  introCtx.sleep = async () => {};
  introCtx.status = () => {};
  introCtx.replaceEditorText = (_ed, text) => { editor.innerText = text; events.push(["text", text]); };
  introCtx.insertTextAtEnd = (_ed, text) => { editor.innerText += text; events.push(["text", text]); };
  introCtx.editorPromptText = () => editor.innerText;
  introCtx.materializeJobFiles = async files => files;
  introCtx.uploadFiles = async (_ed, files) => { events.push(["upload", ...files.map(x => x.name)]); return { missingFiles: [] }; };
  introCtx.insertMention = async (_ed, name, placement) => { events.push([placement.kind, name]); return true; };
  introCtx.submitUntilAccepted = async () => { events.push(["send"]); };
  introCtx.videoQueueSnapshot = () => ({ cardIds: [] });
  introCtx.waitForReadableBackendCreditBalance = async () => 100;
  introCtx.waitForCreditDeduction = async () => ({ consumed: 36, currentBalance: 64 });
  const phrase = "这是阮乔的音色";
  const prompt = `${phrase}\n视频编号01\n人物：阮乔：第一段。`;
  await introCtx.executeJob({
    id: "audio-intro",
    prompt,
    audioIntroMode: true,
    characters: [],
    lockedAudio: [{ kind: "audio", name: "阮乔", sourceSubjectName: "阮乔", anchor: phrase, offset: phrase.length, occurrence: 1, required: true }],
    lockedSubjects: [{ kind: "subject", name: "阮乔", sourceSubjectName: "阮乔", anchor: "阮乔", occurrence: 2 }],
    lockedImages: [],
    files: [{ name: "阮乔.mp3", type: "audio/mpeg", roleBindings: ["阮乔"] }],
  });
  assert.equal(events.filter(x => x[0] === "upload" && x.includes("阮乔.mp3")).length, 1);
  assert.equal(events.filter(x => x[0] === "audio").length, 1, "音色前置模式只在视频开头插入音频 @，不再跟人物 @ 重复插入");
  assert.equal(events.filter(x => x[0] === "subject").length, 1);
  assert.ok(events.findIndex(x => x[0] === "upload") < events.findIndex(x => x[0] === "audio"), "音频必须先上传再 @");
  assert.ok(events.findIndex(x => x[0] === "audio") < events.findIndex(x => x[0] === "subject"), "音频 @ 必须位于该视频人物正文 @ 之前");
  assert.equal(events.at(-1)[0], "send");
}
await runIntroMode();

function node(kind) {
  return { className: "lv-select-option", attributes: [], textContent: "阮乔", getAttribute: () => "",
    querySelector(selector) {
      if (selector.includes("audio-thumbnail-") || selector.includes("M16.667")) return kind === "audio" ? {} : null;
      if (selector.includes("option-name-")) return kind === "subject" ? {} : null;
      if (selector.includes("blob:")) return kind === "image" ? {} : null;
      return null;
    } };
}
for (const actual of ["audio", "image", "subject"]) {
  for (const requested of ["audio", "image", "subject"]) {
    assert.equal(ctx.mentionOptionMatchesKind(node(actual), requested), actual === requested, actual + " vs " + requested);
  }
}
const chips = { querySelectorAll(selector) { return selector.includes("subject") ? [node("subject")] : [node("audio"), node("image")]; } };
for (const kind of ["audio", "image", "subject"]) assert.equal(ctx.mentionChipCount(chips, "阮乔", kind), 1);
console.log("[OK] every extra-image/subject occurrence gets audio, upload is once, missing audio blocks sending, same-name kinds are isolated");
