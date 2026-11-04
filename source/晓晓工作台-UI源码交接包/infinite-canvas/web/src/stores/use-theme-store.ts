import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    skin: "pink" | "neutral";
    setSkin: (skin:"pink"|"neutral",theme:ThemeName)=>void;
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
