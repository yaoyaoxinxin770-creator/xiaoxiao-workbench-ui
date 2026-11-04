"use client";

import type { ReactNode } from "react";
import { Tag } from "antd";

import { cn } from "@/lib/utils";

export function ShotRowFrame({ id, status, left, middle, middleFooter, right, rightFooter, className }: {
    id: string;
    status: { label: string; color?: string };
    left: ReactNode;
    middle: ReactNode;
    middleFooter?: ReactNode;
    right: ReactNode;
    rightFooter?: ReactNode;
    className?: string;
}) {
    return (
        <article data-shot-row={id} className={cn("surface surface-hover relative flex gap-4 p-4", className)}>
            <div className="flex w-12 shrink-0 flex-col items-start gap-1.5">
                <span className="font-mono text-sm font-semibold" style={{ color: "var(--gold)" }}>{id}</span>
                <Tag color={status.color || "default"} className="!m-0">{status.label}</Tag>
            </div>

            <div className="w-[200px] shrink-0">{left}</div>

            <div className="flex min-w-0 flex-1 flex-col">
                {middle}
                {middleFooter ? <div className="mt-2 flex gap-1">{middleFooter}</div> : null}
            </div>

            <div className="flex w-[380px] shrink-0 flex-col">
                {right}
                {rightFooter ? <div className="mt-2 flex flex-wrap items-center gap-1">{rightFooter}</div> : null}
            </div>
        </article>
    );
}
