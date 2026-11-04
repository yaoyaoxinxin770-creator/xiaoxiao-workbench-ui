import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {InfiniteCanvasService} = require('./infinite-canvas-service');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'infinite-canvas-service-'));
const service = new InfiniteCanvasService({runtimeDir:path.join(import.meta.dirname, 'infinite-canvas-runtime'), dataDir:root, port:0, backendPort:0});
const exitChild = async instance => {
  const ended = Promise.all([instance.child,instance.webChild].filter(Boolean).map(child=>once(child,'exit')));
  instance.stop();
  await ended;
};
try {
  const [first, second] = await Promise.all([service.start(), service.start()]);
  assert.equal(first.ok, true, first.error);
  assert.equal(second.url, first.url, '并发进入画布必须共用同一服务');
  const pid = service.child.pid;
  const frontendPid = service.webChild.pid;
  assert.equal((await service.start()).url, first.url);
  assert.equal(service.child.pid, pid, '重复连接不重复启动进程');
  assert.equal(service.webChild.pid, frontendPid, '重复连接不重复启动前端');
  const origin = new URL(first.url).origin;
  const skills = await (await fetch(origin+'/api/agent-skills')).json();
  assert.equal(skills.code, 0);
  assert.ok(skills.data.length > 0, '原生 Agent Skill 必须可读取');
  const page = await (await fetch(first.url)).text();
  assert.match(page,/晓晓工作台/,'运行的是修改后的原生前端');
  assert.ok(!/<iframe\b/i.test(page),'工作台本体不得嵌入另一个画布页面');
  for(const route of ['/projects','/jimeng','/typetale']) assert.equal((await fetch(origin+route)).status,200,route);
  assert.ok(!(await (await fetch(origin+'/xiaoxiao/panels.html')).text()).includes('icFrame'));
  for(const name of ['InfiniteCanvas-ComfyBridge.exe','InfiniteCanvas-ComfyBridge-linux-amd64','InfiniteCanvas-ComfyBridge-linux-arm64']) {
    const download = await fetch(origin+'/'+name);
    assert.equal(download.status,200,'原生 ComfyUI 桥接附件必须可下载');
    const header=Buffer.from(await download.arrayBuffer()).subarray(0,4);
    assert.equal(name.endsWith('.exe')?header.subarray(0,2).toString():header.toString('hex'),name.endsWith('.exe')?'MZ':'7f454c46');
  }
  for (const relative of [...page.matchAll(/(?:src|href)="(\/_next\/static\/[^\"]+)"/g)].slice(0,8).map(m=>m[1])) {
    assert.equal((await fetch(origin+relative)).status, 200, `网页资源缺失：${relative}`);
  }
  const secret = fs.readFileSync(path.join(root,'runtime-settings.json'),'utf8');
  assert.ok(JSON.parse(secret).jwtSecret.length >= 64);
  assert.ok(!JSON.stringify(service.status()).includes(JSON.parse(secret).adminPassword), '状态接口不返回管理员密码');
  await exitChild(service);
  assert.equal(service.status().ok, false);
  assert.equal((await service.start()).ok, true);
  assert.equal(fs.readFileSync(path.join(root,'runtime-settings.json'),'utf8'), secret, '重启必须保留登录密钥和管理密码');
  await exitChild(service);

  const occupied = net.createServer();
  occupied.listen(0,'127.0.0.1');
  await once(occupied,'listening');
  const conflicting = new InfiniteCanvasService({runtimeDir:service.runtimeDir,dataDir:path.join(root,'conflict'),port:occupied.address().port});
  try {
    const result = await conflicting.start();
    assert.equal(result.ok, false);
    assert.match(result.error,/已被占用/);
    assert.equal(conflicting.child,null,'不能接管或关闭其他服务');
  } finally { await new Promise(resolve=>occupied.close(resolve)); }
  const missing = new InfiniteCanvasService({runtimeDir:path.join(root,'missing'),dataDir:path.join(root,'missing-data'),port:0});
  assert.match((await missing.start()).error,/运行包缺失/);
  const cancelled = new InfiniteCanvasService({runtimeDir:service.runtimeDir,dataDir:path.join(root,'cancelled'),port:0});
  const pending = cancelled.start();
  cancelled.stop();
  assert.equal((await pending).ok,false);
  assert.equal(cancelled.child,null,'关闭工作台时不能遗留稍后启动的画布进程');
  console.log('无限画布真实服务：页面与资源、Agent Skill、单进程复用、重启持久化、端口冲突、缺包与启动取消全部通过');
} finally {
  await exitChild(service);
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(root).startsWith('infinite-canvas-service-'));
  fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
