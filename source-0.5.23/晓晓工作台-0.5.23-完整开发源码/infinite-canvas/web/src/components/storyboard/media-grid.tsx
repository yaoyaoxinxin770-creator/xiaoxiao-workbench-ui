"use client";

import type { ReactNode } from "react";
import { Check, ImageOff } from "lucide-react";

export type MediaItem = { key: string | number; src?: string; label: string; kind?: string };

export function MediaGrid({ items, selectedIndex, onSelect, actions, emptyLabel = "暂无结果" }: {
    items: (MediaItem | null)[];
    selectedIndex?: number;
    onSelect?: (index: number) => void;
    actions?: (item: MediaItem, index: number) => ReactNode;
    emptyLabel?: string;
}) {
    const cells = [...items, ...Array.from({ length: Math.max(0, 4 - items.length) }, () => null)].slice(0, 4);
    return (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
            {cells.map((item, index) => {
                const selected = item != null && index === selectedIndex;
                return (
                    <div
                        key={item?.key ?? `empty-${index}`}
                        className={`group relative aspect-video overflow-hidden rounded-lg bg-secondary ${item ? "cursor-pointer" : ""}`}
                        onClick={() => item && onSelect?.(index)}
                    >
                        {item ? (
                            item.src
                                ? <img src={item.src} alt={item.label} className="h-full w-full object-cover" />
                                : <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                                    <ImageOff className="size-4" />
                                    <span className="max-w-full truncate px-2 text-[10px]">{item.label}</span>
                                </span>
                        ) : <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">{emptyLabel}</span>}
                        {selected ? <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span> : null}
                        {item && actions ? (
                            <span className="absolute inset-x-0 bottom-0 flex translate-y-full justify-center gap-1 bg-foreground/60 py-1 transition group-hover:translate-y-0">
                                {actions(item, index)}
                            </span>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
