"use client";

import { Check } from "lucide-react";

import { StoryboardTopBar } from "@/components/storyboard/storyboard-top-bar";
import { ProjectViewTabs } from "@/components/storyboard/project-view-tabs";
import { useTypetaleStore } from "../stores/use-typetale-store";

const FILTER_OPTIONS = [
    { key: "", label: "全部分镜" },
    { key: "status:ready", label: "待准备" },
    { key: "status:running", label: "执行中" },
    { key: "status:done", label: "已完成" },
    { key: "status:error", label: "失败" },
];

export function ShotTopBar() {
    const projectPath = useTypetaleStore((s) => s.projectPath);
    const state = useTypetaleStore((s) => s.state);
    const running = useTypetaleStore((s) => s.running);
    const paused = useTypetaleStore((s) => s.paused);
    const zoomMode = useTypetaleStore((s) => s.zoomMode);
    const filter = useTypetaleStore((s) => s.filter);
    const store = useTypetaleStore.getState();
    const name = projectPath.split(/[\\/]/).filter(Boolean).pop() || "未选择项目";
    const queued = state.jobs.filter((job: any) => ["queued", "running", "submitted"].includes(job.status)).length;
    const statusFilter = filter.startsWith("status:") ? filter.slice(7) : "";

    return (
        <StoryboardTopBar
            rightSlot={<ProjectViewTabs root={projectPath} workspace="typetale" disabled={running} />}
            filter={statusFilter ? "" : filter}
            onFilterChange={store.setFilter}
            menu={{
                items: FILTER_OPTIONS.map((option) => ({ key: option.key, label: option.label, icon: (option.key === "" ? !statusFilter : statusFilter === option.key.slice(7)) ? <Check className="size-3.5" /> : null })),
                onClick: ({ key }) => store.setFilter(key ? `status:${key}` : ""),
            }}
            queueCount={queued}
            onQueue={() => store.setDrawer("jobs")}
            zoom={zoomMode}
            onZoomChange={store.setZoomMode}
            runningLabel={running ? (paused ? "已暂停" : "批量执行中…") : ""}
            projectName={name}
            projectPath={projectPath}
            projectPathTestId="typetale-project-path"
            onSave={() => void store.persist().then(() => store.log("工作区已保存"))}
            onClose={() => store.closeProject()}
        />
    );
}
