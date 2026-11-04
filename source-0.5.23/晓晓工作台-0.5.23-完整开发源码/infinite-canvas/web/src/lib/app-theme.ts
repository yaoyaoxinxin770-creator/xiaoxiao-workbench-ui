import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";
import type { SkinName } from "@/stores/use-theme-store";

const neutral = {
    light: {
        primary: "#C93A64",
        primaryHover: "#B3305A",
        primaryText: "#fff8fa",
        menuBg: "#FBE3EA",
        menuText: "#A82D53",
        selectActiveBg: "#fbeef1",
        selectSelectedBg: "#FBE3EA",
        selectText: "#2A1F23",
        tableSelectedBg: "rgba(226, 112, 138, 0.10)",
        tableSelectedHoverBg: "rgba(226, 112, 138, 0.16)",
    },
    dark: {
        primary: "#f087a0",
        primaryHover: "#f59db2",
        primaryText: "#2a1018",
        menuBg: "#352430",
        menuText: "#ffc9d6",
        selectActiveBg: "#2a1f27",
        selectSelectedBg: "#352430",
        selectText: "#f5e8ed",
        tableSelectedBg: "rgba(240, 135, 160, 0.12)",
        tableSelectedHoverBg: "rgba(240, 135, 160, 0.18)",
    },
};

const sharedToken = {
    borderRadius: 9,
    borderRadiusLG: 14,
    borderRadiusSM: 8,
    borderRadiusXS: 6,
    controlHeight: 36,
    controlHeightSM: 28,
    fontFamily: '"PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Helvetica Neue",sans-serif',
    motionDurationMid: "0.18s",
    motionEaseInOut: "cubic-bezier(.2,.7,.2,1)",
};

const lightToken = {
    colorBgBase: "#FFFFFF",
    colorBgLayout: "#FBF7F6",
    colorBgContainer: "#FFFFFF",
    colorBgElevated: "#FFFFFF",
    colorTextBase: "#2A1F23",
    colorText: "#2A1F23",
    colorTextSecondary: "#5E4E54",
    colorTextTertiary: "#7A676E",
    colorBorder: "#E8DADD",
    colorBorderSecondary: "#E8DADD",
    colorFillSecondary: "#fbeef1",
    colorFillTertiary: "#f7e9ed",
    boxShadow: "0 24px 60px -24px rgba(96,36,56,.28), 0 8px 20px -10px rgba(96,36,56,.10)",
    boxShadowSecondary: "0 24px 60px -24px rgba(96,36,56,.28), 0 8px 20px -10px rgba(96,36,56,.10)",
};

const darkToken = {
    colorBgBase: "#150f14",
    colorBgLayout: "#150f14",
    colorBgContainer: "#1f161d",
    colorBgElevated: "#231a21",
    colorTextBase: "#f5e8ed",
    colorText: "#f5e8ed",
    colorTextSecondary: "#dcc3cc",
    colorTextTertiary: "#a88b96",
    colorBorder: "rgba(255,205,220,.16)",
    colorBorderSecondary: "rgba(255,205,220,.12)",
    colorFillSecondary: "#2a1f27",
    colorFillTertiary: "#241a21",
    boxShadow: "0 28px 70px -28px rgba(0,0,0,.75), 0 8px 24px -12px rgba(0,0,0,.45)",
    boxShadowSecondary: "0 28px 70px -28px rgba(0,0,0,.75), 0 8px 24px -12px rgba(0,0,0,.45)",
};

export const adminLayoutStyle = {
    siderWidth: 232,
    headerHeight: 56,
    brandHeight: 56,
    menu: { borderInlineEnd: 0, padding: "18px 12px", fontSize: 15 } satisfies CSSProperties,
    menuItem: { height: 44, lineHeight: "44px", marginBlock: 4, borderRadius: 8 } satisfies CSSProperties,
};

// 云母白（neutral + light）采用“雾白工作室”配色：中性灰阶 + 靛蓝强调。
// 影视暗房（neutral + dark）采用“胭脂墨黑”配色：胭脂粉 #FF7CA2 × 墨黑 #000000，主按钮为粉底黑字。
const monochrome = {
    "light": {
        "primary": "#5b5bd6",
        "primaryHover": "#4c4cc4",
        "primaryText": "#ffffff",
        "menuBg": "#eeeefc",
        "menuText": "#3e3ea8",
        "selectActiveBg": "#f4f4fb",
        "selectSelectedBg": "#eeeefc",
        "selectText": "#18181b",
        "tableSelectedBg": "rgba(91,91,214,.08)",
        "tableSelectedHoverBg": "rgba(91,91,214,.13)"
    },
    "dark": {
        "primary": "#ff7ca2",
        "primaryHover": "#ff96b6",
        "primaryText": "#000000",
        "menuBg": "#2a1520",
        "menuText": "#ff9dba",
        "selectActiveBg": "#18181b",
        "selectSelectedBg": "#2a1520",
        "selectText": "#f7f3f5",
        "tableSelectedBg": "rgba(255,124,162,.12)",
        "tableSelectedHoverBg": "rgba(255,124,162,.18)"
    }
};
const monochromeTokens = {
    "light": {
        "colorBgBase": "#ffffff",
        "colorBgLayout": "#f5f5f6",
        "colorBgContainer": "#ffffff",
        "colorBgElevated": "#ffffff",
        "colorTextBase": "#18181b",
        "colorText": "#18181b",
        "colorTextSecondary": "#52525b",
        "colorTextTertiary": "#71717a",
        "colorBorder": "#e4e4e7",
        "colorBorderSecondary": "#ededef",
        "colorFillSecondary": "#f0f0f2",
        "colorFillTertiary": "#f6f6f7",
        "boxShadow": "0 22px 60px -22px rgba(24,24,27,.28), 0 0 0 1px rgba(24,24,27,.05)",
        "boxShadowSecondary": "0 22px 60px -22px rgba(24,24,27,.28), 0 0 0 1px rgba(24,24,27,.05)"
    },
    "dark": {
        "colorBgBase": "#000000",
        "colorBgLayout": "#000000",
        "colorBgContainer": "#0b0b0c",
        "colorBgElevated": "#141416",
        "colorTextBase": "#f7f3f5",
        "colorText": "#f7f3f5",
        "colorTextSecondary": "#c4bcc0",
        "colorTextTertiary": "#8e868b",
        "colorBorder": "rgba(255,255,255,.14)",
        "colorBorderSecondary": "rgba(255,255,255,.09)",
        "colorFillSecondary": "rgba(255,255,255,.07)",
        "colorFillTertiary": "rgba(255,255,255,.045)",
        "boxShadow": "0 28px 80px -24px rgba(0,0,0,.9), 0 0 0 1px rgba(255,124,162,.16)",
        "boxShadowSecondary": "0 28px 80px -24px rgba(0,0,0,.9), 0 0 0 1px rgba(255,124,162,.16)"
    }
};
// 漫画分镜（comic）：米白纸张、墨线硬投影、番茄红主色与明黄高亮；只有浅色。
const comicColors = {
    "primary": "#e8452c",
    "primaryHover": "#cf3a22",
    "primaryText": "#ffffff",
    "menuBg": "#ffe9a8",
    "menuText": "#1b1a17",
    "selectActiveBg": "#fff4d1",
    "selectSelectedBg": "#ffe9a8",
    "selectText": "#1b1a17",
    "tableSelectedBg": "rgba(255,201,60,.18)",
    "tableSelectedHoverBg": "rgba(255,201,60,.26)"
};
const comic = { light: comicColors, dark: comicColors };
const comicTokens = {
    "colorBgBase": "#fffdf7",
    "colorBgLayout": "#fbf5e9",
    "colorBgContainer": "#fffdf7",
    "colorBgElevated": "#fffdf7",
    "colorTextBase": "#1b1a17",
    "colorText": "#1b1a17",
    "colorTextSecondary": "#4a463d",
    "colorTextTertiary": "#6e6858",
    "colorBorder": "#cdbf9f",
    "colorBorderSecondary": "#e2d6bb",
    "colorFillSecondary": "#f3e9d4",
    "colorFillTertiary": "#f8f0de",
    "boxShadow": "4px 4px 0 #1b1a17",
    "boxShadowSecondary": "4px 4px 0 #1b1a17"
};
const mistShape = { borderRadius: 7, borderRadiusLG: 10, borderRadiusSM: 6, borderRadiusXS: 4, controlHeight: 32 };
const comicShape = { borderRadius: 6, borderRadiusLG: 8, borderRadiusSM: 4, borderRadiusXS: 3, controlHeight: 34 };

export function getAntThemeConfig(dark: boolean, skin:SkinName="pink"): ThemeConfig {
    const isComic=skin==="comic",isDark=dark&&!isComic;
    const palette=skin==="neutral"?monochrome:isComic?comic:neutral;
    const color = isDark ? palette.dark : palette.light;
    const surface=skin==="neutral"?(isDark?monochromeTokens.dark:monochromeTokens.light):isComic?comicTokens:(isDark?darkToken:lightToken);
    const shape=isComic?comicShape:skin==="neutral"&&!isDark?mistShape:{};
    const buttonShadow=isComic?"2px 2px 0 #1b1a17":skin==="neutral"&&isDark?"0 0 18px -6px rgba(255,124,162,.6)":"none";

    return {
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: "infinite-canvas-"+skin+(isDark?"-dark":"-light") },
        token: {
            colorPrimary: color.primary,
            colorInfo: skin==="pink"&&!dark?"#2F62C8":color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            ...sharedToken,
            ...shape,
            ...surface,
        },
        components: {
            Button: {
                primaryShadow: buttonShadow,
                defaultShadow: isComic ? buttonShadow : "none",
            },
            Card: {
                headerBg: "transparent",
            },
            Modal: {
                contentBg: surface.colorBgContainer,
            },
            Input: {
                activeShadow: "var(--glow)",
            },
            Select: {
                activeOutlineColor: color.primary,
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: palette.dark.menuBg,
                darkItemSelectedBg: palette.dark.menuBg,
                darkItemSelectedColor: palette.dark.menuText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
