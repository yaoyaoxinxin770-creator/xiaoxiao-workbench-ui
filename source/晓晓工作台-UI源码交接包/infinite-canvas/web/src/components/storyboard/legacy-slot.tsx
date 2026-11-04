"use client";

import { useEffect, useRef } from "react";

// Moves a node out of the hidden personal-workbench host into this slot and
// puts it back on unmount. The xiaoxiao-module class keeps @scope styles
// applying to the borrowed subtree.
export function LegacySlot({ selector, className, keepHidden = false }: { selector: string; className?: string; keepHidden?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const slot = ref.current;
        if (!slot) return;
        let moved: { node: HTMLElement; parent: HTMLElement; next: ChildNode | null; hidden: boolean } | null = null;
        const timer = setInterval(() => {
            if (moved) return;
            const host = document.querySelector<HTMLElement>("[data-personal-workbench-root][data-active=true]");
            const node = window.personalWorkbench?.workbenchNode?.(selector) as HTMLElement | undefined
                || host?.querySelector<HTMLElement>(selector)
                || [...document.querySelectorAll<HTMLElement>(selector)].find((candidate) => !candidate.closest(".legacy-slot") && !candidate.closest("[data-personal-workbench-root]"));
            if (node && !slot.contains(node)) {
                moved = { node, parent: node.parentElement as HTMLElement, next: node.nextSibling, hidden: node.hidden };
                if (!keepHidden) node.hidden = false;
                slot.appendChild(node);
            }
        }, 150);
        return () => {
            clearInterval(timer);
            if (moved) { moved.node.hidden = moved.hidden; moved.parent.insertBefore(moved.node, moved.next?.parentNode===moved.parent?moved.next:null); }
        };
    }, [selector, keepHidden]);
    return <div ref={ref} className={`xiaoxiao-module legacy-slot ${className || ""}`} />;
}
