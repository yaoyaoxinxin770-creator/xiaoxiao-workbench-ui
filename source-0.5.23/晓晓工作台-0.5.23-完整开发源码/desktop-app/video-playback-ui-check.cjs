const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');

app.setPath('userData', process.env.DREAMINA_UI_TEST_ROOT);
app.disableHardwareAcceleration();
const fixture = require('./native-ui-fixture.cjs');
const originalCreateServer = http.createServer;
http.createServer = function (...args) {
  const server = originalCreateServer.apply(this, args);
  const listen = server.listen;
  server.listen = function (port, ...rest) {
    return listen.call(server, port === 17842 ? 0 : port, ...rest);
  };
  return server;
};

require('./pippit-service').PippitService.prototype.status = async () => ({ logged_in: false });
require('./pippit-service').PippitService.prototype.models = async () => ({ models: [] });
require('./pippit-service').PippitService.prototype.describe = async () => ({ ratio: { options: ['16:9'] }, duration: { min: 4, max: 15 }, resolution: { options: ['720p'] } });
require('./dreamina-service').DreaminaService.prototype.status = async () => ({ logged_in: false });
const { DreaminaCanvasService } = require('./dreamina-canvas-service');
DreaminaCanvasService.prototype.status = async () => ({ logged_in: false });
const catalog = require('./dreamina-canvas-service').catalogFromModels(require('./test-fixtures/dreamina-canvas-models.json').items);
DreaminaCanvasService.prototype.models = async () => catalog;
DreaminaCanvasService.prototype.describe = async m => catalog.specs[m];
require('./dreamina-canvas-targets').DreaminaCanvasTargets.prototype.settings = async () => null;

process.on('unhandledRejection', e => {
  console.error(e);
  app.exit(1);
});

app.whenReady().then(async () => {
  let code = 0;
  try {
    require('./main');
    const win = await fixture.nativeWindow();
    win.hide();
    const run = s => win.webContents.executeJavaScript(s);
    await win.loadURL(new URL('/video', win.webContents.getURL()).href);
    await fixture.until(() => run('Boolean(document.querySelector("[data-video-studio]"))'), '视频创作台就绪');

    // Synthesize a real playable WebM clip via MediaRecorder, write it to VideoStudioFiles,
    // and intentionally store the GenerationLog with url: "" and a wiped media_files storageKey.
    await run(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(20);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start(50);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#2563eb' : '#db2777';
        ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px sans-serif';
        ctx.fillText('Frame ' + i, 90, 96);
        await new Promise(r => setTimeout(r, 45));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      const bytes = new Uint8Array(await blob.arrayBuffer());

      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('infinite-canvas');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const raw = await new Promise(resolve => {
        const req = db.transaction('video_studio').objectStore('video_studio').get('video-studio-projects');
        req.onsuccess = () => resolve(req.result);
      });
      const meta = JSON.parse(raw);
      const pid = meta.state.activeProjectId;
      const project = meta.state.projects.find(p => p.id === pid);
      project.folders = [{ id: 'f4', name: '后续4', parentId: '' }];
      await window.desktopBridge.videoStudioSync({ id: project.id, name: project.name, folders: project.folders, change: true });
      await window.desktopBridge.videoStudioWrite({
        projectId: project.id,
        folderId: 'f4',
        videoId: 'log-09-3',
        title: '【视频编号09-3｜第9组',
        mimeType: 'video/webm',
        bytes,
      });

      meta.state.folderId = 'f4';
      meta.state.selectedFolders = { [pid]: 'f4' };
      meta.state.views[pid] = { section: 'results', composerVisible: false, columns: 3, sort: 'name' };
      meta.state.placements = { 'log-09-3': { projectId: pid, folderId: 'f4', review: 'none', lastViewedAt: 10 } };
      const log = {
        id: 'log-09-3',
        createdAt: Date.now(),
        title: '【视频编号09-3｜第9组',
        prompt: '测试悬停与详情弹窗播放恢复',
        time: '2026/10/25 11:30:00',
        model: 'seedance_2.0',
        config: { channelMode: 'local', videoChannelId: 'local-dreamina-canvas', videoModel: 'seedance_2.0', videoSeconds: '5', size: '16:9', vquality: '720p' },
        references: [],
        videoReferences: [],
        audioReferences: [],
        durationMs: 5000,
        size: '16:9',
        resolution: '720',
        seconds: '5',
        status: '成功',
        // Simulate exact broken state: url wiped to "" and storageKey missing from media_files IndexedDB
        video: {
          id: 'dreamina-canvas:client_video_task_missing',
          url: '',
          storageKey: 'video:wiped-by-cleanup',
          durationMs: 5000,
          width: 1280,
          height: 720,
          bytes: 0,
          mimeType: 'video/webm',
        },
        completionNotifiedAt: Date.now(),
        lastPolledAt: Date.now(),
      };
      const tx = db.transaction(['video_studio', 'video_generation_logs', 'media_files'], 'readwrite');
      tx.objectStore('video_studio').put(JSON.stringify(meta), 'video-studio-projects');
      tx.objectStore('video_generation_logs').put(log, log.id);
      tx.objectStore('media_files').clear();
      await new Promise(resolve => { tx.oncomplete = resolve; });
      db.close();
    })()`);

    win.setSize(1440, 960);
    win.reload();
    await new Promise(r => win.webContents.once('did-finish-load', r));
    await fixture.until(() => run('document.querySelectorAll("[data-video-tile]").length === 1'), '归档视频卡片渲染');

    win.showInactive();
    await fixture.sleep(150);
    win.webContents.debugger.attach('1.3');

    // 1. Hover over the video tile BEFORE any user click in the window -> verify hover autoplay works!
    const tileCenter = await run(`(() => {
      const r = document.querySelector('[data-video-tile]').getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await fixture.sleep(60);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...tileCenter });

    await fixture.until(() => run(`(() => {
      const v = document.querySelector('[data-video-tile] video[aria-label^="悬停预览"]');
      return Boolean(v && v.src.includes('/workbench/studio-video/') && v.readyState >= 2 && !v.paused && getComputedStyle(v).opacity === '1');
    })()`), '鼠标悬停自动播放本地归档视频');
    assert.equal(await run(`document.querySelector('[data-video-tile]').textContent.includes('点击打开视频播放')`), false, '悬停正常播放时不出现阻塞提示');

    // 2. Click the tile to open the video detail modal -> verify modal player loads and autoplays!
    await run(`document.querySelector('[data-video-tile] [aria-label^="查看视频"]').click()`);
    await fixture.until(() => run(`(() => {
      const v = document.querySelector('[data-video-showcase] video[aria-label^="视频详情播放"]');
      return Boolean(v && v.src.includes('/workbench/studio-video/') && v.readyState >= 2 && !v.paused);
    })()`), '点击进入视频详情弹窗自动播放');
    assert.equal(await run(`Boolean(document.querySelector('[data-video-tile] video[aria-label^="悬停预览"]'))`), false, '进入详情弹窗后停止卡片悬停预览');
    const showcaseMeta = await run(`document.querySelector('[data-video-showcase]').textContent`);
    assert.match(showcaseMeta, /1280 × 720 · /, '详情页自动补全本地归档视频文件大小');

    console.log('视频播放恢复验证：悬停自动播放 + 详情弹窗流式播放 + 本地归档兜底 PASS');
  } catch (e) {
    code = 1;
    console.error(e);
  } finally {
    try { if (win?.webContents?.debugger?.isAttached()) win.webContents.debugger.detach(); } catch {}
    app.exit(code);
  }
});
