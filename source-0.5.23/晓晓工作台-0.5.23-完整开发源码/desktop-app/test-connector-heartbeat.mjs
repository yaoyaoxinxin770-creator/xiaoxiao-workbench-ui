// A group takes minutes: the executor reads the balance, sends, waits 60
// seconds and then polls the real backend balance every 10 seconds.  The
// broker prunes any connector it has not seen for CONNECTOR_TTL_MS, so the
// page heartbeat has to keep running for the whole execution.  Parking it
// behind the `busy` flag deregistered the tab a few seconds into every send,
// and the next group failed with "未检测到即梦画布连接器" in the same second
// the previous debit was confirmed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {ConnectorBroker, CONNECTOR_TTL_MS} = require('./connector-broker.js');
const source = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', 'jimeng-canvas-extension', 'desktop-connector.js'), 'utf8');

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function buildConnector() {
  const timers = [];
  const requests = [];
  const session = new Map();
  let claimed = false;
  let releaseBatch;
  const batchPending = new Promise(resolve => { releaseBatch = resolve; });
  const context = {
    location:{href:'https://jimeng.jianying.com/ai-tool/canvas/20416587604236'},
    document:{title:'即梦画布', visibilityState:'visible', hasFocus:()=>true},
    sessionStorage:{getItem:key=>session.get(key)||null, setItem:(key,value)=>session.set(key,value)},
    crypto:{randomUUID:()=>'connector-heartbeat-test'},
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    setInterval:(callback)=>{timers.push(callback);return timers.length;},
    fetch:async (url, options={}) => {
      requests.push({url, options});
      if (url.includes('/workbench/poll')) {
        if (claimed) return {json:async()=>({id:null})};
        claimed = true;
        return {json:async()=>({id:'job-1', payload:{
          action:'executeSegment', source:'desktop-workbench', bridgeProtocolVersion:1,
          promptIsFinal:true, segment:{id:'01', prompt:'最终提示词'},
        }})};
      }
      return {json:async()=>({ok:true})};
    },
    chrome:{runtime:{id:'extension-test-id', sendMessage:async message => {
      if (message.type === 'DESKTOP_CONNECTOR_PING') {
        return {ok:true, ready:true, executorReady:true, canvasReady:true, version:'0.20.0', tabId:7};
      }
      if (message.type === 'START_BATCH') return batchPending;
      return {ok:true};
    }}},
    Blob, Uint8Array, btoa,
  };
  vm.runInNewContext(source, context);
  const heartbeats = () => requests.filter(request => request.url.endsWith('/workbench/connector'));
  const tick = async () => { for (const callback of [...timers]) callback(); await settle(); };
  return {requests, heartbeats, tick, releaseBatch:value=>releaseBatch(value), isClaimed:()=>claimed};
}

const connector = buildConnector();
await settle();
assert.equal(connector.isClaimed(), true, '连接器应当先领取到一条待执行命令');
const duringStart = connector.heartbeats().length;

// 90 simulated seconds while the group is still waiting for the real debit.
for (let second = 0; second < 90; second += 1) await connector.tick();

const duringEnd = connector.heartbeats().length;
assert.ok(duringEnd - duringStart >= 60,
  `执行期间必须持续上报心跳，否则连接器会被回收；实际只上报了 ${duringEnd - duringStart} 次`);

// The heartbeats sent while busy must still describe a verified connector,
// otherwise the broker keeps the row but refuses to dispatch the next group.
const lastHeartbeat = JSON.parse(connector.heartbeats().at(-1).options.body);
assert.equal(lastHeartbeat.runtimeReady, true);
assert.equal(lastHeartbeat.executorReady, true);
assert.equal(lastHeartbeat.canvasReady, true);
assert.equal(lastHeartbeat.id, 'connector-heartbeat-test');

// Replay those heartbeats through the real broker with a moving clock: the
// connector must still be dispatchable when the long group finally resolves.
let clock = 1_000_000;
const broker = new ConnectorBroker({now:()=>clock});
broker.heartbeat(lastHeartbeat);
assert.equal(broker.status().online, true, '首次握手后应当在线');
for (let second = 0; second < 90; second += 1) {
  clock += 1000;
  broker.heartbeat(lastHeartbeat);
}
assert.equal(broker.status().online, true, '执行期间持续心跳时连接器不能被回收');

clock += CONNECTOR_TTL_MS + 1000;
assert.equal(broker.status().online, false, '心跳真正停止超过 TTL 后才应判定离线');

connector.releaseBatch({ok:true, accepted:1});
await settle();
const report = connector.requests.filter(request => request.url.endsWith('/workbench/result')).at(-1);
assert.ok(report, '任务结束后必须回传结果');
assert.equal(JSON.parse(report.options.body).ok, true);

// With the command finished the connector must be free to claim the next one.
await connector.tick();
assert.ok(connector.requests.some(request => request.url.includes('/workbench/poll')),
  '任务结束后应继续轮询下一组');

console.log('Connector heartbeat survives a long in-flight group; broker keeps it dispatchable between groups');

// A hung service-worker probe must not silence presence.  An earlier revision
// guarded presence and the health probe with one in-flight flag, so a probe
// that hung for a minute stopped every heartbeat for that whole minute: the
// broker pruned the connector and the tab was reachable roughly five seconds
// out of every sixty.  Presence must keep flowing, and the broker must mark the
// connector unverified from the reported health age rather than losing it.
function buildStalledConnector() {
  const timers = [];
  const requests = [];
  const session = new Map();
  let releasePing;
  const pingStalled = new Promise(resolve => { releasePing = resolve; });
  const context = {
    location:{href:'https://jimeng.jianying.com/ai-tool/canvas/20416587604236'},
    document:{title:'即梦画布', visibilityState:'visible', hasFocus:()=>true},
    sessionStorage:{getItem:key=>session.get(key)||null, setItem:(key,value)=>session.set(key,value)},
    crypto:{randomUUID:()=>'connector-stalled-test'},
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    setInterval:(callback)=>{timers.push(callback);return timers.length;},
    fetch:async (url, options={}) => {
      requests.push({url, options});
      if (url.includes('/workbench/poll')) return {json:async()=>({id:null})};
      return {json:async()=>({ok:true})};
    },
    chrome:{runtime:{id:'extension-test-id', sendMessage:async message => {
      // The worker never answers the health probe.
      if (message.type === 'DESKTOP_CONNECTOR_PING') return pingStalled;
      return {ok:true};
    }}},
    Blob, Uint8Array, btoa,
  };
  vm.runInNewContext(source, context);
  return {
    requests,
    heartbeats:() => requests.filter(request => request.url.endsWith('/workbench/connector')),
    tick:async () => { for (const callback of [...timers]) callback(); await settle(); },
    releasePing:value => releasePing(value),
  };
}

const stalled = buildStalledConnector();
await settle();
const before = stalled.heartbeats().length;
for (let second = 0; second < 40; second += 1) await stalled.tick();
const posted = stalled.heartbeats().length - before;
assert.ok(posted >= 30,
  `健康探测挂起时仍必须持续上报存活；实际只上报了 ${posted} 次`);

// Presence keeps the row, but the executor is not proven, so no work may be
// dispatched to it.
const stalledBody = JSON.parse(stalled.heartbeats().at(-1).options.body);
assert.equal(stalledBody.id, 'connector-stalled-test');
assert.equal(stalledBody.executorReady, false, '探测未返回时不得声称执行器就绪');

let stalledClock = 2_000_000;
const stalledBroker = new ConnectorBroker({now:()=>stalledClock});
stalledBroker.heartbeat(stalledBody);
const stalledStatus = stalledBroker.status();
assert.equal(stalledStatus.count, 1, '心跳仍在时连接器必须保留，便于诊断');
assert.equal(stalledStatus.online, false, '探测未确认的连接器不能被判定为可执行');
const dispatch = await stalledBroker.execute({segment:{id:'01'}});
assert.equal(dispatch.ok, false);
assert.equal(dispatch.code, 'CHROME_CONNECTOR_UNVERIFIED');

// Health that succeeded long ago must age out even while presence is current.
const staleHealth = {...stalledBody, runtimeReady:true, executorReady:true, canvasReady:true, tabId:7, healthAgeMs:60_000, executorError:''};
stalledBroker.heartbeat(staleHealth);
assert.equal(stalledBroker.status().online, false, '健康信息过期时不能凭存活心跳判定可执行');
assert.match(stalledBroker.status().error, /健康探测/);
stalledBroker.heartbeat({...staleHealth, healthAgeMs:1200});
assert.equal(stalledBroker.status().online, true, '健康信息新鲜时必须立刻恢复可执行');

// A connector from an older build reports no health age at all; it must keep
// behaving exactly as it did before this field existed.
const legacy = {...staleHealth};
delete legacy.healthAgeMs;
delete legacy.healthProbeMs;
stalledBroker.heartbeat(legacy);
assert.equal(stalledBroker.status().online, true, '旧版连接器不带健康时间戳，必须保持原有行为');

stalled.releasePing({ok:true, ready:true, executorReady:true, canvasReady:true, version:'0.20.0', tabId:7});
await stalled.tick();
await stalled.tick();
assert.equal(JSON.parse(stalled.heartbeats().at(-1).options.body).executorReady, true,
  '探测恢复后必须立即回到已验证状态');

console.log('Presence survives a hung health probe; broker ages health out instead of losing the connector');

// 窗口最小化 / 标签页切到后台时，Chrome 会把页面定时器压到每分钟一次。用前台
// 的 5 秒存活窗口去判定，会在用户离开电脑期间直接判成掉线——批次就停在半路。
// 可见时保持 5 秒（关掉标签页要能立刻发现），不可见时放宽到 90 秒。
{
  let clock = 9_000_000;
  const broker = new ConnectorBroker({now:()=>clock});
  const base = {
    id:'bg', url:'https://jimeng.jianying.com/ai-tool/canvas/1',
    runtimeReady:true, executorReady:true, canvasReady:true, tabId:11,
  };

  // 前台：超过 5 秒没心跳就判定离线，和以前一样。
  broker.heartbeat({...base, visible:true, healthAgeMs:800});
  assert.equal(broker.status().online, true);
  clock += 6_000;
  assert.equal(broker.status().count, 0, '前台连接器超过 5 秒仍然要判定离线');

  // 后台：每分钟才来一次心跳，中间不能被回收。
  clock += 1_000;
  broker.heartbeat({...base, visible:false, healthAgeMs:1_000});
  for (let minute = 0; minute < 3; minute += 1) {
    clock += 60_000;
    assert.equal(broker.status().online, true,
      `后台每分钟一次心跳时不能掉线（第 ${minute + 1} 分钟）`);
    // 节流下健康探测同样只能每分钟成功一次，不能因此判成未验证。
    broker.heartbeat({...base, visible:false, healthAgeMs:59_000});
  }
  assert.equal(broker.status().connector.ttlMs, 90_000, '后台连接器应当使用放宽后的存活窗口');
  assert.equal(broker.status().connector.visible, false);

  // 真的关掉标签页：超过放宽窗口后仍然要判定离线，不能永远挂着。
  clock += 91_000;
  assert.equal(broker.status().count, 0, '后台连接器超过 90 秒没心跳也必须判定离线');

  // 放宽的只是“多久算掉线”，没有放宽“是否验证过”：执行器没自证就绪时照样拒绝派发。
  clock += 1_000;
  broker.heartbeat({...base, visible:false, executorReady:false, healthAgeMs:1_000});
  assert.equal(broker.status().online, false, '未验证的后台连接器不能被判定为可执行');
  const refused = await broker.execute({segment:{id:'01'}});
  assert.equal(refused.code, 'CHROME_CONNECTOR_UNVERIFIED');
}
console.log('[OK] a hidden window keeps its connector for 90s of throttled heartbeats, without loosening verification');
