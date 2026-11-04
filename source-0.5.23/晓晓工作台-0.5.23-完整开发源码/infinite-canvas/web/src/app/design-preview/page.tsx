"use client";
// 设计预览入口：/design-preview?scheme=sakura|noir|mist|comic&view=projects|video|assets
// 可选演示参数：agent=1 打开 Agent 侧栏、detail=v07 打开视频详情、asset=a1 打开资产详情、params=1 打开生成参数面板、collapsed=1 收起提示词、rail=0 收起功能栏、sidebar=0 收起目录栏。
// 仅使用 _mock 下的虚构数据，不连接生产 store / API。
import "./_mock/preview-bridge";
import "./design-preview.css";
import { useEffect, useState } from "react";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { PreviewBar, PreviewRail, PreviewTopBar, type PreviewView } from "./_components/shell";
import { ProjectsView } from "./_components/projects-view";
import { StudioView, type StudioDemoState } from "./_components/studio-view";
import { schemeAntTheme, SCHEMES, type SchemeId } from "./_components/schemes";

interface UrlState {
    scheme: SchemeId;
    view: PreviewView;
    demo: StudioDemoState;
    rail: boolean;
    bar: boolean;
}

function readUrl(): UrlState {
    const q = new URLSearchParams(window.location.search);
    const scheme = (SCHEMES.some((s) => s.id === q.get("scheme")) ? q.get("scheme") : "sakura") as SchemeId;
    const view = (["projects", "video", "assets"].includes(q.get("view") || "") ? q.get("view") : "video") as PreviewView;
    return {
        scheme,
        view,
        rail: q.get("rail") !== "0",
        bar: q.get("bar") !== "0",
        demo: { agent: q.get("agent") === "1", detail: q.get("detail") || "", asset: q.get("asset") || "", params: q.get("params") === "1", collapsed: q.get("collapsed") === "1", sidebar: q.get("sidebar") !== "0" },
    };
}

export default function DesignPreviewPage() {
    const [state, setState] = useState<UrlState | null>(null);
    useEffect(() => setState(readUrl()), []);
    useEffect(() => {
        if (!state) return;
        const q = new URLSearchParams(window.location.search);
        q.set("scheme", state.scheme);
        q.set("view", state.view);
        window.history.replaceState(null, "", "?" + q.toString());
    }, [state?.scheme, state?.view]);
    useEffect(() => {
        if (!state) return;
        // 弹层（Popover / Modal）渲染在 body 下，方案变量同时挂在 html 上供其读取；离开预览时移除。
        document.documentElement.dataset.dpScheme = state.scheme;
        return () => {
            delete document.documentElement.dataset.dpScheme;
        };
    }, [state?.scheme]);
    if (!state) return <div className="dp-boot">正在载入设计预览…</div>;
    const set = (patch: Partial<UrlState>) => setState((s) => (s ? { ...s, ...patch } : s));
    return (
        <ConfigProvider locale={zhCN} theme={schemeAntTheme(state.scheme)}>
            <App>
                <div className="dp-root" data-scheme={state.scheme} data-bar={state.bar}>
                    {state.bar && <PreviewBar scheme={state.scheme} onScheme={(scheme) => set({ scheme })} view={state.view} onView={(view) => set({ view })} />}
                    <div className="dp-app">
                        <PreviewTopBar view={state.view} railCollapsed={!state.rail} onToggleRail={() => set({ rail: !state.rail })} onView={(view) => set({ view })} />
                        <div className="dp-body">
                            <PreviewRail view={state.view} onView={(view) => set({ view })} collapsed={!state.rail} />
                            <div className="dp-content">
                                {state.view === "projects" ? (
                                    <ProjectsView onOpen={() => set({ view: "video" })} />
                                ) : (
                                    <StudioView key={state.scheme} section={state.view === "assets" ? "elements" : "results"} onSection={(s) => set({ view: s === "elements" ? "assets" : "video" })} demo={state.demo} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </App>
        </ConfigProvider>
    );
}
