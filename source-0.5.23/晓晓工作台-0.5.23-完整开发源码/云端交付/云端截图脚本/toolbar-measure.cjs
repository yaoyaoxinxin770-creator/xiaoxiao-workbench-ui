// 测量 1440×900 下视频页顶部工具栏：高度、左右两部分宽度、按钮总宽（用于基线/修改后对比）。
const { chromium } = require("playwright");
const harness = require("./harness-lib.cjs");
(async () => {
  const browser = await chromium.launch(); const out = {};
  for (const code of (process.argv[2] || "A,B,C").split(",")) {
    const { context, page } = await harness.newPage(browser, code, { width: 1440, height: 900 });
    await page.goto("http://localhost:3000/video?project=" + harness.seed.PROJECT, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-video-tile]", { timeout: 90000 }); await page.waitForTimeout(1200);
    out[code] = await page.evaluate(() => {
      const h = document.querySelector("[data-video-toolbar]"), left = h.firstElementChild, actions = h.lastElementChild;
      const buttons = [...actions.querySelectorAll("button")].filter(b => b.getClientRects().length);
      const sum = buttons.reduce((a, b) => a + b.getBoundingClientRect().width, 0);
      return { height: Math.round(h.getBoundingClientRect().height), header: Math.round(h.getBoundingClientRect().width), left: Math.round(left.getBoundingClientRect().width), actions: Math.round(actions.getBoundingClientRect().width), actionsScroll: actions.scrollWidth, buttons: buttons.length, buttonsWidth: Math.round(sum), aside: Math.round(document.querySelector('aside[aria-label=视频项目导航]')?.getBoundingClientRect().width || 0), rail: Math.round(document.querySelector('.workbench-rail')?.getBoundingClientRect().width || 0) };
    });
    await context.close();
  }
  console.log(JSON.stringify(out));
  await browser.close();
})();
