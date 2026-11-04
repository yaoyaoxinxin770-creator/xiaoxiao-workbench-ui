"use client";

import type { ReactNode } from "react";
import { Button, Dropdown, Input, Switch, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { ChevronDown, Save, X } from "lucide-react";

export function StoryboardTopBar({ filter, onFilterChange, menu, queueCount, onQueue, zoom, onZoomChange, runningLabel, projectName, projectPath, projectPathTestId, rightSlot, onSave, onClose }: {
    filter: string;
    onFilterChange: (value: string) => void;
    menu?: MenuProps;
    queueCount?: number;
    onQueue?: () => void;
    zoom?: boolean;
    onZoomChange?: (value: boolean) => void;
    runningLabel?: string;
    projectName: string;
    projectPath: string;
    projectPathTestId?: string;
    rightSlot?: ReactNode;
    onSave?: () => void;
    onClose?: () => void;
}) {
    return (
        <header className="glass flex h-14 shrink-0 items-center gap-2 border-b border-border/70 px-4">
            <Input
                allowClear
                className="!w-44 shrink-0"
                placeholder="筛选分镜"
                value={filter}
                onChange={(event) => onFilterChange(event.target.value)}
            />
            {menu ? (
                <Dropdown menu={menu} trigger={["click"]}>
                    <Button size="small"><span className="whitespace-nowrap">筛选菜单</span> <ChevronDown className="size-3.5" /></Button>
                </Dropdown>
            ) : null}
            <Tooltip title="任务队列">
                <Button size="small" onClick={onQueue}><span className="whitespace-nowrap">任务队列{queueCount ? ` · ${queueCount}` : ""}</span></Button>
            </Tooltip>
            {onZoomChange ? (
                <Tooltip title="放大模式">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                        <Switch size="small" checked={zoom} onChange={onZoomChange} /> 放大
                    </span>
                </Tooltip>
            ) : null}
            {runningLabel ? <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{runningLabel}</span> : null}
            {rightSlot}
            <div className="ml-auto flex items-center gap-2">
                <span className="max-w-56 truncate text-sm font-medium">{projectName}</span>
                {projectPathTestId ? <span data-testid={projectPathTestId} className="hidden">{projectPath}</span> : null}
                {projectPath ? <Tooltip title={projectPath}><span className="max-w-72 truncate text-xs text-muted-foreground">{projectPath}</span></Tooltip> : null}
                {onSave ? <Button size="small" icon={<Save className="size-3.5" />} onClick={onSave}>保存</Button> : null}
                {onClose ? <Button size="small" icon={<X className="size-3.5" />} onClick={onClose}>关闭作品</Button> : null}
            </div>
        </header>
    );
}
