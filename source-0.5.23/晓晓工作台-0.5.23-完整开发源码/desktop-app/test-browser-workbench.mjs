import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {createBrowserWorkbenchHandler} = require('./browser-workbench-service');
const root = path.resolve(import.meta.dirname, '..');
const calls = [];
const handler = createBrowserWorkbenchHandler({
  root,
  actions: {
    ping: async () => ({ok:true}),
    inspectProject: async (...args) => { calls.push(args); return {pathAvailable:true, marker:'shared-project-data'}; },
  },
});
const server = http.createServer(async (req, res) => {
  if (!await handler(req, res)) { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const redirect = await fetch(`${base}/workbench`, {redirect:'manual'});
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/jimeng-canvas-extension/workbench.html');

  const page = await fetch(`${base}/jimeng-canvas-extension/workbench.html`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.indexOf('../desktop-app/browser-bridge.js') < html.indexOf('src="workbench.js"'));
  const workbenchScript = await fetch(`${base}/jimeng-canvas-extension/workbench.js`);
  assert.equal(workbenchScript.status, 200);
  const workbenchSource = await workbenchScript.text();
  assert.match(workbenchSource, /已发送，可继续下一组/);
  assert.doesNotMatch(workbenchSource, /等待即梦生成/);
  const audioPickerCss = await fetch(`${base}/desktop-app/asset-audio-picker.css`);
  assert.equal(audioPickerCss.status, 200);
  assert.match(await audioPickerCss.text(), /aw-segment-audio-picker/);

  const api = await fetch(`${base}/workbench/api`, {
    method:'POST', headers:{'Content-Type':'application/json', Origin:'null'},
    body:JSON.stringify({method:'inspectProject', args:['F:/project']}),
  });
  assert.equal(api.status, 200);
  assert.equal(api.headers.get('access-control-allow-origin'), 'null');
  assert.deepEqual((await api.json()).result, {pathAvailable:true, marker:'shared-project-data'});
  assert.deepEqual(calls, [['F:/project']]);

  const rejected = await fetch(`${base}/workbench/api`, {
    method:'POST', headers:{'Content-Type':'application/json', Origin:'https://example.com'},
    body:JSON.stringify({method:'ping'}),
  });
  assert.equal(rejected.status, 403);

  const unknown = await fetch(`${base}/workbench/api`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({method:'readArbitraryFile', args:['C:/secret']}),
  });
  assert.equal(unknown.status, 400);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1:17842/*'));
  assert.ok(manifest.host_permissions.includes('https://xyq.jianying.com/*'));
  console.log('Browser sidebar workbench route, origin guard, action allowlist, static entry and manifest permissions passed');
} finally {
  await new Promise(resolve => server.close(resolve));
}

// 工作台是长时间无人值守跑批的工具：用户设置好就切去做别的事。Electron 默认开启
// backgroundThrottling，窗口一被盖住，渲染进程的定时器就被压到每分钟一次——组间
// 等待、连接重试、扣费轮询全靠定时器，于是进度看起来卡住好几分钟。
// 测试用的窗口一直写着 backgroundThrottling:false，正式窗口却漏了，所以测试环境
// 里从来复现不出来。
{
  const main = fs.readFileSync(path.resolve(import.meta.dirname, 'main.js'), 'utf8');
  const options = main.slice(main.indexOf('win = new BrowserWindow('), main.indexOf('win.loadFile('));
  assert.match(options, /backgroundThrottling:\s*false/,
    '正式窗口必须关闭后台节流，否则切走应用后批次会被拖慢到每分钟一步');
}
console.log('The desktop window keeps its timers running while the user works in another app');
