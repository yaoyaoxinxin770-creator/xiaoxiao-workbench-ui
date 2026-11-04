"use client";

import { Button, Empty, Tag } from "antd";

import { STATUS_LABEL, useTypetaleStore } from "../stores/use-typetale-store";

const STATUS_COLOR: Record<string, string> = { ready: "default", running: "processing", submitted: "cyan", done: "success", error: "error", queued: "warning" };

export function JobsPanel() {
    const state = useTypetaleStore((s) => s.state);
    const running = useTypetaleStore((s) => s.running);
    const paused = useTypetaleStore((s) => s.paused);
    const selectedJobId = useTypetaleStore((s) => s.selectedJobId);
    const store = useTypetaleStore.getState();

    return (
        <div>
            <div className="surface mb-3 p-3">
                <b className="block text-sm">{running ? (paused ? "批量执行已暂停" : "批量执行中") : "等待任务"}</b>
                <span className="text-xs text-muted-foreground">配置 Provider 后可提交当前分镜或批量执行。</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
                <Button size="small" disabled={!running || paused} onClick={store.pauseRun}>暂停</Button>
                <Button size="small" disabled={!paused} onClick={store.resumeRun}>继续</Button>
                <Button size="small" danger disabled={!running} onClick={store.stopRun}>停止</Button>
                <Button size="small" onClick={() => void store.refreshJob()}>查询</Button>
                <Button size="small" onClick={() => void store.downloadResult()}>下载结果</Button>
            </div>
            <div className="flex flex-col gap-1">
                {state.jobs.slice(0, 30).map((job: any) => {
                    const shot = state.shots.find((item: any) => item.id === job.shotId);
                    const provider = state.providers.find((item: any) => item.id === job.providerId);
                    return (
                        <button
                            key={job.id}
                            type="button"
                            className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${job.id === selectedJobId ? "border-primary/50 bg-accent" : "border-border hover:border-primary/40"}`}
                            onClick={() => store.selectJob(job.id)}
                        >
                            <b className="flex items-center gap-1.5">
                                {shot?.title || job.shotId || "任务"}
                                <Tag color={STATUS_COLOR[job.status] || "default"} className="!m-0">{STATUS_LABEL[job.status] || job.status}</Tag>
                            </b>
                            <small className="block truncate text-muted-foreground">{provider?.name || "未配置"} · {job.message || job.remoteId || job.resultUrl || ""}</small>
                        </button>
                    );
                })}
                {!state.jobs.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" /> : null}
            </div>
            <p className="eyebrow mb-1.5 mt-4">运行日志</p>
            <div className="flex max-h-64 flex-col gap-0.5 overflow-auto rounded-lg border border-border p-2 text-[11px] leading-5">
                {state.logs.slice(0, 60).map((item: any, index: number) => (
                    <span key={index} className={item.type === "error" ? "text-destructive" : "text-muted-foreground"}>{new Date(item.time).toLocaleTimeString()}　{item.message}</span>
                ))}
            </div>
        </div>
    );
}
