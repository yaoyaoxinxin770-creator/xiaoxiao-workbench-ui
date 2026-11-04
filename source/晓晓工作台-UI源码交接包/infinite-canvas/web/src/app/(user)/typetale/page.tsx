"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { App, Button, Empty } from "antd";

import { ShotJump } from "@/components/storyboard/shot-jump";
import { ShotTopBar } from "./components/shot-top-bar";
import { ChapterHeader } from "./components/chapter-header";
import { ShotRow } from "./components/shot-row";
import { SideRail } from "./components/side-rail";
import { ShotEditDrawer } from "./components/shot-edit-drawer";
import { useTypetaleStore } from "./stores/use-typetale-store";
import { activateLocalProject } from "@/services/api/workbench";

function TypetaleProject() {
    const { message } = App.useApp();
    const searchParams = useSearchParams();
    const projectPath = useTypetaleStore((s) => s.projectPath);
    const state = useTypetaleStore((s) => s.state);
    const loading = useTypetaleStore((s) => s.loading);
    const error = useTypetaleStore((s) => s.error);
    const filter = useTypetaleStore((s) => s.filter);
    const zoomMode = useTypetaleStore((s) => s.zoomMode);

    useEffect(() => {
        const requested = searchParams.get("project") || "";
        let pointer = "";
        try {
            const parsed = JSON.parse(localStorage.getItem("typetale-workbench-state") || "{}");
            if (parsed?.workspace === "typetale") pointer = parsed.projectPath || "";
        } catch {}
        const target = requested || pointer;
        if (!target) return;
        const store = useTypetaleStore.getState();
        if (store.isBusy()) { message.warning("任务正在执行，请先停止再切换项目。"); return; }
        if (target !== store.projectPath) {
            activateLocalProject({ path: target, name: "", workspace: "typetale" })
                .then(() => store.openProject(target))
                .catch((e) => { useTypetaleStore.setState({ error: e.message }); });
        } else { void store.refreshAssets(); }
    }, [searchParams, message]);

    const groups = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        const statusNeedle = needle.startsWith("status:") ? needle.slice(7) : "";
        const shots = state.shots.filter((shot: any) =>
            statusNeedle ? shot.status === statusNeedle
            : !needle || shot.id.includes(needle) || shot.title.toLowerCase().includes(needle) || shot.prompt.toLowerCase().includes(needle) || (shot.tags || []).some((tag: string) => tag.toLowerCase().includes(needle)),
        );
        const chapters = state.chapters || [];
        const byId = new Map(chapters.map((chapter: any) => [chapter.id, chapter]));
        // 按分镜出现顺序分组；章节未知/为空时归入隐式「未分章」（仅当存在章节时显示组头）。
        const order: { chapter: any | null; shots: any[] }[] = [];
        const seen = new Map<string, { chapter: any | null; shots: any[] }>();
        for (const shot of shots) {
            const chapter: any = chapters.length ? byId.get(shot.chapterId) || null : null;
            const key = chapter?.id || "";
            if (!seen.has(key)) { const group = { chapter, shots: [] as any[] }; seen.set(key, group); order.push(group); }
            seen.get(key)!.shots.push(shot);
        }
        return order;
    }, [state.shots, state.chapters, filter]);

    const jumpToShot = (id: string) => {
        const store = useTypetaleStore.getState();
        const shot = store.state.shots.find((s: any) => s.id === id);
        const chapter = (store.state.chapters || []).find((c: any) => c.id === shot?.chapterId);
        const doScroll = () => {
            const el = document.querySelector(`[data-shot-row="${id}"]`);
            if (!el) return;
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-primary/70");
            setTimeout(() => el.classList.remove("ring-2", "ring-primary/70"), 1600);
        };
        if (chapter?.collapsed) { store.toggleChapter(chapter.id); requestAnimationFrame(doScroll); } else doScroll();
        store.selectShot(id);
    };

    if (error) return <main className="h-full overflow-auto"><div className="page-reveal mx-auto max-w-3xl p-10"><div className="surface p-10"><Empty description={error}><Link href="/projects"><Button type="primary">返回项目管理</Button></Link></Empty></div></div></main>;
    if (!projectPath && !loading) {
        return (
            <main className="h-full overflow-auto">
                <div className="page-reveal mx-auto max-w-3xl p-10">
                    <div className="surface p-10">
                        <Empty description="请从项目管理打开字字动画项目">
                            <Link href="/projects"><Button type="primary">打开项目管理</Button></Link>
                        </Empty>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-full min-h-0 flex-col overflow-hidden">
            <ShotTopBar />
            <div className="flex min-h-0 flex-1">
                <div className="relative min-w-0 flex-1">
                    <div className={`absolute inset-0 overflow-auto px-6 py-5 ${zoomMode ? "text-[15px]" : ""}`}>
                        <div className="page-reveal mx-auto flex max-w-[1400px] flex-col gap-3 pb-10">
                        {loading ? <div className="surface p-10 text-center text-muted-foreground">正在加载字字动画项目…</div> : null}
                        {!loading && !state.shots.length ? (
                            <div className="surface p-10"><Empty description="还没有分镜。从右侧「项目设置」导入整稿并解析分镜，或新建一个分镜。" /></div>
                        ) : null}
                        {groups.map((group) => (
                            <section key={group.chapter?.id || "ungrouped"} className="flex flex-col gap-3">
                                {group.chapter || (state.chapters || []).length ? <ChapterHeader chapter={group.chapter} shots={group.shots} /> : null}
                                {group.chapter?.collapsed ? null : group.shots.map((shot: any) => <ShotRow key={shot.id} shot={shot} />)}
                            </section>
                        ))}
                        </div>
                    </div>
                    <div className="absolute bottom-5 left-8 z-30"><ShotJump shots={state.shots.map((s: any) => ({ id: s.id, status: s.status }))} activeId={state.activeShotId} onJump={jumpToShot} /></div>
                </div>
                <SideRail />
            </div>
            <ShotEditDrawer />
        </main>
    );
}

export default function TypetalePage() {
    return (
        <Suspense fallback={null}>
            <TypetaleProject />
        </Suspense>
    );
}
