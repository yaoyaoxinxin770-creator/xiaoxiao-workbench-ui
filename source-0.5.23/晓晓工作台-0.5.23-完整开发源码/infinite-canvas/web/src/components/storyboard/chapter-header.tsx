"use client";

import type { ReactNode } from "react";
import { Tag } from "antd";
import { ChevronDown, ChevronRight } from "lucide-react";

export function ChapterHeader({ chips, count, collapsed, onToggle, extra }: {
    chips: { label: string; tone?: "gold" | "default" }[];
    count?: number;
    collapsed?: boolean;
    onToggle?: () => void;
    extra?: ReactNode;
}) {
    return (
        <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/80 px-1 py-1 backdrop-blur-sm">
            {chips.map((chip, index) => (
                <Tag key={index} color={chip.tone === "gold" ? "gold" : undefined} className={`!m-0 ${chip.tone === "gold" ? "" : "text-muted-foreground"}`}>{chip.label}</Tag>
            ))}
            {count !== undefined ? <span className="text-xs text-muted-foreground">{count} 个</span> : null}
            <span className="ml-auto inline-flex items-center gap-1">
                {extra}
                {onToggle ? (
                    <button
                        type="button"
                        aria-label={collapsed ? "展开章节" : "折叠章节"}
                        className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                        onClick={onToggle}
                    >
                        {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                ) : null}
            </span>
        </div>
    );
}
