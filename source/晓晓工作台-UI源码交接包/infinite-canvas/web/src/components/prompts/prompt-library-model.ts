import type { Prompt } from "@/services/api/prompts";

export type PromptRemovals = { deletedIds: string[]; deletedCategories: string[]; deletedTags: string[] };
export function applyPromptRemovals(items: Prompt[], removals: PromptRemovals) {
    const ids = new Set(removals.deletedIds), categories = new Set(removals.deletedCategories), tags = new Set(removals.deletedTags);
    return items.filter(item => !ids.has(item.id)).map(item => ({ ...item, category: categories.has(item.category) ? "" : item.category, tags: item.tags.filter(tag => !tags.has(tag)) }));
}
export function promptFacets(items: Prompt[]) {
    return { categories: Array.from(new Set(items.map(item => item.category).filter(Boolean))), tags: Array.from(new Set(items.flatMap(item => item.tags))) };
}
