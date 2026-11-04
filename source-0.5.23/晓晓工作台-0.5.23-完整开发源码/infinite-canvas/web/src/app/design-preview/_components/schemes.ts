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
        ruleNote: "默认皮肤（功能保留规则第 7 条“柔粉方案 A”的精修版），皮肤菜单中仍叫“暖樱粉”。",
    },
    {
        id: "noir",
        code: "B",
        name: "胭脂墨黑",
        tagline: "胭脂粉 × 墨黑撞色，最吸睛的暗色工作台",
        summary: "纯墨黑底色配胭脂粉 #FF7CA2：选中项、主按钮和关键状态用整块胭脂粉配黑字，其余保持墨黑与细线。画面最突出，夜间审片不刺眼，生成中用胭脂粉光晕表达。",
        points: ["墨黑 #000000 底，视频与封面对比度最高", "胭脂粉 #FF7CA2 整块高亮：选中、主按钮、进度", "四角星 ✦ 点缀，撞色但不杂色"],
        swatches: ["#000000", "#0B0B0C", "#18181B", "#FF9DBA", "#FF7CA2", "#F7F3F5"],
        dark: true,
        ruleNote: "替换现有深色皮肤“影视暗房”，在皮肤菜单中显示为“胭脂墨黑”；默认皮肤仍为暖樱粉（方案 A）。",
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
        ruleNote: "升级现有浅色中性皮肤“云母白”，菜单名称不变。",
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
        ruleNote: "新增为皮肤菜单第 4 项“漫画分镜”，不影响其他皮肤和默认值。",
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
                colorPrimary: "#FF7CA2",
                colorInfo: "#FF7CA2",
                colorLink: "#FF9DBA",
                colorTextLightSolid: "#000000",
                colorBgBase: "#000000",
                colorBgLayout: "#000000",
                colorBgContainer: "#0B0B0C",
                colorBgElevated: "#141416",
                colorText: "#F7F3F5",
                colorTextSecondary: "#C4BCC0",
                colorTextTertiary: "#8E868B",
                colorBorder: "rgba(255,255,255,.14)",
                colorBorderSecondary: "rgba(255,255,255,.09)",
                colorFillSecondary: "rgba(255,255,255,.07)",
                colorFillTertiary: "rgba(255,255,255,.045)",
                borderRadius: 8,
                borderRadiusLG: 12,
                borderRadiusSM: 6,
                controlHeight: 34,
                boxShadow: "0 24px 70px -20px rgba(0,0,0,.9), 0 0 0 1px rgba(255,124,162,.18)",
                boxShadowSecondary: "0 24px 70px -20px rgba(0,0,0,.9), 0 0 0 1px rgba(255,124,162,.18)",
            },
            components: { Button: { primaryShadow: "0 0 18px -4px rgba(255,124,162,.55)", defaultShadow: "none" }, Select: { optionSelectedBg: "rgba(255,124,162,.18)", optionSelectedColor: "#FFD0DD" } },
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
