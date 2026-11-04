import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./content.js', import.meta.url), 'utf8');
const start = source.indexOf('async function activateAttachmentUpload(');
const end = source.indexOf('\nfunction getActiveFileInput(', start);
let anchors = [];
const calls = [];
const context = vm.createContext({
  composerRoot: () => ({ querySelectorAll: () => anchors }),
  SELECTORS: { fileUpload: '[class*=reference-upload-]' },
  isInteractable: e => e.visible,
  isRectInsideViewport: () => true,
  uploadDiagnostic: () => {},
  chrome: { runtime: { sendMessage: async message => { calls.push(message); return { ok: true }; } } },
});
vm.runInContext(source.slice(start, end), context);
const anchor = { visible: true, getAttribute: () => null,
  getBoundingClientRect: () => ({left:10, top:20, width:48, height:64}) };
const editor = { getBoundingClientRect: () => ({left:0, top:0, width:10, height:10}) };
await assert.rejects(context.activateAttachmentUpload({}, 'test'), /入口不明确/);
assert.equal(calls.length, 0);
anchors = [anchor, {...anchor, visible:false}];
await context.activateAttachmentUpload(editor, 'test');
assert.equal(calls.length, 1);
assert.equal(calls[0].intent, 'open_attachment_upload');
assert.equal(calls[0].point.x, 34);
assert.equal(calls[0].point.y, 52);
anchors = [anchor, anchor];
await assert.rejects(context.activateAttachmentUpload({}, 'test'), /入口不明确/);
assert.equal(calls.length, 1);
context.chrome.runtime.sendMessage = async () => ({ok:false, error:'click failed'});
anchors = [anchor];
await assert.rejects(context.activateAttachmentUpload(editor, 'test'), /click failed/);
