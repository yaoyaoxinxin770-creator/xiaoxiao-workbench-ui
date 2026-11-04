"use client";

import { useState } from "react";
import { Button, InputNumber, Tooltip } from "antd";

import { BatchGroup as Group } from "@/components/storyboard/batch-group";
import { useTypetaleStore } from "../stores/use-typetale-store";

function Soon({ label }: { label: string }) {
    return (
        <Tooltip title="需要配置推理模型（下一阶段）">
            <Button size="small" disabled className="justify-start">{label}</Button>
        </Tooltip>
    );
}

export function BatchPanel() {
    const state = useTypetaleStore((s) => s.state);
    const running = useTypetaleStore((s) => s.running);
    const store = useTypetaleStore.getState();
    const [from, setFrom] = useState(1);
    const [to, setTo] = useState(state.shots.length || 1);
    const inRange = (shot: any) => {
        const n = Number(shot.id);
        return Number.isFinite(n) && n >= from && n <= to;
    };

    return (
        <div>
            <Group title="故事情节"><Soon label="提炼故事情节" /></Group>
            <Group title="章节情节"><Soon label="划分章节情节" /></Group>
            <Group title="角色信息"><Soon label="提取角色信息" /><Soon label="生成所有角色图片" /></Group>
            <Group title="场景信息"><Soon label="提取场景信息" /><Soon label="生成所有场景图片" /></Group>
            <Group title="章节批量">
                <Soon label="所有章节推理提示词" />
                <Soon label="所有章节改写文案" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    范围 <InputNumber size="small" min={1} value={from} onChange={(v) => setFrom(Number(v) || 1)} className="w-16" /> - <InputNumber size="small" min={1} value={to} onChange={(v) => setTo(Number(v) || 1)} className="w-16" />
                </div>
            </Group>
            <Group title="视频生成">
                <Button size="small" type="primary" disabled={running} onClick={() => void store.runShots(state.shots)}>生成所有分镜</Button>
                <Button size="small" disabled={running} onClick={() => void store.runShots(state.shots.filter((s: any) => s.selected === false))}>生成未选中分镜</Button>
                <Button size="small" disabled={running} onClick={() => void store.runShots(state.shots.filter((s: any) => !(s.outputPath || s.resultUrl || (s.results || []).length)))}>生成无图片分镜</Button>
                <Button size="small" disabled={running} onClick={() => void store.runShots(state.shots.filter(inRange))}>生成指定范围分镜</Button>
            </Group>
            <Group title="提示词推理">
                <Soon label="推理所有提示词" />
                <Soon label="推理指定范围" />
            </Group>
        </div>
    );
}
