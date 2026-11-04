// Between two groups the canvas connector can be missing for a few seconds:
// the MV3 service worker restarts, the extension is reloaded and the page
// reinjects itself, or the user switches tabs.  A single failed probe used to
// abort the whole batch, so a run that had already paid for group 02 stopped
// before group 03.  The batch must wait out a short outage and only give up
// when the canvas is really gone — or when the user pressed stop.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./browser-bridge.js', import.meta.url), 'utf8');
const window = {desktopBridge:{}};
vm.runInNewContext(source, {window, setTimeout, Promise, Number, Math, Date, fetch:async()=>({ok:true,json:async()=>({})}), document:{getElementById:()=>null}, addEventListener:()=>{}});
const {waitForCanvasConnection} = window.WorkbenchBatch;
assert.equal(typeof waitForCanvasConnection, 'function', '批次模块必须导出连接等待器');

// A connector that comes back on the fourth probe must not fail the batch.
{
  let attempt = 0;
  let slept = 0;
  const retries = [];
  const result = await waitForCanvasConnection({
    check:async () => {
      attempt += 1;
      return attempt < 4 ? {ok:false, error:'未检测到即梦画布连接器'} : {ok:true, result:{online:true}};
    },
    timeoutMs:30_000,
    pollMs:1000,
    sleep:async ms => { slept += ms; },
    onRetry:detail => retries.push(detail.error),
  });
  assert.equal(result.ok, true, '连接恢复后必须继续执行下一组');
  assert.equal(attempt, 4);
  assert.equal(slept, 3000, '每次重试之间等待 1 秒');
  assert.deepEqual(retries, ['未检测到即梦画布连接器', '未检测到即梦画布连接器', '未检测到即梦画布连接器']);
}

// A canvas that never returns must still fail, and must report the real
// reason rather than a generic timeout.
{
  let attempt = 0;
  let slept = 0;
  const result = await waitForCanvasConnection({
    check:async () => { attempt += 1; return {ok:false, error:'即梦画布标签页已关闭'}; },
    timeoutMs:10_000,
    pollMs:1000,
    sleep:async ms => { slept += ms; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, '即梦画布标签页已关闭');
  assert.equal(slept, 10_000, '超过等待窗口后必须放弃，不能无限等待');
  assert.equal(attempt, 11);
}

// A first probe that already succeeds must not sleep at all: the executor has
// confirmed the debit and the next group should start immediately.
{
  let slept = 0;
  const result = await waitForCanvasConnection({
    check:async () => ({ok:true, result:{online:true}}),
    timeoutMs:30_000,
    sleep:async ms => { slept += ms; },
  });
  assert.equal(result.ok, true);
  assert.equal(slept, 0, '连接正常时不能给组间流程增加任何延时');
}

// Pressing stop during the grace window must abort promptly instead of
// holding the queue for the full timeout.
{
  let attempt = 0;
  let stopped = false;
  let slept = 0;
  const result = await waitForCanvasConnection({
    check:async () => { attempt += 1; return {ok:false, error:'未检测到即梦画布连接器'}; },
    timeoutMs:30_000,
    pollMs:1000,
    sleep:async ms => { slept += ms; stopped = true; },
    isStopped:() => stopped,
  });
  assert.equal(result.ok, false);
  assert.equal(result.stopped, true, '用户停止后必须标记为停止而不是连接失败');
  assert.equal(attempt, 1);
  assert.equal(slept, 1000);
}

console.log('Canvas connection grace window: transient outage recovers, real outage fails, healthy canvas adds no delay, stop aborts');

// 等待窗口必须能覆盖一个完整的节流周期。窗口最小化时 Chrome 把页面定时器压到
// 每分钟一次，30 秒的窗口等不到下一次心跳，批次会在用户离开电脑时停在半路。
{
  const source = await readFile(new URL('../jimeng-canvas-extension/workbench.js', import.meta.url), 'utf8');
  const grace = source.match(/const CONNECTION_GRACE_MS=(\d+);/);
  assert.ok(grace, '必须有明确的组间等待窗口常量');
  assert.ok(Number(grace[1]) >= 90_000,
    `等待窗口要能覆盖一个节流周期（至少 90 秒），实际 ${Number(grace[1]) / 1000} 秒`);

  // 真的等满窗口后仍然要失败，不能无限等下去。
  let attempt = 0;
  let slept = 0;
  const result = await waitForCanvasConnection({
    check:async () => { attempt += 1; return {ok:false, error:'即梦画布标签页已关闭'}; },
    timeoutMs:Number(grace[1]),
    pollMs:1000,
    sleep:async ms => { slept += ms; },
  });
  assert.equal(result.ok, false);
  assert.equal(slept, Number(grace[1]), '等满窗口后必须放弃');
  assert.equal(attempt, Number(grace[1]) / 1000 + 1);
}
console.log('The between-group grace window covers a full background throttling cycle');
