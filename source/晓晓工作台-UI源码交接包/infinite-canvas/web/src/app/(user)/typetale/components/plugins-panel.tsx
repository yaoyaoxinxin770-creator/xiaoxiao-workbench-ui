"use client";

import { useEffect, useState } from "react";
import { Button, Empty, Input } from "antd";

import { useTypetaleStore } from "../stores/use-typetale-store";

const CATEGORY_LABEL: Record<string, string> = { image_plugins: "图片", video_plugins: "视频", post_process_plugins: "后处理", tool_plugins: "工具" };

export function PluginsPanel() {
    const store = useTypetaleStore.getState();
    const provider = useTypetaleStore((s) => s.state.providers.find((p: any) => p.id === s.state.activeProviderId) || s.state.providers[0]);
    const [plugins, setPlugins] = useState<any[]>([]);
    const [detail, setDetail] = useState<any>(null);
    const [detailPath, setDetailPath] = useState("");
    const [params, setParams] = useState<Record<string, any>>({});
    const pluginPath = provider?.pluginPath || "";

    const scan = async () => {
        const result = await store.scanPlugins(pluginPath || undefined);
        if (result) {
            setPlugins(result.plugins || []);
            if (result.root) store.saveProvider({ pluginPath: result.root });
        }
    };
    const inspect = async (target: string) => {
        setDetailPath(target);
        setDetail({ loading: true });
        const result = await store.inspectPlugin(target);
        setDetail(result || { ok: false, error: "无法读取插件" });
        setParams(result?.params || {});
    };
    useEffect(() => { if (pluginPath) void inspect(pluginPath); }, []);

    const info = detail?.info || {};
    const entries = Object.entries(params);

    return (
        <div>
            <label className="mb-3 block">
                <span className="mb-1 block text-xs text-muted-foreground">插件目录</span>
                <Input size="small" value={pluginPath} data-testid="typetale-provider-plugin-path" placeholder="选择 plugins 目录或单个插件目录" onChange={(e) => store.saveProvider({ pluginPath: e.target.value })} />
            </label>
            <Button size="small" type="primary" onClick={() => void scan()}>扫描插件</Button>
            <div className="mt-3 flex flex-col gap-1">
                {plugins.map((plugin: any) => {
                    const blocked = plugin.bridgeStub || plugin.compiledOnly;
                    const tags = [
                        plugin.category ? CATEGORY_LABEL[plugin.category] || plugin.category : "",
                        plugin.hasUi ? "自带 UI" : "",
                        plugin.bridgeStub ? "桥接桩·不可用" : "",
                        plugin.compiledOnly ? "仅 .pyd·不可用" : "",
                    ].filter(Boolean).join(" · ");
                    return (
                        <button
                            key={plugin.path}
                            type="button"
                            disabled={blocked}
                            className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${detailPath === plugin.path ? "border-primary/50 bg-accent" : "border-border hover:border-primary/40"} ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                            onClick={() => {
                                store.saveProvider({ pluginPath: plugin.path, pluginName: plugin.name, type: "typetale-plugin" });
                                void inspect(plugin.path);
                            }}
                        >
                            <b className="block">{plugin.name}</b>
                            <small className="text-muted-foreground">{tags || plugin.path}</small>
                        </button>
                    );
                })}
            </div>
            <div data-testid="typetale-plugin-detail" className="mt-3 rounded-lg border border-border p-3 text-xs">
                {!detail ? <span className="text-muted-foreground">选择插件后显示详情</span>
                    : detail.loading ? <span className="text-muted-foreground">正在读取插件信息…</span>
                    : detail.ok === false ? <span className="text-destructive">插件加载失败：{detail.error}</span>
                    : (
                        <>
                            <b className="block text-sm">{info.name || detailPath.split(/[\\/]/).pop()}</b>
                            <small className="block text-muted-foreground">{info.description || "插件未提供 get_info()"}{info.version ? ` · 版本 ${info.version}` : ""}</small>
                            {String(info.model_family_ui || "").toLowerCase() === "self" ? <small className="block text-muted-foreground">该插件自带模型族界面，宿主不再画族下拉</small> : null}
                            {entries.length ? (
                                <div className="mt-2 flex flex-col gap-1.5">
                                    {entries.map(([key, value]) => {
                                        const secret = /(api_?key|token|secret|password|cookie)/i.test(key);
                                        return (
                                            <label key={key} className="block">
                                                <span className="mb-0.5 block text-muted-foreground">{key}</span>
                                                <Input size="small" type={secret ? "password" : typeof value === "number" ? "number" : "text"} data-param={key} value={typeof value === "object" ? JSON.stringify(value) : value ?? ""} onChange={(e) => setParams({ ...params, [key]: typeof value === "number" ? Number(e.target.value) || 0 : e.target.value })} />
                                            </label>
                                        );
                                    })}
                                    <Button size="small" type="primary" onClick={() => void store.savePluginParams(detailPath, params)}>保存插件参数</Button>
                                </div>
                            ) : <p className="mt-2 text-muted-foreground">插件没有 get_params()，没有可配置参数。</p>}
                            {detail.configPath ? <p className="mt-2 break-all text-muted-foreground">配置文件：{detail.configPath}</p> : null}
                        </>
                    )}
            </div>
            {!plugins.length && !detail ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="扫描后在此选择插件" /> : null}
        </div>
    );
}
