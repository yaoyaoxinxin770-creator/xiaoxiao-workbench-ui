import { apiGet, compactApiParams } from "@/services/api/request";

export type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    category: string;
    githubUrl: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
};

export const ALL_PROMPTS_OPTION = "全部";

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page, pageSize }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<PromptListResponse>(
        "/api/prompts",
        compactApiParams({
            ...(keyword ? { keyword } : {}),
            ...(tag.length ? { tag } : {}),
            ...(category !== ALL_PROMPTS_OPTION ? { category } : {}),
            ...(page ? { page } : {}),
            ...(pageSize ? { pageSize } : {}),
        }),
    );
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Complete metadata lets deletion remove orphaned facets across every page.
// Only visible cards load cover images.
export async function fetchPromptCatalog() {
    const items: Prompt[] = [];
    const seen = new Set<string>();
    for (let page = 1; ; page++) {
        const response = await fetchPrompts({ page, pageSize: 500 });
        const fresh = response.items.filter(item => !seen.has(item.id));
        for (const item of fresh) { seen.add(item.id); items.push(item); }
        if (items.length >= response.total) return items;
        if (!fresh.length) throw new Error("提示词库分页数据不完整，请重试");
    }
}
