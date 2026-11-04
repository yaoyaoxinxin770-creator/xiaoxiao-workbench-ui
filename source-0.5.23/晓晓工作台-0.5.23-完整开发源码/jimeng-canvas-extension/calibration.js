const CALIBRATION_MAX_FILE_BYTES = 80 * 1024 * 1024;
const CALIBRATION_MAX_TOTAL_BYTES = 160 * 1024 * 1024;
const CALIBRATION_MAX_LOG_LINES = 300;
const CALIBRATION_MAX_EDITOR_CHARS = 20000;
const CALIBRATION_ALLOWED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif",
  ".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac",
]);

const calibrationUi = Object.fromEntries([
  "calibration-version", "calibration-work-mode", "calibration-prefix", "calibration-prompt", "calibration-scene-folder",
  "calibration-scene-files", "calibration-scene-file-summary", "calibration-clear-folder",
  "calibration-clear-selected-scenes", "calibration-scene-manager",
  "calibration-folder-summary", "calibration-files", "calibration-clear-files",
  "calibration-file-summary", "calibration-extra-manager",
  "calibrate", "calibration-subject-scan", "calibration-subject-summary",
  "calibration-asset-summary", "calibration-summary", "calibration-status", "calibration-send",
  "calibration-pause", "calibration-copy-log", "calibration-clear-log", "log-output",
].map((id) => [id.replace(/-/g, "_"), document.getElementById(id)]));

const calibrationManifestVersion = chrome.runtime.getManifest?.().version;
if (calibrationManifestVersion) calibrationUi.calibration_version.textContent = `v${calibrationManifestVersion}`;

let calibrationSceneFiles = [];
let calibrationPickedSceneFiles = [];
let calibrationExtraFiles = [];
// 额外附件元数据只保存在工作台内，不修改磁盘文件。
const calibrationExtraAliases = new Map();
const calibrationExtraBindings = new Map();
const calibrationSceneAliases = new Map();
const calibrationSceneExtraAliases = new Map();
const calibrationSceneRemovalSelections = new Set();
const calibrationDisabledSubjects = new Set();
const calibrationSubjectManualOverrides = new Map();
const calibrationSubjectAutoOverrides = new Map();
const calibrationExtraBindingHintRefreshers = new Map();
const CALIBRATION_SUBJECT_BASE_SELECTION = "__base__";
const CALIBRATION_SUBJECT_EXTRA_PREFIX = "__extra__:";
let calibrationSubjectAvailability = null;
let calibrationParsedSubjectPlans = [];
let calibrated = null;
let calibrationBatchId = null;
let calibrationJobId = null;
let calibrationLogs = [];

restoreCalibrationSettings();
restoreCalibrationLogs();
restoreCalibrationBatchState();

calibrationUi.calibration_prompt.addEventListener("input", () => {
  calibrationDisabledSubjects.clear();
  calibrationSubjectManualOverrides.clear();
  calibrationSubjectAutoOverrides.clear();
  calibrationSubjectAvailability = null;
  calibrationParsedSubjectPlans = [];
  refreshCalibrationExtraBindingHints();
  renderCalibrationSubjectSummary();
  invalidateCalibration();
});
calibrationUi.calibration_prefix.addEventListener("change", saveCalibrationSettings);
calibrationUi.calibration_scene_folder.addEventListener("change", collectCalibrationScenes);
calibrationUi.calibration_scene_files.addEventListener("change", collectCalibrationPickedScenes);
calibrationUi.calibration_clear_folder.addEventListener("click", clearCalibrationSceneFolder);
calibrationUi.calibration_clear_selected_scenes.addEventListener("click", clearSelectedCalibrationScenes);
calibrationUi.calibration_files.addEventListener("change", collectCalibrationFiles);
calibrationUi.calibration_clear_files.addEventListener("click", clearCalibrationExtraFiles);
calibrationUi.calibrate.addEventListener("click", () => calibrateDraft(true));
calibrationUi.calibration_subject_scan.addEventListener("click", () => scanCalibrationSubjects());
calibrationUi.calibration_send.addEventListener("click", sendCalibratedDraft);
calibrationUi.calibration_pause.addEventListener("click", pauseCalibration);
calibrationUi.calibration_copy_log.addEventListener("click", copyCalibrationLogs);
calibrationUi.calibration_clear_log.addEventListener("click", clearCalibrationLogs);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "BATCH_STATE") {
    setCalibrationControls(Boolean(message.active), message.batchId || null, Boolean(message.paused));
    appendCalibrationLog(message.active
      ? `整稿批次 ${message.batchId || "未知"} 已启动${message.paused ? "，已请求暂停" : ""}`
      : `整稿批次 ${message.batchId || "未知"} 已结束`);
    return;
  }
  if (message?.type === "BATCH_LOG") {
    appendCalibrationLog(message.detail || "批次状态已更新");
    return;
  }
  if (message?.type !== "JOB_STATUS" || message.jobId !== calibrationJobId) return;
  calibrationUi.calibration_status.dataset.state = message.state || "";
  calibrationUi.calibration_status.textContent = `${calibrationStateLabel(message.state)}：${message.detail || "无详情"}`;
  appendCalibrationLog(`${calibrationStateLabel(message.state)}｜${message.detail || "无详情"}`);
});

function collectCalibrationScenes(event) {
  calibrationSceneFiles = dedupeCalibrationFiles([...event.target.files].filter(isCalibrationImage));
  pruneCalibrationSceneMetadata();
  updateCalibrationSceneLibraryUi();
  invalidateCalibration();
}

function collectCalibrationPickedScenes(event) {
  calibrationPickedSceneFiles = dedupeCalibrationSceneCandidates([
    ...calibrationPickedSceneFiles,
    ...[...event.target.files].filter(isCalibrationImage),
  ]);
  calibrationUi.calibration_scene_files.value = "";
  pruneCalibrationSceneMetadata();
  updateCalibrationSceneLibraryUi();
  invalidateCalibration();
}

function clearCalibrationSceneFolder() {
  if (calibrationBatchId) return;
  calibrationSceneFiles = [];
  calibrationPickedSceneFiles = [];
  calibrationSceneAliases.clear();
  calibrationSceneExtraAliases.clear();
  calibrationSceneRemovalSelections.clear();
  calibrationUi.calibration_scene_folder.value = "";
  calibrationUi.calibration_scene_files.value = "";
  updateCalibrationSceneLibraryUi();
  invalidateCalibration();
  appendCalibrationLog("已清除全部场景候选图片和自定义名称；整稿和额外附件未改变");
}

function clearSelectedCalibrationScenes() {
  if (calibrationBatchId || !calibrationSceneRemovalSelections.size) return;
  const selected = new Set(calibrationSceneRemovalSelections);
  calibrationSceneFiles = calibrationSceneFiles.filter((file) => !selected.has(calibrationSceneFileKey(file)));
  calibrationPickedSceneFiles = calibrationPickedSceneFiles.filter((file) => !selected.has(calibrationSceneFileKey(file)));
  for (const key of selected) {
    calibrationSceneAliases.delete(key);
    calibrationSceneExtraAliases.delete(key);
  }
  calibrationSceneRemovalSelections.clear();
  calibrationUi.calibration_scene_folder.value = "";
  calibrationUi.calibration_scene_files.value = "";
  updateCalibrationSceneLibraryUi();
  invalidateCalibration();
  appendCalibrationLog(`已清除勾选的 ${selected.size} 张场景候选图片`);
}

function calibrationSceneFileKey(file) {
  return `${String(file?.name || "").toLocaleLowerCase()}:${file?.size || 0}:${file?.lastModified || 0}`;
}

function calibrationSceneFileExtension(file) {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

function normalizedCalibrationSceneAlias(value, file) {
  const extension = calibrationSceneFileExtension(file);
  let alias = String(value || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (extension && alias.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())) {
    alias = alias.substring(0, alias.length - extension.length).trim();
  }
  return alias.length > 120 ? alias.substring(0, 120) : alias;
}

function calibrationSceneEffectiveName(file) {
  const alias = calibrationSceneAliases.get(calibrationSceneFileKey(file));
  return alias ? `${alias}${calibrationSceneFileExtension(file)}` : String(file?.name || "");
}

function materializeCalibrationSceneFile(file) {
  const effectiveName = calibrationSceneEffectiveName(file);
  const key = calibrationSceneFileKey(file);
  const originalStem = self.JimengLockAnalyzer.stemOf(file.name);
  const matchingAliases = [...new Set([
    originalStem,
    ...(calibrationSceneExtraAliases.get(key) || []),
  ].map((item) => String(item || "").trim()).filter(Boolean))];
  const shouldClone = typeof File !== "undefined" && (
    effectiveName !== file.name || matchingAliases.some((item) => item !== originalStem)
  );
  const renamed = shouldClone
    ? new File([file], effectiveName || file.name, {
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified || Date.now(),
    })
    : file;
  const sourcePath = String(file.webkitRelativePath || "");
  if (sourcePath && shouldClone) {
    const separator = Math.max(sourcePath.lastIndexOf("/"), sourcePath.lastIndexOf("\\"));
    const effectivePath = `${separator >= 0 ? sourcePath.substring(0, separator + 1) : ""}${effectiveName}`;
    try {
      Object.defineProperty(renamed, "webkitRelativePath", { value: effectivePath });
    } catch (_) {}
  }
  try {
    Object.defineProperty(renamed, "jimengSceneAliases", {
      value: matchingAliases,
      configurable: true,
    });
  } catch (_) {
    try { renamed.jimengSceneAliases = matchingAliases; } catch (_) {}
  }
  return renamed;
}

function pruneCalibrationSceneMetadata() {
  const available = new Set([
    ...calibrationSceneFiles,
    ...calibrationPickedSceneFiles,
  ].map(calibrationSceneFileKey));
  for (const key of calibrationSceneAliases.keys()) {
    if (!available.has(key)) calibrationSceneAliases.delete(key);
  }
  for (const key of calibrationSceneExtraAliases.keys()) {
    if (!available.has(key)) calibrationSceneExtraAliases.delete(key);
  }
  for (const key of calibrationSceneRemovalSelections) {
    if (!available.has(key)) calibrationSceneRemovalSelections.delete(key);
  }
}

function updateCalibrationSceneLibraryUi() {
  const allFiles = dedupeCalibrationSceneCandidates([
    ...calibrationSceneFiles,
    ...calibrationPickedSceneFiles,
  ]);
  calibrationUi.calibration_folder_summary.textContent = calibrationSceneFiles.length
    ? `文件夹候选：${calibrationSceneFiles.length} 张场景图`
    : "尚未选择场景文件夹";
  calibrationUi.calibration_scene_file_summary.textContent = calibrationPickedSceneFiles.length
    ? `单独选择：${calibrationPickedSceneFiles.length} 张场景候选图`
    : "尚未单独选择场景候选图片";
  calibrationUi.calibration_clear_folder.disabled = Boolean(calibrationBatchId) || !allFiles.length;
  calibrationUi.calibration_clear_selected_scenes.disabled = Boolean(calibrationBatchId) || !calibrationSceneRemovalSelections.size;
  renderCalibrationSceneManager(allFiles);
}

function renderCalibrationSceneManager(files) {
  calibrationUi.calibration_scene_manager.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "scene-manager-empty";
    empty.textContent = "选择文件夹或图片后，可逐张预览、勾选清除并设置自定义名称。";
    calibrationUi.calibration_scene_manager.append(empty);
    return;
  }
  const folderKeys = new Set(calibrationSceneFiles.map(calibrationSceneFileKey));
  for (const file of files) {
    const key = calibrationSceneFileKey(file);
    const row = document.createElement("div");
    row.className = "scene-manager-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "scene-manager-check";
    checkbox.checked = calibrationSceneRemovalSelections.has(key);
    checkbox.disabled = Boolean(calibrationBatchId);
    checkbox.title = "勾选后可用橙色按钮清除此图";
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) calibrationSceneRemovalSelections.add(key);
      else calibrationSceneRemovalSelections.delete(key);
      calibrationUi.calibration_clear_selected_scenes.disabled = Boolean(calibrationBatchId) || !calibrationSceneRemovalSelections.size;
    });

    const preview = document.createElement("img");
    preview.className = "scene-manager-preview";
    preview.alt = file.name;
    preview.loading = "lazy";
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.addEventListener("load", () => URL.revokeObjectURL(previewUrl), { once: true });
      preview.addEventListener("error", () => URL.revokeObjectURL(previewUrl), { once: true });
    }

    const details = document.createElement("div");
    details.className = "scene-manager-details";
    const original = document.createElement("div");
    original.className = "scene-manager-original";
    original.textContent = file.webkitRelativePath || file.name;
    const aliasRow = document.createElement("label");
    aliasRow.className = "scene-manager-alias-row";
    const aliasLabel = document.createElement("span");
    aliasLabel.textContent = "自定义名称";
    const aliasInput = document.createElement("input");
    aliasInput.type = "text";
    aliasInput.className = "scene-manager-alias";
    aliasInput.value = calibrationSceneAliases.get(key) || "";
    aliasInput.placeholder = self.JimengLockAnalyzer.stemOf(file.name);
    aliasInput.disabled = Boolean(calibrationBatchId);
    aliasInput.title = "用于场景匹配和上传，不修改磁盘原文件；扩展名会自动保留";
    const effective = document.createElement("div");
    effective.className = "scene-manager-effective";
    effective.textContent = `匹配/上传名称：${calibrationSceneEffectiveName(file)}`;
    aliasInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") aliasInput.blur();
    });
    aliasInput.addEventListener("change", () => {
      const alias = normalizedCalibrationSceneAlias(aliasInput.value, file);
      const originalStem = self.JimengLockAnalyzer.stemOf(file.name);
      aliasInput.value = alias;
      if (alias && alias !== originalStem) calibrationSceneAliases.set(key, alias);
      else calibrationSceneAliases.delete(key);
      if (alias) {
        const remainingAliases = (calibrationSceneExtraAliases.get(key) || [])
          .filter((item) => item.toLocaleLowerCase() !== alias.toLocaleLowerCase());
        if (remainingAliases.length) calibrationSceneExtraAliases.set(key, remainingAliases);
        else calibrationSceneExtraAliases.delete(key);
      }
      effective.textContent = `匹配/上传名称：${calibrationSceneEffectiveName(file)}`;
      invalidateCalibration({ keepAssetAudit: true, reason: "场景图自定义名称已变化；下面仍显示上次校准结果，等你统一改完后再点击校准刷新。" });
      appendCalibrationLog(alias && alias !== originalStem
        ? `场景图“${file.name}”使用自定义名称“${calibrationSceneEffectiveName(file)}”`
        : `场景图“${file.name}”已恢复原名称`);
    });
    aliasRow.append(aliasLabel, aliasInput);

    const extraAliasBox = document.createElement("div");
    extraAliasBox.className = "scene-manager-extra-aliases";
    const extraTitle = document.createElement("div");
    extraTitle.className = "scene-manager-extra-title";
    extraTitle.textContent = "匹配别名（可添加多个，同一张图不会重复上传）";
    const aliasChips = document.createElement("div");
    aliasChips.className = "scene-manager-alias-chips";
    for (const extraAlias of calibrationSceneExtraAliases.get(key) || []) {
      const chip = document.createElement("span");
      chip.className = "scene-manager-alias-chip";
      const chipText = document.createElement("span");
      chipText.textContent = extraAlias;
      const removeAlias = document.createElement("button");
      removeAlias.type = "button";
      removeAlias.textContent = "×";
      removeAlias.title = `删除别名“${extraAlias}”`;
      removeAlias.disabled = Boolean(calibrationBatchId);
      removeAlias.addEventListener("click", () => {
        const remaining = (calibrationSceneExtraAliases.get(key) || []).filter((item) => item !== extraAlias);
        if (remaining.length) calibrationSceneExtraAliases.set(key, remaining);
        else calibrationSceneExtraAliases.delete(key);
        updateCalibrationSceneLibraryUi();
        invalidateCalibration({ keepAssetAudit: true, reason: "场景图别名已变化；下面仍显示上次校准结果，等你统一改完后再点击校准刷新。" });
        appendCalibrationLog(`已删除场景图“${file.name}”的别名“${extraAlias}”`);
      });
      chip.append(chipText, removeAlias);
      aliasChips.append(chip);
    }
    if (!aliasChips.childElementCount) {
      const none = document.createElement("span");
      none.className = "scene-manager-alias-none";
      none.textContent = "暂无别名";
      aliasChips.append(none);
    }
    const addAliasRow = document.createElement("div");
    addAliasRow.className = "scene-manager-add-alias";
    const addAliasInput = document.createElement("input");
    addAliasInput.type = "text";
    addAliasInput.placeholder = "输入另一个场景名称";
    addAliasInput.disabled = Boolean(calibrationBatchId);
    const addAliasButton = document.createElement("button");
    addAliasButton.type = "button";
    addAliasButton.textContent = "＋别名";
    addAliasButton.disabled = Boolean(calibrationBatchId);
    const commitExtraAlias = () => {
      const nextAlias = normalizedCalibrationSceneAlias(addAliasInput.value, file);
      if (!nextAlias) return;
      const reservedNames = [
        self.JimengLockAnalyzer.stemOf(file.name),
        calibrationSceneAliases.get(key) || "",
        ...(calibrationSceneExtraAliases.get(key) || []),
      ].map((item) => item.toLocaleLowerCase());
      if (reservedNames.includes(nextAlias.toLocaleLowerCase())) {
        addAliasInput.value = "";
        return;
      }
      calibrationSceneExtraAliases.set(key, [
        ...(calibrationSceneExtraAliases.get(key) || []),
        nextAlias,
      ]);
      updateCalibrationSceneLibraryUi();
      invalidateCalibration({ keepAssetAudit: true, reason: "场景图别名已变化；下面仍显示上次校准结果，等你统一改完后再点击校准刷新。" });
      appendCalibrationLog(`场景图“${file.name}”新增匹配别名“${nextAlias}”`);
    };
    addAliasInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitExtraAlias();
    });
    addAliasButton.addEventListener("click", commitExtraAlias);
    addAliasRow.append(addAliasInput, addAliasButton);
    extraAliasBox.append(extraTitle, aliasChips, addAliasRow);
    details.append(original, aliasRow, effective, extraAliasBox);

    const source = document.createElement("span");
    source.className = "scene-manager-source";
    source.textContent = folderKeys.has(key) ? "文件夹" : "单选";
    row.append(checkbox, preview, details, source);
    calibrationUi.calibration_scene_manager.append(row);
  }
}

function collectCalibrationFiles(event) {
  calibrationExtraFiles = dedupeCalibrationFiles([
    ...calibrationExtraFiles,
    ...[...event.target.files].filter(isAllowedCalibrationFile),
  ]);
  calibrationUi.calibration_file_summary.textContent = calibrationExtraFiles.length
    ? `${calibrationExtraFiles.length} 个额外附件：${calibrationExtraFiles.map(calibrationExtraDisplayName).join("、")}`
    : "没有额外附件";
  calibrationUi.calibration_clear_files.disabled = !calibrationExtraFiles.length;
  event.target.value = "";
  updateCalibrationExtraLibraryUi();
  renderCalibrationSubjectSummary();
  refreshCalibrationAfterMetaChange();
}

function calibrationExtraFileKey(file) {
  return calibrationFileKey(file);
}

function calibrationExtraExtension(file) {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

function calibrationExtraDisplayName(file) {
  const alias = String(calibrationExtraAliases.get(calibrationExtraFileKey(file)) || "").trim();
  return alias ? `${alias}${calibrationExtraExtension(file)}` : String(file?.name || "");
}

function normalizedCalibrationExtraAlias(value, file) {
  let alias = String(value || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const extension = calibrationExtraExtension(file);
  if (extension && alias.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())) {
    alias = alias.substring(0, alias.length - extension.length).trim();
  }
  return alias.substring(0, 120);
}

function calibrationExtraBindingNames(file) {
  if (isCalibrationImage(file)) {
    const manualBindings = (calibrationExtraBindings.get(calibrationExtraFileKey(file)) || [])
      .map((item) => String(item || "").trim()).filter(Boolean);
    if (manualBindings.length) return manualBindings;
    const stem = String(self.JimengLockAnalyzer.stemOf(calibrationExtraDisplayName(file)) || "").trim();
    const stemKey = calibrationSubjectNameKey(stem);
    const matchedRole = uniqueCalibrationSubjectNames(calibrationParsedSubjectPlans)
      .map((name) => ({ name, key: calibrationSubjectNameKey(name) }))
      .filter(({ key }) => key && stemKey.startsWith(key))
      .sort((a, b) => b.key.length - a.key.length)[0]?.name;
    return matchedRole ? [matchedRole] : (stem ? [stem] : []);
  }
  const roleName = String(self.JimengLockAnalyzer.stemOf(calibrationExtraDisplayName(file)) || "").trim();
  return roleName ? [roleName] : [];
}

function refreshCalibrationExtraBindingHints() {
  for (const refresh of calibrationExtraBindingHintRefreshers.values()) refresh();
}

function materializeCalibrationExtraFile(file) {
  const name = calibrationExtraDisplayName(file);
  const bindings = calibrationExtraBindingNames(file);
  const shouldClone = typeof File !== "undefined" &&
    (name !== file.name || bindings.length);
  const renamed = shouldClone ? new File([file], name || file.name, {
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified || Date.now(),
  }) : file;
  try { Object.defineProperty(renamed, "jimengRoleBindings", { value: bindings, configurable: true }); }
  catch (_) { try { renamed.jimengRoleBindings = bindings; } catch (_) {} }
  try { Object.defineProperty(renamed, "jimengOriginalName", { value: file.name, configurable: true }); }
  catch (_) { try { renamed.jimengOriginalName = file.name; } catch (_) {} }
  return renamed;
}

function updateCalibrationExtraLibraryUi() {
  if (!calibrationUi.calibration_extra_manager) return;
  calibrationUi.calibration_extra_manager.replaceChildren();
  calibrationExtraBindingHintRefreshers.clear();
  if (!calibrationExtraFiles.length) {
    const empty = document.createElement("div");
    empty.className = "extra-manager-empty";
    empty.textContent = "尚未选择额外图片或音频。";
    calibrationUi.calibration_extra_manager.append(empty);
    return;
  }
  for (const file of calibrationExtraFiles) {
    const key = calibrationExtraFileKey(file);
    const row = document.createElement("div");
    row.className = "extra-manager-item";
    const kind = document.createElement("span");
    kind.className = "extra-manager-kind";
    kind.textContent = isCalibrationImage(file) ? "图片" : "音频";
    const original = document.createElement("span");
    original.className = "extra-manager-original";
    original.textContent = file.name;
    const alias = document.createElement("input");
    alias.type = "text";
    alias.className = "extra-manager-alias";
    alias.placeholder = "工作台名称（可改）";
    alias.value = calibrationExtraAliases.get(key) || "";
    alias.disabled = Boolean(calibrationBatchId);
    let binding;
    let bindingHint;
    const syncImageBindingHint = () => {
      if (!bindingHint) return;
      const manualBindings = (calibrationExtraBindings.get(key) || [])
        .map((item) => String(item || "").trim()).filter(Boolean);
      const inferredName = calibrationExtraBindingNames(file)[0] || "";
      bindingHint.textContent = manualBindings.length ? "" : `自动绑定：${inferredName || "未命名"}`;
      bindingHint.hidden = manualBindings.length > 0;
    };
    const syncExtraAlias = ({ normalizeInput }) => {
      const value = normalizedCalibrationExtraAlias(alias.value, file);
      if (normalizeInput) alias.value = value;
      if (value) calibrationExtraAliases.set(key, value);
      else calibrationExtraAliases.delete(key);
      if (!isCalibrationImage(file) && binding) {
        binding.textContent = `自动绑定角色：${calibrationExtraBindingNames(file).join("、") || "未命名"}`;
      }
      if (isCalibrationImage(file)) syncImageBindingHint();
      calibrationUi.calibration_file_summary.textContent = `${calibrationExtraFiles.length} 个额外附件：${calibrationExtraFiles.map(calibrationExtraDisplayName).join("、")}`;
      refreshCalibrationAfterMetaChange();
    };
    // input 时就把名称落库（不依赖失焦），change 时再做一次规范化回填。
    alias.addEventListener("input", () => syncExtraAlias({ normalizeInput: false }));
    alias.addEventListener("change", () => syncExtraAlias({ normalizeInput: true }));
    if (isCalibrationImage(file)) {
      binding = document.createElement("input");
      binding.type = "text";
      binding.className = "extra-manager-binding";
      binding.placeholder = "绑定角色（可多个，用逗号分隔）";
      binding.value = (calibrationExtraBindings.get(key) || []).join("、");
      binding.disabled = Boolean(calibrationBatchId);
      binding.title = "填写与【出场人物】一致的角色名；输入后下方各视频卡片会立即出现“额外图片”选项，无需重新校准";
      const syncExtraBinding = () => {
        const values = binding.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
        if (values.length) calibrationExtraBindings.set(key, [...new Set(values)]);
        else calibrationExtraBindings.delete(key);
        syncImageBindingHint();
        refreshCalibrationAfterMetaChange();
      };
      // 输入过程中实时绑定，避免“框里已写角色名但还没失焦，视频卡片仍提示没有绑定”。
      binding.addEventListener("input", syncExtraBinding);
      binding.addEventListener("change", syncExtraBinding);
      bindingHint = document.createElement("div");
      bindingHint.className = "extra-manager-inferred-binding";
      calibrationExtraBindingHintRefreshers.set(key, syncImageBindingHint);
      syncImageBindingHint();
    } else {
      binding = document.createElement("div");
      binding.className = "extra-manager-auto-binding";
      binding.textContent = `自动绑定角色：${calibrationExtraBindingNames(file).join("、") || "未命名"}`;
      binding.title = "音频按工作台名称自动绑定同名角色";
    }
    row.append(kind, original, alias, binding);
    if (bindingHint) row.append(bindingHint);
    calibrationUi.calibration_extra_manager.append(row);
  }
}

function clearCalibrationExtraFiles() {
  if (calibrationBatchId) return;
  calibrationExtraFiles = [];
  calibrationExtraAliases.clear();
  calibrationExtraBindings.clear();
  calibrationSubjectManualOverrides.clear();
  calibrationUi.calibration_files.value = "";
  calibrationUi.calibration_file_summary.textContent = "没有额外附件";
  calibrationUi.calibration_clear_files.disabled = true;
  updateCalibrationExtraLibraryUi();
  renderCalibrationSubjectSummary();
  refreshCalibrationAfterMetaChange();
  appendCalibrationLog("已清除额外图片/音频；整稿和场景文件夹未改变");
}

function refreshCalibrationAfterMetaChange() {
  // 额外附件的工作台名称、角色绑定等元数据变化后，若整稿仍在，直接静默重算
  // 资产审查卡，让“主体库 / 额外图片”的可选项立刻刷新，不再要求用户先失焦、
  // 再手动点一次“校准”；没有整稿时才退化为待校准占位。
  if (calibrationUi.calibration_prompt.value.trim()) {
    calibrateDraft(false);
  } else {
    invalidateCalibration();
  }
}

function invalidateCalibration(options = {}) {
  calibrated = null;
  const keepAssetAudit = Boolean(options.keepAssetAudit) &&
    calibrationUi.calibration_asset_summary.childElementCount > 0;
  if (!keepAssetAudit) {
    calibrationUi.calibration_asset_summary.replaceChildren();
    const assetEmpty = document.createElement("div");
    assetEmpty.className = "asset-empty";
    assetEmpty.textContent = "内容或附件已变化，请重新校准后检查本批资产";
    calibrationUi.calibration_asset_summary.append(assetEmpty);
  }
  calibrationUi.calibration_summary.textContent = options.reason ||
    (calibrationUi.calibration_prompt.value.trim()
      ? "内容或附件已变化，请重新点击校准。"
      : "尚未校准");
  calibrationUi.calibration_summary.dataset.level = "";
  calibrationUi.calibration_status.textContent = keepAssetAudit ? "待重新校准" : "待校准";
  calibrationUi.calibration_status.dataset.state = "";
}

function calibrateDraft(showAlert = false) {
  const prompt = calibrationUi.calibration_prompt.value;
  if (!prompt.trim()) {
    if (showAlert) alert("请先粘贴完整提示词。");
    return null;
  }
  const sceneCandidateFiles = allCalibrationSceneFiles();
  const analyzed = self.JimengLockAnalyzer.matchCalibrationSceneFiles(
    prompt,
    sceneCandidateFiles,
  );
  const allSubjectPlans = analyzed.subjectPlans || [];
  calibrationParsedSubjectPlans = allSubjectPlans;
  refreshCalibrationExtraBindingHints();
  const resolvedSubjectPlans = allSubjectPlans.map(resolveCalibrationSubjectPlan);
  const subjectPlans = [];
  const subjectImagePlans = [];
  for (const plan of resolvedSubjectPlans) {
    const key = calibrationSubjectKey(plan.videoNumber, plan.sourceSubjectName || plan.anchor || plan.name);
    if (calibrationDisabledSubjects.has(key)) continue;
    const selectedExtra = calibrationSelectedExtraImage(plan);
    if (selectedExtra) {
      subjectImagePlans.push(calibrationSubjectImagePlan(plan, selectedExtra));
    } else if (calibrationSubjectAvailabilityState(plan.name) !== "missing") {
      subjectPlans.push(plan);
    }
  }
  const result = {
    ...analyzed,
    allSubjectPlans,
    subjectImagePlans,
    subjectPlans,
  };
  if (!result.videos.length) {
    calibrationUi.calibration_summary.textContent = "没有识别到视频：请使用“视频编号…｜场景：…｜人物：…”标题，或独立的“视频编号…”配合【场景与连续状态】和【出场人物】段落。";
    calibrationUi.calibration_summary.dataset.level = "warning";
    if (showAlert) alert("未识别到视频。请检查视频编号，以及标题字段或【场景与连续状态】、【出场人物】段落。");
    return null;
  }
  renderCalibrationAssetAudit(result);
  const duplicateNumbers = duplicateCalibrationNumbers(result.videos);
  const lines = result.videos.map((video) => {
    // 每个 scenePlan 携带自己的偏移；同一视频可有 A/B/C/D 多个场景。
    const videoScenePlans = video.scenePlans?.length ? video.scenePlans : [video.scenePlan].filter(Boolean);
    const sceneStates = videoScenePlans.map((scenePlan) => {
      const sceneMatch = result.matches.find((item) => item.sceneKey === scenePlan.sceneKey);
      const sceneChoice = result.sceneChoices.find((item) => item.sceneKey === scenePlan.sceneKey);
      const state = sceneMatch
        ? `→${sceneMatch.fileName}`
        : sceneChoice?.candidates.length > 1
          ? `→待选择（${sceneChoice.candidates.length} 个候选）`
          : "→未匹配";
      return `${scenePlan.sceneName}${state}`;
    });
    const subjectSources = [
      ...result.subjectPlans
        .filter((plan) => String(plan.videoNumber) === String(video.videoNumber))
        .map((plan) => `${plan.sourceSubjectName || plan.name}（主体库）`),
      ...result.subjectImagePlans
        .filter((plan) => String(plan.videoNumber) === String(video.videoNumber))
        .map((plan) => `${plan.sourceSubjectName || plan.originalName}（额外图片：${plan.name}）`),
    ];
    const matchedCount = videoScenePlans.filter((scenePlan) =>
      result.matches.some((item) => item.sceneKey === scenePlan.sceneKey)).length;
    return `视频${video.videoNumber}｜场景 ${matchedCount}/${videoScenePlans.length}：${sceneStates.join("；") || "未识别"}｜人物 @：${subjectSources.join("、") || "无（均未勾选或不可用）"}｜总 @：${matchedCount + subjectSources.length} 处`;
  });
  const problems = [];
  if (result.unmatchedScenes.length) {
    problems.push(`⚠ 未匹配场景 ${result.unmatchedScenes.length} 处（发送时跳过对应图片 @）：${result.unmatchedScenes.map((item) => `视频${item.videoNumber} ${item.sceneName}`).join("、")}`);
  }
  if (result.ambiguousScenes.length) {
    problems.push(`多候选场景 ${result.ambiguousScenes.length} 处未自动选图（发送时跳过对应图片 @；可给目标图片改名或加别名后重新校准）：${result.ambiguousScenes.map((item) => `视频${item.videoNumber} ${item.sceneName}（${item.candidates.length} 张）`).join("、")}`);
  }
  if (duplicateNumbers.length) problems.push(`视频编号重复：${duplicateNumbers.join("、")}`);
  const matchedSceneFiles = dedupeCalibrationSceneCandidates(result.matches.map((item) => item.file));
  calibrated = {
    ...result,
    prompt,
    duplicateNumbers,
    files: dedupeCalibrationSceneCandidates([
      ...calibrationExtraFiles.map(materializeCalibrationExtraFile),
      ...matchedSceneFiles,
    ]),
  };
  calibrationUi.calibration_summary.textContent = [
    `整稿 1 条｜视频编号 ${result.videos.length} 个｜人物 @ ${result.subjectPlans.length + result.subjectImagePlans.length} 处｜场景 @ ${result.matches.length}/${result.scenePlans.length} 处`,
    `本次实际上传：${matchedSceneFiles.length} 张命中场景图＋${calibrationExtraFiles.length} 个额外附件；其余场景候选不会上传`,
    ...problems.map((item) => `⚠ ${item}`),
    ...lines,
  ].join("\n");
  calibrationUi.calibration_summary.dataset.level = problems.length ? "warning" : "success";
  const blockingProblems = duplicateNumbers.length;
  calibrationUi.calibration_status.textContent = blockingProblems
    ? "校准未通过，请先处理重复编号"
    : (result.unmatchedScenes.length || result.ambiguousScenes.length)
      ? "校准完成，缺失或多候选场景图将跳过后继续发送"
      : "校准通过，可以整稿发送";
  calibrationUi.calibration_status.dataset.state = blockingProblems ? "failed_before_click" : "confirmed";
  appendCalibrationLog(`整稿校准：${result.videos.length} 个编号，${result.subjectPlans.length} 处人物 @，${result.matches.length}/${result.scenePlans.length} 处场景 @${result.unmatchedScenes.length ? "；缺图将跳过并继续发送" : ""}`);
  return calibrated;
}

async function sendCalibratedDraft() {
  if (calibrationBatchId) return;
  const result = calibrateDraft(false);
  if (!result) return alert("整稿校准失败，未发送。");
  if (result.duplicateNumbers.length) return alert(`视频编号重复：${result.duplicateNumbers.join("、")}。请修正后再发送。`);
  // 未匹配场景按“少图也发送”策略处理：该场景不会插入图片 @，
  // 多候选场景也不阻断发送；请通过下面资产审查卡和图片别名校准。
  if (result.files.some((file) => file.size > CALIBRATION_MAX_FILE_BYTES)) {
    return alert("单个附件不能超过 80 MB。");
  }
  const totalBytes = result.files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > CALIBRATION_MAX_TOTAL_BYTES) return alert("整稿附件合计不能超过 160 MB。");

  let promptChunks;
  try {
    promptChunks = splitCalibrationPrompt(result.prompt);
  } catch (error) {
    return alert(String(error?.message || error));
  }

  const [source] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!source?.url?.startsWith("https://jimeng.jianying.com/ai-tool/")) {
    return alert("请先在当前窗口打开即梦页面并进入右侧“对话”。");
  }
  let preflight;
  try {
    const executor = await chrome.runtime.sendMessage({ type: "ENSURE_SOURCE_EXECUTOR", tabId: source.id });
    if (!executor?.ok) return alert(executor?.error || "即梦执行器未更新，无法安全操作。");
    if ((calibrationUi.calibration_work_mode.value || "conversation") === "conversation") {
      const opened = await chrome.tabs.sendMessage(source.id, { type: "OPEN_CONVERSATION_V15" });
      if (!opened?.ok) return alert(opened?.error || "无法打开右侧对话面板。");
    }
    preflight = await chrome.tabs.sendMessage(source.id, {
      type: "CHECK_SOURCE_CLEAN_V15",
      mode: calibrationUi.calibration_work_mode.value || "conversation",
    });
  } catch (_) {
    return alert("无法检查当前画布。重新加载扩展后，请先刷新这个即梦标签再重试。");
  }
  if (!preflight?.ok) return alert(preflight?.error || "当前画布预检失败。");
  if (!preflight.clean) return alert("当前源画布输入区不是空白。请清空文字和附件后再发送整稿。");
  const splitMode = promptChunks.length > 1;
  const sendIntervalMs = splitMode ? 60000 : 30000;
  const confirmText = splitMode
    ? `整稿正文超过 ${CALIBRATION_MAX_EDITOR_CHARS.toLocaleString()} 字符，将按视频编号拆成 ${promptChunks.length} 批发送；第 1 批使用当前标签。每批含 N 个视频时，至少等待 N 分钟，并确认画布新增 N 个视频任务卡（已进入排队）后才新建标签发送下一批。是否继续？`
    : `将在当前即梦标签中，把 ${result.videos.length} 个视频编号作为一整份提示词发送一次，不会复制新标签；并精准插入 ${result.subjectPlans.length} 处人物 @ 和 ${result.matches.length} 处场景 @。是否继续？`;
  if (!confirm(confirmText)) return;

  calibrationBatchId = crypto.randomUUID();
  calibrationJobId = crypto.randomUUID();
  setCalibrationControls(true, calibrationBatchId, false);
  calibrationUi.calibration_status.textContent = "正在读取附件并准备整稿发送";
  appendCalibrationLog(`准备整稿发送：批次 ${calibrationBatchId}，共 ${result.videos.length} 个视频编号${splitMode ? `，已按 20,000 字符限制拆成 ${promptChunks.length} 批；每批按视频数等待并核验新增任务卡` : ""}`);
  let stagedTransferIds = [];
  try {
    const chunkJobs = promptChunks.map((chunk, index) => buildCalibrationChunkJob(result, chunk, index, promptChunks.length));
    const batchFiles = dedupeCalibrationSceneCandidates(chunkJobs.flatMap((job) => job.files));
    const staged = await self.JimengFileTransfer.stageFiles(batchFiles, ({ fileIndex, fileCount, chunkIndex }) => {
      if (chunkIndex === 0) appendCalibrationLog(`附件分块传输：正在准备第 ${fileIndex + 1}/${fileCount} 个文件`);
    });
    stagedTransferIds = staged.transferIds;
    const descriptorByKey = new Map(batchFiles.map((file, index) => [calibrationFileKey(file), staged.descriptors[index]]));
    const jobs = chunkJobs.map((job) => ({
      ...job,
      id: job.id === chunkJobs[0].id ? calibrationJobId : crypto.randomUUID(),
      mode: calibrationUi.calibration_work_mode.value || "conversation",
      files: job.files.map((file) => descriptorByKey.get(calibrationFileKey(file))).filter(Boolean),
    }));
    const response = await chrome.runtime.sendMessage({
      type: "START_BATCH",
      sourceTabId: source.id,
      jobs,
      intervalMs: sendIntervalMs,
      batchId: calibrationBatchId,
      reuseSourceTab: !splitMode,
      reuseSourceTabFirst: splitMode,
    });
    if (!response?.ok) throw new Error(response?.error || "整稿发送启动失败");
    stagedTransferIds = [];
    if (response.stoppedOnFailure) appendCalibrationLog("整稿在校准或页面执行阶段失败，未发送不完整内容");
  } catch (error) {
    await self.JimengFileTransfer.releaseTransfers(stagedTransferIds);
    appendCalibrationLog(`整稿发送失败：${String(error?.message || error)}`);
    alert(String(error?.message || error));
  } finally {
    setCalibrationControls(false, null, false);
  }
}

async function scanCalibrationSubjects(rawNames = null, scopeLabel = "整批") {
  if (calibrationBatchId) return;
  const result = calibrateDraft(false);
  if (!result) return alert("请先粘贴整稿，并完成一次基础校准");
  const names = Array.isArray(rawNames)
    ? expandCalibrationSubjectScanNames(rawNames)
    : expandCalibrationSubjectScanNames(result.allSubjectPlans);
  if (!names.length) {
    ensureCalibrationSubjectAvailability();
    renderCalibrationSubjectSummary();
    return alert("没有识别到需要检测的人物");
  }
  await scanCalibrationSubjectNames(names, scopeLabel);
}

async function scanCalibrationSubjectNames(names, scopeLabel = "整批") {
  const [source] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!source?.url?.startsWith("https://jimeng.jianying.com/ai-tool/")) {
    return alert("请先在当前窗口打开即梦页面并进入右侧对话");
  }
  calibrationUi.calibration_subject_scan.disabled = true;
  calibrationUi.calibration_subject_scan.textContent = "正在检测主体库...";
  calibrationUi.calibration_subject_summary.textContent = `正在检测${scopeLabel}主体库：${names.join("、")}`;
  appendCalibrationLog(`开始检测${scopeLabel}主体库：${names.join("、")}`);
  try {
    const executor = await chrome.runtime.sendMessage({ type: "ENSURE_SOURCE_EXECUTOR", tabId: source.id });
    if (!executor?.ok) throw new Error(executor?.error || "即梦执行器未更新，无法检测主体库");
    if ((calibrationUi.calibration_work_mode.value || "conversation") === "conversation") {
      const opened = await chrome.tabs.sendMessage(source.id, { type: "OPEN_CONVERSATION_V15" });
      if (!opened?.ok) throw new Error(opened?.error || "无法打开右侧对话面板");
    }
    const response = await chrome.tabs.sendMessage(source.id, {
      type: "SCAN_SUBJECT_LIBRARY_V15",
      names,
      mode: calibrationUi.calibration_work_mode.value || "conversation",
    });
    if (!response?.ok) throw new Error(response?.error || "主体库检测失败");
    mergeCalibrationSubjectAvailability(response);
    renderCalibrationSubjectSummary();
    calibrateDraft(false);
    appendCalibrationLog(
      `${scopeLabel}主体库检测完成：存在 ${(response.available || []).length} 个，不存在 ${(response.missing || []).length} 个，未确认 ${(response.unknown || []).length} 个`,
    );
  } catch (error) {
    calibrationUi.calibration_subject_summary.textContent = String(error?.message || error);
    appendCalibrationLog(`主体库检测失败：${String(error?.message || error)}`);
    alert(String(error?.message || error));
  } finally {
    calibrationUi.calibration_subject_scan.disabled = Boolean(calibrationBatchId);
    calibrationUi.calibration_subject_scan.textContent = "检测主体库人物并自动跳过不存在项";
  }
}

function ensureCalibrationSubjectAvailability() {
  if (calibrationSubjectAvailability) return calibrationSubjectAvailability;
  calibrationSubjectAvailability = {
    available: new Set(),
    missing: new Set(),
    unknown: new Set(),
    availableNames: [],
    missingNames: [],
    unknownNames: [],
    availableCandidates: {},
    checkedAt: Date.now(),
  };
  return calibrationSubjectAvailability;
}

function mergeCalibrationSubjectAvailability(response) {
  const state = ensureCalibrationSubjectAvailability();
  const buckets = [
    ["available", response.available || []],
    ["missing", response.missing || []],
    ["unknown", response.unknown || []],
  ];
  for (const [bucket, values] of buckets) {
    for (const name of values) {
      const key = calibrationSubjectNameKey(name);
      if (!key) continue;
      state.available.delete(key);
      state.missing.delete(key);
      state.unknown.delete(key);
      state.availableNames = (state.availableNames || []).filter((item) => calibrationSubjectNameKey(item) !== key);
      state.missingNames = (state.missingNames || []).filter((item) => calibrationSubjectNameKey(item) !== key);
      state.unknownNames = (state.unknownNames || []).filter((item) => calibrationSubjectNameKey(item) !== key);
      state[bucket].add(key);
      state[`${bucket}Names`].push(name);
    }
  }
  for (const [baseName, candidates] of Object.entries(response.availableCandidates || {})) {
    const key = calibrationSubjectNameKey(baseName);
    if (!key) continue;
    state.availableCandidates[key] = [...new Set((candidates || []).map((item) => String(item || "").trim()).filter(Boolean))];
  }
  state.checkedAt = Date.now();
}

function uniqueCalibrationSubjectNames(subjectPlans) {
  const seen = new Set();
  const names = [];
  for (const plan of subjectPlans || []) {
    const name = String(plan?.name || "").trim();
    const key = calibrationSubjectNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function calibrationSubjectNameKey(name) {
  // 去掉空白与零宽字符/BOM（AI 生成的整稿可能夹带），避免“阮乔”与“阮乔​”
  // 视觉相同却匹配不上，导致额外图片绑定或主体库检测漏项。
  return String(name || "")
    .replace(/[\s​-‍﻿]/g, "")
    .toLocaleLowerCase();
}

function calibrationSubjectAvailabilityState(name) {
  if (!calibrationSubjectAvailability) return "unchecked";
  const key = calibrationSubjectNameKey(name);
  if (calibrationSubjectAvailability.missing?.has(key)) return "missing";
  if (calibrationSubjectAvailability.available?.has(key)) return "available";
  if (calibrationSubjectAvailability.unknown?.has(key)) return "unknown";
  return "unchecked";
}

function calibrationExtraImagesForSubject(name) {
  const key = calibrationSubjectNameKey(name);
  if (!key) return [];
  return calibrationExtraFiles.filter((file) =>
    isCalibrationImage(file) &&
    calibrationExtraBindingNames(file).some((role) => calibrationSubjectNameKey(role) === key));
}

function calibrationExtraImageForSubject(name) {
  return calibrationExtraImagesForSubject(name)[0] || null;
}

function calibrationSubjectEffectiveState(name) {
  const state = calibrationSubjectAvailabilityState(name);
  if (state === "missing" && calibrationExtraImageForSubject(name)) return "image";
  return state;
}

function renderCalibrationSubjectSummary() {
  if (!calibrationUi.calibration_subject_summary) return;
  if (!calibrationSubjectAvailability) {
    calibrationUi.calibration_subject_summary.textContent = "尚未检测主体库；未检测时仍会在发送阶段自动跳过明确不存在的主体。";
    calibrationUi.calibration_subject_summary.dataset.level = "";
    return;
  }
  const available = calibrationSubjectAvailability.availableNames || [];
  const missing = calibrationSubjectAvailability.missingNames || [];
  const unknown = calibrationSubjectAvailability.unknownNames || [];
  const candidateLines = Object.entries(calibrationSubjectAvailability.availableCandidates || {})
    .filter(([, candidates]) => candidates.length)
    .map(([name, candidates]) => `主体库候选：${name} → ${candidates.join("、")}`);
  calibrationUi.calibration_subject_summary.textContent = [
    `主体库检测：存在 ${available.length} 个，不存在 ${missing.length} 个，未确认 ${unknown.length} 个。`,
    missing.length ? `不存在，发送时自动跳过 @：${missing.join("、")}` : "",
    unknown.length ? `未确认，发送阶段继续实时判断：${unknown.join("、")}` : "",
    ...candidateLines,
  ].filter(Boolean).join("\n");
  calibrationUi.calibration_subject_summary.dataset.level = missing.length || unknown.length ? "warning" : "success";
}

function buildCalibrationPrefix(videoNumbers) {
  const numbers = [...new Set((videoNumbers || []).map((item) => String(item).trim()).filter(Boolean))];
  const count = numbers.length;
  const list = numbers.map((number) => `视频编号${number}`).join("、");
  const configured = String(calibrationUi.calibration_prefix?.value || "").trim();
  const model = /使用\s*([^，,：:]+?)\s*生成\s*16:9横屏视频/u.exec(configured)?.[1]?.trim() || "Seedance 2.0";
  return `使用${model}生成16:9横屏视频，以下每个视频的提示词的全部内容你都要一比一全部复制粘贴使用，根据视频编号${count}分割视频提示词，1个编号代表生成一个视频，每个视频的人物场景主体都要精准锁定我@的主体,现在是要生成${count}个视频，分别是${list}，现在开始执行任务：`;
}

function calibrationSegmentNumber(segment) {
  const text = String(segment || "");
  return String(/【\s*视频编号\s*([^】\n]+)】/.exec(text)?.[1] || /^\s*(?:#{1,6}\s*)?(?:视频编号|视频)\s*([^\s（(｜|\n]+)/m.exec(text)?.[1] || "未知").trim();
}

function splitCalibrationPrompt(prompt) {
  const value = String(prompt || "");
  const projectStarts = [...value.matchAll(/【项目规格】/g)].map((match) => match.index);
  const headerPattern = /^\s*(?:#{1,6}\s*)?视频编号\s*[^\n]+$/gm;
  const headers = [...value.matchAll(headerPattern)];
  const starts = projectStarts.length > 1 ? projectStarts : headers.map((match) => match.index);
  if (!starts.length) throw new Error("整稿超过长度限制，但没有找到可按“【项目规格】”或“视频编号”拆分的标题。");
  const segments = starts.map((rawStart, index) => {
    const rawEnd = starts[index + 1] ?? value.length;
    const raw = value.slice(rawStart, rawEnd);
    const trimmed = raw.trim();
    const leading = raw.indexOf(trimmed);
    return { prompt: trimmed, start: rawStart + Math.max(0, leading) };
  }).filter((item) => item.prompt && calibrationSegmentNumber(item.prompt) !== "未知");
  const chunks = [];
  let current = null;
  for (const segment of segments) {
    const number = calibrationSegmentNumber(segment.prompt);
    const singlePrefixLength = buildCalibrationPrefix([number]).length;
    if (singlePrefixLength + segment.prompt.length > CALIBRATION_MAX_EDITOR_CHARS) {
      throw new Error(`视频${number}单独就超过 20,000 字符，无法按视频段安全拆分；请先缩短该视频提示词。`);
    }
    const nextNumbers = [...(current?.videoNumbers || []), number];
    const nextPrompt = current ? current.prompt + "\n\n" + segment.prompt : segment.prompt;
    if (!current || buildCalibrationPrefix(nextNumbers).length + nextPrompt.length > CALIBRATION_MAX_EDITOR_CHARS) {
      current = { prompt: "", start: segment.start, videoNumbers: [], segmentStarts: new Map() };
      chunks.push(current);
    }
    const localStart = current.prompt.length ? current.prompt.length + 2 : 0;
    if (current.prompt) current.prompt += "\n\n";
    current.segmentStarts.set(segment.start, localStart);
    current.prompt += segment.prompt;
    current.videoNumbers.push(number);
  }
  return chunks;
}

function calibrationAudioIntroEntriesForVideo(result, videoNumber) {
  const video = (result?.videos || []).find((item) => String(item.videoNumber) === String(videoNumber));
  if (!video) return [];
  const audioFiles = calibrationExtraFiles.filter((file) => !isCalibrationImage(file));
  const seen = new Set();
  const entries = [];
  for (const rawRoleName of video.characters || []) {
    const roleName = String(rawRoleName || "").trim();
    const roleKey = calibrationSubjectNameKey(roleName);
    if (!roleKey) continue;
    for (const file of audioFiles) {
      const bound = calibrationExtraBindingNames(file)
        .some((name) => calibrationSubjectNameKey(name) === roleKey);
      if (!bound) continue;
      const audioName = String(self.JimengLockAnalyzer.stemOf(calibrationExtraDisplayName(file)) || "").trim();
      if (!audioName) continue;
      const key = `${roleKey}\u0000${calibrationExtraFileKey(file)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ roleName, audioName, fileKey: calibrationExtraFileKey(file) });
    }
  }
  return entries;
}

function decorateCalibrationChunkWithAudioIntros(result, chunk) {
  const starts = [...chunk.segmentStarts.values()].sort((a, b) => a - b);
  const output = [];
  const lockedAudio = [];
  const offsetDeltaByVideo = new Map();
  let outputLength = 0;

  for (let index = 0; index < starts.length; index += 1) {
    const oldStart = starts[index];
    const oldEnd = starts[index + 1] ?? chunk.prompt.length;
    const videoNumber = String(chunk.videoNumbers[index] || "");
    const entries = calibrationAudioIntroEntriesForVideo(result, videoNumber);

    for (const [entryIndex, entry] of entries.entries()) {
      const phrase = `这是${entry.roleName}的音色`;
      output.push(phrase);
      outputLength += phrase.length;
      lockedAudio.push({
        kind: "audio",
        name: entry.audioName,
        anchor: phrase,
        offset: outputLength,
        occurrence: 1,
        sourceSubjectName: entry.roleName,
        extraFileKey: entry.fileKey,
        required: true,
        videoNumber,
      });
      const punctuation = entryIndex === entries.length - 1 ? "\n" : "，";
      output.push(punctuation);
      outputLength += punctuation.length;
    }

    offsetDeltaByVideo.set(videoNumber, outputLength - oldStart);
    const segment = chunk.prompt.slice(oldStart, oldEnd);
    output.push(segment);
    outputLength += segment.length;
  }

  return {
    prompt: output.join(""),
    lockedAudio,
    offsetDeltaByVideo,
  };
}

function buildCalibrationChunkJob(result, chunk, index, totalChunks) {
  const numbers = new Set(chunk.videoNumbers);
  const offset = chunk.start;
  const audioDecorated = decorateCalibrationChunkWithAudioIntros(result, chunk);
  const localOffset = (item) => {
    const segmentStart = [...chunk.segmentStarts.keys()]
      .filter((start) => start <= item.offset)
      .sort((a, b) => b - a)[0] ?? offset;
    return (chunk.segmentStarts.get(segmentStart) || 0) + item.offset - segmentStart;
  };
  const shiftedLocalOffset = (item) =>
    localOffset(item) + (audioDecorated.offsetDeltaByVideo.get(String(item.videoNumber)) || 0);
  const plansForChunk = (items) => items
    .filter((item) => numbers.has(String(item.videoNumber)))
    .map((item) => ({ ...item, offset: shiftedLocalOffset(item), required: true }));
  const matchedImages = result.matches
    .filter((item) => numbers.has(String(item.videoNumber)))
    .map((item) => item.file);
  const files = dedupeCalibrationSceneCandidates([
    ...calibrationExtraFiles.map(materializeCalibrationExtraFile),
    ...matchedImages,
  ]);
  return {
    id: crypto.randomUUID(),
    label: totalChunks > 1
      ? `整稿分批 ${index + 1}/${totalChunks}（视频${chunk.videoNumbers.join("、")}）`
      : `整稿校准（${result.videos.length} 个编号）`,
    prompt: audioDecorated.prompt,
    prefix: buildCalibrationPrefix(chunk.videoNumbers),
    characters: [],
    files,
    lockedSubjects: plansForChunk(result.subjectPlans),
    lockedAudio: audioDecorated.lockedAudio,
    audioIntroMode: audioDecorated.lockedAudio.length > 0,
    lockedImages: [
      ...result.matches
        .filter((item) => numbers.has(String(item.videoNumber)))
        .map((item) => ({
          kind: "image", name: item.name, anchor: item.anchor,
          offset: shiftedLocalOffset(item), occurrence: item.occurrence, required: true,
        })),
      ...plansForChunk(result.subjectImagePlans || []).map((item) => ({
        kind: "image",
        name: item.name,
        anchor: item.anchor || item.sourceSubjectName || item.name,
        offset: item.offset,
        occurrence: item.occurrence,
        sourceSubjectName: item.sourceSubjectName,
        extraFileKey: item.extraFileKey,
        required: true,
      })),
    ],
    strictAssets: false,
    expectedVideoCount: chunk.videoNumbers.length,
    waitForQueueCards: totalChunks > 1,
    state: "pending",
    detail: totalChunks > 1 ? "分批整稿待发送" : "精准 @ 整稿待发送",
  };
}

async function pauseCalibration() {
  calibrationUi.calibration_pause.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "PAUSE_BATCH", batchId: calibrationBatchId });
    if (!response?.ok) throw new Error(response?.error || "当前没有可暂停的整稿发送");
    calibrationUi.calibration_pause.textContent = "已请求暂停当前重试";
    appendCalibrationLog("已请求暂停当前整稿重试");
  } catch (error) {
    appendCalibrationLog(`暂停失败：${String(error?.message || error)}`);
  }
}

function setCalibrationControls(active, batchId, paused = false) {
  calibrationBatchId = active ? batchId : null;
  calibrationUi.calibration_send.disabled = active;
  calibrationUi.calibrate.disabled = active;
  calibrationUi.calibration_subject_scan.disabled = active;
  calibrationUi.calibration_scene_folder.disabled = active;
  calibrationUi.calibration_scene_files.disabled = active;
  calibrationUi.calibration_clear_folder.disabled = active || !allCalibrationSceneFiles().length;
  calibrationUi.calibration_clear_selected_scenes.disabled = active || !calibrationSceneRemovalSelections.size;
  for (const control of calibrationUi.calibration_scene_manager.querySelectorAll("input, button")) {
    control.disabled = active;
  }
  for (const control of calibrationUi.calibration_extra_manager.querySelectorAll("input, button")) {
    control.disabled = active;
  }
  for (const control of calibrationUi.calibration_asset_summary.querySelectorAll("input, button, select")) {
    control.disabled = active;
  }
  calibrationUi.calibration_files.disabled = active;
  calibrationUi.calibration_clear_files.disabled = active || !calibrationExtraFiles.length;
  calibrationUi.calibration_pause.disabled = !active || paused;
  calibrationUi.calibration_pause.textContent = paused ? "已请求暂停当前重试" : "暂停当前重试";
}

function calibrationSubjectKey(videoNumber, name) {
  return `${String(videoNumber || "").trim()}\u0000${String(name || "").trim().toLocaleLowerCase()}`;
}

function calibrationSubjectDescriptorFragments(description) {
  const fragments = [];
  for (const rawPart of String(description || "").split(/[，,、；;。|｜\n]/)) {
    let part = String(rawPart || "").trim();
    if (!part) continue;
    part = part
      .replace(/[。！？!?；;，,、]+$/g, "")
      .replace(/^(?:全程在场|现实与闪回中在场|现实中在场|闪回中在场|开镜在场|开镜静态|开镜|在场|出场|现实|闪回)\s*/g, "")
      .replace(/^(?:成年|少年|少女|青年|中年|老年|男性|女性|人类伪装|保持人形|人形|穿着|穿|身着|一身|一套|换上|换成|变装成|披着|戴着|带着|呈现|出现|拥有|保持)\s*/g, "")
      .replace(/^(?:完整)\s*/g, "")
      .replace(/[（）()\[\]【】]/g, "")
      .replace(/\s+/g, "")
      .replace(/(?:形态|状态)$/g, "")
      .trim();
    if (!part || part.length < 2) continue;
    if (/^(?:在场|出场|默认|通用|形态|状态)$/.test(part)) continue;
    if (calibrationSubjectDescriptorIsGeneric(part)) continue;
    // 只把外观/服装/形态描述用于候选主体名。情绪、站位、表演等正文
    // 不是主体库命名依据，不能生成“苏晚-高度紧张”这类伪候选。
    if (!calibrationSubjectDescriptorLooksLikeForm(part)) continue;
    fragments.push(part);
  }
  const unique = [...new Set(fragments)];
  return unique.length > 4 ? unique.filter((_, index) => index < 4) : unique;
}

function calibrationSubjectDescriptorLooksLikeForm(fragment) {
  const value = String(fragment || "").replace(/[\s　]/g, "");
  return /(?:衣|服|装|袍|裙|裤|衫|西装|制服|睡衣|便服|礼服|校服|工作服|发型|发色|白发|黑发|金发|银发|棕发|红发|蓝发|耳|尾|兽形|人形|伪装|变装|形态)/u.test(value);
}

function calibrationSubjectCandidateNames(plan) {
  const base = String(plan?.name || "").trim();
  // 只返回基础角色名。主体库中的多个同名结果由扫描结果展示，
  // 不再依据服装、形态或描述自动拼接候选并尝试发送。
  return base ? [base] : [];
}

function addCalibrationSubjectCandidateVariants(names, base, fragment) {
  const value = String(fragment || "").trim();
  if (!value) return;
  // 主体库常见命名有短横线、下划线、空格和括号几种写法；
  // 这些只是同一视频的候选，不代表会把形态全局套用。
  for (const separator of ["-", "_", " ", "·"]) {
    names.add(`${base}${separator}${value}`);
  }
  names.add(`${base}（${value}）`);
  names.add(`${base}(${value})`);
  names.add(`${base}${value}`);
}

function calibrationSubjectCandidateScore(candidate, baseName, fragments) {
  const candidateKey = calibrationSubjectNameKey(candidate);
  const baseKey = calibrationSubjectNameKey(baseName);
  if (!candidateKey) return -1;
  if (candidateKey === baseKey) return 1;
  let score = 0;
  let matched = 0;
  for (const fragment of fragments || []) {
    const fragmentKey = calibrationSubjectNameKey(fragment);
    if (!fragmentKey) continue;
    // “成年垂耳兔精形态 / 白发人形”等是角色的通用身份描述，
    // 不能仅凭这些词把某个具体变装主体自动套到本视频；具体服装、
    // 配饰或明确形态词仍可通过候选下拉单独选择。
    if (calibrationSubjectDescriptorIsGeneric(fragment)) continue;
    if (candidateKey.includes(fragmentKey)) {
      score += 10 + Math.min(fragmentKey.length, 12);
      matched += 1;
    }
  }
  if (!score) return 0;
  score += matched * 5;
  score += Math.min(candidateKey.length, 50) / 100;
  return score;
}

function calibrationSubjectDescriptorIsGeneric(fragment) {
  const value = String(fragment || "")
    .replace(/[\s　]/g, "")
    .replace(/[，,、；;。|｜]/g, "");
  if (!value) return true;
  return /^(?:(?:成年|少年|少女|青年|中年|老年|男性|女性|白发|黑发|金发|棕发|红发|蓝发|银发|人类伪装|保持人形|人形|人类|垂耳兔精|兔精|狐狸精|蛇妖|妖精|妖怪|兽形|动物形态|人形态)+)(?:形态|状态)?$/u.test(value);
}

function resolveCalibrationSubjectPlan(plan) {
  const baseName = String(plan?.name || "").trim();
  const key = calibrationSubjectKey(plan?.videoNumber, baseName);
  // 发送永远只锁定提示词中的基础角色名；服装/形态描述不再自动推断主体。
  const resolvedName = baseName;
  calibrationSubjectAutoOverrides.set(key, baseName);
  return {
    ...plan,
    originalName: baseName,
    sourceSubjectName: baseName,
    candidateNames: [baseName],
    autoResolvedName: baseName,
    resolvedName,
    name: resolvedName,
    anchor: plan?.anchor || baseName,
  };
}

function expandCalibrationSubjectScanNames(subjectPlans) {
  const names = [];
  for (const item of subjectPlans || []) {
    if (typeof item === "string") {
      const name = String(item || "").trim();
      if (name) names.push(name);
      continue;
    }
    const plan = resolveCalibrationSubjectPlan(item);
    if (plan.sourceSubjectName || plan.name) names.push(plan.sourceSubjectName || plan.name);
  }
  return uniqueCalibrationSubjectNames(names.map((name) => ({ name })));
}

function calibrationSubjectPlanKey(plan) {
  return calibrationSubjectKey(plan?.videoNumber, plan?.sourceSubjectName || plan?.originalName || plan?.anchor || plan?.name);
}

function calibrationSubjectPlanSelectionValue(plan) {
  const key = calibrationSubjectPlanKey(plan);
  const baseName = String(plan?.sourceSubjectName || plan?.originalName || plan?.name || "").trim();
  const extraImages = calibrationExtraImagesForSubject(baseName);
  const manual = calibrationSubjectManualOverrides.get(key);
  if (manual?.startsWith(CALIBRATION_SUBJECT_EXTRA_PREFIX)) {
    const selectedKey = manual.slice(CALIBRATION_SUBJECT_EXTRA_PREFIX.length);
    if (extraImages.some((file) => calibrationExtraFileKey(file) === selectedKey)) return manual;
  }
  return CALIBRATION_SUBJECT_BASE_SELECTION;
}

function calibrationSubjectPlanChoiceNames(plan) {
  const baseName = String(plan?.sourceSubjectName || plan?.originalName || plan?.name || "").trim();
  return [
    ...(baseName ? [baseName] : []),
    ...calibrationExtraImagesForSubject(baseName).map(calibrationExtraDisplayName),
  ];
}

function setCalibrationSubjectPlanSelection(plan, value) {
  const key = calibrationSubjectPlanKey(plan);
  const nextValue = String(value || "");
  const baseName = String(plan?.sourceSubjectName || plan?.originalName || plan?.name || "").trim();
  const isValidExtra = nextValue.startsWith(CALIBRATION_SUBJECT_EXTRA_PREFIX) &&
    calibrationExtraImagesForSubject(baseName).some((file) =>
      calibrationExtraFileKey(file) === nextValue.slice(CALIBRATION_SUBJECT_EXTRA_PREFIX.length));
  if (isValidExtra) calibrationSubjectManualOverrides.set(key, nextValue);
  else calibrationSubjectManualOverrides.delete(key);
}

function applyCalibrationSubjectSelectionToAll(subjectPlans, sourcePlan, value) {
  const sourceName = String(sourcePlan?.sourceSubjectName || sourcePlan?.originalName || sourcePlan?.name || "").trim();
  const sourceNameKey = calibrationSubjectNameKey(sourceName);
  const targetValue = String(value || CALIBRATION_SUBJECT_BASE_SELECTION);
  let appliedCount = 0;
  let fallbackCount = 0;
  for (const item of subjectPlans || []) {
    const plan = resolveCalibrationSubjectPlan(item);
    const baseName = String(plan?.sourceSubjectName || plan?.originalName || plan?.name || "").trim();
    if (calibrationSubjectNameKey(baseName) !== sourceNameKey) continue;
    appliedCount += 1;
    setCalibrationSubjectPlanSelection(plan, targetValue);
    if (targetValue.startsWith(CALIBRATION_SUBJECT_EXTRA_PREFIX) &&
        calibrationSubjectPlanSelectionValue(plan) !== targetValue) {
      fallbackCount += 1;
    }
  }
  return { appliedCount, fallbackCount };
}

function calibrationSelectedExtraImage(plan) {
  const value = calibrationSubjectPlanSelectionValue(plan);
  if (!value.startsWith(CALIBRATION_SUBJECT_EXTRA_PREFIX)) return null;
  const selectedKey = value.slice(CALIBRATION_SUBJECT_EXTRA_PREFIX.length);
  const baseName = String(plan?.sourceSubjectName || plan?.originalName || plan?.name || "").trim();
  return calibrationExtraImagesForSubject(baseName)
    .find((file) => calibrationExtraFileKey(file) === selectedKey) || null;
}

function calibrationSubjectImagePlan(plan, file) {
  const baseName = String(plan?.sourceSubjectName || plan?.originalName || plan?.name || "").trim();
  return {
    ...plan,
    kind: "image",
    name: self.JimengLockAnalyzer.stemOf(calibrationExtraDisplayName(file)),
    sourceSubjectName: baseName,
    originalName: baseName,
    anchor: plan?.anchor || baseName,
    extraFileKey: calibrationExtraFileKey(file),
  };
}

function renderCalibrationAssetAudit(result) {
  calibrationUi.calibration_asset_summary.replaceChildren();
  let chunks = [];
  try {
    chunks = splitCalibrationPrompt(result.prompt);
  } catch (_) {
    chunks = [{ videoNumbers: result.videos.map((video) => String(video.videoNumber)) }];
  }
  const overall = document.createElement("div");
  overall.className = "asset-overall";
  overall.textContent = `共 ${chunks.length} 个实际发送批次 · ${result.videos.length} 个视频 · ${result.subjectPlans.length + result.subjectImagePlans.length}/${result.allSubjectPlans.length} 处人物 @ 已勾选 · ${result.matches.length}/${result.scenePlans.length} 处场景图已命中`;
  calibrationUi.calibration_asset_summary.append(overall);

  for (const [batchIndex, chunk] of chunks.entries()) {
    const numbers = new Set((chunk.videoNumbers || []).map(String));
    const group = document.createElement("div");
    group.className = "asset-group";
    const title = document.createElement("div");
    title.className = "asset-group-title";
    title.textContent = `发送批次 ${batchIndex + 1}/${chunks.length}｜${numbers.size} 个视频｜最少等待 ${numbers.size} 分钟后再核验任务卡`;
    group.append(title);

    for (const video of result.videos.filter((item) => numbers.has(String(item.videoNumber)))) {
      const row = document.createElement("div");
      row.className = "asset-job";
      const videoScenePlans = video.scenePlans?.length ? video.scenePlans : [video.scenePlan].filter(Boolean);
      const videoSubjectPlans = (result.allSubjectPlans || [])
        .filter((plan) => String(plan.videoNumber) === String(video.videoNumber))
        .map(resolveCalibrationSubjectPlan);
      const sceneEntries = videoScenePlans.map((scenePlan) => {
        const match = result.matches.find((item) => item.sceneKey === scenePlan.sceneKey);
        const choice = result.sceneChoices.find((item) => item.sceneKey === scenePlan.sceneKey);
        const candidateCount = choice?.candidates?.length || 0;
        return {
          scenePlan,
          match,
          candidateCount,
          state: match ? "matched" : candidateCount > 1 ? "ambiguous" : "missing",
        };
      });
      if (!sceneEntries.length) sceneEntries.push({
        scenePlan: null, match: null, candidateCount: 0, state: "unrecognized",
      });
      const matchedSceneCount = sceneEntries.filter((item) => item.state === "matched").length;
      const sceneState = sceneEntries.some((item) => item.state === "unrecognized")
        ? "unrecognized"
        : sceneEntries.some((item) => item.state === "ambiguous")
          ? "ambiguous"
          : sceneEntries.some((item) => item.state === "missing")
            ? "missing"
            : "matched";
      row.dataset.sceneState = sceneState;

      const videoHead = document.createElement("div");
      videoHead.className = "asset-video-head";
      const videoNumber = document.createElement("strong");
      videoNumber.className = "asset-video-number";
      videoNumber.textContent = `视频${video.videoNumber}`;
      const sceneStatus = document.createElement("span");
      sceneStatus.className = "asset-scene-status";
      sceneStatus.textContent = sceneState === "unrecognized"
        ? "场景未识别"
        : sceneState === "ambiguous"
          ? `${matchedSceneCount}/${sceneEntries.length} 已命中 · 有场景待选择`
          : sceneState === "missing"
            ? `${matchedSceneCount}/${sceneEntries.length} 已命中 · 场景图片未匹配`
            : `${matchedSceneCount}/${sceneEntries.length} 个场景已命中`;
      videoHead.append(videoNumber, sceneStatus);

      const sceneReview = document.createElement("div");
      sceneReview.className = "asset-scene-review";
      for (const [sceneIndex, entry] of sceneEntries.entries()) {
        const sceneItem = document.createElement("div");
        sceneItem.className = "asset-scene-entry";
        sceneItem.dataset.sceneState = entry.state;
        const sceneText = document.createElement("div");
        sceneText.className = "asset-scene-text";
        const recognizedLabel = document.createElement("span");
        recognizedLabel.className = "asset-scene-label";
        recognizedLabel.textContent = entry.scenePlan?.label
          ? `场景${entry.scenePlan.label}${entry.scenePlan.shotLabel ? ` · ${entry.scenePlan.shotLabel}` : ""}`
          : sceneEntries.length > 1 ? `场景 ${sceneIndex + 1}` : "识别场景";
        const recognizedValue = document.createElement("strong");
        recognizedValue.className = "asset-scene-value";
        recognizedValue.textContent = entry.scenePlan?.sceneName || "未从提示词中识别到场景";
        const matchedLabel = document.createElement("span");
        matchedLabel.className = "asset-scene-label";
        matchedLabel.textContent = entry.match ? "匹配图片" : "图片状态";
        const matchedValue = document.createElement("span");
        matchedValue.className = "asset-scene-file";
        matchedValue.textContent = entry.match
          ? `${entry.match.relativePath || entry.match.fileName}${entry.match.matchedAlias ? `（通过别名“${entry.match.matchedAlias}”命中）` : ""}`
          : entry.state === "ambiguous"
            ? `检测到 ${entry.candidateCount} 张候选，请给目标图片设置自定义名或别名后重新校准；发送时跳过这个场景的图片 @`
            : entry.state === "unrecognized"
              ? "请检查【场景与连续状态】或标题场景字段"
              : "候选库中没有匹配图片；发送时跳过这个场景的图片 @";
        sceneText.append(recognizedLabel, recognizedValue, matchedLabel, matchedValue);
        sceneItem.append(sceneText);
        if (entry.match?.file && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          const preview = document.createElement("img");
          preview.className = "asset-scene-preview";
          preview.alt = `视频${video.videoNumber}匹配场景图`;
          const previewUrl = URL.createObjectURL(entry.match.file);
          preview.src = previewUrl;
          preview.addEventListener("load", () => URL.revokeObjectURL(previewUrl), { once: true });
          preview.addEventListener("error", () => URL.revokeObjectURL(previewUrl), { once: true });
          sceneItem.prepend(preview);
        }
        sceneReview.append(sceneItem);
      }
      row.append(videoHead, sceneReview);

      const subjects = document.createElement("div");
      subjects.className = "asset-list";
      const subjectTitle = document.createElement("span");
      subjectTitle.className = "asset-list-title";
      subjectTitle.textContent = "人物（默认主体库；可逐个视频切换为额外图片）";
      subjects.append(subjectTitle);
      if (videoSubjectPlans.length) {
        const scanButton = document.createElement("button");
        scanButton.type = "button";
        scanButton.className = "subject-video-scan";
        scanButton.textContent = "检测本视频主体库";
        scanButton.disabled = Boolean(calibrationBatchId);
        scanButton.addEventListener("click", () => scanCalibrationSubjects(videoSubjectPlans, `视频${video.videoNumber}`));
        subjects.append(scanButton);
      }
      if (!videoSubjectPlans.length) {
        const none = document.createElement("span");
        none.textContent = "无";
        subjects.append(none);
      }
      for (const plan of videoSubjectPlans) {
        const baseName = String(plan.sourceSubjectName || plan.originalName || plan.name || "").trim();
        const resolvedName = baseName;
        const key = calibrationSubjectPlanKey(plan);
        const availability = calibrationSubjectAvailabilityState(baseName);
        const extraRoleFiles = calibrationExtraImagesForSubject(baseName);
        const selectionValue = calibrationSubjectPlanSelectionValue(plan);
        const selectedExtra = calibrationSelectedExtraImage(plan);
        const effectiveState = selectedExtra ? "image" : availability;
        const card = document.createElement("div");
        card.className = "asset-check asset-subject-entry";
        card.dataset.subjectState = effectiveState;
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = effectiveState !== "missing" && !calibrationDisabledSubjects.has(key);
        checkbox.disabled = effectiveState === "missing";
        if (selectedExtra) {
          card.title = "本视频手动选择额外人物图片；发送时会在角色位置 @ 这张图片。";
        } else if (availability === "missing") {
          card.title = "主体库未找到精确同名主体；请绑定并选择一张额外人物图片。";
        } else if (availability === "available") {
          card.title = "主体库存在精确同名主体，勾选后发送时会自动 @。";
        } else if (availability === "unknown") {
          card.title = "主体库检测未确认，发送阶段仍会按实时结果处理。";
        }
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) calibrationDisabledSubjects.delete(key);
          else calibrationDisabledSubjects.add(key);
          calibrateDraft(false);
        });
        const body = document.createElement("div");
        body.className = "asset-subject-body";
        const head = document.createElement("div");
        head.className = "asset-subject-head";
        const nameLine = document.createElement("div");
        nameLine.className = "asset-subject-name";
        nameLine.textContent = resolvedName || baseName || "未命名主体";
        const sourceLabel = document.createElement("span");
        sourceLabel.className = "asset-subject-recommended";
        sourceLabel.textContent = selectedExtra
          ? "额外图片"
          : availability === "available" ? "主体库" : availability === "missing" ? "主体库未找到" : "主体库（默认）";
        head.append(nameLine, sourceLabel);

        const meta = document.createElement("div");
        meta.className = "asset-subject-meta";
        meta.textContent = plan.description ? `描述：${plan.description}` : "描述：无";

        const sourceSelect = document.createElement("select");
        sourceSelect.className = "asset-subject-select";
        sourceSelect.disabled = Boolean(calibrationBatchId) || !extraRoleFiles.length;
        sourceSelect.title = extraRoleFiles.length
          ? "选择本视频的这个人物用主体库主体，还是用你额外上传并绑定同名角色的图片"
          : "先在上方“额外附件”里上传图片，并把绑定角色填为该人物名";
        // 第一组：主体库（默认）
        const libraryGroup = document.createElement("optgroup");
        libraryGroup.label = "主体库";
        const baseOption = document.createElement("option");
        baseOption.value = CALIBRATION_SUBJECT_BASE_SELECTION;
        baseOption.textContent = `${baseName}${availability === "missing" ? "（未找到）" : "（默认）"}`;
        libraryGroup.append(baseOption);
        sourceSelect.append(libraryGroup);
        // 第二组：本角色绑定的额外上传图片，逐视频独立选择
        if (extraRoleFiles.length) {
          const extraGroup = document.createElement("optgroup");
          extraGroup.label = "额外上传（我上传的图片）";
          for (const file of extraRoleFiles) {
            const option = document.createElement("option");
            option.value = `${CALIBRATION_SUBJECT_EXTRA_PREFIX}${calibrationExtraFileKey(file)}`;
            option.textContent = calibrationExtraDisplayName(file);
            extraGroup.append(option);
          }
          sourceSelect.append(extraGroup);
        }
        sourceSelect.value = selectionValue;
        sourceSelect.addEventListener("change", () => {
          setCalibrationSubjectPlanSelection(plan, sourceSelect.value);
          calibrationDisabledSubjects.delete(key);
          calibrateDraft(false);
        });

        const sourceActions = document.createElement("div");
        sourceActions.className = "asset-subject-source-actions";
        const applyAllButton = document.createElement("button");
        applyAllButton.type = "button";
        applyAllButton.className = "subject-video-scan";
        applyAllButton.textContent = "应用到该角色全部视频";
        applyAllButton.disabled = Boolean(calibrationBatchId);
        applyAllButton.addEventListener("click", () => {
          const outcome = applyCalibrationSubjectSelectionToAll(result.allSubjectPlans, plan, sourceSelect.value);
          calibrateDraft(false);
          const feedback = `已应用 ${outcome.appliedCount} 处，其中 ${outcome.fallbackCount} 处因额外图不可用回落到主体库`;
          calibrationUi.calibration_status.textContent = feedback;
          calibrationUi.calibration_status.dataset.state = outcome.fallbackCount ? "failed_before_click" : "confirmed";
          appendCalibrationLog(feedback);
        });
        sourceActions.append(sourceSelect, applyAllButton);

        const candidateLabel = document.createElement("div");
        candidateLabel.className = "asset-subject-candidates";
        const candidates = calibrationSubjectAvailability?.availableCandidates?.[calibrationSubjectNameKey(baseName)] || [];
        candidateLabel.textContent = candidates.length
          ? `主体库候选：${candidates.join("、")}`
          : `主体库：${baseName}`;
        const extraLabel = document.createElement("div");
        extraLabel.className = "asset-subject-extra";
        extraLabel.textContent = extraRoleFiles.length
          ? `可切换的额外图片：${extraRoleFiles.map(calibrationExtraDisplayName).join("、")}`
          : `没有绑定「${baseName}」的额外图片：在上方额外附件中上传图片，并把该行“绑定角色”填为 ${baseName}，即可在此二选一`;
        body.append(head, meta, sourceActions, candidateLabel, extraLabel);
        card.append(checkbox, body);
        subjects.append(card);
      }
      row.append(subjects);
      group.append(row);
    }
    calibrationUi.calibration_asset_summary.append(group);
  }
}

function calibrationSceneKey(sceneName) {
  return String(sceneName || "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

async function restoreCalibrationBatchState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "GET_BATCH_STATE" });
    setCalibrationControls(Boolean(state?.active), state?.batchId || null, Boolean(state?.paused));
  } catch (_) {}
}

function duplicateCalibrationNumbers(videos) {
  const seen = new Set();
  const duplicates = new Set();
  for (const video of videos) {
    if (seen.has(video.videoNumber)) duplicates.add(video.videoNumber);
    seen.add(video.videoNumber);
  }
  return [...duplicates];
}

function isCalibrationImage(file) {
  return /\.(?:png|jpe?g|webp|bmp|gif)$/i.test(String(file?.name || ""));
}

function isAllowedCalibrationFile(file) {
  const name = String(file?.name || "");
  return CALIBRATION_ALLOWED_EXTENSIONS.has(name.slice(name.lastIndexOf(".")).toLowerCase());
}

function calibrationFileKey(file) {
  return `${file?.webkitRelativePath || file?.name}:${file?.size || 0}:${file?.lastModified || 0}`;
}

function dedupeCalibrationFiles(files) {
  const seen = new Set();
  return files.filter((file) => {
    if (!file) return false;
    const key = calibrationFileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeCalibrationSceneCandidates(files) {
  const seen = new Set();
  return files.filter((file) => {
    if (!file) return false;
    const key = `${String(file.name || "").toLowerCase()}:${file.size || 0}:${file.lastModified || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function allCalibrationSceneFiles() {
  return dedupeCalibrationSceneCandidates([
    ...calibrationSceneFiles,
    ...calibrationPickedSceneFiles,
  ].map(materializeCalibrationSceneFile));
}

function calibrationStateLabel(state) {
  return ({
    encoding: "读取附件", opening: "打开标签", preparing: "准备页面",
    connecting_executor: "连接新标签", recovering_executor: "恢复新标签",
    executor_ready: "新标签已连接", uploading: "上传附件", locking: "精准插入 @",
    expanding_composer: "展开发送框", locking_retry: "重新触发 @",
    resizing_conversation: "调整对话栏宽度", locking_skipped: "主体不存在，跳过 @",
    waiting_queue_confirmation: "等待视频任务卡", queue_confirmed: "视频任务卡已齐",
    queue_confirmation_failed: "任务卡核验失败",
    stopping_inherited: "清理新标签转圈", stopping_before_send: "点击圆圈暂停",
    retrying_submit: "持续重试送达", clicked: "已点击发送",
    confirmed: "已确认受理", failed_before_click: "发送前失败", paused: "已暂停",
  })[state] || state || "处理中";
}

function saveCalibrationSettings() {
  chrome.storage.local.set({ calibrationPrefix: calibrationUi.calibration_prefix.value });
}

async function restoreCalibrationSettings() {
  try {
    const saved = await chrome.storage.local.get(["calibrationPrefix"]);
    if (saved.calibrationPrefix) calibrationUi.calibration_prefix.value = saved.calibrationPrefix;
  } catch (_) {}
}

async function restoreCalibrationLogs() {
  try {
    const saved = await chrome.storage.local.get(["calibrationRunLogs"]);
    calibrationLogs = Array.isArray(saved.calibrationRunLogs) ? saved.calibrationRunLogs.slice(-CALIBRATION_MAX_LOG_LINES) : [];
  } catch (_) {}
  renderCalibrationLogs();
}

function appendCalibrationLog(message) {
  const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  calibrationLogs.push(`[${stamp}] ${String(message || "")}`);
  calibrationLogs = calibrationLogs.slice(-CALIBRATION_MAX_LOG_LINES);
  renderCalibrationLogs();
  chrome.storage.local.set({ calibrationRunLogs: calibrationLogs }).catch(() => {});
}

function renderCalibrationLogs() {
  calibrationUi.log_output.textContent = calibrationLogs.length ? calibrationLogs.join("\n") : "暂无日志";
  calibrationUi.log_output.scrollTop = calibrationUi.log_output.scrollHeight;
}

async function copyCalibrationLogs() {
  try {
    await navigator.clipboard.writeText(calibrationLogs.join("\n"));
    calibrationUi.calibration_copy_log.textContent = "已复制";
    setTimeout(() => { calibrationUi.calibration_copy_log.textContent = "复制日志"; }, 1200);
  } catch (_) {
    alert("复制日志失败，请展开后手动选择复制。");
  }
}

function clearCalibrationLogs() {
  calibrationLogs = [];
  renderCalibrationLogs();
  chrome.storage.local.set({ calibrationRunLogs: [] }).catch(() => {});
}

try {
  self.JimengCalibrationDebug = {
    buildCalibrationPrefix,
    splitCalibrationPrompt,
    resolveCalibrationSubjectPlan,
    calibrationSubjectCandidateNames,
    calibrationSubjectPlanChoiceNames,
    calibrationSubjectPlanSelectionValue,
    expandCalibrationSubjectScanNames,
    setCalibrationSubjectPlanSelection,
    applyCalibrationSubjectSelectionToAll,
    calibrationSelectedExtraImage,
    calibrationSubjectImagePlan,
    calibrationExtraImagesForSubject,
    calibrationExtraDisplayName,
    calibrationExtraBindingNames,
    calibrationAudioIntroEntriesForVideo,
    decorateCalibrationChunkWithAudioIntros,
    buildCalibrationChunkJob,
    get calibrationExtraFiles() { return calibrationExtraFiles; },
    calibrationExtraAliases,
    calibrationExtraBindings,
    calibrationSubjectManualOverrides,
    calibrationSubjectAutoOverrides,
  };
} catch (_) {}
