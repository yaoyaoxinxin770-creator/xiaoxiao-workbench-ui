import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./content.js', import.meta.url), 'utf8');
const context = {
  queueMicrotask: fn => fn(),
  composerRoot: editor => editor,
  readAttachmentCountsForUpload: async () => null,
  readAttachmentTabCounts: root => root.categories || null,
  sameAttachmentCounts: (a,b) => ['all','images','videos','audios','docs'].every(k=>a[k]===b[k]),
};
vm.runInNewContext(source.slice(source.lastIndexOf('queueMicrotask(() => {')), context);
const item = kind => ({isConnected:true, querySelector(selector) {
  if (selector.includes('[data-index]')) return kind === 'upload' ? {} : null;
  return selector.startsWith(kind === 'image' ? 'img,' : kind + ',') ? {} : null;
}});
const container = (items, visible=true) => ({isConnected:true,
  getBoundingClientRect:()=>({width:visible?100:0,height:visible?80:0}),
  querySelectorAll:()=>items});
const root = (...containers) => ({querySelectorAll:()=>containers});
const read = async r => JSON.parse(JSON.stringify(await context.readAttachmentCountsForUpload(r,'test')));
const images = [item('image'),item('image'),item('image')];
const expected = {all:3,images:3,videos:0,audios:0,docs:0};
assert.deepEqual(await read(root(container([...images,images[0],item('upload')]))),expected);
assert.deepEqual(await read(root(container(images),container(images))),expected);
assert.deepEqual(await read(root(container(images),container([item('audio')],false))),expected);
assert.equal(await read(root(container(images),container(images.slice(0,2)))),null);
assert.deepEqual(await read(root(container([...images,item('audio'),item('audio')]))),
  {all:5,images:3,videos:0,audios:2,docs:0});
const categorized = root(container(images.slice(0,2)));
categorized.categories = expected;
assert.deepEqual(await read(categorized),expected);
console.log('Compact references: aggregate groups, deduplicate items/copies, exclude upload/hidden copies, reject conflicts, prefer categories: PASS');
