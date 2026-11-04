// 用法: node shoot.cjs <outDir> <scale> [filter]
const { chromium } = require('playwright');
const path = require('path');
const [,, outDir, scale = '2', filter = ''] = process.argv;
const base = 'http://localhost:3000';
const schemes = [['A', 'sakura'], ['B', 'noir'], ['C', 'mist'], ['D', 'comic']];
const shots = [];
for (const [code, id] of schemes) {
  shots.push({ name: `${code}-1-项目管理`, url: `/design-preview?scheme=${id}&view=projects` });
  shots.push({ name: `${code}-2-视频创作-Agent`, url: `/design-preview?scheme=${id}&view=video&agent=1`, hover: '[aria-label="视频 雨夜渡口 重逢"]' });
  shots.push({ name: `${code}-3-项目资产`, url: `/design-preview?scheme=${id}&view=assets&collapsed=1` });
  shots.push({ name: `${code}-4-生成参数面板`, url: `/design-preview?scheme=${id}&view=video&params=1`, wait: 2200 });
  shots.push({ name: `${code}-5-视频详情`, url: `/design-preview?scheme=${id}&view=video&detail=v07`, wait: 2800 });
  shots.push({ name: `${code}-6-资产详情`, url: `/design-preview?scheme=${id}&view=assets&asset=a1&collapsed=1`, wait: 2800 });
}
shots.push({ name: `A-7-窄窗口-收起栏`, url: `/design-preview?scheme=sakura&view=video&rail=0&sidebar=0`, w: 1100, h: 760 });
shots.push({ name: `0-方案总览`, url: `/design-preview/overview`, full: true });
(async () => {
  const browser = await chromium.launch();
  const errors = {};
  for (const s of shots.filter(s => s.name.includes(filter))) {
    const page = await browser.newPage({ viewport: { width: s.w || 1440, height: s.h || 900 }, deviceScaleFactor: +scale });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    await page.goto(base + s.url, { waitUntil: 'networkidle', timeout: 120000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(s.wait || 1400);
    if (s.hover) { await page.hover(s.hover); await page.waitForTimeout(300); }
    await page.screenshot({ path: path.join(outDir, s.name + (scale === '1' ? '.png' : '.jpg')), fullPage: !!s.full, ...(scale === '1' ? {} : { type: 'jpeg', quality: 86 }) });
    if (errs.length) errors[s.name] = errs;
    await page.close();
  }
  console.log(JSON.stringify(errors, null, 1));
  await browser.close();
})();
