// 1024×800 窄窗口：页面不得横向溢出（与本机 UI 检查同口径）。
const { chromium } = require("playwright");
const harness = require("./harness-lib.cjs");
(async () => {
  const browser = await chromium.launch(); const out = {};
  for (const code of ["A", "B", "C", "D"]) {
    const { context, page } = await harness.newPage(browser, code, { width: 1024, height: 800 });
    await page.goto("http://localhost:3000/video?project=" + harness.seed.PROJECT, { waitUntil: "load", timeout: 240000 });
    await page.waitForSelector("[data-video-tile]", { timeout: 90000 }); await page.waitForTimeout(1200);
    const r = {}; const over = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    r.video = await over();
    await page.click('[data-agent-toggle]'); await page.waitForSelector("[data-codex-agent-panel]"); await page.waitForTimeout(600); r.agent = await over();
    await page.click('[aria-label="项目素材"]'); await page.waitForTimeout(1200); r.assets = await over();
    out[code] = r; await context.close();
  }
  console.log(JSON.stringify(out)); await browser.close();
})();
