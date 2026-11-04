import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";
// pink=暖樱粉（默认），neutral+light=云母白，neutral+dark=影视暗房（胭脂墨黑配色），comic=漫画分镜。
export type SkinName = "pink" | "neutral" | "comic";

type ThemeStore = {
    theme: ThemeName;
    skin: SkinName;
    setSkin: (skin:SkinName,theme:ThemeName)=>void;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            skin: "pink",
            setSkin: (skin,theme)=>set({skin,theme}),
            setTheme: (theme) => set({ theme }),
        }),
        {
            name: "infinite-canvas:theme_store",
            version: 1,
            // Apply the requested pink-white skin once, then preserve theme choices.
            migrate: () => ({ theme: "light" as const }),
        },
    ),
);
