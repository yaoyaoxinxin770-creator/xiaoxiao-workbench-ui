(() => {
  if (!window.WorkbenchBatch) {
    const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitBetweenGroups = async ({delayMs, sleep=defaultSleep, isPaused=()=>false, isStopped=()=>false, pausePollMs=250}) => {
      let remaining=Math.max(0,Number(delayMs)||0);
      while(remaining>0){if(isStopped())return false;if(isPaused()){await sleep(pausePollMs);continue;}const step=Math.min(1000,remaining);await sleep(step);remaining-=step;}
      return !isStopped();
    };
    const runSequentialBatch = async ({items,execute,delayMs=60_000,sleep=defaultSleep,isPaused=()=>false,isStopped=()=>false,onWaiting=()=>{}}) => {
      const queue=[...(items||[])];let completed=0;
      for(let position=0;position<queue.length;position+=1){if(isStopped())return {ok:false,stopped:true,completed};while(isPaused()&&!isStopped())await sleep(250);if(isStopped())return {ok:false,stopped:true,completed};const outcome=await execute(queue[position],position,queue.length);if(!outcome?.ok)return {ok:false,stoppedOnFailure:true,completed,outcome};completed+=1;if(position<queue.length-1){onWaiting(queue[position+1],delayMs,position+1,queue.length);if(!await waitBetweenGroups({delayMs,sleep,isPaused,isStopped}))return {ok:false,stopped:true,completed};}}
      return {ok:true,completed};
    };
    // The canvas connector can disappear for a few seconds between two groups
    // (service worker restart, extension reload and page reinjection, tab
    // switch).  One failed probe must not abort a batch that has already been
    // paid for, so wait out a short outage before giving up.  A healthy canvas
    // resolves on the first probe and adds no delay.
    const waitForCanvasConnection = async ({check,timeoutMs=30_000,pollMs=1000,sleep=defaultSleep,isStopped=()=>false,onRetry=()=>{}}) => {
      let waited=0;let last=await check();
      if(last?.ok)return last;
      while(waited<Math.max(0,Number(timeoutMs)||0)){
        if(isStopped())return {...last,ok:false,stopped:true};
        onRetry(last||{});
        await sleep(pollMs);waited+=pollMs;
        if(isStopped())return {...last,ok:false,stopped:true};
        last=await check();
        if(last?.ok)return last;
      }
      return {...last,ok:false};
    };
    window.WorkbenchBatch={runSequentialBatch,waitBetweenGroups,waitForCanvasConnection};
  }
  if (window.desktopBridge) return;
  const endpoint = 'http://127.0.0.1:17842/workbench/api';
  let online = false;

  async function request(method, args = []) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({method, args}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `本地工作台服务返回 ${response.status}`);
    online = true;
    return payload.result;
  }

  const methods = [
    'infiniteCanvasStart', 'infiniteCanvasStatus', 'infiniteCanvasOpenDataDir',
    'cdpSettings','cdpConfigure','cdpTargets','cdpLaunch','cdpOpenAndConnect','cdpRecover','cdpAcknowledge',
    'chooseFiles', 'chooseDirectory', 'createJimengProject', 'scanProject', 'saveProject', 'scanProjectsRoot',
    'inspectProject', 'readProject', 'readRecent', 'writeRecent', 'readDraft',
    'readDocument', 'readRuns', 'groupCharacters', 'listAssets', 'connectorStatus', 'execute', 'cancelExecution',
    'assetList', 'assetEdit', 'assetBind', 'assetBindCharacter', 'assetBindSegmentAudio', 'assetAudioPreview', 'assetImport',
    'assetImportPaths', 'assetLinkPaths', 'assetDelete', 'assetThumb', 'assetFullImage',
    'typetaleReadState', 'typetaleWriteState', 'typetaleScanPlugins', 'typetaleChoosePluginDir',
    'typetaleInspectPlugin', 'typetaleReadPluginConfig', 'typetaleWritePluginConfig',
    'typetaleListModelFamilies', 'typetaleValidateModelFamily',
    'typetaleExecute', 'typetaleQueryVideo', 'typetaleDownloadResult', 'typetaleOpenPath', 'typetaleOpenOutputDir',
  ];
  const bridge = {isDesktop: true, isBrowserClient: true};
  for (const method of methods) bridge[method] = (...args) => request(method, args);
  bridge.ping = async () => {
    try { await request('ping'); return true; } catch (_) { return false; }
  };
  bridge.isOnline = () => online;
  window.desktopBridge = bridge;

  window.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('bridgeStatus');
    if (!status) return;
    if (await bridge.ping()) {
      // The local HTTP service being reachable does not mean the Chrome
      // canvas executor is ready.  Let the same verified handshake used by
      // workbench.js determine the initial label so the UI never claims a
      // usable canvas merely because Electron/localhost is alive.
      const result = await bridge.connectorStatus().catch(() => null);
      const verified = Boolean(result?.online && result?.verified &&
        result?.runtimeReady && result?.executorReady && result?.canvasReady);
      status.textContent = verified ? '已验证连接即梦画布' :
        (result?.connector ? '正在验证即梦画布' : '未连接即梦画布');
      status.className = 'connection' + (verified ? '' : ' offline');
      status.title = verified
        ? (result.connector?.title || result.connector?.url || '即梦画布三方握手已完成')
        : (result?.error || '请打开即梦画布并重新加载当前版本扩展');
    } else {
      status.textContent = '桌面工作台未启动';
      status.className = 'connection offline';
      status.title = '请先启动“即梦批量投放工作台”，再刷新此页面';
    }
  });
})();
