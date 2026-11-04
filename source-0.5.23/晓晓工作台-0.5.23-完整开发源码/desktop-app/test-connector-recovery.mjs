import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {ConnectorBroker} = require('./connector-broker');

let clock = 1000;
const broker = new ConnectorBroker({now: () => clock, timeoutMs: 1000});

broker.heartbeat({
  id: 'stale-page',
  url: 'https://jimeng.jianying.com/ai-tool/canvas/1',
  visible: true,
  focused: true,
  executorReady: false,
  executorError: 'Extension context invalidated',
});
assert.equal(broker.status().online, false);
assert.match(broker.status().error, /invalidated/);
assert.equal((await broker.execute({action: 'executeSegment'})).code, 'CHROME_CONNECTOR_UNVERIFIED');

broker.heartbeat({
  id: 'fresh-page',
  url: 'https://jimeng.jianying.com/ai-tool/canvas/2',
  visible: true,
  focused: true,
  runtimeReady: true,
  executorReady: true,
  canvasReady: true,
  executorVersion: '0.18.9',
  tabId: 2,
});
const execution = broker.execute({action: 'executeSegment'});
const command = broker.poll('fresh-page');
assert.equal(command.payload.action, 'executeSegment');
assert.equal(broker.requeue({
  id: command.id,
  connectorId: 'fresh-page',
  reason: 'Extension context invalidated',
}).ok, true);
assert.equal(broker.poll('fresh-page').id, command.id, 'a refreshed connector may reclaim the command');
assert.equal(broker.complete({id: command.id, ok: true, accepted: 1}), true);
assert.deepEqual(await execution, {ok: true, accepted: 1});

clock += 6000;
assert.equal(broker.status().online, false);
console.log('[OK] stale executor health blocks delivery and context invalidation requeues exactly one command');
