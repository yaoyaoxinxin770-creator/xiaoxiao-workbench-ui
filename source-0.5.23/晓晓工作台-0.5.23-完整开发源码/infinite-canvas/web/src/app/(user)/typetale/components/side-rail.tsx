"use client";

import { Boxes, Clapperboard, Image as ImageIcon, ListChecks, Mountain, Puzzle, Settings, TerminalSquare } from "lucide-react";

import { SideRail as SharedSideRail } from "@/components/storyboard/side-rail";
import { useTypetaleStore, type TypetaleDrawer } from "../stores/use-typetale-store";
import { BatchPanel } from "./batch-panel";
import { ProviderPanel } from "./provider-panel";
import { AssetsPanel } from "./assets-panel";
import { PluginsPanel } from "./plugins-panel";
import { CliPanel } from "./cli-panel";
import { JobsPanel } from "./jobs-panel";
import { ProjectPanel } from "./project-panel";

export function SideRail() {
    const drawer = useTypetaleStore((s) => s.drawer);
    const setDrawer = useTypetaleStore((s) => s.setDrawer);

    return (
        <SharedSideRail
            ariaLabel="字字动画通道"
            open={drawer}
            onChange={(key) => setDrawer(key as TypetaleDrawer)}
            sections={[
                { key: "batch", label: "批量操作", icon: Boxes, content: <BatchPanel /> },
                { key: "provider", label: "模型通道", icon: Clapperboard, content: <ProviderPanel /> },
                { key: "characters", label: "角色素材", icon: ImageIcon, content: <AssetsPanel kind="characters" /> },
                { key: "scenes", label: "场景素材", icon: Mountain, content: <AssetsPanel kind="scenes" /> },
                { key: "plugins", label: "插件", icon: Puzzle, content: <PluginsPanel /> },
                { key: "cli", label: "CLI", title: "网站 CLI", icon: TerminalSquare, content: <CliPanel /> },
                { key: "jobs", label: "任务队列", icon: ListChecks, content: <JobsPanel /> },
                { key: "project", label: "项目设置", icon: Settings, content: <ProjectPanel /> },
            ]}
        />
    );
}
