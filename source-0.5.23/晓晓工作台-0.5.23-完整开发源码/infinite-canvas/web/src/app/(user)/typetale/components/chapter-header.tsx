"use client";

import { ChapterHeader as SharedChapterHeader } from "@/components/storyboard/chapter-header";
import { useTypetaleStore } from "../stores/use-typetale-store";

export function ChapterHeader({ chapter, shots }: { chapter: any | null; shots: any[] }) {
    const toggleChapter = useTypetaleStore((s) => s.toggleChapter);
    const range = shots.length ? `分镜 ${shots[0].id}-${shots[shots.length - 1].id}` : "无分镜";
    const chips = [
        { label: chapter?.name || "未分章", tone: "gold" as const },
        ...(chapter?.title ? [{ label: chapter.title }] : []),
        { label: range },
    ];
    return (
        <SharedChapterHeader
            chips={chips}
            count={shots.length}
            collapsed={chapter?.collapsed}
            onToggle={chapter ? () => toggleChapter(chapter.id) : undefined}
        />
    );
}
