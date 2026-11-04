"use client";

import { useEffect, useState } from "react";

type JimengGlobals = Record<string, any>;

const globals = (): JimengGlobals | null => {
    const g = window.personalWorkbench;
    return g && typeof g.workbenchAllSegments === "function" ? g : null;
};

const snapshot = (g: JimengGlobals) => ({
    ready: true,
    prefixTemplate: g.workbenchPrefixTemplate?.() || "",
    segments: g.workbenchSegments?.() || g.workbenchAllSegments?.() || [],
    episodes: g.workbenchEpisodes?.() || { episodes: [], activeId: "" },
    selected: g.workbenchSelectedIndex?.() ?? null,
    status: g.workbenchRunStatus?.() || {},
    context: g.workbenchAssetContext?.() || {},
    logs: (g.workbenchLogs?.() || JSON.parse(localStorage.getItem("jimeng-workbench-logs") || "[]")).slice(0,60),
});

export type JimengSnapshot = ReturnType<typeof snapshot> & { ready: boolean };

export function useJimengEngine() {
    const [snap, setSnap] = useState<JimengSnapshot>({ ready: false, prefixTemplate: "", segments: [], episodes: { episodes: [], activeId: "" }, selected: null, status: {}, context: {}, logs: [] });

    useEffect(() => {
        let alive = true;
        let bound: EventTarget | null = null;
        const refresh = () => {
            if (!alive) return;
            const g = globals();
            if (!g) return;
            if (g.workbenchEvents && bound !== g.workbenchEvents) {
                const target: EventTarget = g.workbenchEvents;
                bound?.removeEventListener("workbench:state-changed", refresh);
                bound = target;
                target.addEventListener("workbench:state-changed", refresh);
            }
            setSnap(snapshot(g));
        };
        const boot = setInterval(refresh, 200);
        const poll = setInterval(() => { if (globals()?.workbenchRunStatus?.().running) refresh(); }, 1000);
        return () => { alive = false; clearInterval(boot); clearInterval(poll); bound?.removeEventListener("workbench:state-changed", refresh); };
    }, []);

    const g = () => globals();
    const busy = () => Boolean(snap.status?.running || snap.segments.some((s: any) => s.status === "running"));

    return {
        snap,
        busy,
        g,
        select: (index: number) => { g()?.workbenchSelectSegment?.(index); },
        setFlags: (index: number, flags: Record<string, boolean>) => g()?.workbenchSetSegmentFlags?.(index, flags),
        updatePrompt: (index: number, value: string) => g()?.workbenchUpdateSegmentPrompt?.(index, value),
        updatePrefix: (value: string) => g()?.workbenchUpdatePrefixTemplate?.(value),
        parseGroups: (source: string) => g()?.workbenchParseVideoGroups?.(source) || [],
        importGroups: (source: string, mode: string) => g()?.workbenchImportVideoGroups?.(source, mode),
        addSegment: () => g()?.workbenchAddSegment?.(),
        deleteSegment: (index: number) => g()?.workbenchDeleteSegment?.(index, { confirmDelete: () => true }),
        runCurrent: () => g()?.workbenchRunCurrent?.(),
        runSelected: () => g()?.workbenchRunSelected?.(),
        runAll: () => g()?.workbenchRunAll?.(),
        runRange: (from: string, to: string) => g()?.workbenchRunRange?.(from, to),
        reset: () => g()?.workbenchResetQueue?.({ confirmReset: () => true }),
        stop: () => g()?.workbenchStopEverything?.(),
        pause: () => g()?.workbenchPause?.(),
        resume: () => g()?.workbenchResume?.(),
        switchEpisode: (id: string) => g()?.workbenchSwitchEpisode?.(id),
        addEpisode: () => g()?.workbenchAddEpisode?.(),
        renameEpisode: (name: string) => g()?.workbenchRenameEpisode?.(name),
        deleteEpisode: () => g()?.workbenchDeleteEpisode?.({ confirmDelete: () => true }),
        replaceText: (scope: string, find: string, replacement: string) => g()?.workbenchReplaceText?.(scope, find, replacement),
        reviewMaterial: (index?: number) => g()?.workbenchReviewMaterial?.(index),
        markReviewed: (index: number, fingerprint: string) => g()?.workbenchMarkReviewed?.(index, fingerprint),
        markAllReviewed: () => g()?.workbenchMarkAllReviewed?.(),
        buildMaterial: (index?: number) => g()?.workbenchBuildExecutionMaterial?.(index),
        segmentKey: (segment: any, index: number) => `${g()?.workbenchEpisodeKeyPrefix?.() || ""}video:${segment.id}:${index}`,
        bindings: (key: string) => g()?.workbenchSegmentCharacterBindings?.(key) || {},
        executionAssets: (key: string) => g()?.workbenchExecutionAssets?.(key) || { characters: [], scenes: [], audio: [] },
        roles: (prompt: string) => g()?.workbenchSegmentRoles?.(prompt) || [],
        save: () => { g()?.workbenchNode?.("#saveProject")?.click(); },
    };
}
