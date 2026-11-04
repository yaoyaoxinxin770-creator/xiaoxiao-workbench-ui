(() => {
  const core = window.TypeTaleCore;
  const families = window.TypeTaleModelFamily;
  const view = document.getElementById('typetaleView');
  if (!core || !families || !view) return;
  const $ = selector => document.querySelector(selector);
  const bridge = () => window.desktopBridge;
  const STORAGE_KEY = 'typetale-workbench-state';
  const PROJECT_STORAGE_PREFIX = `${STORAGE_KEY}:`;
  const KIND_LABEL = {characters:'角色', scenes:'场景', props:'道具', other:'素材', audio:'音频'};
  const STATUS_LABEL = {ready:'待准备', running:'执行中', submitted:'已提交', done:'已完成', error:'失败', queued:'排队中'};

  function parseJson(value) {
    try { return JSON.parse(value || '{}'); }
    catch (_) { return null; }
  }
  function storedProjectPath() {
    const pointer = parseJson(localStorage.getItem(STORAGE_KEY));
    return pointer?.workspace === 'typetale' ? pointer.projectPath || '' : '';
  }
  function storageKeyFor(root) {
    return root ? `${PROJECT_STORAGE_PREFIX}${root}` : STORAGE_KEY;
  }
  function readLocalState(root) {
    if (root) {
      const saved = parseJson(localStorage.getItem(storageKeyFor(root)));
      if (saved) return saved;
    }
    const pointer = parseJson(localStorage.getItem(STORAGE_KEY));
    return pointer?.workspace === 'typetale' && pointer.projectPath === root ? pointer : null;
  }

  const initialProjectPath = storedProjectPath();
  let state = core.normalizeState(readLocalState(initialProjectPath) || {});
  if (initialProjectPath) state.projectPath = initialProjectPath;
  let saveTimer = null;
  let running = false;
  let paused = false;
  let stopped = false;
  let selectedJobId = '';
  window.typetaleIsRunning = () => running;

  function projectPath() { return state.projectPath || ''; }
  function basename(value) { return String(value || '').split(/[\\/]/).filter(Boolean).pop() || '未选择项目'; }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function log(message, type = 'ok') {
    state.logs.unshift({time:Date.now(), message:String(message), type});
    state.logs = state.logs.slice(0, 120);
    renderLogs();
  }
  function activeShot() {
    return state.shots.find(shot => shot.id === state.activeShotId) || state.shots[0] || null;
  }
  function activeProvider() {
    return state.providers.find(provider => provider.id === state.activeProviderId) || state.providers[0] || null;
  }
  function selectedJob() {
    return state.jobs.find(job => job.id === selectedJobId) || state.jobs[0] || null;
  }
  function syncShotFromEditor() {
    const shot = activeShot();
    if (!shot) return;
    shot.title = $('#ttShotTitle').value;
    shot.prompt = $('#ttShotPrompt').value;
    shot.negativePrompt = $('#ttShotNegative')?.value || '';
    shot.batchNum = Math.max(1, Number($('#ttShotBatch')?.value) || 1);
    shot.generationRound = Math.max(0, Number($('#ttShotRound')?.value) || 0);
    // 首尾帧是生成模式的输入位，不占参考槽位，所以单独存素材 id。
    shot.frames = {first:$('#ttShotFirstFrame')?.value || '', last:$('#ttShotLastFrame')?.value || ''};
    shot.updatedAt = core.nowIso();
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
  }
  async function persist() {
    state.updatedAt = core.nowIso();
    state.workspace = 'typetale';
    const root = projectPath();
    if (!root) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(storageKeyFor(root), JSON.stringify(state));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({workspace:'typetale', projectPath:root, updatedAt:state.updatedAt}));
    if (!bridge()?.typetaleWriteState) return;
    const result = await bridge().typetaleWriteState(root, state).catch(error => ({ok:false, error:String(error?.message || error)}));
    if (result?.ok === false) log(`工作区保存失败：${result.error}`, 'error');
  }
  function applyProjectState(nextState, root) {
    const normalized = core.normalizeState({...(nextState || {}), projectPath:root || nextState?.projectPath || ''});
    normalized.workspace = 'typetale';
    normalized.assets = core.scopeAssetsToProject(normalized.assets, normalized.projectPath);
    normalized.shots = core.pruneShotAssetBindings(normalized.shots, normalized.assets);
    state = normalized;
  }
  async function loadState() {
    const root = projectPath();
    if (!root) {
      applyProjectState({}, '');
      renderAll();
      return;
    }
    state.projectPath = root;
    if (!bridge()?.typetaleReadState) {
      applyProjectState(readLocalState(root) || {projectPath:root}, root);
      renderAll();
      return;
    }
    const result = await bridge().typetaleReadState(root).catch(() => null);
    applyProjectState(result?.state || readLocalState(root) || {projectPath:root}, root);
    renderAll();
  }
  function renderHeader() {
    const root = projectPath();
    $('#ttProjectName').textContent = root ? basename(root) : '未选择项目';
    $('#ttProjectPath').textContent = root || '请从项目管理打开字字动画项目；与即梦项目完全隔离';
  }
  function renderShots() {
    const list = $('#ttShotList');
    list.innerHTML = '';
    $('#ttShotCount').textContent = `${state.shots.length} 段`;
    const done = state.shots.filter(shot => shot.status === 'done').length;
    $('#ttQueueStat').textContent = state.shots.length ? `已完成 ${done} / ${state.shots.length}` : '待解析';
    $('#ttQueuePercent').textContent = state.shots.length ? `${Math.round(done / state.shots.length * 100)}%` : '0%';
    $('#ttProgress').style.width = state.shots.length ? `${Math.round(done / state.shots.length * 100)}%` : '0%';
    for (const shot of state.shots) {
      const item = document.createElement('div');
      item.className = `tt-shot-item${shot.id === state.activeShotId ? ' active' : ''}`;
      item.innerHTML = `<span class="num">${escapeHtml(shot.id)}</span><div><strong>${escapeHtml(shot.title || `视频 ${shot.id}`)}</strong><small>${STATUS_LABEL[shot.status] || shot.status} · ${shot.prompt.length} 字${shot.remoteId ? ` · ${escapeHtml(shot.remoteId)}` : ''}</small></div>`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = shot.selected !== false;
      checkbox.title = '加入批量执行';
      checkbox.onclick = event => event.stopPropagation();
      checkbox.onchange = () => { shot.selected = checkbox.checked; scheduleSave(); };
      item.append(checkbox);
      item.onclick = () => selectShot(shot.id);
      list.append(item);
    }
    if (!state.shots.length) {
      const empty = document.createElement('div');
      empty.className = 'tt-current';
      empty.innerHTML = '<b>还没有分镜</b><span>粘贴整稿后点击“解析分镜”，或点击“新增”手动创建。</span>';
      list.append(empty);
    }
  }
  function renderEditor() {
    const shot = activeShot();
    $('#ttEditorTitle').textContent = shot ? `视频 ${shot.id} · ${shot.title}` : '选择左侧分镜';
    $('#ttShotStatus').textContent = STATUS_LABEL[shot?.status] || '待准备';
    $('#ttShotStatus').className = `tt-pill ${shot?.status || ''}`;
    $('#ttShotTitle').value = shot?.title || '';
    $('#ttShotPrompt').value = shot?.prompt || '';
    $('#ttShotNegative').value = shot?.negativePrompt || '';
    $('#ttShotBatch').value = shot?.batchNum || 1;
    $('#ttShotRound').value = shot?.generationRound ?? 0;
    for (const field of ['#ttShotTitle', '#ttShotPrompt', '#ttShotNegative', '#ttShotBatch', '#ttShotRound', '#ttShotFirstFrame', '#ttShotLastFrame']) {
      $(field).disabled = !shot;
    }
    renderAssets();
    renderFrameSelects(shot);
    renderCompiledPreview();
  }
  // 首尾帧只能选图片素材：fl2v 的两个输入位吃的是图，选到音频只会让请求在后端报错。
  function renderFrameSelects(shot) {
    const images = state.assets.filter(asset => asset.mediaType !== 'audio' && asset.mediaType !== 'video');
    for (const [selector, key] of [['#ttShotFirstFrame', 'first'], ['#ttShotLastFrame', 'last']]) {
      const select = $(selector);
      if (!select) continue;
      const current = shot?.frames?.[key] || '';
      select.innerHTML = `<option value="">不使用</option>${images.map(asset => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}</option>`).join('')}`;
      select.value = images.some(asset => asset.id === current) ? current : '';
    }
  }
  function renderAssets() {
    const box = $('#ttAssetList');
    const shot = activeShot();
    const root = projectPath();
    const kind = $('#ttAssetKind')?.value || 'characters';
    box.innerHTML = '';
    if (!root) {
      state.assets = [];
      state.shots = core.pruneShotAssetBindings(state.shots, state.assets);
      box.innerHTML = '<div class="tt-current"><b>未选择项目</b><span>角色和场景素材只会加载当前项目，请先选择项目。</span></div>';
      return;
    }
    state.assets = core.scopeAssetsToProject(state.assets, root);
    state.shots = core.pruneShotAssetBindings(state.shots, state.assets);
    const assets = state.assets.filter(asset => asset.kind === kind);
    if (!assets.length) {
      const label = KIND_LABEL[kind] || '素材';
      box.innerHTML = `<div class="tt-current"><b>当前项目暂无${escapeHtml(label)}</b><span>只显示当前作品目录里的素材，不会读取其他项目。</span></div>`;
      return;
    }
    const bound = new Set(shot?.bindings?.assetIds || []);
    for (const asset of assets) {
      const row = document.createElement('label');
      row.className = `tt-asset-item${bound.has(asset.id) ? ' bound' : ''}`;
      row.innerHTML = `<input type="checkbox" ${bound.has(asset.id) ? 'checked' : ''} ${shot ? '' : 'disabled'}><span><b>${escapeHtml(asset.name)}</b><small>${KIND_LABEL[asset.kind] || asset.kind} · ${escapeHtml(asset.path)}</small></span><button type="button" ${shot ? '' : 'disabled'}>@引用</button>`;
      const checkbox = row.querySelector('input');
      checkbox.onchange = () => {
        if (!shot) return;
        const ids = new Set(shot.bindings.assetIds);
        checkbox.checked ? ids.add(asset.id) : ids.delete(asset.id);
        shot.bindings.assetIds = [...ids];
        scheduleSave();
        renderCompiledPreview();
      };
      row.querySelector('button').onclick = event => {
        event.preventDefault();
        insertMention(asset);
      };
      box.append(row);
    }
  }
  function renderProviders() {
    const select = $('#ttProviderSelect');
    select.innerHTML = '';
    for (const provider of state.providers) {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = provider.name;
      select.append(option);
    }
    if (!state.providers.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '未配置通道';
      select.append(option);
    }
    select.value = activeProvider()?.id || '';
    fillProviderForm();
    const provider = activeProvider();
    const summary = $('#ttProviderSummary');
    if (summary) summary.textContent = provider ? `${provider.name} · ${provider.type === 'generic-video' ? provider.baseUrl || '未填 Base URL' : provider.type === 'cli' ? provider.command || '未填命令' : provider.pluginPath || '未选插件'}` : '在左侧“模型”中配置 API、插件或 CLI。';
  }
  function familyOverridesFor(kind) {
    return core.normalizeFamilyOverrides(state.familyOverrides)[families.safeKind(kind)] || {};
  }
  // 族下拉：没选过就按模型名推断一个默认显示值，但不写盘 —— 落盘即视为用户手动
  // 选择过，之后再换模型也不该把用户选的族冲掉。
  function renderFamilySelect(provider) {
    const select = $('#ttProviderFamily');
    const note = $('#ttFamilyNote');
    if (!select) return;
    const kind = families.safeKind(provider.kind);
    const overrides = familyOverridesFor(kind);
    const list = families.listFamilies(kind, overrides);
    const resolved = core.resolveFamily(provider, state.familyOverrides);
    select.innerHTML = list.map(family => {
      const marks = [family.builtin ? '' : '自建', family.modified ? '已修改' : ''].filter(Boolean).join(' · ');
      return `<option value="${escapeHtml(family.id)}">${escapeHtml(family.name)}${marks ? `（${escapeHtml(marks)}）` : ''}</option>`;
    }).join('');
    select.value = provider.modelFamily || resolved.id;
    if (!note) return;
    const limits = families.familyLimits(resolved);
    const limitText = families.limitKeysFor(kind)
      .map(key => `${({images:'参考图', videos:'参考视频', audios:'参考音频'})[key]} ${limits[key] === null ? '不限' : limits[key]}`)
      .join(' · ');
    const chip = resolved.expand_chips ? families.chipToken(resolved, 'image', 1) : '保持 @实体名 原文';
    note.textContent = `${provider.modelFamily ? '已手动选择' : `按模型名推断为 ${resolved.name}`} · chip：${chip} · ${limitText}${resolved.note ? ` · ${resolved.note}` : ''}`;
  }
  function fillProviderForm() {
    const provider = activeProvider() || core.normalizeProvider({name:'通用视频 API'});
    $('#ttProviderName').value = provider.name || '';
    $('#ttProviderType').value = provider.type || 'generic-video';
    $('#ttProviderKind').value = provider.kind || 'video';
    renderFamilySelect(provider);
    $('#ttProviderBaseUrl').value = provider.baseUrl || '';
    $('#ttProviderApiKey').value = provider.apiKey || '';
    $('#ttProviderModel').value = provider.model || '';
    $('#ttProviderDuration').value = provider.duration || '10';
    $('#ttProviderAspect').value = provider.aspectRatio || '16:9';
    $('#ttProviderResolution').value = provider.resolution || '720p';
    $('#ttProviderRefMode').value = provider.referenceMode || 'paths';
    $('#ttProviderPlugin').value = provider.pluginPath || provider.pluginName || '';
    $('#ttProviderCommand').value = provider.command || '';
    $('#ttProviderArgs').value = (provider.argsTemplate || []).join('|');
  }
  function providerFromForm(existing = null) {
    const provider = core.normalizeProvider({...(existing || {}),
      id:existing?.id || core.makeId('provider'),
      name:$('#ttProviderName').value || '未命名通道',
      type:$('#ttProviderType').value,
      kind:$('#ttProviderKind').value,
      modelFamily:$('#ttProviderFamily').value,
      baseUrl:$('#ttProviderBaseUrl').value,
      apiKey:$('#ttProviderApiKey').value,
      model:$('#ttProviderModel').value,
      duration:$('#ttProviderDuration').value,
      aspectRatio:$('#ttProviderAspect').value,
      resolution:$('#ttProviderResolution').value,
      referenceMode:$('#ttProviderRefMode').value,
      pluginPath:$('#ttProviderPlugin').value,
      command:$('#ttProviderCommand').value,
      argsTemplate:$('#ttProviderArgs').value.split('|').map(item => item.trim()).filter(Boolean),
    });
    return provider;
  }
  function renderJobs() {
    const box = $('#ttJobList');
    box.innerHTML = '';
    for (const job of state.jobs.slice(0, 30)) {
      const shot = state.shots.find(item => item.id === job.shotId);
      const provider = state.providers.find(item => item.id === job.providerId);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tt-job';
      row.innerHTML = `<b>${escapeHtml(shot?.title || job.shotId || '任务')} · ${STATUS_LABEL[job.status] || job.status}</b><small>${escapeHtml(provider?.name || '未配置')} · ${escapeHtml(job.message || job.remoteId || job.resultUrl || '')}</small>`;
      row.onclick = () => { selectedJobId = job.id; renderJobs(); $('#ttProviderStatus').textContent = job.message || job.remoteId || job.status; };
      if (job.id === selectedJobId) row.style.borderColor = '#e78bad';
      box.append(row);
    }
    if (!state.jobs.length) box.innerHTML = '<div class="tt-current"><b>暂无任务</b><span>提交分镜后会记录远程任务、结果和错误。</span></div>';
  }
  function renderLogs() {
    const box = $('#ttLogs');
    if (!box) return;
    box.innerHTML = '';
    for (const item of state.logs.slice(0, 60)) {
      const row = document.createElement('div');
      row.className = item.type === 'error' ? 'error' : '';
      row.textContent = `${new Date(item.time).toLocaleTimeString()}  ${item.message}`;
      box.append(row);
    }
  }
  function compileShot(shot) {
    return core.compilePrompt(shot, state.assets, {
      provider:activeProvider() || {kind:'video'},
      familyOverrides:state.familyOverrides,
    });
  }
  function renderCompiledPreview() {
    const shot = activeShot();
    if (!shot) {
      $('#ttCompiledPreview').textContent = '尚未编译';
      $('#ttReferenceList').textContent = '无参考图';
      return null;
    }
    const compiled = compileShot(shot);
    $('#ttCompiledPreview').textContent = compiled.prompt || '空提示词';
    const rows = [];
    // 槽位号按媒体类型独立计数，和 payload、参考前缀用的是同一套编号。
    for (const reference of compiled.references) {
      const media = ({image:'图', video:'视频', audio:'音频'})[reference.mediaType] || '图';
      const token = reference.token ? `<code>${escapeHtml(reference.token)}</code>` : '<i>不展开</i>';
      rows.push(`<div><b>${escapeHtml(media)}${reference.index}</b> · ${escapeHtml(reference.name)} ${token}<br><small>${escapeHtml(reference.path)}</small></div>`);
    }
    if (compiled.frames.first) rows.push(`<div class="tt-frame-row"><b>首帧</b> · <small>${escapeHtml(compiled.frames.first)}</small></div>`);
    if (compiled.frames.last) rows.push(`<div class="tt-frame-row"><b>尾帧</b> · <small>${escapeHtml(compiled.frames.last)}</small></div>`);
    // 超限素材既不进 payload 也不进前缀，必须让用户看见，否则会以为图带上了。
    for (const item of compiled.overflow) {
      rows.push(`<div class="tt-overflow-row"><b>超出族上限</b> · ${escapeHtml(item.name)}<br><small>${escapeHtml(item.mediaType)} 上限 ${item.limit}，这张不会发给模型</small></div>`);
    }
    $('#ttReferenceList').innerHTML = rows.length ? rows.join('') : '无参考图';
    const notes = [];
    if (compiled.missingMentions.length) notes.push(`未匹配素材：${compiled.missingMentions.join('、')}`);
    if (compiled.overflow.length) notes.push(`${compiled.overflow.length} 个素材超出 ${compiled.family.name} 上限，未发送`);
    if (notes.length) $('#ttProviderStatus').textContent = notes.join('；');
    return compiled;
  }
  function renderAll() {
    renderHeader();
    $('#ttSourceText').value = state.sourceText || '';
    renderShots();
    renderEditor();
    renderProviders();
    renderJobs();
    renderLogs();
  }
  function selectShot(id) {
    syncShotFromEditor();
    state.activeShotId = id;
    renderShots();
    renderEditor();
    scheduleSave();
  }
  function insertMention(asset) {
    const textarea = $('#ttShotPrompt');
    const shot = activeShot();
    if (!shot || !asset) return;
    const token = `@${asset.name}`;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + token.length;
    syncShotFromEditor();
    if (!shot.bindings.assetIds.includes(asset.id)) shot.bindings.assetIds.push(asset.id);
    renderAssets();
    renderCompiledPreview();
    scheduleSave();
  }
  async function refreshAssets() {
    const root = projectPath();
    if (!root || !bridge()?.assetList) { renderAssets(); return; }
    const result = await bridge().assetList(root, state.sourceText).catch(error => ({ok:false, error:String(error?.message || error)}));
    if (result?.ok === false) {
      state.assets = [];
      state.shots = core.pruneShotAssetBindings(state.shots, state.assets);
      renderAssets();
      renderCompiledPreview();
      log(`素材刷新失败：${result.error}`, 'error');
      return;
    }
    const previous = new Map(state.assets.map(asset => [asset.id, asset]));
    const scanned = (result?.assets || []).map((item, index) => ({...(previous.get(item.relativePath) || {}),
      id:item.relativePath || item.id || `asset-${index}`,
      path:item.relativePath || item.path || '',
      name:item.displayName || item.name,
      kind:item.kind === 'groups' ? 'characters' : item.kind,
      mediaType:item.mediaType,
      projectPath:root,
    }));
    state.assets = core.scopeAssetsToProject(scanned, root);
    state.shots = core.pruneShotAssetBindings(state.shots, state.assets);
    renderAssets();
    renderCompiledPreview();
  }
  async function importAssets() {
    const root = projectPath();
    if (!root || !bridge()?.assetImportPaths) {
      log('请先选择项目；素材只会导入当前项目，不会写入全局资产库', 'error');
      return;
    }
    const files = await bridge()?.chooseFiles?.();
    if (!files?.length) return;
    const result = await bridge().assetImportPaths(root, files).catch(error => ({ok:false, error:String(error?.message || error)}));
    if (result?.ok === false) { log(`素材导入失败：${result.error}`, 'error'); return; }
    await refreshAssets();
    log(`已导入 ${result?.added?.length || files.length} 个素材到当前项目`);
    scheduleSave();
  }
  function parseShots() {
    syncShotFromEditor();
    state.sourceText = $('#ttSourceText').value;
    const parsed = core.splitShots(state.sourceText);
    const previous = new Map(state.shots.map(shot => [shot.id, shot]));
    state.shots = parsed.map((shot, index) => {
      const old = previous.get(shot.id);
      return old ? {...shot, bindings:old.bindings, status:old.status, selected:old.selected, remoteId:old.remoteId, resultUrl:old.resultUrl, outputPath:old.outputPath, error:old.error} : core.normalizeShot(shot, index);
    });
    state.activeShotId = state.shots[0]?.id || '';
    renderShots();
    renderEditor();
    scheduleSave();
    log(`解析完成：${state.shots.length} 个分镜`);
  }
  function addShot() {
    syncShotFromEditor();
    const next = String(state.shots.length + 1).padStart(2, '0');
    const shot = core.normalizeShot({id:next, title:`视频 ${next}`, prompt:`【视频编号${next}】\n`, status:'ready'}, state.shots.length);
    state.shots.push(shot);
    state.activeShotId = shot.id;
    renderShots();
    renderEditor();
    scheduleSave();
  }
  function compileActive() {
    const shot = activeShot();
    if (!shot) return null;
    syncShotFromEditor();
    const compiled = renderCompiledPreview();
    scheduleSave();
    if (compiled.missingMentions.length) log(`提示词中有未匹配素材：${compiled.missingMentions.join('、')}`, 'error');
    for (const item of compiled.overflow) {
      log(`${item.name} 超出「${compiled.family.name}」的${item.mediaType}上限（${item.limit}），不会发给模型`, 'error');
    }
    return compiled;
  }
  function findResultValue(value) {
    if (!value) return '';
    if (typeof value === 'string' && (/^https?:\/\//i.test(value) || /\.(mp4|mov|webm|mkv)(?:[?#]|$)/i.test(value) || /^[a-z]:[\\/]/i.test(value))) return value;
    if (Array.isArray(value)) { for (const item of value) { const found = findResultValue(item); if (found) return found; } }
    if (typeof value === 'object') { for (const item of Object.values(value)) { const found = findResultValue(item); if (found) return found; } }
    return '';
  }
  async function submitShot(shot) {
    const provider = activeProvider();
    if (!shot || !provider) { log('请先选择分镜并配置 Provider', 'error'); return false; }
    const compiled = compileShot(shot);
    if (!compiled.prompt.trim()) { log(`视频 ${shot.id} 提示词为空`, 'error'); return false; }
    for (const item of compiled.overflow) {
      log(`视频 ${shot.id}：${item.name} 超出「${compiled.family.name}」上限，未随请求发送`, 'error');
    }
    const job = core.normalizeJob({shotId:shot.id, providerId:provider.id, status:'running', message:'正在提交'});
    state.jobs.unshift(job);
    selectedJobId = job.id;
    shot.status = 'running';
    shot.error = '';
    $('#ttRunStatus').textContent = '执行中';
    $('#ttCurrentStep').textContent = `提交视频 ${shot.id}`;
    $('#ttCurrentDetail').textContent = provider.type === 'generic-video' ? provider.baseUrl : provider.type === 'cli' ? provider.command : provider.pluginPath;
    renderShots(); renderJobs();
    try {
      if (!bridge()?.typetaleExecute) throw new Error('桌面桥不可用，无法提交任务');
      const result = await bridge().typetaleExecute({
        projectPath:projectPath(), provider, shot, assets:state.assets, compiled,
        familyOverrides:state.familyOverrides,
      });
      if (result?.ok === false) throw new Error(result.error || '提交失败');
      const response = result?.response || result || {};
      if (response?.ok === false) throw new Error(response.statusText || response.payload?.error || response.error || `HTTP ${response.status || ''}`.trim());
      // 插件返回了路径但文件不在盘上，通常是插件吞掉了自己的异常，不能当成功。
      if (response.missingFiles?.length) throw new Error(`插件返回的文件不存在：${response.missingFiles.join('、')}`);
      job.remoteId = response.taskId || '';
      job.resultUrl = response.resultUrl || findResultValue(response.payload || response.files || response.result) || '';
      job.outputPath = response.files?.[0] || response.outputPath || (!/^https?:\/\//i.test(job.resultUrl) ? job.resultUrl : '') || '';
      job.status = provider.type === 'generic-video' && job.remoteId ? 'submitted' : 'done';
      job.message = job.remoteId ? `任务 ${job.remoteId}` : (job.resultUrl || job.outputPath || '执行完成');
      shot.remoteId = job.remoteId;
      shot.resultUrl = job.resultUrl;
      shot.outputPath = job.outputPath;
      shot.status = job.status;
      $('#ttProviderStatus').textContent = job.message;
      log(`视频 ${shot.id} 已提交：${job.message}`);
      return true;
    } catch (error) {
      job.status = 'error';
      job.message = String(error?.message || error);
      shot.status = 'error';
      shot.error = job.message;
      $('#ttProviderStatus').textContent = job.message;
      log(`视频 ${shot.id} 提交失败：${job.message}`, 'error');
      return false;
    } finally {
      job.updatedAt = core.nowIso();
      shot.updatedAt = core.nowIso();
      renderShots(); renderEditor(); renderJobs(); scheduleSave();
      if (!running) $('#ttRunStatus').textContent = '空闲';
    }
  }
  async function runSelected() {
    if (running) return;
    const shots = state.shots.filter(shot => shot.selected !== false && shot.status !== 'done');
    if (!shots.length) { log('没有可执行的选中分镜', 'error'); return; }
    running = true; stopped = false; paused = false;
    $('#ttRunStatus').textContent = '批量执行';
    $('#ttResume').disabled = true;
    try {
      for (const shot of shots) {
        if (stopped) break;
        while (paused && !stopped) await new Promise(resolve => setTimeout(resolve, 300));
        if (stopped) break;
        await submitShot(shot);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      log(stopped ? '批量执行已停止' : '批量执行结束');
    } finally {
      running = false; paused = false; stopped = false;
      $('#ttRunStatus').textContent = '空闲';
      $('#ttPause').disabled = false;
      $('#ttResume').disabled = true;
      renderAll();
      persist();
    }
  }
  async function refreshJob() {
    const shot = activeShot();
    const job = selectedJob();
    const provider = state.providers.find(item => item.id === job?.providerId) || activeProvider();
    const remoteId = job?.remoteId || shot?.remoteId;
    if (!provider || provider.type !== 'generic-video' || !remoteId) { log('当前任务没有可查询的远程视频 ID', 'error'); return; }
    const result = await bridge()?.typetaleQueryVideo?.(provider, remoteId).catch(error => ({ok:false, error:String(error?.message || error)}));
    if (result?.ok === false || result?.response?.ok === false) { log(`查询失败：${result?.error || result?.response?.statusText || '未知错误'}`, 'error'); return; }
    const payload = result?.payload || result;
    const resultUrl = result?.resultUrl || findResultValue(payload);
    if (job) { job.resultUrl = resultUrl || job.resultUrl; job.message = payload?.status || job.message; job.updatedAt = core.nowIso(); }
    if (shot) { shot.resultUrl = resultUrl || shot.resultUrl; if (resultUrl) shot.status = 'done'; }
    $('#ttProviderStatus').textContent = payload?.status || resultUrl || '已查询';
    renderAll(); scheduleSave();
  }
  async function downloadResult() {
    const shot = activeShot();
    const job = selectedJob();
    const provider = state.providers.find(item => item.id === job?.providerId) || activeProvider();
    const resultUrl = job?.resultUrl || shot?.resultUrl;
    if (!provider || !resultUrl) { log('当前任务还没有可下载结果', 'error'); return; }
    const result = await bridge()?.typetaleDownloadResult?.(provider, resultUrl, projectPath(), `${shot?.id || 'video'}-${Date.now()}`).catch(error => ({ok:false, error:String(error?.message || error)}));
    if (result?.ok === false) { log(`下载失败：${result.error}`, 'error'); return; }
    const file = result?.path || '';
    if (job) { job.outputPath = file; job.status = 'done'; }
    if (shot) { shot.outputPath = file; shot.status = 'done'; }
    log(`结果已保存：${file}`);
    renderAll(); scheduleSave();
  }
  async function scanPlugins() {
    const provider = providerFromForm(activeProvider());
    let result;
    if (provider.pluginPath && bridge()?.typetaleScanPlugins) result = await bridge().typetaleScanPlugins(provider.pluginPath);
    else result = await bridge()?.typetaleChoosePluginDir?.();
    if (!result || result.canceled) return;
    const plugins = result.plugins || [];
    $('#ttPluginResults').innerHTML = plugins.length
      ? plugins.map(plugin => {
          // 桥接桩只把调用转发到字字动画本体的 .pyd，拷出来单独跑必崩；
          // .pyd 插件同理。标出来并禁用，免得选了之后在执行阶段才炸。
          const blocked = plugin.bridgeStub || plugin.compiledOnly;
          const tags = [
            plugin.category ? ({image_plugins:'图片', video_plugins:'视频', post_process_plugins:'后处理', tool_plugins:'工具'})[plugin.category] || plugin.category : '',
            plugin.hasUi ? '自带 UI' : '',
            plugin.bridgeStub ? '桥接桩·不可用' : '',
            plugin.compiledOnly ? '仅 .pyd·不可用' : '',
          ].filter(Boolean).join(' · ');
          return `<button type="button" ${blocked ? 'disabled' : ''} class="${blocked ? 'tt-plugin-blocked' : ''}" data-plugin-path="${escapeHtml(plugin.path)}" data-plugin-name="${escapeHtml(plugin.name)}">${escapeHtml(plugin.name)}<br><small>${escapeHtml(tags || plugin.path)}</small></button>`;
        }).join('')
      : '未发现 main.py 插件';
    $('#ttPluginResults').querySelectorAll('button:not([disabled])').forEach(button => button.onclick = () => {
      $('#ttProviderPlugin').value = button.dataset.pluginPath;
      saveProvider({pluginPath:button.dataset.pluginPath, pluginName:button.dataset.pluginName, type:'typetale-plugin'});
      inspectActivePlugin(button.dataset.pluginPath);
    });
    if (result.root) $('#ttProviderPlugin').value = result.root;
    log(`插件扫描完成：${plugins.length} 个`);
  }
  // 读插件自己的 get_info() / get_params()，并按 get_params() 的返回值现画一张参数表。
  // 参数存到插件的 config.json（plugin_utils 的布局），不存进工作区状态：这样插件
  // 自己调 update_plugin_param 写的值，和工作台这里填的值是同一份。
  async function inspectActivePlugin(pluginPath) {
    const box = $('#ttPluginDetail');
    const target = String(pluginPath || activeProvider()?.pluginPath || '').trim();
    if (!box || !target) return;
    if (!bridge()?.typetaleInspectPlugin) { box.textContent = '桌面桥不可用，无法读取插件参数'; return; }
    box.textContent = '正在读取插件信息…';
    const result = await bridge().typetaleInspectPlugin(target, activeProvider() || {})
      .catch(error => ({ok:false, error:String(error?.message || error)}));
    if (result?.ok === false) { box.innerHTML = `<div class="tt-overflow-row"><b>插件加载失败</b><br><small>${escapeHtml(result.error || '')}</small></div>`; return; }
    const info = result.info || {};
    const params = result.params || {};
    const selfUi = String(info.model_family_ui || '').toLowerCase() === 'self';
    const head = `<div class="tt-plugin-info"><b>${escapeHtml(info.name || basename(target))}</b><small>${escapeHtml(info.description || '插件未提供 get_info()')}</small>${info.version ? `<small>版本 ${escapeHtml(info.version)}</small>` : ''}${selfUi ? '<small>该插件自带模型族界面，宿主不再画族下拉</small>' : ''}</div>`;
    const entries = Object.entries(params);
    const form = entries.length
      ? entries.map(([key, value]) => {
          const secret = /(api_?key|token|secret|password|cookie)/i.test(key);
          const type = secret ? 'password' : typeof value === 'number' ? 'number' : 'text';
          return `<label class="tt-field"><span>${escapeHtml(key)}</span><input data-param="${escapeHtml(key)}" type="${type}" value="${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value ?? '')}"></label>`;
        }).join('')
      : '<p class="tt-note">插件没有 get_params()，没有可配置参数。</p>';
    box.innerHTML = `${head}<div class="tt-plugin-params">${form}</div>${entries.length ? '<button type="button" id="ttSavePluginParams" class="tt-primary">保存插件参数</button>' : ''}<p class="tt-note">配置文件：${escapeHtml(result.configPath || '')}</p>`;
    const save = $('#ttSavePluginParams');
    if (!save) return;
    save.onclick = async () => {
      const patch = {};
      box.querySelectorAll('[data-param]').forEach(input => {
        const original = params[input.dataset.param];
        patch[input.dataset.param] = typeof original === 'number' ? Number(input.value) || 0 : input.value;
      });
      const written = await bridge().typetaleWritePluginConfig(target, patch)
        .catch(error => ({ok:false, error:String(error?.message || error)}));
      if (written?.ok === false) { log(`插件参数保存失败：${written.error}`, 'error'); return; }
      if (written?.skippedEmptyOverwrite?.length) log(`已保留原值（不允许被空值覆盖）：${written.skippedEmptyOverwrite.join('、')}`, 'error');
      log(`插件参数已保存：${written?.path || target}`);
    };
  }
  function saveProvider(patch = {}) {
    const existing = activeProvider();
    const provider = providerFromForm(existing);
    Object.assign(provider, patch);
    if (existing) Object.assign(existing, provider);
    else state.providers.push(provider);
    state.activeProviderId = provider.id;
    renderProviders();
    scheduleSave();
    log(`已保存通道：${provider.name}`);
  }
  async function openProject(folder, {announce = true} = {}) {
    const root = String(folder || '').trim();
    if (!root) return;
    clearTimeout(saveTimer);
    const current = projectPath();
    if (current && current !== root) await persist();
    state = core.normalizeState({workspace:'typetale', projectPath:root});
    localStorage.setItem(STORAGE_KEY, JSON.stringify({workspace:'typetale', projectPath:root, updatedAt:core.nowIso()}));
    await loadState();
    await refreshAssets();
    await persist();
    if (announce) log(`已打开字字动画项目：${root}`);
  }
  async function chooseProject() {
    if (window.workbenchChooseProjectForScene) return window.workbenchChooseProjectForScene('typetale');
    const folder = await bridge()?.chooseDirectory?.();
    if (!folder) return;
    await openProject(folder);
  }
  window.typetaleOpenProject = folder => openProject(folder);
  function renderShell() {
    view.innerHTML = `
      <div class="tt-shell">
        <aside class="tt-rail" aria-label="字字动画通道">
          <button type="button" data-tt-drawer="provider" title="模型通道"><span>模</span><small>模型</small></button>
          <button type="button" data-tt-drawer="assets" data-asset-kind="characters" title="角色素材"><span>人</span><small>角色</small></button>
          <button type="button" data-tt-drawer="assets" data-asset-kind="scenes" title="场景素材"><span>景</span><small>场景</small></button>
          <button type="button" data-tt-drawer="plugins" title="字字动画插件"><span>件</span><small>插件</small></button>
          <button type="button" data-tt-drawer="cli" title="网站 CLI"><span>令</span><small>CLI</small></button>
          <button type="button" data-tt-drawer="jobs" title="任务队列"><span>务</span><small>任务</small></button>
          <button type="button" data-tt-drawer="project" title="项目"><span>项</span><small>项目</small></button>
        </aside>
        <aside class="tt-drawer" id="ttDrawer" hidden>
          <div class="tt-drawer-head"><div><small>CHANNEL</small><b id="ttDrawerTitle">模型通道</b></div><button id="ttDrawerClose" type="button" aria-label="关闭">×</button></div>
          <div class="tt-drawer-body">
            <section data-tt-panel="provider">
              <div class="tt-field"><span>当前通道</span><div class="tt-inline"><select id="ttProviderSelect"></select><button id="ttAddProvider" type="button">＋</button></div></div>
              <div class="tt-field"><span>名称</span><input id="ttProviderName" placeholder="通道名称"></div>
              <div class="tt-field"><span>类型</span><select id="ttProviderType"><option value="generic-video">通用视频 API</option><option value="typetale-plugin">字字动画插件</option><option value="cli">网站 CLI</option></select></div>
              <div class="tt-field"><span>Base URL</span><input id="ttProviderBaseUrl" placeholder="https://api.example.com"></div>
              <div class="tt-field"><span>API Key</span><input id="ttProviderApiKey" type="password" placeholder="只保存在本地工作区"></div>
              <div class="tt-field"><span>模型</span><input id="ttProviderModel" placeholder="模型名"></div>
              <div class="tt-field"><span>模型类型</span><select id="ttProviderKind"><option value="video">视频模型</option><option value="image">图片模型</option></select></div>
              <div class="tt-field"><span>模型族</span><select id="ttProviderFamily"></select><small id="ttFamilyNote" class="tt-note">族决定 @素材 展开成什么 token、参考前缀怎么出、最多带几张素材。</small></div>
              <div class="tt-field"><span>参数</span><div class="tt-provider-row"><input id="ttProviderDuration" placeholder="时长"><input id="ttProviderAspect" placeholder="比例"><input id="ttProviderResolution" placeholder="分辨率"></div></div>
              <div class="tt-field"><span>参考图</span><select id="ttProviderRefMode"><option value="paths">本地路径</option><option value="data_url">Data URL</option><option value="url">URL</option><option value="none">不带参考图</option></select></div>
              <button id="ttSaveProvider" type="button" class="tt-primary">保存通道</button>
            </section>
            <section data-tt-panel="assets" hidden>
              <div class="tt-field"><span>素材类型</span><select id="ttAssetKind"><option value="characters">角色</option><option value="scenes">场景</option><option value="props">道具</option><option value="other">素材</option></select></div>
              <div class="tt-actions"><button id="ttImportAssets" type="button" class="tt-primary">导入素材</button><button id="ttRefreshAssets" type="button">刷新项目素材</button></div>
              <div id="ttAssetList" class="tt-asset-list"></div>
            </section>
            <section data-tt-panel="plugins" hidden>
              <div class="tt-field"><span>插件目录</span><input id="ttProviderPlugin" placeholder="选择 plugins 目录或单个插件目录"></div>
              <button id="ttScanPlugins" type="button" class="tt-primary">扫描插件</button>
              <div id="ttPluginResults" class="tt-plugin-results"></div>
              <div id="ttPluginDetail" class="tt-plugin-detail"></div>
            </section>
            <section data-tt-panel="cli" hidden>
              <div class="tt-field"><span>CLI 命令</span><input id="ttProviderCommand" placeholder="例如 C:\\Tools\\ai.exe"></div>
              <div class="tt-field"><span>参数模板</span><input id="ttProviderArgs" placeholder="用 | 分隔；支持 {prompt} {shotId}"></div>
              <p class="tt-note">提交分镜时会用当前提示词、分镜编号、参考图路径替换模板变量。</p>
            </section>
            <section data-tt-panel="jobs" hidden>
              <div class="tt-current"><b id="ttCurrentStep">等待任务</b><span id="ttCurrentDetail">配置 Provider 后可提交当前分镜或批量执行。</span></div>
              <div class="tt-actions"><button id="ttPause" type="button">暂停</button><button id="ttResume" type="button" disabled>继续</button><button id="ttStop" type="button" class="danger">停止</button><button id="ttRefreshJob" type="button">查询</button><button id="ttDownloadResult" type="button">下载结果</button></div>
              <div id="ttJobList" class="tt-job-list"></div>
              <div id="ttLogs" class="tt-logs"></div>
            </section>
            <section data-tt-panel="project" hidden>
              <div class="tt-current"><b id="ttProjectName">未选择项目</b><span id="ttProjectPath">请从项目管理打开字字动画项目；与即梦项目完全隔离</span></div>
              <div class="tt-actions"><button id="ttChooseProject" type="button" class="tt-primary">选择项目</button><button id="ttOpenOutput" type="button">打开输出</button><button id="ttSaveState" type="button">保存工作区</button></div>
            </section>
          </div>
        </aside>
        <main class="tt-main">
          <div class="tt-topbar"><div class="tt-title"><span class="tt-logo">字</span><div><b>字字动画工作区</b><small>分镜 / 参考图 / 模型通道</small></div></div><div class="tt-top-status"><span id="ttProviderStatus">未提交</span><span id="ttRunStatus" class="tt-pill">空闲</span></div></div>
          <div class="tt-table">
            <aside class="tt-shots-panel"><div class="tt-panel-head"><div><small>SHOT LIST</small><h2>分镜列表</h2></div><span id="ttShotCount" class="tt-count">0 段</span></div><textarea id="ttSourceText" class="tt-source" placeholder="粘贴包含【视频编号】或【分镜】的文本…"></textarea><div class="tt-actions"><button id="ttParseShots" type="button" class="tt-primary">解析分镜</button><button id="ttAddShot" type="button">＋ 新增</button></div><div class="tt-progress"><i id="ttProgress"></i></div><div class="tt-queue-meta"><span id="ttQueueStat">待解析</span><b id="ttQueuePercent">0%</b></div><div id="ttShotList" class="tt-shot-list"></div></aside>
            <section class="tt-detail-panel"><div class="tt-panel-head"><div><small>SHOT EDITOR</small><h2 id="ttEditorTitle">选择左侧分镜</h2></div><span id="ttShotStatus" class="tt-pill">待准备</span></div><input id="ttShotTitle" class="tt-title-input" placeholder="分镜标题"><div class="tt-preview-grid"><div class="tt-preview-card"><small>分镜预览</small><div class="tt-preview-empty">生成后可在此管理结果</div></div><div class="tt-reference-card"><small>参考项</small><div id="ttReferenceList" class="tt-reference-list">无参考图</div></div></div><div class="tt-prompt-card"><div class="tt-prompt-head"><b>提示词</b><span>输入 @角色名 / @场景名 / @素材名 绑定参考图</span></div><textarea id="ttShotPrompt" class="tt-prompt" placeholder="输入视频提示词…"></textarea><div class="tt-shot-params"><label><span>首帧</span><select id="ttShotFirstFrame"></select></label><label><span>尾帧</span><select id="ttShotLastFrame"></select></label><label><span>批量</span><input id="ttShotBatch" type="number" min="1" max="8" value="1"></label><label><span>轮次</span><input id="ttShotRound" type="number" min="0" max="99" value="0"></label></div><textarea id="ttShotNegative" class="tt-negative" placeholder="负向提示词（可留空）"></textarea></div><div class="tt-generate-bar"><button id="ttCompile" type="button">编译提示词</button><button id="ttSubmitShot" type="button" class="tt-primary">生成视频</button><button id="ttQueueSelected" type="button">批量执行所选</button><button id="ttMarkDone" type="button">标记完成</button></div></section>
            <aside class="tt-side-panel"><div class="tt-panel-head"><div><small>REFERENCE</small><h2>参考项</h2></div></div><div class="tt-side-block"><b>编译后的提示词</b><pre id="ttCompiledPreview">尚未编译</pre></div><div class="tt-side-block"><b>通道摘要</b><p id="ttProviderSummary">在左侧“模型”中配置 API、插件或 CLI。</p></div></aside>
          </div>
        </main>
      </div>`;
  }

  function bindEvents() {
    const drawerTitles = {provider:'模型通道', assets:'素材通道', plugins:'字字动画插件', cli:'网站 CLI', jobs:'任务队列', project:'项目设置'};
    const openDrawer = (name, assetKind = '') => {
      $('#ttDrawer').hidden = false;
      $('#ttDrawerTitle').textContent = drawerTitles[name] || '通道';
      document.querySelectorAll('[data-tt-panel]').forEach(panel => { panel.hidden = panel.dataset.ttPanel !== (name === 'assets' ? 'assets' : name); });
      document.querySelectorAll('[data-tt-drawer]').forEach(button => button.classList.toggle('active', button.dataset.ttDrawer === name && (!assetKind || button.dataset.assetKind === assetKind)));
      if (assetKind && $('#ttAssetKind')) $('#ttAssetKind').value = assetKind;
      if (name === 'assets') renderAssets();
    };
    const closeDrawer = () => { $('#ttDrawer').hidden = true; document.querySelectorAll('[data-tt-drawer]').forEach(button => button.classList.remove('active')); };
    document.querySelectorAll('[data-tt-drawer]').forEach(button => button.onclick = () => openDrawer(button.dataset.ttDrawer, button.dataset.assetKind || ''));
    $('#ttDrawerClose').onclick = closeDrawer;
    view.querySelector('.tt-main')?.addEventListener('click', () => { if (!$('#ttDrawer').hidden) closeDrawer(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !view.hidden && !$('#ttDrawer').hidden) closeDrawer(); });
    $('#ttSourceText').addEventListener('input', event => { state.sourceText = event.target.value; scheduleSave(); });
    $('#ttShotTitle').addEventListener('input', () => { syncShotFromEditor(); scheduleSave(); });
    $('#ttShotPrompt').addEventListener('input', () => { syncShotFromEditor(); renderCompiledPreview(); scheduleSave(); });
    $('#ttShotNegative').addEventListener('input', () => { syncShotFromEditor(); scheduleSave(); });
    for (const selector of ['#ttShotFirstFrame', '#ttShotLastFrame', '#ttShotBatch', '#ttShotRound']) {
      $(selector).addEventListener('change', () => { syncShotFromEditor(); renderCompiledPreview(); scheduleSave(); });
    }
    $('#ttParseShots').onclick = parseShots;
    $('#ttAddShot').onclick = addShot;
    $('#ttChooseProject').onclick = chooseProject;
    $('#ttSaveState').onclick = () => persist().then(() => log('工作区已保存'));
    $('#ttImportAssets').onclick = importAssets;
    $('#ttRefreshAssets').onclick = refreshAssets;
    $('#ttAssetKind').onchange = renderAssets;
    $('#ttCompile').onclick = compileActive;
    $('#ttSubmitShot').onclick = () => submitShot(activeShot());
    $('#ttQueueSelected').onclick = runSelected;
    $('#ttMarkDone').onclick = () => { const shot = activeShot(); if (shot) { shot.status = 'done'; renderShots(); renderEditor(); scheduleSave(); } };
    $('#ttProviderSelect').onchange = event => { state.activeProviderId = event.target.value; fillProviderForm(); scheduleSave(); };
    $('#ttAddProvider').onclick = () => { const provider = core.normalizeProvider({id:core.makeId('provider'), name:`通道 ${state.providers.length + 1}`}); state.providers.push(provider); state.activeProviderId = provider.id; renderProviders(); scheduleSave(); };
    $('#ttSaveProvider').onclick = () => saveProvider();
    // 改模型名只刷新推断出的默认族显示，不写盘；改 kind 要重列族（图片族与视频族互不混用）。
    $('#ttProviderModel').addEventListener('input', () => renderFamilySelect(providerFromForm(activeProvider())));
    $('#ttProviderKind').onchange = () => { const provider = providerFromForm(activeProvider()); provider.modelFamily = ''; renderFamilySelect(provider); };
    $('#ttProviderFamily').onchange = () => { saveProvider(); renderCompiledPreview(); };
    $('#ttScanPlugins').onclick = scanPlugins;
    $('#ttProviderPlugin').addEventListener('change', () => inspectActivePlugin($('#ttProviderPlugin').value));
    $('#ttPause').onclick = () => { if (!running) return; paused = true; $('#ttResume').disabled = false; $('#ttRunStatus').textContent = '已暂停'; };
    $('#ttResume').onclick = () => { paused = false; $('#ttResume').disabled = true; $('#ttRunStatus').textContent = '批量执行'; };
    $('#ttStop').onclick = () => { stopped = true; paused = false; $('#ttRunStatus').textContent = '正在停止'; };
    $('#ttRefreshJob').onclick = refreshJob;
    $('#ttDownloadResult').onclick = downloadResult;
    $('#ttOpenOutput').onclick = () => bridge()?.typetaleOpenOutputDir?.(projectPath());
    window.addEventListener('typetale:scene-shown', async () => { await loadState(); await refreshAssets(); });
  }
  renderShell();
  bindEvents();
  renderAll();
  loadState();
})();
