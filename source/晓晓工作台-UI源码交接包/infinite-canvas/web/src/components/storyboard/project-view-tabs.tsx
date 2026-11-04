"use client";
import Link from "next/link";
import { Boxes, Clapperboard, Images } from "lucide-react";
import { libraryHref } from "@/services/api/project-library";
import type { Workspace } from "@/services/api/workbench";

export function ProjectViewTabs({ root, workspace, active = "shots", disabled = false }: { root: string; workspace: Workspace; active?: string; disabled?: boolean }) {
    return <nav className="flex shrink-0 items-center gap-1" aria-label="项目视图">
        {[
            { id: "shots", label: "分镜", icon: Clapperboard, href: `/${workspace}?project=${encodeURIComponent(root)}` },
            ...(workspace === "jimeng" ? [] : [{ id: "results", label: "资产库", icon: Images, href: libraryHref(root, workspace) }]),
            { id: "elements", label: "Elements", icon: Boxes, href: workspace === "jimeng" ? `/jimeng?project=${encodeURIComponent(root)}&view=elements` : libraryHref(root, workspace, "elements") },
        ].map(item => <Link key={item.id} href={disabled ? "#" : item.href} aria-disabled={disabled} aria-current={active === item.id ? "page" : undefined} onClick={e => { if (disabled) e.preventDefault(); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors ${active === item.id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-secondary"} ${disabled ? "pointer-events-none opacity-50" : ""}`}><item.icon size={14} />{item.label}</Link>)}
    </nav>;
}
