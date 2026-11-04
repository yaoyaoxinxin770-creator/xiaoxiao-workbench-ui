import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright-core');
const executablePath=process.env.JIMENG_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert.ok(fs.existsSync(executablePath),'mention anchor test requires installed Chrome; test may not silently skip');
const content=fs.readFileSync(path.join(import.meta.dirname,'../jimeng-canvas-extension/content.js'),'utf8');
// Load the executor the way CDP mode does: enclosed in one function, so its
// declarations stay local and a test can replace one from inside that scope.
const source='(function(){const chrome={runtime:{onMessage:{addListener(){}},sendMessage:async()=>({ok:true})}};\n'+content+
  '\nwindow.__t={setCaretAfterOccurrence,resolveLockPlacements,insertMention};window.__set=(name,fn)=>{eval(name+" = fn");};\n})();';
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage();
  await page.setContent('<div id="editor" class="tiptap ProseMirror" contenteditable="true"></div>');
  await page.addScriptTag({content:source});
  const caretAfter=(html,anchor,occurrence=1,trailing='')=>page.evaluate(({html,anchor,occurrence,trailing})=>{
    const editor=document.getElementById('editor');editor.innerHTML=html;
    const editable=node=>{const clone=node.cloneNode(true);clone.querySelectorAll('[contenteditable="false"]').forEach(n=>n.remove());return clone.textContent;};
    try{window.__t.setCaretAfterOccurrence(editor,anchor,occurrence,trailing);}
    catch(error){return {error:error.message,anchorMissing:Boolean(error.anchorMissing)};}
    const range=getSelection().getRangeAt(0),before=document.createRange();
    before.selectNodeContents(editor);before.setEnd(range.startContainer,range.startOffset);
    const holder=document.createElement('div');holder.append(before.cloneContents());
    return {before:editable(holder),all:editable(editor)};
  },{html,anchor,occurrence,trailing});
  const chip=name=>`<span class="node-reference-mention-tag" contenteditable="false">${name}</span>`;

  // 分镜30: the scene anchor is the whole 场景 line, and the correctly placed
  // 张叔 chip left " @" in the middle of it. An exact search never matched again.
  const sceneAnchor='主卧·夜·内：床边，张叔教育进行时。';
  const sceneLine=`<p>【场景与连续状态】</p><p>场景：主卧·夜·内：床边，张叔 @${chip('张叔·管家爷爷')}教育进行时。</p>`;
  const scene=await caretAfter(sceneLine,sceneAnchor);
  assert.equal(scene.error,undefined,JSON.stringify(scene));
  assert.ok(!scene.all.includes(sceneAnchor),'fixture reproduces 分镜30: chip residue splits the scene anchor');
  assert.equal(scene.before,scene.all,'@主卧 goes right after the scene line even with a chip inside it');

  // The retry path looks for the anchor followed by the " @" it just typed.
  const retried=await caretAfter(sceneLine.replace('进行时。</p>','进行时。 @</p>'),sceneAnchor,1,' @');
  assert.ok(retried.before.endsWith('进行时。 @'),JSON.stringify(retried));

  // Paragraph breaks are element boundaries, never characters in the editor.
  const multi=await caretAfter('<p>【场景与连续状态】</p><p>场景：主卧</p>','【场景与连续状态】\n场景');
  assert.equal(multi.before,'【场景与连续状态】场景',JSON.stringify(multi));

  // The occurrence resolveLockPlacements derives must name the same spot the
  // live editor search finds — including when the audio intro repeats the role.
  const fullText='前缀：30\n这是张叔的音色\n【镜头01】张叔看向宋柏峰。';
  const bodyEnd=fullText.indexOf('张叔',fullText.indexOf('【镜头01】'))+'张叔'.length;
  const audioEnd=fullText.indexOf('这是张叔的音色')+'这是张叔的音色'.length;
  const placements=await page.evaluate(({fullText,bodyEnd,audioEnd})=>window.__t.resolveLockPlacements(fullText,fullText,[
    {kind:'image',name:'张叔·管家爷爷',anchor:'张叔',offset:bodyEnd,occurrence:1},
    {kind:'audio',name:'张叔',anchor:'这是张叔的音色',offset:audioEnd,occurrence:1}]),{fullText,bodyEnd,audioEnd});
  const image=placements.find(item=>item.kind==='image');
  assert.equal(image.occurrence,2,'the intro holds the 1st 张叔, the body the 2nd');
  const atImage=await caretAfter(`<p>前缀：30</p><p>这是张叔的音色 @${chip('张叔')}</p><p>【镜头01】张叔</p>`,'张叔',image.occurrence);
  assert.equal(atImage.before,atImage.all,'the character @ lands in the body, not in the audio intro');
  assert.ok(atImage.before.endsWith('【镜头01】张叔'),JSON.stringify(atImage));

  // Text that is genuinely absent is reported as such, never as a slow menu.
  const missing=await caretAfter('<p>场景：客厅</p>',sceneAnchor);
  assert.equal(missing.anchorMissing,true,JSON.stringify(missing));
  assert.match(missing.error,/未点击发送/);

  // The retry loop exists for slow asset menus. A missing anchor is not one of
  // those, so it must release the group at once instead of spinning — 分镜30
  // retried @主卧 202 times. The stub gives up after 20 so a regression fails
  // this assertion rather than hanging the suite.
  const loop=await page.evaluate(async()=>{
    let attempts=0;
    window.__set('batchPauseRequested',async()=>false);
    window.__set('ensureComposerExpandedForMention',async()=>{});
    window.__set('rollbackTrailingMentionText',()=>{});
    window.__set('status',()=>{});
    window.__set('sleep',()=>new Promise(resolve=>setTimeout(resolve,0)));
    window.__set('insertMentionAttempt',async()=>{
      attempts+=1;
      if(attempts>20)return;
      const error=new Error('无法在输入框中定位第 1 个“主卧”，未点击发送');error.anchorMissing=true;throw error;
    });
    const editor=document.getElementById('editor');editor.innerHTML='<p>场景：客厅</p>';
    const outcome=await window.__t.insertMention(editor,'主卧',{kind:'image',jobId:'test',required:true,anchor:'主卧',occurrence:1})
      .then(()=>({resolved:true}),error=>({message:error.message,clicked:Boolean(error.formalClickAttempted)}));
    return {attempts,...outcome};
  });
  assert.equal(loop.attempts,1,'a missing anchor is not retried: '+JSON.stringify(loop));
  assert.equal(loop.clicked,false);
  assert.match(loop.message,/已停止重试 @主卧，本组未发送、未扣费/);

  console.log('Mention anchors: chip residue inside a scene anchor, retry trailing @, multi-line anchors, intro/body occurrence, missing-anchor detection and no endless retry: PASS');
}finally{await browser.close();}
