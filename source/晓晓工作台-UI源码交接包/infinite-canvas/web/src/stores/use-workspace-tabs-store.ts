"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import localforage from "localforage";

import type {WorkbenchTaskItem} from "@/app/(user)/video/running-tasks";
export type WorkspaceTab = { id: string; kind: "jimeng" | "video"; name: string; target: string; href: string };
export const projectTabId = (kind: WorkspaceTab["kind"], target: string) => kind + ":" + (kind === "jimeng" ? target.replace(/[\\/]$/, "").toLowerCase() : target);
const storage = localforage.createInstance({ name: "xiaoxiao-workspaces", storeName: "tabs" });
export const useWorkspaceTabsStore = create<{
    taskItems:WorkbenchTaskItem[]; setTaskItems:(items:WorkbenchTaskItem[])=>void;
    tabs: WorkspaceTab[]; activeId: string; lastByKind: Record<string,string>; errors: Record<string, string>; busy: Record<string, boolean>; taskCounts: Record<string,number>;
    open: (tab: Omit<WorkspaceTab, "id">) => void; close: (id: string) => void;
    rename: (id: string, name: string) => void; setError: (id: string, error: string) => void;
    setBusy: (id: string, busy: boolean) => void;
    setTaskCount: (id:string,count:number)=>void;
}>()(persist((set) => ({
    taskItems:[],setTaskItems:taskItems=>set({taskItems}),
    tabs: [], activeId: "", lastByKind: {}, errors: {}, busy: {}, taskCounts: {},
    open: tab => { const id = projectTabId(tab.kind, tab.target); set(s => ({ activeId: id, lastByKind:{...s.lastByKind,[tab.kind]:id}, tabs: s.tabs.some(t => t.id === id) ? s.tabs.map(t => t.id === id ? { ...tab, id } : t) : [...s.tabs, { ...tab, id }] })); },
    close: id => set(s => s.busy[id] ? s : ({ tabs: s.tabs.filter(t => t.id !== id), activeId: s.activeId === id ? s.tabs.filter(t => t.id !== id).at(-1)?.id || "" : s.activeId })),
    rename: (id, name) => set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, name } : t) })),
    setError: (id, error) => set(s => ({ errors: { ...s.errors, [id]: error } })),
    setTaskCount: (id,count) => set(s=>s.taskCounts[id]===count?s:({taskCounts:{...s.taskCounts,[id]:count}})),
    setBusy: (id, busy) => set(s => s.busy[id] === busy ? s : ({ busy: { ...s.busy, [id]: busy } })),
}), { name: "open-workspaces", storage: createJSONStorage(() => storage), partialize: ({ tabs, activeId, lastByKind }) => ({ tabs, activeId, lastByKind }), skipHydration: typeof window === "undefined" }));
