import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {ConnectorBroker} = require('./connector-broker');
let clock = 1000;
const broker = new ConnectorBroker({now:()=>clock, timeoutMs:100});

assert.equal(broker.status().online, false);
assert.equal((await broker.execute({action:'executeSegment'})).code, 'CHROME_CONNECTOR_OFFLINE');
assert.equal(broker.heartbeat({id:'other', url:'https://example.com/'}).ok, false);
broker.heartbeat({id:'hidden', url:'https://jimeng.jianying.com/ai-tool/canvas/a', visible:false, runtimeReady:true, executorReady:true, canvasReady:true, tabId:11});
broker.heartbeat({id:'active', url:'https://jimeng.jianying.com/ai-tool/canvas/b', visible:true, focused:true, runtimeReady:true, executorReady:true, canvasReady:true, tabId:12});
assert.equal(broker.status().connector.url.endsWith('/b'), true);

const execution = broker.execute({action:'executeSegment', sourceTabId:'bad-tab-id', localFiles:[{root:'F:/project',relativePath:'人物/小红.png'}]});
assert.deepEqual(broker.poll('hidden'), {id:null});
const command = broker.poll('active');
assert.equal(command.payload.action, 'executeSegment');
assert.deepEqual(broker.fileFor(command.id, 0), {root:'F:/project',relativePath:'人物/小红.png'});
assert.equal(broker.fileFor(command.id, 1), null);
assert.deepEqual(broker.poll('active'), {id:null});
assert.equal(broker.complete({id:command.id, ok:true, accepted:1}), true);
assert.deepEqual(await execution, {ok:true, accepted:1});

// 存活窗口按可见性区分：前台 5 秒、后台 90 秒（窗口最小化时 Chrome 把页面定时器
// 压到每分钟一次，用前台的判定会在用户离开电脑时误判掉线）。
clock += 6000;
assert.equal(broker.status().connector.title, '', '前台连接器过期后应当回落到后台那条');
assert.equal(broker.status().online, true, '后台连接器 6 秒内不能被回收');
assert.equal(broker.status().connector.visible, false);
assert.equal(broker.status().connector.ttlMs, 90_000);
clock += 91_000;
assert.equal(broker.status().online, false, '超过放宽窗口后仍然必须判定离线');
assert.equal(broker.status().count, 0);
// 重新建立一条前台连接器，后面的用例继续沿用。
broker.heartbeat({id:'active', url:'https://jimeng.jianying.com/ai-tool/canvas/b', visible:true, focused:true, runtimeReady:true, executorReady:true, canvasReady:true, tabId:12});
assert.equal(broker.status().online, true);
clock += 6000;
assert.equal(broker.status().online, false, '前台连接器超过 5 秒仍然要判定离线');

// Current connectors must complete the service-worker, executor and canvas
// probes before a workbench task can be claimed. A localhost heartbeat with a
// stale extension context is intentionally visible but not executable.
clock = 20000;
broker.heartbeat({
  id:'stale',
  url:'https://jimeng.jianying.com/ai-tool/canvas/stale',
  visible:true,
  focused:true,
  runtimeReady:false,
  executorReady:false,
  canvasReady:false,
  executorError:'Extension context invalidated',
});
assert.equal(broker.status().online, false);
assert.equal((await broker.execute({action:'executeSegment'})).code, 'CHROME_CONNECTOR_UNVERIFIED');
clock += 1;
broker.heartbeat({
  id:'verified',
  url:'https://jimeng.jianying.com/ai-tool/canvas/verified',
  visible:true,
  focused:true,
  runtimeReady:true,
  executorReady:true,
  canvasReady:true,
  executorVersion:'0.18.7',
  tabId:42,
});
assert.equal(broker.status().online, true);
console.log('Desktop connector selection, delivery, result correlation and stale expiry passed');

// 停止当前操作必须真正释放 broker 的槽位。EXECUTION_TIMEOUT_MS 是 0，被放弃的
// promise 永远不会 resolve，所以不取消就会永久卡在
// “已有任务正在等待即梦画布处理”，重启工作台才能恢复。
{
  const broker = new ConnectorBroker({now: () => 5_000_000});
  const online = {id:'c1', url:'https://jimeng.jianying.com/ai-tool/canvas/1', runtimeReady:true, executorReady:true, canvasReady:true, tabId:3};
  broker.heartbeat(online);

  const first = broker.execute({segment:{id:'01'}});
  const blocked = await broker.execute({segment:{id:'02'}});
  assert.equal(blocked.code, 'CHROME_CONNECTOR_BUSY', '未取消前第二条必须被挡住');

  const cancelled = broker.cancel({reason:'用户点击停止当前操作'});
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.delivered, false, '尚未被领取的任务必须标记为未交付');
  const outcome = await first;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, 'CANCELLED_BY_USER');
  assert.match(outcome.error, /没有产生扣费/, '未交付的中断必须明确说明没有扣费');

  // 槽位释放后必须立刻能接受下一条。
  const afterCancel = broker.execute({segment:{id:'03'}});
  assert.equal(broker.poll('c1').payload.segment.id, '03', '取消后新任务必须可以被领取');
  broker.complete({id: broker.pending?.command.id ?? '', ok:true});
  await afterCancel;

  // 已经交给画布的任务中断后，措辞必须提醒可能已经扣费。
  const delivered = broker.execute({segment:{id:'04'}});
  broker.poll('c1');
  const cancelledDelivered = broker.cancel({reason:'stop'});
  assert.equal(cancelledDelivered.delivered, true);
  const deliveredOutcome = await delivered;
  assert.match(deliveredOutcome.error, /提交状态未知/, '已交付的中断不能声称没有扣费');

  // 空闲时取消是安全的空操作。
  assert.deepEqual(broker.cancel(), {ok:true, cancelled:false});
}
console.log('[OK] cancel releases the pending slot so a stopped batch can be restarted');
