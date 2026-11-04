import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('./content.js', import.meta.url), 'utf8');
function fixture({initial = 0, expanded = false, failExpand = false} = {}) {
  let now = 0, images = initial, audios = 0, clicks = 0, dispatches = 0;
  const rect = {x:10,y:10,left:10,top:10,right:58,bottom:74,width:48,height:64};
  const entry = {isConnected:true, getBoundingClientRect:()=>rect, click(){clicks++; if(!failExpand) expanded=true;}};
  const hiddenEntry = {isConnected:true, getBoundingClientRect:()=>({...rect,width:0,height:0}), click(){throw Error('hidden composer clicked');}};
  const tabs = {isConnected:true,querySelectorAll:()=>['全部 ('+(images+audios)+')','图片 ('+images+')','视频','音频 ('+audios+')'].map(textContent=>({textContent,isConnected:true}))};
  const root = {querySelectorAll(selector){
    if(selector === "[role='tablist']") return expanded ? [tabs] : [];
    if(selector.includes('collapsed-more-entry-')) return images+audios ? [hiddenEntry,entry] : [];
    return [];
  }};
  const editor = {closest:()=>root};
  const input = {files:[],value:'',dispatchEvent(e){if(e.type==='change'){dispatches++; for(const f of this.files){if(f.name.endsWith('.mp3'))audios++;else images++;} expanded=false;}}};
  class Transfer {constructor(){this.files=[];this.items={add:f=>this.files.push(f)};}}
  const context = {queueMicrotask,structuredClone,AbortController,TextEncoder,TextDecoder,self:{},window:{innerWidth:1920,innerHeight:1080},Date:{now:()=>now},DataTransfer:Transfer,Event:class{constructor(type){this.type=type;}},chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(){return {ok:true};}}}};
  vm.createContext(context); vm.runInContext(source,context);
  context.sleep=async ms=>{now+=ms;};
  context.getActiveFileInput=()=>input;
  context.logFileInputDiagnostic=()=>{};context.logAttachmentCountDiagnostic=()=>{};
  return {context,editor,stats:()=>({images,audios,clicks,dispatches})};
}
const images=['role.jpeg','photo.png','room.png'].map(name=>({name,type:'image/png',file:{name}}));
const audio=[{name:'阮乔.mp3',type:'audio/mpeg',file:{name:'阮乔.mp3'}}];
const first=fixture();
const state=first.context.createAttachmentUploadState();
const firstResult=await first.context.uploadFiles(first.editor,images,'first',state);
assert.equal(firstResult.counts.images,3);
assert.deepEqual(first.stats(),{images:3,audios:0,clicks:1,dispatches:1});
await first.context.uploadFiles(first.editor,audio,'audio',state);
assert.deepEqual(first.stats(),{images:3,audios:1,clicks:2,dispatches:2});
console.log('[PASS] first three-image batch and following role audio each dispatch once and reveal their counts');
const existing=fixture({initial:3});
const existingResult=await existing.context.uploadFiles(existing.editor,audio,'existing');
assert.equal(existingResult.counts.all,4);
assert.deepEqual(existing.stats(),{images:3,audios:1,clicks:2,dispatches:1});
console.log('[PASS] collapsed existing images are read as baseline before uploading audio');
const visible=fixture({initial:3,expanded:true});
assert.equal((await visible.context.readAttachmentCountsForUpload(visible.editor,'visible')).images,3);
assert.equal(visible.stats().clicks,0);
const failed=fixture({initial:3,failExpand:true});
await assert.rejects(failed.context.uploadFiles(failed.editor,audio,'failed'),/分类计数仍不可读/);
assert.equal(failed.stats().dispatches,0);
console.log('[PASS] expanded panels stay unchanged; failed expansion prevents an unknown baseline upload');
