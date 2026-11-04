// Isolated real Electron renderer + real asset IPC/store. Dialog choices are test doubles.
const {app,BrowserWindow,ipcMain,nativeImage}=require('electron');
app.disableHardwareAcceleration();
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const store=require('./asset-store'),{loadAnalyzer,recognizeProject}=require('./project-assets');
const root=process.env.JIMENG_ASSET_TEST_ROOT;
if(!root)throw Error('Run through test-asset-ui.mjs so test files are cleaned up.');
const project=path.join(root,'测试项目');fs.mkdirSync(project);
app.setPath('userData',path.join(root,'electron-profile'));
const analyzer=loadAnalyzer(path.resolve(__dirname,'../jimeng-canvas-extension/analyzer.js'));
let win,deleteAnswer=0,lastDialog,thumbCount=0;
const image=nativeImage.createFromBitmap(Buffer.alloc(160*160*4,170),{width:160,height:160}).toPNG();
for(const [folder,names]of Object.entries({'人物':['阮乔.png','阮乔-睡衣.png','ChatGPT Image 2026.png'],'场景':['大厅.png'],'音色':['阮乔.wav']})){fs.mkdirSync(path.join(project,folder));for(const name of names)fs.writeFileSync(path.join(project,folder,name),name.endsWith('.wav')?'test audio':image);}
const importFile=path.join(root,'新增图.png');fs.writeFileSync(importFile,image);
store.write(project,{mode:'queue',modeLocked:true});
require('./asset-ipc').register({ipcMain,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[importFile]}),showMessageBox:async(_w,options)=>{lastDialog=options;return {response:deleteAnswer};}},nativeImage:{createThumbnailFromPath:async(...args)=>{thumbCount++;await new Promise(resolve=>setTimeout(resolve,60));return nativeImage.createThumbnailFromPath(...args);}},getWindow:()=>win,analyzer});
const inspect=()=>({ok:true,pathAvailable:true,project:store.read(project),...recognizeProject(project)});
ipcMain.handle('workbench:read-recent',()=>({projects:[]}));ipcMain.handle('workbench:inspect-project',inspect);ipcMain.handle('workbench:read-runs',()=>({runs:[]}));
ipcMain.handle('workbench:save-project',()=>({ok:true}));
const cancelReasons=[];
ipcMain.handle('workbench:cancel-execution',(_event,reason)=>{cancelReasons.push(reason);return {ok:true,cancelled:true,delivered:false};});
const code=fn=>win.webContents.executeJavaScript('('+fn.toString()+')()');
const wait=async fn=>{for(let i=0;i<150;i++){if(await code(fn))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+fn);};
const previewsReady=()=>['#promptPreview','#sourcePromptPreview'].every(selector=>{
  const images=[...document.querySelectorAll(selector+' .aw-mention-img')];
  return images.length>0&&images.every(img=>!img.hidden&&img.complete&&img.naturalWidth>0);
});
const previewText=()=>{
  return ['#promptPreview','#sourcePromptPreview'].map(selector=>{
    const copy=document.querySelector(selector).cloneNode(true);
    copy.querySelectorAll('.aw-at,.aw-mention-state').forEach(node=>node.remove());
    return copy.textContent;
  });
};
const errors=[];
app.whenReady().then(async()=>{
  try {
    win=new BrowserWindow({width:1500,height:1080,show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
    await win.loadFile(path.resolve(__dirname,'../jimeng-canvas-extension/workbench.html'));
    await wait(()=>!!document.querySelector('#emptyOpenProject'));
    assert.equal(await code(()=>getComputedStyle(document.querySelector('#workspaceView')).display),'none');
    assert.equal(await code(()=>document.querySelector('#emptyOpenProject').getBoundingClientRect().width>0),true);
    const source='视频编号01（总时长：12s）｜场景：大厅｜人物：阮乔、霍砚\n镜头01｜大厅\n\n视频编号02（总时长：12s）｜场景：大厅｜人物：阮乔\n镜头01｜大厅';
    // Simulate a project saved by the removed whole-draft mode. Loading it
    // must migrate to the per-group queue instead of making run-all group 01.
    await win.webContents.executeJavaScript(`localStorage.setItem('jimeng-workbench-project',${JSON.stringify(JSON.stringify({projectPath:project,source,segments:[],mode:'draft'}))});sessionStorage.setItem('jimeng-open-project','1');`);
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});
    await wait(()=>document.querySelectorAll('.aw-card').length===5);
    assert.equal(await code(()=>document.querySelectorAll('.aw-card-audio .aw-card-audio-play').length),1);
    assert.match(await code(()=>document.querySelector('.aw-card-audio-play').getAttribute('aria-label')),/播放音频：阮乔/);
    assert.equal(await code(()=>getComputedStyle(document.querySelector('#projectView')).display),'none');
    assert.equal(await code(()=>getComputedStyle(document.querySelector('.mode-tabs')).display),'none');
    assert.equal(await code(()=>getComputedStyle(document.querySelector('.stepper')).display),'none');
    assert.equal(await code(()=>getComputedStyle(document.querySelector('.selection-card')).display),'none');
    assert.equal(await code(()=>document.querySelector('#modeKicker').textContent),'分组队列 · PROMPT');
    assert.equal(await code(()=>JSON.parse(localStorage.getItem('jimeng-workbench-project')).mode),'queue');
    // 项目资产置顶：先挑素材，再往下看分镜队列和整稿。
    assert.deepEqual(await code(()=>{const workspace=document.querySelector('#workspaceView'),layout=workspace.querySelector(':scope > main.layout'),assets=workspace.querySelector(':scope > #assetIndex'),setup=workspace.querySelector(':scope > .prompt-setup'),children=[...workspace.children];return [children.indexOf(assets)<children.indexOf(layout),children.indexOf(layout)<children.indexOf(setup)];}),[true,true]);
    assert.equal(await code(()=>!!document.querySelector('#runCurrent')&&!!document.querySelector('#runAll')),true);
    assert.equal(await code(()=>document.querySelectorAll('.queue-item').length),2);
    assert.equal(await code(()=>document.querySelectorAll('#promptPreview .aw-mention:not(.aw-scene-mention)').length),2);
    assert.equal(await code(()=>document.querySelectorAll('#promptPreview .aw-scene-mention').length),2);
    assert.deepEqual(store.read(project).segmentAssetBindings['video:01:0'].scenes,['场景/大厅.png']);
    const automaticAudio=await code(()=>window.workbenchBuildExecutionMaterial());
    // 发送内容的固定顺序：自动标注的视频编号 → 音色声明 → 整稿正文。
    assert.match(automaticAudio.prompt,/^01\n这是阮乔的音色\n视频编号01/);
    assert.deepEqual(automaticAudio.lockedAudio.map(item=>[item.kind,item.sourceSubjectName,item.anchor]),[['audio','阮乔','这是阮乔的音色']]);
    assert.deepEqual(automaticAudio.localFiles.find(item=>item.type.startsWith('audio/')).roleBindings,['阮乔']);
    assert.equal(await code(()=>getComputedStyle(document.querySelector('.asset-head')).display),'none');
    // Both previews must finish decoding, not just contain placeholder <img> elements.
    await wait(previewsReady);
    const firstPrompt=source.split('\n\n')[0];
    assert.deepEqual(await code(previewText),[firstPrompt,source]);
    for(let i=0;i<3;i++){
      await code(()=>window.renderProjectAssetIndex(window.workbenchAssetContext().root));
      await wait(previewsReady);
      assert.deepEqual(await code(previewText),[firstPrompt,source],'refresh must use raw text, not generated @ markup');
    }
    assert.equal(await code(()=>document.querySelector('#sourcePromptPreview').contentEditable),'true');
    assert.equal(await code(()=>document.querySelector('#sourceText').hidden),true);
    assert.equal(await code(()=>document.querySelector('#sourceText').value),source);
    await code(()=>{window.__assetUiOriginalSource=document.querySelector('#sourceText').value;const visual=document.querySelector('#sourcePromptPreview');visual.focus();const range=document.createRange();range.selectNodeContents(visual);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('insertText',false,' @');visual.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'@'}));});
    await wait(()=>document.querySelector('.aw-at-picker')&&!document.querySelector('.aw-at-picker').hidden&&document.querySelectorAll('.aw-at-row').length>0);
    await code(()=>document.querySelector('.aw-at-row').click());
    assert.match(await code(()=>document.querySelector('#sourceText').value),/@/);
    await code(()=>{const source=document.querySelector('#sourceText');source.value=window.__assetUiOriginalSource;source.dispatchEvent(new Event('input',{bubbles:true}));window.renderWorkbenchPrompt(source.value,document.querySelector('#sourcePromptPreview'));});
    assert.equal(await code(()=>window.workbenchReplaceText('segment','镜头01','镜头A').ok),true);
    assert.match(await code(()=>document.querySelector('#sourceText').value),/镜头A/);
    assert.equal(await code(()=>window.workbenchReplaceText('segment','镜头A','镜头01').ok),true);
    assert.equal(await code(()=>window.workbenchReplaceText('all','大厅','客厅').ok),true);
    assert.equal(await code(()=>window.workbenchReplaceText('all','客厅','大厅').ok),true);
    await wait(previewsReady);
    // Two previews may render concurrently; repeated renders of one target must only invalidate itself.
    await wait(()=>document.querySelectorAll('.aw-segment-character-picker .aw-role-picker').length===1&&document.querySelectorAll('.aw-segment-audio-picker .aw-role-picker').length===2);
    // 缺图角色卡和外层角色区是两个独立落点：指向缺图卡时只高亮小卡，
    // 并把素材明确绑定给该角色。场景区则只允许外层整栏接收拖放。
    const dragZones=await code(()=>{
      const missing=document.querySelector('.aw-group-missing');
      const characterOuter=document.querySelector('.aw-segment-character-picker');
      const sceneCards=document.querySelector('.aw-group-scenes .aw-group-cards');
      const sceneOuter=document.querySelector('.aw-group-scenes');
      const dataTransfer=new DataTransfer();
      dataTransfer.setData('application/x-jimeng-project-asset',JSON.stringify({root:window.workbenchAssetContext().root,relativePath:'人物/阮乔.png'}));
      missing.dispatchEvent(new DragEvent('dragover',{dataTransfer,bubbles:true,cancelable:true}));
      const result={
        missingHighlighted:missing.classList.contains('aw-over'),
        outerHighlighted:characterOuter.classList.contains('aw-over'),
        missingDrop:typeof missing.ondrop==='function',
        characterOuterDrop:typeof characterOuter.ondrop==='function',
        sceneInnerDrop:typeof sceneCards.ondrop==='function',
        sceneOuterDrop:typeof sceneOuter.ondrop==='function'
      };
      missing.dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}));
      return result;
    });
    assert.deepEqual(dragZones,{missingHighlighted:true,outerHighlighted:false,missingDrop:true,characterOuterDrop:true,sceneInnerDrop:false,sceneOuterDrop:true});
    for(let attempt=0;attempt<30&&store.read(project).segmentCharacterBindings?.['video:01:0']?.['霍砚']!=='人物/阮乔.png';attempt++)await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(store.read(project).segmentCharacterBindings?.['video:01:0']?.['霍砚'],'人物/阮乔.png','拖到缺图卡必须绑定给该卡对应角色');
    await code(async()=>{const context=window.workbenchAssetContext();await window.desktopBridge.assetBindCharacter(context.root,context.segmentKey,'霍砚','',true,false);await window.renderProjectAssetIndex(context.root);});
    await wait(()=>document.querySelectorAll('.aw-group-missing').length===1);
    // 自动匹配 + 本组不使用 + 阮乔的两个形象。
    assert.deepEqual(await code(()=>[...document.querySelector('.aw-segment-character-picker .aw-role-picker select').options].map(option=>option.value)),
      ['','__none__','人物/阮乔-睡衣.png','人物/阮乔.png']);
    await wait(()=>{const img=document.querySelector('.aw-role-preview');return img&&!img.hidden&&img.complete&&img.naturalWidth>0;});
    assert.equal(await code(()=>document.querySelector('.aw-role-picker .aw-card-caption').textContent),'阮乔');
    // Compact reference row, mirroring 熊猫AI's .sref-row.  The previous rule
    // sized the cards with repeat(auto-fit,minmax(115px,1fr)) plus
    // width:100%/aspect-ratio:1, so a column holding one or two cards
    // stretched each thumbnail to the full column width — two to three
    // hundred pixels per image, pushing the prompt off screen.  Track widths
    // are now fixed, so the row stays compact no matter how few cards it has.
    const layout=await code(()=>{
      const rect=node=>node.getBoundingClientRect();
      const media=[...document.querySelectorAll('#assets .aw-role-preview,#assets .aw-scene-row .aw-thumb,#assets .aw-audio-play')].filter(node=>!node.hidden);
      const columns=[...document.querySelectorAll('#assets .aw-group-column')];
      return {
        media:media.map(node=>[Math.round(rect(node).width),Math.round(rect(node).height)]),
        columnTops:columns.map(node=>Math.round(rect(node).top)),
        columnCount:columns.length,
        height:Math.round(rect(document.querySelector('#assets')).height),
        wider:Math.round(rect(document.querySelector('#assets')).width)>Math.ceil(rect(document.querySelector('.editor-panel')).width),
        display:getComputedStyle(document.querySelector('#assets')).display,
        sceneCardColumn:getComputedStyle(document.querySelector('#assets .aw-scene-row')||document.body).flexDirection,
      };
    });
    // prompt-preview.css used to carry a second, older rule set for this row
    // (.asset-box #assets{display:flex}).  It had the same specificity and
    // loaded later, so it silently replaced the three-column grid with a
    // wrapping flex row.  Assert the computed result, not just the source.
    assert.equal(layout.display,'grid','分组参考行必须是三栏 grid，不能被其他样式表改回 flex');
    assert.equal(layout.sceneCardColumn,'column','场景卡必须竖排：缩略图在上、名称在下');
    assert.ok(layout.media.length>=3,'参考行必须同时渲染角色形象、场景图和音色卡');
    for(const [width,height] of layout.media){
      assert.ok(width>0&&height>0,'参考卡必须实际占位');
      assert.ok(width<=96&&height<=96,`分组参考图不能被拉伸到整列宽：实际 ${width}×${height}`);
    }
    assert.equal(layout.columnCount,3);
    assert.equal(new Set(layout.columnTops).size,1,'出场角色、场景和音色必须并排在同一行，不能纵向堆叠');
    assert.ok(layout.height<=300,`分组参考行必须保持紧凑：实际高度 ${layout.height}`);
    assert.equal(layout.wider,false,'参考行不得超出编辑面板宽度');
    assert.equal(await code(()=>[...document.querySelector('.aw-segment-character-picker select').options].some(option=>option.value==='__none__')),
      true,'角色选择框必须提供“本组不使用”');
    const beforeExclude=await code(()=>{const material=window.workbenchBuildExecutionMaterial();return {characters:material.assets.characters.map(asset=>asset.role),locked:material.lockedImages.length,files:material.localFiles.length};});
    assert.ok(beforeExclude.characters.includes('阮乔'));
    await code(()=>document.querySelector('.aw-segment-character-picker .aw-card-remove').click());
    await wait(()=>document.querySelector('.aw-segment-character-picker .aw-role-picker select').value==='__none__');
    await wait(()=>document.querySelector('.aw-segment-character-picker .aw-card-caption').textContent==='本组不使用');
    const afterExclude=await code(()=>{const material=window.workbenchBuildExecutionMaterial();return {characters:material.assets.characters.map(asset=>asset.role),files:material.localFiles.map(file=>file.relativePath),bindings:Object.keys(window.workbenchSegmentCharacterBindings(material.segmentKey))};});
    assert.equal(afterExclude.characters.includes('阮乔'),false,'排除后不得再作为出场角色参与执行');
    assert.equal(afterExclude.files.includes('人物/阮乔-睡衣.png'),false,'排除后不得再上传该角色图片');
    assert.equal(afterExclude.bindings.includes('阮乔'),false,'排除的角色不能出现在交给执行器的绑定里');
    // 重新选回形象即可恢复，删除不是不可逆操作。
    await code(()=>{const select=document.querySelector('.aw-segment-character-picker .aw-role-picker select');select.value='人物/阮乔.png';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await wait(()=>document.querySelector('.aw-segment-character-picker .aw-card-caption').textContent==='阮乔');
    assert.equal(await code(()=>window.workbenchBuildExecutionMaterial().assets.characters.some(asset=>asset.role==='阮乔')),true,
      '重新选择形象必须恢复该角色');
    // 音色卡的 × 等价于选“不上传”。
    await code(()=>document.querySelector('.aw-segment-audio-picker .aw-card-remove').click());
    await wait(()=>document.querySelector('.aw-segment-audio-picker .aw-role-picker select').value==='__none__');
    assert.equal(await code(()=>window.workbenchBuildExecutionMaterial().lockedAudio.length),0,'音色移除后不得再生成音频锁定');
    // 还原本组绑定，避免影响后面既有的资产/预览断言。
    await code(()=>{const select=document.querySelector('.aw-segment-audio-picker .aw-role-picker select');select.value='__auto__';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await wait(()=>window.workbenchBuildExecutionMaterial().lockedAudio.length===1);
    await code(()=>{const select=document.querySelector('.aw-segment-character-picker .aw-role-picker select');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await wait(()=>document.querySelector('.aw-segment-character-picker .aw-card-caption').textContent==='阮乔');
    const audition=await code(()=>window.desktopBridge.assetAudioPreview(window.workbenchAssetContext().root,'音色/阮乔.wav'));
    assert.equal(audition.ok,true);
    assert.match(audition.preview,/^data:audio\/wav;base64,/);
    assert.equal((await code(()=>window.desktopBridge.assetAudioPreview(window.workbenchAssetContext().root,'人物/阮乔.png'))).ok,false);
    await code(()=>document.querySelector('.aw-expand-group').click());
    assert.equal(await code(()=>document.querySelector('.editor-panel').classList.contains('aw-expanded')),true);
    await code(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(await code(()=>document.body.classList.contains('aw-editing-expanded')),false);
    await code(()=>{const select=document.querySelector('.aw-segment-character-picker .aw-role-picker select');select.value='人物/阮乔-睡衣.png';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await new Promise(resolve=>setTimeout(resolve,500));
    for(let attempt=0;attempt<30&&! (store.read(project).segmentCharacterBindings?.['video:01:0']?.['阮乔']==='人物/阮乔-睡衣.png');attempt++) await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(store.read(project).segmentCharacterBindings?.['video:01:0']?.['阮乔'],'人物/阮乔-睡衣.png');
    assert.equal(await code(()=>Boolean(document.querySelector('.aw-segment-audio-picker .aw-role-picker select'))),true);
    await code(()=>{const select=document.querySelector('.aw-segment-audio-picker .aw-role-picker select');select.value='音色/阮乔.wav';select.dispatchEvent(new Event('change',{bubbles:true}));});
    for(let attempt=0;attempt<30&&store.read(project).segmentAudioBindings?.['video:01:0']?.['阮乔']!=='音色/阮乔.wav';attempt++) await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(store.read(project).segmentAudioBindings?.['video:01:0']?.['阮乔'],'音色/阮乔.wav');
    await code(()=>{const select=document.querySelector('.aw-segment-audio-picker .aw-role-picker select');select.value='__auto__';select.dispatchEvent(new Event('change',{bubbles:true}));});
    for(let attempt=0;attempt<30&&Object.hasOwn(store.read(project).segmentAudioBindings?.['video:01:0']||{},'阮乔');attempt++) await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(store.read(project).segmentAudioBindings?.['video:01:0']?.['阮乔'],undefined);
    await code(()=>{
      window.renderWorkbenchPrompt('人物：临时角色');
      window.renderWorkbenchPrompt(window.workbenchAssetContext().prompt);
      window.renderWorkbenchPrompt(document.querySelector('#sourceText').value,document.querySelector('#sourcePromptPreview'));
    });
    await wait(previewsReady);
    assert.deepEqual(await code(previewText),[firstPrompt,source]);
    await code(()=>document.querySelector('#assetIndex').scrollIntoView());
    await wait(()=>!!document.querySelector('.aw-grid .aw-thumb')?.src.startsWith('data:image/jpeg'));
    assert.ok(thumbCount>0);
    // 人物不再折叠成“单人区”：同名不同衣服直接平铺，名字在最外层双击即可修改，
    // 也不再出现“未指定：xxx”这种伪角色名。
    await code(()=>[...document.querySelectorAll('.aw-tabs button')].find(b=>b.textContent.startsWith('人物')).click());
    assert.equal(await code(()=>document.querySelectorAll('.aw-card').length),2,'两个版本必须直接平铺');
    assert.deepEqual(await code(()=>[...document.querySelectorAll('.aw-card b')].map(node=>node.textContent).sort()),
      ['阮乔','阮乔-睡衣'],'卡片上显示的是素材名，不是折叠出来的角色名');
    assert.equal(await code(()=>document.body.textContent.includes('个版本 · 点击展开')),false,'不能再有折叠入口');
    assert.equal(await code(()=>document.body.textContent.includes('未指定')),false,'不能再出现“未指定”');
    assert.equal(await code(()=>[...document.querySelectorAll('.aw-card b')].every(node=>node.title==='双击修改显示名')),true,
      '最外层每张卡的名字都要能双击改名');
    assert.equal(await code(()=>document.querySelectorAll('.aw-card .aw-thumb-zoom').length),2,'缩略图要能点开看原图');
    await code(()=>document.querySelectorAll('.queue-item')[1].click());
    await code(()=>{document.querySelectorAll('.queue-item')[0].click();document.querySelectorAll('.queue-item')[1].click();});
    await wait(previewsReady);
    assert.deepEqual(await code(previewText),[source.split('\n\n')[1],source]);
    // A removed file must show an explicit fallback, not a broken-image icon or an endless spinner.
    const missingFile=path.join(project,'人物/阮乔.png');fs.unlinkSync(missingFile);
    await code(()=>window.renderWorkbenchPrompt(window.workbenchAssetContext().prompt));
    await wait(()=>document.querySelector('#promptPreview .aw-mention:not(.aw-scene-mention) .aw-mention-state')?.textContent==='预览不可用');
    assert.equal(await code(()=>document.querySelector('#promptPreview .aw-mention:not(.aw-scene-mention) .aw-mention-img').hidden),true);
    fs.writeFileSync(missingFile,image);
    await code(()=>window.renderWorkbenchPrompt(window.workbenchAssetContext().prompt));
    await wait(previewsReady);
    await code(()=>[...document.querySelectorAll('.aw-tabs button')].find(b=>b.textContent.startsWith('待确认')).click());
    await code(()=>document.querySelector('.aw-card button').click());
    await code(()=>{const form=document.querySelector('.aw-form');const inputs=form.querySelectorAll('input');inputs[0].value='霍砚-西装';inputs[1].value='霍砚';const selects=form.querySelectorAll('select');selects[0].value='characters';selects[1].value='音色/阮乔.wav';form.querySelector('.aw-primary').click();});
    await wait(()=>document.querySelector('.aw-form [role=status]')?.textContent==='已保存');
    assert.equal(store.read(project).audioBindings['霍砚'],'音色/阮乔.wav');assert.ok(fs.existsSync(path.join(project,'人物/ChatGPT Image 2026.png')));
    await code(()=>document.querySelector('.aw-drawer .aw-head button').click());
    await code(()=>document.querySelectorAll('.queue-item')[0].click());
    const executionMaterial=await code(()=>window.workbenchBuildExecutionMaterial());
    assert.match(executionMaterial.prompt,/^01\n这是阮乔的音色，这是霍砚的音色\n视频编号01/);
    assert.deepEqual(executionMaterial.lockedAudio.map(item=>[item.kind,item.sourceSubjectName,item.anchor]),[['audio','阮乔','这是阮乔的音色'],['audio','霍砚','这是霍砚的音色']]);
    assert.deepEqual(executionMaterial.lockedImages.map(item=>[item.kind,item.anchor,item.name]),[['image','阮乔','阮乔-睡衣'],['image','霍砚','霍砚-西装'],['image','大厅','大厅']]);
    assert.equal(executionMaterial.localFiles.length,4);
    assert.deepEqual(executionMaterial.localFiles.find(item=>item.type.startsWith('audio/')).roleBindings,['阮乔','霍砚']);
    await code(()=>document.querySelector('.aw-expand-group').click());
    await wait(()=>[...document.querySelectorAll('#assets .aw-role-preview')].every(img=>!img.hidden&&img.complete&&img.naturalWidth>0));
    const groupOut=path.resolve(__dirname,'../output/asset-workspace-verification');fs.mkdirSync(groupOut,{recursive:true});
    fs.writeFileSync(path.join(groupOut,'video-group.png'),(await win.webContents.capturePage()).toPNG());
    await code(()=>document.querySelector('.aw-expand-group').click());
    // Import is the one explicit copy operation; original stays in place.
    await code(()=>document.querySelector('button.aw-action').click());
    await wait(()=>document.querySelector('.aw-status').textContent.includes('已添加 1'));
    assert.ok(fs.existsSync(importFile));assert.ok(fs.existsSync(path.join(project,'待确认/新增图.png')));
    const dropTrash=()=>{const dt=new DataTransfer();document.querySelector('.aw-card').dispatchEvent(new DragEvent('dragstart',{dataTransfer:dt,bubbles:true}));document.querySelector('.aw-trash').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));};
    await code(dropTrash);await new Promise(r=>setTimeout(r,100));assert.ok(fs.existsSync(path.join(project,'待确认/新增图.png')));assert.match(lastDialog.detail,/磁盘永久删除，无法撤销/);assert.equal(lastDialog.defaultId,0);
    deleteAnswer=1;await code(dropTrash);await wait(()=>document.querySelector('.aw-status').textContent.includes('素材已从磁盘删除'));assert.ok(!fs.existsSync(path.join(project,'待确认/新增图.png')));
    await code(()=>[...document.querySelectorAll('.aw-tabs button')].find(b=>b.textContent.startsWith('全部')).click());
    await code(()=>document.querySelector('#assetIndex').scrollIntoView());
    await wait(()=>[...document.querySelectorAll('.aw-grid img')].every(img=>img.complete&&img.naturalWidth>0));
    await code(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const out=path.resolve(__dirname,'../output/asset-workspace-verification');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'workspace.png'),(await win.webContents.capturePage()).toPNG());
    await wait(previewsReady);
    await code(()=>document.querySelector('.prompt-toolbar').scrollIntoView());
    await code(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    fs.writeFileSync(path.join(out,'two-previews.png'),(await win.webContents.capturePage()).toPNG());
    // 分镜队列重置。已发送的组只能在工作台本地回到“待准备”——即梦那边的任务
    // 撤不回来，积分也已经扣掉，所以确认文案必须点明再次执行会再次扣费，并且
    // 发送途中绝对不能重置。
    const saved=await code(()=>JSON.parse(localStorage.getItem('jimeng-workbench-project')));
    assert.equal(saved.segments.length,2);
    const seedQueue=async statuses=>{
      const next={...saved,mode:'queue',segments:saved.segments.map((segment,index)=>({...segment,status:statuses[index]||'',error:statuses[index]==='error'?'上一轮失败':''}))};
      await win.webContents.executeJavaScript(`localStorage.setItem('jimeng-workbench-project',${JSON.stringify(JSON.stringify(next))});sessionStorage.setItem('jimeng-open-project','1');`);
      await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});
      await wait(()=>document.querySelectorAll('.queue-item').length===2);
    };
    await seedQueue(['done','error']);
    assert.equal(await code(()=>document.querySelector('#queueStat').textContent),'已完成 1 / 可执行 2');
    assert.equal(await code(()=>document.querySelector('#resetQueue').disabled),false);
    assert.deepEqual(await code(()=>{const result=window.workbenchResetQueue({confirmReset:()=>false});return [result.ok===true,result.cancelled===true,document.querySelector('#queueStat').textContent];}),
      [false,true,'已完成 1 / 可执行 2'],'取消重置不能改动任何状态');
    assert.match(await code(()=>{let seen='';window.workbenchResetQueue({confirmReset:message=>{seen=message;return false;}});return seen;}),
      /再次发送并再次扣费/,'确认框必须写明重置后重跑会重复扣费');
    const after=await code(()=>{const result=window.workbenchResetQueue({confirmReset:()=>true});return {ok:result.ok,reset:result.reset,stat:document.querySelector('#queueStat').textContent,percent:document.querySelector('#queuePercent').textContent,labels:[...document.querySelectorAll('.queue-item small')].map(node=>node.textContent),active:[...document.querySelectorAll('.queue-item')].findIndex(node=>node.classList.contains('active')),saved:JSON.parse(localStorage.getItem('jimeng-workbench-project')).segments.map(segment=>segment.status||'')};});
    assert.equal(after.ok,true);
    assert.equal(after.reset,2);
    assert.equal(after.stat,'已完成 0 / 可执行 2');
    assert.equal(after.percent,'0%');
    assert.ok(after.labels.every(label=>label.includes('待准备')),'重置后全部分镜必须回到待准备');
    assert.equal(after.active,0,'重置后必须回到第 1 组');
    assert.deepEqual(after.saved,['',''],'重置必须写回本地存档，刷新后不能复活旧状态');
    await seedQueue(['running','']);
    assert.equal(await code(()=>document.querySelector('#resetQueue').disabled),true,'发送途中重置按钮必须禁用');
    assert.deepEqual(await code(()=>{const result=window.workbenchResetQueue({confirmReset:()=>true});return [result.ok===true,result.error];}),
      [false,'批次正在执行'],'发送途中即使绕过按钮也必须拒绝重置');
    await seedQueue(['','']);

    // 资产卡删除。角色排除写成 false（与音色的“不上传”同一套语义），必须同时从
    // 执行素材和交给执行器的 characterBindings 里消失——否则画布会被要求锁定一个
    // 没有文件的主体。
    // 分镜队列增删。分镜是整稿的视图，增删必须落到整稿文本，否则下一次解析会把
    // 删掉的组原样带回来。
    assert.equal(await code(()=>document.querySelectorAll('.queue-item .queue-remove').length),2);
    const added=await code(()=>{const result=window.workbenchAddSegment();return {ok:result.ok,id:result.id,total:result.total,items:document.querySelectorAll('.queue-item').length,source:document.querySelector('#sourceText').value};});
    assert.equal(added.ok,true);
    assert.equal(added.id,'03','新增编号必须接在现有最大编号之后');
    assert.equal(added.items,3);
    assert.match(added.source,/视频编号03/,'新增必须写进整稿');
    assert.equal(await code(()=>JSON.parse(localStorage.getItem('jimeng-workbench-project')).source.includes('视频编号03')),true,
      '新增必须落盘，刷新后仍在');
    assert.deepEqual(await code(()=>{const result=window.workbenchDeleteSegment(2,{confirmDelete:()=>false});return [result.ok===true,result.cancelled===true,document.querySelectorAll('.queue-item').length];}),
      [false,true,3],'取消删除不得改动整稿');
    assert.match(await code(()=>{let seen='';window.workbenchDeleteSegment(2,{confirmDelete:message=>{seen=message;return false;}});return seen;}),
      /整稿中删除/,'确认框必须说明会改动整稿');
    const removed=await code(()=>{const result=window.workbenchDeleteSegment(2,{confirmDelete:()=>true});return {ok:result.ok,remaining:result.remaining,items:document.querySelectorAll('.queue-item').length,source:document.querySelector('#sourceText').value};});
    assert.equal(removed.ok,true);
    assert.equal(removed.items,2);
    assert.equal(removed.source.includes('视频编号03'),false,'删除必须从整稿里移除这一组');
    assert.equal(await code(()=>document.querySelectorAll('.queue-item strong')[0].textContent),'视频 01','删除后其余分镜必须保持原编号');
    assert.equal(await code(()=>window.workbenchBuildExecutionMaterial().prompt.includes('视频编号03')),false);
    // 执行途中不能增删。
    await seedQueue(['running','']);
    assert.equal(await code(()=>document.querySelector('.queue-item .queue-remove').disabled),true,'执行途中删除按钮必须禁用');
    assert.deepEqual(await code(()=>{const removeResult=window.workbenchDeleteSegment(1,{confirmDelete:()=>true});const addResult=window.workbenchAddSegment();return [removeResult.error,addResult.error,document.querySelectorAll('.queue-item').length];}),
      ['批次正在执行','批次正在执行',2],'执行途中即使绕过按钮也必须拒绝增删');
    await seedQueue(['','']);

    // 范围执行：只跑选定区间，编号用队列上显示的视频号。
    assert.deepEqual(await code(()=>[[...document.querySelector('#rangeFrom').options].map(option=>option.value),[...document.querySelector('#rangeTo').options].map(option=>option.value)]),
      [['01','02'],['01','02']],'范围下拉必须跟着队列列出全部视频组');
    assert.deepEqual(await code(()=>[document.querySelector('#rangeFrom').value,document.querySelector('#rangeTo').value]),
      ['01','02'],'默认区间应当覆盖首尾');
    assert.deepEqual(await code(async()=>{const result=await window.workbenchRunRange('09','02');return [result.ok,result.error];}),
      [false,'队列里没有视频 09']);
    // 区间计算单独可测，不碰发送路径：contextBridge 暴露的 desktopBridge 是
    // 冻结对象，测试里替换不了它的方法，也不该为了测区间去真的触发发送。
    assert.deepEqual(await code(()=>window.workbenchRangeIndices('02','02').indices),[1],'单组区间只含该组');
    assert.deepEqual(await code(()=>window.workbenchRangeIndices('01','02').indices),[0,1]);
    assert.deepEqual(await code(()=>window.workbenchRangeIndices('02','01').indices),[0,1],'反着选也应当得到同一个区间');
    assert.deepEqual(await code(()=>{const range=window.workbenchRangeIndices('01','02');return [range.first,range.last];}),['01','02']);

    // 停止 = 真中断：必须经由真实的 preload/IPC 通道调用 cancelExecution 释放
    // broker 槽位，否则之后每次执行都会被“已有任务正在等待即梦画布处理”挡住。
    const stopped=await code(async()=>{
      const result=await window.workbenchStopEverything();
      return {released:result.released,status:document.querySelector('#runStatus').textContent,detail:document.querySelector('#currentDetail').textContent,next:document.querySelector('#nextAction').textContent};
    });
    assert.equal(cancelReasons.length,1,'停止必须真的调用一次 cancelExecution');
    assert.match(cancelReasons[0],/停止/,'停止必须把原因传给工作台服务');
    assert.equal(stopped.released,true,'停止必须确认 broker 槽位已释放');
    assert.equal(stopped.status,'已停止');
    assert.match(stopped.detail,/由你决定下一步/,'停止后必须交回控制权，而不是挂起等待');
    assert.equal(stopped.next,'选择要执行的范围');

    // 发送时自动在最开头标上视频编号。编号来自模板里的【视频编号NN】，
    // 用户不用自己写；@ 的锚点偏移必须跟着这一行一起挪，否则会 @ 到错误的位置。
    const numbered=await code(()=>{const material=window.workbenchBuildExecutionMaterial();return {prompt:material.prompt,locked:material.lockedImages.map(item=>({anchor:item.anchor,offset:item.offset}))};});
    assert.ok(numbered.prompt.startsWith('01\n'),`发送内容必须以编号行开头，实际开头是 ${JSON.stringify(numbered.prompt.slice(0,12))}`);
    for(const lock of numbered.locked){
      assert.equal(numbered.prompt.slice(lock.offset-lock.anchor.length,lock.offset),lock.anchor,
        `@${lock.anchor} 的锚点偏移必须仍然落在正确位置`);
    }
    // 已经手写过编号的整稿不重复标注。
    assert.equal(await code(()=>{const material=window.workbenchBuildExecutionMaterial();return (material.prompt.split('\n').filter(line=>line.trim()==='01').length);}),1,
      '编号行只能有一条');

    // 分集：每集只换整稿和由它解析出来的队列，项目资产不随集切换。
    // 分镜绑定按 segmentKey 存，key 里只有视频编号和下标——两集都有“视频编号01”
    // 时必须落到不同的 key 上，否则第二集会覆盖第一集已经选好的形象。
    assert.deepEqual(await code(()=>{const state=window.workbenchEpisodes();return [state.episodes.length,state.episodes[0].name,state.episodes[0].groups];}),
      [1,'第1集',2],'老项目打开后应当自动成为“第1集”，队列原样保留');
    const firstKey=await code(()=>window.workbenchAssetContext().segmentKey);
    assert.equal(firstKey,'video:01:0','第一集沿用旧的 key 格式，老项目已存的绑定不需要迁移');

    const newEpisode=await code(()=>{const result=window.workbenchAddEpisode();return {ok:result.ok,name:result.name,groups:document.querySelectorAll('.queue-item').length,source:document.querySelector('#sourceText').value};});
    assert.equal(newEpisode.ok,true);
    assert.equal(newEpisode.name,'第2集','默认名按第几集顺延');
    assert.equal(newEpisode.groups,0,'新一集的队列是空的');
    assert.equal(newEpisode.source,'','新一集的整稿是空的');

    // 关键：第二集即使出现同样的视频编号，key 也必须和第一集不同。
    await code(()=>{document.querySelector('#sourceText').value='视频编号01（总时长：12s）｜场景：大厅｜人物：阮乔\n镜头01｜大厅';document.querySelector('#sourceText').dispatchEvent(new Event('input',{bubbles:true}));});
    await wait(()=>document.querySelectorAll('.queue-item').length===1);
    const secondKey=await code(()=>window.workbenchAssetContext().segmentKey);
    assert.equal(secondKey,'ep:ep2:video:01:0','第二集起的 key 必须带集号前缀');
    assert.notEqual(secondKey,firstKey,'两集的同编号视频组绝不能共用一条绑定');
    assert.equal(await code(()=>window.workbenchBuildExecutionMaterial().segmentKey),secondKey,
      '真正发送时用的 key 必须和界面一致');

    // 资产不随集切换。
    assert.equal(await code(()=>document.querySelectorAll('.aw-card').length>0),true,'项目资产在新一集里照样在');

    // 重命名。
    assert.equal(await code(()=>window.workbenchRenameEpisode('宴会厅篇').ok),true);
    assert.equal(await code(()=>window.workbenchEpisodes().episodes[1].name),'宴会厅篇');
    assert.equal(await code(()=>window.workbenchRenameEpisode('第1集').ok),false,'重名必须拒绝');

    // 切回第一集：整稿和队列必须原样回来。
    assert.equal(await code(()=>window.workbenchSwitchEpisode('ep1').ok),true);
    assert.equal(await code(()=>document.querySelectorAll('.queue-item').length),2,'切回后第一集的队列原样恢复');
    assert.equal(await code(()=>window.workbenchAssetContext().segmentKey),'video:01:0');
    assert.equal(await code(()=>window.workbenchSwitchEpisode('ep2').ok),true);
    assert.equal(await code(()=>document.querySelectorAll('.queue-item').length),1,'第二集的队列也原样恢复');

    // 删除本集：取消不动，确认后回到上一集；至少保留一集。
    assert.equal(await code(()=>window.workbenchDeleteEpisode({confirmDelete:()=>false}).cancelled),true);
    assert.equal(await code(()=>window.workbenchEpisodes().episodes.length),2);
    assert.equal(await code(()=>window.workbenchDeleteEpisode({confirmDelete:()=>true}).ok),true);
    assert.deepEqual(await code(()=>{const state=window.workbenchEpisodes();return [state.episodes.length,state.activeId];}),[1,'ep1']);
    assert.equal(await code(()=>window.workbenchDeleteEpisode({confirmDelete:()=>true}).error),'至少保留一集');
    assert.equal(await code(()=>document.querySelectorAll('.queue-item').length),2,'删除后回到第一集，队列完好');

    await code(()=>document.querySelector('#projectNav').click());
    assert.equal(await code(()=>getComputedStyle(document.querySelector('#workspaceView')).display),'none');
    assert.equal(await code(()=>window.scrollY),0);
    assert.deepEqual(errors,[],'renderer errors');
    console.log('Real Electron UI: exclusive views, simultaneous decoded prompt images, refresh without @ duplication, edit/raw text preservation, rapid segment switching, missing-file fallback, grouping, per-segment drop, fine edits, audio, import, delete cancel/confirm, compact reference row, queue reset guards, per-group asset removal, queue add/delete, range selection, stop-as-abort, episodes with isolated bindings, return navigation: PASS');
    win.destroy();app.exit(0);
  } catch(e){console.error(e.stack);if(win&&!win.isDestroyed())win.destroy();app.exit(1);}
});
