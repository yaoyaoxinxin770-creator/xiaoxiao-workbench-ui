"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ALL_PROMPTS_OPTION, fetchPromptCatalog } from "@/services/api/prompts";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import { applyPromptRemovals, promptFacets } from "./prompt-library-model";

export const PROMPT_PAGE_SIZE = 20;
export function usePromptList({ keyword, tags, category, enabled = true }: { keyword: string; tags: string[]; category: string; enabled?: boolean }) {
    const removals = usePromptLibraryStore();
    const query = useQuery({ queryKey: ["prompt-catalog"], queryFn: fetchPromptCatalog, enabled: enabled && removals.ready, staleTime: 60_000 });
    const [limit, setLimit] = useState(PROMPT_PAGE_SIZE);
    const library = useMemo(() => applyPromptRemovals(query.data || [], removals), [query.data, removals.deletedIds, removals.deletedCategories, removals.deletedTags]);
    const facets = useMemo(() => promptFacets(library), [library]);
    const filterKey = JSON.stringify([keyword, tags, category]);
    useEffect(() => { setLimit(PROMPT_PAGE_SIZE); }, [filterKey, enabled]);
    const filtered = useMemo(() => {
        const search = keyword.trim().toLocaleLowerCase();
        const activeTags = tags.filter(tag => !removals.deletedTags.includes(tag));
        const activeCategory = removals.deletedCategories.includes(category) ? ALL_PROMPTS_OPTION : category;
        return library.filter(item => (activeCategory === ALL_PROMPTS_OPTION || item.category === activeCategory)
            && (!activeTags.length || activeTags.some(tag => item.tags.includes(tag)))
            && (!search || (item.title + " " + item.prompt).toLocaleLowerCase().includes(search)));
    }, [library, filterKey, removals.deletedTags, removals.deletedCategories]);
    return {
        query: { ...query, isLoading: !removals.ready || query.isLoading, hasNextPage: limit < filtered.length, isFetchingNextPage: false, fetchNextPage: async () => { setLimit(value => value + PROMPT_PAGE_SIZE); } },
        items: filtered.slice(0, limit), filteredItems: filtered, tags: [ALL_PROMPTS_OPTION, ...facets.tags], categories: [ALL_PROMPTS_OPTION, ...facets.categories], total: filtered.length,
    };
}
