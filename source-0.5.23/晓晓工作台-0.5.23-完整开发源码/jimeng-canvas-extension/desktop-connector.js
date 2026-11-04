// Desktop workbench bridge. This file is deliberately small: the existing
// Jimeng executor remains the source of truth for upload/calibration/send.
(() => {
  const CANVAS_PREFIX = 'https://jimeng.jianying.com/ai-tool/canvas/';
  // Patch releases keep the same desktop bridge protocol.  Accept a newer
  // executor within this line so a content/service-worker fix does not leave
  // the already-open workbench bridge reporting a false version mismatch.
  const MIN_EXECUTOR_VERSION = '0.19.0';
  const executorVersionCompatible = (version) => {
    const parse = (value) => String(value || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
    const current = parse(version), required = parse(MIN_EXECUTOR_VERSION);
    for (let index = 0; index < Math.max(current.length, required.length); index += 1) {
      if ((current[index] || 0) !== (required[index] || 0)) {
        return (current[index] || 0) > (required[index] || 0);
      }
    }
    return Boolean(version);
  };
  const DESKTOP_BRIDGE_SOURCE = 'desktop-workbench';
  const DESKTOP_BRIDGE_PROTOCOL_VERSION = 1;
  if (!location.href.startsWith(CANVAS_PREFIX)) return;
  let busy = false;
  let reloadScheduled = false;
  let runtimeFailureCount = 0;
  const connectorId = sessionStorage.getItem('jimeng-desktop-connector-id') || crypto.randomUUID();
  const RAW_CHUNK_BYTES = 2 * 1024 * 1024;
  sessionStorage.setItem('jimeng-desktop-connector-id', connectorId);
  const post = (path, payload) => fetch(`http://127.0.0.1:17842${path}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  const report = (payload) => post('/workbench/result', {...payload, connectorId}).catch(() => {});
  const errorText = error => String(error?.message || error || '');
  const isContextInvalidated = error => /Extension context invalidated|extension context was invalidated/i.test(errorText(error));
  const scheduleReload = () => {
    if (reloadScheduled) return;
    reloadScheduled = true;
    // A stale content script cannot talk to the new MV3 service worker. A
    // normal page reload injects a fresh connector and executor; the broker
    // keeps any claimed command available for that fresh connector.
    setTimeout(() => {
      try { location.reload(); } catch (_) {}
    }, 250);
  };
  const runtimeHealth = async () => {
    try {
      if (!chrome?.runtime?.id) throw new Error('扩展上下文不可用');
      // Ask the service worker to probe the executor in this exact tab. A
      // localhost heartbeat by itself can survive an extension reload while
      // the old page context can no longer call chrome.runtime.
      const response = await chrome.runtime.sendMessage({type:'DESKTOP_CONNECTOR_PING'});
      const versionMatches = executorVersionCompatible(response?.version);
      const executorReady = Boolean(response?.ok && response?.ready && response?.executorReady && versionMatches);
      const canvasReady = Boolean(response?.canvasReady && versionMatches);
      runtimeFailureCount = executorReady && canvasReady ? 0 : runtimeFailureCount + 1;
      return {
        runtimeReady:true,
        executorReady,
        canvasReady,
        executorVersion:String(response?.version || ''),
        executorError:executorReady && canvasReady ? '' : String(response?.error || (versionMatches ? '画布执行器尚未完成初始化' : `扩展版本不匹配，最低需要 ${MIN_EXECUTOR_VERSION}`)),
        tabId:Number.isInteger(response?.tabId) ? response.tabId : null,
      };
    } catch (error) {
      runtimeFailureCount += 1;
      const message = errorText(error);
      if (isContextInvalidated(error)) scheduleReload();
      return {runtimeReady:false, executorReady:false, canvasReady:false, executorVersion:'', executorError:message, tabId:null};
    }
  };
  // The broker prunes any connector it has not seen for CONNECTOR_TTL_MS.
  // One group keeps `busy` set for minutes: the executor reads the balance,
  // sends, waits 60 seconds and then polls the real backend balance every 10
  // seconds.  The heartbeat therefore must not sit behind the `busy` guard —
  // doing so deregistered this tab a few seconds into every send, so the next
  // group failed with "未检测到即梦画布连接器" in the same second the previous
  // debit was confirmed.  Claiming stays behind `busy`; only the heartbeat is
  // free-running, and the broker still refuses to hand out a second command
  // while one is pending.
  //
  // Presence and health are two different questions and must not share a lock.
  // `runtimeHealth` asks the MV3 service worker to probe this tab, and that
  // call can hang for a minute when Chrome is tearing the worker down.  An
  // earlier revision guarded the whole heartbeat with a single in-flight flag,
  // so one hung probe silenced presence for its entire duration: the broker saw
  // no POST at all, pruned the connector, and the tab was only reachable for
  // the five seconds after each probe finally returned.
  //
  // So: presence is posted every tick from the last known health, the probe
  // refreshes that health on its own lock with its own timeout, and the payload
  // carries how stale the health is.  The broker — not this page — decides that
  // stale health means unverified, which keeps the original safety property
  // (never claim work on an unproven executor) without ever going silent.
  const HEALTH_TIMEOUT_MS = 3000;
  const blankHealth = {runtimeReady:false, executorReady:false, canvasReady:false, executorVersion:'', executorError:'', tabId:null};
  let lastHealth = blankHealth;
  let healthInFlight = false;
  let lastHealthProbeMs = 0;
  let lastHealthAt = 0;
  const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`扩展健康探测超过 ${Math.round(ms / 1000)} 秒未返回`)), ms);
    promise.then(value => {clearTimeout(timer); resolve(value);}, error => {clearTimeout(timer); reject(error);});
  });
  const refreshHealth = async () => {
    if (healthInFlight) return lastHealth;
    healthInFlight = true;
    const startedAt = Date.now();
    try {
      lastHealth = await withTimeout(runtimeHealth(), HEALTH_TIMEOUT_MS);
      lastHealthAt = Date.now();
      return lastHealth;
    } catch (error) {
      // A slow or hung worker leaves the previous health in place; it ages out
      // on the broker side.  Never let it stop the presence heartbeat.
      lastHealth = {...lastHealth, executorError:errorText(error)};
      return lastHealth;
    } finally {
      lastHealthProbeMs = Date.now() - startedAt;
      healthInFlight = false;
    }
  };
  const heartbeat = async ({refresh = true} = {}) => {
    if (refresh) refreshHealth().catch(() => {});
    const health = lastHealth;
    const result = await post('/workbench/connector', {
      id:connectorId,
      url:location.href,
      title:document.title,
      visible:document.visibilityState === 'visible',
      focused:document.hasFocus(),
      ...health,
      healthProbeMs:lastHealthProbeMs,
      healthAgeMs:lastHealthAt ? Date.now() - lastHealthAt : null,
    }).then(response => response.json().catch(() => ({}))).catch(() => ({}));
    return {...health, broker:result};
  };
  const requeueCommand = (command, reason) => post('/workbench/requeue', {
    id:command?.id,
    connectorId,
    reason:errorText(reason),
  }).catch(() => {});
  const blobToBase64 = async blob => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };
  async function stageLocalFiles(commandId, files) {
    const descriptors = [];
    const transferIds = [];
    try {
      for (const [index, source] of (files || []).entries()) {
        const response = await fetch(`http://127.0.0.1:17842/workbench/file?commandId=${encodeURIComponent(commandId)}&index=${index}`, {cache:'no-store'});
        if (!response.ok) throw new Error(`无法从项目读取素材：${source.relativePath || source.name || index}`);
        const blob = await response.blob();
        const transferId = crypto.randomUUID();
        const totalChunks = Math.ceil(blob.size / RAW_CHUNK_BYTES);
        const descriptor = {
          name:source.name || String(source.relativePath || '').split(/[\\/]/).pop() || `素材-${index + 1}`,
          originalName:source.originalName || String(source.relativePath || '').split(/[\\/]/).pop() || source.name,
          type:source.type || blob.type || 'application/octet-stream',
          lastModified:Number(source.lastModified) || Date.now(),
          size:blob.size,
          transferId,
          totalChunks,
          roleBindings:Array.isArray(source.roleBindings) ? source.roleBindings : [],
        };
        const begin = await chrome.runtime.sendMessage({type:'STAGE_FILE_BEGIN', file:descriptor});
        if (!begin?.ok) throw new Error(begin?.error || `无法准备素材“${descriptor.name}”`);
        transferIds.push(transferId);
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
          const chunk = blob.slice(chunkIndex * RAW_CHUNK_BYTES, Math.min(blob.size, (chunkIndex + 1) * RAW_CHUNK_BYTES));
          const result = await chrome.runtime.sendMessage({type:'STAGE_FILE_CHUNK', transferId, chunkIndex, base64:await blobToBase64(chunk)});
          if (!result?.ok) throw new Error(result?.error || `素材“${descriptor.name}”传输失败`);
        }
        const finish = await chrome.runtime.sendMessage({type:'STAGE_FILE_FINISH', transferId});
        if (!finish?.ok) throw new Error(finish?.error || `素材“${descriptor.name}”校验失败`);
        descriptors.push(descriptor);
      }
      return descriptors;
    } catch (error) {
      if (transferIds.length) {
        try { await chrome.runtime.sendMessage({type:'RELEASE_STAGED_FILES', transferIds}); } catch (_) {}
      }
      throw error;
    }
  }
  const poll = async () => {
    if (busy) return;
    try {
      // Refresh first so a claim is never made on stale health, then post
      // presence with that fresh result.  The standalone heartbeat interval
      // covers the window where this function returns early because `busy`.
      const connection = await refreshHealth();
      await heartbeat({refresh:false});
      if (!connection.runtimeReady || !connection.executorReady || !connection.canvasReady) return;
      const response = await fetch(`http://127.0.0.1:17842/workbench/poll?connectorId=${encodeURIComponent(connectorId)}`, {cache:'no-store'});
      const command = await response.json();
      if (!command?.id || !command.payload) return;
      busy = true;
      const payload = command.payload || {};
      const segment = payload.segment || {};
      // Prompt text and asset choices are authored in the desktop workbench.
      // Preserve the protocol markers all the way to the page executor so it
      // can distinguish a final prompt from legacy side-panel jobs.
      const source = String(payload.source || segment.source || '');
      const bridgeProtocolVersion = Number(
        payload.bridgeProtocolVersion ?? segment.bridgeProtocolVersion ?? 0,
      );
      const promptIsFinal = (payload.promptIsFinal === true || segment.promptIsFinal === true) &&
        source === DESKTOP_BRIDGE_SOURCE &&
        bridgeProtocolVersion === DESKTOP_BRIDGE_PROTOCOL_VERSION;
      const job = {
        ...segment,
        id: segment.id || `desktop-${command.id}`,
        label: segment.name || segment.id || `桌面任务 ${command.id}`,
        prompt: segment.prompt || '',
        prefix: payload.mode === 'queue' ? (segment.prefix || payload.prefix || '') : (segment.prefix || payload.draftPrefix || ''),
        files: segment.files || [],
        characters: segment.characters || [],
        lockedSubjects: segment.lockedSubjects || [],
        lockedImages: segment.lockedImages || [],
        lockedAudio: segment.lockedAudio || [],
        audioIntroMode: Boolean(segment.audioIntroMode),
        source,
        bridgeProtocolVersion,
        promptIsFinal,
      };
      let runtimeMessageReturned = false;
      try {
        if (payload.action !== 'pause' && payload.localFiles?.length) {
          job.files = [...job.files, ...await stageLocalFiles(command.id, payload.localFiles)];
        }
        const message = payload.action === 'pause'
          ? {type:'PAUSE_BATCH', batchId: payload.batchId}
          // Do not forward a workbench-provided tab id. Sending from this content
          // script lets the service worker use sender.tab.id, which is the exact
          // numeric Chrome tab that claimed the command.
          : {
            type:'START_BATCH',
            batchId:`desktop-${command.id}`,
            source,
            bridgeProtocolVersion: Number.isFinite(bridgeProtocolVersion)
              ? bridgeProtocolVersion : 0,
            promptIsFinal,
            jobs:[job],
            reuseSourceTab:true,
          };
        // If the API call itself throws synchronously, no message was handed
        // to the service worker and the command can be safely requeued.  If a
        // Promise was returned and only its response later fails, the worker
        // may already have clicked Send, so that outcome remains terminal.
        const responsePromise = chrome.runtime.sendMessage(message);
        runtimeMessageReturned = true;
        const result = await responsePromise;
        const failed = payload.action !== 'pause' && result?.ok &&
          (result.stoppedOnFailure || result.paused || result.accepted !== 1);
        await report({id:command.id, ...(failed
          ? {...result, ok:false, code:'EXECUTOR_NOT_COMPLETED', error:result.error || '画布执行未完成，已停止本批次；请检查附件上传和 @ 校准结果，不要重复点击发送。'}
          : result || {ok:false, code:'EXECUTOR_NO_RESPONSE', error:'扩展执行器没有返回结果'})});
      } catch (error) {
        if (isContextInvalidated(error) && !runtimeMessageReturned) {
          // The extension was reloaded while this command was being staged or
          // dispatched. Keep the workbench request pending, reload the page,
          // and let the freshly injected connector claim it again.
          await requeueCommand(command, error);
          scheduleReload();
          return;
        }
        if (isContextInvalidated(error)) {
          await report({
            id:command.id,
            ok:false,
            code:'EXECUTOR_CONTEXT_LOST_AFTER_DISPATCH',
            error:'扩展上下文在正式任务交接后失效；为避免重复发送，本次结果不自动重试，请先确认画布状态后再执行。',
          });
          return;
        }
        await report({id:command.id, ok:false, code:'EXECUTOR_MESSAGE_FAILED', error:errorText(error)});
      } finally {
        busy = false;
      }
    } catch (error) {
      if (isContextInvalidated(error)) scheduleReload();
    }
  };
  setInterval(() => { heartbeat().catch(() => {}); }, 1000);
  setInterval(poll, 1000);
  poll();
})();
