import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "0.20.9");
assert.match(manifest.content_scripts[0].matches[0], /xyq\.jianying\.com/);
assert.ok(manifest.permissions.includes("debugger"));
assert.ok(manifest.permissions.includes("alarms"));
assert.ok(manifest.content_scripts.some(item=>item.js.includes("xyq-auto-connect.js")));
assert.ok(!manifest.host_permissions.some(host=>host.includes("jimeng.jianying.com")),"专用插件不接管即梦 CLI");
assert.equal(manifest.action.default_popup, "xyq-connector.html");

const required = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  "xyq-connector.js",
  ...manifest.content_scripts.flatMap((item) => item.js),
  "sidepanel.js",
  "sidepanel.css",
  "bridge-panel.html",
  "bridge-panel.css",
  "bridge-panel.js",
  "README.md",
  "test-inline-mentions.mjs",
  "test-prompt-integrity.mjs",
  "test-scene-matching.mjs",
  "test-send-control.mjs",
  "test-executor-handshake.mjs",
  "test-final-stop.mjs",
  "test-multifile-upload.mjs",
  "test-attachment-category-count.mjs",
  "test-stop-on-failure.mjs",
  "test-delivery-first.mjs",
  "test-mention-retry.mjs",
  "test-mention-menu-retrigger.mjs",
  "test-tab-pruning.mjs",
  "test-queue-confirmation.mjs",
  "test-source-executor-upgrade.mjs",
  "calibration.html",
  "calibration.js",
  "test-calibration-parser.mjs",
  "test-calibration-page.mjs",
  "test-calibration-extra-source-select.mjs",
  "test-calibration-subject-forms.mjs",
];
for (const file of required) {
  assert.ok((await readFile(resolve(root, file))).length > 0, `${file} should exist`);
}

const content = await readFile(resolve(root, "content.js"), "utf8");
assert.match(content, /materializeJobFiles/);
assert.match(content, /GET_STAGED_FILE_CHUNK/);
assert.match(content, /item\.file \|\| new File/);
assert.match(content, /submitUntilAccepted/);
assert.match(content, /retrying_submit/);
// 送达重试是“点一次 → 等确认窗口 → 没出去再点一次”，不是连打。
assert.match(content, /const SUBMIT_MAX_ATTEMPTS = \d+;/);
assert.match(content, /const SUBMIT_ACK_WAIT_MS = \d+;/);
assert.equal(/burstClick/.test(content), false, "不能再有连打三次的写法");
assert.match(content, /waitForSubmitAck\(\{ editor \}, SUBMIT_ACK_WAIT_MS\)/);
assert.match(content, /submitAccepted/);
assert.match(content, /batchPauseRequested/);
assert.match(content, /intent: "submit_until_accepted"/);
assert.match(content, /insertText/);
assert.match(content, /visibility !== "visible"/);
assert.match(content, /isRectInsideViewport/);
assert.match(content, /attachmentCount\(editor\)/);
assert.match(content, /editor\.closest\("\[class\*='layout-'\]"\)/);
assert.match(content, /TRUSTED_CLICK/);
assert.match(content, /TRUSTED_DRAG/);
assert.match(content, /videoQueueSnapshot/);
assert.match(content, /resizeConversationPanelForMention/);
assert.doesNotMatch(content, /button\.click\(\)/);
assert.match(content, /visibleMentionOptions/);
assert.match(content, /mentionMenuShowsNoResult/);
assert.match(content, /visibleMentionMenus/);
assert.match(content, /mentionOptionSignature/);
assert.match(content, /mentionSearchQueryAppears/);
assert.match(content, /isConfirmedMissingSubject/);
assert.match(content, /mentionMenuIsLoading/);
assert.match(content, /node-subject-mention-tag/);
assert.match(content, /node-reference-mention-tag/);
assert.match(content, /img\[src\^="blob:"\]/);
assert.match(content, /setCaretAfterOccurrence/);
assert.match(content, /setCaretAfterOccurrence\(editor, placement\.anchor, placement\.occurrence, " @"\)/);
assert.match(content, /let item = exactOption\(\)/);
assert.match(content, /MENTION_MENU_OPEN_TIMEOUT = 3000/);
assert.match(content, /menuTimeout = kind === "image" \? 10000 : 8000/);
assert.match(content, /waitForOptional/);
assert.match(content, /insertTrustedTextAtCurrentCaret/);
assert.match(content, /insertTrustedTextAtCurrentCaret\(editor, " "\)/);
assert.match(content, /insertTrustedShiftAtCurrentCaret/);
assert.doesNotMatch(content, /insertTrustedTextAtCurrentCaret\(editor, " @"\)/);
assert.match(content, /TRUSTED_INSERT_TEXT/);
assert.match(content, /clickMentionOption/);
assert.match(content, /bringMentionOptionIntoView/);
assert.match(content, /MENTION_OPTION_SCROLL_MARGIN = 6/);
assert.match(content, /isRectVisibleThroughAncestors/);
assert.match(content, /isRectIntersectingViewport/);
assert.match(content, /getNearestMentionToolbarButton/);
assert.match(content, /open_mention_toolbar/);
assert.match(content, /item\.scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/);
assert.match(content, /isElementTopmost\(item, rect\)/);
assert.match(content, /intent: "select_mention"/);
assert.doesNotMatch(content, /item\.click\(\)/);
assert.match(content, /visibleMentionOptions\(\)\.length[\s\S]{0,140}MENTION_MENU_OPEN_TIMEOUT/);
assert.match(content, /未唤出资产库菜单，立即清理并重新 @/);
assert.match(content, /stopInheritedBusyState/);
assert.match(content, /isSendArrowButton/);
assert.match(content, /isStopButton/);
assert.match(content, /waitForFinalSendButton/);
assert.match(content, /stopBusyBeforeSend/);
assert.match(content, /return await stopBusyBeforeSend/);
assert.match(content, /第 \$\{attempts\} 次点击圆圈暂停/);
assert.match(content, /第 \$\{attempts\} 次暂停后仍是圆圈，继续暂停/);
assert.match(content, /return arrow/);
assert.match(content, /intent: "stop_before_send"/);
assert.match(content, /isTopmostSubmitControl/);
assert.match(content, /arrowStableSince/);
assert.match(content, /attachmentCount\(currentEditor\) === 0/);
assert.match(content, /dispatchFileBatch/);
assert.doesNotMatch(content, /serializedFiles\.slice\(accepted\)/);
assert.match(content, /for \(const item of items\)/);
assert.match(content, /transfer\.items\.add/);
assert.match(content, /getActiveFileInput/);
assert.match(content, /fileUpload: "\[class\*='reference-upload-'\]"/);
assert.match(content, /input\.closest\(SELECTORS\.fileUpload\)/);
assert.match(content, /正在等待即梦恢复上传位/);
assert.match(content, /等待上传位恢复超时/);
assert.match(content, /\(\) => getActiveFileInput\(editor\),\s*15000/);
assert.match(content, /input\.value = ""/);
assert.match(content, /waitForAttachmentBatch/);
assert.match(content, /readAttachmentTabCounts/);
assert.match(content, /"\[role='tablist'\]"/);
assert.match(content, /"button\[role='tab'\]"/);
assert.match(content, /BASELINE_EMPTY/);
assert.match(content, /BASELINE_CACHED/);
assert.match(content, /UNOBSERVABLE_AFTER_UPLOAD/);
assert.match(content, /INCOMPLETE_OBSERVED/);
assert.match(content, /无法确定具体文件/);
assert.match(content, /未补投且未点击发送/);
assert.match(content, /await sleep\(700\)/);
assert.doesNotMatch(content, /partitionFileAcceptance/);
assert.doesNotMatch(content, /missingImageKeys/);
assert.doesNotMatch(content, /reference-JihC4e/);
assert.doesNotMatch(content, /SELECTORS\.referenceGroup/);
assert.doesNotMatch(content, /--reference-count/);
assert.doesNotMatch(content, /hasUploadSlot/);
assert.match(content, /rollbackTrailingMentionText/);
assert.match(content, /insertMentionAttempt/);
assert.match(content, /ensureComposerExpandedForMention/);
assert.match(content, /collapsedComposerShell/);
assert.match(content, /intent: "expand_composer"/);
assert.match(content, /locking_retry/);
assert.match(content, /SUBJECT_MENTION_MAX_ATTEMPTS = 3/);
assert.match(content, /locking_skipped/);
assert.match(content, /主体库中未找到精确同名主体/);
assert.match(content, /placement\.required/);
assert.match(content, /已超过 \$\{SUBJECT_MENTION_MAX_ATTEMPTS\} 次，继续重试直至成功或主动暂停/);
assert.match(content, /第 \$\{attempt\} 次未生成\$\{kindLabel\}芯片/);
assert.doesNotMatch(content, /current\.innerHTML !== before\.buttonHtml/);
assert.doesNotMatch(content, /location\.href !== before\.url/);
assert.match(content, /intent: "stop_inherited"/);
assert.match(content, /writePromptWithInlineMentions/);
assert.match(content, /sort\(\(a, b\) => a\.end - b\.end\)/);
assert.match(content, /editorPromptText/);
assert.match(content, /contenteditable="false"/);
assert.match(content, /CHECK_SOURCE_CLEAN/);
assert.match(content, /PING_EXECUTOR/);
assert.match(content, /SCAN_SUBJECT_LIBRARY_V15/);
assert.match(content, /scanSubjectLibrary/);
assert.match(content, /roleBindings/);
assert.match(content, /绑定音频/);
assert.match(content, /probeSubjectLibrary/);
assert.match(content, /clearEditorContent/);
assert.match(content, /rich-placeholder-widget/);

const workbench = await readFile(resolve(root, "workbench.js"), "utf8");
assert.match(workbench, /runConnectorDiagnostic/);
assert.match(workbench, /CONNECTOR_CHECK_TIMEOUT_MS = 12000/);
assert.match(workbench, /CONNECTOR_CHECK_INTERVAL_MS = 500/);
assert.match(workbench, /connectorStage/);
assert.match(workbench, /握手诊断完成/);
assert.match(workbench, /握手诊断超时/);
assert.match(workbench, /promptIsFinal\s*:\s*true/);
assert.match(workbench, /bridgeProtocolVersion\s*:\s*1/);
assert.match(workbench, /source\s*:\s*'desktop-workbench'/);
assert.match(workbench, /shiftLockOffsets/);
assert.match(workbench, /const GROUP_INTERVAL_MS=0/);
assert.match(workbench, /上一组任务已确认，继续执行分镜/);
assert.doesNotMatch(workbench, /上一组真实积分扣费已确认/); // CDP confirmation does not claim a balance debit.
assert.match(content, /CREDIT_CONFIRM_INITIAL_DELAY_MS = 60_000/);
assert.match(content, /CREDIT_CONFIRM_POLL_INTERVAL_MS = 10_000/);
assert.match(content, /waitForReadableBackendCreditBalance/);
assert.match(content, /waitForCreditDeduction/);
assert.doesNotMatch(content, /本次消耗\\s\*/);

const desktopConnector = await readFile(resolve(root, "desktop-connector.js"), "utf8");
assert.match(desktopConnector, /MIN_EXECUTOR_VERSION = '0\.19\.0'/);
assert.match(desktopConnector, /executorVersionCompatible/);
assert.doesNotMatch(desktopConnector, /String\(response\?\.version \|\| ''\) ===/);

const worker = await readFile(resolve(root, "service-worker.js"), "utf8");
assert.doesNotMatch(worker, /message\?\.type === "JOB_STATUS"[\s\S]{0,160}sendMessage\(message\)/);
assert.match(worker, /Input\.dispatchMouseEvent/);
assert.match(worker, /Input\.insertText/);
assert.match(worker, /TRUSTED_INSERT_TEXT/);
assert.match(worker, /TRUSTED_SHIFT_AT/);
assert.match(worker, /Input\.dispatchKeyEvent/);
assert.match(worker, /mousePressed/);
assert.match(worker, /mouseReleased/);
assert.match(worker, /DEFAULT_INTERVAL_MS = 30 \* 1000/);
assert.match(worker, /TAB_LOAD_TIMEOUT_MS = 5 \* 60 \* 1000/);
assert.match(worker, /EXECUTOR_INITIAL_ATTEMPTS = 120/);
assert.match(worker, /EXECUTOR_RELOAD_ATTEMPTS = 360/);
assert.match(worker, /formatInterval\(waitMs\)/);
assert.match(worker, /return `\$\{Math\.round\(ms \/ 1000\)\} 秒`/);
assert.match(worker, /KEEP_ALIVE_INTERVAL_MS = 20 \* 1000/);
assert.match(worker, /await delayWithKeepAlive\(waitMs, controller\)/);
assert.match(worker, /runtime\.getPlatformInfo/);
assert.match(worker, /PAUSE_BATCH/);
assert.match(worker, /markRemainingPaused/);
assert.match(worker, /Promise\.race/);
assert.match(worker, /const outcome = await dispatchOne\(sourceTabId, job, useSourceTab\)/);
assert.match(worker, /reuseSourceTab/);
assert.match(worker, /reuseSourceTabFirst/);
assert.match(worker, /reuseSourceTabFirst && index === 0/);
assert.match(worker, /generatedTab: !reuseSourceTab/);
assert.match(worker, /stoppedOnFailure/);
assert.match(worker, /ensureExecutorReady/);
assert.match(worker, /waitForExecutorHandshake/);
assert.match(worker, /MAX_OPENED_AUTOMATION_TABS = 10/);
assert.match(worker, /GENERATED_TAB_STORAGE_KEY/);
assert.match(worker, /trackAndPruneGeneratedTab/);
assert.match(worker, /pruneGeneratedTabs/);
assert.match(worker, /await chrome\.tabs\.remove\(tabId\)/);
assert.match(worker, /清理只是性能保护/);
assert.match(worker, /EXECUTOR_VERSION = "0\.20\.3"/);
assert.match(worker, /compatibleExecutorVersion/);
assert.match(worker, /BRIDGE_PANEL_CONNECT/);
assert.match(worker, /connectBridgePanel/);
assert.match(worker, /OPEN_CONVERSATION_V15/);
assert.match(worker, /CHECK_SOURCE_CLEAN_V15/);
assert.doesNotMatch(worker, /CHECK_SOURCE_CLEAN_V13/);

const bridgePanel = await readFile(resolve(root, "bridge-panel.html"), "utf8");
const bridgePanelScript = await readFile(resolve(root, "bridge-panel.js"), "utf8");
assert.match(bridgePanel, /连接工作台/);
assert.match(bridgePanel, /即梦 Agent 对话/);
assert.match(bridgePanelScript, /BRIDGE_PANEL_CONNECT/);
assert.match(bridgePanelScript, /workbench\/bridge-status/);
assert.match(bridgePanel, /repairExtension/);
assert.match(bridgePanelScript, /chrome\.runtime\.reload\(\)/);
assert.doesNotMatch(worker, /response\?\.version === EXECUTOR_VERSION/);
assert.match(worker, /DESKTOP_CONNECTOR_PING/);
assert.match(worker, /verifyDesktopConnectorTab/);
assert.match(worker, /canvasReady/);
assert.match(worker, /PING_EXECUTOR_V15/);
assert.match(worker, /waitForPreviousVideoQueue/);
assert.match(worker, /GET_VIDEO_QUEUE_SNAPSHOT_V15/);
assert.match(worker, /dispatchTrustedDrag/);
assert.match(worker, /chrome\.tabs\.reload\(tabId\)/);
assert.match(worker, /isMissingReceiverError/);
assert.match(worker, /STAGE_FILE_BEGIN/);
assert.match(worker, /GET_STAGED_FILE_CHUNK/);
assert.match(worker, /releaseStagedFiles/);
assert.doesNotMatch(worker, /sendToTabWithRetry/);
assert.doesNotMatch(worker, /index \* 1500|Promise\.allSettled/);

const panel = await readFile(resolve(root, "sidepanel.html"), "utf8");
assert.match(panel, /batch-preview/);
assert.match(panel, /开始识别并加入分组队列/);
assert.match(panel, /asset-summary/);
assert.match(panel, /send-interval/);
assert.match(panel, /href="calibration\.html"/);
assert.doesNotMatch(panel, /batch-limit|本批任务上限/);
assert.match(panel, /min="30" max="1800"/);
assert.match(panel, /attachment-picker/);
assert.match(panel, /scene-folder-picker/);
assert.match(panel, /顺序复制标签并发送/);
assert.match(panel, /暂停当前重试及后续发送/);
assert.match(panel, /送达优先/);
assert.match(panel, /运行日志（默认隐藏/);
assert.match(panel, /log-output/);
assert.match(panel, /人物勾选决定主体 @/);
assert.match(panel, /scene-folder/);
assert.match(panel, /识别场景并匹配图片/);
assert.doesNotMatch(panel, /lock-subjects|lock-images/);
assert.ok(panel.indexOf('src="analyzer.js"') < panel.indexOf('src="sidepanel.js"'));
assert.ok(panel.indexOf('src="file-transfer.js"') < panel.indexOf('src="sidepanel.js"'));

const panelScript = await readFile(resolve(root, "sidepanel.js"), "utf8");
assert.match(panelScript, /const intervalSeconds = Math\.max\(30, Math\.min\(1800/);
assert.match(panelScript, /const batch = pending;/);
assert.doesNotMatch(panelScript, /pending\.slice|batchLimit|batch_limit/);
assert.match(panelScript, /intervalMs: intervalSeconds \* 1000/);
assert.doesNotMatch(panelScript, /intervalMinutes/);
assert.match(panelScript, /oldMinutes === 1 \? 30/);
assert.match(panelScript, /ui\.prompt\.addEventListener\("input", markUnrecognized\)/);
assert.match(panelScript, /ui\.add\.addEventListener\("click", addJob\)/);
assert.doesNotMatch(panelScript, /analyzePrompt|lock_subjects|lock_images/);
assert.match(panelScript, /selectedMentionCharacters/);
assert.match(panelScript, /autoSubjectPlans/);
assert.match(panelScript, /selectedMentionCharacters\.has\(assetKey\(name\)\)/);
assert.match(panelScript, /pauseBatch/);
assert.match(panelScript, /matchSceneAssets/);
assert.match(panelScript, /sceneLockPlan/);
assert.match(panelScript, /appendLog/);
assert.match(panelScript, /runLogs/);
assert.match(panelScript, /response\.stoppedOnFailure/);
assert.match(panelScript, /JimengFileTransfer\.stageFiles/);
assert.doesNotMatch(panelScript, /FileReader|base64:/);
assert.match(panelScript, /message\?\.type === "BATCH_LOG"/);
assert.match(panelScript, /本批遇到失败已立即停止/);

const analyzer = await readFile(resolve(root, "analyzer.js"), "utf8");
assert.match(analyzer, /parsePromptBatch/);
assert.match(analyzer, /promptLanguages/);
assert.match(analyzer, /duplicateCount/);
assert.match(analyzer, /analyzeAssets/);
assert.match(analyzer, /isLikelyGroupCharacter/);
assert.match(analyzer, /parseSceneEntries/);
assert.match(analyzer, /matchSceneFiles/);

console.log("[OK] extension manifest and safety invariants");
