(() => {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = 'project-page.css'; document.head.appendChild(style);
  const bridge = window.desktopBridge;
  if (!bridge) return;
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isSending = () => Boolean(window.typetaleIsRunning?.()) || /运行|执行中|发送中/.test($('#runStatus')?.textContent || '');
  const WORKSPACES = {
    jimeng: {label:'即梦自动发送', short:'即梦项目'},
    typetale: {label:'字字动画工作区', short:'字字动画项目'},
  };
  const normalizeWorkspace = value => value === 'typetale' ? 'typetale' : 'jimeng';
  const samePath = (left, right) => String(left || '').replace(/[\\/]$/, '').toLowerCase() === String(right || '').replace(/[\\/]$/, '').toLowerCase();
  let recent = [];

  async function readRecent() {
    const value = await bridge.readRecent?.();
    const projects = Array.isArray(value?.projects) ? value.projects : [];
    const needsMigration = projects.some(item => item.workspace !== 'jimeng' && item.workspace !== 'typetale');
    recent = projects.map(item => ({...item, workspace:normalizeWorkspace(item.workspace)}));
    if (needsMigration) await writeRecent();
    return recent;
  }
  async function writeRecent() {
    await bridge.writeRecent?.(recent.slice(0, 50));
  }
  function setProjectPage(visible) {
    const page = $('#projectPage');
    if (!page) return;
    if (window.setWorkbenchView) window.setWorkbenchView(visible);
    page.hidden = !visible;
  }
  function modeLabel(mode) { return mode === 'draft' ? '整稿 @' : '分组'; }
  function registeredProject(path) { return recent.find(item => samePath(item.path, path)); }
  function inferredOwner(path, info) {
    const registered = registeredProject(path);
    if (registered) return normalizeWorkspace(registered.workspace);
    if (info?.project?.workspace === 'typetale' || info?.project?.workspace === 'jimeng') return info.project.workspace;
    if (info?.hasProjectConfig) return 'jimeng';
    return info?.hasTypetaleState ? 'typetale' : '';
  }
  function canRegister(path, workspace, info) {
    const owner = inferredOwner(path, info);
    if (!owner || owner === workspace) return true;
    window.alert(`这个文件夹已经属于“${WORKSPACES[owner].label}”，不能再归入“${WORKSPACES[workspace].label}”。\n\n请为两个场景使用不同的项目文件夹，避免素材和状态串在一起。`);
    return false;
  }
  async function registerRecent(path, info, workspace) {
    const name = info?.project?.name || path.split(/[\\/]/).pop() || path;
    recent = recent.filter(item => !samePath(item.path, path));
    recent.unshift({path, name, workspace, lastOpenedAt:new Date().toISOString()});
    await writeRecent();
    return recent[0];
  }
  async function cardFor(item) {
    const info = await bridge.inspectProject?.(item.path);
    const workspace = normalizeWorkspace(item.workspace);
    if (!info?.pathAvailable) return {item:{...item, workspace}, info:{pathAvailable:false}, runs:{runs:[]}};
    let runs = {runs:[]};
    if (workspace === 'jimeng') {
      runs = await bridge.readRuns?.(item.path) || {runs:[]};
      try {
        const live = JSON.parse(localStorage.getItem('jimeng-workbench-project') || '{}');
        if (live.projectPath === item.path && Array.isArray(live.segments)) runs = {runs: live.segments.map(s => ({status:s.status}))};
      } catch (_) {}
    }
    return {item:{...item, workspace}, info, runs};
  }
  function cardHtml(data) {
    const {item, info, runs} = data;
    const project = info.project || {};
    const workspace = normalizeWorkspace(item.workspace);
    const runList = Array.isArray(runs.runs) ? runs.runs : [];
    const failed = runList.filter(x => x.status === 'error' || x.status === 'failed').length;
    const sent = runList.filter(x => x.status === 'done' || x.status === 'sent').length;
    const total = project.prompt?.videoCount || runList.length || 0;
    const pending = Math.max(0, total - sent - failed);
    const counts = info.counts || {};
    const unavailable = info.pathAvailable === false;
    const configWarning = info.configError ? 'project.json 损坏 · 打开后可重新初始化' : '';
    const detail = workspace === 'jimeng'
      ? `<span>投放：${total} 个视频 · 已发 ${sent} · 失败 ${failed} · 未发 ${pending}</span>`
      : '<span>工作区状态与素材绑定只保存在本项目中</span>';
    const mode = workspace === 'jimeng' ? `<span class="mode-badge">${modeLabel(project.mode)}</span>` : '';
    return `<button class="project-card ${unavailable ? 'unavailable' : ''}" data-project-path="${esc(item.path)}">
      <div class="project-card-head"><b>${esc(item.name || project.name || item.path)}</b><span class="workspace-badge ${workspace}">${WORKSPACES[workspace].short}</span>${mode}</div>
      <small>${esc(item.path)}</small>
      <span>人物 ${counts.characters || 0} · 场景 ${counts.scenes || 0} · 音频 ${counts.audio || 0}</span>
      ${detail}
      <small>${unavailable ? '路径不可用 · 重新定位' : (configWarning || `最后操作 ${esc(item.lastOpenedAt || project.lastOpenedAt || '暂无')}`)}</small>
    </button>`;
  }
  async function renderProjectList() {
    const jimengList = $('#projectList');
    const typetaleList = $('#typetaleProjectList');
    if (!jimengList || !typetaleList) return;
    const data = await Promise.all(recent.map(cardFor));
    const failed = data.filter(x => x.item.workspace === 'jimeng' && (x.runs?.runs || []).some(r => r.status === 'error' || r.status === 'failed'));
    const jimeng = data.filter(x => x.item.workspace === 'jimeng' && !failed.includes(x));
    const typetale = data.filter(x => x.item.workspace === 'typetale');
    const render = (target, values) => { target.innerHTML = values.map(cardHtml).join(''); };
    render($('#failedProjectList'), failed);
    render(jimengList, jimeng);
    render(typetaleList, typetale);
    $('#needsAttention').hidden = failed.length === 0;
    $('#jimengProjects').hidden = jimeng.length === 0;
    $('#typetaleProjects').hidden = typetale.length === 0;
    $('#projectEmpty').hidden = data.length > 0;
    document.querySelectorAll('[data-project-path]').forEach(node => node.onclick = () => openProject(node.dataset.projectPath));
  }
  window.renderProjectListPage = renderProjectList;

  async function saveJimengProject(path, info, mode) {
    const project = info.project || {};
    project.name = project.name || path.split(/[\\/]/).pop();
    project.workspace = 'jimeng';
    project.mode = project.mode || mode;
    project.modeLocked = true;
    project.folders = info.folders || project.folders;
    await bridge.saveProject?.(path, project);
    await registerRecent(path, {project}, 'jimeng');
    const draft = await bridge.readDraft?.(path);
    const live = JSON.parse(localStorage.getItem('jimeng-workbench-project') || '{}');
    localStorage.setItem('jimeng-workbench-project', JSON.stringify({
      projectPath:path,
      assetFolders:project.folders,
      mode:project.mode,
      source:draft?.text || (live.projectPath === path ? live.source : '') || '',
      segments:live.projectPath === path ? live.segments || [] : [],
    }));
  }
  async function activateTypetale(path) {
    localStorage.setItem('typetale-workbench-state', JSON.stringify({workspace:'typetale', projectPath:path, updatedAt:new Date().toISOString()}));
    if (window.typetaleOpenProject) await window.typetaleOpenProject(path);
    window.workbenchShowScene?.('typetale');
  }
  async function chooseProject(workspace = 'jimeng') {
    if (isSending()) { window.alert('当前场景正在执行任务，完成或停止后才能切换项目。'); return; }
    workspace = normalizeWorkspace(workspace);
    const path = await bridge.chooseDirectory?.();
    if (!path) return;
    const info = await bridge.inspectProject?.(path);
    if (!info?.pathAvailable || !canRegister(path, workspace, info)) return;
    if (workspace === 'jimeng') {
      const mode = info.project?.mode || (window.confirm('首次打开请选择模式：确定=整稿 @，取消=分组队列') ? 'draft' : 'queue');
      await saveJimengProject(path, info, mode);
      sessionStorage.setItem('jimeng-open-project', '1');
      location.reload();
      return;
    }
    await registerRecent(path, info, 'typetale');
    await activateTypetale(path);
  }
  window.workbenchChooseProjectForScene = chooseProject;

  async function scanProjects() {
    const result = await bridge.scanProjectsRoot?.();
    const box = $('#scanCandidates');
    if (!box || result?.canceled) return;
    box.hidden = false;
    box.innerHTML = `<b>扫描目录：${esc(result.root)}</b>` + (result.candidates || []).map((item, index) => `<label class="scan-candidate ${item.usable ? '' : 'dim'}"><input type="checkbox" data-scan-index="${index}"> <span>${esc(item.name)}</span><small>${item.usable ? '检测到素材或文档' : esc(item.reason)}</small><select data-scan-workspace="${index}" aria-label="${esc(item.name)} 所属场景"><option value="jimeng">即梦自动发送</option><option value="typetale">字字动画工作区</option></select></label>`).join('') + '<button id="importScanned" class="primary">按所选场景纳入项目</button>';
    $('#importScanned').onclick = async () => {
      for (const input of box.querySelectorAll('[data-scan-index]:checked')) {
        const index = Number(input.dataset.scanIndex);
        const item = result.candidates[index];
        const workspace = normalizeWorkspace(box.querySelector(`[data-scan-workspace="${index}"]`)?.value);
        const info = await bridge.inspectProject?.(item.path);
        if (!info?.pathAvailable || !canRegister(item.path, workspace, info)) continue;
        if (workspace === 'jimeng') {
          const mode = info.project?.mode || (window.confirm(`${item.name} 首次打开请选择模式：确定=整稿 @，取消=分组队列`) ? 'draft' : 'queue');
          await saveJimengProject(item.path, info, mode);
        } else {
          await registerRecent(item.path, info, 'typetale');
        }
      }
      await renderProjectList();
    };
  }
  async function openProject(path) {
    if (isSending()) { window.alert('当前项目正在发送，完成或停止后才能切换项目。'); return; }
    const item = registeredProject(path);
    const workspace = normalizeWorkspace(item?.workspace);
    const info = await bridge.inspectProject?.(path);
    if (!info?.pathAvailable) { window.alert('路径不可用，请重新定位项目文件夹。'); return; }
    if (!canRegister(path, workspace, info)) return;
    if (workspace === 'typetale') {
      await registerRecent(path, info, workspace);
      await activateTypetale(path);
      return;
    }
    if (info.configError && !window.confirm('project.json 无法读取，是否按当前文件夹重新初始化？')) return;
    const mode = info.project?.mode || (window.confirm('首次打开请选择模式：确定=整稿 @，取消=分组队列') ? 'draft' : 'queue');
    await saveJimengProject(path, info, mode);
    sessionStorage.setItem('jimeng-open-project', '1');
    location.reload();
  }
  async function refreshWorkspace() {
    if (!localStorage.getItem('jimeng-workbench-project')) return;
    const saved = JSON.parse(localStorage.getItem('jimeng-workbench-project') || '{}');
    if (!saved.projectPath) return;
    const info = await bridge.inspectProject?.(saved.projectPath);
    if (!info?.pathAvailable) return;
    await window.renderProjectAssetIndex?.(saved.projectPath);
  }
  async function init() {
    await readRecent();
    const saved = JSON.parse(localStorage.getItem('jimeng-workbench-project') || '{}');
    const enterWorkspace = sessionStorage.getItem('jimeng-open-project') === '1';
    sessionStorage.removeItem('jimeng-open-project');
    if (!enterWorkspace) {
      setProjectPage(true); await renderProjectList();
    } else if (saved.projectPath) {
      setProjectPage(false); await refreshWorkspace();
      const info = await bridge.inspectProject?.(saved.projectPath);
      if (info?.project?.modeLocked) {
        const lockedMode = info.project.mode;
        const queue = $('#modeQueue'); const draft = $('#modeDraft');
        if (queue) queue.disabled = lockedMode === 'draft';
        if (draft) draft.disabled = lockedMode !== 'draft';
      }
    }
    $('#createProject') && ($('#createProject').onclick = () => chooseProject('jimeng'));
    $('#createTypetaleProject') && ($('#createTypetaleProject').onclick = () => chooseProject('typetale'));
    $('#emptyOpenProject') && ($('#emptyOpenProject').onclick = () => chooseProject('jimeng'));
    $('#emptyOpenTypetaleProject') && ($('#emptyOpenTypetaleProject').onclick = () => chooseProject('typetale'));
    $('#chooseProjectFolder') && ($('#chooseProjectFolder').onclick = () => chooseProject('jimeng'));
    $('#scanProjects') && ($('#scanProjects').onclick = scanProjects);
    $('#emptyScanProjects') && ($('#emptyScanProjects').onclick = scanProjects);
    $('#projectNav') && ($('#projectNav').onclick = () => {
      if (isSending()) return window.alert('当前项目正在发送，完成或停止后才能切换项目。');
      sessionStorage.removeItem('jimeng-open-project');
      setProjectPage(true);
      renderProjectList();
    });
  }
  init();
})();
