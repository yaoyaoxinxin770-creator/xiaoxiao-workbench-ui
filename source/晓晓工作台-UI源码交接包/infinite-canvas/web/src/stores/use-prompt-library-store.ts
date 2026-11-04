"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { localForageStorage } from "@/lib/localforage-storage";
import type { PromptRemovals } from "@/components/prompts/prompt-library-model";

type PromptLibraryStore = PromptRemovals & {
    ready: boolean;
    deletePrompt: (id: string) => void;
    deletePrompts: (ids: string[]) => void;
    deleteCategory: (name: string) => void;
    deleteTag: (name: string) => void;
};
// Public catalog entries are shared. Removals belong to this workbench and
// persist so refreshes and catalog syncs cannot restore deleted entries.
export const usePromptLibraryStore = create<PromptLibraryStore>()(persist(set => ({
    ready: false, deletedIds: [], deletedCategories: [], deletedTags: [],
    deletePrompt: id => set(state => ({ deletedIds: [...new Set([...state.deletedIds, id])] })),
    deletePrompts: ids => set(state => ({ deletedIds: [...new Set([...state.deletedIds, ...ids])] })),
    deleteCategory: name => set(state => ({ deletedCategories: [...new Set([...state.deletedCategories, name])] })),
    deleteTag: name => set(state => ({ deletedTags: [...new Set([...state.deletedTags, name])] })),
}), {
    name: "infinite-canvas:prompt-library-removals", storage: createJSONStorage(() => localForageStorage),
    skipHydration: typeof window === "undefined",
    partialize: ({ deletedIds, deletedCategories, deletedTags }) => ({ deletedIds, deletedCategories, deletedTags }),
    onRehydrateStorage: () => (_state, error) => { if (error) console.error("提示词库删除记录读取失败", error); usePromptLibraryStore.setState({ ready: !error }); },
}));
