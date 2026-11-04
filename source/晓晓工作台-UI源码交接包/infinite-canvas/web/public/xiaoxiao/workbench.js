(() => {
  const $ = s => document.querySelector(s);
  const state = { project: {source:'', segments:[]}, selected:null, running:false, paused:false, started:0, mode:'queue', prefixTemplate:'使用Seedance 2.0生成16:9横屏视频，以下提示词的全部内容你都要一比一全部复制粘贴使用，提示词内容：', draftPrefix:'使用Seedance 2.0生成16:9横屏视频，以下每个视频的提示词的全部内容你都要一比一全部复制粘贴使用，根据视频的编号割视频提示词，1个编号代表生成一个视频，每个视频的人物场景主体都要精准锁定我@的主体，现在是要生成x个视频，分别是视频编号x、视频编号x、视频编号x，现在开始执行任务：' };
  state.project.projectPath = state.project.projectPath || '';
  state.project.assetFolders = state.project.assetFolders || {};
  const saved = localStorage.getItem('jimeng-workbench-project');
  if (saved) { try { Object.assign(state.project, JSON.parse(saved)); } catch (_) {} }
  if (typeof state.project.prefixTemplate === 'string') state.prefixTemplate = state.project.prefixTemplate;
  // The workbench now has one execution model: every video group is sent as
  // its own Agent task.  Older projects can still contain mode:"draft" from
  // the removed whole-draft UI; carrying that value forward made "全部执行"
  // silently collapse to group 01.
  state.mode = 'queue';
  state.project.mode = 'queue';
  if (saved) localStorage.setItem('jimeng-workbench-project', JSON.stringify(state.project));
  const log = (message, type='ok') => { const row=document.createElement('div'); row.className='log '+(type==='error'?'error':''); row.innerHTML=`<b>${new Date().toLocaleTimeString()}</b>${message}`; $('#logs').prepend(row); const logs=JSON.parse(localStorage.getItem('jimeng-workbench-logs')||'[]'); logs.unshift({message,type,time:Date.now()}); localStorage.setItem('jimeng-workbench-logs',JSON.stringify(logs.slice(0,100))); };
  // React surfaces (the /jimeng storyboard page) refresh from this event plus a
  // 1s poll while a batch runs.
  const notify=()=>window.dispatchEvent(new CustomEvent('workbench:state-changed'));
  function splitSourceSegments(source) {
    const lines = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map(line => /^[ \t]*(?:\\?\x60){3,}/.test(line) ? line.replace(/\\(?=\x60)/g, '') : line);
    const fenceMark = /^[ \t]*(\x60{3,}|~{3,})(.*)$/;
    let start = 0, end = lines.length, level = 0, fence = '';
    // Only the third section contains importable video prompts; ignore headings inside code blocks.
    for (const [i, line] of lines.entries()) {
        const mark = fenceMark.exec(line);
        if (mark) {
            if (!fence)
                fence = mark[1];
            else if (mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim())
                fence = '';
            continue;
        }
        if (fence)
            continue;
        const heading = /^[ \t]{0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
        if (!heading)
            continue;
        if (!level && /^第[三3]部分\s*[:：]\s*纯视频生成提示词\s*$/.test(heading[2].replace(/\*/g, '').replace(/\s+#+\s*$/, '').trim())) {
            start = i + 1;
            level = heading[1].length;
        }
        else if (level && heading[1].length <= level) {
            end = i;
            break;
        }
    }
    const scoped = lines.slice(start, end), blocks = [], plain = [];
    let language = '', body = [], hasFences = false;
    fence = '';
    for (const line of scoped) {
        const footer = /^\s*#{1,6}\s+(?:想请你确认|请你确认|请确认|补充说明|附录)(?:\s|$|[:：])/.test(line);
        if (footer && (!fence || /^\s*---+\s*$/.test(body.filter(l => l.trim()).at(-1) || '')))
            break;
        const mark = fenceMark.exec(line);
        if (!fence) {
            if (mark) {
                fence = mark[1];
                language = mark[2].trim();
                body = [];
                hasFences = true;
            }
            else
                plain.push(line);
            continue;
        }
        if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) {
            if (/^(?:plaintext|plain|text|txt|prompt)?$/i.test(language))
                blocks.push(body.join('\n'));
            fence = '';
        }
        else
            body.push(line);
    }
    if (fence && /^(?:plaintext|plain|text|txt|prompt)?$/i.test(language) && body.length)
        blocks.push(body.join('\n').replace(/\n[ \t]*(?:---+|\*\*\*+)[ \t]*$/, ''));
    const sources = hasFences ? blocks : [plain.filter(line => !/^\s*(?:\*{0,2}#{1,6}\s*|\*{2}\s*)第\d+(?:集第\d+)?组/.test(line)).join('\n')];
    return sources.flatMap(source => {
        const normalized = source.trim(), videos = [...normalized.matchAll(/^[ \t]*【?[ \t]*视频编号[ \t]*[:：]?[ \t]*([Vv]?\d+(?:-\d+)*)[^\n]*/gm)];
        if (!videos.length)
            return [];
        const specs = [...normalized.matchAll(/^[ \t]*【项目规格】/gm)].map(match => match.index);
        // Retain the specifications-before-number layout used by older plain-text prompts.
        const boundaries = specs.length && specs[0] < videos[0].index ? specs : videos.map(match => match.index);
        return boundaries.map((begin, index) => {
            const prompt = normalized.slice(begin, boundaries[index + 1] ?? normalized.length).trim().replace(/\n[ \t]*---+[ \t]*$/, '').trim();
            const match = /^[ \t]*【?[ \t]*视频编号[ \t]*[:：]?[ \t]*([Vv]?\d+(?:-\d+)*)[^\n]*/m.exec(prompt);
            return match ? { id: match[1], prompt } : null;
        }).filter((item) => Boolean(item));
    });
}
// 不同模板声明场景的位置不一样：有的写在首行表头“｜场景：庄园花丛｜”，有的只
// 不同模板声明场景的位置不一样：有的写在首行表头“｜场景：庄园花丛｜”，有的只
  function parseSource(source) {
    return splitSourceSegments(source).map(({id,prompt})=>({id,name:(prompt.match(/^[ \t]*【?[^\n]*视频编号[^\n]*/m)||["视频 "+id])[0].replace(/[【】]/g,""),prompt,assets:[...[...prompt.matchAll(/(?:场景图|场景图片|参考图)[：:]?\s*([^\s，。；;]+)/g)].map(match=>({type:"image",name:match[1]})),...[...prompt.matchAll(/(?:音频|配音)[：:]?\s*([^\s，。；;]+)/g)].map(match=>({type:"audio",name:match[1]}))],status:"ready",selected:true,error:""}));
  }
  function renderQueue(){ const q=$('#queue'); q.innerHTML=''; state.project.segments.forEach((s,i)=>{const scene=sceneNameOf(s);const item=document.createElement('div');item.className='queue-item '+(state.selected===i?'active':'');item.innerHTML=`<span class="num">${s.id}</span><div><strong>视频 ${s.id}</strong><small>${scene} · ${s.status==='done'?'已完成':s.status==='error'?'执行失败':'待准备'} · ${s.prompt.length} 字</small></div><span class="dot ${s.status==='done'?'done':s.status==='error'?'error':state.selected===i?'running':''}"></span>`; item.onclick=()=>selectSegment(i); const mark=document.createElement('button');mark.type='button';mark.className='queue-mark'+(s.marked?' on':'');mark.textContent=s.marked?'★':'☆';mark.title=s.marked?`取消视频 ${s.id} 的标记`:`标记视频 ${s.id}`;mark.setAttribute('aria-pressed',String(Boolean(s.marked)));mark.setAttribute('aria-label',`标记视频 ${s.id}`);mark.onclick=event=>{event.stopPropagation();s.marked=!s.marked;renderQueue();persist();log(s.marked?`已标记视频 ${s.id}`:`已取消视频 ${s.id} 的标记`,'ok');};item.append(mark); const drop=document.createElement('button');drop.type='button';drop.className='queue-remove';drop.textContent='×';drop.title=`删除视频 ${s.id}（会从整稿中移除这一组）`;drop.setAttribute('aria-label',`删除视频 ${s.id}`);drop.disabled=queueBusy();drop.onclick=event=>{event.stopPropagation();deleteSegment(i);};item.append(drop);q.append(item)}); const marked=state.project.segments.filter(segment=>segment.marked).length;$('#segmentCount').textContent=marked?`${state.project.segments.length} 组 · ★${marked}`:`${state.project.segments.length} 组`; const done=state.project.segments.filter(s=>s.status==='done').length; const total=state.project.segments.length; $('#queueStat').textContent=total?`已完成 ${done} / 可执行 ${total}`:'未解析'; $('#queuePercent').textContent=total?`${Math.round(done/total*100)}%`:'0%'; $('#queueProgress').style.width=total?`${done/total*100}%`:'0%'; const selected=$('#selectedCount');if(selected)selected.textContent=`已选择 ${state.project.segments.filter(s=>s.selected).length} 段`; const reset=$('#resetQueue');if(reset){const busy=queueBusy();reset.disabled=busy||!total;reset.title=busy?'批次正在执行，请先停止再重置':total?'把全部分镜恢复为待准备，从第 1 组重新开始':'尚未解析出分镜';} renderRangePickers();renderEpisodes(); notify(); }
  // A single group started with 执行单组 does not set state.running, but it is
  // just as unsafe to reset underneath: the executor may already have clicked
  // send and be waiting for the real debit.
  function queueBusy(){return Boolean(state.running)||state.project.segments.some(segment=>segment.status==='running');}
  // 分集：每一集只换提示词整稿和由它解析出来的视频组队列，项目资产（人物、
  // 场景、音色）是整个项目共用的，不随集切换。
  //
  // 分镜绑定是按 segmentKey 存的，而 key 里只有视频编号和下标——两集都有
  // “视频编号01”时会撞到同一条绑定上。所以第二集起的 key 前面加集号前缀；
  // 第一集沿用旧格式，老项目已经存下的绑定原样有效，不需要迁移。
  function ensureEpisodes(){
    const project=state.project;
    if(!Array.isArray(project.episodes)||!project.episodes.length){
      project.episodes=[{id:'ep1',name:'第1集',source:project.source||'',segments:project.segments||[]}];
      project.activeEpisodeId='ep1';
    }
    if(!project.episodes.some(item=>item.id===project.activeEpisodeId)){
      project.activeEpisodeId=project.episodes[0].id;
    }
    return project.episodes;
  }
  function activeEpisode(){ensureEpisodes();return state.project.episodes.find(item=>item.id===state.project.activeEpisodeId)||state.project.episodes[0];}
  function episodeKeyPrefix(){
    ensureEpisodes();
    const first=state.project.episodes[0]?.id;
    const active=state.project.activeEpisodeId;
    return !active||active===first?'':`ep:${active}:`;
  }
  window.workbenchEpisodeKeyPrefix=()=>episodeKeyPrefix();
  // 把当前正在编辑的整稿和队列写回所属的那一集。
  function syncActiveEpisode(){
    const episode=activeEpisode();
    if(!episode)return;
    episode.source=state.project.source;
    episode.segments=state.project.segments;
  }
  function renderEpisodes(){
    ensureEpisodes();
    const select=$('#episodeSelect');if(!select)return;
    const busy=queueBusy();
    select.replaceChildren();
    for(const episode of state.project.episodes){
      const option=document.createElement('option');
      option.value=episode.id;option.textContent=episode.name;
      select.append(option);
    }
    select.value=state.project.activeEpisodeId;
    select.disabled=busy;
    $('#addEpisode').disabled=busy;
    $('#renameEpisode').disabled=busy;
    $('#deleteEpisode').disabled=busy||state.project.episodes.length<=1;
    $('#deleteEpisode').title=state.project.episodes.length<=1?'至少保留一集':'删除本集及其整稿与队列';
  }
  function switchEpisode(id){
    if(queueBusy()){log('批次正在执行，请先点“停止当前操作”再切换分集','error');return {ok:false,error:'批次正在执行'};}
    ensureEpisodes();
    const target=state.project.episodes.find(item=>item.id===id);
    if(!target)return {ok:false,error:'分集不存在'};
    if(target.id===state.project.activeEpisodeId)return {ok:true,unchanged:true};
    syncActiveEpisode();
    state.project.activeEpisodeId=target.id;
    state.project.source=target.source||'';
    state.project.segments=Array.isArray(target.segments)?target.segments:[];
    $('#sourceText').value=state.project.source;
    state.selected=state.project.segments.length?0:null;
    renderEpisodes();renderQueue();
    if(state.selected!==null)selectSegment(state.selected);
    persist();
    window.dispatchEvent(new Event('workbench:source-updated'));
    log(`已切换到 ${target.name}：${state.project.segments.length} 个视频组`,'ok');
    return {ok:true,id:target.id,name:target.name};
  }
  function addEpisode(){
    if(queueBusy()){log('批次正在执行，请先点“停止当前操作”再新增分集','error');return {ok:false,error:'批次正在执行'};}
    ensureEpisodes();
    syncActiveEpisode();
    const used=new Set(state.project.episodes.map(item=>item.id));
    let index=state.project.episodes.length+1;
    while(used.has(`ep${index}`))index+=1;
    // 默认名按“第几集”顺延；重名时继续往后找，重命名之后也不会被占用。
    const names=new Set(state.project.episodes.map(item=>item.name));
    let ordinal=state.project.episodes.length+1;
    while(names.has(`第${ordinal}集`))ordinal+=1;
    const episode={id:`ep${index}`,name:`第${ordinal}集`,source:'',segments:[]};
    state.project.episodes.push(episode);
    state.project.activeEpisodeId=episode.id;
    state.project.source='';state.project.segments=[];
    $('#sourceText').value='';
    state.selected=null;
    renderEpisodes();renderQueue();persist();
    window.dispatchEvent(new Event('workbench:source-updated'));
    log(`已新增 ${episode.name}；请在整稿提示词里粘贴本集内容`,'ok');
    return {ok:true,id:episode.id,name:episode.name};
  }
  function renameEpisode(nextName,{prompt:ask=window.prompt}={}){
    ensureEpisodes();
    const episode=activeEpisode();
    const value=String(nextName??ask('给这一集起个名字', episode.name)??'').trim();
    if(!value)return {ok:false,cancelled:true};
    if(state.project.episodes.some(item=>item.id!==episode.id&&item.name===value)){
      log(`已经有一集叫“${value}”了`,'error');return {ok:false,error:'名称重复'};
    }
    episode.name=value;
    renderEpisodes();persist();
    log(`本集已改名为 ${value}`,'ok');
    return {ok:true,name:value};
  }
  function deleteEpisode({confirmDelete=window.confirm}={}){
    if(queueBusy()){log('批次正在执行，请先点“停止当前操作”再删除分集','error');return {ok:false,error:'批次正在执行'};}
    ensureEpisodes();
    if(state.project.episodes.length<=1){log('至少保留一集','error');return {ok:false,error:'至少保留一集'};}
    const episode=activeEpisode();
    const sent=(episode.segments||[]).filter(segment=>segment.status==='done').length;
    if(!confirmDelete(`删除 ${episode.name}？

这一集的整稿和 ${(episode.segments||[]).length} 个视频组都会被移除。
`+
      (sent?`其中 ${sent} 组已经发送过；删除不会撤回已经提交到即梦的任务。
`:'')+
      '项目资产不受影响。'))return {ok:false,cancelled:true};
    const index=state.project.episodes.findIndex(item=>item.id===episode.id);
    state.project.episodes.splice(index,1);
    const next=state.project.episodes[Math.max(0,index-1)];
    state.project.activeEpisodeId=next.id;
    state.project.source=next.source||'';
    state.project.segments=Array.isArray(next.segments)?next.segments:[];
    $('#sourceText').value=state.project.source;
    state.selected=state.project.segments.length?0:null;
    renderEpisodes();renderQueue();
    if(state.selected!==null)selectSegment(state.selected);
    persist();
    window.dispatchEvent(new Event('workbench:source-updated'));
    log(`已删除 ${episode.name}，当前为 ${next.name}`,'ok');
    return {ok:true,remaining:state.project.episodes.length};
  }
  window.workbenchEpisodes=()=>({episodes:state.project.episodes.map(item=>({id:item.id,name:item.name,groups:(item.segments||[]).length})),activeId:state.project.activeEpisodeId});
  window.workbenchAddEpisode=()=>addEpisode();
  window.workbenchSwitchEpisode=id=>switchEpisode(id);
  window.workbenchRenameEpisode=(name,options)=>renameEpisode(name,options||{});
  window.workbenchDeleteEpisode=options=>deleteEpisode(options||{});
  // 范围执行的两个下拉框跟着队列走；保留用户已经选好的编号，改不动就回到首尾。
  function renderRangePickers(){
    const from=$('#rangeFrom'),to=$('#rangeTo'),run=$('#runRange');
    if(!from||!to||!run)return;
    const ids=state.project.segments.map(segment=>String(segment.id));
    const busy=queueBusy();
    for(const [select,fallback] of [[from,ids[0]],[to,ids[ids.length-1]]]){
      const previous=select.value;
      select.replaceChildren();
      for(const id of ids){const option=document.createElement('option');option.value=id;option.textContent=`视频 ${id}`;select.append(option);}
      select.value=ids.includes(previous)?previous:(fallback||'');
      select.disabled=busy||!ids.length;
    }
    run.disabled=busy||!ids.length;
    run.title=busy?'批次正在执行，请先停止':ids.length?'只执行选定区间内的视频组':'尚未解析出分镜';
  }
  // Segments are a view over the draft, not storage of their own: parseSource
  // rebuilds them from state.project.source on every edit. Adding or removing a
  // group therefore has to edit the draft text itself, otherwise the next parse
  // brings the deleted group straight back.
  function locateSegmentText(index){
    const segment=state.project.segments[index];
    if(!segment)return null;
    let searchFrom=0;
    for(let prior=0;prior<index;prior+=1){
      const text=state.project.segments[prior]?.prompt||'';
      const at=state.project.source.indexOf(text,searchFrom);
      if(at<0)break;
      searchFrom=at+text.length;
    }
    const at=state.project.source.indexOf(segment.prompt,searchFrom);
    return at<0?null:{at,end:at+segment.prompt.length};
  }
  function reparsePreservingStatus(preferredIndex){
    const statuses=Object.fromEntries(state.project.segments.map(segment=>[segment.id,{status:segment.status,error:segment.error,marked:segment.marked}]));
    state.project.segments=parseSource(state.project.source);
    state.project.segments.forEach(segment=>Object.assign(segment,statuses[segment.id]||{}));
    state.selected=state.project.segments.length
      ? Math.max(0,Math.min(preferredIndex??0,state.project.segments.length-1))
      : null;
    $('#sourceText').value=state.project.source;
    renderQueue();
    if(state.selected!==null)selectSegment(state.selected);
    persist();
    window.dispatchEvent(new Event('workbench:source-updated'));
  }
  function deleteSegment(index,{confirmDelete=window.confirm}={}){
    if(queueBusy()){log('批次正在执行，请先点“停止当前操作”再删除分镜','error');return {ok:false,error:'批次正在执行'};}
    const segment=state.project.segments[index];
    if(!segment)return {ok:false,error:'视频组不存在'};
    const found=locateSegmentText(index);
    if(!found){log(`视频 ${segment.id} 在整稿中定位失败，请重新打开项目`,'error');return {ok:false,error:'整稿定位失败'};}
    const message=`删除视频 ${segment.id}？\n\n这一组会从整稿中删除（共 ${segment.prompt.length} 字），并写回 draft.txt。\n`+
      (segment.status==='done'?'这一组已经发送过；删除不会撤回已经提交到即梦的任务。\n':'')+
      '删除后可以用“＋ 新增”重新加一组，但原文需要重新粘贴。';
    if(!confirmDelete(message))return {ok:false,cancelled:true};
    let {at:start,end}=found;
    while(end<state.project.source.length&&/\n/.test(state.project.source[end]))end+=1;
    if(end>=state.project.source.length){while(start>0&&/\n/.test(state.project.source[start-1]))start-=1;}
    state.project.source=state.project.source.slice(0,start)+state.project.source.slice(end);
    reparsePreservingStatus(Math.min(index,Math.max(0,state.project.segments.length-2)));
    log(`已删除视频 ${segment.id}，当前 ${state.project.segments.length} 组`,'ok');
    return {ok:true,remaining:state.project.segments.length};
  }
  function addSegment(){
    if(queueBusy()){log('批次正在执行，请先点“停止当前操作”再新增分镜','error');return {ok:false,error:'批次正在执行'};}
    const numbers=state.project.segments.map(segment=>Number(segment.id)).filter(Number.isFinite);
    const next=String((numbers.length?Math.max(...numbers):0)+1).padStart(2,'0');
    const block=`视频编号${next}（总时长：12s）｜场景：｜人物：\n镜头01｜`;
    state.project.source=`${state.project.source.replace(/\s*$/,'')}\n\n${block}`;
    reparsePreservingStatus(state.project.segments.length);
    const created=state.project.segments.findIndex(segment=>segment.id===next);
    if(created>=0&&created!==state.selected){state.selected=created;renderQueue();selectSegment(created);}
    log(`已新增视频 ${next}，请在右侧填写场景、人物和镜头内容`,'ok');
    return {ok:true,id:next,total:state.project.segments.length};
  }
  // 停止 = 彻底中断，而不是挂起。除了丢掉本地批次，还必须让 broker 释放
  // 待处理的命令：它没有超时，abandon 掉的 promise 永远不会 resolve，于是
  // 之后每次执行都会被“已有任务正在等待即梦画布处理”挡住，直到重启工作台。
  async function stopEverything(){
    batchGeneration+=1;state.running=false;state.paused=false;
    $('#pauseRun').disabled=false;$('#resumeRun').disabled=true;
    $('#runStatus').textContent='已停止';
    state.project.segments.forEach(segment=>{if(segment.status==='running'){segment.status='error';segment.error=segment.error||'已按停止中断';}});
    renderQueue();persist();
    log('已停止当前操作','error');
    let released=null;
    try{released=await window.desktopBridge?.cancelExecution?.('用户点击停止当前操作');}catch(error){log(`释放画布任务失败：${String(error?.message||error)}`,'error');}
    if(released?.cancelled){
      log(released.delivered
        ? '已中断；这一组已经交给画布，提交状态未知，请核对扣费后再决定是否重发'
        : '已中断；这一组尚未交给画布，没有产生扣费','error');
    }
    $('#currentStep').textContent='已停止';
    $('#currentDetail').textContent='已中断全部操作，由你决定下一步执行什么。';
    $('#stageName').textContent='已停止';$('#nextAction').textContent='选择要执行的范围';
    return {ok:true,released:released?.cancelled===true};
  }
  window.workbenchStopEverything=()=>stopEverything();
  // 只执行第 X 组到第 Y 组。编号用队列上显示的视频号，不是下标。
  function rangeIndices(fromId,toId){
    const ids=state.project.segments.map(segment=>String(segment.id));
    const from=String(fromId??'').trim(),to=String(toId??'').trim();
    const start=ids.indexOf(from),end=ids.indexOf(to);
    if(start<0)return {ok:false,error:`队列里没有视频 ${from}`};
    if(end<0)return {ok:false,error:`队列里没有视频 ${to}`};
    // 反着选也算同一个区间，不用要求先小后大。
    const [low,high]=start<=end?[start,end]:[end,start];
    const indices=[];for(let index=low;index<=high;index+=1)indices.push(index);
    return {ok:true,indices,first:ids[low],last:ids[high]};
  }
  window.workbenchRangeIndices=(fromId,toId)=>rangeIndices(fromId,toId);
  function runRange(fromId,toId){
    const range=rangeIndices(fromId,toId);
    if(!range.ok){log(range.error,'error');return Promise.resolve(range);}
    const ids=state.project.segments.map(segment=>String(segment.id));
    const {indices}=range;const low=indices[0],high=indices[indices.length-1];
    // 范围执行不按状态过滤：你选什么就发什么。但已经发过的组重发会再次扣费，
    // 必须先说清楚。
    const resend=indices.filter(index=>state.project.segments[index].status==='done').map(index=>ids[index]);
    if(resend.length&&!window.confirm(`执行第 ${ids[low]}–${ids[high]} 组？\n\n其中 ${resend.join('、')} 已经发送过并扣过积分。\n继续会再次发送、再次扣费。`)){
      return Promise.resolve({ok:false,cancelled:true});
    }
    return runBatch(indices,`第 ${ids[low]}–${ids[high]} 组`);
  }
  window.workbenchRunRange=(fromId,toId)=>runRange(fromId,toId);
  window.workbenchDeleteSegment=(index,options)=>deleteSegment(index,options||{});
  window.workbenchAddSegment=()=>addSegment();
  if (!state.project.segments.length && state.project.source) state.project.segments = parseSource(state.project.source);
  state.selected = state.project.segments.length ? 0 : null;
  function selectSegment(i){state.selected=i;const s=state.project.segments[i];if(!s)return;$('#editorTitle').textContent=`视频 ${s.id}｜${s.name}`;$('#promptPreview').textContent=s.prompt;$('#wordCount').textContent=`${s.prompt.length} 字`;const a=$('#assets');a.className='assets';a.innerHTML=s.assets.length?s.assets.map(x=>`<span class="asset">${x.type==='audio'?'🔊':'🖼️'} ${x.name}</span>`).join(''):'<span class="assets empty">暂无绑定素材</span>';renderQueue();window.dispatchEvent(new Event('workbench:segment-selected'));notify();}
  async function bridge(message){
    if(window.desktopBridge?.isDesktop){const result=await window.desktopBridge.execute(message);if(result?.code==='CHROME_CONNECTOR_OFFLINE'||result?.code==='CHROME_CONNECTOR_UNVERIFIED'){log(result.error||result.message||'即梦画布连接未完成验证','error');return result}return result;}
    if(typeof chrome!=='undefined'&&chrome.runtime?.sendMessage){try{return await chrome.runtime.sendMessage({type:'WORKBENCH_EXECUTE',...message})}catch(e){log(`执行器连接失败：${e.message}`,'error');return null}}
    return {simulation:true};
  }
  const extensionOf=relative=>(String(relative||'').match(/\.[^.\\/]+$/)||[''])[0].toLowerCase();
  function executionFileName(asset){const extension=extensionOf(asset?.relativePath);const clean=String(asset?.displayName||'').replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim()||String(asset?.relativePath||'').split(/[\\/]/).pop().replace(/\.[^.]+$/,'');return clean.toLowerCase().endsWith(extension)?clean:`${clean}${extension}`;}
  function executionMime(asset){const extension=extensionOf(asset?.relativePath);return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.aac':'audio/aac','.flac':'audio/flac'})[extension]||'application/octet-stream';}
  function sceneAnchorFor(prompt,asset,sceneCount=1){const text=String(prompt||'');const name=String(asset?.displayName||'').trim();if(name&&text.includes(name))return name;const bare=name.normalize('NFKC').replace(/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u,'').trim();if(bare&&bare!==name&&bare.length>=2&&text.includes(bare))return bare;const normalized=[...text.matchAll(/【([^】]+)】/g)].map(match=>match[1]).find(value=>[name,bare].includes(value.normalize('NFKC')));if(normalized)return normalized;const header=(text.match(/(?:^|[｜|\n])\s*场景\s*[：:]\s*([^｜|\n；;]+)/)||[])[1]?.trim();const master=(text.match(/场景母版ID\s*[=:：]\s*([^；;\n｜|]+)/)||[])[1]?.trim();if(sceneCount===1){if(master&&text.includes(master))return master;if(header&&text.includes(header))return header;}return '';}
  function buildExecutionMaterial(segment,index,review=false){const segmentKey=`${episodeKeyPrefix()}video:${segment.id}:${index}`;const assets=window.workbenchExecutionAssets?.(segmentKey,segment.prompt)||{characters:Object.values(window.workbenchSegmentCharacterBindings?.(segmentKey)||{}),scenes:[],audio:[]};// 发送时在最开头自动标上视频编号（模板里的【视频编号18】→ 单独一行 18）。
// 由工作台识别并标注，你不用自己写；整稿里已经手写过的不再重复加。
if(!review&&assets.characterReviews?.length&&!reviewMaterial(index)?.reviewed)throw new Error('人物形象待核对：'+assets.characterReviews.join('；'));
const videoNumber=String(segment.id||'').trim();
const numberLine=videoNumber&&!new RegExp('^\\s*'+videoNumber+'\\s*(\\n|$)').test(String(segment.prompt||''))?videoNumber+'\n':'';
const audioParts=[],lockedAudio=[];let introLength=numberLine.length;for(const asset of assets.audio||[]){const voice=String(segment.prompt||'').split('\n').find(line=>line.includes('@'+asset.role)&&/声线|音色/.test(line));if(voice){lockedAudio.push({kind:'audio',name:executionFileName(asset).replace(/\.[^.]+$/,''),anchor:'@'+asset.role,offset:String(segment.prompt).indexOf(voice)+voice.indexOf('@'+asset.role)+asset.role.length+1,occurrence:1,sourceSubjectName:asset.role,extraFileKey:asset.relativePath,required:true,inline:true});continue;}const phrase=`这是${asset.role}的音色`;audioParts.push(phrase);lockedAudio.push({kind:'audio',name:executionFileName(asset).replace(/\.[^.]+$/,''),anchor:phrase,offset:introLength+phrase.length,occurrence:1,sourceSubjectName:asset.role,extraFileKey:asset.relativePath,required:true});introLength+=phrase.length+1;}const intro=numberLine+(audioParts.length?`${audioParts.join('，')}\n`:'');for(const lock of lockedAudio)if(lock.inline){lock.offset+=intro.length;delete lock.inline;}const lockedImages=[];const seenRoles=new Set();for(const asset of assets.characters||[]){const role=String(asset?.role||'').trim();const declaration=String(segment.prompt||'').split('\n').find(line=>line.trim().startsWith(role+'：')||line.trim().startsWith(role+':'));const alias=declaration?.match(/资产\s*【([^】]+)】/)?.[1];const anchor=alias||('@'+asset.displayName&&String(segment.prompt).includes('@'+asset.displayName)?'@'+asset.displayName:role);const at=String(segment.prompt||'').indexOf(anchor);if(!role||at<0||seenRoles.has(role))continue;seenRoles.add(role);lockedImages.push({kind:'image',name:executionFileName(asset).replace(/\.[^.]+$/,''),sourceSubjectName:role,anchor,offset:intro.length+at+anchor.length,occurrence:1,relativePath:asset.relativePath,required:true});}for(const asset of assets.scenes||[]){const anchor=sceneAnchorFor(segment.prompt,asset,(assets.scenes||[]).length),at=String(segment.prompt||'').indexOf(anchor);if(!anchor||at<0)continue;lockedImages.push({kind:'image',name:executionFileName(asset).replace(/\.[^.]+$/,''),anchor,offset:intro.length+at+anchor.length,occurrence:1,relativePath:asset.relativePath,required:true});}const byPath=new Map();for(const asset of [...(assets.characters||[]),...(assets.scenes||[]),...(assets.audio||[])]){if(!asset?.relativePath)continue;const existing=byPath.get(asset.relativePath);const roleBindings=asset.mediaType==='audio'&&asset.role?[asset.role]:[];if(existing){existing.roleBindings=[...new Set([...existing.roleBindings,...roleBindings])];continue;}byPath.set(asset.relativePath,{root:state.project.projectPath,relativePath:asset.relativePath,name:executionFileName(asset),originalName:String(asset.relativePath).split(/[\\/]/).pop(),type:executionMime(asset),lastModified:asset.mtimeMs||Date.now(),roleBindings});}return {segmentKey,assets,prompt:intro+segment.prompt,lockedImages,lockedAudio,audioIntroMode:lockedAudio.length>0,localFiles:[...byPath.values()]};}
  function composeFinalPrompt(prefix,prompt){const head=String(prefix||''),body=String(prompt||'');if(!head||body.startsWith(head))return body;for(const marker of ['提示词内容：','提示词内容:']){if(head.includes(marker)&&body.includes(marker)){const left=head.split(marker,1)[0].trim(),right=body.split(marker,1)[0].trim();if(left&&left===right)return body;}}return `${head}${body}`;}
  function shiftLockOffsets(locks,delta){const amount=Number(delta)||0;return (locks||[]).map(lock=>({...lock,offset:Number(lock.offset)+amount}));}
  window.workbenchBuildExecutionMaterial=(index=state.selected)=>Number.isInteger(index)&&state.project.segments[index]?buildExecutionMaterial(state.project.segments[index],index):null;
  function reviewMaterial(index=state.selected){
    const segment=state.project.segments[index];if(!segment)return null;
    const material=buildExecutionMaterial(segment,index,true);
    const prompt=composeFinalPrompt(state.prefixTemplate,material.prompt),delta=prompt.length-material.prompt.length;
    const lockedImages=shiftLockOffsets(material.lockedImages,delta),lockedAudio=shiftLockOffsets(material.lockedAudio,delta);
    const issues=[...(material.assets.reviewIssues||[])];
    for(const asset of material.assets.scenes||[])if(!lockedImages.some(lock=>lock.relativePath===asset.relativePath))issues.push('场景未定位到提示词引用：'+asset.displayName);
    const fingerprint=JSON.stringify({prompt,lockedImages,lockedAudio,files:material.localFiles.map(file=>({relativePath:file.relativePath,name:file.name,type:file.type})),assets:[...(material.assets.characters||[]),...(material.assets.scenes||[]),...(material.assets.audio||[])].map(asset=>({relativePath:asset.relativePath,mtimeMs:asset.mtimeMs,role:asset.role})),excluded:material.assets.excluded,issues});
    return {...material,prompt,lockedImages,lockedAudio,issues:[...new Set(issues)],notes:material.assets.reviewNotes||[],fingerprint,reviewed:segment.reviewFingerprint===fingerprint,website:segment.websiteReview?.fingerprint===fingerprint?segment.websiteReview:null};
  }
  window.workbenchReviewMaterial=reviewMaterial;
  window.workbenchMarkAllReviewed=()=>{
    if(queueBusy())return {ok:false,error:'批次正在执行，请先停止'};
    const materials=state.project.segments.map((_,index)=>reviewMaterial(index));
    materials.forEach((material,index)=>{state.project.segments[index].reviewFingerprint=material.fingerprint;});
    persist();return {ok:true,count:materials.length};
  };
  window.workbenchMarkReviewed=(index,fingerprint)=>{
    if(queueBusy())return {ok:false,error:'批次正在执行，请先停止'};
    const material=reviewMaterial(index);
    if(!material||material.fingerprint!==fingerprint)return {ok:false,error:'提示词或素材已变更，请重新核对'};
    state.project.segments[index].reviewFingerprint=fingerprint;persist();return {ok:true};
  };
  async function ensureCanvasConnection(){
    if(!window.desktopBridge?.connectorStatus)return {ok:false,error:'当前页面未连接桌面工作台，无法验证即梦画布'};
    try{
      const result=await window.desktopBridge.connectorStatus();
      const ready=Boolean(result?.online&&result?.verified&&result?.runtimeReady&&result?.executorReady&&result?.canvasReady);
      if(ready)return {ok:true,result};
      const detail=result?.error||result?.connector?.executorError||'未完成扩展、执行器与画布握手';
      return {ok:false,result,error:detail};
    }catch(error){return {ok:false,error:String(error?.message||error)};}
  }
  // The canvas executor already waits 60 seconds and then polls the real
  // backend balance every 10 seconds. Once that promise resolves, the debit
  // is confirmed, so the next group should begin immediately.
  const GROUP_INTERVAL_MS=0;
  // 组与组之间连接器可能短暂不可用：MV3 service worker 重启、扩展重载后页面
  // 重新注入、切标签页。更常见的是窗口被最小化——Chrome 会把页面定时器压到每
  // 分钟一次，心跳和领任务都跟着变慢。等待窗口必须能覆盖一个完整的节流周期，
  // 否则批次会在你离开电脑时停在半路。已经付过钱的批次不该因为一次探测失败
  // 就中止。
  const CONNECTION_GRACE_MS=120000;
  let batchGeneration=0;
  async function execute(i){const s=state.project.segments[i];if(!s)return {ok:false,error:'视频组不存在'};const executeToken=batchGeneration;let graceLogged=false;const connection=await window.WorkbenchBatch.waitForCanvasConnection({check:ensureCanvasConnection,timeoutMs:CONNECTION_GRACE_MS,isStopped:()=>executeToken!==batchGeneration,onRetry:detail=>{$('#stageName').textContent='等待画布连接';$('#currentDetail').textContent=`即梦画布连接器暂时不可用：${detail?.error||''}；正在等待恢复`;if(graceLogged)return;graceLogged=true;log(`画布连接暂时不可用：${detail?.error||'未知原因'}；最多等待 ${Math.round(CONNECTION_GRACE_MS/1000)} 秒`,'error');}});if(connection.stopped){renderQueue();persist();return {ok:false,error:'已停止'};}if(!connection.ok){s.status='error';s.error=`画布连接未确认：${connection.error}`;log(s.error,'error');renderQueue();persist();return {ok:false,error:s.error};}if(graceLogged)log('画布连接已恢复，继续执行本组','ok');state.started=Date.now();s.status='running';selectSegment(i);$('#runStatus').textContent='运行中';$('#runStatus').className='pill';$('#currentStep').textContent=`分镜 ${s.id} 执行中`;$('#stageName').textContent='准备素材';$('#nextAction').textContent='上传附件并校准';log(`分镜 ${s.id} 已开始执行`);const material=buildExecutionMaterial(s,i);const finalPrompt=composeFinalPrompt(state.prefixTemplate,material.prompt);const prefixLength=finalPrompt.length-material.prompt.length;const reviewed=reviewMaterial(i)?.reviewed;const executionLocks=locks=>shiftLockOffsets(locks,prefixLength).map(lock=>reviewed?{...lock,required:false,allowMissing:true}:lock);const characterBindings=window.workbenchSegmentCharacterBindings?.(material.segmentKey)||{};const characterBindingsBySegment=window.workbenchAllSegmentCharacterBindings?.()||{};const allowStopPreviousReply=Boolean(i>0&&state.project.segments[i-1]?.status==='done');let result;const dispatch=confirmResend=>bridge({action:'executeSegment',mode:'queue',allowStopPreviousReply,confirmResend,localFiles:material.localFiles,segment:{...s,allowStopPreviousReply,characterBindings,selectedCharacterAssets:material.assets.characters||[],lockedSubjects:[],lockedImages:executionLocks(material.lockedImages),lockedAudio:executionLocks(material.lockedAudio),audioIntroMode:material.audioIntroMode,characterBindingsBySegment,prompt:finalPrompt,prefix:'',promptIsFinal:true,source:'desktop-workbench',bridgeProtocolVersion:1,videoNumbers:[s.id]},index:i});
    try{
      result=await dispatch(false);
      // 之前已经确认扣费的同一条提示词，默认不重发；要不要再发一次由你决定。
      if(result?.code==='CDP_ALREADY_CONFIRMED'&&window.confirm(`分镜 ${s.id} 的这条提示词之前已经确认扣费${result.charged?.consumed!=null?`（${result.charged.consumed} 积分）`:''}。\n\n确定要再发一次、再扣一次费吗？`))
        result=await dispatch(true);
    }catch(error){result={ok:false,error:String(error?.message||error)};}if(!result||result.error||result.ok===false){s.status='error';s.error=result?.error||result?.message||'执行器没有返回确认回执';
    // 点了发送就会发送；只有输入框没清理干净和同一条重复发送两种情况会拦下来，
    // 这两种都没有扣费，说明白比笼统报“失败”有用。
    const needsClearing=result?.code==='CDP_COMPOSER_NOT_CLEAN',duplicate=result?.code==='CDP_DUPLICATE_SEND'||result?.code==='CDP_ALREADY_CONFIRMED';
    if(needsClearing||duplicate){$('#stageName').textContent=needsClearing?'等你清理输入框':'已拦下重复发送';$('#currentDetail').textContent=s.error;$('#nextAction').textContent=needsClearing?'清理即梦输入框后重试本组':'确认后再决定是否重发';}
    log(`分镜 ${s.id} ${needsClearing?'未发送（输入框需要清理）':duplicate?'未发送（同一条已发过，避免重复扣费）':'失败'}：${s.error}`,'error')}else{s.status='done';s.error='';if(result.referenceVerification?.verified)s.websiteReview={...result.referenceVerification,fingerprint:reviewMaterial(i)?.fingerprint,checkedAt:new Date().toISOString(),url:result.url||connection.result?.connector?.url||''};$('#currentDetail').textContent='已确认画布发送；无需等待视频生成';$('#nextAction').textContent='立即执行下一组';log(`分镜 ${s.id} 已发送，可继续下一组`,'ok')}$('#stageName').textContent=s.status==='done'?'已发送':'失败';$('#currentStep').textContent=s.status==='done'?`分镜 ${s.id} 已发送，可继续下一组`:`分镜 ${s.id} 需要重试`;renderQueue();persist();return {ok:s.status==='done',result,error:s.error||''};}
  async function runBatch(indices,label='批次'){if(state.running){log('已有批次正在执行，请先暂停或停止','error');return {ok:false,busy:true};}const queue=[...new Set((indices||[]).filter(index=>Number.isInteger(index)&&state.project.segments[index]))];if(!queue.length){log(label==='全部执行'?'没有未完成的视频组':'没有可执行的视频组','error');return {ok:false,empty:true};}const token=++batchGeneration;state.running=true;state.paused=false;$('#pauseRun').disabled=false;$('#resumeRun').disabled=true;$('#runStatus').textContent='运行中';const result=await window.WorkbenchBatch.runSequentialBatch({items:queue,delayMs:GROUP_INTERVAL_MS,execute:index=>execute(index),isPaused:()=>state.paused,isStopped:()=>token!==batchGeneration||!state.running,onWaiting:nextIndex=>{const next=state.project.segments[nextIndex];$('#runStatus').textContent='运行中';$('#stageName').textContent='任务已确认';$('#currentStep').textContent=`即将执行分镜 ${next.id}`;$('#currentDetail').textContent='上一组任务已确认；按设定间隔处理下一组。';$('#nextAction').textContent=`发送分镜 ${next.id}`;log(`上一组任务已确认，继续执行分镜 ${next.id}`,'ok');}});if(token===batchGeneration){state.running=false;state.paused=false;$('#pauseRun').disabled=false;$('#resumeRun').disabled=true;if(result.ok){$('#runStatus').textContent='已发送';$('#stageName').textContent='批次完成';$('#currentStep').textContent=`本批次 ${result.completed} 组均已发送`;$('#currentDetail').textContent='所有任务均已提交到即梦；请直接在画布查看生成结果。';$('#nextAction').textContent='可以继续处理其他任务';log(`${label}完成：${result.completed} 组均已发送；生成结果请直接在画布查看`,'ok');}else if(result.stopped){$('#runStatus').textContent='已停止';}persist();}return result;}
  function persist(){state.project.prefixTemplate=state.prefixTemplate;state.project.source=$('#sourceText').value;state.project.mode='queue';syncActiveEpisode();localStorage.setItem('jimeng-workbench-project',JSON.stringify(state.project));if(window.desktopBridge?.saveProject&&state.project.projectPath)window.desktopBridge.saveProject(state.project.projectPath,{...state.project,draftText:state.project.source,prompt:{hasDraft:Boolean(state.project.source),draftUpdatedAt:new Date().toISOString(),videoCount:state.project.segments.length,videoNumbers:state.project.segments.map(s=>s.id)}}).catch(()=>{});notify();}
  function preserveSegmentProgress(previous, parsed, history) {
    const key = segment => String(segment.id).trim();
    const counts = new Map();
    for(const segment of previous) counts.set(key(segment),(counts.get(key(segment))||0)+1);
    for(const segment of previous){
      if(counts.get(key(segment))!==1)continue;
      history[key(segment)]={status:segment.status,error:segment.error,marked:segment.marked,selected:segment.selected};
    }
    const nextCounts=new Map();
    for(const segment of parsed)nextCounts.set(key(segment),(nextCounts.get(key(segment))||0)+1);
    return parsed.map(segment=>{
      const saved=history[key(segment)];
      if(saved && nextCounts.get(key(segment))===1)Object.assign(segment,saved);
      return segment;
    });
  }
  const parseAndPersist=()=>{if(queueBusy())return;const episode=activeEpisode();episode.segmentProgress=episode.segmentProgress||{};state.project.source=$('#sourceText').value;state.project.segments=preserveSegmentProgress(state.project.segments,parseSource(state.project.source),episode.segmentProgress);state.selected=state.project.segments.length?Math.min(state.selected??0,state.project.segments.length-1):null;renderQueue();if(state.selected!==null)selectSegment(state.selected);persist();};
  window.workbenchParseVideoGroups=source=>parseSource(source);
  window.workbenchImportVideoGroups=(source,mode='append')=>{
    if(queueBusy())return {ok:false,error:'批次正在执行，请先停止再导入'};
    const groups=parseSource(source);
    if(!groups.length)return {ok:false,error:'未找到视频组，请保留每组开头的「视频编号」'};
    const ids=groups.map(group=>group.id),duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
    if(duplicates.length)return {ok:false,error:'粘贴内容含重复编号：'+[...new Set(duplicates)].join('、')};
    if(!['append','replace'].includes(mode))return {ok:false,error:'导入方式无效'};
    const conflicts=mode==='append'?ids.filter(id=>state.project.segments.some(group=>group.id===id)):[];
    if(conflicts.length)return {ok:false,error:'当前分集已有视频编号 '+conflicts.join('、')+'，请修改编号或选择替换本集'};
    const oldCount=mode==='append'?state.project.segments.length:0;
    const incoming=groups.map(group=>group.prompt).join('\n\n');
    state.project.source=mode==='append'&&state.project.source.trim()?state.project.source.trim()+'\n\n'+incoming:incoming;
    state.project.segments=mode==='append'?[...state.project.segments,...groups]:groups;
    if(mode==='replace')activeEpisode().segmentProgress={};
    $('#sourceText').value=state.project.source;state.selected=oldCount;
    renderQueue();selectSegment(state.selected);persist();
    window.dispatchEvent(new Event('workbench:source-updated'));
    return {ok:true,count:groups.length,ids};
  };
  window.workbenchReplaceText=(scope,find,replacement)=>{if(typeof find!=='string'||!find)return {ok:false,error:'请输入要查找的文字'};const value=String(replacement??'');if(scope==='segment'){const index=state.selected;if(index===null||!state.project.segments[index])return {ok:false,error:'请先选择一个视频组'};const old=state.project.segments[index].prompt;const next=old.split(find).join(value);if(next===old)return {ok:false,error:'当前视频组没有找到这段文字'};let searchFrom=0;for(let partIndex=0;partIndex<index;partIndex++){const prior=state.project.segments[partIndex]?.prompt||'';const priorAt=state.project.source.indexOf(prior,searchFrom);if(priorAt<0)break;searchFrom=priorAt+prior.length;}const replaceAt=state.project.source.indexOf(old,searchFrom);if(replaceAt<0)return {ok:false,error:'当前视频组文本定位失败，请重新解析整稿'};state.project.source=state.project.source.slice(0,replaceAt)+next+state.project.source.slice(replaceAt+old.length);const selectedId=state.project.segments[index].id;const statuses=Object.fromEntries(state.project.segments.map(segment=>[segment.id,{status:segment.status,error:segment.error,marked:segment.marked}]));state.project.segments=parseSource(state.project.source);state.project.segments.forEach(segment=>Object.assign(segment,statuses[segment.id]||{}));state.selected=Math.max(0,state.project.segments.findIndex(segment=>segment.id===selectedId));}else{const old=state.project.source;const next=old.split(find).join(value);if(next===old)return {ok:false,error:'整稿中没有找到这段文字'};state.project.source=next;const statuses=Object.fromEntries(state.project.segments.map(segment=>[segment.id,{status:segment.status,error:segment.error,marked:segment.marked}]));state.project.segments=parseSource(next);state.project.segments.forEach(segment=>Object.assign(segment,statuses[segment.id]||{}));state.selected=state.project.segments.length?Math.min(state.selected??0,state.project.segments.length-1):null;}$('#sourceText').value=state.project.source;renderQueue();if(state.selected!==null)selectSegment(state.selected);persist();window.dispatchEvent(new Event('workbench:source-updated'));return {ok:true};};
  let segmentPromptSaveTimer;
  window.workbenchUpdateCurrentSegmentPrompt=nextPrompt=>{if(queueBusy())return {ok:false,error:'任务运行中，请停止后编辑提示词'};const index=state.selected;if(index===null||!state.project.segments[index])return {ok:false,error:'请先选择一个视频组'};const segment=state.project.segments[index];const old=segment.prompt;const next=String(nextPrompt??'');if(next===old)return {ok:true,unchanged:true};let searchFrom=0;for(let partIndex=0;partIndex<index;partIndex++){const prior=state.project.segments[partIndex]?.prompt||'';const priorAt=state.project.source.indexOf(prior,searchFrom);if(priorAt<0)break;searchFrom=priorAt+prior.length;}const replaceAt=state.project.source.indexOf(old,searchFrom);if(replaceAt<0)return {ok:false,error:'当前视频组文本定位失败，请重新打开项目'};state.project.source=state.project.source.slice(0,replaceAt)+next+state.project.source.slice(replaceAt+old.length);segment.prompt=next;$('#sourceText').value=state.project.source;$('#wordCount').textContent=`${next.length} 字`;renderQueue();clearTimeout(segmentPromptSaveTimer);segmentPromptSaveTimer=setTimeout(persist,180);window.dispatchEvent(new CustomEvent('workbench:segment-prompt-updated',{detail:{index,prompt:next}}));return {ok:true};};
  $('#parseProject').onclick=()=>{parseAndPersist();log(`整稿自动解析完成：${state.project.segments.length} 个分镜`)};
  $('#sourceText').value=state.project.source||'';let sourceParseTimer;$('#sourceText').addEventListener('input',()=>{clearTimeout(sourceParseTimer);sourceParseTimer=setTimeout(()=>{parseAndPersist();log(`整稿自动解析完成：${state.project.segments.length} 个分镜`)},450)}); $('#copyPrompt').onclick=()=>{if(state.selected!==null)navigator.clipboard?.writeText(state.project.segments[state.selected].prompt);}; $('#newProject').onclick=()=>{if(confirm('清空当前项目并新建？')){state.project={source:'',segments:[]};state.selected=null;$('#sourceText').value='';renderQueue();persist();log('已新建项目')}}; $('#saveProject').onclick=()=>{persist();log('项目已保存到本地')}; $('#clearLog').onclick=()=>{$('#logs').innerHTML='';localStorage.removeItem('jimeng-workbench-logs')}; $('#pauseRun').onclick=()=>{if(!state.running)return;state.paused=true;$('#pauseRun').disabled=true;$('#resumeRun').disabled=false;$('#runStatus').textContent='已暂停';log('已暂停当前批次');notify()}; $('#resumeRun').onclick=()=>{if(!state.running)return;state.paused=false;$('#pauseRun').disabled=false;$('#resumeRun').disabled=true;$('#runStatus').textContent='运行中';log('已继续当前批次');notify()}; $('#stopRun').onclick=()=>stopEverything(); $('#addAsset').onclick=()=>{if(state.selected===null)return;const name=prompt('输入素材文件名或主体库名称');if(name){state.project.segments[state.selected].assets.push({type:/\.mp3$|\.wav$/i.test(name)?'audio':'image',name});selectSegment(state.selected);persist();}};
  const CONNECTOR_CHECK_TIMEOUT_MS = 12000;
  const CONNECTOR_CHECK_INTERVAL_MS = 500;
  let connectorCheckToken = 0;
  let connectorCheckActive = false;

  function connectorReady(result) {
    return Boolean(result?.online && result?.verified && result?.runtimeReady &&
      result?.executorReady && result?.canvasReady);
  }

  function connectorStage(result) {
    if (!result?.connector) return '等待浏览器插件心跳';
    if (!result.runtimeReady) return '等待扩展运行时';
    if (!result.executorReady) return '等待画布执行器';
    if (!result.canvasReady) return '等待中央画布输入框';
    if (!result.verified) return '等待三方握手确认';
    return '已完成三方握手';
  }

  function applyConnectorStatus(result, {announce=false, checking=false} = {}) {
    const status = $('#bridgeStatus');
    if (!status) return false;
    const online = connectorReady(result);
    const version = result?.connector?.executorVersion || result?.version || '';
    const connector = result?.connector;
    const label = checking
      ? `正在检查即梦画布：${connectorStage(result)}`
      : online ? '已验证连接即梦画布' : connector ? '正在验证即梦画布' : '未连接即梦画布';
    // Keep the status indicator node alive.  Assigning textContent directly
    // would remove the <i> dot after the first refresh and make the checking
    // pulse/offline color invisible.
    status.replaceChildren(document.createElement('i'), document.createTextNode(label));
    status.className = `connection${online ? '' : ' offline'}${checking ? ' checking' : ''}`;
    status.dataset.verified = String(online);
    status.dataset.executorVersion = version;
    status.dataset.connectorUrl = connector?.url || '';
    status.title = online
      ? `${connector?.title || connector?.url || '即梦画布'}（执行器 ${version || '未知版本'}）`
      : (result?.error || '请在 Chrome 打开即梦画布，重新加载当前版本扩展后刷新画布页面');
    if (announce) {
      const detail = online
        ? `即梦画布连接检查通过（${version || '执行器版本未知'}；${connector?.url || 'URL 未知'}）`
        : `即梦画布连接检查未通过：${result?.error || connectorStage(result)}`;
      log(detail, online ? 'ok' : 'error');
    }
    return online;
  }

  async function readConnectorStatus() {
    if (window.desktopBridge?.connectorStatus) {
      return await window.desktopBridge.connectorStatus();
    }
    const extensionOnline = typeof chrome !== 'undefined' && chrome.runtime;
    return extensionOnline
      ? {online:false, verified:false, runtimeReady:false, executorReady:false, canvasReady:false, connector:null, error:'扩展内工作台尚未连接桌面桥'}
      : {online:false, verified:false, runtimeReady:false, executorReady:false, canvasReady:false, connector:null, error:'桌面工作台未启动'};
  }

  async function refreshConnectorStatus(announce=false) {
    try {
      const result = await readConnectorStatus();
      // The diagnostic loop owns the status label while it is active; the
      // background refresh must not overwrite its stage text.
      if (!connectorCheckActive) applyConnectorStatus(result, {announce});
      return connectorReady(result);
    } catch (error) {
      const result = {online:false, verified:false, runtimeReady:false, executorReady:false, canvasReady:false, connector:null, error:String(error?.message || error)};
      if (!connectorCheckActive) applyConnectorStatus(result, {announce});
      return false;
    }
  }

  function setConnectorCheckControls(active, label='● 检查即梦浏览器') {
    const button = $('#checkBrowser');
    if (!button) return;
    button.disabled = active;
    button.setAttribute('aria-busy', String(active));
    button.textContent = active ? label : '● 检查即梦浏览器';
  }

  async function runConnectorDiagnostic() {
    const token = ++connectorCheckToken;
    connectorCheckActive = true;
    const started = Date.now();
    const deadline = started + CONNECTOR_CHECK_TIMEOUT_MS;
    let attempt = 0;
    setConnectorCheckControls(true, '检查中 0%');
    log('开始检查即梦画布三方握手（最多等待 12 秒）');
    try {
      while (Date.now() < deadline && token === connectorCheckToken) {
        attempt += 1;
        let result;
        try {
          result = await readConnectorStatus();
        } catch (error) {
          result = {online:false, verified:false, runtimeReady:false, executorReady:false, canvasReady:false, connector:null, error:String(error?.message || error)};
        }
        const elapsed = Date.now() - started;
        const progress = Math.min(99, Math.max(1, Math.round(elapsed / CONNECTOR_CHECK_TIMEOUT_MS * 100)));
        applyConnectorStatus(result, {checking:true});
        setConnectorCheckControls(true, `检查中 ${progress}%`);
        const status = $('#bridgeStatus');
        if (status) status.title = `${connectorStage(result)} · 第 ${attempt} 次 · ${Math.round(elapsed / 100) / 10}s${result?.connector?.url ? ` · ${result.connector.url}` : ''}${result?.connector?.executorVersion ? ` · 执行器 ${result.connector.executorVersion}` : ''}`;
        if (connectorReady(result)) {
          applyConnectorStatus(result, {announce:false});
          log(`握手诊断完成：第 ${attempt} 次确认成功，耗时 ${Date.now() - started}ms（执行器 ${result?.connector?.executorVersion || result?.version || '未知'}；${result?.connector?.url || 'URL 未知'}）`, 'ok');
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, CONNECTOR_CHECK_INTERVAL_MS));
      }
      const finalResult = await readConnectorStatus().catch(error => ({error:String(error?.message || error)}));
      applyConnectorStatus(finalResult, {announce:false});
      log(`握手诊断超时：${connectorStage(finalResult)}（执行器 ${finalResult?.connector?.executorVersion || finalResult?.version || '未知'}；${finalResult?.connector?.url || 'URL 未知'}）；${finalResult?.error || '请确认 Chrome 中打开的是即梦画布并刷新了扩展和页面'}`, 'error');
      return false;
    } finally {
      if (token === connectorCheckToken) {
        connectorCheckActive = false;
        setConnectorCheckControls(false);
        // One final non-checking refresh keeps the dataset/title in sync with
        // the broker after the diagnostic label is restored.
        await refreshConnectorStatus(false);
      }
    }
  }
  const oldLogs=JSON.parse(localStorage.getItem('jimeng-workbench-logs')||'[]');oldLogs.slice(0,30).reverse().forEach(x=>{const row=document.createElement('div');row.className='log '+(x.type==='error'?'error':'');row.innerHTML=`<b>${new Date(x.time).toLocaleTimeString()}</b>${x.message}`;$('#logs').prepend(row)});refreshConnectorStatus();setInterval(()=>refreshConnectorStatus(),2500);renderQueue();if(state.selected!==null)selectSegment(state.selected);
  function sceneNameOf(segment) {
    return (segment.prompt.match(/(?:场景|地点|场景母版ID)[：:]\s*([^\n|｜；;]+)/) || [])[1]?.trim() || '未分场';
  }
  window.workbenchRenameProject=name=>{state.project.name=String(name||" ").trim();persist();};
  window.workbenchAssetContext = () => {
    const segment = state.project.segments[state.selected];
    return {root:state.project.projectPath, segmentKey:segment ? episodeKeyPrefix() + 'video:' + segment.id + ':' + state.selected : null, videoNumber:segment?.id, prompt:segment?.prompt||''};
  };
  // 供“重新匹配全部分镜”遍历：键的算法必须和 workbenchAssetContext 完全一致，
  // 否则清理会漏掉或误伤别的分镜的绑定。
  window.workbenchAllSegments = () => state.project.segments.map((segment, index) => ({
    segmentKey:episodeKeyPrefix() + 'video:' + segment.id + ':' + index,
    videoNumber:segment.id,
    prompt:segment.prompt || '',
  }));

  $('#chooseFiles').onclick=async()=>{const files=await window.desktopBridge?.chooseFiles?.();if(files?.length){log(`已选择 ${files.length} 个素材文件`);if(state.selected!==null){files.forEach(name=>state.project.segments[state.selected].assets.push({type:/\.mp3$|\.wav$/i.test(name)?'audio':'image',name:name.split('\\').pop()}));selectSegment(state.selected);persist();}}}; $('#checkBrowser').onclick=()=>runConnectorDiagnostic(); $('#refreshState').onclick=()=>refreshConnectorStatus(true);
  function renderMode(){state.mode='queue';$('#modeQueue').classList.add('active');$('#modeDraft').classList.remove('active');$('#modeQueue').setAttribute('aria-selected','true');$('#modeDraft').setAttribute('aria-selected','false');$('#modeKicker').textContent='分组队列 · PROMPT';$('#templateTitle').textContent='分组队列统一前置词';$('#templateHint').textContent='每个分镜单独发送';$('#prefixTemplate').value=state.prefixTemplate;$('#draftTemplatePreview').hidden=true;$('#promptLabel').textContent='即将写入的完整提示词';$('#modeActionHint').textContent='解析后可在左侧逐段检查与执行';}
  function updateDraftTemplate(){if(state.mode!=='draft')return;const ids=state.project.segments.map(s=>s.id);const count=ids.length||'x';const list=ids.length?ids.map(id=>`视频编号${id}`).join('、'):'视频编号x、视频编号x、视频编号x';const value=`使用Seedance 2.0生成16:9横屏视频，以下每个视频的提示词的全部内容你都要一比一全部复制粘贴使用，根据视频的编号割视频提示词，1个编号代表生成一个视频，每个视频的人物场景主体都要精准锁定我@的主体，现在是要生成${count}个视频，分别是${list}，现在开始执行任务：`;state.draftPrefix=value;$('#prefixTemplate').value=value;$('#draftTemplatePreview').textContent=`本批 ${ids.length||0} 个视频：${list}`;}
  $('#modeQueue').onclick=()=>renderMode();$('#modeDraft').onclick=()=>renderMode();window.workbenchPrefixTemplate=()=>state.prefixTemplate;window.workbenchUpdatePrefixTemplate=value=>{if(queueBusy())return {ok:false,error:'任务运行中，请停止后编辑全局提示词'};state.prefixTemplate=String(value??'');$('#prefixTemplate').value=state.prefixTemplate;persist();return {ok:true};};$('#prefixTemplate').addEventListener('input',e=>window.workbenchUpdatePrefixTemplate(e.target.value));renderMode();
  $('#selectAll').onclick=()=>{state.project.segments.forEach(segment=>{segment.selected=segment.status!=='done'});renderQueue();};
  $('#clearSelection').onclick=()=>{state.project.segments.forEach(segment=>{segment.selected=false});renderQueue();};
  window.workbenchRunSelected=()=>runBatch(state.project.segments.map((segment,index)=>segment.selected&&segment.status!=='done'?index:null).filter(Number.isInteger),'所选批次');
  window.workbenchRunCurrent=()=>runBatch(state.selected===null?[]:[state.selected],'单组执行');
  window.workbenchRunAll=()=>runBatch(state.project.segments.map((segment,index)=>segment.status!=='done'?index:null).filter(Number.isInteger),'全部执行');
  // 供 /jimeng React 分镜页驱动引擎：全部走内部真实函数，不绕开任何状态规则。
  window.workbenchSelectSegment=index=>{if(Number.isInteger(index))selectSegment(index);};
  window.workbenchSetSegmentFlags=(index,flags)=>{const s=state.project.segments[index];if(!s)return {ok:false,error:'视频组不存在'};if(flags&&flags.selected!==undefined)s.selected=Boolean(flags.selected);if(flags&&flags.marked!==undefined)s.marked=Boolean(flags.marked);renderQueue();persist();return {ok:true};};
  window.workbenchPause=()=>{$('#pauseRun').click();};
  window.workbenchResume=()=>{$('#resumeRun').click();};
  window.workbenchSelectedIndex=()=>state.selected;
  window.workbenchRunStatus=()=>({text:$('#runStatus')?.textContent||'',running:state.running,paused:state.paused,step:$('#currentStep')?.textContent||'',detail:$('#currentDetail')?.textContent||'',stage:$('#stageName')?.textContent||'',elapsed:$('#elapsed')?.textContent||'',next:$('#nextAction')?.textContent||''});
  window.workbenchUpdateSegmentPrompt=(index,nextPrompt)=>{if(Number.isInteger(index)&&index!==state.selected)selectSegment(index);return window.workbenchUpdateCurrentSegmentPrompt(nextPrompt);};
  window.workbenchSegments=()=>state.project.segments.map(s=>({id:s.id,name:s.name,prompt:s.prompt||'',status:s.status||'',error:s.error||'',selected:Boolean(s.selected),marked:Boolean(s.marked),assets:s.assets||[]}));
  $('#runSelected').onclick=()=>window.workbenchRunSelected();
  // Resetting clears local progress only.  Groups already accepted by the
  // canvas stay in Jimeng and their credits are already spent, so running them
  // again really does pay a second time.  Say that plainly before touching
  // anything, and refuse outright while a group is still in flight.
  function applyQueueReset(){
    const total=state.project.segments.length;
    activeEpisode().segmentProgress={};state.project.segments.forEach(segment=>{segment.status='';segment.error='';segment.selected=false;});
    batchGeneration+=1;state.running=false;state.paused=false;state.started=null;
    state.selected=total?0:null;
    $('#runStatus').textContent='空闲';$('#runStatus').className='pill muted';
    $('#pauseRun').disabled=false;$('#resumeRun').disabled=true;
    $('#currentStep').textContent='等待任务';$('#currentDetail').textContent='队列已重置，将从第 1 组重新开始。';
    $('#stageName').textContent='未开始';$('#elapsed').textContent='—';$('#nextAction').textContent='执行第 1 组';
    renderQueue();if(state.selected!==null)selectSegment(state.selected);persist();
    log(`分镜队列已重置：${total} 组全部回到待准备，从第 1 组开始`,'ok');
    return {ok:true,reset:total};
  }
  function resetQueue({confirmReset=window.confirm}={}){
    if(queueBusy()){log('批次正在执行，请先点“停止当前操作”再重置队列','error');return {ok:false,error:'批次正在执行'};}
    const segments=state.project.segments,total=segments.length;
    if(!total){log('还没有解析出分镜，无需重置','error');return {ok:false,error:'队列为空'};}
    const sent=segments.filter(segment=>segment.status==='done').length;
    const message=`重置分镜队列？\n\n全部 ${total} 组会恢复为“待准备”，从第 1 组重新开始。\n`+
      (sent?`其中 ${sent} 组已经发送到即梦并且已经扣过积分。\n`:'')+
      '重置只清空工作台本地进度，不会撤回已经提交的任务；\n重置后再执行，这些分镜会再次发送并再次扣费。';
    if(!confirmReset(message))return {ok:false,cancelled:true};
    return applyQueueReset();
  }
  window.workbenchResetQueue=options=>resetQueue(options||{});
  $('#resetQueue').onclick=()=>resetQueue();
  $('#addSegment').onclick=()=>addSegment();
  $('#episodeSelect').onchange=event=>switchEpisode(event.target.value);
  $('#addEpisode').onclick=()=>addEpisode();
  $('#renameEpisode').onclick=()=>renameEpisode();
  $('#deleteEpisode').onclick=()=>deleteEpisode();
  $('#runRange').onclick=()=>runRange($('#rangeFrom').value,$('#rangeTo').value);
  async function chooseProjectFolder(){const folder=await window.desktopBridge?.chooseDirectory?.();if(!folder)return;state.project.projectPath=folder;const scan=await window.desktopBridge?.scanProject?.(folder);state.project.assetFolders={character:scan?.characterFolder||'',scene:scan?.sceneFolder||''};$('#projectName').textContent=folder.split('\\').pop()||folder;$('#projectFolders').textContent=`人物：${state.project.assetFolders.character||'未找到'} · 场景：${state.project.assetFolders.scene||'未找到'}`;persist();log(`已锁定项目文件夹：${folder}`);}
  const projectHistory=JSON.parse(localStorage.getItem('jimeng-workbench-projects')||'[]');
  function renderProjectList(){const list=$('#projectList');if(!list)return;list.innerHTML='';$('#projectEmpty').hidden=projectHistory.length>0;projectHistory.forEach(item=>{const card=document.createElement('button');card.className='project-card';card.innerHTML=`<b>${item.name}</b><small>${item.path}</small><span>人物：${item.character||'未找到'} · 场景：${item.scene||'未找到'}</span>`;card.onclick=()=>openProject(item);list.append(card);});}
  window.workbenchShowScene = scene => {
    const projectView = $('#projectView');
    const workspaceView = $('#workspaceView');
    const typetaleView = $('#typetaleView');
    const infiniteCanvasView = $('#infiniteCanvasView');
    const active = ['projects','jimeng','typetale','infinite-canvas'].includes(scene) ? scene : 'projects';
    if (projectView) projectView.hidden = active !== 'projects';
    if (workspaceView) workspaceView.hidden = active !== 'jimeng';
    if (typetaleView) typetaleView.hidden = active !== 'typetale';
    if (infiniteCanvasView) infiniteCanvasView.hidden = active !== 'infinite-canvas';
    document.querySelector('.top-actions')?.toggleAttribute('hidden', active !== 'jimeng');
    document.body.dataset.scene = active;
    document.querySelectorAll('.scene-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.scene === active);
      item.setAttribute('aria-selected', String(item.dataset.scene === active));
    });
    if (active === 'projects') {
      const page = $('#projectPage');
      if (page) page.hidden = false;
      if (window.renderProjectListPage) window.renderProjectListPage();
      else renderProjectList();
    }
    if (active === 'typetale') window.dispatchEvent(new CustomEvent('typetale:scene-shown'));
    if (active === 'infinite-canvas') window.dispatchEvent(new CustomEvent('infinite-canvas:scene-shown'));
    window.scrollTo(0, 0);
  };
  window.setWorkbenchView = projectVisible => window.workbenchShowScene(projectVisible ? 'projects' : 'jimeng');
  function showProjectPage(){const page=$('#projectPage');if(!page)return;window.workbenchShowScene('projects');}
  function showWorkbench(){const page=$('#projectPage');if(page)page.hidden=true;window.workbenchShowScene('jimeng');}
  document.querySelectorAll('.scene-nav-item').forEach(item => item.onclick = () => {
    const scene = item.dataset.scene;
    if (scene === 'projects') showProjectPage();
    else if (scene === 'jimeng' && !state.project.projectPath) showProjectPage();
    else window.workbenchShowScene(scene);
  });
  function openProject(item){state.project.projectPath=item.path;state.project.assetFolders={character:item.character||'',scene:item.scene||''};$('#projectName').textContent=item.name;$('#projectFolders').textContent=`人物：${item.character||'未找到'} · 场景：${item.scene||'未找到'}`;persist();showWorkbench();}
  async function chooseProjectFolder(){const folder=await window.desktopBridge?.chooseDirectory?.();if(!folder)return;const scan=await window.desktopBridge?.scanProject?.(folder);const item={path:folder,name:folder.split('\\').pop()||folder,character:scan?.characterFolder||'',scene:scan?.sceneFolder||''};const index=projectHistory.findIndex(x=>x.path===folder);if(index>=0)projectHistory.splice(index,1);projectHistory.unshift(item);localStorage.setItem('jimeng-workbench-projects',JSON.stringify(projectHistory.slice(0,30)));openProject(item);log(`已锁定项目文件夹：${folder}`);}
  $('#chooseProjectFolder').onclick=chooseProjectFolder;$('#createProject').onclick=chooseProjectFolder;$('#projectNav').onclick=showProjectPage;
  if(state.project.projectPath){$('#projectName').textContent=state.project.projectPath.split('\\').pop()||state.project.projectPath;$('#projectFolders').textContent=`人物：${state.project.assetFolders.character||'未找到'} · 场景：${state.project.assetFolders.scene||'未找到'}`;}
  if(sessionStorage.getItem('jimeng-open-project') !== '1') showProjectPage();
})();
