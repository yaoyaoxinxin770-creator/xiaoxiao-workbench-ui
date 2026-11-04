"use client";

import { useState } from "react";
import { Button, Input, Popconfirm } from "antd";

import { useTypetaleStore } from "../stores/use-typetale-store";
import { workbench } from "@/services/api/workbench";

export function ProjectPanel() {
    const projectPath = useTypetaleStore((s) => s.projectPath);
    const state = useTypetaleStore((s) => s.state);
    const store = useTypetaleStore.getState();
    const [source, setSource] = useState(state.sourceText || "");
    const name = projectPath.split(/[\\/]/).filter(Boolean).pop() || "未选择项目";

    return (
        <div>
            <div className="surface mb-4 p-3">
                <b className="block text-sm">{name}</b>
                <span className="break-all text-xs text-muted-foreground">{projectPath || "请从项目管理打开字字动画项目；与即梦项目完全隔离"}</span>
            </div>

            <p className="eyebrow mb-2">整稿导入</p>
            <textarea
                value={source}
                data-testid="typetale-source"
                placeholder="粘贴包含【视频编号】或【分镜】的文本…"
                className="mb-2 h-40 w-full resize-none rounded-lg border border-border bg-transparent p-2.5 text-sm leading-6 text-foreground outline-none transition focus:border-primary"
                onChange={(e) => { setSource(e.target.value); store.setSourceText(e.target.value); }}
            />
            <div className="mb-4 flex gap-1.5">
                <Button size="small" type="primary" onClick={() => store.parseShots(source)}>解析分镜</Button>
                <Button size="small" onClick={() => store.addShotAfter()}>＋新增</Button>
            </div>

            <p className="eyebrow mb-2">章节</p>
            <div className="mb-4 flex flex-col gap-1">
                {state.chapters.map((chapter: any) => (
                    <div key={chapter.id} className="flex items-center gap-1.5">
                        <Input size="small" value={chapter.name} className="w-24" onChange={(e) => store.renameChapter(chapter.id, { name: e.target.value })} />
                        <Input size="small" value={chapter.title} placeholder="章节标题" className="flex-1" onChange={(e) => store.renameChapter(chapter.id, { title: e.target.value })} />
                        <Popconfirm title="删除章节？分镜会回到未分章。" onConfirm={() => store.removeChapter(chapter.id)}>
                            <Button size="small" type="text" danger>删</Button>
                        </Popconfirm>
                    </div>
                ))}
                <Button size="small" onClick={() => store.addChapter(`章节${state.chapters.length + 1}`, "")}>＋新建章节</Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                <Button size="small" type="primary" onClick={() => void store.persist().then(() => store.log("工作区已保存"))}>保存工作区</Button>
                <Button size="small" onClick={() => workbench().typetaleOpenOutputDir?.(projectPath)}>打开输出</Button>
            </div>
        </div>
    );
}
