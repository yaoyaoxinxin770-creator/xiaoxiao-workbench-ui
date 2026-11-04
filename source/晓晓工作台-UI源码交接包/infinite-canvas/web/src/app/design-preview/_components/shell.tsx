"use client";
// 预览外壳：模拟 AppTopNav（顶部页签栏）与 AppNavigation（最左功能栏）的视觉，不连接真实 store。
import { App, Dropdown, Popover, Tooltip } from "antd";
import { FileText, FolderOpen, ImagePlus, Images, LoaderCircle, Maximize2, Minus, Palette, PanelLeftClose, PanelLeftOpen, Plus, RotateCw, Send, Square, Video, X } from "lucide-react";
import { runningTasks } from "../_mock/mock-data";
import { SCHEMES, type SchemeId } from "./schemes";

export type PreviewView = "projects" | "video" | "assets";

const RAIL = [
    { slug: "canvas", label: "画布", title: "我的画布", icon: Maximize2 },
    { slug: "projects", label: "项目", title: "项目管理", icon: FolderOpen },
    { slug: "video", label: "视频", title: "视频创作台", icon: Video },
    { slug: "image", label: "生图", title: "生图工作台", icon: ImagePlus },
    { slug: "jimeng", label: "自动发送", title: "即梦自动发送", icon: Send, divider: true },
    { slug: "prompts", label: "模板库", title: "提示词模板库", icon: FileText },
    { slug: "assets", label: "公共库", title: "跨项目公共素材库", icon: Images },
] as const;

export function PreviewBar({ scheme, onScheme, view, onView }: { scheme: SchemeId; onScheme: (id: SchemeId) => void; view: PreviewView; onView: (v: PreviewView) => void }) {
    return (
        <div className="dp-preview-bar" role="region" aria-label="设计预览控制">
            <span className="dp-preview-badge">设计预览 · 全部为虚构模拟数据</span>
            <div className="dp-preview-group" role="radiogroup" aria-label="设计方案">
                {SCHEMES.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={scheme === s.id} onClick={() => onScheme(s.id)}>
                        <i style={{ background: s.swatches[4] }} />
                        方案{s.code} · {s.name}
                    </button>
                ))}
            </div>
            <div className="dp-preview-group" role="radiogroup" aria-label="预览页面">
                {(
                    [
                        ["projects", "项目管理"],
                        ["video", "视频创作"],
                        ["assets", "项目资产"],
                    ] as const
                ).map(([key, label]) => (
                    <button key={key} type="button" role="radio" aria-checked={view === key} onClick={() => onView(key)}>
                        {label}
                    </button>
                ))}
            </div>
            <a className="dp-preview-link" href="/design-preview/overview">
                方案总览
            </a>
        </div>
    );
}

export function PreviewRail({ view, onView, collapsed }: { view: PreviewView; onView: (v: PreviewView) => void; collapsed: boolean }) {
    const { message } = App.useApp();
    if (collapsed) return null;
    return (
        <aside className="dp-rail workbench-rail-preview" aria-label="工作台功能导航">
            <button type="button" className="dp-brand" title="晓晓的AI工作台" onClick={() => onView("projects")}>
                晓
            </button>
            <nav aria-label="工作台导航">
                {RAIL.map((item) => {
                    const Icon = item.icon;
                    const current = (item.slug === "projects" && view === "projects") || (item.slug === "video" && view !== "projects");
                    return (
                        <button
                            key={item.slug}
                            type="button"
                            title={item.title}
                            aria-label={item.title}
                            aria-current={current ? "page" : undefined}
                            data-rail-divider={"divider" in item ? "true" : undefined}
                            onClick={() => {
                                if (item.slug === "projects") onView("projects");
                                else if (item.slug === "video") onView("video");
                                else message.info(`预览只演示项目与视频页；「${item.title}」入口保留不变`);
                            }}
                        >
                            <Icon size={19} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
            <span className="dp-edition" title="晓晓工作台 · 个人版">
                II
            </span>
        </aside>
    );
}

export function PreviewTopBar({ view, railCollapsed, onToggleRail, onView }: { view: PreviewView; railCollapsed: boolean; onToggleRail: () => void; onView: (v: PreviewView) => void }) {
    const { message } = App.useApp();
    const tabs = [
        { id: "t1", kind: "video", name: "雾港来信 · 第一季", busy: true },
        { id: "t2", kind: "video", name: "猫咖不打烊", busy: false },
        { id: "t3", kind: "jimeng", name: "雾港来信 · 即梦批量", busy: false, error: "上次批量有 2 条失败" },
    ];
    const active = view === "projects" ? "" : "t1";
    const generating = 2;
    return (
        <header className="dp-topbar">
            <button type="button" className="dp-icon-btn" aria-label={railCollapsed ? "展开功能栏" : "收起功能栏"} title={railCollapsed ? "展开功能栏" : "收起功能栏"} aria-expanded={!railCollapsed} onClick={onToggleRail}>
                {railCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <div role="tablist" aria-label="已打开的项目" className="dp-tabs">
                {tabs.map((tab) => (
                    <div key={tab.id} className="dp-tab" data-active={tab.id === active}>
                        <button type="button" role="tab" aria-selected={tab.id === active} onClick={() => onView("video")}>
                            {tab.kind === "video" ? <Video size={14} /> : <Send size={14} />}
                            <span className="dp-tab-name">{tab.name}</span>
                            {tab.busy && <LoaderCircle className="dp-spin" size={12} />}
                            {tab.error && (
                                <span className="dp-tab-error" title={tab.error}>
                                    !
                                </span>
                            )}
                        </button>
                        <Tooltip title={tab.busy ? "任务仍在运行，请先停止再关闭页签" : "关闭页签，保留项目"}>
                            <button type="button" className="dp-tab-close" aria-label={"关闭页签 " + tab.name} onClick={() => message.info(tab.busy ? "任务仍在运行，请先停止再关闭页签" : "预览：关闭页签不删除项目")}>
                                <X size={12} />
                            </button>
                        </Tooltip>
                    </div>
                ))}
                <button type="button" className="dp-icon-btn dp-icon-btn-sm" aria-label="打开其他项目" title="打开其他项目" onClick={() => onView("projects")}>
                    <Plus size={15} />
                </button>
            </div>
            <Popover
                trigger="click"
                placement="bottomRight"
                title="工作台视频任务"
                content={
                    <div className="dp-task-list">
                        {runningTasks.map((t) => (
                            <Dropdown key={t.id} trigger={["contextMenu"]} menu={{ items: [{ key: "delete", label: "删除", danger: true }] }}>
                                <button type="button" className="dp-task-item" onClick={() => onView("video")}>
                                    <span className="dp-task-main">
                                        <strong>{t.title}</strong>
                                        <span>
                                            {t.project} · {t.phase}
                                            {typeof t.progress === "number" ? " " + t.progress + "%" : ""}
                                        </span>
                                    </span>
                                    <span className="dp-task-locate">定位</span>
                                </button>
                            </Dropdown>
                        ))}
                    </div>
                }
            >
                <button type="button" className="dp-task-pill" aria-label="展开工作台任务">
                    <LoaderCircle size={14} className="dp-spin" />
                    <span>{generating} 个任务生成中</span>
                </button>
            </Popover>
            <div className="dp-top-actions">
                {view !== "projects" && (
                    <div className="dp-channel" role="group" aria-label="视频生成渠道">
                        {(["小云雀", "即梦 CLI", "其他渠道"] as const).map((c) => (
                            <button key={c} type="button" aria-pressed={c === "即梦 CLI"} title="左键切换渠道，右键仅查看设置" onClick={() => message.info("预览：渠道切换与设置弹窗保持原有行为")}>
                                {c}
                            </button>
                        ))}
                    </div>
                )}
                <button type="button" className="dp-icon-btn" aria-label="刷新界面" title="刷新界面 (F5)">
                    <RotateCw size={15} />
                </button>
                <button type="button" className="dp-icon-btn" aria-label="切换工作台皮肤" title="切换工作台皮肤">
                    <Palette size={15} />
                </button>
                <span className="dp-avatar" aria-label="账户菜单">
                    晓
                </span>
            </div>
            <div className="dp-window">
                <button type="button" aria-label="最小化窗口">
                    <Minus size={14} />
                </button>
                <button type="button" aria-label="放大或还原窗口">
                    <Square size={11} />
                </button>
                <button type="button" aria-label="关闭窗口" data-close>
                    <X size={15} />
                </button>
            </div>
        </header>
    );
}
