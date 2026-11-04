// 仅供 /design-preview 使用的虚构数据。不读取、不写入任何真实项目、素材或任务。
// 生产界面请继续使用 src/stores、src/services 中的真实状态和接口。

export type SceneKind = "harbor" | "rooftop" | "neon" | "classroom" | "forest" | "cafe" | "sky" | "station";

export type MockVideoState = "done" | "generating" | "failed" | "awaiting" | "node" | "empty" | "interpolating";

export interface MockVideo {
    id: string;
    number: string;
    groupNumber: number;
    folderId: string;
    title: string;
    scene: SceneKind;
    seed: number;
    state: MockVideoState;
    progress?: number;
    channel: "即梦" | "小云雀" | "Oii";
    model: string;
    seconds: number;
    ratio: string;
    resolution: string;
    fps: "不补帧" | "30 FPS" | "60 FPS";
    color?: "red" | "amber" | "green" | "blue" | "violet";
    note?: string;
    unread?: boolean;
    liked?: boolean;
    error?: string;
    createdAt: string;
    versions?: number;
}

export interface MockFolder {
    id: string;
    name: string;
    parentId: string;
    count: number;
}

export interface MockProject {
    id: string;
    name: string;
    groups: number;
    assets: number;
    folders: number;
    recent: string;
    covers: { scene: SceneKind; seed: number }[];
    busy?: boolean;
}

export const VIDEO_COLORS = [
    { id: "red", label: "需返工", hex: "#E5484D" },
    { id: "amber", label: "待审片", hex: "#F5A524" },
    { id: "green", label: "已定稿", hex: "#30A46C" },
    { id: "blue", label: "备选镜头", hex: "#3E7BFA" },
    { id: "violet", label: "补拍", hex: "#8E4EC6" },
] as const;

export const mockProjects: MockProject[] = [
    {
        id: "p-harbor",
        name: "雾港来信 · 第一季",
        groups: 48,
        assets: 126,
        folders: 9,
        recent: "11月4日 16:42",
        busy: true,
        covers: [
            { scene: "harbor", seed: 3 },
            { scene: "neon", seed: 7 },
            { scene: "rooftop", seed: 2 },
            { scene: "station", seed: 5 },
        ],
    },
    {
        id: "p-cafe",
        name: "猫咖不打烊",
        groups: 22,
        assets: 58,
        folders: 4,
        recent: "11月3日 21:10",
        covers: [
            { scene: "cafe", seed: 1 },
            { scene: "cafe", seed: 4 },
            { scene: "classroom", seed: 6 },
            { scene: "sky", seed: 2 },
        ],
    },
    {
        id: "p-kite",
        name: "纸鸢（试拍）",
        groups: 9,
        assets: 17,
        folders: 2,
        recent: "11月1日 09:05",
        covers: [
            { scene: "sky", seed: 8 },
            { scene: "forest", seed: 3 },
        ],
    },
    {
        id: "p-star",
        name: "星河便利店 · 竖屏版",
        groups: 31,
        assets: 74,
        folders: 6,
        recent: "10月29日 14:26",
        covers: [
            { scene: "station", seed: 9 },
            { scene: "neon", seed: 2 },
            { scene: "harbor", seed: 6 },
            { scene: "rooftop", seed: 8 },
        ],
    },
    {
        id: "p-empty",
        name: "青梅不营业（新建）",
        groups: 0,
        assets: 0,
        folders: 1,
        recent: "",
        covers: [],
    },
];

export const mockJimengProjects = [
    { id: "j-1", name: "雾港来信 · 即梦批量", path: "D:\\Drama\\雾港来信\\jimeng-batch", characters: 12, scenes: 18, audio: 9, failed: true },
    { id: "j-2", name: "猫咖不打烊 · 自动发送", path: "D:\\Drama\\猫咖不打烊\\auto-send", characters: 6, scenes: 7, audio: 4, failed: false },
];

export const mockFolders: MockFolder[] = [
    { id: "f-ep1", name: "第一集 · 雨夜重逢", parentId: "", count: 14 },
    { id: "f-ep1-a", name: "场景一 渡口", parentId: "f-ep1", count: 6 },
    { id: "f-ep1-b", name: "场景二 旧书店", parentId: "f-ep1", count: 8 },
    { id: "f-ep2", name: "第二集 · 天台的信", parentId: "", count: 12 },
    { id: "f-ep3", name: "第三集 · 末班电车", parentId: "", count: 9 },
    { id: "f-ep3-a", name: "镜头 3-1 至 3-12（长镜头合集·雨夜车站内外切换）", parentId: "f-ep3", count: 9 },
    { id: "f-trailer", name: "番外 · 预告片", parentId: "", count: 5 },
];

const base = { channel: "即梦" as const, model: "seedance 2.5 draft", seconds: 15, ratio: "16:9", resolution: "720P", fps: "30 FPS" as const };

export const mockVideos: MockVideo[] = [
    { ...base, id: "v01", number: "V01", groupNumber: 1, folderId: "f-ep1", title: "雨夜渡口 远景开场", scene: "harbor", seed: 1, state: "done", color: "green", note: "定稿：开场用这一版，伞面倾斜角度最好。", createdAt: "11-04 15:20", versions: 3 },
    { ...base, id: "v02", number: "V02", groupNumber: 2, folderId: "f-ep1", title: "沈既白 雾中走出", scene: "harbor", seed: 4, state: "done", unread: true, createdAt: "11-04 15:26", liked: true },
    { ...base, id: "v03", number: "V03", groupNumber: 3, folderId: "f-ep1", title: "林雾 特写 睫毛水珠", scene: "neon", seed: 2, state: "generating", progress: 64, createdAt: "11-04 16:40" },
    { ...base, id: "v04", number: "V04", groupNumber: 4, folderId: "f-ep1", title: "旧书店 推门", scene: "cafe", seed: 3, state: "done", color: "amber", note: "待审：门铃声偏早 0.5 秒", createdAt: "11-04 14:02" },
    { ...base, id: "v05", number: "V05", groupNumber: 5, folderId: "f-ep1", title: "书架间 对视", scene: "classroom", seed: 5, state: "failed", error: "审核未通过：画面包含疑似真实人物肖像，请调整参考图后重试", createdAt: "11-04 13:51" },
    { ...base, id: "v06", number: "V06", groupNumber: 6, folderId: "f-ep1", title: "信封 落地", scene: "cafe", seed: 8, state: "interpolating", createdAt: "11-04 16:12" },
    { ...base, id: "v07", number: "V07", groupNumber: 7, folderId: "f-ep1", title: "雨夜渡口 重逢", scene: "harbor", seed: 7, state: "done", color: "blue", unread: true, createdAt: "11-04 16:30", versions: 2 },
    { ...base, id: "v08", number: "V08", groupNumber: 8, folderId: "f-ep1", title: "天台 晚霞", scene: "rooftop", seed: 2, state: "node", channel: "小云雀", model: "seedance 2.0", createdAt: "11-04 12:18" },
    { ...base, id: "v09", number: "V09", groupNumber: 9, folderId: "f-ep1", title: "天台 风吹信纸", scene: "rooftop", seed: 6, state: "done", channel: "小云雀", model: "seedance 2.0", fps: "不补帧", createdAt: "11-03 22:10" },
    { ...base, id: "v10", number: "V10", groupNumber: 10, folderId: "f-ep1", title: "末班电车 进站", scene: "station", seed: 3, state: "done", color: "red", note: "返工：车厢灯光闪烁太频繁", createdAt: "11-03 21:44" },
    { ...base, id: "v11", number: "V11", groupNumber: 11, folderId: "f-ep1", title: "车窗倒影", scene: "station", seed: 8, state: "awaiting", channel: "Oii", model: "oii-motion-1", createdAt: "11-03 21:30" },
    { ...base, id: "v12", number: "V12", groupNumber: 12, folderId: "f-ep1", title: "霓虹街 奔跑", scene: "neon", seed: 6, state: "done", createdAt: "11-03 20:15", liked: true },
    { ...base, id: "v13", number: "V13", groupNumber: 13, folderId: "f-ep1", title: "森林小径 回忆", scene: "forest", seed: 1, state: "done", fps: "60 FPS", createdAt: "11-03 19:02" },
    { ...base, id: "v14", number: "V14", groupNumber: 14, folderId: "f-ep1", title: "风筝 飞过屋顶", scene: "sky", seed: 4, state: "empty", createdAt: "" },
    { ...base, id: "v15", number: "V15", groupNumber: 15, folderId: "f-ep1", title: "放学路 并肩", scene: "sky", seed: 7, state: "done", color: "violet", note: "补拍：需要一版侧面跟拍", createdAt: "11-03 18:40" },
    { ...base, id: "v16", number: "V16", groupNumber: 16, folderId: "f-ep1", title: "雨停 天光", scene: "forest", seed: 5, state: "done", createdAt: "11-03 18:12" },
];

export const mockGroups = mockVideos.map((v) => ({ id: v.number, title: v.title }));

export const longPrompt = `【视频编号V07｜第7组·雨夜渡口重逢】
镜头1（0-4s）：远景，雨夜渡口，霓虹在积水里碎成光斑，@林雾 居家睡衣外披风衣，撑着透明伞站在栈桥尽头，风把伞面吹得微微倾斜。
镜头2（4-9s）：中景缓推，@沈既白 西装 从雾里走出，大衣肩头落满雨珠，停在三步之外，两人之间只有雨声。
台词：林雾：“你迟到了七年。”
台词：沈既白：“我知道。所以这次，我把信亲手送来了。”
镜头3（9-15s）：特写，林雾睫毛上的水珠，眼神从平静到颤动；背景音 @雨声环境音 渐弱，@渡口汽笛 远远响起一声。
画面风格：日系赛璐璐动画，冷蓝与暖橙对比，胶片颗粒，浅景深，镜头轻微手持呼吸感。
负面要求：不要出现文字水印，不要改变人物发色，不要让伞变成不透明。`;

export interface MockReference {
    id: string;
    name: string;
    kind: "image" | "audio" | "video";
    portrait?: number;
    scene?: SceneKind;
    seed?: number;
    seconds?: number;
    missing?: boolean;
    disabled?: boolean;
}

export const mockReferences: MockReference[] = [
    { id: "r1", name: "林雾 居家睡衣", kind: "image", portrait: 0 },
    { id: "r2", name: "林雾 风衣", kind: "image", portrait: 1 },
    { id: "r3", name: "沈既白 西装", kind: "image", portrait: 2 },
    { id: "r4", name: "渡口 夜景", kind: "image", scene: "harbor", seed: 9 },
    { id: "r5", name: "雨声环境音", kind: "audio", seconds: 6.4 },
    { id: "r6", name: "渡口汽笛", kind: "audio", seconds: 3.2 },
    { id: "r7", name: "运镜参考·缓推", kind: "video", scene: "station", seed: 2, seconds: 4 },
    { id: "r8", name: "透明伞", kind: "image", missing: true },
];

export const portraitPalette = [
    { name: "林雾", hair: "#2B2F4A", skin: "#F6DCCB", outfit: "#C9D7F2", bg: ["#FBE3EA", "#E9EEFB"] },
    { name: "林雾 风衣", hair: "#2B2F4A", skin: "#F6DCCB", outfit: "#B48A63", bg: ["#F3E4D4", "#E2E9F5"] },
    { name: "沈既白", hair: "#1C1A1F", skin: "#EFD2BF", outfit: "#2E3542", bg: ["#DCE3EE", "#F2E8E0"] },
    { name: "阿槿", hair: "#8A4B3A", skin: "#F7DDCD", outfit: "#E7A6B7", bg: ["#FFE7EE", "#FFF4DC"] },
    { name: "老周", hair: "#9A9A9A", skin: "#E9C8B1", outfit: "#5D6B4F", bg: ["#E7EEDC", "#F4EEE3"] },
    { name: "小满", hair: "#E0A84E", skin: "#FBE3D3", outfit: "#7FB3D5", bg: ["#E3F2FB", "#FFF3E0"] },
];

export interface MockAsset {
    id: string;
    name: string;
    group: string;
    category: "人物" | "场景" | "道具" | "音频" | "视频";
    character?: string;
    portrait?: number;
    scene?: SceneKind;
    seed?: number;
    seconds?: number;
    priority?: 0 | 1 | 2;
    disabled?: boolean;
    aliases?: string[];
    variants?: number;
}

export const mockCharacters = [
    { id: "c-linwu", name: "林雾", portrait: 0, count: 14, pinned: true },
    { id: "c-shen", name: "沈既白", portrait: 2, count: 9, pinned: true },
    { id: "c-ajin", name: "阿槿", portrait: 3, count: 6 },
    { id: "c-zhou", name: "老周", portrait: 4, count: 3 },
    { id: "c-xiaoman", name: "小满（童年）", portrait: 5, count: 4 },
];

export const mockAssets: MockAsset[] = [
    { id: "a1", name: "林雾 居家睡衣", group: "林雾 · 日常", category: "人物", character: "c-linwu", portrait: 0, priority: 1, aliases: ["女主居家睡衣", "林雾睡衣"], variants: 4 },
    { id: "a2", name: "林雾 风衣", group: "林雾 · 外出", category: "人物", character: "c-linwu", portrait: 1, priority: 2, aliases: ["林雾外套"], variants: 3 },
    { id: "a3", name: "林雾 校服（回忆）", group: "林雾 · 回忆", category: "人物", character: "c-linwu", portrait: 5, variants: 2 },
    { id: "a4", name: "林雾 雨中湿发", group: "林雾 · 外出", category: "人物", character: "c-linwu", portrait: 0, variants: 2 },
    { id: "a5", name: "林雾 旧版发型", group: "林雾 · 日常", category: "人物", character: "c-linwu", portrait: 1, disabled: true },
    { id: "a6", name: "林雾 试妆", group: "林雾 · 日常", category: "人物", character: "c-linwu", portrait: 3, disabled: true },
    { id: "a7", name: "沈既白 西装", group: "沈既白 · 正装", category: "人物", character: "c-shen", portrait: 2, priority: 1, aliases: ["男主西装"], variants: 3 },
    { id: "s1", name: "渡口 夜景", group: "渡口", category: "场景", scene: "harbor", seed: 9, priority: 1, variants: 3 },
    { id: "s2", name: "旧书店 内景", group: "旧书店", category: "场景", scene: "cafe", seed: 2, variants: 2 },
    { id: "s3", name: "天台 黄昏", group: "天台", category: "场景", scene: "rooftop", seed: 4 },
    { id: "s4", name: "末班电车站台", group: "车站", category: "场景", scene: "station", seed: 1, variants: 4 },
    { id: "s5", name: "霓虹街", group: "街道", category: "场景", scene: "neon", seed: 5 },
    { id: "s6", name: "森林小径（旧）", group: "森林", category: "场景", scene: "forest", seed: 2, disabled: true },
    { id: "d1", name: "透明伞", group: "道具", category: "道具", scene: "sky", seed: 3 },
    { id: "d2", name: "七年前的信", group: "道具", category: "道具", scene: "cafe", seed: 6, priority: 1 },
    { id: "au1", name: "雨声环境音", group: "环境音", category: "音频", seconds: 6.4, priority: 1 },
    { id: "au2", name: "渡口汽笛", group: "环境音", category: "音频", seconds: 3.2 },
    { id: "au3", name: "林雾 声线·轻声", group: "林雾", category: "音频", character: "c-linwu", seconds: 9.8 },
    { id: "vd1", name: "运镜参考·缓推", group: "运镜", category: "视频", scene: "station", seed: 2, seconds: 4 },
];

export interface MockAgentMessage {
    id: string;
    role: "user" | "assistant" | "status";
    text: string;
    patch?: { before: string; after: string };
    paused?: boolean;
}

export const mockAgentMessages: MockAgentMessage[] = [
    { id: "m1", role: "user", text: "V07 生成出来两个人站得太近，雨也不够大。帮我改提示词，保持台词不变。" },
    {
        id: "m2",
        role: "assistant",
        text: "我只改了镜头2的站位和镜头1的雨势描述，台词和参考素材保持不变：",
        patch: {
            before: "停在三步之外，两人之间只有雨声。",
            after: "停在约五步之外的栈桥另一端，雨幕在两人之间拉出清晰的纵深，只听得见雨声。",
        },
    },
    { id: "m3", role: "user", text: "可以，再把镜头3的特写时间缩短到 4 秒" },
    { id: "m4", role: "status", text: "已暂停思考", paused: true },
];

export const agentQuickCommands = ["精简到 15 秒", "强化运镜", "保留台词只改画面", "检查素材引用", "改成竖屏构图"];

export const runningTasks = [
    { id: "v03", title: "V03 林雾 特写 睫毛水珠", project: "雾港来信 · 第一季", phase: "生成中", progress: 64 },
    { id: "v06", title: "V06 信封 落地", project: "雾港来信 · 第一季", phase: "补帧中 30 FPS" },
    { id: "v11", title: "V11 车窗倒影", project: "雾港来信 · 第一季", phase: "结果待核对" },
];
