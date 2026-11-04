const SELECTORS = {
  composer: "div.tiptap.ProseMirror[contenteditable='true']",
  sendButton: "button[class*='submit-button']",
  mentionItems: "li.lv-select-option[role='option'], [role='option']",
  fileInput: "input[type='file']",
  fileUpload: "[class*='reference-upload-']",
};
const SUBJECT_MENTION_MAX_ATTEMPTS = 3;
const MENTION_MENU_OPEN_TIMEOUT = 3000;
const MENTION_OPTION_SCROLL_MARGIN = 6;
// Keep the executor protocol/build marker in sync with manifest.json.  The
// desktop handshake uses this to reject a canvas tab that still contains a
// pre-reload content script.
const EXECUTOR_VERSION = "0.20.3";
const PROMPT_INTEGRITY_MAX_ATTEMPTS = 20;
const PROMPT_INTEGRITY_RETRY_MS = 3000;
const CREDIT_CONFIRM_INITIAL_DELAY_MS = 60_000;
const CREDIT_CONFIRM_POLL_INTERVAL_MS = 10_000;
// 扣费确认期间积分抽屉一直开着，直接读页面上的数字即可，不必反复开关，
// 所以这一段可以查得更勤。
const CREDIT_WATCH_POLL_INTERVAL_MS = 10_000;
const CREDIT_DRAWER_OPEN_TIMEOUT_MS = 10_000;
// The desktop workbench owns prompt composition.  Legacy side-panel jobs do
// not carry this marker and continue to use the compatibility prefix path.
// Keeping the protocol check local to the executor prevents an old extension
// page from accidentally treating a partial prompt as already composed.
const DESKTOP_BRIDGE_SOURCE = "desktop-workbench";
const DESKTOP_BRIDGE_PROTOCOL_VERSION = 1;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING_EXECUTOR") {
    sendResponse({ ok: true, ready: true, version: EXECUTOR_VERSION });
    return false;
  }
  if (message?.type === "PING_EXECUTOR_V15") {
    sendResponse({ ok: true, ready: true, version: EXECUTOR_VERSION });
    return false;
  }
  if (message?.type === "PING_CANVAS_EXECUTOR_V16") {
    const conversationRoot = getConversationRoot();
    const conversationEditor = conversationRoot ? getComposer("conversation") : null;
    const conversationRect = conversationEditor?.getBoundingClientRect?.();
    const conversationReady = Boolean(conversationRoot && conversationEditor &&
      conversationRoot.contains(conversationEditor) && conversationRect &&
      conversationRect.width >= 220);
    const canvasEditor = getComposer("canvas");
    const canvasRect = canvasEditor?.getBoundingClientRect?.();
    const centralCanvasReady = Boolean(canvasEditor && canvasRect && canvasRect.width >= 220 &&
      canvasRect.left < (window.innerWidth || 0) * 0.55);
    // Desktop jobs default to the right-side Agent conversation.  A usable
    // Agent composer is therefore a valid canvas executor target too.
    const canvasReady = conversationReady || centralCanvasReady;
    sendResponse({
      ok: true,
      ready: canvasReady,
      canvasReady,
      conversationReady,
      centralCanvasReady,
      mode: conversationReady ? "conversation" : (centralCanvasReady ? "canvas" : ""),
      version: EXECUTOR_VERSION,
      url: location.href,
    });
    return false;
  }
  if (message?.type === "GET_VIDEO_QUEUE_SNAPSHOT_V15") {
    sendResponse({ ok: true, ...videoQueueSnapshot() });
    return false;
  }
  if (message?.type === "CHECK_SOURCE_CLEAN" || message?.type === "CHECK_SOURCE_CLEAN_V15") {
    const editor = getComposer(message.mode || "conversation");
    if (!editor) {
      sendResponse({ ok: false, clean: false, error: "当前标签找不到可交互的对话输入框" });
      return false;
    }
    const text = editorUserText(editor);
    const attachments = attachmentCount(editor);
    sendResponse({
      ok: true,
      clean: !text && attachments === 0,
      hasText: Boolean(text),
      attachments,
    });
    return false;
  }
  if (message?.type === "OPEN_CONVERSATION" || message?.type === "OPEN_CONVERSATION_V15") {
    openConversationPanel()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === "SCAN_SUBJECT_LIBRARY_V15") {
    scanSubjectLibrary(message.names || [], message.mode || "conversation")
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type !== "DISPATCH_JOB" && message?.type !== "DISPATCH_JOB_V15") return false;
  executeJob(message.job)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        clicked: Boolean(error?.formalClickAttempted),
        error: String(error?.message || error),
      });
    });
  return true;
});

async function executeJob(job) {
  const mode = job.mode || "conversation";
  // 任务必须在右侧 Agent 对话里执行；中央画布输入框跑同样的流程会失败。
  // getComposer("conversation") 现在只认对话面板内的输入框，拿不到就说明面板
  // 没打开——那就点右上角“对话”把它打开，而不是退而求其次用中央输入框。
  if (mode === "conversation" && !getComposer("conversation")) {
    status(job.id, "preparing", "右侧 Agent 对话未打开，正在打开");
    await openConversationPanel();
  }
  status(job.id, "preparing", mode === "conversation" ? "等待右侧对话输入框" : "等待中央画布输入框");
  let editor = await waitFor(() => getComposer(mode), 60000,
    mode === "conversation" ? "找不到可交互的右侧对话输入框" : "找不到可交互的中央画布输入框");
  await stopInheritedBusyState(editor, job.id);
  if(job.requireAgentMode){
    const result=await chrome.runtime.sendMessage({type:"ENSURE_AGENT_MODE"});
    if(!result?.ok)throw new Error(result?.error||"无法核对官网 Agent 模式；本条未发送");
    editor=await waitFor(()=>getComposer(mode),15000,"切换 Agent 模式后输入区尚未就绪；本条未发送");
    await stopInheritedBusyState(editor,job.id);
  }
  const promptIsFinal = job?.promptIsFinal === true &&
    String(job?.source || "") === DESKTOP_BRIDGE_SOURCE &&
    Number(job?.bridgeProtocolVersion) === DESKTOP_BRIDGE_PROTOCOL_VERSION;
  const fullText = promptIsFinal
    ? String(job.prompt || "")
    : (self.JimengLockAnalyzer?.composePrompt
      ? self.JimengLockAnalyzer.composePrompt(job.prefix || "", job.prompt || "")
      : composePrompt(job.prefix || "", job.prompt || ""));
  if (!fullText.trim()) throw new Error("提示词为空");

  const writeAndVerifyPrompt = async () => {
    replaceEditorText(editor, fullText);
    await sleep(250);
    if (normalize(editor.innerText) !== normalize(fullText)) {
      throw new Error("文字写入校验失败，未点击发送");
    }
  };
  // The desktop workbench owns the final prompt and requires every attachment
  // to finish loading before that prompt is written.
  if (!promptIsFinal) await writeAndVerifyPrompt();

  const attachmentUploadState = createAttachmentUploadState();
  const deferredRoleAudio = (job.files || []).filter((item) =>
    isSerializedAudio(item) && Array.isArray(item.roleBindings) && item.roleBindings.length,
  );
  const audioIntroMode = Boolean(job.audioIntroMode && (job.lockedAudio || []).length);
  const immediateFiles = (job.files || []).filter((item) => !deferredRoleAudio.includes(item));
  if (immediateFiles.length) {
    status(job.id, "uploading", `正在分块读取并准备上传 ${immediateFiles.length} 个文件`);
    const materializedFiles = await materializeJobFiles(immediateFiles, job.id);
    status(job.id, "uploading", `准备按原生多选方式上传 ${materializedFiles.length} 个文件`);
    await uploadFiles(editor, materializedFiles, job.id, attachmentUploadState);
  }

  const uploadedRoleAudio = new Set();
  if ((audioIntroMode || promptIsFinal) && deferredRoleAudio.length) {
    status(job.id, "uploading", `正在先上传 ${deferredRoleAudio.length} 个角色音频，用于每个视频开头的音色 @`);
    const materializedAudio = await materializeJobFiles(deferredRoleAudio, job.id);
    const uploadResult = await uploadFiles(editor, materializedAudio, job.id, attachmentUploadState);
    if (uploadResult.missingFiles.length) {
      throw new Error(`绑定音频上传不完整：${uploadResult.missingFiles.map((item) => item.name).join("、")}`);
    }
    deferredRoleAudio.forEach((item) => uploadedRoleAudio.add(item.transferId || item.name));
  }
  if (promptIsFinal) await writeAndVerifyPrompt();
  const skippedReferences = [];
  const locks = [
    ...(job.lockedAudio || []),
    ...(job.lockedSubjects || []),
    ...(job.lockedImages || []),
  ];
  const uploadRoleAudioFor = async (name, afterMention) => {
    const roleAudio = pendingRoleAudioFor(name, deferredRoleAudio, uploadedRoleAudio);
    if (roleAudio.length) {
    status(job.id, "uploading", `@${name} 完成，继续上传 ${roleAudio.length} 个绑定音频`);
    const materializedAudio = await materializeJobFiles(roleAudio, job.id);
    const uploadResult = await uploadFiles(editor, materializedAudio, job.id, attachmentUploadState);
    if (uploadResult.missingFiles.length) {
      throw new Error(`绑定音频上传不完整：${uploadResult.missingFiles.map((item) => item.name).join("、")}`);
    }
    roleAudio.forEach((item) => uploadedRoleAudio.add(item.transferId || item.name));
    }
    const boundAudio = pendingRoleAudioFor(name, deferredRoleAudio, new Set());
    await insertBoundAudioMentions(editor, boundAudio, name, job.id, afterMention);
  };
  if (locks.length) {
    const audioCount = locks.filter((item) => item.kind === "audio").length;
    const subjectCount = locks.filter((item) => item.kind === "subject").length;
    const imageCount = locks.filter((item) => item.kind === "image").length;
    status(job.id, "locking", `正在插入 ${audioCount ? `${audioCount} 个音频 @、` : ""}${subjectCount} 个主体 @${imageCount ? ` 和 ${imageCount} 张图片 @` : ""}`);
    await writePromptWithInlineMentions(editor, fullText, job.prompt || "", locks, job.id, {
      afterMention: async (placement, inserted) => {
        if (!inserted) skippedReferences.push({kind:placement.kind,name:placement.name});
        if (audioIntroMode) return;
        // Upload once, but insert an audio reference after every successful role reference.
        const roleName = roleNameForMentionPlacement(placement);
        if (inserted && roleName) await uploadRoleAudioFor(roleName, placement);
      },
    });
  }

  const completedSubjects = [...new Set([
    ...(job.characters || []),
    ...(job.lockedSubjects || []).map((item) => item.sourceSubjectName || item.name),
  ].map((name) => String(name || "").trim()).filter(Boolean))];
  for (const name of completedSubjects) {
    // job.characters 是旧版尾部 @ 计划；整稿校准的主体已在
    // writePromptWithInlineMentions 中完成，这里只用它们驱动绑定音频顺序。
    let inserted = true;
    if (!(job.lockedSubjects || []).some((item) =>
      normalize(item.sourceSubjectName || item.name) === normalize(name))) {
      inserted = await insertMention(editor, name, { kind: "subject", jobId: job.id });
    }
    // For legacy/manual jobs the @ happens here rather than in the inline
    // placement writer, so use the same role → audio hook.
    if (!audioIntroMode && inserted && !(job.lockedSubjects || []).some((item) =>
      normalize(item.sourceSubjectName || item.name) === normalize(name))) {
      await uploadRoleAudioFor(name, { kind: "subject", name });
    }
  }
  const unboundAudio = deferredRoleAudio.filter((item) => !uploadedRoleAudio.has(item.transferId || item.name));
  if (unboundAudio.length) {
    status(job.id, "uploading", `继续上传 ${unboundAudio.length} 个未匹配角色的音频`);
    const materializedAudio = await materializeJobFiles(unboundAudio, job.id);
    const uploadResult = await uploadFiles(editor, materializedAudio, job.id, attachmentUploadState);
    if (uploadResult.missingFiles.length) {
      throw new Error(`音频上传不完整：${uploadResult.missingFiles.map((item) => item.name).join("、")}`);
    }
  }

  // Wait only after every role/image/audio operation has completed. Audio
  // chips can appear before the underlying attachment is ready; validating
  // here keeps the job alive and lets the 3-second readiness loop observe the
  // final editor state immediately before submission.
  await waitForPromptIntegrity(editor, fullText, locks, job.id);

  // 复制标签的旧生成状态可能直到附件和 @ 都插完后才同步成白方块。
  // 因此发送前必须再次检查：发现白方块就立即暂停，再等真正的上箭头。
  const queueBaseline = videoQueueSnapshot().cardIds;
  // 读基线会打开积分抽屉；readBackendCreditBalance 只有在确认它收起之后才会
  // 返回，所以走到这一行时发送箭头一定没有被遮挡。
  const creditBaseline = await waitForReadableBackendCreditBalance(job.id);
  await submitUntilAccepted(editor, fullText, job.id);
  const creditConfirmation = await waitForCreditDeduction(creditBaseline, job.id, queueBaseline);
  return { clicked: true, confirmed: true, queueConfirmed: true, creditConfirmation, referenceVerification: { verified:true, imageCount:locks.filter(lock=>lock.kind==='image').length-skippedReferences.filter(item=>item.kind==='image').length, audioCount:locks.filter(lock=>lock.kind==='audio').length-skippedReferences.filter(item=>item.kind==='audio').length, attachmentCount:(job.files||[]).length, skippedReferences } };
}

async function insertBoundAudioMentions(editor, files, roleName, jobId, rolePlacement) {
  let preceding = rolePlacement;
  for (const file of files) {
    const name = String(file.name || "").replace(/\.[^.]+$/, "");
    if (!name) throw new Error("绑定音频名称为空，未点击发送");
    status(jobId, "locking_audio", `正在在 @${roleName} 后插入音频 @${name}`);
    const inserted = await insertMention(editor, name, {
      kind: "audio", required: true, jobId, afterMention: preceding,
    });
    if (!inserted) throw new Error(`音频 @${name} 未生成引用，未点击发送`);
    preceding = { kind: "audio", name };
    status(jobId, "locked_audio", `@${roleName} 后已确认音频 @${name}`);
  }
}

function setCaretAfterMention(editor, mention, trailingText = "") {
  const chips = matchingMentionChips(editor, mention.name, mention.kind);
  const chip = chips[chips.length - 1];
  if (!chip) throw new Error(`无法定位音频前的 @${mention.name}，未点击发送`);
  editor.focus();
  const selection = getSelection();
  const range = document.createRange();
  range.setStartAfter(chip);
  const next = chip.nextSibling;
  if (trailingText && next?.nodeType === 3 && next.nodeValue.startsWith(trailingText)) {
    range.setStart(next, trailingText.length);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function roleNameForMentionPlacement(placement) {
  const roleName = placement?.sourceSubjectName ||
    (placement?.kind === "subject" ? placement?.name : "");
  return String(roleName || "").trim();
}

function pendingRoleAudioFor(name, deferredRoleAudio, uploadedRoleAudio) {
  const normalizedName = normalize(name);
  if (!normalizedName) return [];
  return deferredRoleAudio.filter((item) =>
    !uploadedRoleAudio.has(item.transferId || item.name) &&
    item.roleBindings.some((role) => normalize(role) === normalizedName),
  );
}

// 送达重试：第 1 次就是正常发送，之后每次都先等页面确认，确认不了才再点一次。
// 不做连打——原来一轮是 3 次点击、间隔仅 300 毫秒，万一其实已经发出去、只是
// 输入框清空得慢没读准，多出来的每一次点击都是一次真实扣费。现在每点一次就给
// 页面 SUBMIT_ACK_WAIT_MS 的确认窗口（期间每 250 毫秒查一次，确认了立刻返回），
// 总次数也有上限；到顶带着 formalClickAttempted=true 退出，绝不自动重发。
const SUBMIT_MAX_ATTEMPTS = 3;
const SUBMIT_ACK_WAIT_MS = 3000;
async function submitUntilAccepted(editor, fullText, jobId) {
  let attempt = 0;
  let formalClickAttempted = false;
  while (attempt < SUBMIT_MAX_ATTEMPTS) {
    if (await batchPauseRequested()) {
      throw submitError("已按用户要求停止当前任务的送达重试", formalClickAttempted);
    }
    if (!promptMatches(editor, fullText)) {
      throw submitError("送达重试前提示词正文发生变化，无法保证原文一致", formalClickAttempted);
    }

    let button;
    try {
      button = await waitForFinalSendButton(editor, fullText, jobId, attempt > 0);
    } catch (error) {
      if (await batchPauseRequested()) {
        throw submitError("已按用户要求停止当前任务的送达重试", formalClickAttempted);
      }
      // 连箭头都还没出现，说明这一次根本没点出去，不计入点击次数。
      status(
        jobId,
        "retrying_submit",
        `暂未取得正式发送箭头，继续等待：${String(error?.message || error)}`,
      );
      await sleep(500);
      continue;
    }

    const rect = button.getBoundingClientRect();
    const clickResult = await chrome.runtime.sendMessage({
      type: "TRUSTED_CLICK",
      intent: "submit_until_accepted",
      point: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
    if (!clickResult?.ok) {
      // 点击没有真正派发，同样不计入次数。
      status(jobId, "retrying_submit", "正式发送点击未执行，稍后重试");
      await sleep(500);
      continue;
    }

    attempt += 1;
    formalClickAttempted = true;
    status(jobId, "clicked", `第 ${attempt} 次正式发送已点击，等待页面确认 ${Math.round(SUBMIT_ACK_WAIT_MS / 1000)} 秒`);
    if (await waitForSubmitAck({ editor }, SUBMIT_ACK_WAIT_MS)) {
      status(jobId, "confirmed", `页面已确认受理（正式发送点击 ${attempt} 次）`);
      return;
    }
    if (await batchPauseRequested()) {
      throw submitError("页面未确认受理；已按用户要求停止继续重试", true);
    }
    if (!promptMatches(editor, fullText)) {
      throw submitError("页面未清空且正文发生变化，无法继续发送", true);
    }
    if (attempt < SUBMIT_MAX_ATTEMPTS) {
      status(jobId, "retrying_submit", `等待 ${Math.round(SUBMIT_ACK_WAIT_MS / 1000)} 秒后仍未确认，再点一次正式发送`);
    }
  }
  throw submitError(
    `已正式点击发送 ${attempt} 次（每次间隔 ${Math.round(SUBMIT_ACK_WAIT_MS / 1000)} 秒确认窗口），页面始终未确认受理；` +
    "提交状态未知，为避免重复扣费不再继续点击，请核对即梦扣费记录后再决定是否重发",
    true,
  );
}

async function batchPauseRequested() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "GET_BATCH_STATE" });
    return Boolean(state?.active && state?.paused);
  } catch (_) {
    return false;
  }
}

function submitError(message, formalClickAttempted) {
  const error = new Error(message);
  error.formalClickAttempted = Boolean(formalClickAttempted);
  return error;
}

async function stopInheritedBusyState(editor, jobId) {
  const busyButton = getNearestBusyButton(editor);
  if (!busyButton) return;
  if (editorUserText(editor)) {
    throw new Error("新标签继承了运行状态且输入框并非空白，未自动停止或发送");
  }
  let attempts = 0;
  let currentStop = busyButton;
  while (!getNearestArrowControl(editor)) {
    if (await batchPauseRequested()) throw new Error("已按用户要求停止新标签圆圈重试");
    currentStop = getNearestBusyButton(editor) || currentStop;
    if (!currentStop) {
      await sleep(200);
      continue;
    }
    attempts += 1;
    status(jobId, "stopping_inherited", `新标签继承圆圈，第 ${attempts} 次点击暂停`);
    const rect = currentStop.getBoundingClientRect();
    const result = await chrome.runtime.sendMessage({
      type: "TRUSTED_CLICK",
      intent: "stop_inherited",
      point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    });
    if (!result?.ok) {
      status(jobId, "stopping_inherited", `第 ${attempts} 次暂停未执行，继续点击圆圈`);
    }
    await sleep(800);
    currentStop = getNearestBusyButton(editor);
  }
  status(jobId, "preparing", `新标签圆圈已暂停 ${attempts} 次并恢复箭头，开始填写本条任务`);
}

async function waitForFinalSendButton(editor, fullText, jobId, fastArrow = false) {
  const deadline = Date.now() + 60000;
  let arrowStableSince = 0;
  while (Date.now() < deadline) {
    // 优先于箭头检查白方块，避免把一次真实点击浪费在“暂停旧生成”上。
    const stopButton = getNearestBusyButton(editor);
    if (stopButton) {
      // 用户指定的送达策略：圆圈/白方块仍在就继续暂停，不限制次数；
      // 一旦箭头出现，由 stopBusyBeforeSend 立即返回给正式发送。
      return await stopBusyBeforeSend(editor, stopButton, fullText, jobId);
    }
    const arrow = getNearestSendButton(editor);
    if (arrow) {
      if (fastArrow) return arrow;
      if (!arrowStableSince) arrowStableSince = Date.now();
      // 即梦会先换图标、后更新内部提交状态；等待稳定可避免箭头看似恢复但点击仍只是在暂停。
      if (Date.now() - arrowStableSince >= 1500) return arrow;
    } else {
      arrowStableSince = 0;
    }
    await sleep(200);
  }
  throw new Error("附件/主体已出现，但既没有发送箭头，也没有可暂停的白方块按钮");
}

async function stopBusyBeforeSend(editor, stopButton, fullText, jobId) {
  const before = {
    prompt: promptValidationText(editorPromptText(editor)),
    attachments: attachmentCount(editor),
    subjects: editor.querySelectorAll(".node-subject-mention-tag").length,
    references: editor.querySelectorAll(".node-reference-mention-tag").length,
  };
  if (before.prompt !== promptValidationText(fullText)) {
    throw new Error("检测到白方块等待按钮，但当前提示词校验不一致，未自动暂停或发送");
  }

  let attempts = 0;
  let currentStop = stopButton;
  while (true) {
    if (await batchPauseRequested()) {
      throw new Error("已按用户要求停止圆圈暂停重试");
    }
    const existingArrow = getNearestSendButton(editor);
    if (existingArrow) {
      status(jobId, "preparing", `圆圈已暂停 ${attempts} 次，箭头已恢复，立即正式发送`);
      return existingArrow;
    }
    // 每轮重新获取当前最上层的圆圈按钮，不能复用上一次点击后仍留在 DOM
    // 里的旧节点；旧节点可能仍 isConnected，但已经不可见或不再响应。
    currentStop = getNearestBusyButton(editor) ||
      (attempts === 0 && stopButton?.isConnected ? stopButton : null);
    if (!currentStop) {
      await sleep(200);
      currentStop = getNearestBusyButton(editor);
      continue;
    }

    attempts += 1;
    status(jobId, "stopping_before_send", `第 ${attempts} 次点击圆圈暂停；若仍未变成箭头将继续点击`);
    const rect = currentStop.getBoundingClientRect();
    const result = await chrome.runtime.sendMessage({
      type: "TRUSTED_CLICK",
      intent: "stop_before_send",
      point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    });
    if (!result?.ok) {
      status(jobId, "retrying_submit", `第 ${attempts} 次圆圈暂停点击未执行，将继续重试`);
      await sleep(800);
      currentStop = getNearestBusyButton(editor);
      continue;
    }

    await sleep(800);
    const after = {
      prompt: promptValidationText(editorPromptText(editor)),
      attachments: attachmentCount(editor),
      subjects: editor.querySelectorAll(".node-subject-mention-tag").length,
      references: editor.querySelectorAll(".node-reference-mention-tag").length,
    };
    if (after.prompt !== before.prompt || after.attachments < before.attachments ||
        after.subjects !== before.subjects || after.references !== before.references) {
      throw new Error("反复暂停圆圈后提示词或 @素材发生变化，无法保持原任务内容");
    }
    const arrow = getNearestSendButton(editor);
    if (arrow) {
      status(jobId, "preparing", `第 ${attempts} 次暂停后箭头已恢复，立即正式发送`);
      return arrow;
    }
    status(jobId, "stopping_before_send", `第 ${attempts} 次暂停后仍是圆圈，继续暂停`);
    currentStop = getNearestBusyButton(editor);
  }
}

function getComposer(mode = "conversation") {
  const candidates = [...document.querySelectorAll(SELECTORS.composer)]
    .filter(isInteractable)
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => isRectInsideViewport(rect) && rect.width > 20 && rect.height > 20)
    .sort((a, b) => (b.rect.x + b.rect.y) - (a.rect.x + a.rect.y));
  if (mode === "conversation") {
    const chatRoot = getConversationRoot();
    const dialogue = candidates
      .filter(({ element, rect }) => chatRoot?.contains(element) && rect.width >= 220)
      .sort((a, b) => (b.rect.y + b.rect.x) - (a.rect.y + a.rect.x));
    // 只认右侧 Agent 对话里的输入框。以前这里会在对话面板没打开时回落到
    // candidates[0]，也就是中央画布输入框——整组任务就悄悄跑到了错误的框里，
    // 表现为必定失败。宁可返回 null 让上层去打开对话面板，也不要跑错地方。
    return dialogue[0]?.element || null;
  } else {
    const canvas = candidates
      .filter(({ rect }) => rect.left < window.innerWidth * 0.55 && rect.width >= 220)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    if (canvas[0]?.element) return canvas[0].element;
  }
  return candidates[0]?.element || null;
}

async function openConversationPanel() {
  // “对话”打开后会出现独立的 chat-container；仅凭 ProseMirror
  // 不能判断状态，因为中央画布和隐藏的编辑器也共用同一类名。
  if (getConversationRoot() && getComposer("conversation")) {
    return { opened: false, alreadyOpen: true };
  }
  const button = [...document.querySelectorAll("button,[role='button']")]
    .filter(isInteractable)
    .find((element) => normalize(element.innerText || element.textContent) === "对话");
  if (!button) throw new Error("找不到右上角“对话”按钮，请先打开即梦画布页面");
  const rect = button.getBoundingClientRect();
  const result = await chrome.runtime.sendMessage({
    type: "TRUSTED_CLICK",
    intent: "open_conversation",
    point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
  });
  if (!result?.ok) throw new Error(result?.error || "点击右上角“对话”失败");
  await waitFor(() => getConversationRoot() && getComposer("conversation"), 15000, "右侧对话输入框未出现");
  return { opened: true, alreadyOpen: false };
}

function getConversationRoot() {
  return [...document.querySelectorAll("[class*='chat-container-']")]
    .filter((element) => isInteractable(element))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 260 && rect.height > 240 && isRectInsideViewport(rect))
    .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.element || null;
}

function isRectInsideViewport(rect) {
  return rect.x >= -2 && rect.y >= -2 &&
    rect.right <= window.innerWidth + 2 && rect.bottom <= window.innerHeight + 2;
}

function isRectIntersectingViewport(rect) {
  return rect.right >= -2 && rect.bottom >= -2 &&
    rect.left <= window.innerWidth + 2 && rect.top <= window.innerHeight + 2;
}

function isInteractable(element) {
  if (!element?.isConnected) return false;
  const style = getComputedStyle(element);
  if (
    style.display === "none" || style.visibility !== "visible" ||
    style.pointerEvents === "none" || Number(style.opacity || 1) <= 0
  ) return false;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const parentStyle = getComputedStyle(node);
    if (parentStyle.display === "none" || parentStyle.visibility !== "visible") return false;
  }
  return true;
}

function replaceEditorText(editor, text) {
  editor.focus();
  const selection = getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  if (!document.execCommand("insertText", false, text)) {
    throw new Error("浏览器拒绝整段写入编辑器");
  }
  editor.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: text,
  }));
}

function setCaretAtEnd(editor) {
  editor.focus();
  const selection = getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setCaretAfterOccurrence(editor, rawAnchor, rawOccurrence, trailingText = "") {
  const anchor = String(rawAnchor || "");
  const occurrence = Math.max(1, Number(rawOccurrence) || 1);
  if (!anchor) throw new Error("锁定位置缺少锚点文字");

  const nodes = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.nodeValue || parent?.closest(
        '[contenteditable="false"], .rich-placeholder-widget, .ProseMirror-widget',
      )) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let combined = "";
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const start = combined.length;
    combined += node.nodeValue;
    nodes.push({ node, start, end: combined.length });
  }

  // Match in the space promptValidationText already treats as "the same text".
  // An earlier chip can land inside a later anchor: the scene anchor
  // “主卧·夜·内：床边，张叔教育进行时。” contains 张叔, whose chip leaves “ @”
  // behind, so an exact search never found the line again and @主卧 retried
  // forever. Paragraph breaks are not text nodes either, so a multi-line anchor
  // could never match exactly.
  const haystackChars = [];
  const rawIndexOf = [];
  for (let index = 0; index < combined.length; index += 1) {
    if (MENTION_ANCHOR_IGNORED.test(combined[index])) continue;
    haystackChars.push(combined[index]);
    rawIndexOf.push(index);
  }
  const haystack = haystackChars.join("");
  const needle = anchorMatchText(anchor);
  if (!needle) throw new Error("锁定位置缺少锚点文字");
  let found = -1;
  let cursor = 0;
  for (let index = 0; index < occurrence; index += 1) {
    found = haystack.indexOf(needle, cursor);
    if (found < 0) {
      const error = new Error(`无法在输入框中定位第 ${occurrence} 个“${anchor}”，未点击发送`);
      // Retrying cannot make missing text appear; see insertMention.
      error.anchorMissing = true;
      throw error;
    }
    cursor = found + needle.length;
  }
  let absoluteOffset = rawIndexOf[found + needle.length - 1] + 1;
  if (trailingText && combined.slice(absoluteOffset, absoluteOffset + trailingText.length) === trailingText) {
    absoluteOffset += trailingText.length;
  }
  const target = nodes.find((item) => absoluteOffset >= item.start && absoluteOffset <= item.end);
  if (!target) throw new Error(`无法设置“${anchor}”后的锁定位置，未点击发送`);

  editor.focus();
  const selection = getSelection();
  const range = document.createRange();
  range.setStart(target.node, absoluteOffset - target.start);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTextAtCurrentCaret(editor, text) {
  if (!document.execCommand("insertText", false, text)) {
    throw new Error("浏览器拒绝写入 @ 锁定内容");
  }
  // execCommand 通常会自己触发 input，但即梦多标签并发时偶尔不会更新候选插件；
  // 显式补发一次，让 ProseMirror 的 suggestion 状态稳定刷新。
  editor.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: text,
  }));
}

function insertTextAtEnd(editor, text) {
  if (!text) return;
  setCaretAtEnd(editor);
  insertTextAtCurrentCaret(editor, text);
}

async function writePromptWithInlineMentions(editor, fullText, promptText, locks, jobId, options = {}) {
  const placements = resolveLockPlacements(fullText, promptText, locks);
  if (!placements.length) return;
  let rebuildAttempt = 0;
  while (true) {
    try {
      let cursor = 0;
      for (const [index, placement] of placements.entries()) {
        const segment = fullText.slice(cursor, placement.end);
        if (index === 0) replaceEditorText(editor, segment);
        else insertTextAtEnd(editor, segment);
        await sleep(120);
        // 此时人物名位于输入框末尾，避免“名字 @：后续正文”使即梦偶发不弹候选菜单。
        const inserted = await insertMention(editor, placement.name, {
          kind: placement.kind,
          jobId,
          required: Boolean(placement.required),
          allowMissing: Boolean(placement.allowMissing),
          // Keep the original anchor/occurrence with the placement.  Without
          // these two fields insertMention falls back to the editor end, so every
          // later @ can land after the whole prompt instead of at the calibrated
          // scene/character position.
          anchor: placement.anchor,
          occurrence: placement.occurrence,
        });
        if (typeof options.afterMention === "function") {
          await options.afterMention(placement, inserted);
        }
        cursor = placement.end;
      }
      insertTextAtEnd(editor, fullText.slice(cursor));
      await sleep(120);
      return;
    } catch (error) {
      if (!error?.mentionComposerCorrupted) throw error;
      if (await batchPauseRequested()) {
        throw new Error("已按用户要求停止损坏输入框的重建重试");
      }
      rebuildAttempt += 1;
      status(jobId, "rebuilding_mention_prompt", `即梦在 @ 失败时改写了输入框；第 ${rebuildAttempt} 次从原文重建全部 @，不会发送残缺提示词`);
      clearEditorContent(editor);
      await sleep(500);
    }
  }
}

function promptValidationText(value) {
  // The Agent editor can leave the transient Shift+2 trigger as a literal
  // "@" for a short time after an audio/image chip is mounted. It is not part
  // of the prompt payload, so ignore it only for the readiness comparison.
  // ProseMirror also surrounds inline atom nodes with zero-width caret guards
  // and object-replacement characters. They are editor scaffolding rather than
  // user text and used to make a completed prompt fail forever on newer Jimeng
  // builds.
  return normalize(String(value || "")
    .replace(/[\u200B-\u200D\u2060\uFEFF\uFFFC]/g, "")
    .replace(/@/g, ""));
}

function promptMatches(editor, fullText) {
  return promptValidationText(editorPromptText(editor)) === promptValidationText(fullText);
}

function requiredMentionCounts(locks) {
  const counts = new Map();
  for (const lock of locks || []) {
    if (!lock?.required) continue;
    const kind = ["image", "audio", "subject"].includes(lock.kind)
      ? lock.kind : "subject";
    const key = `${kind}:${normalize(lock.name)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function missingRequiredMentions(editor, locks) {
  // Unit-test and connector adapters may expose only text operations. They
  // cannot observe DOM chips, so leave chip readiness to the native upload
  // confirmation in those environments.
  if (typeof editor?.querySelectorAll !== "function") return [];
  const missing = [];
  for (const [key, expected] of requiredMentionCounts(locks)) {
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const name = key.slice(separator + 1);
    const actual = mentionChipCount(editor, name, kind);
    if (actual < expected) missing.push(`${name}(${kind}) ${actual}/${expected}`);
  }
  return missing;
}

async function waitForPromptIntegrity(editor, fullText, locks, jobId) {
  let attempt = 0;
  let textMismatchAttempts = 0;
  const expected = promptValidationText(fullText);
  while (true) {
    const current = editorPromptText(editor);
    const actual = promptValidationText(current);
    const missing = missingRequiredMentions(editor, locks);
    if (actual === expected && !missing.length) {
      if (attempt) status(jobId, "locking_ready", `提示词与 ${locks.length} 个 @ 素材已稳定`);
      return;
    }
    if (await batchPauseRequested()) {
      throw new Error("已按用户要求停止提示词与音频素材的持续校验");
    }
    attempt += 1;
    textMismatchAttempts = actual === expected ? 0 : textMismatchAttempts + 1;
    if (textMismatchAttempts >= PROMPT_INTEGRITY_MAX_ATTEMPTS) {
      throw submitError(
        `发送前正文连续 ${PROMPT_INTEGRITY_MAX_ATTEMPTS} 次校验不一致（编辑器 ${actual.length} 字 / 原文 ${expected.length} 字）；未点击发送，已安全释放本组`,
        false,
      );
    }
    status(
      jobId,
      "locking_wait",
      `提示词或音频素材仍在加载，第 ${attempt} 次校验未完成；${Math.round(PROMPT_INTEGRITY_RETRY_MS / 1000)} 秒后继续${missing.length ? `（缺少：${missing.join("、")}）` : `（正文 ${actual.length}/${expected.length} 字）`}`,
    );
    await sleep(PROMPT_INTEGRITY_RETRY_MS);
  }
}

function rollbackTrailingMentionText(editor, beforeText) {
  const currentText = editorPromptText(editor);
  if (currentText === beforeText) return;
  if (!currentText.startsWith(beforeText)) {
    throw new Error("图片 @ 失败后的输入框状态无法安全恢复，未点击发送");
  }
  const extra = currentText.slice(beforeText.length);
  setCaretAtEnd(editor);
  for (const _ of [...extra]) {
    if (!document.execCommand("delete", false)) {
      throw new Error("图片 @ 失败后无法清理残留检索文字，未点击发送");
    }
  }
  editor.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "deleteContentBackward",
    data: null,
  }));
  // 即梦的 suggestion 是 decoration，不一定会随普通文本删除立即卸载；
  // 清掉残留节点，避免下一轮重试叠出多个“@律师”。
  clearMentionSuggestionArtifacts(editor);
  if (editorPromptText(editor) !== beforeText) {
    throw new Error("图片 @ 失败后的残留文字校验未通过，未点击发送");
  }
}

function clearMentionSuggestionArtifacts(editor) {
  const suggestions = [...editor.querySelectorAll(
    ".suggestion, [data-decoration-id][data-decoration-content]",
  )].reverse();
  for (const suggestion of suggestions) {
    if (!suggestion.isConnected) continue;
    const selection = getSelection();
    const range = document.createRange();
    range.selectNode(suggestion);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand("delete", false)) range.deleteContents();
  }
  if (suggestions.length) {
    editor.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward",
      data: null,
    }));
  }
}

function clearEditorContent(editor) {
  if (!editor) return;
  editor.focus({ preventScroll: true });
  const selection = getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  if (!document.execCommand("delete", false)) range.deleteContents();
  clearMentionSuggestionArtifacts(editor);
  editor.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "deleteContentBackward",
    data: null,
  }));
}

function resolveLockPlacements(fullText, promptText, locks) {
  const promptStart = promptText && fullText.endsWith(promptText)
    ? fullText.length - promptText.length
    : 0;
  const seen = new Set();
  return locks.map((plan) => {
    const anchor = String(plan.anchor || plan.name || "");
    let end = promptStart + Number(plan.offset);
    if (!Number.isFinite(end) || !anchor || fullText.slice(end - anchor.length, end) !== anchor) {
      end = occurrenceEnd(fullText, anchor, plan.occurrence);
    }
    return { ...plan, anchor, end, occurrence: occurrenceIndexAt(fullText, anchor, end) || plan.occurrence };
  }).filter((plan) => {
    if (!Number.isFinite(plan.end) || plan.end < 0) return false;
    const key = `${plan.kind}:${plan.name}:${plan.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.end - b.end);
}

// insertMention re-finds the anchor inside the live editor by occurrence index,
// so that index has to describe the position we already resolved. A hard-coded
// first occurrence dragged every character @ back into the audio intro, which
// repeats each role name ("这是张叔的音色") before the body starts: the chip was
// then inserted mid-text instead of at the editor end, and the mention plugin
// ate the character right after it — one lost 字 that failed the send check.
function occurrenceIndexAt(text, anchor, end) {
  if (!anchor) return 0;
  const target = Number(end);
  if (!Number.isFinite(target) || text.slice(target - anchor.length, target) !== anchor) return 0;
  // Count in exactly the space setCaretAfterOccurrence searches, or the two
  // would disagree about which occurrence is meant.
  const haystack = anchorMatchText(text.slice(0, target));
  const needle = anchorMatchText(anchor);
  if (!needle || !haystack.endsWith(needle)) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) return 0;
    count += 1;
    if (found + needle.length === haystack.length) return count;
    cursor = found + needle.length;
  }
}

// What the live editor holds that the prompt text does not: whitespace and
// paragraph structure, ProseMirror caret guards, and the " @" a chip leaves
// behind. promptValidationText ignores the same set for the final send check.
const MENTION_ANCHOR_IGNORED = /[\s​-‍⁠﻿￼@]/;

function anchorMatchText(value) {
  return String(value || "").replace(/[\s​-‍⁠﻿￼@]/g, "");
}

function occurrenceEnd(text, anchor, rawOccurrence) {
  if (!anchor) return -1;
  const occurrence = Math.max(1, Number(rawOccurrence) || 1);
  let cursor = 0;
  let found = -1;
  for (let index = 0; index < occurrence; index += 1) {
    found = text.indexOf(anchor, cursor);
    if (found < 0) return -1;
    cursor = found + anchor.length;
  }
  return found + anchor.length;
}

async function insertMention(editor, rawName, placement = {}) {
  const name = String(rawName || "").trim();
  if (!name) return true;
  const kind = ["image", "audio"].includes(placement.kind) ? placement.kind : "subject";
  const kindLabel = kind === "audio" ? "音频" : kind === "image" ? "图片" : "主体";
  const jobId = placement.jobId;
  // 必需校准项在第 3 次失败后仍继续尝试：用户要求送达优先，
  // 直到生成真实芯片或主动暂停。主体库确实没有该项时由
  // insertMentionAttempt 标记 assetUnavailable，走安全跳过分支。
  const initialChipCount = mentionChipCount(editor, name, kind);
  const beforeText = editorPromptText(editor);
  let attempt = 0;
  while (true) {
    if (await batchPauseRequested()) {
      throw new Error(`已按用户要求停止 @${name} 的持续重试`);
    }
    if (mentionChipCount(editor, name, kind) > initialChipCount) return true;
    attempt += 1;
    await ensureComposerExpandedForMention(editor, jobId, name, attempt);
    try {
      await insertMentionAttempt(editor, name, kind, kindLabel, placement, initialChipCount);
      return true;
    } catch (error) {
      if (mentionChipCount(editor, name, kind) > initialChipCount) return true;
      try {
        rollbackTrailingMentionText(editor, beforeText);
      } catch (rollbackError) {
        // ProseMirror 偶尔会在候选菜单失败时截断光标后的正文。此时不能
        // 继续局部删除，否则可能把残稿发出；交给上层从原文重建整套 @。
        rollbackError.mentionComposerCorrupted = true;
        rollbackError.mentionName = name;
        throw rollbackError;
      }
      // 锚点文字根本不在输入框里，重试只会把同一次失败的查找再做一遍——
      // 分镜30 就这样在 @主卧 上空转了 202 次。点发送之前直接释放本组，并说明缺什么。
      if (error?.anchorMissing) {
        throw submitError(`${error.message}；已停止重试 @${name}，本组未发送、未扣费`, false);
      }
      // 只有资产库菜单确实加载、且候选列表/空结果明确证明没有精确同名
      // 主体时才跳过。这个判断与“@不上”不同：即使是整稿校准里的
      // required 主体，只要主体库明确不存在，也应跳过并继续发送；菜单没
      // 弹出、快捷键没触发、页面失焦、候选被裁剪等暂态故障仍继续重试。
      if (error?.assetUnavailable && (kind === "subject" || placement.allowMissing)) {
        status(
          jobId,
          "locking_skipped",
          kind === "subject" ? `主体库中未找到精确同名主体 @${name}，已跳过该 @ 并继续发送` : `未找到${kindLabel} @${name}，按人工审阅结果跳过并继续发送`,
        );
        return false;
      }
      if (kind === "subject" && attempt % SUBJECT_MENTION_MAX_ATTEMPTS === 0) {
        await resizeConversationPanelForMention(editor, name, jobId, attempt);
      }
      status(
        jobId,
        "locking_retry",
        attempt === SUBJECT_MENTION_MAX_ATTEMPTS
          ? `@${name} 第 ${SUBJECT_MENTION_MAX_ATTEMPTS} 次仍未生成${kindLabel}芯片，已超过 ${SUBJECT_MENTION_MAX_ATTEMPTS} 次，继续重试直至成功或主动暂停`
          : `@${name} 第 ${attempt} 次未生成${kindLabel}芯片，已清理残留并继续 @`,
      );
      await sleep(800);
    }
  }
}

async function resizeConversationPanelForMention(editor, name, jobId, attempt) {
  if (typeof document === "undefined" || typeof editor?.getBoundingClientRect !== "function") return false;
  const editorRect = editor.getBoundingClientRect();
  const handles = [...document.querySelectorAll("*")].filter((node) => {
    const rect = node.getBoundingClientRect();
    const cursor = getComputedStyle(node).cursor;
    return /col-resize|ew-resize/.test(cursor) && rect.width > 0 && rect.width <= 24 &&
      rect.height >= Math.min(300, window.innerHeight * 0.45) && rect.right <= editorRect.left + 12;
  });
  const handle = handles.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return Math.abs(editorRect.left - ar.right) - Math.abs(editorRect.left - br.right);
  })[0];
  if (!handle) {
    status(jobId, "resizing_conversation", `@${name} 已连续失败 ${attempt} 次，但未找到对话栏宽度拖拽柄，继续原位重试`);
    return false;
  }
  const rect = handle.getBoundingClientRect();
  const round = Math.max(1, Math.floor(attempt / SUBJECT_MENTION_MAX_ATTEMPTS));
  // 右侧面板的右边缘固定。先向左拖宽，下一轮向右拖窄，让候选卡片
  // 重新排版并离开最右边的不可点击区域。
  const delta = round % 2 === 1 ? -120 : 90;
  const from = {
    x: Math.max(2, Math.min(window.innerWidth - 2, rect.left + rect.width / 2)),
    y: Math.max(80, Math.min(window.innerHeight - 80, rect.top + rect.height * 0.55)),
  };
  const to = {
    x: Math.max(180, Math.min(window.innerWidth - 280, from.x + delta)),
    y: from.y,
  };
  status(jobId, "resizing_conversation", `@${name} 已连续失败 ${attempt} 次，正在${delta < 0 ? "拉宽" : "拉窄"}右侧对话栏后重新 @`);
  const response = await chrome.runtime.sendMessage({
    type: "TRUSTED_DRAG",
    intent: "resize_conversation_for_mention",
    from,
    to,
  });
  if (!response?.ok) {
    status(jobId, "resizing_conversation", `对话栏宽度调整未执行，继续原位重试 @${name}`);
    return false;
  }
  await sleep(500);
  return true;
}

async function scanSubjectLibrary(rawNames, mode = "conversation") {
  const names = [...new Map((rawNames || [])
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .map((name) => [normalize(name), name])).values()];
  if (!names.length) return { available: [], missing: [], unknown: [] };
  const editor = await waitFor(() => getComposer(mode), 15000, "找不到可交互的对话输入框");
  if (editorUserText(editor) || attachmentCount(editor) > 0) {
    throw new Error("检测主体库前，请先清空当前即梦对话输入框里的文字和附件，避免检测残留覆盖你的内容");
  }
  const available = [];
  const missing = [];
  const unknown = [];
  const availableCandidates = {};
  try {
    for (const name of names) {
      const result = await probeSubjectLibrary(editor, name);
      const statusValue = typeof result === "string" ? result : result?.status;
      if (result?.candidates?.length) availableCandidates[name] = result.candidates;
      if (statusValue === "available") {
        available.push(name);
      } else if (statusValue === "missing") missing.push(name);
      else {
        unknown.push(name);
      }
      clearEditorContent(editor);
      await sleep(250);
    }
  } finally {
    clearEditorContent(editor);
  }
  return { available, missing, unknown, availableCandidates };
}

async function probeSubjectLibrary(editor, name) {
  const beforeText = editorPromptText(editor);
  setCaretAtEnd(editor);
  await insertTrustedShiftAtCurrentCaret(editor);
  let menuOpened = await waitForOptional(
    () => visibleMentionOptions().length ? true : null,
    MENTION_MENU_OPEN_TIMEOUT,
  );
  if (!menuOpened) {
    const mentionButton = getNearestMentionToolbarButton(editor);
    if (mentionButton) {
      const rect = mentionButton.getBoundingClientRect();
      const result = await chrome.runtime.sendMessage({
        type: "TRUSTED_CLICK",
        intent: "scan_subject_library_open_mention",
        point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      });
      if (result?.ok) {
        menuOpened = await waitForOptional(
          () => visibleMentionOptions().length ? true : null,
          MENTION_MENU_OPEN_TIMEOUT,
        );
      }
    }
  }
  if (!menuOpened) return { status: "unknown", candidates: [] };

  const exactOption = () => visibleMentionOptions()
    .find((candidate) => mentionOptionMatchesKind(candidate, "subject") &&
      normalize(primaryOptionText(candidate)) === normalize(name)) || null;
  const initialOptionSignature = mentionOptionSignature("subject");
  const initialSubjectOptionCount = visibleMentionOptions()
    .filter((candidate) => mentionOptionMatchesKind(candidate, "subject")).length;
  const initialStableSubjectCatalog = mentionMenuHasStableSubjectCatalog() || initialSubjectOptionCount >= 3;
  const searchBeforeText = editorUserText(editor);
  await insertTrustedTextAtCurrentCaret(editor, name);
  const searchAfterText = editorUserText(editor);
  if (await waitForOptional(exactOption, 3000)) {
    return {
      status: "available",
      candidates: visibleMentionOptions()
        .filter((candidate) => mentionOptionMatchesKind(candidate, "subject"))
        .map(primaryOptionText)
        .filter((value) => normalize(value).includes(normalize(name))),
    };
  }

  const queryMatched = mentionSearchQueryAppears(name, editor, searchBeforeText, searchAfterText);
  const optionsChanged = mentionOptionSignature("subject") !== initialOptionSignature;
  const candidates = subjectCandidateNamesContaining(name);
  return isConfirmedMissingSubject({
    kind: "subject",
    menuLoaded: visibleMentionMenus().length > 0,
    queryMatched,
    noResult: mentionMenuShowsNoResult(),
    optionsChanged,
    loading: mentionMenuIsLoading(),
    stableCatalog: initialStableSubjectCatalog || mentionMenuHasStableSubjectCatalog(),
  }) ? { status: "missing", candidates } : { status: "unknown", candidates };
}

async function insertMentionAttempt(editor, name, kind, kindLabel, placement, beforeCount) {
  // `jobId` is carried on the placement object so all retry/fallback status
  // messages stay associated with the current video.  The previous code used
  // a bare `jobId` here; that variable does not exist in this function and
  // caused a ReferenceError exactly when the @ menu needed its toolbar
  // fallback (the most common recovery path for a collapsed conversation).
  const jobId = placement?.jobId;
  const menuTimeout = kind === "image" ? 10000 : 8000;
  if (placement.afterMention) {
    setCaretAfterMention(editor, placement.afterMention);
  } else if (placement.anchor) {
    setCaretAfterOccurrence(editor, placement.anchor, placement.occurrence);
  } else {
    setCaretAtEnd(editor);
  }
  // 先写入空格，再发送真实 Shift+2。直接通过 Input.insertText 写入“@”
  // 会绕过即梦资产库的键盘监听，导致看得到文字却不弹候选。
  await insertTrustedTextAtCurrentCaret(editor, " ");
  await insertTrustedShiftAtCurrentCaret(editor);
  // 即梦在上传图片仍在建立索引时，可能先接受“@”但很晚才挂载候选菜单。
  // 短等后若仍没有菜单，先尝试页面底部真实的 @ 工具按钮；快捷键在
  // 输入框贴近边缘、失焦或被缩小状态下可能被页面吞掉，但工具按钮仍能打开同一资产库。
  let menuOpened = await waitForOptional(
    () => visibleMentionOptions().length ? true : null,
    MENTION_MENU_OPEN_TIMEOUT,
  );
  if (!menuOpened) {
    const mentionButton = getNearestMentionToolbarButton(editor);
    if (mentionButton) {
      status(jobId, "mention_toolbar_fallback", `快捷键未唤出资产库，改用底部 @ 工具按钮重试 @${name}`);
      const rect = mentionButton.getBoundingClientRect();
      const result = await chrome.runtime.sendMessage({
        type: "TRUSTED_CLICK",
        intent: "open_mention_toolbar",
        point: {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
      });
      if (result?.ok) {
        menuOpened = await waitForOptional(
          () => visibleMentionOptions().length ? true : null,
          MENTION_MENU_OPEN_TIMEOUT,
        );
      }
    }
  }
  if (!menuOpened) {
    throw new Error(`@${name} 未唤出资产库菜单，立即清理并重新 @`);
  }
  // Snapshot candidates before the search text is entered. A generic candidate
  // list alone is not evidence that the requested subject is absent.
  const initialOptionSignature = mentionOptionSignature(kind);
  const initialSubjectOptionCount = kind === "subject"
    ? visibleMentionOptions().filter((candidate) =>
      mentionOptionMatchesKind(candidate, "subject")).length
    : 0;
  const initialStableSubjectCatalog = kind === "subject" &&
    (mentionMenuHasStableSubjectCatalog() || initialSubjectOptionCount >= 3);
  const exactOption = () => visibleMentionOptions()
    .find((candidate) => mentionOptionMatchesKind(candidate, kind) &&
      normalize(primaryOptionText(candidate)) === normalize(name)) || null;
  let item = exactOption();
  if (!item) {
    // 菜单展开可能让浏览器选区丢失。重新把光标放回刚插入的“ @”之后，再输入筛选名。
    if (placement.afterMention) {
      setCaretAfterMention(editor, placement.afterMention, " @");
    } else if (placement.anchor) {
      setCaretAfterOccurrence(editor, placement.anchor, placement.occurrence, " @");
    } else {
      setCaretAtEnd(editor);
    }
    const searchBeforeText = editorUserText(editor);
    await insertTrustedTextAtCurrentCaret(editor, name);
    const searchAfterText = editorUserText(editor);
    try {
      item = await waitFor(exactOption, menuTimeout, `@${name} 没有出现精确匹配的可选${kindLabel}`);
    } catch (error) {
      // 菜单已经打开但列表中始终没有同名候选，和“快捷键没有触发菜单”
      // 是两种不同故障；前者通常表示主体库没有这个资产，可以跳过。
      const menuLoaded = visibleMentionMenus().length > 0;
      const queryMatched = mentionSearchQueryAppears(
        name,
        editor,
        searchBeforeText,
        searchAfterText,
      );
      const optionsChanged = mentionOptionSignature(kind) !== initialOptionSignature;
      // 只依据输入名称后的当前结果判定“主体库不存在”。Shift+2 刚弹出的
      // 通用候选可能与当前名称无关，不能拿它作为跳过依据。
      if (isConfirmedMissingSubject({
        kind,
        menuLoaded,
        queryMatched,
        noResult: mentionMenuShowsNoResult(),
        optionsChanged,
        loading: mentionMenuIsLoading(),
        stableCatalog: initialStableSubjectCatalog || mentionMenuHasStableSubjectCatalog(),
      }) || (placement.allowMissing && menuLoaded && queryMatched && mentionMenuShowsNoResult() && !mentionMenuIsLoading())) {
        error.assetUnavailable = true;
      }
      throw error;
    }
  }
  await clickMentionOption(item, name, kindLabel);
  await waitFor(
    () => mentionChipCount(editor, name, kind) > beforeCount ? true : null,
    5000,
    `@${name} 候选已点击，但没有生成${kindLabel}芯片`,
  );
}

async function ensureComposerExpandedForMention(editor, jobId, name, attempt) {
  const collapsedShell = collapsedComposerShell(editor);
  // 第一次且输入框已经展开时不额外点击；失败后的每次重试都真实点击一次，
  // 让即梦从缩小/失焦状态恢复后再重新触发 @ 菜单。
  if (!collapsedShell && attempt === 1) return;
  const target = collapsedShell || editor;
  const rect = target.getBoundingClientRect();
  const x = Math.max(2, Math.min(window.innerWidth - 2, rect.left + rect.width / 2));
  const y = Math.max(2, Math.min(window.innerHeight - 2, rect.top + rect.height / 2));
  status(
    jobId,
    "expanding_composer",
    collapsedShell
      ? `检测到发送框缩小，正在点击展开后继续 @${name}`
      : `重新点击发送框恢复焦点后继续 @${name}`,
  );
  const result = await chrome.runtime.sendMessage({
    type: "TRUSTED_CLICK",
    intent: "expand_composer",
    point: { x, y },
  });
  if (!result?.ok) {
    status(jobId, "locking_retry", `发送框展开点击未执行，仍会继续重试 @${name}`);
  }
  await sleep(350);
}

function collapsedComposerShell(editor) {
  if (editorUserText(editor).length < 120) return null;
  let node = editor;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 260 && rect.height > 20 && rect.height < 140) return node;
  }
  return null;
}

async function clickMentionOption(item, name, kindLabel) {
  await bringMentionOptionIntoView(item, name, kindLabel);
  const rect = item.getBoundingClientRect();
  if (!isRectInsideViewport(rect) || !isRectVisibleThroughAncestors(item, rect) ||
      !isElementTopmost(item, rect)) {
    throw new Error(`@${name} 的${kindLabel}候选仍被菜单边界裁剪，等待下一次 @ 重试`);
  }
  const result = await chrome.runtime.sendMessage({
    type: "TRUSTED_CLICK",
    intent: "select_mention",
    point: {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    },
    // 坐标是在这里算的，真正按下要等消息到达 service worker 并 attach 调试器
    // 之后。菜单浮在对话图片和附件缩略图条上方，这段窗口里它一旦关闭，同一个
    // 坐标下面就换成了别的元素，点下去会弹出放大图并卡住整组。把期望目标一起
    // 带过去，按下之前在已连接的会话里再复核一次。
    expect: { text: primaryOptionText(item) || name },
  });
  if (result?.stale) {
    // 没有点下去，安全重试即可。
    throw new Error(result.error || `@${name} 的${kindLabel}候选已经移位，等待下一次 @ 重试`);
  }
  if (!result?.ok) {
    throw new Error(result?.error || `未能真实点击 @${name} 的${kindLabel}候选`);
  }
}

async function bringMentionOptionIntoView(item, name, kindLabel) {
  if (!item?.isConnected) throw new Error(`@${name} 的${kindLabel}候选已失效，等待下一次 @ 重试`);
  // 先使用浏览器原生滚动，处理即梦的 portal + 内部滚动列表结构。
  try {
    item.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch (_) {}
  await sleep(60);

  // 某些版本的 popup 外层 overflow:hidden 会让 scrollIntoView 只滚动 body；
  // 再沿祖先逐层校正 scrollTop，确保候选落在真正可点击的 popup 内部。
  for (let node = item.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const scrollable = /(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowY}`) &&
      node.scrollHeight > node.clientHeight + 1;
    if (!scrollable) continue;
    const containerRect = node.getBoundingClientRect();
    const optionRect = item.getBoundingClientRect();
    if (optionRect.bottom > containerRect.bottom - MENTION_OPTION_SCROLL_MARGIN) {
      node.scrollTop += optionRect.bottom - containerRect.bottom + MENTION_OPTION_SCROLL_MARGIN;
    } else if (optionRect.top < containerRect.top + MENTION_OPTION_SCROLL_MARGIN) {
      node.scrollTop -= containerRect.top - optionRect.top + MENTION_OPTION_SCROLL_MARGIN;
    }
  }
  await sleep(60);
}

function isRectVisibleThroughAncestors(element, rect = element.getBoundingClientRect()) {
  if (!isRectInsideViewport(rect)) return false;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (!/(hidden|clip)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`)) continue;
    const parentRect = node.getBoundingClientRect();
    // 点击使用候选中心点；必须保证中心点在每一层裁剪容器内，
    // 不能只判断候选矩形“擦到”容器边缘（那会把视口外坐标误判为可点）。
    if (centerX < parentRect.left || centerX > parentRect.right ||
        centerY < parentRect.top || centerY > parentRect.bottom) return false;
  }
  return true;
}

function getNearestMentionToolbarButton(editor) {
  if (typeof document === "undefined") return null;
  const root = typeof editor?.closest === "function" ? composerRoot(editor) : document;
  const editorRect = editor.getBoundingClientRect();
  return [...root.querySelectorAll("button,[role='button']")]
    .filter((button) => isMentionToolbarButton(button))
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return isInteractable(button) && isRectInsideViewport(rect) &&
        rect.width > 18 && rect.height > 18 && isElementTopmost(button, rect);
    })
    .map((button) => {
      const rect = button.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - (editorRect.left + editorRect.width);
      const dy = rect.top + rect.height / 2 - (editorRect.top + editorRect.height);
      return { button, distance: dx * dx + dy * dy };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.button || null;
}

function isMentionToolbarButton(button) {
  const label = `${button.getAttribute("aria-label") || ""} ${button.title || ""} ${button.className || ""}`;
  if (/[＠@]素材|mention/i.test(label)) return true;
  return [...button.querySelectorAll("svg path")].some((path) =>
    String(path.getAttribute("d") || "").replace(/\s+/g, " ").startsWith("M12.81 2.1"),
  );
}

function isElementTopmost(element, rect = element.getBoundingClientRect()) {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const top = document.elementFromPoint(x, y);
  return top === element || element.contains(top);
}

function hasAudioMentionMarker(element) {
  // Observed in Jimeng audio candidates and audio reference chips; subjects may
  // have voice descriptions, so text containing “音色” is not audio evidence.
  return Boolean(element.querySelector('[class*="audio-thumbnail-"], svg path[d^="M16.667 5.731"]'));
}

function mentionOptionMatchesKind(candidate, kind) {
  const audioMarker = hasAudioMentionMarker(candidate);
  if (kind === "audio") return audioMarker;
  if (audioMarker) return false;
  const classText = String(candidate.className || "").toLowerCase();
  const ariaText = String(candidate.getAttribute("aria-label") || "").toLowerCase();
  const dataText = [...candidate.attributes].map((item) => `${item.name}:${item.value}`).join(" ").toLowerCase();
  const imageMarker = candidate.querySelector('img[src^="blob:"], [class*="reference"], [class*="image"]');
  const subjectMarker = candidate.querySelector('[class*="option-name-"], [class*="subject"], [class*="avatar"]');
  if (kind === "image") return Boolean(imageMarker) && !/主体|角色|subject/.test(`${classText} ${ariaText} ${dataText}`);
  // 主体候选通常带头像，不能再用“存在 blob 图片”排除；只排除明确的图片/场景类型。
  return Boolean(subjectMarker || !imageMarker) && !/图片|场景|image|reference/.test(`${classText} ${ariaText} ${dataText}`);
}

function primaryOptionText(candidate) {
  // 某些主体候选第二行带有音色说明；主体名始终位于第一行。
  return String(candidate?.innerText || candidate?.textContent || "").split(/\r?\n/, 1)[0];
}

function subjectCandidateNamesContaining(name) {
  const needle = normalize(name);
  if (!needle) return [];
  return [...new Set(visibleMentionOptions()
    .filter((candidate) => mentionOptionMatchesKind(candidate, "subject"))
    .map(primaryOptionText)
    .map((value) => String(value || "").trim())
    .filter((value) => normalize(value).includes(needle)))];
}

function visibleMentionOptions() {
  return [...document.querySelectorAll(SELECTORS.mentionItems)]
    .filter((candidate) => {
      const rect = candidate.getBoundingClientRect();
      // 下拉菜单内部可滚动；候选即使部分位于视口外，也已经加载且可以被精确筛选/点击。
      return isInteractable(candidate) && rect.width > 10 && rect.height > 10;
  });
}

function visibleMentionMenus() {
  if (typeof document === "undefined") return [];
  const menus = new Set([...document.querySelectorAll(
    "[role='listbox'], [class*='select-dropdown'], [class*='mention-menu'], [class*='mention-list'], [class*='lv-select-dropdown'], [class*='lv-select-menu'], [class*='lv-select-popup'], [class*='dropdown'], [class*='popover'], [class*='popup'], [class*='menu']",
  )]);
  // Some即梦版本没有稳定的菜单 class/role，但候选项仍挂在一个可见的
  // portal 容器里。向上取候选项的最近列表/弹层祖先，避免把“菜单没有
  // 弹出”误判成“主体库不存在”。
  for (const option of visibleMentionOptions()) {
    const menu = option.closest?.("[role='listbox'], [class*='dropdown'], [class*='popover'], [class*='popup'], [class*='select']") || option.parentElement;
    if (menu) menus.add(menu);
  }
  return [...menus].filter((menu) => {
    const rect = menu.getBoundingClientRect();
    return isInteractable(menu) && rect.width > 20 && rect.height > 20 &&
      isRectIntersectingViewport(rect);
  });
}

function mentionOptionSignature(kind) {
  return visibleMentionOptions()
    .filter((candidate) => mentionOptionMatchesKind(candidate, kind))
    .map((candidate) => normalize(primaryOptionText(candidate)))
    .filter(Boolean)
    .sort()
    .join("|");
}

function isConfirmedMissingSubject({
  kind,
  menuLoaded,
  queryMatched,
  noResult,
  optionsChanged,
  loading,
  stableCatalog = false,
}) {
  const catalogLoaded = menuLoaded || stableCatalog;
  return kind === "subject" && catalogLoaded && queryMatched && !loading &&
    // 即梦有一个特殊状态：搜索词会落在 suggestion 节点前面的普通文本中，
    // 菜单仍保留完整主体库列表，而不是显示“无结果”。只要菜单已经稳定、
    // 且当前精确候选不存在，这也是“主体库没有此人”的明确证据。
    (noResult || optionsChanged || stableCatalog);
}

function mentionSearchQueryAppears(name, editor, beforeText = "", afterText = "") {
  const needle = normalize(name);
  if (!needle) return false;
  if (afterText && normalize(afterText) !== normalize(beforeText) &&
      (normalize(afterText).includes(`@${needle}`) ||
       normalize(afterText).includes(`${needle}@`))) return true;
  // Tiptap suggestion 的未命中状态会渲染为：普通文本“律师” +
  // <span class="suggestion is-empty">@</span>。此时 editorUserText() 得到
  // “律师@”，而不是“@律师”；同时检查 suggestion 前面的文本节点。
  const suggestionNodes = [...document.querySelectorAll(
    ".suggestion, [data-decoration-id][data-decoration-content]",
  )];
  if (suggestionNodes.some((suggestion) => {
    const empty = suggestion.classList?.contains("is-empty") ||
      suggestion.getAttribute("data-decoration-content") === "";
    if (!empty) return false;
    let previous = suggestion.previousSibling;
    while (previous && previous.nodeType !== Node.TEXT_NODE) previous = previous.previousSibling;
    const precedingText = previous?.textContent || "";
    return normalize(precedingText).endsWith(needle);
  })) return true;
  const controls = [
    document.activeElement,
    ...document.querySelectorAll("input:not([type='file']), textarea, [contenteditable='true']"),
  ].filter((control) => control && control !== editor);
  if (controls.some((control) => {
    const value = control?.value ?? control?.textContent ?? "";
    return normalize(value).includes(needle);
  })) return true;
  const currentText = normalize(editorUserText(editor));
  return currentText !== normalize(beforeText) && currentText.includes(`@${needle}`);
}

function mentionMenuHasStableSubjectCatalog() {
  return visibleMentionMenus().some((menu) => {
    const options = [...menu.querySelectorAll(SELECTORS.mentionItems)]
      .filter((candidate) => isInteractable(candidate) &&
        // 真实主体项有 option-name/subject/avatar 标记；场景图片项只有封面，
        // 不把后者误当成“主体库已完整加载”。
        candidate.querySelector('[class*="option-name-"], [class*="subject"], [class*="avatar"]'));
    if (!options.length) return false;
    const rect = menu.getBoundingClientRect();
    const role = menu.getAttribute("role");
    const scrollable = Number(menu.scrollHeight || 0) > Number(menu.clientHeight || 0) + 8;
    // role=listbox + 多个主体候选，或可滚动的候选目录，表示资产库已经稳定挂载；
    // 单个短暂候选不作为“主体不存在”的依据。
    return (role === "listbox" && options.length >= 3) ||
      (scrollable && options.length >= 2 && rect.width > 20 && rect.height > 20);
  });
}

function mentionMenuShowsNoResult() {
  const text = visibleMentionMenus()
    .map((item) => String(item.innerText || item.textContent || ""))
    .join(" ");
  return /无结果|暂无|暂无数据|未找到|没有找到|没有(?:相关|匹配)|无匹配|搜索无结果/.test(text);
}

function mentionMenuIsLoading() {
  return visibleMentionMenus().some((menu) => {
    const attrs = [...menu.attributes]
      .map((item) => `${item.name}:${item.value}`)
      .join(" ")
      .toLowerCase();
    const text = String(menu.innerText || menu.textContent || "");
    return menu.getAttribute("aria-busy") === "true" ||
      /loading|spinner|spin|加载中|搜索中|正在加载/.test(`${attrs} ${text}`);
  });
}

function matchingMentionChips(editor, name, kind) {
  const selector = kind === "subject" ? ".node-subject-mention-tag" : ".node-reference-mention-tag";
  return [...editor.querySelectorAll(selector)].filter((chip) =>
    normalizeMentionLabel(chip.textContent) === normalizeMentionLabel(name) &&
    (kind === "subject" || (kind === "audio" ? hasAudioMentionMarker(chip) : !hasAudioMentionMarker(chip))),
  );
}

function mentionChipCount(editor, name, kind) {
  return matchingMentionChips(editor, name, kind).length;
}

function normalizeMentionLabel(value) {
  return normalize(value).replace(/^@/, "");
}

function isVideoQueueTitle(value) {
  const title = String(value || "").trim();
  // 即梦会把只读的视频卡标题值本身截断成“视...”（并非仅 CSS 省略）。
  // 同时兼容旧版完整标题和单字符省略号，避免把“生成...”图片卡误判为视频。
  return title === "视频" || title === "视..." || title === "视…";
}

function videoQueueSnapshot() {
  const cards = new Map();
  for (const input of document.querySelectorAll("input, textarea")) {
    if (!isVideoQueueTitle(input.value)) continue;
    const card = input.closest('[data-type="E"]');
    if (!card) continue;
    const cardId = String(card.id || "").trim();
    if (!cardId) continue;
    const text = String(card.innerText || card.textContent || "");
    cards.set(cardId, {
      id: cardId,
      failed: /生成失败|任务失败|失败重试/.test(text),
    });
  }
  const allCards = [...cards.values()];
  return {
    cardIds: allCards.map((item) => item.id),
    activeCardIds: allCards.filter((item) => !item.failed).map((item) => item.id),
    failedCardIds: allCards.filter((item) => item.failed).map((item) => item.id),
    total: allCards.length,
    active: allCards.filter((item) => !item.failed).length,
  };
}

function newVideoQueueCardIds(baselineCardIds, snapshot) {
  const baseline = new Set(Array.isArray(baselineCardIds) ? baselineCardIds : []);
  return (Array.isArray(snapshot?.cardIds) ? snapshot.cardIds : [])
    .filter((cardId) => !baseline.has(cardId));
}

function exactCreditNumber(value) {
  const compact = String(value || "").replace(/[\s,，]/g, "");
  return /^\d+$/.test(compact) ? Number(compact) : null;
}

function backendCreditBalanceFromDocument(root = document) {
  if (!root?.querySelectorAll) return null;
  const titles = [...root.querySelectorAll("div,span")].filter((element) =>
    normalize(element.textContent) === "积分详情");
  for (const title of titles) {
    let container = title.parentElement;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      const candidates = [...(container.querySelectorAll?.("[class*='credits-']") || [])];
      for (const element of candidates) {
        const balance = exactCreditNumber(element.textContent);
        if (balance !== null && isInteractable(element)) return { balance, element, title };
      }
    }
  }
  return null;
}

function creditBalanceTrigger() {
  const candidates = [...document.querySelectorAll(
    "[class*='credit-amount-container-'],[class*='credit-amount-text-']",
  )].filter(isInteractable);
  return candidates.find((element) => String(element.className || "").includes("credit-amount-container-")) ||
    candidates[0] || null;
}

function creditDrawerCloseButton() {
  return [...document.querySelectorAll("button[class*='CommerceDrawer_closeButton']")]
    .find(isInteractable) || null;
}

async function trustedClickElement(element, intent) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    throw new Error("积分后台控件当前不可点击");
  }
  const result = await chrome.runtime.sendMessage({
    type: "TRUSTED_CLICK",
    intent,
    point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
  });
  if (!result?.ok) throw new Error(result?.error || "积分后台控件点击失败");
}

function creditDrawerOpen() {
  return Boolean(creditDrawerCloseButton());
}

// 积分抽屉是发送之前为了读扣费基线打开的，它会整块盖在页面上，正好压住右下角
// 的发送箭头。原来这里是尽力而为：找不到关闭按钮就直接 return，点了之后也不
// 检查有没有真的关上——抽屉留在页面上，后面点发送就点不动了，必须人工去点那个
// 叉才能继续。现在改成反复确认，并把结果返回给调用方。
async function closeCreditDrawer({ attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (!creditDrawerOpen()) return true;
    const closeButton = creditDrawerCloseButton();
    if (closeButton) {
      try {
        await trustedClickElement(closeButton, "close_credit_balance");
      } catch (_) {
        // 关闭按钮这一瞬间不可点，下一轮重新取。
      }
    }
    if (await waitForOptional(() => creditDrawerOpen() ? null : true, 3000)) return true;
  }
  return !creditDrawerOpen();
}

// 打开积分抽屉并保持打开。扣费确认期间不再反复开关：开一次，之后每隔几秒直接
// 读页面上的数字，确认扣费后再统一关闭。
async function ensureCreditDrawerOpen(jobId) {
  if (backendCreditBalanceFromDocument()) return true;
  const trigger = creditBalanceTrigger();
  if (!trigger) throw new Error("找不到即梦右上角积分入口");
  status(jobId, "reading_credit_balance", "正在打开即梦积分后台");
  await trustedClickElement(trigger, "open_credit_balance");
  return Boolean(await waitForOptional(
    () => backendCreditBalanceFromDocument(),
    CREDIT_DRAWER_OPEN_TIMEOUT_MS,
  ));
}

async function readBackendCreditBalance(jobId) {
  let details = backendCreditBalanceFromDocument();
  if (!details) {
    const trigger = creditBalanceTrigger();
    if (!trigger) throw new Error("找不到即梦右上角积分入口");
    status(jobId, "reading_credit_balance", "正在打开即梦积分后台读取精确余额");
    await trustedClickElement(trigger, "open_credit_balance");
    details = await waitForOptional(
      () => backendCreditBalanceFromDocument(),
      CREDIT_DRAWER_OPEN_TIMEOUT_MS,
    );
  }
  if (!details) {
    await closeCreditDrawer();
    throw new Error("积分后台已打开，但未读取到精确余额");
  }
  const balance = details.balance;
  // 关不掉就必须报错：抽屉还盖在页面上时点发送，点击会落在抽屉上而不是箭头上。
  if (!await closeCreditDrawer()) {
    throw new Error("积分后台面板未能关闭，它会挡住发送箭头");
  }
  return balance;
}

// 这一步发生在点击发送之前，读不到余额不会造成任何扣费，所以放弃是安全的。
// 以前这里是 while(true) 无限重试：积分抽屉一旦打开又读不出数字，整组就会
// 永远停在那里，页面还被抽屉挡着，只能手动干预。
const CREDIT_BASELINE_MAX_ATTEMPTS = 6;
let creditObservationReporter = async () => {};
async function waitForReadableBackendCreditBalance(jobId) {
  let lastError = null;
  for (let attempt = 1; attempt <= CREDIT_BASELINE_MAX_ATTEMPTS; attempt += 1) {
    if (await batchPauseRequested()) {
      throw submitError("已停止发送前的积分余额读取；尚未点击发送", false);
    }
    try {
      const balance = await readBackendCreditBalance(jobId);
      status(jobId, "credit_baseline_ready", `发送前积分余额 ${balance}，已建立本组扣费基线`);
      return balance;
    } catch (error) {
      lastError = error;
      // 每次重试前都把抽屉收起来，否则它会一直盖在页面上，后面的上传和 @ 也做不了。
      await closeCreditDrawer().catch(() => {});
      if (attempt >= CREDIT_BASELINE_MAX_ATTEMPTS) break;
      status(jobId, "reading_credit_balance", `第 ${attempt} 次未读到积分余额：${String(error?.message || error)}；10 秒后重试`);
      await sleep(CREDIT_CONFIRM_POLL_INTERVAL_MS);
    }
  }
  throw submitError(
    `连续 ${CREDIT_BASELINE_MAX_ATTEMPTS} 次未能读到即梦积分余额（${String(lastError?.message || lastError || "原因未知")}）；` +
    "尚未点击发送，本组没有产生扣费，请确认右上角积分入口可以正常打开后重试",
    false,
  );
}

async function waitForCreditDeduction(
  baselineBalance,
  jobId,
  baselineCardIds = [],
  initialDelayMs = CREDIT_CONFIRM_INITIAL_DELAY_MS,
  pollIntervalMs = CREDIT_WATCH_POLL_INTERVAL_MS,
) {
  status(jobId, "confirming_credit_deduction", "已点击发送；60 秒后检查即梦积分后台");
  await sleep(initialDelayMs);
  let poll = 0;
  // 抽屉开一次就留着，每隔几秒直接读页面上的数字；确认扣费后再关闭，
  // 关闭必须发生在返回之前，否则它会挡住下一组的发送箭头。
  try {
    while (true) {
      if (await batchPauseRequested()) {
        throw submitError("已停止扣费确认；请核对积分后台后再重试，避免重复发送", true);
      }
      poll += 1;
      try {
        if (!await ensureCreditDrawerOpen(jobId)) throw new Error("积分后台未能打开");
        const details = backendCreditBalanceFromDocument();
        const currentBalance = details?.balance;
        if (!Number.isFinite(currentBalance)) throw new Error("积分后台已打开，但未读取到精确余额");
        await creditObservationReporter({
          jobId, poll, baselineBalance, currentBalance,
          confirmed: currentBalance < baselineBalance,
        });
        if (currentBalance < baselineBalance) {
          const consumed = baselineBalance - currentBalance;
          const snapshot = videoQueueSnapshot();
          const addedCardIds = newVideoQueueCardIds(baselineCardIds, snapshot);
          status(jobId, "credit_deduction_confirmed", `积分后台已扣除 ${consumed} 积分（${baselineBalance} → ${currentBalance}），收起面板后进入下一组`);
          return { baselineBalance, currentBalance, consumed, addedCardIds, snapshot };
        }
        status(jobId, "confirming_credit_deduction", `第 ${poll} 次检查：积分余额仍为 ${currentBalance}，面板保持打开，${Math.round(pollIntervalMs / 1000)} 秒后再看`);
      } catch (error) {
        status(jobId, "confirming_credit_deduction", `第 ${poll} 次暂时无法读取积分后台：${String(error?.message || error)}；${Math.round(pollIntervalMs / 1000)} 秒后重试`);
      }
      await sleep(pollIntervalMs);
    }
  } finally {
    await closeCreditDrawer();
  }
}

async function insertTrustedTextAtCurrentCaret(editor, text) {
  // setCaretAtEnd/setCaretAfterOccurrence 已经建立了精确选区。再次无条件 focus
  // 在即梦的 ProseMirror 中偶尔会把光标重置到整段末尾，导致 @ 落错位置。
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  const result = await chrome.runtime.sendMessage({
    type: "TRUSTED_INSERT_TEXT",
    text,
  });
  if (!result?.ok) {
    throw new Error(result?.error || `浏览器未能输入“${text}”`);
  }
  await sleep(100);
}

async function insertTrustedShiftAtCurrentCaret(editor) {
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  const result = await chrome.runtime.sendMessage({ type: "TRUSTED_SHIFT_AT" });
  if (!result?.ok) {
    throw new Error(result?.error || "浏览器未能模拟 Shift+2 触发 @");
  }
  await sleep(150);
}

function createAttachmentUploadState() {
  return {
    phase: null,
    confirmedCounts: null,
    confirmedFileCount: 0,
  };
}

async function uploadFiles(editor, serializedFiles, jobId, sharedState = createAttachmentUploadState()) {
  // 即梦按原生多选接收整个 FileList。分类计数无法证明多文件批次中
  // 具体缺少哪一个文件，因此每批只投递一次，确认不足时明确失败。
  const requestedCounts = attachmentCountsForFiles(serializedFiles);
  transitionAttachmentState(sharedState, jobId, "PREPARE_BASELINE", { requestedCounts });
  let observedBefore = await readAttachmentCountsForUpload(editor, jobId);
  let baselineCounts;
  if (observedBefore) {
    baselineCounts = observedBefore;
    transitionAttachmentState(sharedState, jobId, "BASELINE_OBSERVED", { baselineCounts });
  } else if (sharedState.confirmedCounts) {
    baselineCounts = sharedState.confirmedCounts;
    transitionAttachmentState(sharedState, jobId, "BASELINE_CACHED", { baselineCounts });
  } else if (sharedState.confirmedFileCount > 0) {
    transitionAttachmentState(sharedState, jobId, "BASELINE_UNKNOWN", {});
    throw new Error("已有附件但分类计数基线不可读；为避免重复投递，未上传且未点击发送");
  } else {
    baselineCounts = emptyAttachmentCounts();
    transitionAttachmentState(sharedState, jobId, "BASELINE_EMPTY", { baselineCounts });
  }

  let input = getActiveFileInput(editor);
  let dropTarget = null;
  logFileInputDiagnostic(editor, input, jobId);
  if (!input) {
    // 即梦新版 Agent 输入区使用临时文件选择器：点击“+”后 input 会在
    // React 工具函数里创建并立即销毁，内容脚本无法在点击后稳定取得它。
    // 上传卡本身公开了标准 drop 处理器，因此直接向当前输入框最近的上传卡
    // 投递同一份原生 FileList，走即梦自己的格式校验与 onFilesSelected 回调。
    dropTarget = getActiveFileDropTarget(editor);
    if (!dropTarget) {
      await activateAttachmentUpload(editor, jobId);
      status(jobId, "uploading", "附件正在等待即梦恢复上传位");
      input = await waitFor(
        () => getActiveFileInput(editor),
        15000,
        "等待上传位恢复超时；附件尚未投递",
      );
      logFileInputDiagnostic(editor, input, jobId);
    }
  }

  // 上传位恢复期间分类栏可能已经完成迟到更新；有真实快照时以它作为
  // 本批基线，避免把前一批迟到的附件误算成本批新增。
  observedBefore = await readAttachmentCountsForUpload(editor, jobId);
  if (observedBefore && !sameAttachmentCounts(observedBefore, baselineCounts)) {
    baselineCounts = observedBefore;
    transitionAttachmentState(sharedState, jobId, "BASELINE_OBSERVED", { baselineCounts });
  }
  let currentBaseline = baselineCounts;
  let finalCounts = currentBaseline;
  const batches = uploadBatchPlan(input, serializedFiles);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const batchRequestedCounts = attachmentCountsForFiles(batch);
    // Agent 版上传卡会在一次 drop 中偶发丢掉中间文件。无原生 input 时
    // 每张图/音频单独投递，并在下一张之前重新读取当前附件基线，避免重复。
    if (!input && batchIndex > 0) {
      const refreshed = await readAttachmentCountsForUpload(editor, jobId);
      if (refreshed) currentBaseline = refreshed;
      dropTarget = getActiveFileDropTarget(editor);
      if (!dropTarget) {
        throw new Error("当前输入框的上传入口不明确；附件尚未投递");
      }
    }
    logAttachmentCountDiagnostic(editor, jobId, "before", batchIndex + 1);
    if (input) dispatchFileBatch(input, batch);
    else dispatchFileDrop(dropTarget, batch);
    transitionAttachmentState(sharedState, jobId, "DISPATCHED_PENDING", {
      baselineCounts: currentBaseline,
      requestedCounts: batchRequestedCounts,
      batchIndex: batchIndex + 1,
      batchTotal: batches.length,
    });
    const outcome = await waitForAttachmentBatch(
      editor, currentBaseline, batchRequestedCounts, 30000, jobId, sharedState,
    );
    logAttachmentCountDiagnostic(editor, jobId, "after", batchIndex + 1);
    if (outcome.state === "UNOBSERVABLE_AFTER_UPLOAD") {
      throw new Error("上传后 30 秒内附件分类栏始终不可读，无法确认即梦是否接收附件；为避免重复投递，未补投且未点击发送");
    }
    if (outcome.state === "INCOMPLETE_OBSERVED") {
      throw new Error(`${attachmentIncompleteDetail(currentBaseline, outcome.counts, batchRequestedCounts)}，未补投且未点击发送`);
    }
    currentBaseline = outcome.counts;
    finalCounts = outcome.counts;
    sharedState.confirmedCounts = outcome.counts;
    sharedState.confirmedFileCount += batch.length;
    if (batchIndex + 1 < batches.length) await sleep(700);
  }
  return { acceptedFiles: [...serializedFiles], missingFiles: [], counts: finalCounts };
}

function uploadBatchPlan(input, items) {
  return input ? [items] : items.map((item) => [item]);
}

function attachmentCountsForFiles(files) {
  const counts = emptyAttachmentCounts();
  for (const item of files) {
    counts.all += 1;
    if (isSerializedImage(item)) counts.images += 1;
    else if (isSerializedAudio(item)) counts.audios += 1;
    else if (isSerializedVideo(item)) counts.videos += 1;
    else counts.docs += 1;
  }
  return counts;
}

function isSerializedVideo(item) {
  const type = String(item?.type || "").toLowerCase();
  return type.startsWith("video/") || /\.(?:mp4|mov|m4v|webm|avi|mkv)$/i.test(String(item?.name || ""));
}

function isSerializedImage(item) {
  const type = String(item?.type || "").toLowerCase();
  return type.startsWith("image/") || /\.(?:png|jpe?g|webp|bmp|gif)$/i.test(String(item?.name || ""));
}

function isSerializedAudio(item) {
  const type = String(item?.type || "").toLowerCase();
  return type.startsWith("audio/") || /\.(?:mp3|wav|m4a|ogg|aac|flac)$/i.test(String(item?.name || ""));
}

function buildFileTransfer(items) {
  const transfer = new DataTransfer();
  for (const item of items) {
    const file = item.file || new File([base64ToBytes(item.base64)], item.name, {
      type: item.type || "application/octet-stream",
      lastModified: item.lastModified || Date.now(),
    });
    transfer.items.add(file);
  }
  return transfer;
}

function dispatchFileBatch(input, items) {
  const transfer = buildFileTransfer(items);
  input.value = "";
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchFileDrop(target, items) {
  if (!target) throw new Error("当前输入框没有可用的附件投递位；附件尚未投递");
  const transfer = buildFileTransfer(items);
  target.dispatchEvent(new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    dataTransfer: transfer,
  }));
}

async function materializeJobFiles(items, jobId) {
  const files = [];
  for (let fileIndex = 0; fileIndex < items.length; fileIndex += 1) {
    const item = items[fileIndex];
    if (!item.transferId) {
      files.push(item);
      continue;
    }
    const parts = [];
    for (let chunkIndex = 0; chunkIndex < item.totalChunks; chunkIndex += 1) {
      const response = await chrome.runtime.sendMessage({
        type: "GET_STAGED_FILE_CHUNK",
        transferId: item.transferId,
        chunkIndex,
      });
      if (!response?.ok || typeof response.base64 !== "string") {
        throw new Error(response?.error || `附件“${item.name}”第 ${chunkIndex + 1} 块读取失败`);
      }
      parts.push(base64ToBytes(response.base64));
    }
    files.push({
      ...item,
      file: new File(parts, item.name, {
        type: item.type || "application/octet-stream",
        lastModified: item.lastModified || Date.now(),
      }),
    });
    status(jobId, "uploading", `已分块读取 ${fileIndex + 1}/${items.length} 个附件`);
  }
  return files;
}

async function activateAttachmentUpload(editor, jobId) {
  const ranked = rankFileUploadAnchors(editor);
  // Some Jimeng layouts keep a second composer copy for the history panel.
  // Pick the upload entry nearest to the editor instead of treating that
  // harmless duplicate as an ambiguous target. If there is no editor
  // geometry to disambiguate multiple entries, fail closed before clicking.
  if (!ranked.length) throw new Error("当前输入框的上传入口不明确；附件尚未投递");
  const editorRect = typeof editor?.getBoundingClientRect === "function"
    ? editor.getBoundingClientRect() : null;
  if (ranked.length > 1 && !editorRect) {
    throw new Error("当前输入框的上传入口不明确；附件尚未投递");
  }
  if (ranked.length > 1 && Math.abs(ranked[1].distance - ranked[0].distance) < 1) {
    throw new Error("当前输入框的上传入口不明确；附件尚未投递");
  }
  const { rect } = ranked[0];
  const result = await chrome.runtime.sendMessage({
    type: "TRUSTED_CLICK",
    intent: "open_attachment_upload",
    point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
  });
  if (!result?.ok) throw new Error(result?.error || "无法打开附件上传入口；附件尚未投递");
  uploadDiagnostic(jobId, "upload_entry_activated", {});
}

function getActiveFileDropTarget(editor) {
  const ranked = rankFileUploadAnchors(editor);
  if (!ranked.length) return null;
  if (ranked.length > 1 && Math.abs(ranked[1].distance - ranked[0].distance) < 1) return null;
  return ranked[0].anchor;
}

function rankFileUploadAnchors(editor) {
  const root = composerRoot(editor);
  const editorRect = typeof editor?.getBoundingClientRect === "function"
    ? editor.getBoundingClientRect() : null;
  return [...root.querySelectorAll(SELECTORS.fileUpload)].filter((anchor) => {
    const rect = anchor.getBoundingClientRect();
    return isInteractable(anchor) && isRectInsideViewport(rect) &&
      rect.width > 10 && rect.height > 10 && anchor.getAttribute("aria-disabled") !== "true";
  }).map((anchor) => {
    const rect = anchor.getBoundingClientRect();
    const dx = editorRect ? rect.left + rect.width / 2 - (editorRect.left + editorRect.width / 2) : 0;
    const dy = editorRect ? rect.top + rect.height / 2 - (editorRect.top + editorRect.height / 2) : 0;
    return { anchor, rect, distance: dx * dx + dy * dy };
  }).sort((a, b) => a.distance - b.distance);
}

function getActiveFileInput(editor) {
  const root = composerRoot(editor);
  const editorRect = editor.getBoundingClientRect();
  return [...root.querySelectorAll(SELECTORS.fileInput)]
    .filter((input) => !input.disabled)
    .map((input) => {
      // 折叠素材组会把 reference-group-content 设成 pointer-events:none，
      // 但内部真正的 reference-upload 按钮仍可用。必须检查按钮层，不能检查展示层。
      const anchor = input.closest(SELECTORS.fileUpload) || input.parentElement;
      const rect = anchor?.getBoundingClientRect();
      const distance = rect
        ? Math.hypot(rect.left - editorRect.left, rect.top - editorRect.top)
        : Number.POSITIVE_INFINITY;
      return { input, anchor, rect, distance };
    })
    .filter(({ anchor, rect }) => anchor && rect && isInteractable(anchor) &&
      isRectInsideViewport(rect) && rect.width > 10 && rect.height > 10)
    .sort((a, b) => a.distance - b.distance)[0]?.input || null;
}

function logFileInputDiagnostic(editor, input, jobId) {
  if (!input) return;
  const root = typeof editor?.closest === "function" ? composerRoot(editor) : editor?.parentElement;
  const allInputs = root?.querySelectorAll
    ? [...root.querySelectorAll(SELECTORS.fileInput)]
    : [input];
  const anchor = input.closest?.(SELECTORS.fileUpload) || input.parentElement || input;
  const rect = anchor?.getBoundingClientRect?.();
  uploadDiagnostic(jobId, "file_input_selected", {
    selectedIndex: allInputs.indexOf(input),
    acceptRaw: input.getAttribute?.("accept") ?? null,
    multiple: Boolean(input.multiple),
    visible: rect ? Boolean(isInteractable(anchor) &&
      isRectInsideViewport(rect) && rect.width > 10 && rect.height > 10) : null,
    allFileInputAccepts: allInputs.map((item, index) => ({
      index,
      acceptRaw: item.getAttribute?.("accept") ?? null,
    })),
  });
}

async function waitForAttachmentBatch(
  editor, baselineCounts, requestedCounts, timeoutMs, jobId, sharedState,
) {
  const unobservableDeadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  let lastCounts = null;
  let observedCounts = null;
  let lastWaitingStatusAt = startedAt;
  while (true) {
    if (await batchPauseRequested()) {
      throw new Error("已按用户要求停止附件加载等待；尚未点击发送");
    }
    const explicitError = attachmentUploadError(editor);
    if (explicitError) throw new Error(`${explicitError}；尚未点击发送`);
    const counts = await readAttachmentCountsForUpload(editor, jobId);
    if (counts) {
      observedCounts = counts;
      if (!sameAttachmentCounts(counts, lastCounts)) {
        uploadDiagnostic(jobId, "attachment_count_progress", {
          elapsedMs: Date.now() - startedAt,
          baselineCounts,
          requestedCounts,
          parsedCounts: counts,
        });
        lastCounts = counts;
      }
      if (attachmentTargetsReached(baselineCounts, counts, requestedCounts)) {
        transitionAttachmentState(sharedState, jobId, "CONFIRMED", { parsedCounts: counts });
        return { state: "CONFIRMED", counts };
      }
      if (Date.now() - lastWaitingStatusAt >= 3000) {
        lastWaitingStatusAt = Date.now();
        uploadDiagnostic(jobId, "attachment_count_still_pending", {
          elapsedMs: Date.now() - startedAt,
          baselineCounts,
          requestedCounts,
          parsedCounts: counts,
        });
        status(jobId, "uploading", `附件仍在加载，3 秒后继续检查（${attachmentIncompleteDetail(baselineCounts, counts, requestedCounts)}）`);
      }
    }
    if (!observedCounts && Date.now() >= unobservableDeadline) {
      transitionAttachmentState(sharedState, jobId, "UNOBSERVABLE_AFTER_UPLOAD", {});
      return { state: "UNOBSERVABLE_AFTER_UPLOAD", counts: null };
    }
    await sleep(250);
  }
}

function attachmentUploadError(editor) {
  const root = typeof editor?.closest === "function" ? composerRoot(editor) : editor?.parentElement;
  if (!root?.querySelectorAll) return "";
  const candidates = root.querySelectorAll(
    "[role='alert'], [class*='upload-error'], [class*='error-tip'], [class*='error-message']",
  );
  for (const node of candidates) {
    const text = String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
    if (/上传失败|文件损坏|格式不支持|文件过大/.test(text)) return text.slice(0, 200);
  }
  return "";
}

async function readAttachmentCountsForUpload(editor, jobId) {
  const root = composerRoot(editor);
  if (!root?.querySelectorAll) return null;
  const counts = readAttachmentTabCounts(root);
  if (counts) return counts;
  // 真机：首次上传后只有叠放卡片，分类栏直到点击展开入口才挂载。
  // collapsed-more-entry 的 pointer-events 为 none，但其 click 处理仍可展开；
  // 只命中当前编辑器内的专用入口，不能点击图片、删除或上传按钮。
  const entry = [...root.querySelectorAll("[class*='collapsed-more-entry-'], [class*='expand-entry-']")]
    .find((element) => {
      if (element.isConnected === false) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && isRectInsideViewport(rect);
    });
  if (!entry) return null;
  entry.click();
  uploadDiagnostic(jobId, "attachment_panel_expand_requested", {});
  const deadline = Date.now() + 2000;
  do {
    const expandedCounts = readAttachmentTabCounts(composerRoot(editor));
    if (expandedCounts) return expandedCounts;
    await sleep(100);
  } while (Date.now() < deadline);
  throw new Error("展开素材面板后分类计数仍不可读；未继续上传、未补投且未点击发送");
}

function composerRoot(editor) {
  // 即梦结构中编辑器位于 main-content，附件区和 toolbar 是它的兄弟节点；
  // 三者到 layout-* 才汇合，不能把查找范围停在 main-content。
  return editor.closest("[class*='layout-']") || editor.parentElement || document;
}

function attachmentCount(editor) {
  return readAttachmentTabCounts(composerRoot(editor))?.all || 0;
}

function attachmentCountDiagnostic(editor) {
  const root = typeof editor?.closest === "function" ? composerRoot(editor) : editor?.parentElement;
  const snapshot = readAttachmentTabSnapshot(root);
  const tablist = snapshot.tablist;
  const rect = tablist?.getBoundingClientRect?.() || null;
  let interactable = null;
  if (tablist) {
    try {
      interactable = isInteractable(tablist);
    } catch (_) {
      interactable = null;
    }
  }
  return {
    count: snapshot.parsedCounts?.all || 0,
    source: snapshot.parsedCounts ? "aria-attachment-tabs" : "attachment-tab-absent",
    attachmentTab: {
      domPresent: Boolean(tablist),
      tablistCount: snapshot.tablistCount,
      selectedIndex: tablist ? 0 : null,
      labels: snapshot.labels,
      parsedCounts: snapshot.parsedCounts,
      rendered: rect ? rect.width > 0 && rect.height > 0 : null,
      interactable,
      insideViewport: rect ? isRectInsideViewport(rect) : null,
    },
  };
}

function logAttachmentCountDiagnostic(editor, jobId, phase, round) {
  uploadDiagnostic(jobId, "attachment_count", {
    phase,
    round,
    ...attachmentCountDiagnostic(editor),
  });
}

function emptyAttachmentCounts() {
  return { all: 0, images: 0, videos: 0, audios: 0, docs: 0 };
}

function readAttachmentTabCounts(root) {
  return readAttachmentTabSnapshot(root).parsedCounts;
}

function readAttachmentTabSnapshot(root) {
  if (!root?.querySelectorAll) {
    return { tablist: null, tablistCount: 0, labels: [], parsedCounts: null };
  }
  const tablists = [...root.querySelectorAll("[role='tablist']")]
    .filter((element) => element?.isConnected !== false);
  const tablist = tablists[0] || null;
  if (!tablist) {
    return { tablist: null, tablistCount: 0, labels: [], parsedCounts: null };
  }
  const labels = [...tablist.querySelectorAll("button[role='tab']")]
    .filter((element) => element?.isConnected !== false)
    .map((element) => String(element.textContent || "").trim());
  const counts = emptyAttachmentCounts();
  const keyByLabel = new Map([
    ["全部", "all"], ["所有", "all"], ["图片", "images"],
    ["视频", "videos"], ["音频", "audios"], ["文档", "docs"],
  ]);
  let recognized = 0;
  for (const label of labels) {
    const match = /^(全部|所有|图片|视频|音频|文档)\s*(?:[（(]\s*(\d+)\s*[）)])?\s*$/.exec(label);
    if (!match) continue;
    counts[keyByLabel.get(match[1])] = match[2] ? Number(match[2]) : 0;
    recognized += 1;
  }
  return {
    tablist,
    tablistCount: tablists.length,
    labels,
    parsedCounts: recognized ? counts : null,
  };
}

function sameAttachmentCounts(left, right) {
  return Boolean(left && right && ["all", "images", "videos", "audios", "docs"]
    .every((key) => left[key] === right[key]));
}

function attachmentTargetsReached(baseline, current, requested) {
  if (!current) return false;
  return ["all", "images", "videos", "audios", "docs"]
    .every((key) => requested[key] === 0 || current[key] >= baseline[key] + requested[key]);
}

function attachmentIncompleteDetail(baseline, current, requested) {
  const labels = { images: "图片", videos: "视频", audios: "音频", docs: "文档" };
  const parts = Object.keys(labels)
    .filter((key) => requested[key] > 0)
    .map((key) => {
      const confirmed = Math.max(0, Math.min(requested[key], (current?.[key] || 0) - baseline[key]));
      return `${labels[key]}确认 ${confirmed}/${requested[key]}`;
    });
  const suffix = requested.images > 0 ? "，无法确定具体文件" : "";
  return `${parts.join("；")}${suffix}`;
}

function transitionAttachmentState(sharedState, jobId, nextState, detail) {
  const previousState = sharedState?.phase || null;
  if (sharedState) sharedState.phase = nextState;
  uploadDiagnostic(jobId, "attachment_state_transition", {
    from: previousState,
    to: nextState,
    ...detail,
  });
}

function getNearestSubmitControl(editor, predicate = () => true) {
  const editorRect = editor.getBoundingClientRect();
  const root = composerRoot(editor);
  return [...root.querySelectorAll(SELECTORS.sendButton)]
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return isInteractable(button) && isRectInsideViewport(rect) &&
        isTopmostSubmitControl(button, rect) && predicate(button);
    })
    .map((button) => {
      const rect = button.getBoundingClientRect();
      const dx = rect.x + rect.width / 2 - (editorRect.x + editorRect.width);
      const dy = rect.y + rect.height / 2 - (editorRect.y + editorRect.height);
      return { button, distance: dx * dx + dy * dy };
    })
    .sort((a, b) => a.distance - b.distance)[0]?.button || null;
}

function isTopmostSubmitControl(button, rect = button.getBoundingClientRect()) {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const top = document.elementFromPoint(x, y);
  const topButton = top?.closest?.(SELECTORS.sendButton);
  return topButton === button || button.contains(top);
}

function isSendArrowButton(button) {
  return [...button.querySelectorAll("svg path")].some((path) => {
    const d = String(path.getAttribute("d") || "").replace(/\s+/g, " ");
    return d.startsWith("M12.002 3") && d.includes("V19.5");
  });
}

function isStopButton(button) {
  return [...button.querySelectorAll("svg path")].some((path) => {
    const d = String(path.getAttribute("d") || "").replace(/\s+/g, " ");
    return d.startsWith("M4.5 10.9") && d.includes("v2.2");
  });
}

function getNearestArrowControl(editor) {
  return getNearestSubmitControl(editor, isSendArrowButton);
}

function getNearestBusyButton(editor) {
  return getNearestSubmitControl(editor, (button) =>
    !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
    isStopButton(button));
}

function getNearestSendButton(editor) {
  return getNearestSubmitControl(editor, (button) =>
    !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
    isSendArrowButton(button));
}

async function waitForSubmitAck(before, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (submitAccepted(before)) return true;
    await sleep(250);
  }
  return false;
}

function submitAccepted(before) {
  const currentEditor = getComposer() || before.editor;
  // 现场验证：真正受理会清空正文和附件；仅仅“箭头变白方块”可能只是恢复了旧生成状态。
  return Boolean(currentEditor?.isConnected && !editorUserText(currentEditor) &&
    attachmentCount(currentEditor) === 0);
}

function composePrompt(prefix, prompt) {
  if (!prefix || prompt.startsWith(prefix)) return prompt;
  for (const marker of ["提示词内容：", "提示词内容:"]) {
    if (prefix.includes(marker) && prompt.includes(marker)) {
      const prefixHead = prefix.split(marker, 1)[0].trim();
      const promptHead = prompt.split(marker, 1)[0].trim();
      if (prefixHead && prefixHead === promptHead) return prompt;
    }
  }
  return `${prefix}${prompt}`;
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function editorUserText(editor) {
  if (!editor) return "";
  const clone = editor.cloneNode(true);
  clone.querySelectorAll(".rich-placeholder-widget, .ProseMirror-widget")
    .forEach((element) => element.remove());
  return normalize(clone.textContent);
}

function editorPromptText(editor) {
  if (!editor) return "";
  const clone = editor.cloneNode(true);
  clone.querySelectorAll(
    ".rich-placeholder-widget, .ProseMirror-widget, .node-subject-mention-tag, .node-reference-mention-tag",
  ).forEach((element) => element.remove());
  return clone.textContent || "";
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function waitFor(getter, timeoutMs, errorMessage) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      let result = null;
      try { result = getter(); } catch (_) {}
      if (result) return resolve(result);
      if (Date.now() >= deadline) return reject(new Error(errorMessage));
      setTimeout(poll, 200);
    };
    poll();
  });
}

async function waitForOptional(getter, timeoutMs) {
  try {
    return await waitFor(getter, timeoutMs, "optional wait timed out");
  } catch (_) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function status(jobId, state, detail) {
  chrome.runtime.sendMessage({ type: "JOB_STATUS", jobId, state, detail }).catch(() => {});
}

function uploadDiagnostic(jobId, event, detail) {
  if (!jobId) return;
  status(jobId, "uploading", `附件诊断 ${JSON.stringify({ event, ...detail })}`);
}
// Compact reference groups on some Jimeng builds have no tablist or expand
// control. Install a post-load wrapper so those references can still be
// counted after the native upload dispatch.
queueMicrotask(() => {
  if (typeof readAttachmentCountsForUpload !== "function" || typeof composerRoot !== "function") return;
  const originalReadAttachmentCountsForUpload = readAttachmentCountsForUpload;
  const directReferenceCounts = root => {
    if (!root?.querySelectorAll) return null;
    const snapshots = [];
    const containers = [...root.querySelectorAll("[data-content-generator-references='true']")];
    for (const container of containers) {
      if (container.isConnected === false) continue;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      // Group wrappers overlap: collect each actual item once across ALL groups.
      // Separate composer copies are snapshots, never additive counts.
      const items = [...new Set(container.querySelectorAll("[data-index]"))]
        .filter(item => item.isConnected !== false &&
          !item.querySelector("[data-index], input[type='file'], [class*='reference-upload-']"));
      const counts = {all: 0, images: 0, videos: 0, audios: 0, docs: 0};
      for (const item of items) {
        counts.all++;
        if (item.querySelector("audio, [class*='audio'], [class*='Audio'], svg path[d*='16.667 5.731']")) counts.audios++;
        else if (item.querySelector("video, [class*='video'], [class*='Video']")) counts.videos++;
        else if (item.querySelector("img, [class*='image'], [class*='Image']")) counts.images++;
        else counts.docs++;
      }
      if (items.length) snapshots.push(counts);
    }
    if (!snapshots.length) return null;
    // Conflicting composer copies cannot prove upload completion.
    return snapshots.every(counts => sameAttachmentCounts(counts, snapshots[0]))
      ? snapshots[0] : null;
  };
  readAttachmentCountsForUpload = async (editor, jobId) => {
    const root = composerRoot(editor);
    const categories = readAttachmentTabCounts(root);
    if (categories) return categories;
    // Compact Agent reference groups can hide the category tabs behind an
    // expand entry. Let the native reader expand that panel before falling
    // back to the compact DOM, otherwise a collapsed audio card is counted
    // as an unknown document and a successful upload is reported as 0 audio.
    try {
      const expanded = await originalReadAttachmentCountsForUpload(editor, jobId);
      if (expanded) return expanded;
    } catch (_) {
      // The compact fallback below is still useful on builds without an
      // expandable category panel.
    }
    const direct = directReferenceCounts(root);
    if (direct) {
      if (typeof uploadDiagnostic === "function") uploadDiagnostic(jobId, "attachment_direct_reference_counts", direct);
      return direct;
    }
    return null;
  };
});
