(() => {
  const $ = (selector) => document.querySelector(selector);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let connecting = false;
  $('#version').textContent = `v${chrome.runtime.getManifest().version} · 只负责连接与执行`;

  async function desktopStatus() {
    try {
      const response = await fetch('http://127.0.0.1:17842/workbench/bridge-status', {cache:'no-store'});
      if (!response.ok) throw new Error(`本地服务返回 ${response.status}`);
      return await response.json();
    } catch (error) {
      return {workbenchReady:false, online:false, error:String(error?.message || error)};
    }
  }

  async function extensionStatus(type = 'BRIDGE_PANEL_STATUS') {
    try {
      return await chrome.runtime.sendMessage({type});
    } catch (error) {
      return {ok:false, ready:false, executorReady:false, canvasReady:false,
        error:String(error?.message || error)};
    }
  }

  function step(node, ready, pending, readyText, errorText) {
    node.className = `step ${ready ? 'ready' : (pending ? '' : 'error')}`;
    node.querySelector('span').textContent = ready ? readyText : errorText;
  }

  function render(desktop, browser) {
    const desktopReady = desktop.workbenchReady === true;
    const executorReady = browser.executorReady === true;
    const canvasReady = browser.canvasReady === true;
    const connected = desktopReady && desktop.online === true && browser.ready === true;
    step($('#desktopStep'), desktopReady, false, '本地工作台服务已启动', '桌面工作台未启动');
    step($('#executorStep'), executorReady, browser.foundCanvas && !executorReady,
      `执行器 ${browser.version || chrome.runtime.getManifest().version} 已加载`,
      browser.foundCanvas ? '画布执行器尚未加载' : '没有找到即梦画布');
    step($('#canvasStep'), canvasReady, executorReady && !canvasReady,
      browser.mode === 'canvas' ? '中央画布输入框可执行' : '右侧 Agent 对话可执行',
      executorReady ? '右侧 Agent 对话尚未就绪' : '等待浏览器插件');
    const overall = $('#overall');
    overall.className = `overall ${connected ? 'ready' : (connecting ? 'checking' : 'error')}`;
    $('#overallTitle').textContent = connected ? '已连接工作台，可以执行' :
      (connecting ? '正在建立三方连接' : '尚未连接工作台');
    $('#overallDetail').textContent = connected
      ? (browser.title || browser.url || '当前即梦画布已绑定')
      : (!desktopReady ? '请先启动桌面工作台' : (browser.error || desktop.error || '点击下方按钮建立连接'));
    $('#connect').textContent = connected ? '✓ 已连接，重新检查' : (connecting ? '正在连接…' : '连接工作台');
    $('#connect').classList.toggle('connected', connected);
    if (!connecting) $('#connect').disabled = false;
    const diagnostic = $('#diagnostic');
    diagnostic.hidden = !(browser.error && !connected);
    diagnostic.textContent = browser.error || '';
    const mixedVersion = !connected && /版本|version/i.test(String(browser.error || ''));
    $('#repairExtension').hidden = !mixedVersion;
    return connected;
  }

  async function refresh() {
    const [desktop, browser] = await Promise.all([desktopStatus(), extensionStatus()]);
    render(desktop, browser);
    return {desktop, browser};
  }

  $('#connect').onclick = async () => {
    if (connecting) return;
    connecting = true;$('#connect').disabled = true;
    let current = await refresh();
    if (!current.desktop.workbenchReady) {
      connecting = false;render(current.desktop, current.browser);return;
    }
    const connected = await extensionStatus('BRIDGE_PANEL_CONNECT');
    for (let attempt = 0; attempt < 24; attempt += 1) {
      current = await refresh();
      if (current.desktop.online && current.browser.ready) break;
      await sleep(500);
    }
    connecting = false;
    if (!current.browser.ready && connected?.error) current.browser.error = connected.error;
    render(current.desktop, current.browser);
  };
  $('#focusCanvas').onclick = async () => {
    const result = await extensionStatus('BRIDGE_PANEL_FOCUS');
    if (!result.foundCanvas) render(await desktopStatus(), result);
  };
  $('#repairExtension').onclick = () => {
    $('#repairExtension').disabled = true;
    $('#repairExtension').textContent = '正在重载插件…';
    chrome.runtime.reload();
  };
  $('#openWorkbench').onclick = () => chrome.tabs.create({url:'http://127.0.0.1:17842/workbench'});
  refresh();
  setInterval(() => { if (!connecting) refresh(); }, 2000);
})();
