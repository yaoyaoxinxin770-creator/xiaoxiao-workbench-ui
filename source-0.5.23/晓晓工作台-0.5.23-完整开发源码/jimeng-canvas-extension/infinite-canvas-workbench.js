(() => {
  const view = document.getElementById('infiniteCanvasView');
  if (!view) return;
  const bridge = window.desktopBridge;
  const frame = document.getElementById('icFrame');
  const state = document.getElementById('icState');
  const message = document.getElementById('icMessage');
  const retry = document.getElementById('icRetry');
  let connecting = false;
  let loaded = false;

  async function connect(reload = false) {
    if (connecting || (loaded && !reload)) return;
    connecting = true;
    retry.disabled = true;
    state.textContent = '正在启动';
    message.hidden = false;
    message.textContent = '正在连接本地无限画布…';
    try {
      if (!bridge?.infiniteCanvasStart) throw new Error('请使用新版晓晓工作台打开无限画布。');
      const result = await bridge.infiniteCanvasStart();
      if (!result?.ok) throw new Error(result?.error || '无限画布服务尚未就绪');
      const url = new URL(result.url);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('无限画布地址必须是本机服务。');
      frame.src = url.href;
      state.textContent = `本地运行 · v${result.version}`;
      frame.hidden = false;
      loaded = true;
    } catch (error) {
      state.textContent = '未连接';
      message.textContent = error.message;
      frame.hidden = true;
      loaded = false;
    } finally {
      connecting = false;
      retry.disabled = false;
    }
  }
  frame.addEventListener('load', () => { if (loaded) message.hidden = true; });
  retry.onclick = () => connect(true);
  document.getElementById('icOpenData').onclick = async () => {
    try {
      const result = await bridge?.infiniteCanvasOpenDataDir?.();
      if (!result?.ok) throw new Error(result?.error || '无法打开本地数据目录');
    } catch (error) { message.hidden = false; message.textContent = error.message; }
  };
  window.addEventListener('infinite-canvas:scene-shown', async () => {
    if (loaded) {
      const status = await bridge?.infiniteCanvasStatus?.().catch(() => null);
      if (!status?.ok) loaded = false;
    }
    await connect();
  });
})();
