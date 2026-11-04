import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

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

const monochrome = {
    "light": {
        "primary": "#202226",
        "primaryHover": "#41454d",
        "primaryText": "#ffffff",
        "menuBg": "#eef0f3",
        "menuText": "#202226",
        "selectActiveBg": "#f6f7f8",
        "selectSelectedBg": "#eef0f3",
        "selectText": "#202226",
        "tableSelectedBg": "rgba(32,34,38,.08)",
        "tableSelectedHoverBg": "rgba(32,34,38,.12)"
    },
    "dark": {
        "primary": "#e1e3e8",
        "primaryHover": "#ffffff",
        "primaryText": "#111215",
        "menuBg": "#32353b",
        "menuText": "#f1f2f4",
        "selectActiveBg": "#282b31",
        "selectSelectedBg": "#32353b",
        "selectText": "#f1f2f4",
        "tableSelectedBg": "rgba(225,227,232,.10)",
        "tableSelectedHoverBg": "rgba(225,227,232,.16)"
    }
};
const monochromeTokens = {
    "light": {
        "colorBgBase": "#ffffff",
        "colorBgLayout": "#ffffff",
        "colorBgContainer": "#ffffff",
        "colorBgElevated": "#ffffff",
        "colorTextBase": "#202226",
        "colorText": "#202226",
        "colorTextSecondary": "#535861",
        "colorTextTertiary": "#737983",
        "colorBorder": "#d9dde3",
        "colorBorderSecondary": "#e5e7eb",
        "colorFillSecondary": "#f3f4f6",
        "colorFillTertiary": "#f7f8f9",
        "boxShadow": "0 24px 60px -24px rgba(0,0,0,.22)",
        "boxShadowSecondary": "0 24px 60px -24px rgba(0,0,0,.22)"
    },
    "dark": {
        "colorBgBase": "#111215",
        "colorBgLayout": "#111215",
        "colorBgContainer": "#1d1f23",
        "colorBgElevated": "#24262b",
        "colorTextBase": "#f1f2f4",
        "colorText": "#f1f2f4",
        "colorTextSecondary": "#c4c8cf",
        "colorTextTertiary": "#969ca7",
        "colorBorder": "#3a3e46",
        "colorBorderSecondary": "#30343b",
        "colorFillSecondary": "#292c32",
        "colorFillTertiary": "#24262b",
        "boxShadow": "0 28px 70px -28px rgba(0,0,0,.75)",
        "boxShadowSecondary": "0 28px 70px -28px rgba(0,0,0,.75)"
    }
};

export function getAntThemeConfig(dark: boolean, skin:"pink"|"neutral"="pink"): ThemeConfig {
    const palette=skin==="neutral"?monochrome:neutral;
    const color = dark ? palette.dark : palette.light;
    const surface=skin==="neutral"?(dark?monochromeTokens.dark:monochromeTokens.light):(dark?darkToken:lightToken);

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: "infinite-canvas-"+skin+(dark?"-dark":"-light") },
        token: {
            colorPrimary: color.primary,
            colorInfo: skin==="pink"&&!dark?"#2F62C8":color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            ...sharedToken,
            ...surface,
        },
        components: {
            Button: {
                primaryShadow: "none",
                defaultShadow: "none",
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
