"use client";

import { Button, Empty, Select } from "antd";

import { KIND_LABEL, useTypetaleStore } from "../stores/use-typetale-store";

export function AssetsPanel({ kind: initialKind }: { kind: string }) {
    const state = useTypetaleStore((s) => s.state);
    const selectedShotId = useTypetaleStore((s) => s.selectedShotId);
    const store = useTypetaleStore.getState();
    const kind = ["characters", "scenes"].includes(initialKind) ? initialKind : "characters";
    const shot = state.shots.find((item: any) => item.id === selectedShotId) || state.shots.find((item: any) => item.id === state.activeShotId) || state.shots[0] || null;
    const assets = state.assets.filter((asset: any) => asset.kind === kind);
    const bound = new Set(shot?.bindings?.assetIds || []);

    const toggle = (asset: any) => {
        if (!shot) return;
        const ids = new Set(shot.bindings?.assetIds || []);
        bound.has(asset.id) ? ids.delete(asset.id) : ids.add(asset.id);
        store.updateShot(shot.id, { bindings: { assetIds: [...ids] } });
    };
    const insertMention = (asset: any) => {
        if (!shot) return;
        const token = `@${asset.name}`;
        const prompt = `${shot.prompt || ""}${shot.prompt && !shot.prompt.endsWith(" ") ? "" : ""}${token}`;
        const ids = new Set(shot.bindings?.assetIds || []);
        ids.add(asset.id);
        store.updateShot(shot.id, { prompt, bindings: { assetIds: [...ids] } });
    };

    return (
        <div>
            <div className="mb-3 flex gap-1.5">
                <Select
                    size="small"
                    className="flex-1"
                    value={kind}
                    options={Object.entries(KIND_LABEL).filter(([key]) => key !== "audio").map(([value, label]) => ({ value, label }))}
                    onChange={(v) => store.setDrawer(v === "scenes" ? "scenes" : "characters")}
                />
            </div>
            <div className="mb-3 flex gap-1.5">
                <Button size="small" type="primary" onClick={() => void store.importAssets()}>导入素材</Button>
                <Button size="small" onClick={() => void store.refreshAssets()}>刷新项目素材</Button>
            </div>
            {!assets.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`当前项目暂无${KIND_LABEL[kind] || "素材"}`} /> : null}
            <div className="flex flex-col gap-1">
                {assets.map((asset: any) => (
                    <div key={asset.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${bound.has(asset.id) ? "border-primary/50 bg-accent" : "border-border"}`}>
                        <input type="checkbox" className="size-3.5 accent-primary" checked={bound.has(asset.id)} disabled={!shot} onChange={() => toggle(asset)} aria-label={`绑定 ${asset.name}`} />
                        <span className="min-w-0 flex-1">
                            <b className="block truncate text-xs font-medium">{asset.name}</b>
                            <small className="block truncate text-[10px] text-muted-foreground">{KIND_LABEL[asset.kind] || asset.kind} · {asset.path}</small>
                        </span>
                        <Button size="small" type="text" disabled={!shot} onClick={() => insertMention(asset)}>@引用</Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
