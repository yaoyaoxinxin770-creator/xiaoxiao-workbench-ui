// 读扣费基线要打开积分抽屉，它整块盖在页面上，正好压住右下角的发送箭头。
// 原来 closeCreditDrawer 是尽力而为：找不到关闭按钮就直接 return，点过之后也
// 不检查有没有真的关上。抽屉留在页面上时点发送，点击落在抽屉上而不是箭头上——
// 表现就是“已经准备好却发不出去，人工点掉那个叉才继续”。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "content.js"), "utf8");

const close = source.slice(
  source.indexOf("async function closeCreditDrawer("),
  source.indexOf("async function readBackendCreditBalance("),
);
assert.match(close, /for \(let attempt = 1; attempt <= attempts/, "关闭必须可以重试");
assert.match(close, /return true;/, "必须把是否真的关上返回给调用方");
assert.equal(/if \(!closeButton\) return;\n/.test(close), false, "找不到按钮不能直接放弃");

// 保险放在读余额里：只有确认抽屉收起才返回余额，因此走到 submitUntilAccepted
// 时箭头一定没有被遮挡。
const read = source.slice(
  source.indexOf("async function readBackendCreditBalance("),
  source.indexOf("async function waitForReadableBackendCreditBalance("),
);
assert.match(read, /if \(!await closeCreditDrawer\(\)\)/, "读到余额后必须确认抽屉真的关上了");
assert.match(read, /挡住发送箭头/, "关不掉时必须说明原因");
assert.ok(
  source.indexOf("const creditBaseline = await waitForReadableBackendCreditBalance") <
    source.indexOf("await submitUntilAccepted(editor, fullText, job.id)"),
  "必须先读基线并收起抽屉，再点发送",
);

// 实测过：button[class*='CommerceDrawer_closeButton'] 只在抽屉打开时存在，
// 所以“有没有这个按钮”就是“抽屉开没开”。替身按这个事实建模。
function build({ clicksNeeded = 1, firstClickThrows = false }) {
  let open = true;
  const clicks = [];
  const context = {
    queueMicrotask, structuredClone, AbortController, TextEncoder, TextDecoder,
    self: {},
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true }) } },
  };
  vm.runInNewContext(source, context);
  context.sleep = async () => {};
  context.status = () => {};
  context.waitForOptional = async (getter) => getter();
  context.creditDrawerCloseButton = () => (open ? { id: "close" } : null);
  context.trustedClickElement = async (_element, intent) => {
    clicks.push(intent);
    if (firstClickThrows && clicks.length === 1) throw new Error("关闭按钮这一瞬间不可点");
    if (clicks.length >= clicksNeeded) open = false;
  };
  return { context, clicks, isOpen: () => open };
}

// 正常情况：点一次就关上，如实返回 true。
{
  const { context, clicks, isOpen } = build({});
  assert.equal(await context.closeCreditDrawer(), true);
  assert.equal(isOpen(), false);
  assert.deepEqual(clicks, ["close_credit_balance"]);
}

// 第一次点击抛错时不能放弃，下一轮要重新点并关上。
{
  const { context, clicks, isOpen } = build({ firstClickThrows: true, clicksNeeded: 2 });
  assert.equal(await context.closeCreditDrawer(), true, "单次点击失败不应放弃整个关闭");
  assert.equal(isOpen(), false);
  assert.ok(clicks.length >= 2, `必须重试，实际点了 ${clicks.length} 次`);
}

// 始终关不掉时必须如实返回 false，而不是假装成功。
{
  const { context, clicks } = build({ clicksNeeded: 99 });
  assert.equal(await context.closeCreditDrawer(), false, "关不掉必须返回 false");
  assert.ok(clicks.length >= 2, `必须重试，实际只点了 ${clicks.length} 次`);
}

// 关不掉时读余额必须报错，绝不能带着抽屉往下走去点发送。
{
  const { context } = build({ clicksNeeded: 99 });
  context.backendCreditBalanceFromDocument = () => ({ balance: 13472 });
  let thrown = null;
  try { await context.readBackendCreditBalance("job-1"); } catch (error) { thrown = error; }
  assert.ok(thrown, "抽屉关不掉时不能正常返回余额");
  assert.match(thrown.message, /挡住发送箭头/);
}

// 抽屉本来就没开时，关闭是无副作用的空操作。
{
  const { context, clicks } = build({});
  context.creditDrawerCloseButton = () => null;
  assert.equal(await context.closeCreditDrawer(), true);
  assert.deepEqual(clicks, [], "抽屉没开时不应产生任何点击");
}

console.log("[OK] the credit drawer is verified closed before the send arrow is ever clicked");
