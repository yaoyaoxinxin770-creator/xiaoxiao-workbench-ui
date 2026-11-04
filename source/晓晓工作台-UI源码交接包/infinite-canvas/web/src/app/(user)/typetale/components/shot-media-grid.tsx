"use client";

import { useEffect, useState } from "react";
import { Tooltip } from "antd";
import { Check, ExternalLink, Eye, FolderOpen } from "lucide-react";

import { MediaGrid, type MediaItem } from "@/components/storyboard/media-grid";
import { shotResults, useTypetaleStore } from "../stores/use-typetale-store";
import { workbench } from "@/services/api/workbench";

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;

export function ShotMediaGrid({ shot }: { shot: any }) {
    const projectPath = useTypetaleStore((s) => s.projectPath);
    const store = useTypetaleStore.getState();
    const results = shotResults(shot).slice(0, 4);
    const [thumbs, setThumbs] = useState<Record<string, string>>({});

    useEffect(() => {
        let alive = true;
        for (const result of results) {
            const path = result?.path || "";
            if (!path || !IMAGE_EXT.test(path) || thumbs[path]) continue;
            workbench().assetThumb?.(projectPath, path)
                .then((res: any) => { if (alive && res?.preview) setThumbs((prev) => (prev[path] ? prev : { ...prev, [path]: res.preview })); })
                .catch(() => {});
        }
        return () => { alive = false; };
    }, [projectPath, results.map((r: any) => r?.path).join("|")]);

    const items: (MediaItem | null)[] = results.map((result: any, index: number) => ({
        key: index,
        src: thumbs[result?.path || ""] || "",
        label: (result?.path || result?.url || "").split(/[\\/]/).pop() || "结果",
    }));

    const open = (result: any) => {
        if (result?.path) workbench().typetaleOpenPath?.(result.path);
        else if (result?.url) window.open(result.url, "_blank");
    };

    return (
        <MediaGrid
            items={items}
            selectedIndex={shot.selectedResult >= 0 ? shot.selectedResult : 0}
            onSelect={(index) => store.updateShot(shot.id, { selectedResult: index })}
            emptyLabel="空"
            actions={(item, index) => {
                const result = results[index];
                return (
                    <>
                        <Tooltip title="查看原图"><button type="button" className="text-primary-foreground" onClick={(e) => { e.stopPropagation(); open(result); }}><Eye className="size-3.5" /></button></Tooltip>
                        <Tooltip title="打开目录"><button type="button" className="text-primary-foreground" onClick={(e) => { e.stopPropagation(); workbench().typetaleOpenOutputDir?.(projectPath); }}><FolderOpen className="size-3.5" /></button></Tooltip>
                        <Tooltip title="设为选中"><button type="button" className="text-primary-foreground" onClick={(e) => { e.stopPropagation(); store.updateShot(shot.id, { selectedResult: index }); }}><Check className="size-3.5" /></button></Tooltip>
                        {result?.url ? <Tooltip title="打开链接"><button type="button" className="text-primary-foreground" onClick={(e) => { e.stopPropagation(); window.open(result.url, "_blank"); }}><ExternalLink className="size-3.5" /></button></Tooltip> : null}
                    </>
                );
            }}
        />
    );
}
