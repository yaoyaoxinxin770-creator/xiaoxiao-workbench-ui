(() => {
  const bridge=window.desktopBridge;if(!bridge?.assetList)return;
  const $=s=>document.querySelector(s), MIME='application/x-jimeng-project-asset';
  const labels={all:'全部',characters:'人物',groups:'群像',scenes:'场景',props:'道具',other:'其他',pending:'待确认',audio:'音频'};
  const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn,cls='')=>{const n=el('button',cls,text);n.type='button';n.onclick=fn;return n;};
  // The small ✕ on a reference card. It lives inside a <label> for the character
  // and audio pickers, so the click must not fall through to the select.
  const cardRemove=(title,fn,isHidden=()=>false)=>{
    const remove=button('×',event=>{event.preventDefault();event.stopPropagation();fn();},'aw-card-remove');
    remove.title=title;remove.setAttribute('aria-label',title);remove.hidden=Boolean(isHidden());
    return remove;
  };
  function rankAudioCandidates(role, assets) {
    const clean=value=>String(value||'').normalize('NFKC').replace(/\.(?:mp3|wav|m4a|aac|ogg|flac)$/i,'').replace(/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u,'').replace(/\s+/g,'').toLowerCase();
    const base=value=>clean(value).replace(/\([^)]*\)/g,'').replace(/(?:[-_·](?:音色|音频|配音|声音|参考|人形|猫形|幼年|成年).*)$/,'');
    const target=clean(role), stem=base(role);
    const score=asset=>Math.max(...[asset.role,asset.displayName].filter(Boolean).map(value=>{
      const name=clean(value), core=base(value);
      if(name===target)return 100;
      if(stem.length>=2&&core===stem)return 90;
      // Only a complete character name followed by a known voice/file label is safe.
      if(stem.length>=2&&name.startsWith(stem)&&/^(?:[-_·]?)(?:音色|音频|配音|声音|参考)(?:[-_·\d].*)?$/.test(name.slice(stem.length)))return 80;
      return 0;
    }),0);
    return assets.filter(a=>a.mediaType==='audio').map(asset=>({asset,score:score(asset)})).filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score||a.asset.displayName.localeCompare(b.asset.displayName,'zh-CN')).map(x=>x.asset);
  }
  function automaticAudio(role){
    return data.assets.find(a=>a.relativePath===data.config.audioBindings?.[role]&&a.mediaType==='audio')||rankAudioCandidates(role,data.assets)[0];
  }
  let root='',data={assets:[],roles:[],config:{}},category='all',query='',generation=0,thumbJobs=[],thumbActive=0,drawerAsset=null;
  let activeAudio=null,audioRequest=0,activeAudioButton=null;
  const panel=$('#assetIndex');
  // A name click must not open the drawer before the second click arrives.
  panel.addEventListener('click',event=>{if(event.target.closest('.aw-card-main > b,.aw-inline-name'))event.stopPropagation();},true);
  $('#sceneNav')?.remove();
  const templateCard=$('.template-card'),draftToolbar=$('.prompt-toolbar'),draftSource=$('#sourceText'),draftActions=$('.editor-actions');
  if(panel&&templateCard&&draftToolbar&&draftSource&&draftActions){
    const setup=el('section','prompt-setup');
    const prefixPane=el('div','prompt-setup-pane prompt-prefix-pane');
    const draftPane=el('div','prompt-setup-pane prompt-draft-pane');
    draftToolbar.querySelector('#promptLabel').textContent='整稿提示词';
    // 整稿很长，默认那一小块高度不够审阅。放大后铺满屏幕，Esc 或再点一次收起；
    // 放大的只是同一个容器，编辑的仍然是原来那份内容，不会另存一份。
    const expandDraft=button('⛶ 放大审阅',()=>toggleDraftExpanded(),'ghost aw-expand-draft');
    const toggleDraftExpanded=(force)=>{
      const on=force===undefined?!draftPane.classList.contains('aw-draft-expanded'):Boolean(force);
      draftPane.classList.toggle('aw-draft-expanded',on);
      document.body.classList.toggle('aw-draft-expanded-open',on);
      expandDraft.textContent=on?'⤡ 收起':'⛶ 放大审阅';
      if(on)(draftPane.querySelector('#sourcePromptPreview')||draftSource)?.focus?.();
    };
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&draftPane.classList.contains('aw-draft-expanded'))toggleDraftExpanded(false);});
    draftToolbar.append(button('↻ 重新匹配全部',()=>rematch('all'),'ghost aw-rematch'),expandDraft);
    prefixPane.append(templateCard);draftPane.append(draftToolbar,draftSource,draftActions);setup.append(prefixPane,draftPane);
    // 项目资产置顶：先挑素材，再往下看分镜和整稿，符合实际操作顺序。
    const workbenchLayout=$('#workspaceView > main.layout');
    if(workbenchLayout)panel.after(workbenchLayout);
    (workbenchLayout||panel).after(setup);
  }
  panel.replaceChildren();panel.className='aw-panel';
  const head=el('div','aw-head');head.append(el('h2','','项目资产（可拖入下方分镜）'));
  const tools=el('div','aw-tools');const search=el('input');search.placeholder='搜索名字 / 角色 / 文件名';search.oninput=()=>{query=search.value.toLowerCase();renderGrid();};
  tools.append(search,button('精细管理',()=>openDrawer(data.assets[0])),button('刷新素材',()=>refresh(root)));head.append(tools);
  const info=el('p','aw-info'),status=el('div','aw-status');status.setAttribute('role','status');
  const tabs=el('div','aw-tabs');tabs.setAttribute('role','tablist');
  const grid=el('div','aw-grid');panel.append(head,info,tabs,grid,status);head.querySelector('h2').textContent='项目资产';
  const shade=el('div','aw-shade');shade.hidden=true;
  const drawer=el('aside','aw-drawer');drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','精细管理');shade.append(drawer);document.body.append(shade);
  let focusBefore=null,dirty=false;
  function closeDrawer(){if(dirty&&!confirm('有未保存的修改，放弃这些修改？'))return;shade.hidden=true;dirty=false;focusBefore?.focus();}
  shade.onclick=e=>{if(e.target===shade)closeDrawer();};
  shade.onkeydown=e=>{if(e.key==='Escape')closeDrawer();if(e.key==='Tab'){const nodes=[...drawer.querySelectorAll('button,input,select')].filter(n=>!n.disabled);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}};
  const report=(message,bad=false)=>{status.textContent=message;status.classList.toggle('error',bad);};
  async function call(fn){try{const r=await fn();if(!r?.ok)throw Error(r?.error||'操作失败');return r;}catch(e){report(e.message,true);return null;}}
  function current(){return window.workbenchAssetContext?.()||{};}
  const escHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  // Each preview owns its lifecycle. Rendering the full draft must not cancel a segment preview.
  const promptRenderTokens=new WeakMap(),promptEditorValues=new WeakMap(),promptThumbnailRequests=new Map();
  function promptThumbnail(projectRoot,relativePath){
    const key=JSON.stringify([projectRoot,relativePath]);
    if(!promptThumbnailRequests.has(key)){
      const request=bridge.assetThumb(projectRoot,relativePath).finally(()=>promptThumbnailRequests.delete(key));
      promptThumbnailRequests.set(key,request);
    }
    return promptThumbnailRequests.get(key);
  }
  function decorateCharacterLine(line,names){
    const sorted=[...names].sort((a,b)=>b.length-a.length);let html='',cursor=0;
    while(cursor<line.length){const name=sorted.find(candidate=>line.startsWith(candidate,cursor));if(!name){html+=escHtml(line[cursor++]);continue;}
      const selected=data.config.segmentCharacterBindings?.[current().segmentKey]?.[name];
      const asset=selected
        ? data.assets.find(item=>item.relativePath===selected)
        : autoCharacterAsset(name,characterCandidates(name),current().prompt);
      html+='<span class="aw-mention aw-auto-mention" data-bind-role="'+escHtml(name)+'" data-bind-type="image"><span>'+escHtml(name)+'</span>'+(asset?`<span class="aw-at">@</span><img class="aw-mention-img" alt="" hidden data-mention-path="${escHtml(asset.relativePath)}"><span class="aw-mention-state">加载中</span>`:'')+'</span>';cursor+=name.length;
    }
    const alias=line.match(/资产\s*【([^】]+)】/);
    if(alias&&names[0]){const role=names[0],selected=data.config.segmentCharacterBindings?.[current().segmentKey]?.[role];const asset=selected===false?null:(selected?data.assets.find(item=>item.relativePath===selected):autoCharacterAsset(role,characterCandidates(role),current().prompt));const label=alias[1];const chip='<span class="aw-mention aw-auto-mention" data-bind-role="'+escHtml(role)+'" data-bind-type="image"><span>'+escHtml(label)+'</span>'+(asset?'<span class="aw-at">@</span><img class="aw-mention-img" alt="" hidden data-mention-path="'+escHtml(asset.relativePath)+'"><span class="aw-mention-state">加载中</span>':'<span class="aw-at">＋绑定</span>')+'</span>';html=html.replace(escHtml('【'+label+'】'),'【'+chip+'】');}
    return html;
  }
  function assetForToken(token){
    const value=String(token||'').trim();
    const selected=data.config.segmentCharacterBindings?.[current().segmentKey]?.[value];if(selected)return data.assets.find(asset=>asset.relativePath===selected);
    const exact=data.assets.filter(asset=>asset.displayName===value);
    const prefixHits=exact.length?[]:closestAssets(data.assets.filter(asset=>asset.mediaType==='image'&&nameMatchesAsset(asset.displayName,value)),value);
    return (exact.length===1?exact[0]:null)||(prefixHits.length===1?prefixHits[0]:null)||autoCharacterAsset(value,characterCandidates(value),current().prompt);
  }
  function decorateAtTokens(line){
    const pattern=/@([^\s@，。；;：:、|｜]+)/g;let html='',cursor=0,match;
    while((match=pattern.exec(line))){html+=escHtml(line.slice(cursor,match.index));const token=match[1],voice=/声线|音色|声音/.test(line),asset=voice?(data.config.segmentAudioBindings?.[current().segmentKey]?.[token]===false?null:data.assets.find(a=>a.relativePath===data.config.segmentAudioBindings?.[current().segmentKey]?.[token])||automaticAudio(token)):assetForToken(token);
      if(!asset){html+=voice?'<span class="aw-audio-mention" data-bind-role="'+escHtml(token)+'" data-bind-type="audio"><span>'+escHtml(token)+'</span><span class="aw-at">@ ＋绑定</span></span>':escHtml(match[0]);cursor=pattern.lastIndex;continue;}
      if(asset.mediaType==='audio') html+=`<span class="aw-audio-mention" data-review-reference="${escHtml(asset.relativePath)}" data-bind-role="${escHtml(token)}" data-bind-type="audio"><span>${escHtml(token)}</span><span class="aw-at">@</span><span class="aw-audio-icon">♫</span></span>`;
      else html+=`<span class="aw-mention"><span>${escHtml(token)}</span><span class="aw-at">@</span><img class="aw-mention-img" alt="" hidden data-mention-path="${escHtml(asset.relativePath)}"><span class="aw-mention-state">加载中</span></span>`;
      cursor=pattern.lastIndex;
    }
    return html+escHtml(line.slice(cursor));
  }
  function renderWorkbenchPrompt(prompt,target=$('#promptPreview')){
    const preview=target;if(!preview)return;const token=Symbol(),projectRoot=root;promptRenderTokens.set(preview,token);promptEditorValues.set(preview,String(prompt||''));const lines=String(prompt||'').split(/\n/);let found=false,header=false;
    const namesFrom=line=>line.split(/[、，,；;／/|]/).map(x=>x.trim()).filter(x=>x&&x.length<40&&!/^(无|若干|暂无|多人)$/.test(x));
    const html=lines.map((line,index)=>{if(/^\s*【[^】]*出场人物[^】]*】/.test(line)||/^\s*\[出场人物\]/.test(line)){header=true;return escHtml(line);}if(header&&/^\s*【[^】]*】/.test(line))header=false;if(header&&line.trim()){const head=line.split(/[：:]/)[0];if(head&&head!==line&&head.trim().length<40){const names=namesFrom(head);if(names.length){found=true;return decorateCharacterLine(line,names);}}const names=namesFrom(line);if(names.length){found=true;return decorateCharacterLine(line,names);}}const match=line.match(/^(.*?(?:人物|角色)\s*[：:]\s*)(.+)$/);if(match){const names=namesFrom(match[2]);if(names.length){found=true;return escHtml(match[1])+decorateCharacterLine(match[2],names);}}return decorateAtTokens(line);}).join('\n');
    // innerHTML 重建会把 scrollTop 归零；重建前后各记一次，用户看到的位置不丢。
    const keepScroll=preview.scrollTop;
    preview.innerHTML=html;
    preview.scrollTop=keepScroll;
    const scenePaths=data.config.segmentAssetBindings?.[current().segmentKey]?.scenes||[];
    for(const asset of data.assets.filter(a=>a.kind==='scenes'&&scenePaths.includes(a.relativePath))){
      const names=[asset.displayName,asset.relativePath.split('/').pop().replace(/\.[^.]+$/,'')].filter(Boolean).sort((a,b)=>b.length-a.length);
      const walker=document.createTreeWalker(preview,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      for(const node of nodes){if(node.parentElement.closest('.aw-mention,.aw-audio-mention'))continue;const text=node.textContent;let cursor=0;const fragment=document.createDocumentFragment();let changed=false;
        while(cursor<text.length){const name=names.find(n=>text.startsWith(n,cursor));if(!name){fragment.append(document.createTextNode(text[cursor++]));continue;}
          const chip=el('span','aw-mention aw-auto-mention aw-scene-mention');chip.append(el('span','',name),el('span','aw-at','@'));const img=el('img','aw-mention-img');img.alt='';img.hidden=true;img.dataset.mentionPath=asset.relativePath;chip.append(img,el('span','aw-mention-state','加载中'));fragment.append(chip);cursor+=name.length;changed=true;
        }if(changed)node.replaceWith(fragment);
      }
      preview.normalize();
    }
    preview.querySelectorAll('.aw-mention,.aw-audio-mention').forEach(chip=>chip.contentEditable='false');
    preview.querySelectorAll('[data-mention-path]').forEach(img=>img.closest('.aw-mention').dataset.reviewReference=img.dataset.mentionPath);
    const imagesByPath=new Map();
    preview.querySelectorAll('[data-mention-path]').forEach(img=>{
      const relative=img.dataset.mentionPath;
      if(!imagesByPath.has(relative))imagesByPath.set(relative,[]);
      imagesByPath.get(relative).push(img);
    });
    const stillCurrent=()=>promptRenderTokens.get(preview)===token&&projectRoot===root&&preview.isConnected;
    for(const [relative,images]of imagesByPath){
      const failed=()=>{if(!stillCurrent())return;for(const img of images){img.hidden=true;const state=img.nextElementSibling;state.hidden=false;state.textContent='预览不可用';state.title=relative+'：请检查文件后刷新素材';}};
      promptThumbnail(projectRoot,relative).then(result=>{
        if(!stillCurrent())return;
        if(!result?.ok||!result.preview){failed();return;}
        for(const img of images){
          img.onload=()=>{if(stillCurrent()&&img.isConnected){img.hidden=false;img.nextElementSibling.hidden=true;}};
          img.onerror=failed;
          img.src=result.preview;
        }
      }).catch(failed);
    }
    preview.classList.toggle('aw-prompt-decorated',found);
  }
  window.renderWorkbenchPrompt=renderWorkbenchPrompt;
  const sourceText=$('#sourceText'),sourceToolbar=$('.prompt-toolbar');
  const segmentVisual=$('#promptPreview');
  if(segmentVisual){segmentVisual.closest('.selected-prompt')?.querySelector('.section-label')?.replaceChildren(document.createTextNode('当前视频组提示词'));segmentVisual.contentEditable='true';segmentVisual.spellcheck=false;segmentVisual.setAttribute('role','textbox');segmentVisual.setAttribute('aria-label','当前视频组提示词，可直接编辑');segmentVisual.classList.add('segment-prompt-editor');}
  function rawPromptFromVisual(visual){const copy=visual.cloneNode(true);copy.querySelectorAll('.aw-auto-mention').forEach(node=>node.replaceWith(document.createTextNode(node.querySelector('span')?.textContent||'')));copy.querySelectorAll('.aw-mention:not(.aw-auto-mention),.aw-audio-mention').forEach(node=>node.replaceWith(document.createTextNode('@'+(node.querySelector('span')?.textContent||''))));copy.querySelectorAll('.aw-mention-state').forEach(node=>node.remove());return (copy.innerText||copy.textContent||'').replace(/\u00a0/g,' ');}
  window.workbenchSyncPromptEditor=prompt=>{if(segmentVisual&&(promptEditorValues.get(segmentVisual)!==String(prompt||'')||rawPromptFromVisual(segmentVisual)!==String(prompt||'')))renderWorkbenchPrompt(prompt,segmentVisual);};
  let sourceVisual=null;
  if(sourceText&&sourceToolbar){
    sourceVisual=el('div','source-preview');sourceVisual.id='sourcePromptPreview';sourceVisual.contentEditable='true';sourceVisual.spellcheck=false;sourceVisual.setAttribute('role','textbox');sourceVisual.setAttribute('aria-label','整稿提示词，可直接编辑');sourceText.after(sourceVisual);
    sourceVisual.addEventListener('input',()=>{sourceText.value=rawPromptFromVisual(sourceVisual);sourceText.dispatchEvent(new Event('input',{bubbles:true}));});
  }
  if(segmentVisual){
    segmentVisual.addEventListener('input',()=>{const value=rawPromptFromVisual(segmentVisual);promptEditorValues.set(segmentVisual,value);const result=window.workbenchUpdateCurrentSegmentPrompt?.(value);if(result&&!result.ok)report(result.error,true);});
    segmentVisual.addEventListener('blur',()=>{setTimeout(()=>{if(document.activeElement?.closest?.('.aw-at-picker'))return;renderWorkbenchPrompt(current().prompt||'',segmentVisual);if(sourceText?.value.trim()&&sourceVisual)renderWorkbenchPrompt(sourceText.value,sourceVisual);},120);});
  }
  const atPicker=el('div','aw-at-picker');atPicker.hidden=true;
  const atSearch=el('input','aw-at-search');atSearch.placeholder='搜索图片 / 音频 / 角色';
  // 搜索栏下面一排分类，直接映射资产库的分组；点一下只看那一类。
  const atTabs=el('div','aw-at-tabs');
  const atResults=el('div','aw-at-results');
  atPicker.append(atSearch,atTabs,atResults);
  atPicker.addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault();});
  document.body.append(atPicker);
  let atRange=null,atEditor=null,atCategory='all',atBinding=null,atAnchor=null;
  const AT_ORDER=['characters','groups','scenes','props','other','pending','audio'];
  function hideAtPicker(){atPicker.hidden=true;atRange=null;atEditor=null;atBinding=null;atAnchor=null;}
  function renderAtResults(query=''){
    const needle=query.trim().toLowerCase();
    const matches=data.assets.filter(asset=>(!atBinding||asset.mediaType===atBinding.type)&&
      `${asset.displayName} ${asset.role||''} ${labels[asset.kind]||''}`.toLowerCase().includes(needle));
    const buckets=AT_ORDER.filter(kind=>matches.some(asset=>asset.kind===kind));
    if(atCategory!=='all'&&!buckets.includes(atCategory))atCategory='all';
    atTabs.replaceChildren();
    const tab=(key,label,count)=>{
      const node=button(`${label} ${count}`,()=>{atCategory=key;renderAtResults(atSearch.value);},
        'aw-at-tab'+(atCategory===key?' active':''));
      node.setAttribute('aria-pressed',String(atCategory===key));
      return node;
    };
    atTabs.append(tab('all','全部',matches.length));
    for(const kind of buckets)atTabs.append(tab(kind,labels[kind],matches.filter(asset=>asset.kind===kind).length));
    const shown=(atCategory==='all'?matches:matches.filter(asset=>asset.kind===atCategory)).slice(0,120);
    atResults.replaceChildren();
    if(!shown.length){atResults.append(el('div','aw-at-empty','没有匹配资产'));return;}
    const addRow=asset=>{
      // 插入和显示都用素材名：同一个人不同服装本来就是不同的名字，用角色名会三张全一样。
      const token=asset.displayName||asset.role;
      const row=button('',async()=>{
        if(!atRange||!atEditor)return;
        if(atBinding){const {role,key,projectRoot}=atBinding;if(window.workbenchRunStatus?.().running)return;const result=await call(()=>asset.mediaType==='audio'?bridge.assetBindSegmentAudio(projectRoot,key,role,asset.relativePath,false):bridge.assetBindCharacter(projectRoot,key,role,asset.relativePath,false,false));if(result&&root===projectRoot){data.config=result.config;hideAtPicker();renderBindings();renderWorkbenchPrompt(current().prompt||'');}return;}
        const editor=atEditor,range=atRange.cloneRange(),context=current(),projectRoot=root;const role=segmentRoles(context.prompt).includes(asset.role)?asset.role:token;if(editor===segmentVisual){const result=await call(()=>asset.mediaType==='audio'?bridge.assetBindSegmentAudio(projectRoot,context.segmentKey,role,asset.relativePath,false):['characters','groups'].includes(asset.kind)?bridge.assetBindCharacter(projectRoot,context.segmentKey,role,asset.relativePath,false,false):bridge.assetBind(projectRoot,context.segmentKey,'scenes',asset.relativePath,false));if(!result||root!==projectRoot||current().segmentKey!==context.segmentKey)return;data.config=result.config;}const selection=window.getSelection();
        selection.removeAllRanges();selection.addRange(range);
        document.execCommand('insertText',false,`@${token} `);
        hideAtPicker();editor.dispatchEvent(new Event('input',{bubbles:true}));editor.focus();
      },'aw-at-row');
      if(asset.mediaType==='audio')row.append(el('span','aw-at-audio','♫'));
      else{const image=thumbnail(asset);image.className='aw-picker-thumb';row.append(image);}
      row.append(el('span','',token),el('small','',asset.role&&asset.role!==token?`${asset.role} · ${labels[asset.kind]}`:labels[asset.kind]));
      atResults.append(row);
    };
    if(atCategory==='all'){
      for(const kind of buckets){
        const bucket=shown.filter(asset=>asset.kind===kind);
        if(!bucket.length)continue;
        atResults.append(el('div','aw-at-group',`${labels[kind]} · ${bucket.length}`));
        for(const asset of bucket)addRow(asset);
      }
    }else for(const asset of shown)addRow(asset);
  }
  atSearch.oninput=()=>renderAtResults(atSearch.value);
  // 选择卡必须跟着 @ 光标走。以前只在弹出的那一刻算一次固定坐标，之后一滚动
  // 页面，卡片就留在原地飘着，和 @ 完全脱节。现在滚动和改窗口大小都会重新定位，
  // 光标滚出可视区就收起来。
  function positionAtPicker(){
    if(atPicker.hidden||!atRange)return;
    const rect=atAnchor?.getBoundingClientRect()||(atRange.getBoundingClientRect().height?atRange.getBoundingClientRect():atEditor.getBoundingClientRect());
    if(!rect||(!rect.width&&!rect.height&&!rect.top&&!rect.left))return hideAtPicker();
    const margin=8;
    const width=atPicker.offsetWidth||330;
    const height=atPicker.offsetHeight||260;
    // 光标已经滚出可视区就没必要再挂着了。
    if(rect.bottom<0||rect.top>window.innerHeight)return hideAtPicker();
    const below=rect.bottom+margin;
    const top=below+height<=window.innerHeight-margin
      ? below
      : Math.max(margin,rect.top-margin-height);   // 下面放不下就翻到光标上方
    atPicker.style.left=`${Math.max(margin,Math.min(window.innerWidth-width-margin,rect.left))}px`;
    atPicker.style.top=`${top}px`;
  }
  window.addEventListener('scroll',positionAtPicker,true);
  window.addEventListener('resize',positionAtPicker);
  function maybeShowAtPicker(editor){
    if(!editor)return;
    const selection=window.getSelection();
    if(!selection?.rangeCount||!editor.contains(selection.anchorNode))return hideAtPicker();
    const node=selection.anchorNode;
    const text=(node.nodeType===Node.TEXT_NODE?node.textContent.slice(0,selection.anchorOffset):'');
    const match=text.match(/@([^\s@，。；;：:、|｜]*)$/);
    if(!match)return hideAtPicker();
    atRange=selection.getRangeAt(0).cloneRange();
    atRange.setStart(node,selection.anchorOffset-match[0].length);
    atBinding=null;atEditor=editor;atAnchor=null;
    atSearch.value=match[1];
    atCategory='all';
    renderAtResults(match[1]);
    atPicker.hidden=false;
    positionAtPicker();
  }
  window.workbenchOpenMentionPicker=anchor=>{atAnchor=anchor||null;if(!segmentVisual||window.workbenchRunStatus?.().running)return;const selection=window.getSelection();atRange=selection?.rangeCount&&segmentVisual.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():document.createRange();if(!segmentVisual.contains(atRange.startContainer)){atRange.selectNodeContents(segmentVisual);atRange.collapse(false);}atEditor=segmentVisual;atBinding=null;atSearch.value='';atCategory='all';renderAtResults();atPicker.hidden=false;positionAtPicker();};
  // 审阅面板的缺项占位卡：等价于点击提示词里该角色的 chip，锚定到占位卡的按钮。
  window.workbenchOpenRoleBinding=(role,type,anchor)=>{
    if(!segmentVisual||window.workbenchRunStatus?.().running)return;
    const name=String(role||''),chip=segmentVisual.querySelector('[data-bind-role="'+CSS.escape(name)+'"]');
    atRange=document.createRange();
    if(chip)atRange.selectNodeContents(chip);else{atRange.selectNodeContents(segmentVisual);atRange.collapse(false);}
    atEditor=segmentVisual;atAnchor=anchor||null;
    atBinding={role:name,type:type==='audio'?'audio':'image',key:current().segmentKey,projectRoot:root};
    atSearch.value=name;atCategory='all';
    renderAtResults(name);atPicker.hidden=false;positionAtPicker();
  };
  const broadcastAssetState=()=>window.dispatchEvent?.(new (typeof CustomEvent==='function'?CustomEvent:Event)('workbench:state-changed'));
  window.workbenchSegmentExclude=async(kind,role,relativePath)=>{
    if(window.workbenchRunStatus?.().running)return {ok:false,error:'任务运行中'};
    const key=current().segmentKey;if(!key)return {ok:false,error:'未选择视频组'};
    const result=await call(()=>kind==='audio'?bridge.assetBindSegmentAudio(root,key,role,'',true):kind==='scene'?bridge.assetBind(root,key,'scenes',relativePath,true):bridge.assetBindCharacter(root,key,role,'',false,true));
    if(!result?.config)return {ok:false};
    data.config=result.config;renderBindings();renderWorkbenchPrompt(current().prompt||'');broadcastAssetState();
    return {ok:true};
  };
  window.workbenchSegmentRestore=async(kind,role)=>{
    if(window.workbenchRunStatus?.().running)return {ok:false,error:'任务运行中'};
    const key=current().segmentKey;if(!key)return {ok:false,error:'未选择视频组'};
    const result=await call(()=>kind==='audio'?bridge.assetBindSegmentAudio(root,key,role,'',false):bridge.assetBindCharacter(root,key,role,'',true,false));
    if(!result?.config)return {ok:false};
    data.config=result.config;renderBindings();renderWorkbenchPrompt(current().prompt||'');broadcastAssetState();
    return {ok:true};
  };
  for(const editor of [sourceVisual,segmentVisual].filter(Boolean)){editor.addEventListener('keyup',()=>maybeShowAtPicker(editor));editor.addEventListener('click',event=>{const chip=event.target.closest?.('[data-bind-role]');if(chip){if(window.workbenchRunStatus?.().running)return;atRange=document.createRange();atRange.selectNodeContents(chip);atEditor=editor;atAnchor=null;atBinding={role:chip.dataset.bindRole,type:chip.dataset.bindType,key:current().segmentKey,projectRoot:root};atSearch.value='';atCategory='all';renderAtResults();atPicker.hidden=false;positionAtPicker();return;}maybeShowAtPicker(editor);});}
  document.addEventListener('click',e=>{const path=e.composedPath();if(!path.includes(atPicker)&&!path.includes(atAnchor)&&![sourceVisual,segmentVisual].some(editor=>editor&&path.includes(editor)))hideAtPicker();});
  const replaceShade=el('div','aw-replace-shade');replaceShade.hidden=true;const replaceDialog=el('form','aw-replace-dialog');replaceDialog.innerHTML='<h3>文字替换</h3><p>替换会写入当前项目正稿，发送时使用替换后的文字。</p>';const replaceScope=selectInput([['all','整稿'],['segment','当前视频组']], 'segment');const replaceFind=el('input');replaceFind.placeholder='查找文字';const replaceWith=el('input');replaceWith.placeholder='替换为（可留空）';const replaceResult=el('small');const replaceRow=(label,input)=>{const field=el('label','aw-replace-field',label);field.append(input);replaceDialog.append(field);};replaceRow('作用范围',replaceScope);replaceRow('查找',replaceFind);replaceRow('替换为',replaceWith);const replaceActions=el('div','aw-replace-actions');const replaceCancel=button('取消',()=>{replaceShade.hidden=true;},'');const replaceApply=button('执行替换',()=>{const result=window.workbenchReplaceText?.(replaceScope.value,replaceFind.value,replaceWith.value);replaceResult.textContent=result?.ok?'替换完成':(result?.error||'当前不可替换');if(result?.ok){replaceShade.hidden=true;report('文字替换已保存');}},'aw-primary');replaceActions.append(replaceCancel,replaceApply);replaceDialog.append(replaceActions,replaceResult);replaceShade.append(replaceDialog);document.body.append(replaceShade);replaceShade.onclick=e=>{if(e.target===replaceShade)replaceShade.hidden=true;};const replaceButton=button('文字替换',()=>{replaceFind.value='';replaceWith.value='';replaceResult.textContent='';replaceShade.hidden=false;replaceFind.focus();},'source-replace-button');sourceToolbar?.append(replaceButton);
  function pump(){while(thumbActive<2&&thumbJobs.length){const {img,asset,epoch}=thumbJobs.shift();if(epoch!==generation||!img.isConnected)continue;thumbActive++;bridge.assetThumb(root,asset.relativePath).then(r=>{if(epoch===generation&&img.isConnected){if(r.ok)img.src=r.preview;else{img.alt='预览不可用';img.classList.add('aw-thumb-failed');}}}).catch(()=>{if(img.isConnected)img.alt='预览不可用';}).finally(()=>{thumbActive--;pump();});}}
  const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){observer.unobserve(e.target);thumbJobs.push({img:e.target,asset:e.target.asset,epoch:generation});pump();}}},{rootMargin:'120px'});
  function thumbnail(asset){const img=el('img','aw-thumb');img.alt='';img.setAttribute('aria-label',asset.displayName);img.draggable=false;img.width=160;img.height=160;img.asset=asset;observer.observe(img);return img;}
  function drag(card,asset){card.draggable=true;card.ondragstart=e=>{e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData(MIME,JSON.stringify({root,relativePath:asset.relativePath}));};}
  function target(node,action,{exclusive=false}={}){
    node.ondragover=e=>{
      if(![...e.dataTransfer.types].includes(MIME))return;
      e.preventDefault();
      if(exclusive){
        e.stopPropagation();
        node.closest('.aw-group-column')?.classList.remove('aw-over');
      }
      node.classList.add('aw-over');
    };
    node.ondragleave=e=>{
      if(exclusive)e.stopPropagation();
      if(!node.contains(e.relatedTarget))node.classList.remove('aw-over');
    };
    node.ondrop=e=>{
      e.preventDefault();e.stopPropagation();node.classList.remove('aw-over');
      try{
        const value=JSON.parse(e.dataTransfer.getData(MIME));
        if(value.root!==root)throw Error('不能跨项目拖放素材');
        const asset=data.assets.find(a=>a.relativePath===value.relativePath);
        if(!asset)throw Error('素材已变化，请刷新');
        action(asset);
      }catch(err){report(err.message,true);}
    };
  }
  // Prevent an external file drop from navigating away from the workbench.
  window.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();});
  window.addEventListener('drop',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();report('请把图片拖到项目资产区，或使用「添加图片」。');}});
  panel.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();panel.classList.add('aw-file-over');}});
  panel.addEventListener('dragleave',()=>panel.classList.remove('aw-file-over'));
  panel.addEventListener('drop',async e=>{if(![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();e.stopPropagation();panel.classList.remove('aw-file-over');const paths=[...e.dataTransfer.files].map(file=>file.path).filter(Boolean);if(!paths.length)return report('没有读取到素材路径，请用「添加图片或音频」选择。',true);const r=await call(()=>bridge.assetImportPaths(root,paths));if(r){await refresh(root);report(r.added.length?`已自动识别并添加 ${r.added.length} 个素材`:'没有新增素材');}});
  function renderTabs(){tabs.replaceChildren();for(const [key,label]of Object.entries(labels)){const count=key==='all'?data.assets.length:data.assets.filter(a=>a.kind===key).length;const tab=button(`${label} ${count}`,()=>{category=key;expanded='';renderTabs();renderGrid();},category===key?'active':'');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(category===key));if(key!=='all')target(tab,async asset=>{if((key==='audio')!==(asset.mediaType==='audio'))return report('图片和音频类型不能互相转换',true);await update(asset,{category:key});});tabs.append(tab);}}
  function audioPlayButton(asset,label='播放'){
    const play=button(`▶ ${label}`,async event=>{
      event.preventDefault();event.stopPropagation();
      if(activeAudioButton===play&&activeAudio){
        if(activeAudio.paused){try{await activeAudio.play();}catch{report('无法播放这个音频，请检查文件格式',true);}}
        else activeAudio.pause();
        return;
      }
      stopAudio();const request=audioRequest,projectRoot=root;
      play.disabled=true;play.textContent='加载中…';
      const result=await call(()=>bridge.assetAudioPreview(projectRoot,asset.relativePath));
      if(request!==audioRequest||root!==projectRoot||!play.isConnected)return;
      play.disabled=false;play.textContent=`▶ ${label}`;
      if(!result?.preview)return;
      const audio=new Audio(result.preview);activeAudio=audio;activeAudioButton=play;play.dataset.idleLabel=`▶ ${label}`;
      audio.onended=()=>stopAudio();
      audio.onpause=()=>{if(activeAudioButton===play)play.textContent=`▶ ${label}`;};
      audio.onplay=()=>{if(activeAudioButton===play)play.textContent='Ⅱ 暂停';};
      try{await audio.play();}catch{stopAudio();report('无法播放这个音频，请检查文件格式',true);}
    },'aw-card-audio-play');
    play.setAttribute('aria-label',`播放音频：${asset.displayName}`);
    return play;
  }
  // 点缩略图看原图：只在点开的那一刻读这一张，关掉就释放，任何时刻内存里只有
  // 一张大图。列表里仍然用 160px 预览，不受影响。
  let lightboxToken=0;
  const lightbox=el('div','aw-lightbox');lightbox.hidden=true;
  const lightboxImage=el('img','aw-lightbox-img');lightboxImage.alt='';
  const lightboxCaption=el('p','aw-lightbox-caption');
  const lightboxClose=button('×',()=>closeLightbox(),'aw-lightbox-close');
  lightboxClose.title='关闭（Esc）';
  lightbox.append(lightboxClose,lightboxImage,lightboxCaption);
  document.body.append(lightbox);
  function closeLightbox(){
    lightboxToken+=1;lightbox.hidden=true;
    lightboxImage.removeAttribute('src');   // 立刻释放这张大图
    document.body.classList.remove('aw-lightbox-open');
  }
  lightbox.onclick=event=>{if(event.target===lightbox)closeLightbox();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!lightbox.hidden)closeLightbox();});
  async function openLightbox(asset){
    const token=++lightboxToken,projectRoot=root;
    lightbox.hidden=false;document.body.classList.add('aw-lightbox-open');
    lightboxImage.removeAttribute('src');
    lightboxCaption.textContent=`${asset.displayName} · 正在读取原图…`;
    const result=await call(()=>bridge.assetFullImage(projectRoot,asset.relativePath));
    if(token!==lightboxToken||root!==projectRoot)return;
    if(!result?.image){lightboxCaption.textContent=`${asset.displayName} · 原图读取失败`;return;}
    lightboxImage.src=result.image;
    lightboxCaption.textContent=`${asset.displayName} · ${(result.bytes/1024/1024).toFixed(2)} MB 原图`;
  }
  function assetCard(asset){const card=el('article','aw-card');drag(card,asset);const view=button('',()=>openDrawer(asset),'aw-card-main');view.title=asset.relativePath;const media=asset.mediaType==='audio'?el('div','aw-audio','♫'):thumbnail(asset);if(asset.mediaType!=='audio'){media.classList.add('aw-thumb-zoom');media.title='点击查看原图';media.onclick=event=>{event.preventDefault();event.stopPropagation();openLightbox(asset);};}const name=el('b','',asset.displayName);name.title='双击修改显示名';name.ondblclick=e=>{e.preventDefault();e.stopPropagation();const input=el('input','aw-inline-name');input.value=asset.displayName;input.maxLength=200;name.replaceWith(input);input.focus();input.select();let saved=false;const save=async()=>{if(saved)return;saved=true;const value=input.value.trim();if(!value||value===asset.displayName){input.replaceWith(name);return;}const r=await update(asset,{displayName:value});if(!r){input.replaceWith(name);return;}const fresh=data.assets.find(a=>a.relativePath===asset.relativePath);if(fresh){asset.displayName=fresh.displayName;name.textContent=fresh.displayName;}input.replaceWith(name);};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save();}if(e.key==='Escape'){saved=true;input.replaceWith(name);}};input.onblur=save;};view.append(media,name,el('small','',asset.role?`${asset.role} · ${labels[asset.kind]}`:labels[asset.kind]));card.append(view);if(asset.mediaType==='audio'){card.classList.add('aw-card-audio');card.append(audioPlayButton(asset));}return card;}
  function renderGrid(){generation++;observer.disconnect();thumbJobs=[];grid.replaceChildren();let items=data.assets.filter(a=>(category==='all'||a.kind===category)&&`${a.displayName} ${a.role} ${a.relativePath}`.toLowerCase().includes(query));
    // 人物不再折叠成“单人区”：同一个人不同衣服本来就只是同名的多张素材，
    // 直接全部平铺，名字在最外层双击就能改，也不再冒出“未指定：xxx”这种伪角色。
    {if(category==='all'){const groups=[['characters','人物'],['groups','群像'],['scenes','场景'],['props','道具'],['other','其他'],['pending','待确认'],['audio','音频']];for(const [kind,title]of groups){const bucket=items.filter(a=>a.kind===kind);if(!bucket.length)continue;grid.append(el('h3','aw-group-title',`${title} · ${bucket.length}`));for(const a of bucket)grid.append(assetCard(a));}}else for(const a of items)grid.append(assetCard(a));}
    if(!items.length)grid.append(el('p','aw-empty','此分类暂无素材。可添加图片，或到精细管理调整分类。'));
    const add=button('+\n添加图片或音频',async()=>{const r=await call(()=>bridge.assetImport(root,category==='all'?'auto':category));if(r){await refresh(root);report(r.added.length?`已添加 ${r.added.length} 个素材`:'已取消添加');}},'aw-action');
    const trash=el('div','aw-action aw-trash','×\n拖入删除');trash.append(el('small','','从磁盘删除 · 需确认'));target(trash,async a=>{const r=await call(()=>bridge.assetDelete(root,a.relativePath));if(r?.deleted){await refresh(root);report('素材已从磁盘删除，相关绑定已清除');}});grid.append(add,trash);
  }
  async function refresh(projectRoot){if(!projectRoot)return;root=projectRoot;const r=await call(()=>bridge.assetList(root,$('#sourceText').value));if(!r)return;data=r;panel.hidden=false;info.textContent=`${r.assets.length} 项素材 · ${r.roles.length} 个角色 · ${r.assets.filter(a=>a.kind==='audio').length} 个音频 · ${r.scanMs}ms 扫描 · 拖入分镜仅保存绑定`;if(r.warnings.length)report(r.warnings.join('；'),true);renderTabs();renderGrid();renderBindings();renderWorkbenchPrompt(current().prompt||'');if(sourceText?.value.trim()){sourceText.hidden=true;sourceVisual.hidden=false;renderWorkbenchPrompt(sourceText.value,sourceVisual);}}
  window.workbenchRefreshAssets=projectRoot=>{if(current().root===projectRoot)return refresh(projectRoot);};
  async function update(asset,patch){const r=await call(()=>bridge.assetEdit(root,asset.relativePath,patch));if(r){dirty=false;await refresh(root);report('修改已保存到项目配置');}return r;}
  function selectInput(options,value){const s=el('select');for(const [v,t]of options){const o=el('option','',t);o.value=v;s.append(o);}s.value=value;return s;}
  function openDrawer(asset){if(!shade.hidden&&dirty&&!confirm('放弃未保存修改，切换素材？'))return;dirty=false;drawerAsset=asset;if(shade.hidden)focusBefore=document.activeElement;shade.hidden=false;drawer.replaceChildren();const title=el('div','aw-head');title.append(el('h2','','精细管理'),button('关闭 ×',closeDrawer));drawer.append(title);
    const chooser=selectInput(data.assets.map(a=>[a.relativePath,`${labels[a.kind]} · ${a.displayName}`]),asset?.relativePath);chooser.setAttribute('aria-label','选择资产');chooser.onchange=()=>openDrawer(data.assets.find(a=>a.relativePath===chooser.value));drawer.append(chooser);
    if(!asset){drawer.append(el('p','','暂无资产，请先添加图片或指定素材文件夹。'));return;}
    const form=el('form','aw-form');form.onsubmit=e=>e.preventDefault();drawer.append(form);
    if(asset.mediaType==='image'){const preview=thumbnail(asset);preview.style.maxWidth='180px';form.append(preview);}
    const name=el('input');name.value=asset.displayName;name.maxLength=200;
    const categorySelect=selectInput(Object.entries(labels).filter(([k])=>k!=='all'&&(asset.mediaType==='audio'?k==='audio':k!=='audio')),asset.kind);
    const role=el('input');role.value=asset.role;role.maxLength=200;role.placeholder='填写整稿角色名，例如：阮乔';role.setAttribute('list','aw-role-names');const suggestions=el('datalist');suggestions.id='aw-role-names';data.roles.forEach(n=>{const o=el('option');o.value=n;suggestions.append(o);});form.append(suggestions);
    const audio=selectInput([['','不绑定音频'],...data.assets.filter(a=>a.mediaType==='audio').map(a=>[a.relativePath,a.displayName])],data.config.audioBindings?.[asset.role]||'');
    const field=(text,input)=>{const label=el('label','',text);label.append(input);form.append(label);input.oninput=()=>dirty=true;};field('显示名（不改磁盘文件名）',name);field('分类',categorySelect);field('所属角色（手动指定优先）',role);field('这个角色的绑定音频',audio);
    role.addEventListener('change',()=>{audio.value=data.config.audioBindings?.[role.value.trim()]||'';if(role.value.trim()&&asset.mediaType==='image'&&['pending','other'].includes(categorySelect.value))categorySelect.value='characters';});
    if(asset.mediaType==='audio')form.append(button('将此音频绑定到上面的角色',()=>{audio.value=asset.relativePath;dirty=true;}));
    form.append(el('p','aw-path',asset.relativePath),el('p','aw-info','留空角色可清除自动归组。点击保存后，下次打开仍会保留。'));
    const result=el('p');result.setAttribute('role','status');
    const save=button('保存修改',async()=>{save.disabled=true;const patch={displayName:name.value,category:categorySelect.value,role:role.value};if(role.value.trim())patch.audio=audio.value;const r=await update(asset,patch);save.disabled=false;result.textContent=r?'已保存':status.textContent;},'aw-primary');form.append(save,button('从磁盘删除此素材',async()=>{const r=await call(()=>bridge.assetDelete(root,asset.relativePath));if(r?.deleted){dirty=false;closeDrawer();await refresh(root);}},'aw-danger'),result);name.focus();
  }
  function stopAudio(){audioRequest++;if(activeAudio){activeAudio.pause();activeAudio.src='';activeAudio=null;}if(activeAudioButton){activeAudioButton.textContent=activeAudioButton.dataset.idleLabel||'▶ 播放';activeAudioButton.disabled=false;activeAudioButton=null;}}
  const groupEditor=$('.editor-panel');
  const expandGroup=button('放大编辑',()=>{
    const expanded=groupEditor.classList.toggle('aw-expanded');
    expandGroup.textContent=expanded?'退出放大':'放大编辑';
    expandGroup.setAttribute('aria-pressed',String(expanded));
    document.body.classList.toggle('aw-editing-expanded',expanded);
  },'aw-expand-group');
  expandGroup.setAttribute('aria-pressed','false');
  $('.editor-tools')?.prepend(expandGroup);
  // 重新匹配放在它作用的对象旁边：本组按钮跟着当前分组，全部按钮跟着整稿。
  $('.editor-tools')?.prepend(button('↻ 重新匹配本组',()=>rematch('current'),'ghost aw-rematch'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&groupEditor.classList.contains('aw-expanded'))expandGroup.click();});
  function renderBindings(){
    stopAudio();
    const host=$('#assets');if(!host)return;host.replaceChildren();host.className='assets aw-group-assets';
    const context=current(),key=context.segmentKey,projectRoot=root;if(!key)return;
    const effective=window.workbenchExecutionAssets?.(key)||{characters:[],scenes:[],audio:[]};
    const roles=segmentRoles(context.prompt);
    const section=(cls,title,hint)=>{const box=el('section',cls+' aw-group-column');box.append(el('b','aw-picker-title',title),el('small','aw-picker-hint',hint));const cards=el('div','aw-group-cards');box.append(cards);host.append(box);return cards;};
    const characterCards=section('aw-segment-character-picker','出场角色','按本组提示词匹配；选择本组使用的形象');
    const saved=data.config.segmentCharacterBindings?.[key]||{};
    for(const role of roles){
      const candidates=characterCandidatesFor(role,saved[role]);
      if(!candidates.length){
        const missing=el('div','aw-group-missing');
        missing.append(el('strong','',role),el('small','','拖到这里指定该角色'));
        target(missing,async asset=>{
          if(asset.mediaType!=='image')return report('出场角色只能放图片',true);
          const result=await call(()=>bridge.assetBindCharacter(projectRoot,key,role,asset.relativePath,false,false));
          if(result&&root===projectRoot){
            data.config=result.config;
            if(current().segmentKey===key){renderBindings();renderWorkbenchPrompt(context.prompt||'');}
            report(`已把 ${asset.displayName} 手动指定为视频 ${context.videoNumber} 的 ${role} 形象`);
          }
        },{exclusive:true});
        characterCards.append(missing);continue;
      }
      const row=el('label','aw-role-picker aw-media-card');row.append(el('span','aw-card-role',role));
      const excluded=saved[role]===false;
      const select=selectInput([['','自动匹配'],['__none__','本组不使用'],...candidates.map(asset=>[asset.relativePath,asset.displayName])],excluded?'__none__':(saved[role]||''));
      select.setAttribute('aria-label',role+'的本组形象');
      const preview=el('img','aw-role-preview');preview.alt=role;row.append(preview,select);
      const caption=el('small','aw-card-caption');const matchNote=el('small','aw-match-reason');row.append(caption,matchNote);
      let previewRequest=0;
      const loadPreview=async relative=>{
        const request=++previewRequest;
        if(relative==='__none__'){row.classList.add('aw-card-excluded');preview.hidden=true;caption.textContent='本组不使用';matchNote.textContent='';return;}
        row.classList.remove('aw-card-excluded');
        const match=characterMatch(role,candidates,context.prompt);
        const manual=candidates.find(a=>a.relativePath===relative);
        const asset=manual||match.asset;
        matchNote.textContent=manual?'手动指定'+(match.ranked.find(x=>x.asset===manual)?.conflicts.length?' · 与描述有冲突':''):match.reason;
        matchNote.title='依据：'+match.evidence;
        row.dataset.matchState=asset?'matched':'review';
        caption.textContent=asset?.displayName||'请选择本组形象';preview.hidden=true;
        if(!asset)return;
        const result=await call(()=>bridge.assetThumb(projectRoot,asset.relativePath));
        if(request!==previewRequest||current().segmentKey!==key||root!==projectRoot)return;
        if(result?.preview){preview.src=result.preview;preview.hidden=false;}else caption.textContent='图片不可用：'+asset.displayName;
      };
      loadPreview(select.value);
      select.onchange=async()=>{
        select.disabled=true;
        const disable=select.value==='__none__';
        const relative=disable?'':select.value;
        const result=await call(()=>bridge.assetBindCharacter(projectRoot,key,role,relative,!disable&&!relative,disable));select.disabled=false;
        if(result&&root===projectRoot){data.config=result.config;if(current().segmentKey===key){await loadPreview(select.value);renderWorkbenchPrompt(context.prompt||'');}report(disable?`视频 ${context.videoNumber} 的 ${role} 已设为本组不使用`:`已保存视频 ${context.videoNumber} 的 ${role} 形象`);}
      };
      // Removing a character only affects this group: it stops the image being
      // uploaded and @-mentioned here. Picking a version again restores it.
      row.append(cardRemove(`把 ${role} 从本组移除（不上传、不 @）`,()=>{
        if(select.value==='__none__')return;
        select.value='__none__';select.onchange();
      },()=>select.value==='__none__'));
      target(row,asset=>{if(!candidates.some(a=>a.relativePath===asset.relativePath))return report('请拖入这个角色的形象',true);select.value=asset.relativePath;select.onchange();},{exclusive:true});
      characterCards.append(row);
    }
    // 手动拖进来、提示词里没有声明的额外角色。必须显示出来——不显示就等于
    // “拖了没反应”，而它其实是会被上传的。
    for(const relative of data.config.segmentAssetBindings?.[key]?.characters||[]){
      const asset=data.assets.find(item=>item.relativePath===relative);
      if(!asset)continue;
      const name=asset.role||asset.displayName;
      if(roles.includes(name))continue;   // 已经作为声明角色渲染过了
      const card=el('div','aw-scene-row aw-media-card');
      card.append(thumbnail(asset),el('span','aw-card-role',name));
      const anchored=String(context.prompt||'').includes(name);
      const note=el('small','aw-card-caption',anchored?asset.displayName:`${asset.displayName} · 暂存，提示词里没有这个名字，本组不发送`);
      if(!anchored)card.classList.add('aw-card-unanchored');
      card.append(note);
      card.append(cardRemove(`把 ${asset.displayName} 从本组移除`,async()=>{
        const result=await call(()=>bridge.assetBind(projectRoot,key,'characters',asset.relativePath,true));
        if(result&&root===projectRoot){data.config=result.config;if(current().segmentKey===key){renderBindings();renderWorkbenchPrompt(context.prompt||'');}report(`已把 ${asset.displayName} 从视频 ${context.videoNumber} 移除`);}
      }));
      characterCards.append(card);
    }
    if(!roles.length&&!(data.config.segmentAssetBindings?.[key]?.characters||[]).length)characterCards.append(el('p','aw-group-empty','提示词中尚未识别到出场角色'));
    // 外层整栏负责添加角色；具体角色卡和缺图卡使用独立命中区。
    const dropCharacter=async asset=>{
      if(asset.mediaType!=='image')return report('出场角色只能放图片',true);
      // 拖拽不设限：先按角色名对上；对不上就补给本组还缺图的角色；再不行就用这张
      // 图自己的角色名。以前这里直接拒绝，导致“明明想拖却拖不动”。
      // 对得上提示词里声明的角色 -> 换成这张形象；对不上 -> 作为“额外出场”加入本组。
      // 以前对不上时会退而用素材自己的角色名去写绑定，但渲染和执行都只遍历本组
      // roles，那条绑定既不显示也不上传——写了个死绑定还报成功。
      const role=roles.find(item=>asset.role===item||asset.displayName===item)
        ||roles.find(item=>characterCandidates(item).some(candidate=>candidate.relativePath===asset.relativePath));
      if(!role){
        const added=await call(()=>bridge.assetBind(projectRoot,key,'characters',asset.relativePath,false));
        if(added&&root===projectRoot){
          data.config=added.config;
          if(current().segmentKey===key){renderBindings();renderWorkbenchPrompt(context.prompt||'');}
          const named=String(context.prompt||'').includes(asset.role||asset.displayName);
          report(named
            ?`已把 ${asset.displayName} 加入视频 ${context.videoNumber} 的出场角色`
            :`${asset.displayName} 已放入视频 ${context.videoNumber} 的暂存区；提示词里没有这个名字，本组不会发送它`,!named);
        }
        return;
      }
      const result=await call(()=>bridge.assetBindCharacter(projectRoot,key,role,asset.relativePath,false,false));
      if(result&&root===projectRoot){data.config=result.config;if(current().segmentKey===key){renderBindings();renderWorkbenchPrompt(context.prompt||'');}report(`已把 ${asset.displayName} 设为视频 ${context.videoNumber} 的 ${role} 形象`);}
    };
    if(characterCards.parentElement)target(characterCards.parentElement,dropCharacter);
    const sceneCards=section('aw-group-scenes','场景 / 其它','本组匹配的场景参考图');
    for(const asset of effective.scenes){
      const card=el('div','aw-scene-row aw-media-card');
      card.append(thumbnail(asset),el('span','aw-card-caption',asset.displayName));
      card.append(cardRemove(`把 ${asset.displayName} 从本组移除`,async()=>{
        const result=await call(()=>bridge.assetBind(projectRoot,key,'scenes',asset.relativePath,true));
        if(result&&root===projectRoot){data.config=result.config;if(current().segmentKey===key){renderBindings();renderWorkbenchPrompt(context.prompt||'');}report(`已把 ${asset.displayName} 从视频 ${context.videoNumber} 移除`);}
      }));
      sceneCards.append(card);
    }
    if(!effective.scenes.length)sceneCards.append(el('p','aw-group-empty','尚未匹配场景，请核对提示词中的场景名称'));
    const dropScene=async asset=>{
      if(asset.mediaType!=='image')return report('场景参考只能放图片',true);
      const result=await call(()=>bridge.assetBind(projectRoot,key,'scenes',asset.relativePath,false));
      if(result&&root===projectRoot){data.config=result.config;if(current().segmentKey===key){renderBindings();renderWorkbenchPrompt(context.prompt||'');}report(`已把 ${asset.displayName} 加入视频 ${context.videoNumber} 的场景`);}
    };
    // 场景只保留外层整栏一个拖放区，内部卡片区不再重复接收拖拽。
    if(sceneCards.parentElement)target(sceneCards.parentElement,dropScene);
    const audioCards=section('aw-segment-audio-picker','本组音频匹配','选择出场角色音色；可试听或设为不上传');
    const audioSaved=data.config.segmentAudioBindings?.[key]||{};
    for(const role of roles){
      const automatic=automaticAudio(role);
      const candidates=data.assets.filter(a=>a.mediaType==='audio'&&(rankAudioCandidates(role,data.assets).includes(a)||a.relativePath===automatic?.relativePath||a.relativePath===audioSaved[role]));
      const hasSaved=Object.hasOwn(audioSaved,role),saved=audioSaved[role];
      const row=el('div','aw-role-picker aw-audio-picker aw-media-card');row.append(el('span','aw-card-role',role));
      const select=selectInput([['__auto__',automatic?'自动匹配':'自动匹配：未找到音色'],['__none__','不上传'],...candidates.map(a=>[a.relativePath,a.displayName])],hasSaved?(saved===false?'__none__':saved):'__auto__');
      select.setAttribute('aria-label',role+'的本组音色');
      const selected=()=>select.value==='__none__'?null:select.value==='__auto__'?automatic:candidates.find(a=>a.relativePath===select.value);
      // 方块上直接写音色名（也就是你给音频文件起的角色名），不再写“试听”；
      // 点一下照样试听，播放时临时变成“■ 停止”，停下来再变回名字。
      const idleLabel=()=>{
        const asset=selected();
        if(asset)return `♪ ${asset.displayName}`;
        return select.value==='__none__'?'本组不上传':'未匹配音色';
      };
      const play=button('',async()=>{
        const asset=selected();if(!asset)return;
        stopAudio();const request=audioRequest;play.textContent='加载中…';
        const result=await call(()=>bridge.assetAudioPreview(projectRoot,asset.relativePath));
        if(request!==audioRequest||root!==projectRoot||current().segmentKey!==key)return;
        play.textContent=idleLabel();if(!result?.preview)return;
        const audio=new Audio(result.preview);activeAudio=audio;
        audio.onended=()=>{play.textContent=idleLabel();};audio.onpause=()=>{play.textContent=idleLabel();};
        try{await audio.play();play.textContent='■ 停止';}catch{report('无法播放这个音频，请检查文件格式',true);}
      },'aw-audio-play');
      play.addEventListener('click',event=>{if(play.textContent==='■ 停止'){event.stopImmediatePropagation();stopAudio();play.textContent=idleLabel();}},true);
      const caption=el('small','aw-card-caption');
      const overCap=()=>Boolean(selected())&&!effective.audio.some(item=>item.role===role);const showSelection=()=>{play.disabled=!selected();play.textContent=idleLabel();play.dataset.idleLabel=idleLabel();play.title=selected()?`点击试听 ${selected().displayName}`:'本组没有可试听的音色';row.classList.toggle('aw-card-over-cap',overCap());caption.textContent=overCap()?`超出 ${window.workbenchSegmentAudioLimit?.()||3} 个上限，本组不发送`:(selected()?.displayName||(select.value==='__none__'?'本组不上传':'未匹配音色'));};showSelection();
      row.append(play,select,caption);
      row.append(cardRemove(`本组不上传 ${role} 的音色`,()=>{
        if(select.value==='__none__')return;
        select.value='__none__';select.onchange();
      },()=>select.value==='__none__'));
      select.onchange=async()=>{
        stopAudio();play.textContent='▶ 试听';showSelection();select.disabled=true;
        const disabled=select.value==='__none__',relative=select.value==='__auto__'||disabled?'':select.value;
        const result=await call(()=>bridge.assetBindSegmentAudio(projectRoot,key,role,relative,disabled));select.disabled=false;
        if(result&&root===projectRoot){data.config=result.config;report(`已保存视频 ${context.videoNumber} 的 ${role} 音频设置`);}
      };
      audioCards.append(row);
    }
    if(!roles.length)audioCards.append(el('p','aw-group-empty','识别出场角色后可选择音色'));
  }

  // A role stored as `false` was dropped from this group; it must not reach the
  // executor as a binding, or the canvas would be asked to lock a subject that
  // has no file behind it.
  window.workbenchSegmentCharacterBindings=key=>{const bindings=data.config.segmentCharacterBindings?.[key]||{};return Object.fromEntries(Object.entries(bindings).filter(([,relative])=>relative!==false).map(([role,relative])=>{const asset=data.assets.find(item=>item.relativePath===relative);return [role,{role,relativePath:relative,displayName:asset?.displayName||role,mediaType:asset?.mediaType||'image'}]}));};
  window.workbenchAllSegmentCharacterBindings=()=>Object.fromEntries(Object.keys(data.config.segmentCharacterBindings||{}).map(key=>[key,window.workbenchSegmentCharacterBindings(key)]));
  // 一个视频组最多带 3 个音频。超过时按角色在提示词中首次出现的先后定优先级：
  // 出现得越靠前越先保留。排序必须稳定，同一组每次算出来的结果要一致。
  // 重新匹配：先重扫素材（服务端会重跑场景自动匹配），再按各组最新的人物声明
  // 清掉已经不出场的角色残留的形象/音色绑定。只删不再出场的那些，手动选过的
  // 形象只要人还在场就原样保留。
  async function rematch(scope){
    const projectRoot=root;
    if(!projectRoot)return report('尚未打开项目', true);
    const all=window.workbenchAllSegments?.()||[];
    const here=current();
    const targets=scope==='all'?all:all.filter(item=>item.segmentKey===here.segmentKey);
    if(!targets.length)return report(scope==='all'?'队列里还没有分镜':'请先在左侧选择一个视频组', true);
    report(scope==='all'?`正在重新匹配全部 ${targets.length} 组…`:`正在重新匹配视频 ${here.videoNumber}…`);
    await refresh(projectRoot);
    if(root!==projectRoot)return;
    let removed=0;
    for(const target of targets){
      const keep=new Set(segmentRoles(target.prompt));
      for(const [role] of Object.entries(data.config.segmentCharacterBindings?.[target.segmentKey]||{})){
        if(keep.has(role))continue;
        const result=await call(()=>bridge.assetBindCharacter(projectRoot,target.segmentKey,role,'',true,false));
        if(result){data.config=result.config;removed+=1;}
      }
      for(const [role] of Object.entries(data.config.segmentAudioBindings?.[target.segmentKey]||{})){
        if(keep.has(role))continue;
        const result=await call(()=>bridge.assetBindSegmentAudio(projectRoot,target.segmentKey,role,'',false));
        if(result){data.config=result.config;removed+=1;}
      }
    }
    if(root!==projectRoot)return;
    renderBindings();renderWorkbenchPrompt(current().prompt||'');
    report(scope==='all'
      ? `已重新匹配 ${targets.length} 组；清除了 ${removed} 条已不出场角色的绑定`
      : `已重新匹配视频 ${here.videoNumber}；清除了 ${removed} 条已不出场角色的绑定`);
  }
  window.workbenchRematchAssets=rematch;
  // “谁在这一组出场”必须看本组的人物声明行，不能拿角色名去全文里搜。
  // 提示词里出现名字的地方很多，例如“继承状态：周鸣与宾客乙已离场。”——
  // 全文包含匹配会把已经离场的人也算成出场角色，进而上传错误的形象图并多 @ 一个人。
  function declaredRoleNames(prompt){
    const split=text=>String(text).split(/[、，,；;／/|｜]/).map(x=>x.trim())
      .filter(x=>x&&x.length<40&&!/^(无|若干|暂无|多人|等)$/.test(x));
    const names=[];let inBlock=false;
    for(const raw of String(prompt||'').split('\n')){
      const line=raw.trim();
      if(/^【[^】]*出场人物[^】]*】/.test(line)||/^\[出场人物\]/.test(line)){inBlock=true;continue;}
      if(inBlock){
        // 空行不结束【出场人物】小节；下一个【…】小节才结束。
        if(!line)continue;
        if(!/^【[^】]*】/.test(line)){
          // 模板有两种写法：一行一个角色“何诞（人形）：开镜在场｜…”，
          // 取冒号前那段；或者一行列出全部“荷包蛋、宋柏峰”，按分隔符切开。
          const head=line.split(/[：:]/)[0].trim();
          if(head&&head!==line&&head.length<40)names.push(head);
          else names.push(...split(line));
          continue;
        }
        inBlock=false;
      }
      // 只认行首或分隔符后紧跟的“人物：/角色：”声明；“角色站位：”“继承状态：”不算。
      const match=line.match(/(?:^|[|｜])\s*(?:人物|角色)\s*[：:]\s*([^|｜]+)/);
      if(match)names.push(...split(match[1]));
    }
    return names;
  }
  // 手动在提示词里打的 @ 是最强的“这个人在本组出场”的声明——比【出场人物】小节
  // 还明确。但执行器真正的 @ 只来自 lockedImages/lockedAudio 清单，正文里的
  // “@小满”只是一段普通文字：图片不会上传，也不会变成画布上真正的 @。
  // 所以这里必须把手动 @ 的角色一起算进出场角色，它才会进入发送清单。
  function atMentionNames(prompt){
    return [...String(prompt||'').matchAll(/@\s*([^\s@，。；;：:、|｜（(]+)/g)]
      .map(match=>match[1].trim()).filter(Boolean);
  }
  // 素材名等于目标名，或以目标名开头且紧跟版本分隔符（妹妹女主_upscayl… ← 妹妹女主）。
  // 素材名常带编号前缀（C02 胡副局、S01 妖管局大门口）：比对前先剥掉。
  function nameMatchesAsset(displayName,name){const raw=String(displayName||'').normalize('NFKC').trim(),a=stripAssetCode(raw),b=String(name||'').normalize('NFKC').trim();const hit=v=>v===b||(v.startsWith(b)&&/^[-_\s·（(【.]/u.test(v.slice(b.length)));return Boolean(b)&&(hit(raw)||hit(a));}
  const ASSET_CODE_PREFIX=/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u;
  const stripAssetCode=value=>String(value||'').normalize('NFKC').trim().replace(ASSET_CODE_PREFIX,'');
  // 多个前缀命中时取后缀最短（名字最接近）的那张；并列最短视为歧义，返回全部。
  function closestAssets(list,name){if(list.length<2)return list;const len=a=>String(a.displayName||'').normalize('NFKC').length;const sorted=[...list].sort((x,y)=>len(x)-len(y));return len(sorted[0])<len(sorted[1])?[sorted[0]]:list;}
  function segmentRoles(prompt){
    const known=[...new Set(data.roles.filter(Boolean))];
    const picked=[];
    for(const name of [...declaredRoleNames(prompt),...atMentionNames(prompt)]){
      if(known.includes(name)){picked.push(name);continue;}
      // 声明里可能带修饰，例如“荷包蛋（猫形）”；用已知角色名做最长前缀匹配。
      const prefix=known.filter(role=>name.startsWith(role)).sort((a,b)=>b.length-a.length)[0];
      if(prefix)picked.push(prefix);else if(declaredRoleNames(prompt).includes(name)){const alias=String(prompt).split('\n').find(line=>line.trim().startsWith(name+'：')||line.trim().startsWith(name+':'))?.match(/资产\s*【([^】]+)】/)?.[1];if(data.assets?.some(asset=>asset.mediaType==='image'&&[name,alias].filter(Boolean).some(value=>nameMatchesAsset(asset.displayName,value)))||Object.values(data.config?.segmentCharacterBindings||{}).some(bindings=>bindings[name]))picked.push(name);}
    }
    if(picked.length)return [...new Set(picked)].sort((a,b)=>b.length-a.length);
    // 没有人物声明行的老整稿：退回全文匹配，至少不比改之前差。
    return [...new Set(known.filter(role=>String(prompt||'').includes(role)))].sort((a,b)=>b.length-a.length);
  }
  window.workbenchSegmentRoles=prompt=>segmentRoles(prompt);
  // 出场人物声明里的名字常常带括号后缀：“何诞（人形）”“龙套下属若干（功能性
  // 群体）”，而素材叫“何诞·初化人形睡衣”“龙套下属”。以前这里要求角色名和素材
  // 名严格相等，两边一个都对不上，于是候选为空——界面画成“尚未匹配角色图片”，
  // 服装优先级匹配也根本没机会跑。
  //
  // 先按严格相等找；找不到就去掉括号后缀，再按两个方向的前缀匹配：素材名以
  // 角色名开头（何诞·… ← 何诞），或角色名以素材名开头（龙套下属若干 ← 龙套下属）。
  function characterCandidates(role,prompt=current().prompt){
    const images=data.assets.filter(asset=>asset.mediaType==='image'&&(['characters','groups'].includes(asset.kind)||asset.displayName===String(role||'').trim()||asset.role===String(role||'').trim()));
    const name=String(role||'').trim();
    if(!name)return [];
    const alias=String(prompt||'').split('\n').find(line=>line.trim().startsWith(name+'：')||line.trim().startsWith(name+':'))?.match(/资产\s*【([^】]+)】/)?.[1];
    if(alias){const exactAlias=data.assets.filter(asset=>asset.mediaType==='image'&&String(asset.displayName||'').normalize('NFKC')===alias.normalize('NFKC'));if(exactAlias.length)return exactAlias;const prefixAlias=closestAssets(data.assets.filter(asset=>asset.mediaType==='image'&&nameMatchesAsset(asset.displayName,alias)),alias);if(prefixAlias.length)return prefixAlias;}
    const named=images.filter(asset=>{const token=String(asset.displayName||'').replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');return new RegExp('@'+token+'(?=$|[\\s，。；;：:、|｜])').test(String(prompt||''))&&(asset.role===name||String(asset.displayName||'').startsWith(name));});if(named.length===1)return named;
    const exact=images.filter(asset=>asset.role===name||asset.displayName===name);
    // Include this role's named variants even when a plain default exists.
    const base=name.replace(/[（(].*$/,'').trim();
    if(!base)return [];
    const strict=images.filter(asset=>{
      const display=String(asset.displayName||'');
      return exact.includes(asset)||asset.role===base||display===base||display.startsWith(base)||
        base.startsWith(display)||(asset.role&&base.startsWith(asset.role));
    });
    if(strict.length)return strict;
    // 严格规则落空时按相似度兜底：角色名作为完整词段出现在素材名里
    //（C02 胡副局、场景_胡副局_日景 ← 胡副局），按角色名长度占素材名
    // 长度的比例打分，只取并列最高的那几张，分数低的直接排除。
    const sep=/[-_\s·（(【.、]/u;
    const scored=images.map(asset=>{
      const a=String(asset.displayName||'').normalize('NFKC').replace(/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u,'').trim();
      const at=a.indexOf(base);if(at<0)return null;
      const before=at===0||sep.test(a[at-1]),after=at+base.length===a.length||sep.test(a[at+base.length]);
      return before&&after?{asset,score:base.length/a.length}:null;
    }).filter(Boolean).sort((x,y)=>y.score-x.score);
    return scored.filter(x=>x.score===scored[0]?.score).map(x=>x.asset);
  }
  // 手动绑定过的图必须永远在候选里：否则界面会把你刚拖进去的图说成“未匹配”。
  function characterCandidatesFor(role,boundPath){
    const bound=boundPath&&data.assets.find(asset=>asset.relativePath===boundPath);
    const candidates=characterCandidates(role);
    if(bound&&!candidates.some(asset=>asset.relativePath===bound.relativePath))return [bound,...candidates];
    return candidates;
  }
  // Structured clues are taken from this role's declaration, never the whole screenplay.
  function autoCharacterAsset(role,candidates,prompt){return characterMatch(role,candidates,prompt).asset;}
  function characterMatch(role,candidates,prompt){
    const clean=s=>String(s||'').normalize('NFKC').replace(/@/g,'').trim();
    const base=clean(role).replace(/\(.*$/,'').trim();
    const escaped=base.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
    const text=clean(prompt), section=text.match(/【出场人物】([\s\S]*?)(?=\n\s*【|$)/)?.[1]||text;
    const declaration=new RegExp('^\\s*'+escaped+'(?:\\([^)]*\\))?\\s*[：:]');
    const lines=section.split('\n');let own='',active=false;
    for(const line of lines){
      if(declaration.test(line)){active=true;own+=' '+line;continue;}
      if(active&&/^\s*[^：:|｜]{1,35}[：:]/.test(line))active=false;
      if(active)own+=' '+line;
    }
    const evidence=own.trim()||clean(role);
    const tags=value=>{
      const s=clean(value);
      return {
        age:[...s.matchAll(/(\d{1,3})\s*岁/g)].map(m=>m[1]),
        era:[...s.matchAll(/(?:[一二两三四五六七八九十\d]+年前|现在|当前时间)/g)].map(m=>m[0].replace('两','二').replace('现在','当前时间')),
        form:['人形','猫形','兽形'].filter(x=>s.includes(x)),
        clothes:['睡衣','礼服','西装','校服','卫衣','常服','外套','婚服','军装'].filter(x=>s.includes(x))
      };
    };
    const wanted=tags(evidence);
    const ranked=candidates.map(asset=>{
      const name=clean(asset.displayName).replace(/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u,''), suffix=name.startsWith(base)?name.slice(base.length):name;
      const found=tags(suffix), conflicts=[],hits=[];
      for(const field of ['age','era','form','clothes']){
        if(wanted[field].length&&found[field].length&&!wanted[field].some(x=>found[field].includes(x)))conflicts.push(({age:'年龄',era:'年代',form:'形态',clothes:'服装'})[field]+'冲突');
        for(const tag of found[field])if(wanted[field].includes(tag))hits.push(tag);
      }
      // Conflicting states within one declaration need a human choice too.
      if(new Set(wanted.age).size>1||new Set(wanted.era).size>1||wanted.form.length>1)conflicts.push('本组描述包含多个时期或形态');
      return {asset,conflicts,hits,score:hits.length,default:name===base};
    });
    const safe=ranked.filter(x=>!x.conflicts.length).sort((a,b)=>b.score-a.score);
    let winner,reason;
    if(safe[0]?.score>0&&safe[0].score>(safe[1]?.score||0)){winner=safe[0];reason='命中：'+winner.hits.join('、');}
    else {
      const defaults=safe.filter(x=>x.default);
      if(defaults.length===1&&!safe[0]?.score){winner=defaults[0];reason='使用默认形象';}
      else if(safe.length===1){winner=safe[0];reason='仅有一套无冲突形象';}
    }
    if(!winner)reason=ranked.length?'待核对：'+(safe.length?'多套形象缺少明确区分': [...new Set(ranked.flatMap(x=>x.conflicts))].join('、')):'尚未匹配角色图片';
    return {asset:winner?.asset,reason,evidence,ranked};
  }
  window.workbenchAutoCharacterAsset=(role,candidates,prompt)=>autoCharacterAsset(role,candidates,prompt);
  const MAX_SEGMENT_AUDIO=3;
  function limitSegmentAudio(audio,prompt){
    const text=String(prompt||'');
    const rank=asset=>{const at=text.indexOf(String(asset?.role||''));return at<0?Number.MAX_SAFE_INTEGER:at;};
    return [...audio]
      .map((asset,index)=>({asset,index,at:rank(asset)}))
      .sort((a,b)=>a.at-b.at||a.index-b.index)
      .slice(0,MAX_SEGMENT_AUDIO)
      .map(item=>item.asset);
  }
  window.workbenchSegmentAudioLimit=()=>MAX_SEGMENT_AUDIO;
  window.workbenchExecutionAssets=(key,explicitPrompt)=>{
    // Resolve this group's own prompt even when another group is selected.
    const context=(window.workbenchAllSegments?.()||[]).find(item=>item.segmentKey===key);
    const prompt=String(explicitPrompt ?? context?.prompt ?? (current().segmentKey===key?current().prompt:'') ?? '');
    const roles=segmentRoles(prompt);
    const saved=data.config.segmentCharacterBindings?.[key]||{};
    const characters=[],characterReviews=[];
    for(const role of roles){
      // `false` means the group explicitly dropped this character: no upload
      // and no @ mention, the same contract segmentAudioBindings uses.
      if(saved[role]===false)continue;
      const relative=saved[role];
      const asset=(relative&&data.assets.find(item=>item.relativePath===relative))
        ||autoCharacterAsset(role,characterCandidates(role,prompt),prompt);
      if(asset)characters.push({...asset,role});
      else if(characterCandidates(role,prompt).length)characterReviews.push(role+'：'+characterMatch(role,characterCandidates(role),prompt).reason);
    }
    // 手动拖进出场角色区的额外角色。名字在提示词里找得到才算数——有锚点才能
    // @，也才谈得上“这个人在本组出场”。找不到锚点的只是暂存在工作台里等你处理
    // （多半是拖错了），绝不上传：白占一个附件位，还可能干扰生成结果。
    for(const relative of data.config.segmentAssetBindings?.[key]?.characters||[]){
      const asset=data.assets.find(item=>item.relativePath===relative);
      if(!asset||characters.some(item=>item.relativePath===relative))continue;
      const name=asset.role||asset.displayName;
      if(!prompt.includes(name))continue;
      characters.push({...asset,role:name});
    }
    const scenePaths=data.config.segmentAssetBindings?.[key]?.scenes||[];
    const scenes=scenePaths.map(relative=>data.assets.find(item=>item.relativePath===relative)).filter(Boolean);
    const savedAudio=data.config.segmentAudioBindings?.[key]||{};
    const audio=roles.map(role=>{
      if(Object.hasOwn(savedAudio,role)&&savedAudio[role]===false)return null;
      const relative=Object.hasOwn(savedAudio,role)?savedAudio[role]:data.config.audioBindings?.[role];
      let asset=relative&&data.assets.find(item=>item.relativePath===relative&&item.mediaType==='audio');
      if(!asset){
        asset=automaticAudio(role);
      }
      return asset?{...asset,role}:null;
    }).filter(Boolean);
    for(const asset of data.assets){const name=String(asset.displayName||'');if(!name)continue;const token=new RegExp('@'+name.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')+'(?=$|[\\s，。；;：:、|｜])').exec(prompt);if(!token)continue;const line=prompt.slice(prompt.lastIndexOf('\n',token.index)+1,prompt.indexOf('\n',token.index)<0?undefined:prompt.indexOf('\n',token.index));const voice=/声线|音色|声音/.test(line);if(voice&&asset.mediaType!=='audio')continue;
      const unique=data.assets.filter(item=>item.displayName===name&&(voice?item.mediaType==='audio':true));const chosen=saved[name]||savedAudio[name];if(unique.length!==1&&chosen!==asset.relativePath)continue;
      if(asset.mediaType==='audio'){if(savedAudio[name]===false)continue;if(!audio.some(item=>item.relativePath===asset.relativePath))audio.push({...asset,role:name});}else if(asset.mediaType==='image'){if(saved[asset.role||name]===false||saved[name]===false)continue;const list=['characters','groups'].includes(asset.kind)?characters:scenes;if(!list.some(item=>item.relativePath===asset.relativePath))list.push({...asset,role:name});}}
    const sentAudio=limitSegmentAudio(audio,prompt);
    const excluded=[],issues=[...characterReviews],notes=[];
    for(const role of roles){
      if(saved[role]===false)excluded.push({role,kind:'image',reason:'本组不使用'});
      else if(!characters.some(asset=>asset.role===role)&&!characterReviews.some(text=>text.startsWith(role+'：')))issues.push(role+'：未匹配角色图片');
      if(saved[role] && !data.assets.some(asset=>asset.relativePath===saved[role]))issues.push(role+'：指定的图片文件已不存在');
      if(savedAudio[role]===false)excluded.push({role,kind:'audio',reason:'本组不使用'});
      else if(!audio.some(asset=>asset.role===role))notes.push(role+'：尚无音频，如本组需要音色请先绑定');
      if(savedAudio[role] && !data.assets.some(asset=>asset.relativePath===savedAudio[role]))issues.push(role+'：指定的音频文件已不存在');
    }
    for(const role of declaredRoleNames(prompt)){
      if(!roles.some(name=>role.startsWith(name)))issues.push(role+'：人物声明未匹配项目角色');
    }
    for(const relative of scenePaths)if(!scenes.some(asset=>asset.relativePath===relative))issues.push('场景文件已不存在：'+relative);
    for(const asset of audio)if(!sentAudio.some(item=>item.role===asset.role))excluded.push({...asset,kind:'audio',reason:'超出本组 '+MAX_SEGMENT_AUDIO+' 个音频上限'});
    for(const relative of data.config.segmentAssetBindings?.[key]?.characters||[]){
      if(!characters.some(asset=>asset.relativePath===relative))excluded.push({...data.assets.find(asset=>asset.relativePath===relative),relativePath:relative,kind:'image',reason:'提示词没有对应人物锚点，暂存未发送'});
    }
    return {characters,scenes,audio:sentAudio,characterReviews,reviewIssues:[...new Set(issues)],reviewNotes:notes,excluded};
  };
  window.renderProjectAssetIndex=refresh;
  window.addEventListener('workbench:segment-selected',()=>{renderBindings();renderWorkbenchPrompt(current().prompt||'');});
  window.addEventListener('workbench:source-updated',()=>{renderBindings();renderWorkbenchPrompt(current().prompt||'');if(sourceText?.value.trim()&&sourceVisual){sourceText.hidden=true;sourceVisual.hidden=false;renderWorkbenchPrompt(sourceText.value,sourceVisual);}});
  $('#parseProject').addEventListener('click',()=>refresh(current().root));
  let timer;$('#sourceText').addEventListener('input',()=>{clearTimeout(timer);if(sourceVisual&&document.activeElement===sourceVisual)return;timer=setTimeout(()=>refresh(current().root),700);});sourceVisual?.addEventListener('blur',()=>{clearTimeout(timer);timer=setTimeout(()=>refresh(current().root),700);});
  const runCurrent=button('执行单组',()=>window.workbenchRunCurrent?.(),'aw-run-button');runCurrent.id='runCurrent';document.querySelector('.editor-tools')?.prepend(runCurrent);
  const runAll=button('全部执行',()=>window.workbenchRunAll?.(),'aw-run-button');runAll.id='runAll';document.querySelector('.activity-actions')?.prepend(runAll);
})();
