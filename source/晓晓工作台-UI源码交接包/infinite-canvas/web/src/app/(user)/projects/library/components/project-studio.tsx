"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, App, Button, Checkbox, Empty, Input, Modal, Pagination, Popover, Select, Slider, Spin, Table, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { ArrowLeft, Boxes, ChevronRight, Download, FilePlus, FileText, Folder, FolderPlus, Images, LayoutGrid, RefreshCw, SlidersHorizontal, Upload } from "lucide-react";
import { ProjectViewTabs } from "@/components/storyboard/project-view-tabs";
import { useCopyText } from "@/hooks/use-copy-text";
import { libraryCall, type LibraryItem, type ProjectLibrary } from "@/services/api/project-library";
import { workbench, type Workspace } from "@/services/api/workbench";
import { useTypetaleStore } from "@/app/(user)/typetale/stores/use-typetale-store";
import { LibraryCard, REVIEW, CATEGORIES, categoryName, dateLabel } from "./library-card";

export function ProjectStudio({projectRoot, embedded = false, bare = false}: {projectRoot?: string; embedded?: boolean; bare?: boolean}) {
    const params = useSearchParams(), root = projectRoot || params.get("project") || "", workspace: Workspace = params.get("workspace") === "typetale" ? "typetale" : "jimeng";
    const { message, modal } = App.useApp(), copy = useCopyText();
    const referenceOnly = workspace === "jimeng";
    const inputCategories = [{value:"characters",label:"人物"},{value:"scenes",label:"场景"},{value:"props",label:"道具"},{value:"audio",label:"音频"}];
    const [data, setData] = useState<ProjectLibrary | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
    const [view, setView] = useState(referenceOnly || embedded ? "elements" : params.get("view") === "elements" ? "elements" : "results"), [folder, setFolder] = useState("");
    const [search, setSearch] = useState(""), [media, setMedia] = useState("all"), [status, setStatus] = useState("all"), [category, setCategory] = useState("all"), [elementState, setElementState] = useState("all"), [model, setModel] = useState("all");
    const [layout, setLayout] = useState("grid"), [cardSize, setCardSize] = useState(220), [sort, setSort] = useState("newest"), [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState<React.Key[]>([]), [selected, setSelected] = useState<string[]>([]), [detailId, setDetailId] = useState(""), [preview, setPreview] = useState(""), [dropOver, setDropOver] = useState(false);
    const [brief, setBrief] = useState(""), [briefDirty, setBriefDirty] = useState(false);
    const [editName, setEditName] = useState(""), [editRole, setEditRole] = useState(""), [editCategory, setEditCategory] = useState("other"), [editAudio, setEditAudio] = useState<string | undefined>();
    const refresh = useCallback(async () => {
        if (!root) return;
        setLoading(true);
        try { const next = await libraryCall("libraryList", root); setData(next); setError(""); setBrief(current => briefDirty ? current : next.brief); }
        catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, [root, briefDirty]);
    useEffect(() => { void refresh(); }, [root]); // Load only when the project changes; edits do not trigger a rescan.
    useEffect(() => { setView(referenceOnly || embedded ? "elements" : params.get("view") === "elements" ? "elements" : "results"); setFolder(""); setSelected([]); }, [params, embedded, referenceOnly]);
    useEffect(() => { setPage(1); }, [view, folder, search, media, status, category, elementState, model, sort, layout]);
    const elements = referenceOnly || view !== "results", base = useMemo(() => (data?.items || []).filter(item => referenceOnly ? item.source === "element" && item.mediaType !== "video" : view === "all" || (elements ? item.source === "element" : item.source === "result")), [data, elements, view, referenceOnly]);
    const counts = useMemo(() => { const result = new Map<string, number>(); for (const item of base) for (const id of item.groupIds) result.set(id, (result.get(id) || 0) + 1); return result; }, [base]);
    const folderMap = useMemo(() => new Map((data?.folders || []).map(item => [item.id, item])), [data]);
    const tree = useMemo(() => {
        const children = new Map<string, DataNode[]>();
        for (const entry of data?.folders || []) {
            if (referenceOnly && (!counts.get(entry.id) || entry.id.startsWith("path:@linked"))) continue;
            const node = { key: entry.id, title: <span className="flex items-center justify-between gap-2"><span className="truncate">{entry.title}</span><span className="text-xs text-muted-foreground">{counts.get(entry.id) || 0}</span></span>, icon: <Folder size={15} />, children: [] as DataNode[] };
            children.set(entry.id, node.children); if (!children.has(entry.parent)) children.set(entry.parent, []); children.get(entry.parent)!.push(node);
        }
        const roots = children.get("") || [];
        if (!referenceOnly) return roots;
        // 即梦素材按分类构树：每个分类根节点带绑定/选文件入口，绑定过的文件夹挂在对应分类下。
        return [...inputCategories.map(item => {
            const links: DataNode[] = (data?.folderLinks || []).filter(link => link.kind === item.value).map(link => ({
                key: "path:@linked/" + link.id,
                title: <span className="flex w-full items-center justify-between gap-1"><span className="truncate" title={link.path}>{link.name}{link.files ? " (" + link.files.length + ")" : ""}</span><span className="flex shrink-0 items-center gap-0.5"><span className="text-xs text-muted-foreground">{counts.get("path:@linked/" + link.id) || 0}</span><Button size="small" type="text" disabled={saving} aria-label={"解除绑定 " + link.name} onClick={e => { e.stopPropagation(); void bindFolder(item.value, link.id); }}>×</Button></span></span>,
                icon: <Folder size={15} />,
            }));
            return {
                key: "kind:" + item.value,
                title: <span className="flex w-full items-center justify-between gap-1"><span className="truncate font-medium">{item.label}</span><span className="flex shrink-0 items-center gap-0.5"><span className="mr-0.5 text-xs text-muted-foreground">{base.filter(entry => entry.category === item.value).length}</span><Button size="small" type="text" disabled={saving} icon={<FolderPlus size={14} />} aria-label={"绑定" + item.label + "文件夹"} onClick={e => { e.stopPropagation(); void bindFolder(item.value); }} /><Button size="small" type="text" disabled={saving} icon={<FilePlus size={14} />} aria-label={"选择" + item.label + (item.value === "audio" ? "文件" : "图片")} onClick={e => { e.stopPropagation(); void bindFiles(item.value); }} /></span></span>,
                children: links.length ? links : undefined,
            };
        }), ...roots];
    }, [data, counts, referenceOnly, base, saving]);
    useEffect(() => { setExpanded([...(referenceOnly ? inputCategories.map(item => "kind:" + item.value) : []), ...(data?.folders || []).map(entry => entry.id)]); }, [root, data]);
    const visible = useMemo(() => base.filter(item => (!folder || item.groupIds.includes(folder)) && (!search || `${item.displayName} ${item.role || ""} ${item.prompt || ""}`.toLowerCase().includes(search.toLowerCase())) && (media === "all" || item.mediaType === media) && (status === "all" || item.status === status) && (!elements || category === "all" || item.category === category) && (!elements || elementState === "all" || item.elementStatus === elementState) && (model === "all" || item.model === model)).sort((a, b) => sort === "name" ? a.displayName.localeCompare(b.displayName, "zh-CN") : ((Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)) * (sort === "oldest" ? -1 : 1)), [base, folder, search, media, status, elements, category, elementState, model, sort]);
    const pageItems = visible.slice((page - 1) * 60, page * 60), detail = data?.items.find(item => item.id === detailId);
    const breadcrumb = useMemo(() => { const result = []; let current = folderMap.get(folder); while (current) { result.unshift(current); current = folderMap.get(current.parent); } return result; }, [folderMap, folder]);
    useEffect(() => {
        setPreview(""); if (!detail) return;
        setEditName(detail.displayName); setEditRole(detail.role || ""); setEditCategory(detail.category || "other"); setEditAudio(detail.audioPath || undefined);
        let alive = true;
        if (detail.relativePath && !detail.missing) libraryCall("libraryPreview", root, detail.relativePath).then(result => { if (alive) setPreview(result.preview); }).catch((e: any) => message.error(e.message));
        else if (detail.url) setPreview(detail.url);
        return () => { alive = false; };
    }, [root, detailId]);
    const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    const mutate = async (method: string, ...args: any[]) => { setSaving(true); try { const result = await libraryCall(method, root, ...args); if (!result.canceled) { await refresh(); return result; } } catch (e: any) { message.error(e.message); } finally { setSaving(false); } };
    const bindFolder = async (kind:string, id?:string) => {
        if (/运行中|已暂停/.test(document.getElementById("runStatus")?.textContent || "")) return message.warning("任务运行中，请停止后调整素材文件夹。");
        const result=await mutate(id ? "assetUnlinkFolder" : "assetLinkFolder",id || kind);
        if(result) { await window.personalWorkbench?.workbenchRefreshAssets?.(root); message.success(id ? "已解除绑定，原文件保留" : "素材文件夹已绑定，未复制文件"); }
    };
    const bindFiles = async (kind: string) => {
        if (/运行中|已暂停/.test(document.getElementById("runStatus")?.textContent || "")) return message.warning("任务运行中，请停止后调整素材。");
        const result = await mutate("assetLinkFiles", kind);
        if (result) { await window.personalWorkbench?.workbenchRefreshAssets?.(root); message.success("已引用所选原文件，未复制素材"); }
    };
    const linkDropped = async (files: File[]) => {
        if (/运行中|已暂停/.test(document.getElementById("runStatus")?.textContent || "")) return message.warning("任务运行中，请停止后调整素材。");
        if (!files.length) return;
        const result = await mutate("assetLinkPaths", category, files);
        if (result) { await window.personalWorkbench?.workbenchRefreshAssets?.(root); message.success(`已引用 ${result.linked || 0} 个原文件，未复制${result.skipped ? "，跳过 " + result.skipped + " 个不支持的文件" : ""}`); }
    };
    const clearMaterials = (ids: string[] | null) => {
        if (/运行中|已暂停/.test(document.getElementById("runStatus")?.textContent || "")) return message.warning("任务运行中，请停止后清空素材。");
        const paths=ids===null ? null : (data?.items||[]).filter(item=>ids.includes(item.id)).map(item=>item.relativePath);
        if(paths && !paths.length) return;
        modal.confirm({title:ids===null ? "清空全部素材引用？" : "清空所选 "+paths!.length+" 个素材引用？",content:ids===null ? "移除当前项目全部素材引用及文件夹绑定，原图片和音频文件保留。清空不受当前筛选条件限制。" : "只从当前工作台移除这些素材，原文件保留；关联分镜引用也会移除。",okText:"清空引用",cancelText:"取消",onOk:async()=>{
            const result=await mutate("assetClearReferences",paths);
            if(result) {setSelected([]);setDetailId("");setPage(1);if(ids===null)setFolder("");await window.personalWorkbench?.workbenchRefreshAssets?.(root);message.success("已清空素材引用，原文件保留");}
        }});
    };
    const setReview = async (ids: string[], next: string) => { if (await mutate("libraryEdit", ids, { status: next })) message.success("审片状态已保存"); };
    const exportItems = async (ids: string[]) => { const files = (data?.items || []).filter(item => ids.includes(item.id) && item.relativePath && !item.missing).map(item => item.relativePath); if (!files.length) return message.warning("请先下载云端结果，再导出本地文件。"); const result = await mutate("libraryExport", files); if (result) message.success(`已导出 ${result.exported} 个文件`); };
    const saveElement = async () => {
        if (!detail?.relativePath) return;
        const patch: Record<string, any> = { displayName: editName, role: editRole, category: editCategory };
        if (editAudio !== undefined) patch.audio = editAudio;
        if (await mutate("assetEdit", detail.relativePath, patch)) { if (useTypetaleStore.getState().projectPath === root) await useTypetaleStore.getState().refreshAssets(); await window.personalWorkbench?.workbenchRefreshAssets?.(root); message.success("项目共用素材已更新"); }
    };
    const card = (item: LibraryItem, masonry = false) => <LibraryCard key={item.id} item={item} root={root} masonry={masonry} selected={selected.includes(item.id)} onSelect={() => toggle(item.id)} onOpen={() => setDetailId(item.id)} />;
    if (!root) return <main className="p-10"><Empty description="请从项目管理打开一个项目的资产库"><Link href="/projects"><Button>项目管理</Button></Link></Empty></main>;
    return <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-testid="project-library">
        {bare ? null : <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-2"><Link href={embedded ? `/jimeng?project=${encodeURIComponent(root)}` : "/projects"} className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft size={14} />{embedded ? "返回即梦分镜" : "项目管理"}</Link><span className="max-w-64 truncate font-semibold">{data?.name || "项目工作台"}</span><ProjectViewTabs root={root} workspace={workspace} active={referenceOnly || embedded ? "elements" : view} /><Button size="small" className="ml-auto" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void refresh()}>刷新</Button></header>}
        {error ? <Alert type="error" title={error} /> : null}
        <div className="flex min-h-0 flex-1">
            <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/50 max-sm:w-40" aria-label="项目资产导航">
                <div className="space-y-1 border-b border-border p-3">{[{id:"brief",label:"项目简介",icon:FileText},...(referenceOnly ? [{id:"elements",label:"Elements 素材库",icon:Boxes}] : [...(embedded ? [{id:"all",label:"全部 Elements",icon:Boxes}] : []),{id:"elements",label:"参考素材",icon:Boxes},{id:"results",label:"生成结果",icon:Images}])].map(item => <button key={item.id} onClick={() => { setView(item.id); setFolder(""); setSelected([]); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${view === item.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary"}`}><item.icon size={16} />{item.label}</button>)}</div>
                {view !== "brief" ? <><div className="px-4 pb-2 pt-4 text-xs text-muted-foreground">{referenceOnly ? "素材来源 · 原路径引用，仅最外层" : "文件夹 · 包含下级内容"}</div><button className={`mx-3 mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${!folder ? "bg-secondary font-semibold" : ""}`} onClick={() => { setFolder(""); setCategory("all"); }}><span>全部{elements ? "素材" : "结果"}</span><span>{base.length}</span></button><div className="min-h-0 flex-1 overflow-auto px-2 pb-4"><Tree showIcon blockNode expandedKeys={expanded} onExpand={keys => setExpanded(keys)} treeData={tree} selectedKeys={folder ? [folder] : (referenceOnly && category !== "all" ? ["kind:" + category] : [])} onSelect={keys => { const key = String(keys[0] || ""); if (referenceOnly && key.startsWith("kind:")) { setCategory(key.slice(5)); setFolder(""); } else setFolder(key); }} /></div></> : <p className="px-5 py-4 text-xs leading-6 text-muted-foreground">在这里记录故事梗概、风格约定和制作说明。简介保存在当前项目目录。</p>}
            </aside>
            <section className="flex min-w-0 flex-1 flex-col">
                {view === "brief" ? <div className="mx-auto w-full max-w-4xl overflow-auto p-8"><p className="eyebrow">PROJECT BRIEF</p><h1 className="my-4 text-2xl font-semibold">项目简介</h1><Input.TextArea aria-label="项目简介正文" value={brief} onChange={e => { setBrief(e.target.value); setBriefDirty(true); }} placeholder="故事梗概、人物设定、视觉风格、制作记录…" autoSize={{ minRows: 18 }} maxLength={200000} /><Button className="mt-4" type="primary" loading={saving} disabled={!briefDirty} onClick={async () => { if (await mutate("libraryBrief", brief)) { setBriefDirty(false); message.success("项目简介已保存"); } }}>保存简介</Button></div> : <>
                    <div data-testid="library-toolbar" className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5"><button onClick={() => setFolder("")} className="text-sm">全部</button>{breadcrumb.map(entry => <span key={entry.id} className="flex items-center gap-1 text-sm"><ChevronRight size={13} className="text-muted-foreground" /><button onClick={() => setFolder(entry.id)}>{entry.title}</button></span>)}<span className="text-xs text-muted-foreground">{visible.length} 项</span><div className="ml-auto flex items-center gap-2">{bare ? <Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void refresh()}>刷新</Button> : null}<Input size="small" allowClear aria-label="搜索资产" placeholder="搜索名称或提示词" value={search} onChange={e => setSearch(e.target.value)} className="!w-44 max-sm:!w-28" /><Popover trigger="click" content={<div className="flex w-56 flex-col gap-3"><Select aria-label="媒体类型" value={media} onChange={setMedia} options={[{value:"all",label:"所有类型"},{value:"image",label:"图片"},...(!referenceOnly ? [{value:"video",label:"视频"}] : []),{value:"audio",label:"音频"}]} /><Select aria-label="审片状态筛选" value={status} onChange={setStatus} options={[{value:"all",label:"所有审片状态"},...REVIEW]} /><Select aria-label="结果排序" value={sort} onChange={setSort} options={[{value:"newest",label:"最新创建"},{value:"oldest",label:"最早创建"},{value:"name",label:"名称"}]} />{elements ? <><Select aria-label="元素分类" value={category} onChange={setCategory} options={[{value:"all",label:"所有分类"},...CATEGORIES]} /><Select aria-label="元素状态筛选" value={elementState} onChange={setElementState} options={[{value:"all",label:"已启用及草稿"},{value:"active",label:"已启用"},{value:"draft",label:"草稿"}]} /></> : <Select aria-label="模型筛选" value={model} onChange={setModel} options={[{value:"all",label:"所有模型"},...[...new Set(base.map(item => item.model).filter(Boolean))].map(value => ({value:value!,label:value!}))]} />}</div>}><Button size="small" icon={<SlidersHorizontal size={14} />}>筛选</Button></Popover><Popover trigger="click" content={<div className="w-60"><p className="mb-2 text-xs text-muted-foreground">布局</p><Select className="w-full" aria-label="资产布局" value={layout} onChange={setLayout} options={[{value:"grid",label:"网格"},{value:"masonry",label:"瀑布流"},{value:"kanban",label:"看板 · 审片状态"},{value:"table",label:"表格"}]} /><p className="mb-1 mt-4 text-xs text-muted-foreground">卡片大小</p><Slider min={160} max={360} value={cardSize} onChange={setCardSize} /></div>}><Button size="small" icon={<LayoutGrid size={14} />}>视图</Button></Popover>{!referenceOnly ? <Button disabled={saving} icon={<Upload size={14} />} onClick={() => void mutate(elements ? "assetImport" : "libraryImport", elements ? "auto" : folder)}>添加{elements ? "素材" : "结果"}</Button> : null}</div></div>
                    {referenceOnly ? <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-3 py-1.5">{[{value:"all",label:"全部"},...inputCategories].map(item=><Button key={item.value} size="small" type={category===item.value?"primary":"text"} onClick={()=>{setCategory(item.value);setFolder("");}}>{item.label}</Button>)}<span className="ml-auto text-[11px] text-muted-foreground" title="引用原图片或音频，不复制文件；绑定文件夹只读取最外层，不读取子文件夹。">原路径引用 · 仅最外层</span></div> : null}
                    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-2 text-xs"><Checkbox checked={pageItems.length > 0 && pageItems.every(item => selected.includes(item.id))} indeterminate={pageItems.some(item => selected.includes(item.id)) && !pageItems.every(item => selected.includes(item.id))} onChange={e => setSelected(current => e.target.checked ? [...new Set([...current,...pageItems.map(item => item.id)])] : current.filter(id => !pageItems.some(item => item.id === id)))}>本页全选</Checkbox><span className="text-muted-foreground">已选 {selected.length}</span>{referenceOnly ? <><Button size="small" disabled={saving || !base.length} onClick={()=>clearMaterials(null)}>全部清空</Button><Button size="small" disabled={saving || !selected.length} onClick={()=>clearMaterials(selected)}>清空所选</Button></> : null}{selected.length ? <><Select aria-label="批量审片状态" placeholder="标记审片状态" className="w-36" options={REVIEW} disabled={saving} onChange={value => void setReview(selected, value)} /><Button size="small" icon={<Download size={13} />} disabled={saving} onClick={() => void exportItems(selected)}>导出所选</Button><Button size="small" type="text" onClick={() => setSelected([])}>取消选择</Button></> : null}</div>
                    <div className={"min-h-0 flex-1 overflow-auto p-5" + (dropOver ? " rounded-xl outline-2 outline-dashed outline-primary bg-accent/30" : "")} data-testid="library-gallery"
                        onDragOver={referenceOnly ? event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "link"; setDropOver(true); } } : undefined}
                        onDragLeave={referenceOnly ? event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropOver(false); } : undefined}
                        onDrop={referenceOnly ? event => { event.preventDefault(); setDropOver(false); void linkDropped(Array.from(event.dataTransfer.files)); } : undefined}>
                        {loading && !data ? <div className="p-12 text-center"><Spin /></div> : null}
                        {!loading && !visible.length ? <Empty className="mt-20" description={base.length ? "没有符合筛选条件的资产" : elements ? "添加人物、场景、道具和音频，供当前项目共用" + (referenceOnly ? "；也可以直接把图片 / 音频拖进来" : "") : "还没有本地生成结果。可导入已下载的结果并归入对应镜头。"} /> : null}
                        {layout === "table" ? <Table<LibraryItem> rowKey="id" size="small" dataSource={pageItems} pagination={false} scroll={{x:800}} rowSelection={{selectedRowKeys:selected,onChange:keys => setSelected(keys.map(String))}} columns={[{title:"名称",dataIndex:"displayName",render:(name,item)=><button className="text-primary" onClick={() => setDetailId(item.id)}>{name}</button>},{title:"类型",dataIndex:"mediaType",render:value=>({image:"图片",video:"视频",audio:"音频"}[value as string] || value)},{title:elements?"分类":"模型",render:(_,item)=>elements?categoryName(item.category):item.model || "—"},{title:"状态",dataIndex:"status",render:value=>REVIEW.find(s=>s.value===value)?.label},{title:"创建日期",dataIndex:"createdAt",render:dateLabel}]} /> : layout === "kanban" ? <div className="flex min-w-max gap-4">{REVIEW.map(state => <div key={state.value} className="w-64 rounded-xl bg-secondary/40 p-3"><div className="mb-3 flex justify-between text-sm font-medium"><span>{state.label}</span><span className="text-muted-foreground">{visible.filter(item => item.status === state.value).length}</span></div>{pageItems.filter(item => item.status === state.value).map(item => card(item))}</div>)}</div> : <div style={layout === "masonry" ? {columnWidth:cardSize,columnGap:12} : {display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${cardSize}px,1fr))`,gap:12,alignItems:"start"}}>{pageItems.map(item => card(item, layout === "masonry"))}</div>}
                        {data?.warnings.length ? <details className="mt-4 text-xs text-muted-foreground"><summary>扫描提示（{data.warnings.length}）</summary>{data.warnings.map((warning,i) => <p key={i}>{warning}</p>)}</details> : null}
                    </div><div className="flex justify-end border-t border-border px-5 py-3"><Pagination current={page} pageSize={60} total={visible.length} showSizeChanger={false} onChange={setPage} hideOnSinglePage /></div>
                </>}
            </section>
        </div>
        <Modal open={Boolean(detail)} title={detail?.displayName} onCancel={() => setDetailId("")} footer={null} width={960} destroyOnHidden>
            {detail ? <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]"><div className="flex min-h-64 items-center justify-center rounded-xl bg-secondary/50 p-3">{preview ? detail.mediaType === "image" ? <img className="max-h-[60vh] w-full object-contain" src={preview} alt={detail.displayName} onClick={()=>setDetailId("")} /> : detail.mediaType === "audio" ? <audio controls src={preview} className="w-full" /> : <video controls src={preview} className="max-h-[60vh] w-full" /> : <p className="text-muted-foreground">{detail.missing ? "原文件已不存在" : "正在读取预览…"}</p>}</div><div className="flex flex-col gap-3"><p className="break-all text-xs text-muted-foreground">{detail.sourcePath || detail.relativePath || "云端结果，尚未保存到项目"}</p><Select aria-label="详情审片状态" value={detail.status} options={REVIEW} disabled={saving} onChange={value => void setReview([detail.id], value)} />{detail.source === "element" ? <><p className="text-xs text-muted-foreground">元素名称</p><Input aria-label="元素名称" value={editName} onChange={e => setEditName(e.target.value)} maxLength={200} /><Select aria-label="元素分类编辑" value={editCategory} options={CATEGORIES} onChange={setEditCategory} disabled={detail.mediaType === "audio"} /><Input aria-label="角色名称" placeholder="所属角色（可选）" value={editRole} onChange={e => setEditRole(e.target.value)} maxLength={200} />{detail.mediaType === "image" ? <Select allowClear placeholder="绑定角色音色（可选）" aria-label="绑定角色音频" value={editAudio} onChange={value => setEditAudio(value || "")} options={(data?.items || []).filter(item => item.source === "element" && item.mediaType === "audio").map(item => ({value:item.relativePath,label:item.displayName}))} /> : null}<Button loading={saving} onClick={() => void saveElement()}>保存素材设置</Button><Select aria-label="元素启用状态" value={detail.elementStatus} options={[{value:"active",label:"已启用"},{value:"draft",label:"草稿"}]} disabled={saving} onChange={value => void mutate("libraryEdit", [detail.id], {elementStatus:value})} /><Button onClick={() => copy(`@${detail.displayName}`, "已复制素材引用名称")}>复制 @{detail.displayName}</Button>{referenceOnly ? <Button disabled={saving} onClick={()=>clearMaterials([detail.id])}>清空此素材</Button> : null}</> : <><p className="text-xs text-muted-foreground">模型：{detail.model || "未记录"}<br />渠道：{detail.provider || "未记录"}<br />创建：{dateLabel(detail.createdAt)}</p><Select allowClear aria-label="结果归档镜头" placeholder="归档到章节／镜头" value={detail.groupIds.filter(id => !id.startsWith("path:")).at(-1)} options={(data?.folders || []).filter(entry => entry.kind !== "folder").map(entry => ({value:entry.id,label:entry.title}))} disabled={saving} onChange={value => void mutate("libraryEdit", [detail.id], {folderId:value || ""})} /><Input.TextArea readOnly aria-label="结果提示词" value={detail.prompt || "此文件没有关联的提示词记录"} autoSize={{minRows:4,maxRows:8}} />{detail.prompt ? <Button onClick={() => copy(detail.prompt!)}>复制提示词</Button> : null}</> }<Button icon={<Download size={14} />} disabled={saving || !detail.relativePath || detail.missing} onClick={() => void exportItems([detail.id])}>导出文件</Button>{detail.url ? <a href={detail.url} target="_blank" rel="noreferrer">打开原始结果链接</a> : null}</div></div> : null}
        </Modal>
    </main>;
}
