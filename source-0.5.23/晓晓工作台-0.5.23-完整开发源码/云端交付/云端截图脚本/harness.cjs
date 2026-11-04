// 生产界面渲染与交互检查：在测试浏览器中注入假 desktopBridge、拦截 /api，并向 IndexedDB 写入虚构项目与视频。
// 用法：node harness.cjs <outDir> <scale> <skins:A,B,C,D> [steps]
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const seed = require("./seed.cjs");
const [, , outDir, scale = "1", skinArg = "A,B,C,D", stepArg = "all"] = process.argv;
const BASE = "http://localhost:3000";
const SKINS = { A: ["pink", "light", "暖樱粉"], B: ["neutral", "dark", "影视暗房"], C: ["neutral", "light", "云母白"], D: ["comic", "light", "漫画分镜"] };
fs.mkdirSync(outDir, { recursive: true });

function initScript({ skin, theme }) {
    const ok = { ok: true, projects: [], runs: [], items: [], models: [], logged_in: false };
    const special = {
        readRecent: async () => ({ projects: [] }),
        inspectProject: async () => ({ project: {}, counts: {} }),
        readRuns: async () => ({ runs: [] }),
        pippitStatus: async () => ({ logged_in: false }),
        chooseDirectory: async () => "",
        dreaminaAccounts: async () => ({ activeProfile: "default", revision: 1, accounts: [{ profile: "default", name: "测试账号", category: "默认" }] }),
        dreaminaStatus: async () => ({ logged_in: false }),
        dreaminaCanvasStatus: async () => ({ logged_in: false }),
        dreaminaCanvasSettings: async () => null,
        dreaminaModels: async () => ({ models: [], modelCapabilities: {} }),
        dreaminaInterpolationStatus: async () => ({}),
        localVideoTaskStates: async () => [],
        videoStudioResolve: async () => null,
        dialogConfirm: async () => true,
        onVideoCompletionClick: () => () => {},
        pippitCredits: async () => ({ balance: 1280 }),
        pippitOfficialStatus: async () => ({ logged_in: false }),
        oiioiiStatus: async () => ({ logged_in: false }),
    };
    window.__harnessBridgeCalls = [];
    window.desktopBridge = new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : key === "isDesktop" ? true : special[key] || (async (...args) => { window.__harnessBridgeCalls.push(String(key)); return { ...ok }; })) });
    try { localStorage.setItem("infinite-canvas:theme_store", JSON.stringify({ state: { theme, skin }, version: 1 })); } catch {}
}

async function paintAndSeed(page) {
    await page.evaluate(async seedData => {
        const STORES = ["video_studio", "video_generation_logs", "video_posters", "app_state"];
        const open = version => new Promise((resolve, reject) => {
            const request = version ? indexedDB.open("infinite-canvas", version) : indexedDB.open("infinite-canvas");
            request.onupgradeneeded = () => { for (const s of STORES) if (!request.result.objectStoreNames.contains(s)) request.result.createObjectStore(s); };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        let db = await open();
        if (STORES.some(s => !db.objectStoreNames.contains(s))) { const v = db.version + 1; db.close(); db = await open(v); }
        const put = (store, key, value) => new Promise((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
        const palettes = { harbor: ["#0e1a33", "#24365e", "#5c5a86", "#ffb46b"], rooftop: ["#3a2e6b", "#e66f7e", "#ffc48a", "#ffe0a6"], neon: ["#120f24", "#2a1b45", "#40265c", "#ff5fa2"], classroom: ["#f6e7d2", "#f3d9b8", "#e9c49a", "#fff3d6"], forest: ["#163828", "#2f6b4a", "#9acb8c", "#e8f7c8"], cafe: ["#3b2418", "#7a4a30", "#c98a58", "#ffd49a"], sky: ["#7db7f0", "#b8d9f7", "#fde6ef", "#ffffff"], station: ["#0d1420", "#1c2a3d", "#3b4e66", "#9fe0ff"] };
        const rand = s => () => ((s = (s * 9301 + 49297) % 233280) / 233280);
        for (const poster of seedData.posters) {
            const c = new OffscreenCanvas(640, 360), g = c.getContext("2d"), p = palettes[poster.scene] || palettes.harbor, r = rand(poster.seed * 13 + 7);
            const sky = g.createLinearGradient(0, 0, 0, 360); sky.addColorStop(0, p[0]); sky.addColorStop(0.55, p[1]); sky.addColorStop(1, p[2]); g.fillStyle = sky; g.fillRect(0, 0, 640, 360);
            const mx = 100 + r() * 440, my = 50 + r() * 60, glow = g.createRadialGradient(mx, my, 0, mx, my, 140); glow.addColorStop(0, p[3] + "cc"); glow.addColorStop(1, p[3] + "00"); g.fillStyle = glow; g.fillRect(0, 0, 640, 360);
            g.fillStyle = p[3]; g.beginPath(); g.arc(mx, my, 18, 0, Math.PI * 2); g.fill();
            const horizon = 220 + r() * 30;
            for (let i = 0; i < 10; i++) { const x = i * 66 - 10 + r() * 20, h = 50 + r() * 100; g.fillStyle = "rgba(8,10,20," + (0.65 + (i % 3) * 0.1) + ")"; g.fillRect(x, horizon - h, 60, h); g.fillStyle = p[3]; for (let j = 0; j < 6; j++) if (r() > 0.5) g.fillRect(x + 8 + (j % 2) * 26, horizon - h + 10 + Math.floor(j / 2) * 18, 7, 9); }
            const ground = g.createLinearGradient(0, horizon, 0, 360); ground.addColorStop(0, "rgba(5,8,16,.85)"); ground.addColorStop(1, "#05070d"); g.fillStyle = ground; g.fillRect(0, horizon, 640, 360 - horizon);
            g.fillStyle = "rgba(255,255,255,.35)"; for (let i = 0; i < 7; i++) g.fillRect(mx - 40 + r() * 80, horizon + 10 + i * 12, 30 + r() * 60, 2);
            const fx = 220 + r() * 200; g.fillStyle = "#06060c"; g.beginPath(); g.ellipse(fx, horizon - 74, 10, 12, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(fx - 18, horizon); g.quadraticCurveTo(fx - 20, horizon - 52, fx, horizon - 62); g.quadraticCurveTo(fx + 20, horizon - 52, fx + 18, horizon); g.fill();
            g.strokeStyle = "rgba(200,220,255,.35)"; g.lineWidth = 1; for (let i = 0; i < 40; i++) { const x = r() * 640, y = r() * 360; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 16); g.stroke(); }
            await put("video_posters", poster.key, await c.convertToBlob({ type: "image/png" }));
        }
        const hairs = ["#2b2f4a", "#2b2f4a", "#1c1a1f", "#8a4b3a", "#9a9a9a", "#e0a84e"], outfits = ["#c9d7f2", "#b48a63", "#2e3542", "#e7a6b7", "#5d6b4f", "#7fb3d5"], bgs = [["#fbe3ea", "#e9eefb"], ["#f3e4d4", "#e2e9f5"], ["#dce3ee", "#f2e8e0"], ["#ffe7ee", "#fff4dc"], ["#e7eedc", "#f4eee3"], ["#e3f2fb", "#fff3e0"]];
        const toDataUrl = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
        const portrait = async i => {
            const c = new OffscreenCanvas(360, 480), g = c.getContext("2d"), bg = g.createLinearGradient(0, 0, 360, 480); bg.addColorStop(0, bgs[i][0]); bg.addColorStop(1, bgs[i][1]); g.fillStyle = bg; g.fillRect(0, 0, 360, 480);
            g.fillStyle = "rgba(255,255,255,.4)"; g.beginPath(); g.arc(285, 80, 56, 0, Math.PI * 2); g.fill();
            g.fillStyle = hairs[i]; g.beginPath(); g.ellipse(180, 200, 104, 128, 0, 0, Math.PI * 2); g.fill(); g.fillRect(76, 200, 208, 130);
            g.fillStyle = outfits[i]; g.beginPath(); g.moveTo(20, 480); g.quadraticCurveTo(40, 330, 180, 318); g.quadraticCurveTo(320, 330, 340, 480); g.fill();
            g.fillStyle = "#f6dccb"; g.fillRect(150, 280, 60, 50); g.beginPath(); g.ellipse(180, 214, 74, 86, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = hairs[i]; g.beginPath(); g.moveTo(104, 200); g.quadraticCurveTo(110, 110, 180, 112); g.quadraticCurveTo(252, 110, 256, 204); g.quadraticCurveTo(220, 160, 190, 168); g.quadraticCurveTo(160, 150, 130, 176); g.closePath(); g.fill();
            for (const x of [150, 210]) { g.fillStyle = "#2a2236"; g.beginPath(); g.ellipse(x, 222, 11, 15, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(x + 4, 216, 4, 0, Math.PI * 2); g.fill(); }
            g.strokeStyle = "#c2706f"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(168, 262); g.quadraticCurveTo(180, 270, 192, 262); g.stroke();
            g.fillStyle = "rgba(242,155,168,.45)"; for (const x of [128, 232]) { g.beginPath(); g.ellipse(x, 248, 13, 7, 0, 0, Math.PI * 2); g.fill(); }
            return toDataUrl(await c.convertToBlob({ type: "image/png" }));
        };
        const sceneUrl = async (scene, seedNo) => {
            const c = new OffscreenCanvas(480, 300), g = c.getContext("2d"), p = palettes[scene] || palettes.harbor, r = rand(seedNo * 17 + 3);
            const sky = g.createLinearGradient(0, 0, 0, 300); sky.addColorStop(0, p[0]); sky.addColorStop(0.6, p[1]); sky.addColorStop(1, p[2]); g.fillStyle = sky; g.fillRect(0, 0, 480, 300);
            g.fillStyle = p[3]; g.beginPath(); g.arc(120 + r() * 240, 60, 16, 0, Math.PI * 2); g.fill();
            for (let i = 0; i < 8; i++) { const x = i * 62 - 6, h = 50 + r() * 90; g.fillStyle = "rgba(8,10,20,.75)"; g.fillRect(x, 200 - h, 56, h); }
            g.fillStyle = "#05070d"; g.fillRect(0, 200, 480, 100);
            return toDataUrl(await c.convertToBlob({ type: "image/png" }));
        };
        const stamp = new Date(seedData.now).toISOString();
        const assets = [];
        for (const [index, def] of seedData.assetDefs.entries()) {
            const dataUrl = def.portrait !== undefined ? await portrait(def.portrait) : await sceneUrl(def.scene, index);
            assets.push({ id: def.id, kind: "image", title: def.title, coverUrl: dataUrl, tags: [], category: def.category, createdAt: stamp, updatedAt: stamp, metadata: {}, data: { dataUrl, width: def.portrait !== undefined ? 360 : 480, height: def.portrait !== undefined ? 480 : 300, bytes: dataUrl.length, mimeType: "image/png" } });
        }
        await put("app_state", "infinite-canvas:asset_store", JSON.stringify({ state: { assets }, version: 0 }));
        await put("video_studio", "video-studio-projects", JSON.stringify({ state: seedData.studio, version: 0 }));
        for (const log of seedData.logs) await put("video_generation_logs", log.id, log);
        db.close();
    }, seed);
}

async function newPage(browser, skinCode, opts = {}) {
    const [skin, theme] = SKINS[skinCode];
    const context = await browser.newContext({ viewport: { width: opts.width || 1440, height: opts.height || 900 }, deviceScaleFactor: +scale });
    await context.addInitScript(initScript, { skin, theme });
    let agentHold = null;
    // Playwright 按注册的相反顺序匹配：先注册兜底，再注册具体接口。
    await context.route("**/api/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: null }) }));
    await context.route("**/api/settings**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: {} }) }));
    await context.route("**/api/codex-agent/settings", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, settings: { provider: "codex", codexModel: "gpt-5.2" } }) }));
    await context.route("**/api/codex-agent", async route => {
        if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, available: true, authenticated: true, source: "harness", models: [{ slug: "gpt-5.2", name: "GPT-5.2" }] }) });
        const body = JSON.parse(route.request().postData() || "{}");
        await new Promise(resolve => { agentHold = resolve; setTimeout(resolve, opts.agentDelay ?? 2200); });
        const prompt = String(body.currentPrompt || "").replace("停在三步之外，两人之间只有雨声。", "停在约五步之外的栈桥另一端，雨幕在两人之间拉出清晰的纵深，只听得见雨声。").replace("镜头1（0-4s）：远景", "镜头1（0-4s）：大远景，雨势更大");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, prompt, summary: "（测试替身回复）只改了镜头1的雨势和镜头2的站位，台词与参考素材保持不变。", changes: ["镜头1：远景 → 大远景，雨势加大", "镜头2：两人距离拉开到约五步"], params: {} }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push("PAGEERROR " + e.message.slice(0, 240) + " @ " + String(e.stack||"").split("\n").slice(1,6).join(" | ").slice(0,700)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 240)); });
    await page.goto(BASE + "/logo.svg", { timeout: 120000 });
    await paintAndSeed(page);
    return { context, page, errors, release: () => agentHold && agentHold() };
}

const hideDev = page => page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
const shot = async (page, name) => { const file = path.join(outDir, name + (scale === "1" ? ".png" : ".jpg")); await page.screenshot({ path: file, ...(scale === "1" ? {} : { type: "jpeg", quality: 86 }) }); return file; };

(async () => {
    const browser = await chromium.launch();
    const report = {};
    for (const code of skinArg.split(",")) {
        const steps = stepArg === "all" ? ["projects", "video", "agent", "modal", "assets"] : stepArg.split("+");
        const { context, page, errors, release } = await newPage(browser, code);
        const log = [];
        try {
            if (steps.includes("projects")) {
                await page.goto(BASE + "/projects", { waitUntil: "load", timeout: 240000 });
                await page.waitForSelector(".project-v2-card", { timeout: 90000 });
                await hideDev(page); await page.waitForTimeout(1500);
                await page.hover(".project-v2-card >> nth=0"); await page.waitForTimeout(400);
                log.push(await shot(page, code + "-1-项目管理"));
            }
            if (steps.includes("video") || steps.includes("agent")) {
                await page.goto(BASE + "/video?project=" + seed.PROJECT, { waitUntil: "load", timeout: 240000 });
                await page.waitForSelector("[data-video-tile]", { timeout: 90000 });
                await hideDev(page); await page.waitForTimeout(2500);
                const dataSkin = await page.evaluate(() => document.documentElement.dataset.skin + (document.documentElement.classList.contains("dark") ? "+dark" : ""));
                log.push("skin=" + dataSkin);
                // 1440 宽窗口下顶部工具栏须保持单行（包内 layout-refinements 检查要求 ≤56px）。
                log.push("toolbar-height=" + await page.evaluate(() => Math.round(document.querySelector("[data-video-toolbar]").getBoundingClientRect().height)));
                await page.hover('[data-generation-attempt="log-v07"]'); await page.waitForTimeout(500);
                log.push(await shot(page, code + "-2-视频创作"));
            }
            if (steps.includes("agent")) {
                await page.click('[data-generation-attempt="log-v07"] [aria-label^="发给 Agent"]', { force: true });
                await page.waitForSelector("[data-codex-agent-panel]", { timeout: 30000 });
                const anim = await page.evaluate(() => getComputedStyle(document.querySelector("[data-codex-agent-panel]")).animationName);
                log.push("agent-open-animation=" + anim);
                await page.waitForTimeout(700);
                log.push("linked-tiles=" + await page.evaluate(() => document.querySelectorAll("[data-video-tile][data-agent-target]").length));
                await page.fill('[aria-label="Agent 修改指令输入"]', "V07 两个人站得太近，雨也不够大，帮我改提示词，台词不变。");
                await page.click('[aria-label="发送给 Agent"]');
                await page.waitForSelector('[aria-label="暂停 Agent 思考"]', { timeout: 10000 });
                await page.waitForTimeout(900);
                log.push(await shot(page, code + "-3-Agent思考中"));
                await page.waitForSelector('[data-agent-reply][data-status="done"]', { timeout: 20000 });
                await page.waitForTimeout(350);
                log.push("composer-pulse=" + await page.evaluate(() => Boolean(document.querySelector("[data-composer-floating][data-agent-pulse]"))));
                log.push("diff-lines=" + await page.evaluate(() => document.querySelectorAll("[data-agent-diff] .wb-diff-line").length));
                log.push("editor-updated=" + await page.evaluate(() => (document.querySelector("[data-prompt-reference-editor]")?.textContent || "").includes("约五步之外")));
                await page.waitForTimeout(500);
                log.push(await shot(page, code + "-4-Agent回复对比"));
                const locate = await page.$('[aria-label="在视频台定位当前目标"]');
                if (locate) { await locate.click(); await page.waitForTimeout(450); log.push("flash=" + await page.evaluate(() => document.querySelectorAll("[data-agent-flash]").length)); }
                // 拖动交界处调宽
                const handle = await page.$("[data-agent-resizer]");
                if (handle) { const b = await handle.boundingBox(); await page.mouse.move(b.x + 4, b.y + 300); await page.mouse.down(); await page.mouse.move(b.x + 90, b.y + 300, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400); log.push("agent-width=" + await page.evaluate(() => Math.round(document.querySelector("[data-codex-agent-panel]").getBoundingClientRect().width))); }
                await page.evaluate(() => { window.__agentStates = []; const t0 = performance.now(); const record = () => { const el = document.querySelector("[data-codex-agent-panel]"); const state = el ? el.dataset.state : "removed"; const last = window.__agentStates[window.__agentStates.length - 1]; if (!last || last.state !== state) window.__agentStates.push({ state, ms: Math.round(performance.now() - t0) }); }; new MutationObserver(record).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] }); record(); });
                await page.click('button[aria-label="收起 Agent 侧边栏"]');
                await page.waitForTimeout(600);
                log.push("close-timeline=" + JSON.stringify(await page.evaluate(() => window.__agentStates)));
                await page.waitForFunction(() => !document.querySelector("[data-codex-agent-panel]"), null, { timeout: 5000 });
                log.push("panel-removed-after-close=true");
            }
            if (steps.includes("modal")) {
                // 弹窗底色：影视暗房须为 rgb(29, 31, 35)、云母白为白色（包内 video-recovery 检查“弹窗配色同步”）。
                await page.evaluate(() => document.querySelector('[data-generation-attempt="log-v07"] [data-video-drag-surface]')?.click());
                await page.waitForSelector(".ant-modal-container", { timeout: 15000 });
                await page.waitForTimeout(400);
                log.push("modal-bg=" + await page.evaluate(() => getComputedStyle(document.querySelector(".ant-modal-container")).backgroundColor));
                await page.keyboard.press("Escape");
                await page.waitForTimeout(400);
            }
            if (steps.includes("assets")) {
                await page.click('[aria-label="项目素材"]');
                await page.waitForTimeout(1500);
                log.push(await shot(page, code + "-5-项目资产"));
            }
        } catch (e) {
            log.push("ERROR " + e.message.split("\n")[0]);
            await shot(page, code + "-error").catch(() => {});
        }
        report[code] = { log, errors: errors.filter(e => !/favicon|DevTools/.test(e)).slice(0, 12) };
        await context.close();
    }
    console.log(JSON.stringify(report, null, 1));
    await browser.close();
})();
