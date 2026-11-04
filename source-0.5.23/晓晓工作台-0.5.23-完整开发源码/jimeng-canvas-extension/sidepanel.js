const ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif",
  ".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac",
]);
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MAX_BATCH_BYTES = 160 * 1024 * 1024;
const MAX_LOG_LINES = 300;

const ui = Object.fromEntries([
  "work-mode", "prefix", "prompt", "characters", "files", "file-summary", "batch-preview", "asset-summary",
  "scene-folder", "scene-folder-summary", "match-scenes", "scene-match-preview",
  "add", "clear", "queue", "send-interval", "start", "pause",
  "copy-log", "clear-log", "log-output",
].map((id) => [id.replace(/-/g, "_"), document.getElementById(id)]));

let manualFiles = [];
let sceneFolderFiles = [];
let jobs = [];
let activeBatchId = null;
let logLines = [];
const initializedMentionCharacters = new Set();
const selectedMentionCharacters = new Set();
const verifiedScenes = new Set();

restoreSettings();
restoreLogs();
renderQueue();
markUnrecognized();
restoreActiveBatchState();

ui.files.addEventListener("change", collectFiles);
ui.scene_folder.addEventListener("change", collectSceneFolder);
ui.prompt.addEventListener("input", markUnrecognized);
ui.add.addEventListener("click", addJob);
ui.match_scenes.addEventListener("click", matchSceneAssets);
ui.clear.addEventListener("click", () => {
  if (!jobs.length || confirm(`确定清空 ${jobs.length} 条队列任务吗？`)) {
    jobs = [];
    initializedMentionCharacters.clear();
    selectedMentionCharacters.clear();
    verifiedScenes.clear();
    resetSceneMatchPreview();
    renderQueue();
  }
});
ui.start.addEventListener("click", startBatch);
ui.pause.addEventListener("click", pauseBatch);
ui.copy_log.addEventListener("click", copyLogs);
ui.clear_log.addEventListener("click", clearLogs);
  ui.prefix.addEventListener("change", saveSettings);
  ui.send_interval.addEventListener("change", saveSettings);
ui.work_mode.addEventListener("change", saveSettings);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "BATCH_STATE") {
    setBatchControls(Boolean(message.active), message.batchId || null, Boolean(message.paused));
    appendLog(message.active
      ? `批次 ${message.batchId || "未知"} 已启动${message.paused ? "，已请求暂停" : ""}`
      : `批次 ${message.batchId || "未知"} 已结束`);
    return;
  }
  if (message?.type === "BATCH_LOG") {
    appendLog(message.detail || "批次状态已更新");
    return;
  }
  if (message?.type !== "JOB_STATUS") return;
  const job = jobs.find((item) => item.id === message.jobId);
  if (!job) return;
  job.state = message.state;
  job.detail = message.detail || "";
  appendLog(`${job.label || job.id}｜${stateLabel(job.state)}｜${job.detail || "无详情"}`);
  renderQueue();
});

function collectFiles(event) {
  const merged = [...manualFiles, ...event.target.files];
  const seen = new Set();
  const accepted = merged.filter((file) => {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const key = `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
    if (!ALLOWED_EXTENSIONS.has(ext) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  manualFiles = accepted;
  renderFileSummary();
  // 允许下一次再次选择同一文件；实际 File 对象已经按来源保存。
  event.target.value = "";
}

function renderFileSummary() {
  const bytes = manualFiles.reduce((sum, file) => sum + file.size, 0);
  ui.file_summary.textContent = manualFiles.length
    ? `${manualFiles.length} 个手动附件，共 ${formatBytes(bytes)}：${manualFiles.map((file) => file.name).join("、")}`
    : "未选择附件";
}

function collectSceneFolder(event) {
  sceneFolderFiles = dedupeFiles([...event.target.files].filter(isImageFile));
  ui.scene_folder_summary.textContent = sceneFolderFiles.length
    ? `${sceneFolderFiles.length} 张场景图：${sceneFolderFiles.map((file) => file.name).join("、")}`
    : "所选文件夹中没有可用图片";
  resetSceneMatchPreview();
}

function resetSceneMatchPreview() {
  ui.scene_match_preview.textContent = sceneFolderFiles.length
    ? "文件夹已就绪；请点击“识别场景并匹配图片”。"
    : "尚未执行场景匹配";
  ui.scene_match_preview.dataset.level = "";
  for (const job of jobs) {
    if (!["pending", "failed_before_click", "paused"].includes(job.state)) continue;
    job.sceneMatchReady = false;
  }
}

function isImageFile(file) {
  const ext = String(file?.name || "").slice(String(file?.name || "").lastIndexOf(".")).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"].includes(ext);
}

function fileFingerprint(file) {
  return `${file?.name || ""}:${file?.size || 0}:${file?.lastModified || 0}`;
}

function matchSceneAssets() {
  if (activeBatchId) return alert("发送批次运行中，不能重新匹配场景图片。请先暂停并等待当前任务结束。");
  if (!jobs.length) return alert("请先识别提示词并加入队列。");
  if (!sceneFolderFiles.length) return alert("请先选择包含场景图片的文件夹。");
  const editable = jobs.filter((job) => ["pending", "failed_before_click", "paused"].includes(job.state));
  if (!editable.length) return alert("当前队列没有可重新匹配的待发送任务。");

  const folderFingerprints = new Set(sceneFolderFiles.map(fileFingerprint));
  const lines = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  for (const job of editable) {
    const result = self.JimengLockAnalyzer.matchSceneFiles(job.prompt, sceneFolderFiles);
    job.sceneMatches = result.matches.map((match) => ({
      sceneName: match.sceneName,
      fileName: match.fileName,
    }));
    job.unmatchedScenes = result.unmatchedScenes.map((scene) => scene.name);
    job.lockedImages = result.matches.map(sceneLockPlan);
    const commonFiles = (job.manualFiles || [])
      .filter((file) => !folderFingerprints.has(fileFingerprint(file)));
    const matchedFiles = dedupeFiles(result.matches.map((match) => match.file));
    job.files = dedupeFiles([...commonFiles, ...matchedFiles]);
    job.sceneMatchReady = true;
    matchedCount += result.matches.length;
    unmatchedCount += result.unmatchedScenes.length;
    const mappings = result.matches.length
      ? result.matches.map((match) => `${match.sceneName}→${match.fileName}`).join("；")
      : "无匹配";
    const missing = result.unmatchedScenes.length
      ? `；未匹配：${result.unmatchedScenes.map((scene) => scene.name).join("、")}`
      : "";
    lines.push(`${job.label}：${mappings}${missing}`);
  }
  ui.scene_match_preview.textContent = `完成：${matchedCount} 处场景引用已匹配，${unmatchedCount} 处未匹配\n${lines.join("\n")}`;
  ui.scene_match_preview.dataset.level = unmatchedCount ? "warning" : "success";
  appendLog(`场景匹配完成：${matchedCount} 处命中，${unmatchedCount} 处未匹配`);
  renderQueue();
}

function currentPromptBatch() {
  return self.JimengLockAnalyzer.parsePromptBatch(ui.prompt.value);
}

function markUnrecognized() {
  ui.batch_preview.textContent = ui.prompt.value.trim()
    ? "已粘贴，尚未识别。点击“开始识别并加入分组队列”。"
    : "尚未识别：粘贴提示词后点击下方按钮";
  ui.batch_preview.dataset.level = "";
}

function addJob() {
  if (!ui.prompt.value.trim()) return alert("请先填写或粘贴提示词。");
  const batch = currentPromptBatch();
  if (!batch.prompts.length) {
    ui.batch_preview.textContent = "识别失败：没有找到视频提示词。请使用 plaintext 代码块，或确保正文包含【项目规格】。";
    ui.batch_preview.dataset.level = "warning";
    return alert("没有识别到视频提示词。请使用 plaintext 代码块，或确保正文包含【项目规格】。");
  }

  const manualCharacters = ui.characters.value
    .split(/[\n、，,；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const groupId = crypto.randomUUID();
  for (const { prompt, label } of batch.prompts) {
    const autoSubjectPlans = self.JimengLockAnalyzer.parseSubjects(prompt).map(jobLockPlan);
    const job = {
      id: crypto.randomUUID(),
      groupId,
      groupTitle: batch.title,
      label,
      prompt,
      prefix: ui.prefix.value,
      manualCharacters: [...manualCharacters],
      characters: [...manualCharacters],
      manualFiles: dedupeFiles([...manualFiles]),
      files: dedupeFiles([...manualFiles]),
      autoSubjectPlans,
      lockedSubjects: [...autoSubjectPlans],
      lockedImages: [],
      sceneMatches: [],
      unmatchedScenes: [],
      sceneMatchReady: false,
      state: "pending",
      detail: "待投放",
    };
    jobs.push(job);
  }
  ui.prompt.value = "";
  ui.characters.value = "";
  ui.files.value = "";
  manualFiles = [];
  renderFileSummary();
  const labels = batch.prompts.map((entry) => entry.label).join("、");
  const duplicateText = batch.duplicateCount ? `；忽略 ${batch.duplicateCount} 条完全重复内容` : "";
  ui.batch_preview.textContent = `${batch.title ? `${batch.title}\n` : ""}识别完成并已入队 ${batch.prompts.length} 条：${labels}${duplicateText}`;
  ui.batch_preview.dataset.level = "success";
  appendLog(`提示词识别入队：${batch.prompts.length} 条（${labels}）`);
  resetSceneMatchPreview();
  renderQueue();
}

function dedupeFiles(files) {
  const seen = new Set();
  return files.filter((file) => {
    if (!file) return false;
    const key = fileTransferKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fileTransferKey(file) {
  return `${file?.webkitRelativePath || file?.name}:${file?.size || 0}:${file?.lastModified || 0}`;
}

async function startBatch() {
  const pending = jobs.filter((job) => ["pending", "failed_before_click", "paused"].includes(job.state));
  if (!pending.length) return alert("没有可投放任务。已点击过发送箭头的任务不会自动重试。");
  const intervalSeconds = Math.max(30, Math.min(1800, Number(ui.send_interval.value) || 30));
  ui.send_interval.value = intervalSeconds;
  const batch = pending;
  if (sceneFolderFiles.length && batch.some((job) => !job.sceneMatchReady)) {
    return alert("已选择场景文件夹，但本批任务尚未完成场景匹配。请先点击“识别场景并匹配图片”。");
  }
  const uniqueBatchFiles = dedupeFiles(batch.flatMap((job) => job.files));
  const totalBytes = uniqueBatchFiles.reduce((sum, file) => sum + file.size, 0);
  if (batch.some((job) => job.files.some((file) => file.size > MAX_FILE_BYTES))) {
    return alert("单个附件不能超过 80 MB。");
  }
  if (totalBytes > MAX_BATCH_BYTES) return alert("本批附件合计不能超过 160 MB，请拆成多批。");

  const [source] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!source?.url?.startsWith("https://jimeng.jianying.com/ai-tool/")) {
    return alert("请先在当前窗口打开即梦页面，并进入右侧“对话”。");
  }
  let preflight;
  try {
    const executor = await chrome.runtime.sendMessage({ type: "ENSURE_SOURCE_EXECUTOR", tabId: source.id });
    if (!executor?.ok) return alert(executor?.error || "即梦执行器未更新，无法安全操作。");
    if ((ui.work_mode.value || "conversation") === "conversation") {
    const opened = await chrome.tabs.sendMessage(source.id, { type: "OPEN_CONVERSATION_V15" });
      if (!opened?.ok) return alert(opened?.error || "无法打开右侧对话面板。");
    }
    preflight = await chrome.tabs.sendMessage(source.id, {
      type: "CHECK_SOURCE_CLEAN_V15",
      mode: ui.work_mode.value || "conversation",
    });
  } catch (_) {
    return alert("无法检查当前画布。重新加载扩展后，请先刷新这个即梦标签再重试。");
  }
  if (!preflight?.ok) return alert(preflight?.error || "当前画布预检失败。");
  if (!preflight.clean) {
    const reason = [
      preflight.hasText ? "输入框有残留文字/主体" : "",
      preflight.attachments ? `已有 ${preflight.attachments} 个附件` : "",
    ].filter(Boolean).join("，");
    return alert(`当前源标签不是干净输入区（${reason}）。请清空输入区，或切换到一个空白画布标签后再开始，避免旧内容被复制到所有任务。`);
  }
  if (!confirm(`本次将处理待投放队列中的全部 ${batch.length} 条：每条确认受理后等待 ${intervalSeconds} 秒，才打开下一标签。若正式点击后输入框未清空，系统会持续重试直至送达或你主动暂停。是否继续？`)) return;

  activeBatchId = crypto.randomUUID();
  appendLog(`准备启动批次 ${activeBatchId}：${batch.length} 条，间隔 ${intervalSeconds} 秒`);
  setBatchControls(true, activeBatchId, false);
  let stagedTransferIds = [];
  try {
    const staged = await self.JimengFileTransfer.stageFiles(uniqueBatchFiles, ({ fileIndex, fileCount, chunkIndex }) => {
      if (chunkIndex === 0) appendLog(`附件分块传输：正在准备第 ${fileIndex + 1}/${fileCount} 个文件`);
    });
    stagedTransferIds = staged.transferIds;
    const descriptorByKey = new Map(uniqueBatchFiles.map((file, index) => [
      fileTransferKey(file), staged.descriptors[index],
    ]));
    const serialized = [];
    for (const job of batch) {
      job.state = "encoding";
      job.detail = "本地附件已分块缓存";
      renderQueue();
      const serializedJob = {
        ...job,
        mode: ui.work_mode.value || "conversation",
        files: job.files.map((file) => descriptorByKey.get(fileTransferKey(file))),
      };
      delete serializedJob.manualFiles;
      delete serializedJob.sceneMatches;
      delete serializedJob.unmatchedScenes;
      serialized.push(serializedJob);
    }
    const response = await chrome.runtime.sendMessage({
      type: "START_BATCH",
      sourceTabId: source.id,
      mode: ui.work_mode.value || "conversation",
      jobs: serialized,
      intervalMs: intervalSeconds * 1000,
      batchId: activeBatchId,
    });
    if (!response?.ok) throw new Error(response?.error || "批量任务启动失败");
    stagedTransferIds = [];
    if (response.stoppedOnFailure) {
      appendLog("本批遇到失败已立即停止；未打开任务已保留为暂停，不会继续复制标签");
    } else if (response.paused) {
      appendLog("本批已暂停；未打开任务仍保留在队列中");
    }
  } catch (error) {
    await self.JimengFileTransfer.releaseTransfers(stagedTransferIds);
    appendLog(`批次启动失败：${String(error?.message || error)}`);
    alert(String(error?.message || error));
  } finally {
    setBatchControls(false, null, false);
  }
}

async function pauseBatch() {
  ui.pause.disabled = true;
  ui.pause.textContent = "正在请求暂停…";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "PAUSE_BATCH",
      batchId: activeBatchId,
    });
    if (!response?.ok) throw new Error(response?.error || "当前没有可暂停的发送批次");
    ui.pause.textContent = "已请求暂停当前重试及后续发送";
    appendLog(`已请求暂停批次 ${activeBatchId || "未知"}`);
  } catch (error) {
    ui.pause.textContent = "暂停当前重试及后续发送";
    appendLog(`暂停失败：${String(error?.message || error)}`);
    alert(String(error?.message || error));
  }
}

async function restoreActiveBatchState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "GET_BATCH_STATE" });
    setBatchControls(Boolean(state?.active), state?.batchId || null, Boolean(state?.paused));
  } catch (_) {}
}

function setBatchControls(active, batchId, paused = false) {
  activeBatchId = active ? batchId : null;
  ui.start.disabled = active;
  ui.pause.disabled = !active || paused;
  ui.match_scenes.disabled = active;
  ui.scene_folder.disabled = active;
  ui.pause.textContent = paused ? "已请求暂停当前重试及后续发送" : "暂停当前重试及后续发送";
}

function renderQueue() {
  ui.queue.replaceChildren();
  renderAssetAudit();
  if (!jobs.length) {
    const empty = document.createElement("div");
    empty.className = "queue-empty";
    empty.textContent = "还没有任务";
    ui.queue.append(empty);
    return;
  }
  let previousGroupId = null;
  jobs.forEach((job, index) => {
    if (job.groupTitle && job.groupId !== previousGroupId) {
      const group = document.createElement("div");
      group.className = "queue-group";
      const groupSize = jobs.filter((item) => item.groupId === job.groupId).length;
      group.textContent = `${job.groupTitle} · ${groupSize} 条`;
      ui.queue.append(group);
    }
    previousGroupId = job.groupId;
    const card = document.createElement("article");
    card.className = "job";
    card.dataset.state = job.state;
    const head = document.createElement("div");
    head.className = "job-head";
    head.innerHTML = `<span class="job-index">#${index + 1}</span><span class="job-label">${escapeHtml(job.label || `提示词${index + 1}`)}</span><strong>${escapeHtml(stateLabel(job.state))}</strong>`;
    const remove = document.createElement("button");
    remove.className = "job-remove";
    remove.textContent = "移除";
    remove.addEventListener("click", () => {
      jobs = jobs.filter((item) => item.id !== job.id);
      renderQueue();
    });
    head.append(remove);
    const text = document.createElement("div");
    text.className = "job-text";
    text.textContent = job.prompt.slice(0, 160);
    const detail = document.createElement("div");
    detail.className = "job-status";
    const lockDetail = [
      job.lockedSubjects?.length ? `${job.lockedSubjects.length} 个自动 @主体` : "",
      job.lockedImages?.length ? `${job.lockedImages.length} 张场景图锁定` : "",
      job.files.length ? `${job.files.length} 个附件` : "",
    ].filter(Boolean).join(" · ");
    detail.textContent = `${job.detail || ""}${lockDetail ? ` · ${lockDetail}` : ""}`;
    card.append(head, text, detail);
    ui.queue.append(card);
  });
}

function renderAssetAudit() {
  ui.asset_summary.replaceChildren();
  if (!jobs.length) {
    const empty = document.createElement("div");
    empty.className = "asset-empty";
    empty.textContent = "队列为空，识别提示词后将在这里汇总人物和场景";
    ui.asset_summary.append(empty);
    return;
  }

  const groups = new Map();
  const allCharacters = new Map();
  const allScenes = new Map();
  const missingScenes = [];
  let matchedSceneReferences = 0;
  let unmatchedSceneReferences = 0;
  for (const job of jobs) {
    const parsed = self.JimengLockAnalyzer.analyzeAssets(job.prompt);
    const characters = uniqueNames([...parsed.characters, ...(job.manualCharacters || job.characters || [])]);
    const scenes = mergeScenes(parsed.scenes);
    for (const name of characters) allCharacters.set(assetKey(name), { name, inferred: false });
    for (const scene of scenes) mergeSceneInto(allScenes, scene);
    if (!scenes.length) missingScenes.push(job.label || "未编号提示词");
    matchedSceneReferences += job.sceneMatches?.length || 0;
    unmatchedSceneReferences += job.unmatchedScenes?.length || 0;

    const groupKey = job.groupId || job.id;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        title: job.groupTitle || "单条导入",
        jobs: [],
      });
    }
    groups.get(groupKey).jobs.push({
      label: job.label || "未编号提示词",
      characters,
      scenes,
      sceneMatches: job.sceneMatches || [],
      unmatchedScenes: job.unmatchedScenes || [],
    });
  }

  const overall = document.createElement("div");
  overall.className = "asset-overall";
  overall.textContent = `全队列：${allCharacters.size} 个人物 · ${allScenes.size} 个场景 · ${matchedSceneReferences} 处图片 @ · ${unmatchedSceneReferences} 处图片未匹配`;
  ui.asset_summary.append(overall);
  appendAssetChecklist("人物", "character", [...allCharacters.values()]);
  appendAssetChecklist("场景", "scene", [...allScenes.values()]);
  refreshAutoMentionsForQueue();

  if (missingScenes.length) {
    const warning = document.createElement("p");
    warning.className = "asset-warning";
    warning.textContent = `未可靠识别场景：${missingScenes.join("、")}。请人工查看这些提示词；程序不会把猜测当成确定资产。`;
    ui.asset_summary.append(warning);
  }

  for (const group of groups.values()) {
    const box = document.createElement("div");
    box.className = "asset-group";
    const title = document.createElement("div");
    title.className = "asset-group-title";
    title.textContent = group.title;
    box.append(title);
    for (const item of group.jobs) {
      const line = document.createElement("div");
      line.className = "asset-job";
      const characterText = item.characters.length ? item.characters.join("、") : "未识别";
      const sceneText = item.scenes.length
        ? item.scenes.map((scene) => `${scene.name}${scene.inferred ? "（候选）" : ""}`).join("、")
        : "未识别";
      const imageText = item.sceneMatches.length
        ? item.sceneMatches.map((match) => `${match.sceneName}→${match.fileName}`).join("、")
        : "尚未匹配";
      const unmatchedText = item.unmatchedScenes.length
        ? `｜图片缺失：${item.unmatchedScenes.join("、")}`
        : "";
      line.textContent = `${item.label}｜人物：${characterText}｜场景：${sceneText}｜图片：${imageText}${unmatchedText}`;
      box.append(line);
    }
    ui.asset_summary.append(box);
  }
}

function appendAssetChecklist(titleText, type, items) {
  if (!items.length) return;
  const list = document.createElement("div");
  list.className = "asset-list";
  const title = document.createElement("div");
  title.className = "asset-list-title";
  title.textContent = type === "character"
    ? `${titleText}（勾选＝发送时自动 @；请取消非主体库项）`
    : `${titleText}（勾选＝已人工核对；图片 @ 由文件夹匹配决定）`;
  list.append(title);
  for (const item of items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))) {
    const key = assetKey(item.name);
    const likelyGroup = type === "character" &&
      self.JimengLockAnalyzer.isLikelyGroupCharacter(item.name);
    if (type === "character" && !initializedMentionCharacters.has(key)) {
      initializedMentionCharacters.add(key);
      if (!likelyGroup) selectedMentionCharacters.add(key);
    }
    const label = document.createElement("label");
    label.className = `asset-check${item.inferred ? " asset-inferred" : ""}`;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = type === "character"
      ? selectedMentionCharacters.has(key)
      : verifiedScenes.has(key);
    input.addEventListener("change", () => {
      const selected = type === "character" ? selectedMentionCharacters : verifiedScenes;
      if (input.checked) selected.add(key);
      else selected.delete(key);
      if (type === "character") {
        refreshAutoMentionsForQueue();
        renderQueue();
      }
    });
    const span = document.createElement("span");
    span.textContent = `${item.name}${likelyGroup ? "（群体，默认不 @）" : ""}${item.inferred ? "（候选）" : ""}`;
    label.append(input, span);
    list.append(label);
  }
  ui.asset_summary.append(list);
}

function refreshAutoMentionsForQueue() {
  for (const job of jobs) {
    if (!["pending", "failed_before_click", "paused"].includes(job.state)) continue;
    const plans = job.autoSubjectPlans || [];
    job.lockedSubjects = plans.filter((plan) => selectedMentionCharacters.has(assetKey(plan.name)));
    const selectedNames = new Set(job.lockedSubjects.map((plan) => assetKey(plan.name)));
    job.characters = (job.manualCharacters || job.characters || [])
      .filter((name) => selectedMentionCharacters.has(assetKey(name)))
      .filter((name) => !selectedNames.has(assetKey(name)));
  }
}

function jobLockPlan(item) {
  return {
    kind: "subject",
    name: item.name,
    anchor: item.anchor,
    offset: item.offset,
    occurrence: item.occurrence,
  };
}

function sceneLockPlan(item) {
  return {
    kind: "image",
    name: item.name,
    anchor: item.anchor,
    offset: item.offset,
    occurrence: item.occurrence,
  };
}

function assetKey(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function uniqueNames(values) {
  const names = new Map();
  for (const value of values) {
    const name = String(value || "").trim();
    if (name) names.set(assetKey(name), name);
  }
  return [...names.values()];
}

function mergeSceneInto(target, scene) {
  const key = assetKey(scene.name);
  if (!key) return;
  const existing = target.get(key);
  if (!existing || (existing.inferred && !scene.inferred)) target.set(key, scene);
}

function mergeScenes(scenes) {
  const result = new Map();
  for (const scene of scenes || []) mergeSceneInto(result, scene);
  return [...result.values()];
}

function stateLabel(state) {
  return ({
    pending: "待投放", encoding: "读取附件", opening: "打开标签", preparing: "准备页面",
    connecting_executor: "连接新标签", recovering_executor: "恢复新标签", executor_ready: "新标签已连接",
    stopping_inherited: "清理新标签转圈状态",
    stopping_before_send: "暂停白方块等待状态",
    waiting_interval: "等待发送间隔",
    waiting_queue_confirmation: "等待视频任务卡",
    queue_confirmed: "视频任务卡已齐",
    queue_confirmation_failed: "任务卡核验失败",
    paused: "已暂停",
    uploading: "上传附件", uploading_partial: "图片少传，继续发送",
    locking: "插入 @素材", locking_partial: "图片 @跳过，继续发送",
    locking_skipped: "主体不存在，跳过 @",
    expanding_composer: "展开发送框",
    resizing_conversation: "调整对话栏宽度",
    locking_retry: "持续补齐 @素材",
    retrying_submit: "持续重试送达",
    clicked: "已点击发送", confirmed: "已确认受理",
    submitted_unconfirmed: "已提交待确认", failed_before_click: "发送前失败",
  })[state] || state;
}

function saveSettings() {
  chrome.storage.local.set({
    prefix: ui.prefix.value,
    sendIntervalSeconds: Number(ui.send_interval.value) || 30,
    workMode: ui.work_mode?.value || "conversation",
  });
}

async function restoreSettings() {
  const saved = await chrome.storage.local.get([
    "prefix", "sendIntervalSeconds", "sendInterval", "workMode",
  ]);
  if (saved.prefix) ui.prefix.value = saved.prefix;
  if (saved.sendIntervalSeconds) {
    ui.send_interval.value = saved.sendIntervalSeconds;
  } else if (saved.sendInterval) {
    // 旧版本默认值是 1 分钟；升级后按新的默认要求迁移为 30 秒。
    const oldMinutes = Number(saved.sendInterval);
    ui.send_interval.value = oldMinutes === 1 ? 30 : Math.round(oldMinutes * 60);
  }
  if (saved.workMode && ui.work_mode) ui.work_mode.value = saved.workMode;
}

async function restoreLogs() {
  try {
    const saved = await chrome.storage.local.get(["runLogs"]);
    const stored = Array.isArray(saved.runLogs) ? saved.runLogs : [];
    logLines = [...stored, ...logLines].slice(-MAX_LOG_LINES);
  } catch (_) {
    logLines = logLines.slice(-MAX_LOG_LINES);
  }
  renderLogs();
}

function appendLog(message) {
  const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  logLines.push(`[${stamp}] ${String(message || "")}`);
  logLines = logLines.slice(-MAX_LOG_LINES);
  renderLogs();
  chrome.storage.local.set({ runLogs: logLines }).catch(() => {});
}

function renderLogs() {
  ui.log_output.textContent = logLines.length ? logLines.join("\n") : "暂无日志";
  ui.log_output.scrollTop = ui.log_output.scrollHeight;
}

async function copyLogs() {
  try {
    await navigator.clipboard.writeText(logLines.join("\n"));
    ui.copy_log.textContent = "已复制";
    setTimeout(() => { ui.copy_log.textContent = "复制日志"; }, 1200);
  } catch (_) {
    alert("复制日志失败，请展开后手动选择复制。");
  }
}

function clearLogs() {
  logLines = [];
  renderLogs();
  chrome.storage.local.set({ runLogs: [] }).catch(() => {});
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}
