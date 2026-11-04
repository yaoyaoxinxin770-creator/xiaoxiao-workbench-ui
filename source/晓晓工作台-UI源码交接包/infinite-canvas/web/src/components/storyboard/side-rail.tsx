"use client";

import { useEffect, type ReactNode } from "react";
import { Tooltip } from "antd";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

export type RailSection = { key: string; label: string; title?: string; icon: LucideIcon; content: ReactNode };

export function SideRail({ sections, open, onChange, ariaLabel = "场景通道", overlay = false }: {
    sections: RailSection[];
    open: string | null;
    onChange: (key: string | null) => void;
    ariaLabel?: string;
    overlay?: boolean;
}) {
    const active = sections.find((section) => section.key === open) || null;
    useEffect(() => {
        if (!overlay || !open) return;
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onChange(null); };
        document.addEventListener("keydown", escape);
        return () => { document.removeEventListener("keydown", escape); };
    }, [overlay, open, onChange]);
    return (
        <div className="relative flex shrink-0">
            <aside data-testid={overlay ? "floating-side-panel" : undefined} className={`${overlay ? "absolute inset-y-0 right-11 z-40 w-[420px] max-w-[calc(100vw-44px)] rounded-l-xl border shadow-xl" : "w-80 shrink-0 border-l"} overflow-auto border-border/70 bg-card ${open && active ? "" : "hidden"}`} aria-label={active ? active.title || active.label : undefined}>
                <div className="glass sticky top-0 z-10 flex items-center justify-between border-b border-border/70 px-4 py-3">
                    <b className="text-sm">{active ? active.title || active.label : ""}</b>
                    <button type="button" aria-label="关闭" className="text-muted-foreground hover:text-foreground" onClick={() => onChange(null)}><X className="size-4" /></button>
                </div>
                <div className="p-4">
                    {sections.map((section) => <div key={section.key} hidden={section.key !== open}>{section.content}</div>)}
                </div>
            </aside>
            <nav className="flex w-11 flex-col items-center gap-1 border-l border-border/70 py-3" aria-label={ariaLabel}>
                {sections.map((section) => {
                    const Icon = section.icon;
                    const isOpen = open === section.key;
                    return (
                        <Tooltip key={section.key} title={section.label} placement="left">
                            <button
                                type="button"
                                aria-label={section.label}
                                aria-expanded={isOpen}
                                className={`flex size-8 items-center justify-center rounded-lg transition ${isOpen ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                                onClick={() => onChange(isOpen ? null : section.key)}
                            >
                                <Icon className="size-4" />
                            </button>
                        </Tooltip>
                    );
                })}
            </nav>
        </div>
    );
}
