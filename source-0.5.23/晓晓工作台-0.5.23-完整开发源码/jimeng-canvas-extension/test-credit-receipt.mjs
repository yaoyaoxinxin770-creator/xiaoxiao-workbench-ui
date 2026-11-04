import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./content.js', import.meta.url), 'utf8');
const context = {
  chrome:{runtime:{onMessage:{addListener(){}}}},
  self:{}, Date, Set, Number, String, queueMicrotask, setTimeout, clearTimeout,
};
vm.runInNewContext(source, context);

assert.equal(context.exactCreditNumber('13,625'), 13625);
assert.equal(context.exactCreditNumber('1.4万'), null, 'abbreviated header credit is not an exact backend balance');

context.isInteractable = () => true;
const balanceElement = {textContent:'13,625'};
const creditItem = {
  parentElement:null,
  querySelectorAll(selector) {
    return selector === "[class*='credits-']" ? [balanceElement] : [];
  },
};
const title = {textContent:'积分详情', parentElement:creditItem};
const fakeDocument = {
  querySelectorAll(selector) {
    return selector === 'div,span' ? [title] : [];
  },
};
assert.equal(context.backendCreditBalanceFromDocument(fakeDocument).balance, 13625);

// 扣费确认的新契约：抽屉打开一次就留着，每 10 秒直接读页面上的数字，确认扣费
// 之后再关闭。以前是每轮开一次关一次，抽屉反复弹出，而且一旦没关干净就会挡住
// 下一组的发送箭头。
const sleeps = [];
const statuses = [];
const opens = [];
const closes = [];
let drawerOpen = false;
context.sleep = async (ms) => { sleeps.push(ms); };
context.status = (_jobId, state, detail) => { statuses.push({state, detail}); };
context.batchPauseRequested = async () => false;
context.videoQueueSnapshot = () => ({cardIds:['old-card','new-card']});
context.waitForOptional = async (getter) => getter();
context.creditBalanceTrigger = () => ({id:'trigger'});
context.trustedClickElement = async (_element, intent) => {
  if (intent === 'open_credit_balance') { opens.push(1); drawerOpen = true; }
};
context.closeCreditDrawer = async () => { closes.push(1); drawerOpen = false; return true; };
// 扣费在第两轮观察之后才出现。按“观察了几轮”建模，而不是按读了几次——
// 一轮里代码会读不止一次页面，那是实现细节。
context.backendCreditBalanceFromDocument = () =>
  drawerOpen ? {balance: sleeps.length >= 3 ? 13625 : 13661} : null;

const result = await context.waitForCreditDeduction(13661, 'job', ['old-card']);

assert.deepEqual(sleeps, [60_000, 10_000, 10_000],
  '先等一分钟再第一次检查，之后每 10 秒看一次页面上的数字');
assert.equal(opens.length, 1, `积分抽屉只应打开一次，实际打开了 ${opens.length} 次`);
assert.equal(closes.length, 1, `确认扣费后必须关闭一次，实际关闭了 ${closes.length} 次`);
assert.equal(result.consumed, 36);
assert.equal(result.currentBalance, 13625);
assert.deepEqual([...result.addedCardIds], ['new-card']);
assert.ok(statuses.some(item => item.detail.includes('13661 → 13625')));
assert.equal(source.includes('本次消耗\s*'), false, 'Agent 回复里的“本次消耗”不能用来放行下一组');

console.log('PASS: the drawer stays open, the exact backend balance is polled every 10s, and it closes before the next group');
