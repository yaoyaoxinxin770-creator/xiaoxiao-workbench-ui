export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "var(--background)",
            dot: "color-mix(in srgb, var(--muted-foreground) 25%, transparent)",
            line: "color-mix(in srgb, var(--muted-foreground) 12%, transparent)",
            selectionStroke: "var(--primary)",
            selectionFill: "color-mix(in srgb, var(--primary) 12%, transparent)",
        },
        node: {
            label: "var(--secondary-foreground)",
            fill: "var(--accent)",
            panel: "var(--card)",
            stroke: "var(--border)",
            activeStroke: "var(--primary)",
            placeholder: "var(--muted-foreground)",
            text: "var(--foreground)",
            muted: "var(--muted-foreground)",
            faint: "color-mix(in srgb, var(--muted-foreground) 55%, transparent)",
        },
        toolbar: {
            panel: "color-mix(in srgb, var(--card) 86%, transparent)",
            border: "var(--border)",
            item: "var(--secondary-foreground)",
            itemHover: "var(--secondary)",
            activeBg: "var(--accent)",
            activeText: "var(--accent-foreground)",
        },
    },
    dark: {
        canvas: {
            background: "var(--background)",
            dot: "color-mix(in srgb, var(--muted-foreground) 25%, transparent)",
            line: "color-mix(in srgb, var(--muted-foreground) 12%, transparent)",
            selectionStroke: "var(--primary)",
            selectionFill: "color-mix(in srgb, var(--primary) 12%, transparent)",
        },
        node: {
            label: "var(--secondary-foreground)",
            fill: "var(--accent)",
            panel: "var(--card)",
            stroke: "var(--border)",
            activeStroke: "var(--primary)",
            placeholder: "var(--muted-foreground)",
            text: "var(--foreground)",
            muted: "var(--muted-foreground)",
            faint: "color-mix(in srgb, var(--muted-foreground) 55%, transparent)",
        },
        toolbar: {
            panel: "color-mix(in srgb, var(--card) 86%, transparent)",
            border: "var(--border)",
            item: "var(--secondary-foreground)",
            itemHover: "var(--secondary)",
            activeBg: "var(--accent)",
            activeText: "var(--accent-foreground)",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
