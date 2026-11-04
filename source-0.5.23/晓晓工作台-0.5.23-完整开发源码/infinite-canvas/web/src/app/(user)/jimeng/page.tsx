"use client";

import styles from "./review.module.css";
import { sameProjectPath } from "@/services/api/workbench";
import { Suspense, useMemo, useState } from "react";
import { projectTabId, useWorkspaceTabsStore } from "@/stores/use-workspace-tabs-store";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Button, Empty, Input, Modal, Popconfirm, Popover, Select } from "antd";
import { Activity, Boxes, FileText, Layers, PlugZap, Settings2 } from "lucide-react";

import { ProjectStudio } from "@/app/(user)/projects/library/components/project-studio";
import { StoryboardTopBar } from "@/components/storyboard/storyboard-top-bar";
import { SideRail } from "@/components/storyboard/side-rail";
import { ShotJump } from "@/components/storyboard/shot-jump";
import { BatchGroup } from "@/components/storyboard/batch-group";
import { LegacySlot } from "@/components/storyboard/legacy-slot";
import { SegmentReview } from "./components/segment-review";
import { CanvasTarget } from "./components/canvas-target";
import { ProjectViewTabs } from "@/components/storyboard/project-view-tabs";
import { useJimengEngine } from "./use-jimeng-engine";

function ReplaceForm({ engine }: { engine: ReturnType<typeof useJimengEngine> }) {
    const { message } = App.useApp();
    const [scope, setScope] = useState("source");
    const [find, setFind] = useState("");
    const [replacement, setReplacement] = useState("");
    return (
        <div className="mt-4 border-t border-border/70 pt-3">
            <p className="eyebrow mb-2">批量替换</p>
            <div className="flex flex-col gap-1.5">
                <Select size="small" value={scope} onChange={setScope} options={[{ value: "source", label: "整稿" }, { value: "segment", label: "当前分镜" }]} />
                <Input size="small" placeholder="查找文字" value={find} onChange={(e) => setFind(e.target.value)} />
                <Input size="small" placeholder="替换为" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
                <Button size="small" onClick={() => { const result = engine.replaceText(scope, find, replacement); if (result?.ok === false) message.warning(result.error || "替换失败"); else if (result?.ok) message.success("已替换"); }}>替换</Button>
            </div>
        </div>
    );
}

function ImportVideoGroups({ engine, open, onClose }: { engine: ReturnType<typeof useJimengEngine>; open: boolean; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const [text, setText] = useState("");
    const [mode, setMode] = useState("append");
    const groups: any[] = engine.parseGroups(text);
    const duplicate = groups.some((group, index) => groups.findIndex(other => other.id === group.id) !== index);
    const conflicts = mode === "append" ? groups.filter(group => engine.snap.segments.some((existing: any) => existing.id === group.id)).map(group => group.id) : [];
    const submit = () => {
        const result = engine.importGroups(text, mode);
        if (!result?.ok) return message.error(result?.error || "导入失败");
        message.success("已导入 " + result.count + " 个视频组：" + result.ids.join("、")); setText(""); onClose();
    };
    const confirm = () => mode === "replace" && engine.snap.segments.length ? modal.confirm({ title: "替换当前分集的 " + engine.snap.segments.length + " 个视频组？", content: "当前分集整稿和队列将替换为本次粘贴内容，项目素材与其他分集保留。", okText: "替换本集", cancelText: "取消", onOk: submit }) : submit();
    return <Modal open={open} title="粘贴导入视频组" onCancel={onClose} width={800} footer={<><Button onClick={onClose}>取消</Button><Button type="primary" disabled={engine.busy() || !groups.length || duplicate || Boolean(conflicts.length)} onClick={confirm}>导入 {groups.length} 个视频组</Button></>}>
        <p className="mb-3 text-xs text-muted-foreground">粘贴多个视频组，自动按组首「视频编号」分割。支持 Markdown 代码块，承接编号保留在正文；导入不会自动发送。</p>
        <Input.TextArea aria-label="批量粘贴视频组" value={text} disabled={engine.busy()} onChange={e => setText(e.target.value)} autoSize={{minRows:10,maxRows:16}} placeholder="【视频编号25｜第25组｜第6集 6-1】…

【视频编号26｜第26组｜第6集 6-1】…" />
        <div className="my-3 flex flex-wrap items-center gap-3"><Select aria-label="视频组导入方式" value={mode} onChange={setMode} options={[{value:"append",label:"追加到当前分集"},{value:"replace",label:"替换当前分集"}]} /><b className="text-sm" data-testid="video-group-import-count">识别到 {groups.length} 个视频组</b></div>
        <div className="max-h-32 space-y-1 overflow-auto text-xs text-muted-foreground">{groups.map((group,index)=><p key={index}>视频 {group.id} · {group.prompt.length} 字</p>)}</div>
        {duplicate ? <p className="mt-2 text-sm text-destructive">粘贴内容含重复编号，请先修改。</p> : conflicts.length ? <p className="mt-2 text-sm text-destructive">本集已有编号 {conflicts.join("、")}，请修改编号或选择替换本集。</p> : text && !groups.length ? <p className="mt-2 text-sm text-destructive">没有识别到视频组，请保留每组开头的「视频编号」。</p> : null}
    </Modal>;
}

function JimengProject() {
    const { message } = App.useApp();
    const router = useRouter();
    const params = useSearchParams();
    const loadError = useWorkspaceTabsStore(state=>state.errors[projectTabId("jimeng",params.get("project")||"")]);
    const engine = useJimengEngine();
    const { snap } = engine;
    const [filter, setFilter] = useState("");
    const [reviewFilter, setReviewFilter] = useState("all");
    const [rail, setRail] = useState<string | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [rangeFrom, setRangeFrom] = useState("");
    const [rangeTo, setRangeTo] = useState("");

    const otherSending = useWorkspaceTabsStore(state=>Object.entries(state.busy).some(([id,busy])=>busy&&id.startsWith("jimeng:")&&id!==projectTabId("jimeng",snap.context?.root||"")));
    const status = snap.status || {};
    const running = Boolean(status.running);
    const root = snap.context?.root || "";
    const projectName = useWorkspaceTabsStore.getState().tabs.find(t=>t.id===projectTabId("jimeng",root))?.name || root.split(/[\\/]/).filter(Boolean).pop() || "未选择项目";
    const episodes: any[] = snap.episodes?.episodes || [];
    const activeEpisodeId = snap.episodes?.activeId || "";
    const runningCount = snap.segments.filter((s: any) => s.status === "running").length;
    const segmentIds = snap.segments.map((s: any) => ({ value: String(s.id), label: `视频 ${s.id}` }));

    const visible = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        return snap.segments
            .map((segment: any, index: number) => ({ segment, index }))
            .filter(({ segment }: any) => !needle
                || String(segment.id).toLowerCase().includes(needle)
                || String(segment.name || "").toLowerCase().includes(needle)
                || String(segment.prompt || "").toLowerCase().includes(needle)
                || String(segment.status || "").includes(needle));
    }, [snap.segments, filter]);

    const guardBusy = () => { if (engine.busy()) { message.warning("批次正在执行，请先停止。"); return true; } return false; };


    const jumpToShot = (id: string) => {
        const index = snap.segments.findIndex((s: any) => String(s.id) === String(id));
        if (index >= 0 && !guardBusy()) engine.select(index);
    };
    const activeIndex = snap.selected ?? (snap.segments.length ? 0 : null);
    const reviews = snap.segments.map((_: any, index: number) => engine.reviewMaterial(index));
    const queue = visible.filter(({ index }: any) => reviewFilter === "all" || (reviewFilter === "issues" ? reviews[index]?.issues?.length : !reviews[index]?.reviewed));
    const runChecked = (indices: number[], action: () => any) => {
        if(otherSending){message.warning("另一个即梦项目正在发送，请等待或切回该项目停止后再执行");return;}
        const pending = indices.find(index => !reviews[index]?.reviewed);
        if (pending !== undefined) { engine.select(pending); message.warning("请先审阅视频 " + snap.segments[pending].id + "。"); return; }
        action();
    };
    const nextGroup = () => {
        const next = visible.find(({ index }: any) => index > (activeIndex ?? -1)) || visible.find(({ index }: any) => index !== activeIndex && !reviews[index]?.reviewed);
        if (next) engine.select(next.index); else message.info("本页视频组已审阅到最后一组。");
    };

    if (!snap.ready || (params.get("project") && !sameProjectPath(root, params.get("project")!))) {
        return (
            <main className="h-full overflow-auto">
                <div className="page-reveal mx-auto max-w-3xl p-10"><div className="surface p-10 text-center text-muted-foreground">{loadError?<><p role="alert">项目加载失败：{loadError}</p><Button className="mt-3" onClick={()=>window.dispatchEvent(new Event("xiaoxiao:retry-project"))}>重新加载</Button><Button type="text" onClick={()=>router.push("/projects")}>返回项目管理</Button></>:"正在加载即梦项目…"}</div></div>
            </main>
        );
    }
    if (!root) {
        return (
            <main className="h-full overflow-auto">
                <div className="page-reveal mx-auto max-w-3xl p-10">
                    <div className="surface p-10"><Empty description="请从项目管理打开即梦项目"><Button type="primary" onClick={() => router.push("/projects")}>打开项目管理</Button></Empty></div>
                </div>
            </main>
        );
    }

    const elementsView = params.get("view") === "elements";
    return (
        <main key={root} className={`${styles.workspace} flex h-full min-h-0 flex-col overflow-hidden`}>
            <StoryboardTopBar
                rightSlot={<><ProjectViewTabs root={root} workspace="jimeng" active={elementsView ? "elements" : "shots"} disabled={engine.busy()} /><Popover trigger="click" placement="bottomRight" content={<div className="max-w-[90vw] w-[700px]"><LegacySlot selector=".top-actions" className="flex flex-wrap gap-2" /><CanvasTarget busy={engine.busy()||otherSending} /></div>}><Button size="small" icon={<PlugZap className="size-3.5" />}>即梦连接与目标</Button></Popover><Button size="small" type="primary" disabled={engine.busy() || !snap.segments.length} onClick={() => runChecked(snap.segments.map((s: any, i: number) => s.status !== "done" ? i : -1).filter((i: number) => i >= 0), engine.runAll)}>全部执行</Button></>}
                filter={filter}
                onFilterChange={setFilter}
                queueCount={runningCount}
                onQueue={() => setRail("progress")}
                runningLabel={running ? (status.paused ? "已暂停" : status.text || "执行中…") : ""}
                projectName={projectName}
                projectPath={root}
                onSave={() => engine.save()}
                onClose={() => { if (guardBusy()) return; router.push("/projects"); }}
            />
            <div className={"flex min-h-0 flex-1" + (elementsView ? " hidden" : "")}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
                    <aside className="relative flex min-h-0 w-full shrink-0 flex-col border-r border-border bg-card md:w-56" aria-label="视频组列表">
                        <div className="space-y-2 border-b border-border p-3">
                            <div className="flex items-center justify-between"><b className="text-sm">视频组</b><span className="text-xs text-muted-foreground">{snap.segments.length} 组</span></div>
                            <Select className="w-full" size="small" aria-label="审阅筛选" value={reviewFilter} onChange={setReviewFilter} options={[{value:"all",label:"全部视频组"},{value:"pending",label:"尚未审阅"},{value:"issues",label:"素材有缺项"}]} />
                            <Select className="w-full" size="small" value={activeEpisodeId || undefined} disabled={engine.busy()} onChange={id => engine.switchEpisode(id)} options={episodes.map((ep: any) => ({value:ep.id,label:ep.name}))} />
                            <div className="flex flex-wrap gap-1">
                                <Button size="small" type="text" disabled={engine.busy()} onClick={() => engine.addEpisode()}>＋分集</Button>
                                <Popover trigger="click" content={<Input size="small" placeholder="分集名称" onPressEnter={e => { const value = (e.target as HTMLInputElement).value.trim(); if (value) engine.renameEpisode(value); }} />}><Button size="small" type="text" disabled={engine.busy()}>重命名</Button></Popover>
                                {episodes.length > 1 ? <Popconfirm title="删除当前分集及其整稿？" onConfirm={() => engine.deleteEpisode()}><Button size="small" type="text" danger disabled={engine.busy()}>删除</Button></Popconfirm> : null}
                                <Button size="small" type="text" disabled={engine.busy()} onClick={() => engine.addSegment()}>＋视频组</Button>
                            </div>
                        </div>
                        <div className="flex max-h-48 flex-1 flex-col gap-2 overflow-auto p-2 pb-16 md:max-h-none">
                            {queue.map(({ segment, index }: any) => {
                                const review = reviews[index];
                                const images = review?.localFiles.filter((file: any) => file.type.startsWith("image/")).length || 0;
                                const audio = review?.localFiles.filter((file: any) => file.type.startsWith("audio/")).length || 0;
                                return <button key={engine.segmentKey(segment,index)} type="button" data-shot-row={segment.id} aria-current={activeIndex === index ? "true" : undefined} disabled={engine.busy()} onClick={() => engine.select(index)} className={"rounded-xl border p-3 text-left transition-colors " + (activeIndex === index ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary")}>
                                    <div className="flex justify-between gap-2 text-sm font-medium"><span>视频 {segment.id}</span><span className="text-xs text-muted-foreground">{segment.status === "done" ? "已发送" : segment.status === "running" ? "发送中" : segment.status === "error" ? "发送失败" : review?.reviewed ? "已审阅" : "待审阅"}</span></div>
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{segment.name || segment.prompt}</p>
                                    <p className="mt-2 text-xs text-muted-foreground">图片 {images} · 音频 {audio}{segment.selected ? " · 已加入批次" : ""}</p>
                                    {review?.issues.length ? <p className="mt-1 text-xs text-destructive">{review.issues.length} 项需要处理</p> : null}
                                </button>;
                            })}
                            {!queue.length ? <p className="p-3 text-xs text-muted-foreground">没有符合条件的视频组</p> : null}
                        </div>
                        <div className="absolute bottom-3 left-3 z-30"><ShotJump shots={visible.map(({ segment }: any) => ({ id: segment.id, status: segment.status }))} activeId={activeIndex === null ? null : snap.segments[activeIndex]?.id} onJump={jumpToShot} /></div>
                    </aside>
                    {activeIndex !== null ? <SegmentReview key={engine.segmentKey(snap.segments[activeIndex],activeIndex)} index={activeIndex} engine={engine} onNext={nextGroup} /> : <div className="flex flex-1 items-center justify-center p-8"><Empty description="从右侧「整稿导入」粘贴内容，自动分割多个视频组。" /></div>}
                </div>
                <SideRail overlay
                    ariaLabel="即梦通道"
                    open={rail}
                    onChange={setRail}
                    sections={[
                        {
                            key: "batch", label: "批量操作", icon: Boxes,
                            content: (
                                <div>
                                    <BatchGroup title="批量执行">
                                        <Button size="small" type="primary" disabled={engine.busy()} onClick={() => runChecked(snap.segments.map((s: any, i: number) => s.status !== "done" ? i : -1).filter((i: number) => i >= 0), engine.runAll)}>全部执行</Button>
                                        <Button size="small" disabled={engine.busy()} onClick={() => runChecked(snap.segments.map((s: any, i: number) => s.selected ? i : -1).filter((i: number) => i >= 0), engine.runSelected)}>执行所选</Button>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            范围 <Select size="small" className="flex-1" value={rangeFrom || undefined} onChange={setRangeFrom} options={segmentIds} placeholder="起始" /> - <Select size="small" className="flex-1" value={rangeTo || undefined} onChange={setRangeTo} options={segmentIds} placeholder="结束" />
                                            <Button size="small" disabled={engine.busy() || !rangeFrom || !rangeTo} onClick={() => { const from = snap.segments.findIndex((s: any) => String(s.id) === rangeFrom), to = snap.segments.findIndex((s: any) => String(s.id) === rangeTo); runChecked(snap.segments.map((_: any, i: number) => i).filter((i: number) => i >= Math.min(from,to) && i <= Math.max(from,to)), () => engine.runRange(rangeFrom,rangeTo)); }}>执行</Button>
                                        </div>
                                    </BatchGroup>
                                    <BatchGroup title="批次控制">
                                        <div className="flex gap-1.5">
                                            <Button size="small" disabled={!running || status.paused} onClick={() => engine.pause()}>暂停</Button>
                                            <Button size="small" disabled={!running || !status.paused} onClick={() => engine.resume()}>继续</Button>
                                            <Button size="small" danger disabled={!running} onClick={() => engine.stop()}>停止</Button>
                                        </div>
                                        <Popconfirm title="重置分镜队列？全部组恢复为待准备。" onConfirm={() => engine.reset()}>
                                            <Button size="small" disabled={engine.busy() || !snap.segments.length}>重置队列</Button>
                                        </Popconfirm>
                                    </BatchGroup>
                                </div>
                            ),
                        },
                        {
                            key: "connection", label: "即梦连接", icon: PlugZap,
                            content: (
                                <div className="text-xs leading-6 text-muted-foreground">
                                    <p>即梦画布连接状态和控制（刷新状态、检查即梦浏览器、直连设置）显示在页面顶部的「即梦连接」条中。</p>
                                    <p className="mt-2">请在 Chrome 中打开即梦画布并启用最新版扩展；检查通过后即可执行分镜。</p>
                                </div>
                            ),
                        },
                        {
                            key: "source", label: "整稿导入", icon: FileText,
                            content: (
                                <div className="flex flex-col gap-2">
                                    <Button disabled={engine.busy()} onClick={() => setImportOpen(true)}>粘贴导入视频组</Button>
                                    <LegacySlot selector=".editor-panel .prompt-toolbar" />
                                    <LegacySlot selector="#sourceText" />
                                    <LegacySlot selector=".editor-actions" />
                                </div>
                            ),
                        },
                        {
                            key: "progress", label: "实时进度", icon: Activity,
                            content: (
                                <div>
                                    <LegacySlot selector=".activity-panel" />
                                    <p className="eyebrow mt-4 mb-2">执行记录</p>
                                    <div className="flex max-h-64 flex-col gap-1 overflow-auto">
                                        {(snap.logs || []).map((entry: any, i: number) => (
                                            <div key={i} className={`text-xs leading-5 ${entry.type === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                                                <b className="mr-1 font-mono">{entry.time ? new Date(entry.time).toLocaleTimeString() : ""}</b>{entry.message}
                                            </div>
                                        ))}
                                        {!snap.logs?.length ? <span className="text-xs text-muted-foreground">暂无记录</span> : null}
                                    </div>
                                </div>
                            ),
                        },
                        { key: "advanced", label: "高级设置", icon: Settings2, content: <div><LegacySlot selector=".template-card" /><ReplaceForm engine={engine} /></div> },
                        {
                            key: "project", label: "项目", icon: Layers,
                            content: (
                                <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                                    <p className="break-all">{root || "未选择项目"}</p>
                                    <Button size="small" onClick={() => { if (!guardBusy()) router.push("/projects"); }}>打开项目管理</Button>
                                </div>
                            ),
                        },
                    ]}
                />
            </div>
            {elementsView ? <ProjectStudio projectRoot={root} embedded bare /> : null}
            <ImportVideoGroups engine={engine} open={importOpen} onClose={() => setImportOpen(false)} />
        </main>
    );
}

export default function JimengPage() {
    return (
        <Suspense fallback={null}>
            <JimengProject />
        </Suspense>
    );
}
