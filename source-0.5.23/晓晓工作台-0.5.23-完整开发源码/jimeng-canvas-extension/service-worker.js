if(typeof importScripts==='function') importScripts('pippit-canvas-browser.js');
const CANVAS_PREFIX = "https://jimeng.jianying.com/ai-tool/canvas/";
const JIMENG_TOOL_PREFIX = "https://jimeng.jianying.com/ai-tool/";
const DEFAULT_INTERVAL_MS = 30 * 1000;
const MAX_INTERVAL_MS = 30 * 60 * 1000;
const KEEP_ALIVE_INTERVAL_MS = 20 * 1000;
const QUEUE_POLL_INTERVAL_MS = 15 * 1000;
// 即梦画布内容很多时，新复制标签的页面脚本可能数分钟后才完成初始化。
// 把等待窗口拉长，避免页面仍在加载时误报“复制标签加载超时”。
const TAB_LOAD_TIMEOUT_MS = 5 * 60 * 1000;
const EXECUTOR_INITIAL_ATTEMPTS = 120;
const EXECUTOR_RELOAD_ATTEMPTS = 360;
const MAX_OPENED_AUTOMATION_TABS = 10;
const GENERATED_TAB_STORAGE_KEY = "jimengGeneratedTabIds";
const EXECUTOR_VERSION = "0.20.3";
function compatibleExecutorVersion(version) {
  const parse = (value) => String(value || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const current = parse(version), required = parse(EXECUTOR_VERSION);
  for (let index = 0; index < Math.max(current.length, required.length); index += 1) {
    if ((current[index] || 0) !== (required[index] || 0)) return (current[index] || 0) > (required[index] || 0);
  }
  return Boolean(version);
}
const MAX_STAGED_FILE_BYTES = 80 * 1024 * 1024;
const MAX_STAGED_TOTAL_BYTES = 160 * 1024 * 1024;
const MAX_STAGED_CHUNK_BASE64 = 4 * 1024 * 1024;
let activeBatch = null;
let generatedTabIdsCache = null;
const stagedFiles = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "DESKTOP_CONNECTOR_PING") {
    // The local workbench must prove both halves of the bridge: the
    // desktop-connector content script can still reach this service worker,
    // and the canvas executor content script is alive in the same tab.  A
    // heartbeat which only reaches localhost is insufficient after an
    // extension reload because the old page context can remain visible while
    // every chrome.runtime call in it throws "Extension context invalidated".
    const tabId = sender.tab?.id;
    verifyDesktopConnectorTab(tabId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, ready: false, executorReady: false, canvasReady: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === "BRIDGE_PANEL_STATUS") {
    inspectBridgePanel()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, ready: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === "BRIDGE_PANEL_CONNECT") {
    connectBridgePanel()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, ready: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === "BRIDGE_PANEL_FOCUS") {
    inspectBridgePanel({ focus: true })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, ready: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === "STAGE_FILE_BEGIN") {
    sendResponse(beginStagedFile(message.file));
    return false;
  }
  if (message?.type === "STAGE_FILE_CHUNK") {
    sendResponse(storeStagedFileChunk(message));
    return false;
  }
  if (message?.type === "STAGE_FILE_FINISH") {
    sendResponse(finishStagedFile(message.transferId));
    return false;
  }
  if (message?.type === "GET_STAGED_FILE_CHUNK") {
    sendResponse(getStagedFileChunk(message.transferId, message.chunkIndex));
    return false;
  }
  if (message?.type === "RELEASE_STAGED_FILES") {
    releaseStagedFiles(message.transferIds);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "START_BATCH") {
    const transferIds = collectJobTransferIds(message.jobs);
    // Carry the desktop-workbench protocol envelope into each job while
    // keeping legacy side-panel jobs unchanged when these fields are absent.
    const jobs = normalizeBridgeJobs(message.jobs, message);
    runBatch({ ...message, jobs, sourceTabId: message.sourceTabId || sender.tab?.id })
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      })
      .finally(() => releaseStagedFiles(transferIds));
    return true;
  }
  if (message?.type === "PAUSE_BATCH") {
    if (!activeBatch || (message.batchId && message.batchId !== activeBatch.id)) {
      sendResponse({ ok: false, error: "当前没有匹配的运行批次" });
      return false;
    }
    activeBatch.paused = true;
    activeBatch.resolvePause();
    postBatchState(true, activeBatch.id, true);
    sendResponse({ ok: true, batchId: activeBatch.id });
    return false;
  }
  if (message?.type === "GET_BATCH_STATE") {
    sendResponse({
      ok: true,
      active: Boolean(activeBatch),
      batchId: activeBatch?.id || null,
      paused: Boolean(activeBatch?.paused),
    });
    return false;
  }
  if (message?.type === "TRUSTED_CLICK") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "无法确定发送按钮所在标签页" });
      return false;
    }
    // Chromium will not grant a file chooser user activation to a background
    // tab. Bring the Jimeng canvas to the foreground before clicking its
    // upload entry; ordinary mention/send clicks keep the previous routing.
    const windowId = sender.tab?.windowId;
    const beforeClick = message.intent === "open_attachment_upload"
      ? (chrome.windows?.update && Number.isInteger(windowId)
        ? Promise.resolve(chrome.windows.update(windowId, { focused: true }))
        : Promise.resolve())
          .then(() => chrome.tabs?.update
            ? chrome.tabs.update(tabId, { active: true })
            : undefined)
      : Promise.resolve();
    beforeClick
      .then(() => dispatchTrustedClick(tabId, message.point, message.expect))
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }
  if (message?.type === "TRUSTED_DRAG") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "无法确定拖拽所在标签页" });
      return false;
    }
    dispatchTrustedDrag(tabId, message.from, message.to)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }
  if (message?.type === "TRUSTED_INSERT_TEXT") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "无法确定文字输入所在标签页" });
      return false;
    }
    dispatchTrustedText(tabId, message.text)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }
  if (message?.type === "TRUSTED_SHIFT_AT") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "无法确定 @ 输入所在标签页" });
      return false;
    }
    dispatchTrustedShiftAt(tabId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => {
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }
  if (message?.type === "ENSURE_SOURCE_EXECUTOR") {
    ensureSourceExecutor(message.tabId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  // JOB_STATUS 会由 Chrome 直接广播给侧栏；这里不能再次转发，否则会形成消息回环。
  return false;
});

function normalizeBridgeJobs(jobs, envelope = {}) {
  if (!Array.isArray(jobs)) return [];
  return jobs.map((job) => {
    const next = {...job};
    if (next.source === undefined && envelope.source !== undefined) {
      next.source = envelope.source;
    }
    if (next.bridgeProtocolVersion === undefined && envelope.bridgeProtocolVersion !== undefined) {
      next.bridgeProtocolVersion = envelope.bridgeProtocolVersion;
    }
    if (next.promptIsFinal === undefined && envelope.promptIsFinal !== undefined) {
      next.promptIsFinal = envelope.promptIsFinal === true;
    }
    return next;
  });
}

function beginStagedFile(file) {
  const transferId = String(file?.transferId || "");
  const size = Number(file?.size);
  const totalChunks = Number(file?.totalChunks);
  if (!transferId || !Number.isInteger(totalChunks) || totalChunks < 0 ||
      !Number.isFinite(size) || size < 0 || size > MAX_STAGED_FILE_BYTES) {
    return { ok: false, error: "附件分块元数据无效或单个附件超过 80 MB" };
  }
  const stagedBytes = [...stagedFiles.values()].reduce((sum, item) => sum + item.size, 0);
  if (stagedBytes + size > MAX_STAGED_TOTAL_BYTES) {
    return { ok: false, error: "附件分块缓存合计超过 160 MB，请拆成多批" };
  }
  stagedFiles.set(transferId, {
    name: String(file.name || "未命名附件"),
    type: String(file.type || "application/octet-stream"),
    lastModified: Number(file.lastModified) || Date.now(),
    size,
    totalChunks,
    chunks: new Array(totalChunks),
    complete: totalChunks === 0,
  });
  return { ok: true };
}

function storeStagedFileChunk({ transferId, chunkIndex, base64 }) {
  const staged = stagedFiles.get(String(transferId || ""));
  const index = Number(chunkIndex);
  if (!staged || !Number.isInteger(index) || index < 0 || index >= staged.totalChunks) {
    return { ok: false, error: "附件分块编号无效或缓存已失效" };
  }
  if (typeof base64 !== "string" || base64.length > MAX_STAGED_CHUNK_BASE64) {
    return { ok: false, error: "附件分块为空或尺寸异常" };
  }
  staged.chunks[index] = base64;
  return { ok: true };
}

function finishStagedFile(transferId) {
  const staged = stagedFiles.get(String(transferId || ""));
  if (!staged || staged.chunks.some((chunk) => typeof chunk !== "string")) {
    return { ok: false, error: "附件分块不完整，请重新选择附件" };
  }
  staged.complete = true;
  return { ok: true };
}

function getStagedFileChunk(transferId, chunkIndex) {
  const staged = stagedFiles.get(String(transferId || ""));
  const index = Number(chunkIndex);
  if (!staged?.complete || !Number.isInteger(index) || index < 0 || index >= staged.totalChunks) {
    return { ok: false, error: "附件缓存已失效或分块不存在，请重新开始发送" };
  }
  return { ok: true, base64: staged.chunks[index] };
}

function collectJobTransferIds(jobs) {
  return [...new Set((jobs || []).flatMap((job) =>
    (job.files || []).map((file) => file.transferId).filter(Boolean)))];
}

function releaseStagedFiles(transferIds) {
  for (const transferId of transferIds || []) stagedFiles.delete(String(transferId || ""));
}

// 内容脚本算好候选项坐标、确认它在最上层之后，还要跨一次消息到达这里，再等
// chrome.debugger.attach 完成，才真正派发鼠标事件。@ 菜单浮在对话图片和附件
// 缩略图条上方，只要在这段窗口里菜单关闭或重排，同一个坐标下面就换成了别的
// 元素——实测 (771,403) 菜单开着是候选项“阮乔”，菜单一关就变成对话里的
// agentic-image-item，点下去弹出放大图，整组卡死。
//
// 所以在已经 attach 的同一个会话里，按下之前再用 CDP 查一次该坐标下到底是
// 什么。对不上就直接放弃本次点击——宁可让上层重试一次 @，也绝不点到别的东西上。
// 这条只会减少点击，不会增加点击，"最多点一次"的约束不受影响。
async function verifyClickTarget(target, x, y, expect) {
  const text = String(expect?.text || "");
  if (!text) return { ok: true, skipped: true };
  const expression = `(() => {
    const element = document.elementFromPoint(${x}, ${y});
    if (!element) return JSON.stringify({ hit: false });
    const wanted = ${JSON.stringify(text)};
    const normalize = value => String(value || "").replace(/\\s+/g, "").trim();
    for (let node = element, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
      if (normalize(node.textContent) === normalize(wanted)) {
        return JSON.stringify({ hit: true, match: true });
      }
    }
    return JSON.stringify({
      hit: true,
      match: false,
      actual: normalize(element.textContent).slice(0, 40),
      className: String(element.className || "").slice(0, 60),
    });
  })()`;
  const result = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  let parsed;
  try {
    parsed = JSON.parse(result?.result?.value || "{}");
  } catch (_) {
    return { ok: true, skipped: true };
  }
  if (parsed.match) return { ok: true };
  return {
    ok: false,
    reason: parsed.hit
      ? `目标已变成“${parsed.actual || parsed.className || "其他元素"}”`
      : "目标坐标下已经没有元素",
  };
}

async function dispatchTrustedClick(tabId, point, expect) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("发送按钮坐标无效");
  }

  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  let pressed = false;
  try {
    const verified = await verifyClickTarget(target, x, y, expect);
    if (!verified.ok) {
      return { clicked: false, stale: true, error: `点击前复核失败：${verified.reason}；已放弃本次点击` };
    }
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    pressed = true;
    try {
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    } catch (error) {
      // mousePressed 之后就跨过“最多一次”的边界：即使释放事件报错也绝不重试。
      return { clicked: true, uncertain: true, warning: String(error?.message || error) };
    }
    return { clicked: true, uncertain: false };
  } catch (error) {
    if (pressed) {
      return { clicked: true, uncertain: true, warning: String(error?.message || error) };
    }
    throw error;
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function dispatchTrustedDrag(tabId, fromPoint, toPoint) {
  const fromX = Number(fromPoint?.x);
  const fromY = Number(fromPoint?.y);
  const toX = Number(toPoint?.x);
  const toY = Number(toPoint?.y);
  if (![fromX, fromY, toX, toY].every(Number.isFinite)) {
    throw new Error("对话栏拖拽坐标无效");
  }
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved", x: fromX, y: fromY,
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x: fromX, y: fromY,
      button: "left", buttons: 1, clickCount: 1,
    });
    for (let step = 1; step <= 5; step += 1) {
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: fromX + (toX - fromX) * step / 5,
        y: fromY + (toY - fromY) * step / 5,
        button: "left",
        buttons: 1,
      });
    }
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x: toX, y: toY,
      button: "left", buttons: 0, clickCount: 1,
    });
    return { dragged: true };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function dispatchTrustedText(tabId, rawText) {
  const text = String(rawText || "");
  if (!text || text.length > 200) throw new Error("可信文字输入为空或过长");
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Input.insertText", { text });
    return { inserted: true };
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

// 即梦的资产库监听的是键盘产生的“@”快捷键，不是单纯插入一个 @ 字符。
// 通过 CDP 先按住 Shift，再按 Digit2，完整模拟用户的 Shift+2，
// 然后按相反顺序释放；这样候选菜单能走和手动输入相同的页面事件链。
async function dispatchTrustedShiftAt(tabId) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  let shiftDown = false;
  let digitDown = false;
  try {
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Shift",
      code: "ShiftLeft",
      location: 1,
      modifiers: 8,
      windowsVirtualKeyCode: 16,
      nativeVirtualKeyCode: 16,
    });
    shiftDown = true;
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "@",
      code: "Digit2",
      text: "@",
      unmodifiedText: "2",
      location: 0,
      modifiers: 8,
      windowsVirtualKeyCode: 50,
      nativeVirtualKeyCode: 50,
    });
    digitDown = true;
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "char",
      key: "@",
      code: "Digit2",
      text: "@",
      unmodifiedText: "2",
      location: 0,
      modifiers: 8,
      windowsVirtualKeyCode: 50,
      nativeVirtualKeyCode: 50,
    });
    digitDown = false;
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "@",
      code: "Digit2",
      location: 0,
      modifiers: 8,
      windowsVirtualKeyCode: 50,
      nativeVirtualKeyCode: 50,
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Shift",
      code: "ShiftLeft",
      location: 1,
      modifiers: 0,
      windowsVirtualKeyCode: 16,
      nativeVirtualKeyCode: 16,
    });
    shiftDown = false;
    return { dispatched: true, shortcut: "Shift+2" };
  } finally {
    // 如果 CDP 在按键链中途断开，尽力补发抬键，避免页面后续输入残留 Shift 修饰键。
    if (digitDown) {
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "@", code: "Digit2", modifiers: 8,
        windowsVirtualKeyCode: 50, nativeVirtualKeyCode: 50,
      }).catch(() => {});
    }
    if (shiftDown) {
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "Shift", code: "ShiftLeft", modifiers: 0,
        windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16,
      }).catch(() => {});
    }
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function runBatch({ sourceTabId, jobs, intervalMs, batchId, reuseSourceTab = false, reuseSourceTabFirst = false }) {
  if (activeBatch) throw new Error("已有发送批次正在运行，请先暂停或等待结束。");
  if (reuseSourceTab && jobs.length !== 1) {
    throw new Error("当前标签直发模式只允许一次发送一份整稿");
  }
  const source = await chrome.tabs.get(sourceTabId);
  if (!source.url?.startsWith(CANVAS_PREFIX)) {
    throw new Error("请先打开即梦页面并进入右侧对话，再点击开始投放。");
  }
  const waitMs = Math.max(
    DEFAULT_INTERVAL_MS,
    Math.min(MAX_INTERVAL_MS, Number(intervalMs) || DEFAULT_INTERVAL_MS),
  );
  let resolvePause;
  const controller = {
    id: batchId || crypto.randomUUID(),
    paused: false,
    pausePromise: new Promise((resolve) => { resolvePause = resolve; }),
    resolvePause: () => resolvePause(),
  };
  activeBatch = controller;
  postBatchState(true, controller.id);
  let dispatched = 0;
  let previousQueueGate = null;
  try {
    for (const [index, job] of jobs.entries()) {
      if (controller.paused) {
        markRemainingPaused(jobs, index);
        return { ok: true, accepted: dispatched, paused: true };
      }
      if (index > 0) {
        const readyForNext = previousQueueGate
          ? await waitForPreviousVideoQueue(previousQueueGate, job, waitMs, controller)
          : await waitForFixedInterval(job, waitMs, controller);
        if (!readyForNext || controller.paused) {
          markRemainingPaused(jobs, index);
          return { ok: true, accepted: dispatched, paused: true };
        }
      }
      // 严格串行：上一条页面执行器返回后，才开始计算间隔并复制下一标签。
      // 长整稿分批时，第 1 批直接使用用户当前已打开的画布；
      // 后续批次才复制标签，避免一开始重复打开当前画布。
      const useSourceTab = reuseSourceTab || (reuseSourceTabFirst && index === 0);
      const outcome = await dispatchOne(sourceTabId, job, useSourceTab);
      if (outcome.generatedTab && outcome.tabId) {
        await trackAndPruneGeneratedTab(outcome.tabId, sourceTabId);
      }
      if (outcome.clicked) dispatched += 1;
      if (!outcome.completed) {
        // 任一任务发送前失败或点击后未确认，都立即停止本批次。继续复制标签
        // 只会扩大残留状态；未打开的任务保留在队列，供修复后人工重新开始。
        controller.paused = true;
        markRemainingPaused(jobs, index + 1);
        return {
          ok: true,
          accepted: dispatched,
          paused: true,
          stoppedOnFailure: true,
          failedJobId: job.id,
          error: outcome.error || "画布未确认任务完成",
        };
      }
      if (controller.paused) {
        markRemainingPaused(jobs, index + 1);
        return { ok: true, accepted: dispatched, paused: true };
      }
      previousQueueGate = outcome.queueGate || null;
    }
    return { ok: true, accepted: dispatched, paused: false };
  } finally {
    if (activeBatch === controller) activeBatch = null;
    postBatchState(false, controller.id);
  }
}

function markRemainingPaused(jobs, startIndex) {
  for (const job of jobs.slice(startIndex)) {
    postStatus(job.id, "paused", "已暂停，尚未打开此任务标签；再次开始可继续");
  }
}

async function waitForFixedInterval(nextJob, waitMs, controller) {
  postStatus(nextJob.id, "waiting_interval", `等待上一条流程结束后满 ${formatInterval(waitMs)}`);
  return await delayWithKeepAlive(waitMs, controller);
}

async function waitForPreviousVideoQueue(gate, nextJob, configuredWaitMs, controller) {
  const expected = Math.max(1, Number(gate.expectedVideoCount) || 1);
  const minimumWaitMs = Math.max(configuredWaitMs, expected * 60 * 1000);
  postStatus(
    nextJob.id,
    "waiting_queue_confirmation",
    `上一批预计生成 ${expected} 个视频；先等待 ${formatInterval(minimumWaitMs)}，再核对画布新增任务卡`,
  );
  if (!await delayWithKeepAlive(minimumWaitMs, controller)) return false;

  const baseline = new Set(gate.baselineCardIds || []);
  let lastObserved = -1;
  while (!controller.paused) {
    let snapshot;
    try {
      snapshot = await readVideoQueueSnapshot(gate.tabId);
    } catch (error) {
      controller.paused = true;
      postStatus(
        nextJob.id,
        "queue_confirmation_failed",
        `无法读取上一批画布任务卡，已停止发送下一批：${String(error?.message || error)}`,
      );
      return false;
    }
    // 放行标准是“任务已成功发送并在画布创建过视频任务卡”，不是视频最终渲染成功。
    // 因此即使任务卡稍后变成“生成失败”，也证明这一条已经进入过排队，仍应计数。
    const newQueueCards = (snapshot.cardIds || []).filter((id) => !baseline.has(id));
    if (newQueueCards.length >= expected) {
      postStatus(
        nextJob.id,
        "queue_confirmed",
        `上一批已检测到 ${newQueueCards.length}/${expected} 个新增视频任务卡（已进入排队），允许发送下一批`,
      );
      return true;
    }
    if (newQueueCards.length !== lastObserved) {
      lastObserved = newQueueCards.length;
      postStatus(
        nextJob.id,
        "waiting_queue_confirmation",
        `上一批目前只检测到 ${newQueueCards.length}/${expected} 个新增视频任务卡；继续等待，不会抢发下一批`,
      );
    }
    if (!await delayWithKeepAlive(QUEUE_POLL_INTERVAL_MS, controller)) return false;
  }
  return false;
}

async function readVideoQueueSnapshot(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "GET_VIDEO_QUEUE_SNAPSHOT_V15" });
  if (!response?.ok || !Array.isArray(response.cardIds)) {
    throw new Error("页面执行器未返回有效的视频任务卡快照");
  }
  return response;
}

async function dispatchOne(sourceTabId, job, reuseSourceTab = false) {
  postStatus(job.id, "opening", reuseSourceTab ? "正在使用当前画布标签直接发送整稿" : "正在复制画布标签");
  let tab;
  try {
    tab = reuseSourceTab ? await chrome.tabs.get(sourceTabId) : await chrome.tabs.duplicate(sourceTabId);
    if (!reuseSourceTab) await waitForTabComplete(tab.id, TAB_LOAD_TIMEOUT_MS);
    await assertCanvasTab(tab.id);
    await ensureExecutorReady(tab.id, job.id);
    const queueBaseline = job.waitForQueueCards && Number(job.expectedVideoCount) > 0
      ? await readVideoQueueSnapshot(tab.id)
      : null;
    const response = await dispatchJobSafely(tab.id, job);
    if (!response?.ok && !response?.clicked) {
      postStatus(job.id, "failed_before_click", response?.error || "页面执行器未能开始发送");
    }
    return {
      completed: Boolean(response?.ok && response?.confirmed),
      clicked: Boolean(response?.clicked),
      error: response?.error || null,
      tabId: tab.id,
      generatedTab: !reuseSourceTab,
      queueGate: queueBaseline ? {
        tabId: tab.id,
        jobId: job.id,
        label: job.label || job.id,
        expectedVideoCount: Math.max(1, Number(job.expectedVideoCount) || 1),
        baselineCardIds: queueBaseline.cardIds,
      } : null,
    };
  } catch (error) {
    postStatus(job.id, "failed_before_click", String(error?.message || error));
    return { completed: false, clicked: false, error: String(error?.message || error), tabId: tab?.id || null, generatedTab: !reuseSourceTab };
  }
}

async function trackAndPruneGeneratedTab(latestTabId, sourceTabId) {
  try {
    const trackedIds = await loadGeneratedTabIds();
    const uniqueIds = [...new Set([...trackedIds, latestTabId])];
    await pruneGeneratedTabs(uniqueIds, latestTabId, sourceTabId);
  } catch (error) {
    // 清理只是性能保护，任何清理异常都不能中断正式发送队列。
    postBatchLog(`自动标签清理失败，已忽略并继续发送：${String(error?.message || error)}`);
  }
}

async function pruneGeneratedTabs(trackedIds, latestTabId, sourceTabId) {
  const liveIds = [];
  for (const tabId of trackedIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.url?.startsWith(JIMENG_TOOL_PREFIX)) liveIds.push(tabId);
    } catch (_) {
      // 用户已手动关闭的标签直接从本批跟踪列表移除。
    }
  }
  if (liveIds.length <= MAX_OPENED_AUTOMATION_TABS) {
    await saveGeneratedTabIds(liveIds);
    return;
  }

  const olderTabIds = liveIds.slice(0, -1)
    .filter((tabId) => tabId !== sourceTabId && tabId !== latestTabId);
  const closedIds = [];
  for (const tabId of olderTabIds) {
    try {
      await chrome.tabs.remove(tabId);
      closedIds.push(tabId);
    } catch (_) {
      // 标签可能刚好被用户关闭；继续清理其他已确认目标。
    }
  }
  // 删除失败的标签保留在跟踪名单，下次新建标签时会再次尝试；源画布从未进入删除列表。
  const retainedIds = liveIds.filter((tabId) => !closedIds.includes(tabId));
  await saveGeneratedTabIds(retainedIds);
  postBatchLog(
    `插件创建的即梦标签超过 ${MAX_OPENED_AUTOMATION_TABS} 个，已关闭前面 ${closedIds.length} 个，只保留最新生成标签并继续执行`,
  );
}

async function loadGeneratedTabIds() {
  if (generatedTabIdsCache) return [...generatedTabIdsCache];
  const stored = await chrome.storage.local.get(GENERATED_TAB_STORAGE_KEY);
  generatedTabIdsCache = Array.isArray(stored?.[GENERATED_TAB_STORAGE_KEY])
    ? stored[GENERATED_TAB_STORAGE_KEY].filter(Number.isInteger)
    : [];
  return [...generatedTabIdsCache];
}

async function saveGeneratedTabIds(tabIds) {
  generatedTabIdsCache = [...new Set(tabIds.filter(Number.isInteger))];
  await chrome.storage.local.set({ [GENERATED_TAB_STORAGE_KEY]: generatedTabIdsCache });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatInterval(ms) {
  if (ms % 60000 === 0) return `${Math.round(ms / 60000)} 分钟`;
  return `${Math.round(ms / 1000)} 秒`;
}

async function delayWithKeepAlive(ms, controller) {
  let remaining = ms;
  while (remaining > 0) {
    const slice = Math.min(KEEP_ALIVE_INTERVAL_MS, remaining);
    const paused = await Promise.race([
      delay(slice).then(() => false),
      controller.pausePromise.then(() => true),
    ]);
    if (paused || controller.paused) return false;
    remaining -= slice;
    if (remaining > 0) {
      // Chrome 扩展后台可能在 30 秒无活动后休眠；只读 API 调用会重置空闲计时。
      await chrome.runtime.getPlatformInfo().catch(() => {});
    }
  }
  return true;
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`复制标签加载超时（已等待 ${Math.round(timeoutMs / 60000)} 分钟）`));
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (changedId, info) => {
      if (changedId === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((current) => {
      if (current.status === "complete") finish();
    }).catch(() => {});
  });
}

async function ensureExecutorReady(tabId, jobId) {
  postStatus(jobId, "connecting_executor", "正在确认新标签已加载扩展执行器");
  if (await waitForExecutorHandshake(tabId, EXECUTOR_INITIAL_ATTEMPTS)) {
    postStatus(jobId, "executor_ready", "新标签执行器已连接");
    return;
  }
  await recoverExecutor(tabId, jobId);
}

async function canvasTabsForBridge() {
  const tabs = await chrome.tabs.query({ url: `${CANVAS_PREFIX}*` });
  return tabs.sort((left, right) =>
    Number(Boolean(right.active)) - Number(Boolean(left.active)) ||
    Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0));
}

async function inspectBridgePanel({ focus = false } = {}) {
  const tabs = await canvasTabsForBridge();
  if (!tabs.length) {
    return { ok: true, ready: false, foundCanvas: false, executorReady: false,
      canvasReady: false, error: "没有找到已打开的即梦画布项目" };
  }
  let selected = null;
  for (const tab of tabs) {
    const probe = await verifyDesktopConnectorTab(tab.id);
    const candidate = { ...probe, foundCanvas: true, tabId: tab.id,
      title: tab.title || "即梦画布", url: tab.url || "" };
    if (!selected || candidate.ready) selected = candidate;
    if (candidate.ready) break;
  }
  if (focus && selected?.tabId) {
    await chrome.tabs.update(selected.tabId, { active: true }).catch(() => {});
    const tab = tabs.find((item) => item.id === selected.tabId);
    if (Number.isInteger(tab?.windowId)) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    }
  }
  return { ok: true, ...selected };
}

async function connectBridgePanel() {
  let state = await inspectBridgePanel({ focus: true });
  if (!state.foundCanvas || !Number.isInteger(state.tabId)) return state;
  if (!state.executorReady) {
    if (state.version) {
      await ensureSourceExecutor(state.tabId);
    } else {
      // The user explicitly clicked Connect.  With no receiver there is no
      // safe in-page upgrade path, so refresh this exact canvas tab once and
      // let manifest content scripts attach again.
      await chrome.tabs.reload(state.tabId);
      await waitForTabComplete(state.tabId, TAB_LOAD_TIMEOUT_MS);
      if (!await waitForExecutorHandshake(state.tabId, EXECUTOR_INITIAL_ATTEMPTS)) {
        throw new Error("画布已刷新，但当前版本执行器仍未加载；请在扩展管理页重新加载此扩展");
      }
    }
  }
  const opened = await chrome.tabs.sendMessage(state.tabId, { type: "OPEN_CONVERSATION_V15" });
  if (!opened?.ok) throw new Error(opened?.error || "无法打开右侧 Agent 对话");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state = await inspectBridgePanel();
    if (state.ready) return { ...state, connected: true };
    await delay(250);
  }
  return { ...state, connected: false,
    error: state.error || "右侧 Agent 对话已打开，但三方握手仍未完成" };
}

async function ensureSourceExecutor(tabId) {
  const id = Number(tabId);
  if (!Number.isInteger(id)) throw new Error("当前即梦标签编号无效");
  if (await pingExecutorV15(id)) return { refreshed: false, version: EXECUTOR_VERSION };

  // 旧 content script 与新脚本存在同名顶层声明时，直接补注入会被浏览器拒绝。
  // 先向旧执行器确认右侧输入区为空，再安全刷新一次，让清单中的新脚本自然加载。
  let oldState = null;
  try {
    oldState = await chrome.tabs.sendMessage(id, {
      type: "CHECK_SOURCE_CLEAN_V15",
      mode: "conversation",
    });
  } catch (_) {}
  if (!oldState?.ok) {
    throw new Error("无法确认旧执行器里的输入区是否为空，未自动刷新；请先确认输入区为空并手动刷新即梦标签，再重试");
  }
  if (oldState?.ok && !oldState.clean) {
    throw new Error("当前即梦对话输入区有未发送内容，不能自动刷新升级执行器；请先清空输入区，再重试");
  }
  await chrome.tabs.reload(id);
  await waitForTabComplete(id, TAB_LOAD_TIMEOUT_MS);
  for (let attempt = 0; attempt < EXECUTOR_INITIAL_ATTEMPTS; attempt += 1) {
    if (await pingExecutorV15(id)) return { refreshed: true, version: EXECUTOR_VERSION };
    await delay(500);
  }
  throw new Error(`即梦标签已安全刷新，但 ${EXECUTOR_VERSION} 执行器仍未加载；请先到 chrome://extensions 重新加载本扩展，再重试`);
}

async function pingExecutorV15(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING_EXECUTOR_V15" });
    return Boolean(response?.ok && response?.ready && compatibleExecutorVersion(response.version));
  } catch (_) {
    return false;
  }
}

async function verifyDesktopConnectorTab(tabId) {
  const id = Number(tabId);
  if (!Number.isInteger(id)) {
    return { ready: false, executorReady: false, canvasReady: false, error: "无法确定即梦画布标签页" };
  }
  let tab;
  try {
    tab = await chrome.tabs.get(id);
  } catch (_) {
    return { ready: false, executorReady: false, canvasReady: false, error: "即梦画布标签页已关闭" };
  }
  const canvasReady = Boolean(tab?.status === "complete" && tab.url?.startsWith(CANVAS_PREFIX));
  if (!canvasReady) {
    return { ready: false, executorReady: false, canvasReady: false, tabId: id, error: "即梦画布仍在加载或标签地址无效" };
  }
  const executorProbe = await probeExecutorV15(id);
  const executorReady = executorProbe.ready;
  const canvasProbe = await probeCanvasExecutorV16(id);
  const canvasExecutor = canvasProbe.ready;
  const versionMismatch = executorProbe.version && !compatibleExecutorVersion(executorProbe.version);
  const error = executorReady && canvasExecutor
    ? ""
    : versionMismatch
      ? `扩展执行器版本 ${executorProbe.version} 过旧，需要 ${EXECUTOR_VERSION}；请在 chrome://extensions 重新加载本扩展，再刷新画布`
      : "画布执行器或右侧 Agent 对话输入框未响应，请点击插件里的“连接工作台”";
  return {
    ready: Boolean(executorReady && canvasExecutor),
    executorReady: Boolean(executorReady),
    canvasReady: Boolean(canvasExecutor),
    mode: canvasProbe.mode || "",
    tabId: id,
    version: executorProbe.version || "",
    error,
  };
}

async function probeExecutorV15(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING_EXECUTOR_V15" });
    return {
      ready: Boolean(response?.ok && response?.ready && compatibleExecutorVersion(response.version)),
      version: String(response?.version || ""),
    };
  } catch (error) {
    return { ready: false, version: "", error: String(error?.message || error) };
  }
}

async function probeCanvasExecutorV16(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "PING_CANVAS_EXECUTOR_V16" });
    return {
      ready: Boolean(response?.ok && response?.ready && response?.canvasReady &&
        compatibleExecutorVersion(response.version)),
      version: String(response?.version || ""),
      mode: String(response?.mode || ""),
    };
  } catch (error) {
    return { ready: false, version: "", error: String(error?.message || error) };
  }
}

async function recoverExecutor(tabId, jobId) {
  // 此时 DISPATCH_JOB 尚未送达，不可能已经写入或点击发送；刷新不会造成重复投放。
  postStatus(jobId, "recovering_executor", "新标签未加载当前版本执行器，正在安全刷新后重新连接（尚未写入或发送）");
  await chrome.tabs.reload(tabId);
  await waitForTabComplete(tabId, TAB_LOAD_TIMEOUT_MS);
  await assertCanvasTab(tabId);
  const ready = await waitForExecutorHandshake(tabId, EXECUTOR_RELOAD_ATTEMPTS);
  if (!ready) {
    throw new Error("新标签安全刷新后仍未加载当前版本执行器；本条尚未写入或发送");
  }
  postStatus(jobId, "executor_ready", "安全刷新完成，新标签执行器已连接");
}

async function waitForExecutorHandshake(tabId, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING_EXECUTOR" });
      // 已打开的即梦标签不会在扩展重载后自动换成新 content script。
      // 仅检查 ready 会误接旧版本执行器，使新修复看似没有生效。
      if (response?.ok && response?.ready && compatibleExecutorVersion(response?.version)) return true;
    } catch (_) {}
    await delay(500);
  }
  return false;
}

async function dispatchJobSafely(tabId, job) {
  const payload = { type: "DISPATCH_JOB_V15", job };
  try {
    // 正式任务只发送一次。只有 Chrome 明确表示“没有接收端”时，才能确定任务未送达。
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw new Error(`任务交接回执中断；为避免重复发送，未自动重试：${String(error?.message || error)}`);
    }
    postStatus(job.id, "recovering_executor", "任务交接前执行器刚刚断开，正在安全刷新后再交接一次");
    await recoverExecutor(tabId, job.id);
    return await chrome.tabs.sendMessage(tabId, payload);
  }
}

function isMissingReceiverError(error) {
  const message = String(error?.message || error || "");
  return (message.includes("Could not establish connection") &&
    message.includes("Receiving end does not exist")) ||
    /Extension context invalidated|extension context was invalidated/i.test(message);
}

async function assertCanvasTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith(CANVAS_PREFIX)) {
    throw new Error("复制出的标签没有停留在即梦页面；本条尚未写入或发送");
  }
}

function postStatus(jobId, state, detail) {
  chrome.runtime.sendMessage({ type: "JOB_STATUS", jobId, state, detail }).catch(() => {});
}

function postBatchState(active, batchId, paused = false) {
  chrome.runtime.sendMessage({ type: "BATCH_STATE", active, batchId, paused }).catch(() => {});
}

function postBatchLog(detail) {
  chrome.runtime.sendMessage({ type: "BATCH_LOG", detail }).catch(() => {});
}
