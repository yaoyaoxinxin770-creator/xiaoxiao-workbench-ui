const CONNECTOR_TTL_MS = 5000;
// The page posts presence every second even while its health probe is slow or
// hung, so "still posting" no longer implies "executor proven alive".  The
// payload carries how old the last successful probe is and the decision stays
// here: presence keeps the row, stale health drops it to unverified.  That way
// a struggling tab stays visible and diagnosable instead of vanishing, and work
// is still never dispatched to an unproven executor.
const MAX_HEALTH_AGE_MS = 15000;
// 窗口最小化或标签页切到后台时，Chrome 会把页面里的定时器压到每分钟一次，
// 心跳和健康探测都跟着变慢。用前台的 5 秒去判定就会立刻判成离线——这正是
// “挂着去做别的事，回来发现断联”的原因。
//
// 心跳里带了页面是否可见。可见时保持 5 秒，能最快发现标签页被关掉；不可见时
// 放宽到 90 秒，足够等过一个节流周期。放宽只影响“多久算掉线”，不影响“有没有
// 验证过”：执行器仍然必须自证就绪，未验证的连接器照样不会被派发任务。
const HIDDEN_CONNECTOR_TTL_MS = 90_000;
const HIDDEN_MAX_HEALTH_AGE_MS = 90_000;
const ttlFor = connector => connector?.visible ? CONNECTOR_TTL_MS : HIDDEN_CONNECTOR_TTL_MS;
const healthAgeLimitFor = connector => connector?.visible ? MAX_HEALTH_AGE_MS : HIDDEN_MAX_HEALTH_AGE_MS;
// A dispatched task now remains open until the Jimeng backend balance proves
// the debit. A slow debit must not be converted into a false delivery failure.
const EXECUTION_TIMEOUT_MS = 0;
const CANVAS_PREFIX = 'https://jimeng.jianying.com/ai-tool/canvas/';

class ConnectorBroker {
  constructor({now = () => Date.now(), timeoutMs = EXECUTION_TIMEOUT_MS} = {}) {
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.connectors = new Map();
    this.pending = null;
  }

  heartbeat(value = {}) {
    const id = String(value.id || '').trim().slice(0, 128);
    const url = String(value.url || '');
    if (!id || !url.startsWith(CANVAS_PREFIX)) {
      return {ok:false, error:'连接器身份或即梦页面地址无效'};
    }
    const connector = {
      id,
      url,
      title:String(value.title || '').slice(0, 200),
      visible:Boolean(value.visible),
      focused:Boolean(value.focused),
      // A page heartbeat alone is not enough to prove that the extension
      // content script can receive a task. The browser connector reports
      // runtime, executor and canvas readiness after a tab-scoped probe.
      // Every current connector must provide all three explicit flags before
      // it can claim work.  Treating an omitted flag as ready would allow a
      // stale pre-health content script to survive an extension reload and
      // reproduce "Extension context invalidated" at dispatch time.
      runtimeReady:value.runtimeReady === true,
      executorReady:value.executorReady === true,
      canvasReady:value.canvasReady === true,
      executorVersion:String(value.executorVersion || '').slice(0, 32),
      executorError:String(value.executorError || '').slice(0, 240),
      tabId:Number.isInteger(Number(value.tabId)) ? Number(value.tabId) : null,
      // Older connectors do not report these; treat a missing age as fresh so
      // they keep behaving exactly as before.
      healthAgeMs:Number.isFinite(Number(value.healthAgeMs)) ? Number(value.healthAgeMs) : null,
      healthProbeMs:Number.isFinite(Number(value.healthProbeMs)) ? Number(value.healthProbeMs) : null,
      lastSeen:this.now(),
    };
    connector.healthFresh = connector.healthAgeMs === null || connector.healthAgeMs <= healthAgeLimitFor(connector);
    connector.verified = connector.runtimeReady && connector.executorReady &&
      connector.canvasReady && Number.isInteger(connector.tabId) && connector.healthFresh;
    if (!connector.healthFresh && !connector.executorError) {
      connector.executorError = `扩展健康探测已有 ${Math.round(connector.healthAgeMs / 1000)} 秒没有成功返回；画布仍在上报存活，但执行器状态无法确认`;
    }
    this.connectors.set(id, connector);
    this.prune();
    return {ok:true, selected:this.preferred()?.id === id};
  }

  prune() {
    // 每条连接器用自己的存活窗口：前台 5 秒、后台 90 秒。窗口最小化时页面定时器
    // 被 Chrome 压到每分钟一次，用前台的判定会直接把它判成掉线。
    const now = this.now();
    for (const [id, connector] of this.connectors) {
      if (now - connector.lastSeen > ttlFor(connector)) this.connectors.delete(id);
    }
  }

  preferred() {
    this.prune();
    const all = [...this.connectors.values()];
    // Prefer a connector that has proved the content executor is alive.  If
    // every connector is still warming up, retain the best candidate so the
    // status response can explain why it is not ready yet.
    const ready = all.filter(item => item.verified === true);
    const candidates = ready.length ? ready : all;
    return candidates.sort((a, b) => {
      const score = item =>
        (item.url.includes('/ai-tool/canvas/') ? 4 : 0) +
        (item.focused ? 2 : 0) +
        (item.visible ? 1 : 0);
      return score(b) - score(a) || b.lastSeen - a.lastSeen;
    })[0] || null;
  }

  status() {
    const connector = this.preferred();
    const online = Boolean(connector && connector.verified === true);
    return connector
      ? {
        ok:true,
        online,
        verified:connector.verified === true,
        runtimeReady:connector.runtimeReady === true,
        executorReady:connector.executorReady === true,
        canvasReady:connector.canvasReady === true,
        count:this.connectors.size,
        connector:{
          url:connector.url,
          title:connector.title,
          focused:connector.focused,
          runtimeReady:connector.runtimeReady === true,
          executorReady:connector.executorReady === true,
          canvasReady:connector.canvasReady === true,
          verified:connector.verified === true,
          tabId:connector.tabId,
          executorVersion:connector.executorVersion,
          executorError:connector.executorError,
          healthFresh:connector.healthFresh !== false,
          visible:connector.visible === true,
          ttlMs:ttlFor(connector),
          healthAgeMs:connector.healthAgeMs,
          healthProbeMs:connector.healthProbeMs,
        },
        error:online ? null : (connector.executorError || '即梦画布连接尚未完成验证（需要扩展、执行器和画布三方握手）'),
      }
      : {ok:true, online:false, verified:false, runtimeReady:false, executorReady:false, canvasReady:false, count:0, error:'未检测到即梦画布连接器'};
  }

  execute(payload) {
    if (this.pending) {
      return Promise.resolve({ok:false, code:'CHROME_CONNECTOR_BUSY', error:'已有任务正在等待即梦画布处理'});
    }
    const connector = this.preferred();
    if (!connector) {
      return Promise.resolve({ok:false, code:'CHROME_CONNECTOR_OFFLINE', error:'未检测到即梦画布连接器，请先打开即梦画布并确认扩展已加载。'});
    }
    if (connector.verified !== true) {
      return Promise.resolve({ok:false, code:'CHROME_CONNECTOR_UNVERIFIED', error:connector.executorError || '即梦画布连接尚未完成验证；请等待连接状态变为“已连接”，再执行任务。'});
    }
    return new Promise(resolve => {
      const command = {id:this.now().toString(36), payload, connectorId:connector.id};
      const timer = this.timeoutMs > 0 ? setTimeout(() => {
        if (this.pending?.command.id !== command.id) return;
        this.pending = null;
        resolve({ok:false, code:'CHROME_CONNECTOR_TIMEOUT', error:`即梦画布任务在 ${Math.round(this.timeoutMs / 1000)} 秒内没有返回结果；提交状态未知，请核对本次扣费记录后再重试`});
      }, this.timeoutMs) : null;
      this.pending = {command, resolve, timer, delivered:false};
    });
  }

  poll(connectorId) {
    const id = String(connectorId || '');
    const connector = this.connectors.get(id);
    if (!this.pending || this.pending.command.connectorId !== id || this.pending.delivered || connector?.verified !== true) return {id:null};
    this.pending.delivered = true;
    return {id:this.pending.command.id, payload:this.pending.command.payload};
  }

  // A command can be claimed by a connector and then lose its extension
  // context (for example when Chrome reloads the MV3 extension).  In that
  // case the old page cannot finish the command, but the task must remain
  // available to the freshly injected connector after a page reload.
  requeue(value = {}) {
    if (!this.pending || String(value.id || '') !== this.pending.command.id ||
        String(value.connectorId || '') !== this.pending.command.connectorId) {
      return {ok:false, error:'连接器任务已失效或不属于当前连接器'};
    }
    this.pending.delivered = false;
    this.pending.requeues = Number(this.pending.requeues || 0) + 1;
    this.pending.lastRequeueReason = String(value.reason || '').slice(0, 240);
    return {ok:true, requeued:true, attempt:this.pending.requeues};
  }

  fileFor(commandId, rawIndex) {
    if (!this.pending || String(commandId || '') !== this.pending.command.id) return null;
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0) return null;
    const descriptor = this.pending.command.payload?.localFiles?.[index];
    if (!descriptor || typeof descriptor.root !== 'string' || typeof descriptor.relativePath !== 'string') return null;
    return descriptor;
  }

  // Stopping a batch used to abandon the pending promise without clearing it.
  // Because EXECUTION_TIMEOUT_MS is 0 nothing ever resolved it, so the broker
  // stayed busy forever and every later run failed with
  // "已有任务正在等待即梦画布处理" until the workbench was restarted.
  // Cancelling resolves the waiter and frees the slot.
  cancel(value = {}) {
    if (!this.pending) return {ok:true, cancelled:false};
    const {resolve, timer, command, delivered} = this.pending;
    this.pending = null;
    clearTimeout(timer);
    resolve({
      ok:false,
      code:'CANCELLED_BY_USER',
      cancelled:true,
      delivered:delivered === true,
      error:delivered
        ? '已按你的要求停止；这一组已经交给即梦画布，提交状态未知，请核对扣费后再决定是否重发'
        : '已按你的要求停止；这一组尚未交给即梦画布，没有产生扣费',
      reason:String(value.reason || '').slice(0, 240),
    });
    return {ok:true, cancelled:true, commandId:command.id, delivered:delivered === true};
  }

  complete(value = {}) {
    if (!this.pending || String(value.id || '') !== this.pending.command.id) return false;
    const {resolve, timer} = this.pending;
    this.pending = null;
    clearTimeout(timer);
    const result = {...value};
    delete result.id;
    resolve(result);
    return true;
  }
}

module.exports = {ConnectorBroker, CONNECTOR_TTL_MS};
