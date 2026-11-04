"use client";

import { FolderPlus, Search, Trash2, X } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { App, Button, Checkbox, Empty, Input, Spin, Tag } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message, modal } = App.useApp();
    const library = usePromptLibraryStore();
    const [titleInput, setTitleInput] = useState("");
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, filteredItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

    useEffect(() => {
        if (query.isError) {
            message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
        }
    }, [message, query.error, query.isError]);

    useEffect(() => { setSelectedIds([]); }, [titleKeyword, selectedTags, selectedCategory]);
    useEffect(() => { const allowed=new Set(filteredItems.map(item=>item.id));setSelectedIds(current=>current.every(id=>allowed.has(id))?current:current.filter(id=>allowed.has(id))); }, [filteredItems]);
    const toggleSelected = (id:string, checked:boolean) => setSelectedIds(current=>checked?[...new Set([...current,id])]:current.filter(value=>value!==id));
    const removeSelected = () => {
        const ids=[...selectedIds];if(!ids.length)return;
        modal.confirm({title:`删除选中的 ${ids.length} 条提示词？`,content:"会移除所选图片和提示词文本，并清理不再使用的分类、标签；重启后不会恢复。",okText:"删除所选",cancelText:"取消",okButtonProps:{danger:true},onOk:()=>{library.deletePrompts(ids);setSelectedIds([]);if(selectedPrompt && ids.includes(selectedPrompt.id))setSelectedPrompt(null);message.success(`已删除 ${ids.length} 条提示词`);}});
    };
    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success("已加入我的素材");
    };

    const remove = (kind: "prompt" | "category" | "tag", value: string, title = value) => {
        modal.confirm({
            title: kind === "prompt" ? "删除这条提示词？" : kind === "category" ? "删除这个分类？" : "删除这个标签？",
            content: kind === "prompt" ? "将从工作台提示词库移除图片、提示词及关联分类和标签；重启后不会重新出现。" : "只移除分类或标签，保留其中的图片和提示词。",
            okText: "删除", cancelText: "取消", okButtonProps: { danger: true },
            onOk: () => {
                if (kind === "prompt") { library.deletePrompt(value); if (selectedPrompt?.id === value) setSelectedPrompt(null); }
                else if (kind === "category") { library.deleteCategory(value); if (selectedCategory === value) setSelectedCategory(ALL_PROMPTS_OPTION); }
                else { library.deleteTag(value); setSelectedTags(tags => tags.filter(tag => tag !== value)); }
                message.success("已删除：" + title);
            },
        });
    };

    const searchByTitleInput = () => {
        setTitleKeyword(titleInput);
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
            void query.fetchNextPage();
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main
                className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]"
                onScroll={handleListScroll}
            >
                <div className="pb-8">
                    <div className="mx-auto max-w-5xl text-center">
                        <h1 className="text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">提示词中心</h1>
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">共 {totalPrompts} 条提示词，按标题、标签与分类快速查找灵感。</p>
                    </div>
                    {query.isLoading ? (
                        <div className="flex h-60 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    {!query.isLoading ? (
                        <>
                            <div className="mx-auto mt-8 w-full max-w-2xl">
                                <Input aria-label="搜索提示词" size="large" className="w-full" prefix={<Search className="size-4 text-stone-400" />} value={titleInput} placeholder="按标题查询，按 Enter 搜索" onChange={(event) => setTitleInput(event.target.value)} onPressEnter={searchByTitleInput} />
                            </div>
                            <div className="mx-auto mt-6 grid max-w-6xl gap-3 text-left">
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">分类</div>
                                    <div className="flex flex-wrap gap-2">
                                        {promptCategoryOptions.map((category) => (
                                            <span key={category} className="inline-flex items-center"><Tag.CheckableTag checked={selectedCategory === category} className={cn("prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => setSelectedCategory(category)}>
                                                {category}
                                            </Tag.CheckableTag>{category !== ALL_PROMPTS_OPTION && <button aria-label={"删除分类 " + category} title="删除分类，保留提示词" className="-ml-1 mr-1 rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => remove("category", category)}><X className="size-3"/></button>}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">标签</div>
                                    <div className="thin-scrollbar flex max-h-[112px] flex-wrap gap-2 overflow-y-auto pr-1">
                                        {promptTags.map((tag) => (
                                            <span key={tag} className="inline-flex items-center"><Tag.CheckableTag
                                                checked={tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)}
                                                className={cn("prompt-filter-tag", (tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)) && "is-active")}
                                                onChange={() => toggleTag(tag)}
                                            >
                                                {tag}
                                            </Tag.CheckableTag>{tag !== ALL_PROMPTS_OPTION && <button aria-label={"删除标签 " + tag} title="删除标签，保留提示词" className="-ml-1 mr-1 rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => remove("tag", tag)}><X className="size-3"/></button>}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>

                {!query.isLoading ? (
                    <div>
                        <div data-prompt-selection className="sticky top-0 z-20 mx-auto mb-5 flex max-w-7xl flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                            <Checkbox aria-label="本页提示词全选" disabled={!promptItems.length} checked={promptItems.length>0 && promptItems.every(item=>selectedIds.includes(item.id))} indeterminate={promptItems.some(item=>selectedIds.includes(item.id)) && !promptItems.every(item=>selectedIds.includes(item.id))} onChange={event=>setSelectedIds(current=>event.target.checked?[...new Set([...current,...promptItems.map(item=>item.id)])]:current.filter(id=>!promptItems.some(item=>item.id===id)))}>本页全选</Checkbox>
                            <span className="text-sm text-muted-foreground">已选 {selectedIds.length} · 筛选结果 {totalPrompts} 条</span>
                            <Button aria-label="全选筛选提示词" size="small" disabled={!filteredItems.length} onClick={()=>setSelectedIds(filteredItems.map(item=>item.id))}>全选全部筛选结果</Button>
                            <Button size="small" disabled={!selectedIds.length} onClick={()=>setSelectedIds([])}>取消选择</Button>
                            <Button aria-label="批量删除提示词" danger icon={<Trash2 className="size-4"/>} disabled={!selectedIds.length} onClick={removeSelected}>删除所选{selectedIds.length ? `（${selectedIds.length}）` : ""}</Button>
                        </div>
                        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {promptItems.map((item) => (
                                <div key={item.id} data-prompt-id={item.id} className={cn("relative rounded-xl",selectedIds.includes(item.id)&&"ring-2 ring-primary")}>
                                <Checkbox aria-label={"选择提示词 " + item.title} checked={selectedIds.includes(item.id)} onChange={event=>toggleSelected(item.id,event.target.checked)} className="!absolute left-3 top-3 z-10 rounded-lg bg-card/95 p-2 shadow-sm" />
                                <PromptCard
                                    item={item}
                                    onOpen={() => setSelectedPrompt(item)}
                                    onCopy={() => copyText(item.prompt, "提示词已复制")}
                                    extraAction={
                                        <div className="flex flex-wrap gap-2"><Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                            加入我的素材
                                        </Button><Button size="small" danger aria-label={"删除提示词 " + item.title} icon={<Trash2 className="size-3.5"/>} onClick={() => remove("prompt", item.id, item.title)}>删除</Button></div>
                                    }
                                />
                                </div>
                            ))}
                        </div>
                        {promptItems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-16" /> : null}
                        <div className="mx-auto mt-6 max-w-7xl text-center text-xs text-stone-500 dark:text-stone-400">
                            {query.isFetchingNextPage ? "加载中..." : query.hasNextPage ? "继续向下滚动加载更多" : promptItems.length > 0 ? "已经到底了" : null}
                        </div>
                    </div>
                ) : null}
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
        </div>
    );
}
