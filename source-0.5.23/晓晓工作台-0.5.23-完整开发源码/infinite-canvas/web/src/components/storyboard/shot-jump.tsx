"use client";
import { Popover } from "antd";
import { ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export function ShotJump({ shots, activeId, onJump, hint }: {
    shots: { id: string; status?: string }[];
    activeId?: string | null;
    onJump: (id: string) => void;
    hint?: string;
}) {
    const dot = (status?: string) =>
        status === "done" || status === "success" ? "bg-emerald-500"
        : status === "error" ? "bg-red-400"
        : status === "running" ? "bg-sky-500 animate-pulse"
        : "bg-foreground/25";
    const content = (
        <div className="w-72">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>分镜定位 · {shots.length} 组</span>
                <button type="button" className="text-primary hover:underline" onClick={() => activeId && onJump(activeId)}>定位当前</button>
            </div>
            <div className="grid max-h-72 grid-cols-5 gap-1.5 overflow-auto pr-1">
                {shots.map((s) => (
                    <button key={s.id} type="button" onClick={() => onJump(s.id)}
                        className={cn("flex items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-xs tabular-nums transition-all hover:border-primary/60 hover:bg-accent/60",
                            s.id === activeId ? "border-primary bg-primary/15 font-semibold text-primary" : "border-border/60 bg-card/60")}>
                        <i className={cn("inline-block size-1.5 rounded-full", dot(s.status))} />{s.id}
                    </button>
                ))}
            </div>
            {hint ? <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{hint}</div> : null}
        </div>
    );
    return (
        <Popover content={content} trigger="click" placement="topLeft" styles={{ container: { padding: 10 } }}>
            <div data-shot-jump="true" data-testid="shot-jump">
                <button type="button" aria-label="分镜定位" title="分镜定位：点击编号直达该分镜"
                    className="flex size-10 items-center justify-center rounded-full border border-rose-200/70 bg-white/85 text-foreground/70 shadow-[0_8px_24px_rgba(59,31,43,0.18)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:text-primary dark:border-white/15 dark:bg-[#241823]/85">
                    <ListOrdered className="size-5" />
                </button>
            </div>
        </Popover>
    );
}
