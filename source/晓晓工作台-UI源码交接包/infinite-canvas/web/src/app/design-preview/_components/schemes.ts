// 设计方案元信息与 Ant Design 主题。仅预览使用；选定方案后再迁移到 src/lib/app-theme.ts 与 workbench-v2.css。
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

export type SchemeId = "sakura" | "noir" | "mist" | "comic";

export interface SchemeMeta {
    id: SchemeId;
    code: string;
    name: string;
    tagline: string;
    summary: string;
    points: string[];
    swatches: string[];
    dark: boolean;
    ruleNote: string;
}

export const SCHEMES: SchemeMeta[] = [
    {
        id: "sakura",
        code: "A",
        name: "柔粉精修",
        tagline: "沿用现有柔粉方案 A，做层级和细节精修",
        summary: "保留暖樱粉品牌色与浅暖底色，统一圆角、间距、阴影与字号层级；提示词面板改为柔和毛玻璃浮层，选中态更清楚。改动最小、最容易接回。",
        points: ["品牌色 #C93A64 不变，强调态改为浅粉胶囊", "卡片 12px 圆角，视频卡片保持直角纯画面", "顶部栏与工具栏更紧凑，信息分组更清晰"],
        swatches: ["#FBF7F6", "#FFFFFF", "#F3EAEB", "#FBE3EA", "#C93A64", "#2A1F23"],
        dark: false,
        ruleNote: "符合功能保留规则第 7 条（沿用柔粉方案 A），可直接作为默认皮肤。",
    },
    {
        id: "noir",
        code: "B",
        name: "夜幕放映室",
        tagline: "深色影院风，让画面成为主角",
        summary: "近黑底色配玫瑰粉强调与琥珀辅助色，降低界面存在感，长时间审片不刺眼；细线分隔、半透明浮层，生成状态用发光进度表达。",
        points: ["深底 #0F0E13，视频和封面对比度最高", "玫瑰粉 #FF6B8B 延续品牌，琥珀色标注生成中", "适合夜间审片、批量对比镜头"],
        swatches: ["#0F0E13", "#17151C", "#211E27", "#FF6B8B", "#F5B547", "#EEE9F1"],
        dark: true,
        ruleNote: "作为第 7 条之外的新风格，需要你明确批准后才替换默认；也可作为“影视暗房”皮肤并存。",
    },
    {
        id: "mist",
        code: "C",
        name: "雾白工作室",
        tagline: "中性极简，专业工具感",
        summary: "冷灰白底、墨黑文字、靛蓝作为唯一强调色；边框更轻、密度更高，一屏能看到更多视频与参数，适合高频操作。",
        points: ["中性灰阶 + 靛蓝 #5B5BD6 单一强调色", "控件高度 32px，信息密度更高", "与现有“云母白”皮肤同方向，可升级替换"],
        swatches: ["#F5F5F6", "#FFFFFF", "#EDEDEF", "#E9E9FB", "#5B5BD6", "#18181B"],
        dark: false,
        ruleNote: "作为第 7 条之外的新风格，需要你明确批准；也可作为“云母白”皮肤的升级版并存。",
    },
    {
        id: "comic",
        code: "D",
        name: "漫画分镜",
        tagline: "贴合 AI 漫剧题材的个性方案",
        summary: "米白纸张底色、墨线描边、硬投影与网点纹理，番茄红为主色、明黄做高亮；像在分镜稿上工作，辨识度最高。",
        points: ["墨线 1.5px 描边 + 3px 硬投影", "番茄红 #E8452C 主色，明黄 #FFC93C 高亮", "标题使用加粗字重和网点装饰"],
        swatches: ["#FBF5E9", "#FFFDF7", "#F3E9D4", "#FFC93C", "#E8452C", "#1B1A17"],
        dark: false,
        ruleNote: "风格变化最大，需要你明确批准；建议先在项目管理页和资产库试用。",
    },
];

export const schemeById = (id: SchemeId) => SCHEMES.find((s) => s.id === id) || SCHEMES[0];

const FONT = '"PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC","WenQuanYi Zen Hei","Helvetica Neue",sans-serif';

export function schemeAntTheme(id: SchemeId): ThemeConfig {
    const shared = { fontFamily: FONT, motionDurationMid: "0.16s", motionEaseInOut: "cubic-bezier(.2,.7,.2,1)" };
    if (id === "noir")
        return {
            algorithm: antdTheme.darkAlgorithm,
            cssVar: { key: "dp-noir" },
            token: {
                ...shared,
                colorPrimary: "#FF6B8B",
                colorInfo: "#FF6B8B",
                colorLink: "#FF8FA8",
                colorTextLightSolid: "#1A0B11",
                colorBgBase: "#0F0E13",
                colorBgLayout: "#0F0E13",
                colorBgContainer: "#17151C",
                colorBgElevated: "#211E27",
                colorText: "#EEE9F1",
                colorTextSecondary: "#B9B1C2",
                colorTextTertiary: "#8C8496",
                colorBorder: "rgba(255,255,255,.12)",
                colorBorderSecondary: "rgba(255,255,255,.08)",
                colorFillSecondary: "rgba(255,255,255,.06)",
                colorFillTertiary: "rgba(255,255,255,.04)",
                borderRadius: 8,
                borderRadiusLG: 12,
                borderRadiusSM: 6,
                controlHeight: 34,
                boxShadow: "0 24px 70px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.06)",
                boxShadowSecondary: "0 24px 70px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.06)",
            },
            components: { Button: { primaryShadow: "none", defaultShadow: "none" }, Select: { optionSelectedBg: "rgba(255,107,139,.16)", optionSelectedColor: "#FFD3DD" } },
        };
    if (id === "mist")
        return {
            algorithm: antdTheme.defaultAlgorithm,
            cssVar: { key: "dp-mist" },
            token: {
                ...shared,
                colorPrimary: "#5B5BD6",
                colorInfo: "#5B5BD6",
                colorLink: "#5B5BD6",
                colorBgLayout: "#F5F5F6",
                colorBgContainer: "#FFFFFF",
                colorText: "#18181B",
                colorTextSecondary: "#52525B",
                colorTextTertiary: "#71717A",
                colorBorder: "#E4E4E7",
                colorBorderSecondary: "#EDEDEF",
                borderRadius: 7,
                borderRadiusLG: 10,
                borderRadiusSM: 5,
                controlHeight: 32,
                boxShadow: "0 16px 48px -16px rgba(24,24,27,.22), 0 0 0 1px rgba(24,24,27,.06)",
                boxShadowSecondary: "0 16px 48px -16px rgba(24,24,27,.22), 0 0 0 1px rgba(24,24,27,.06)",
            },
            components: { Button: { primaryShadow: "none", defaultShadow: "none" }, Select: { optionSelectedBg: "#EEEEFC", optionSelectedColor: "#3E3EA8" } },
        };
    if (id === "comic")
        return {
            algorithm: antdTheme.defaultAlgorithm,
            cssVar: { key: "dp-comic" },
            token: {
                ...shared,
                colorPrimary: "#E8452C",
                colorInfo: "#E8452C",
                colorLink: "#C5361F",
                colorBgLayout: "#FBF5E9",
                colorBgContainer: "#FFFDF7",
                colorBgElevated: "#FFFDF7",
                colorText: "#1B1A17",
                colorTextSecondary: "#4A463D",
                colorTextTertiary: "#6E6858",
                colorBorder: "#1B1A17",
                colorBorderSecondary: "#D9CCB0",
                borderRadius: 6,
                borderRadiusLG: 8,
                borderRadiusSM: 4,
                lineWidth: 1.5,
                controlHeight: 34,
                boxShadow: "4px 4px 0 #1B1A17",
                boxShadowSecondary: "4px 4px 0 #1B1A17",
            },
            components: { Button: { primaryShadow: "2px 2px 0 #1B1A17", defaultShadow: "2px 2px 0 #1B1A17" }, Select: { optionSelectedBg: "#FFE9A8", optionSelectedColor: "#1B1A17" } },
        };
    return {
        algorithm: antdTheme.defaultAlgorithm,
        cssVar: { key: "dp-sakura" },
        token: {
            ...shared,
            colorPrimary: "#C93A64",
            colorInfo: "#C93A64",
            colorLink: "#C93A64",
            colorBgLayout: "#FBF7F6",
            colorBgContainer: "#FFFFFF",
            colorText: "#2A1F23",
            colorTextSecondary: "#5E4E54",
            colorTextTertiary: "#7A676E",
            colorBorder: "#E8DADD",
            colorBorderSecondary: "#F0E5E7",
            colorFillSecondary: "#FBEEF1",
            colorFillTertiary: "#F7E9ED",
            borderRadius: 9,
            borderRadiusLG: 14,
            borderRadiusSM: 7,
            controlHeight: 34,
            boxShadow: "0 24px 60px -24px rgba(96,36,56,.28), 0 8px 20px -10px rgba(96,36,56,.10)",
            boxShadowSecondary: "0 24px 60px -24px rgba(96,36,56,.28), 0 8px 20px -10px rgba(96,36,56,.10)",
        },
        components: { Button: { primaryShadow: "none", defaultShadow: "none" }, Select: { optionSelectedBg: "#FBE3EA", optionSelectedColor: "#A82D53" } },
    };
}
