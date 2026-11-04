// 生产界面渲染测试用的虚构数据（只写入测试浏览器的 IndexedDB / localStorage，不进入源码）。
const now = Date.parse("2026-11-04T16:40:00+08:00");
const PROJECT = "p-harbor";
const folders = [
    { id: "f-ep1", name: "第一集 · 雨夜重逢", parentId: "" },
    { id: "f-ep1-a", name: "场景一 渡口", parentId: "f-ep1" },
    { id: "f-ep1-b", name: "场景二 旧书店", parentId: "f-ep1" },
    { id: "f-ep2", name: "第二集 · 天台的信", parentId: "" },
    { id: "f-ep3", name: "第三集 · 末班电车", parentId: "" },
    { id: "f-trailer", name: "番外 · 预告片", parentId: "" },
];
const scenes = ["harbor", "harbor", "neon", "cafe", "classroom", "cafe", "harbor", "rooftop", "rooftop", "station", "station", "neon", "forest", "sky", "sky", "forest"];
const titles = ["雨夜渡口 远景开场", "沈既白 雾中走出", "林雾 特写 睫毛水珠", "旧书店 推门", "书架间 对视", "信封 落地", "雨夜渡口 重逢", "天台 晚霞", "天台 风吹信纸", "末班电车 进站", "车窗倒影", "霓虹街 奔跑", "森林小径 回忆", "风筝 飞过屋顶", "放学路 并肩", "雨停 天光"];
const basePrompt = (n, t) => `【视频编号V${String(n).padStart(2, "0")}｜第${n}组·${t}】\n镜头1（0-4s）：远景，雨夜渡口，霓虹在积水里碎成光斑，@林雾 居家睡衣外披风衣，撑着透明伞站在栈桥尽头。\n镜头2（4-9s）：中景缓推，@沈既白 西装 从雾里走出，停在三步之外，两人之间只有雨声。\n台词：林雾：“你迟到了七年。”\n画面风格：日系赛璐璐动画，冷蓝与暖橙对比，胶片颗粒，浅景深。`;
const status = i => (i === 2 ? "生成中" : i === 4 ? "失败" : i === 10 ? "待核对" : "成功");
const logs = titles.map((title, i) => {
    const n = i + 1, id = "log-v" + String(n).padStart(2, "0"), ok = status(i) === "成功";
    return {
        id, createdAt: now - (16 - i) * 600000, title, prompt: basePrompt(n, title), time: "11-04 " + String(10 + Math.floor(i / 2)).padStart(2, "0") + ":" + String((i * 7) % 60).padStart(2, "0"),
        model: i % 5 === 3 ? "seedance_2.0" : "seedance_2.5_draft", config: { videoChannelId: "local-dreamina-canvas" }, references: [], videoReferences: [], audioReferences: [],
        durationMs: 15000, size: "16:9", resolution: "720p", seconds: "15", status: status(i),
        task: status(i) === "生成中" ? { id: "dreamina-canvas:mock-" + n, status: "processing", progress: 64 } : status(i) === "待核对" ? { id: "dreamina-canvas:mock-" + n, status: "processing" } : { id: "dreamina-canvas:mock-" + n, status: ok ? "succeeded" : "failed" },
        error: status(i) === "失败" ? "审核未通过：画面包含疑似真实人物肖像，请调整参考图后重试" : undefined,
        video: ok ? { id: "vid-" + n, url: "", storageKey: "mock/v" + n + ".mp4", durationMs: 15000, width: 1280, height: 720, bytes: 100000 + n, mimeType: "video/mp4" } : undefined,
    };
});
const groups = titles.map((title, i) => ({ id: "g-v" + String(i + 1).padStart(2, "0"), number: "V" + String(i + 1).padStart(2, "0"), title, prompt: basePrompt(i + 1, title), projectId: PROJECT, folderId: "f-ep1", createdAt: now - (17 - i) * 600000, logIds: [logs[i].id] }));
const colors = { 0: "green", 3: "amber", 6: "blue", 9: "red", 14: "violet" };
const placements = Object.fromEntries(logs.map((log, i) => [log.id, { projectId: PROJECT, folderId: "f-ep1", review: "none", ...(colors[i] ? { color: colors[i] } : {}), ...(i === 1 || i === 11 ? { liked: true } : {}), ...(i === 0 ? { note: "定稿：开场用这一版" } : {}), lastViewedAt: i === 6 || i === 1 ? undefined : now }]));
const otherProjects = [
    { id: "p-cafe", name: "猫咖不打烊", brief: "", folders: [{ id: "c-1", name: "第一集", parentId: "" }], elementIds: [] },
    { id: "p-kite", name: "纸鸢（试拍）", brief: "", folders: [], elementIds: [] },
    { id: "p-star", name: "星河便利店 · 竖屏版", brief: "", folders: [], elementIds: [] },
];
const studio = {
    projects: [{ id: PROJECT, name: "雾港来信 · 第一季", brief: "", folders, elementIds: [], videoColorLabels: { green: "已定稿", amber: "待审片", blue: "备选镜头", red: "需返工", violet: "补拍" } }, ...otherProjects],
    placements, activeProjectId: PROJECT, folderId: "f-ep1", groups, removedGroups: [], groupElementIds: {},
    drafts: {}, views: { [PROJECT]: { section: "results", layout: "grid", columns: 4, composerVisible: true, sidebar: true, sidebarWidth: 236 } }, selectedFolders: { [PROJECT]: "f-ep1" },
};
const assetDefs = [
    { id: "as-linwu-home", title: "林雾-居家睡衣", category: "人物", portrait: 0 },
    { id: "as-linwu-coat", title: "林雾-风衣", category: "人物", portrait: 1 },
    { id: "as-linwu-school", title: "林雾-校服回忆", category: "人物", portrait: 5 },
    { id: "as-linwu-old", title: "林雾-旧版发型", category: "人物", portrait: 3 },
    { id: "as-shen-suit", title: "沈既白-西装", category: "人物", portrait: 2 },
    { id: "as-shen-coat", title: "沈既白-大衣", category: "人物", portrait: 4 },
    { id: "as-ajin", title: "阿槿-便装", category: "人物", portrait: 3 },
    { id: "as-dock", title: "渡口-夜景", category: "场景", scene: "harbor" },
    { id: "as-shop", title: "旧书店-内景", category: "场景", scene: "cafe" },
    { id: "as-roof", title: "天台-黄昏", category: "场景", scene: "rooftop" },
    { id: "as-station", title: "末班电车站台", category: "场景", scene: "station" },
    { id: "as-umbrella", title: "透明伞", category: "道具", scene: "sky" },
];
studio.projects[0].elementIds = assetDefs.map(a => a.id);
studio.projects[0].elementRules = { "as-linwu-home": { priority: 1, priorityOrder: 1 }, "as-shen-suit": { priority: 1, priorityOrder: 2 }, "as-linwu-old": { disabled: true, disabledAt: now } };
const posters = logs.filter(l => l.video).map((l, i) => ({ key: l.video.storageKey + ":" + l.video.bytes, scene: scenes[logs.indexOf(l)], seed: i + 3 }));
module.exports = { PROJECT, studio, logs, posters, assetDefs, now, revisedPrompt: logs[6].prompt.replace("停在三步之外，两人之间只有雨声。", "停在约五步之外的栈桥另一端，雨幕在两人之间拉出清晰的纵深，只听得见雨声。").replace("镜头1（0-4s）：远景", "镜头1（0-4s）：大远景，雨势更大") };
