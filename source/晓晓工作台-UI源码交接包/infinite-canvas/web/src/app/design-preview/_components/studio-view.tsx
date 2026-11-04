"use client";
// 视频创作主界面预览，对应 video-studio.tsx：项目目录栏（视频/资产切换、可拖动伸缩、可收起为图标）、顶部工具栏、视频网格、浮动提示词面板、Agent 侧栏。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, Dropdown, Input, Popover, Select, Slider, Switch, Tooltip } from "antd";
import { ArrowLeft, AtSign, Bot, CheckSquare, FileText, Folder, FolderOpen, FolderPlus, LayoutGrid, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, Trash2, ChevronRight, ChevronDown, Replace } from "lucide-react";
import { VIDEO_COLORS, mockFolders, mockVideos, type MockVideo } from "../_mock/mock-data";
import { VideoTile } from "./video-tile";
import { MiniDock, PromptPanel } from "./prompt-panel";
import { AgentPanel } from "./agent-panel";
import { VideoDetailModal } from "./video-detail-modal";
import { AssetDetailModal, AssetInspector, AssetSidebar, AssetsMain } from "./assets-view";

export interface StudioDemoState {
    agent?: boolean;
    detail?: string;
    asset?: string;
    params?: boolean;
    collapsed?: boolean;
    sidebar?: boolean;
}

export function StudioView({ section, onSection, demo }: { section: "results" | "elements"; onSection: (s: "results" | "elements") => void; demo: StudioDemoState }) {
    const { message } = App.useApp();
    const [sidebar, setSidebar] = useState(demo.sidebar ?? true);
    const [sidebarWidth, setSidebarWidth] = useState(244);
    const [folderId, setFolderId] = useState("f-ep1");
    const [expanded, setExpanded] = useState<string[]>(["f-ep1", "f-ep3"]);
    const [agentOpen, setAgentOpen] = useState(demo.agent ?? false);
    const [agentTarget, setAgentTarget] = useState("V07 雨夜渡口 重逢");
    const [autoMatch, setAutoMatch] = useState(true);
    const [mode, setMode] = useState("confirm");
    const [composerVisible, setComposerVisible] = useState(!demo.collapsed);
    const [selected, setSelected] = useState<string[]>([]);
    const [videos, setVideos] = useState<MockVideo[]>(mockVideos);
    const [detailId, setDetailId] = useState(demo.detail || "");
    const [columns, setColumns] = useState(4);
    const [category, setCategory] = useState("人物");
    const [role, setRole] = useState("c-linwu");
    const [assetSel, setAssetSel] = useState("a1");
    const [assetDetail, setAssetDetail] = useState(demo.asset || "");
    const [inspectorOpen, setInspectorOpen] = useState(true);
    const [composerHeight, setComposerHeight] = useState(300);
    const [mainWidth, setMainWidth] = useState(1000);
    const dock = useRef<HTMLDivElement>(null);
    const main = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; w: number } | null>(null);

    useLayoutEffect(() => {
        const el = dock.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setComposerHeight(el.getBoundingClientRect().height));
        ro.observe(el);
        return () => ro.disconnect();
    }, [composerVisible, section]);
    useLayoutEffect(() => {
        const el = main.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setMainWidth(el.getBoundingClientRect().width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => {
        // 预览演示：打开 Agent 侧栏时默认每行 3 张，关闭后恢复 4 张（生产中卡片密度仍由“视图”滑杆控制）。
        setColumns(agentOpen ? 3 : 4);
    }, [agentOpen]);

    const folder = mockFolders.find((f) => f.id === folderId);
    const trail = folder ? [...(folder.parentId ? [mockFolders.find((f) => f.id === folder.parentId)!] : []), folder] : [];
    const detail = videos.find((v) => v.id === detailId) || null;
    const sendToAgent = (v: MockVideo) => {
        setAgentTarget(v.number + " " + v.title);
        setAgentOpen(true);
    };
    const toggleSidebar = (
        <Tooltip title={sidebar ? "收起项目栏" : "展开项目栏"}>
            <button type="button" className="dp-tool-btn" aria-label={sidebar ? "收起项目栏" : "展开项目栏"} onClick={() => setSidebar(!sidebar)}>
                {sidebar ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
        </Tooltip>
    );

    const filterContent = (
        <div className="dp-pop-form">
            <label>
                生成渠道
                <Select
                    defaultValue="all"
                    options={[
                        { value: "all", label: "全部" },
                        { value: "jimeng", label: "即梦" },
                        { value: "oii", label: "Oii" },
                        { value: "pippit", label: "小云雀" },
                    ]}
                />
            </label>
            <label>
                补帧状态
                <Select
                    defaultValue="all"
                    options={[
                        { value: "all", label: "全部" },
                        { value: "i", label: "已补帧" },
                        { value: "u", label: "未补帧" },
                    ]}
                />
            </label>
            <label>
                模型
                <Select
                    defaultValue="all"
                    options={[
                        { value: "all", label: "全部" },
                        { value: "a", label: "seedance 2.5 draft" },
                        { value: "b", label: "seedance 2.0" },
                        { value: "c", label: "oii-motion-1" },
                    ]}
                />
            </label>
            <label>
                排序
                <Select
                    defaultValue="name"
                    options={[
                        { value: "newest", label: "最新生成" },
                        { value: "oldest", label: "最早生成" },
                        { value: "name", label: "名称（编号顺序）" },
                        { value: "manual", label: "手动拖拽顺序" },
                    ]}
                />
            </label>
            <label className="dp-pop-switch">
                隐藏失败
                <Switch size="small" aria-label="隐藏失败的视频" />
            </label>
            <Button size="small">清除筛选</Button>
        </div>
    );
    const colorContent = (
        <div className="dp-pop-form dp-pop-colors">
            <p className="dp-muted">勾选只控制视频上的颜色圆点，不隐藏视频。按颜色筛选视频请使用下方独立筛选。</p>
            {VIDEO_COLORS.map((c) => (
                <div key={c.id} className="dp-color-row">
                    <Checkbox defaultChecked aria-label={"显示颜色 " + c.label} />
                    <i style={{ background: c.hex }} />
                    <Input size="small" defaultValue={c.label} aria-label={"颜色用途 " + c.label} />
                </div>
            ))}
            <div className="dp-pop-divider" />
            <label>
                按颜色筛选视频（不选时显示全部视频）
                <Select mode="multiple" placeholder="选择颜色" options={VIDEO_COLORS.map((c) => ({ value: c.id, label: c.label }))} />
            </label>
        </div>
    );
    const viewContent = (
        <div className="dp-pop-form">
            <Button size="small">恢复当前视频编号块</Button>
            <label>
                布局
                <Select
                    defaultValue="grid"
                    options={[
                        { value: "grid", label: "方形网格" },
                        { value: "masonry", label: "原比例瀑布流" },
                        { value: "kanban", label: "审片看板" },
                        { value: "table", label: "表格" },
                    ]}
                />
            </label>
            <label>
                卡片密度 · 每行约 {columns} 张
                <Slider min={1} max={8} value={columns} onChange={setColumns} aria-label="视频卡片大小" />
            </label>
        </div>
    );
    const selectionContent = (
        <div className="dp-pop-form dp-pop-selection">
            <div className="dp-replace" aria-label="搜索替换提示词">
                <Input size="small" placeholder="查找内容" suffix={<Search size={13} />} aria-label="查找内容" />
                <Button size="small" icon={<Replace size={13} />}>
                    替换
                </Button>
                <Input size="small" placeholder="替换为" aria-label="替换内容" />
            </div>
            <p className="dp-muted">替换范围：{folder ? folder.name : "全部视频"}；仅改尚未生成成片的节点提示词。</p>
            <div className="dp-pop-inline">
                <Checkbox checked={selected.length === videos.length} onChange={(e) => setSelected(e.target.checked ? videos.map((v) => v.id) : [])}>
                    全选筛选结果
                </Checkbox>
                <span className="dp-muted">已选 {selected.length}</span>
            </div>
            {selected.length > 0 && (
                <div className="dp-pop-inline dp-wrap">
                    <Select size="small" placeholder="标记审片状态" style={{ width: 120 }} options={[{ value: "pass", label: "通过" }]} />
                    <Select size="small" placeholder="移动到…" style={{ width: 140 }} options={mockFolders.map((f) => ({ value: f.id, label: f.name }))} />
                    <Button size="small">下载所选</Button>
                    <Button size="small">保存视频快捷方式…</Button>
                    <Button size="small" danger>
                        移到回收站
                    </Button>
                </div>
            )}
        </div>
    );

    const tree = (parentId: string, depth: number): React.ReactNode =>
        mockFolders
            .filter((f) => f.parentId === parentId)
            .map((f) => {
                const kids = mockFolders.some((x) => x.parentId === f.id);
                const open = expanded.includes(f.id);
                return (
                    <div key={f.id}>
                        <Dropdown
                            trigger={["contextMenu"]}
                            menu={{
                                items: [
                                    { key: "rename", label: "重命名" },
                                    { key: "sub", label: "新建子文件夹" },
                                    { key: "open", label: "打开本地文件夹" },
                                    { key: "del", label: "删除文件夹", danger: true },
                                ],
                            }}
                        >
                            <button type="button" className="dp-folder" aria-pressed={section === "results" && folderId === f.id} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => (setFolderId(f.id), onSection("results"))}>
                                <span
                                    className="dp-folder-caret"
                                    data-hidden={!kids}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setExpanded((v) => (open ? v.filter((x) => x !== f.id) : [...v, f.id]));
                                    }}
                                >
                                    {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </span>
                                {folderId === f.id && section === "results" ? <FolderOpen size={14} /> : <Folder size={14} />}
                                <span className="dp-folder-name" title={f.name}>
                                    {f.name}
                                </span>
                                <em>{f.count}</em>
                            </button>
                        </Dropdown>
                        {kids && open && tree(f.id, depth + 1)}
                    </div>
                );
            });

    const composerWidth = Math.min(1040, Math.max(560, mainWidth - 48));

    return (
        <div className="dp-studio">
            <aside className="dp-sidebar" aria-label="视频项目导航" style={{ width: sidebar ? sidebarWidth : 56 }}>
                {sidebar ? (
                    <div className="dp-sidebar-inner">
                        <div className="dp-section-switch" role="tablist" aria-label="项目内容">
                            <button type="button" role="tab" aria-selected={section === "results"} onClick={() => onSection("results")}>
                                视频 <span>{videos.length}</span>
                            </button>
                            <button type="button" role="tab" aria-selected={section === "elements"} onClick={() => onSection("elements")}>
                                资产 <span>19</span>
                            </button>
                        </div>
                        {section === "elements" ? (
                            <div className="dp-sidebar-scroll">
                                <AssetSidebar category={category} role={role} onCategory={(c) => (setCategory(c), setRole(""))} onRole={(r) => (setRole(r), setCategory("人物"))} />
                            </div>
                        ) : (
                            <>
                                <div className="dp-sidebar-label">
                                    <span>剧集目录</span>
                                    <Tooltip title="添加文件夹">
                                        <button type="button" className="dp-tool-btn dp-tool-btn-sm" aria-label="添加文件夹">
                                            <FolderPlus size={14} />
                                        </button>
                                    </Tooltip>
                                </div>
                                <div className="dp-sidebar-scroll">
                                    <button type="button" className="dp-folder dp-folder-all" aria-pressed={!folderId} onClick={() => setFolderId("")}>
                                        <LayoutGrid size={14} />
                                        <span className="dp-folder-name">全部视频</span>
                                        <em>48</em>
                                    </button>
                                    {tree("", 0)}
                                </div>
                                <div className="dp-sidebar-foot">
                                    <button type="button" className="dp-folder">
                                        <Trash2 size={14} />
                                        <span className="dp-folder-name">回收站</span>
                                        <em>3</em>
                                    </button>
                                    <p>本地归档已实时同步</p>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="dp-sidebar-icons">
                        {toggleSidebar}
                        <Tooltip title="项目管理" placement="right">
                            <button type="button" className="dp-tool-btn" aria-label="项目管理">
                                <ArrowLeft size={15} />
                            </button>
                        </Tooltip>
                        <Tooltip title="Elements 素材" placement="right">
                            <button type="button" className="dp-tool-btn" aria-label="Elements 素材" onClick={() => onSection("elements")}>
                                <AtSign size={15} />
                            </button>
                        </Tooltip>
                        <Tooltip title="全部视频" placement="right">
                            <button type="button" className="dp-tool-btn" aria-label="全部视频" onClick={() => (setFolderId(""), onSection("results"))}>
                                <LayoutGrid size={15} />
                            </button>
                        </Tooltip>
                        <span className="dp-sidebar-icons-sep" />
                        {mockFolders.map((f) => (
                            <Tooltip key={f.id} title={f.name} placement="right">
                                <button type="button" className="dp-tool-btn" data-active={folderId === f.id} aria-label={"打开文件夹 " + f.name} onClick={() => (setFolderId(f.id), onSection("results"))}>
                                    <Folder size={15} />
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                )}
                <div
                    className="dp-resizer"
                    role="separator"
                    aria-label="调整项目栏宽度"
                    aria-orientation="vertical"
                    aria-valuemin={56}
                    aria-valuemax={420}
                    aria-valuenow={sidebar ? sidebarWidth : 56}
                    tabIndex={0}
                    title="拖动调整宽度，向左压缩可收起；双击收起或展开"
                    onDoubleClick={() => setSidebar(!sidebar)}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = { x: e.clientX, w: sidebar ? sidebarWidth : 56 };
                    }}
                    onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d) return;
                        const w = d.w + e.clientX - d.x;
                        if (w <= 130) setSidebar(false);
                        else {
                            setSidebar(true);
                            setSidebarWidth(Math.max(170, Math.min(420, w)));
                        }
                    }}
                    onPointerUp={() => (drag.current = null)}
                />
            </aside>

            <main className="dp-studio-main" ref={main}>
                {section === "results" ? (
                    <header className="dp-video-toolbar">
                        <div className="dp-crumbs">
                            {sidebar && toggleSidebar}
                            <button type="button" className="dp-crumb-root" onClick={() => setFolderId("")}>
                                全部视频
                            </button>
                            {trail.map((f) => (
                                <span key={f.id} className="dp-crumb">
                                    <i>/</i>
                                    <button type="button" onClick={() => setFolderId(f.id)}>
                                        {f.name}
                                    </button>
                                </span>
                            ))}
                            <span className="dp-count-tag">{videos.length}</span>
                        </div>
                        <div className="dp-toolbar-groups">
                            <div className="dp-toolbar-group">
                                <Button aria-pressed={agentOpen} type={agentOpen ? "primary" : "default"} icon={<Bot size={15} />} title="打开 Codex Agent 提示词修改助手" onClick={() => setAgentOpen((v) => !v)}>
                                    Agent
                                </Button>
                                <Select
                                    aria-label="即梦创作方式"
                                    value={mode}
                                    onChange={setMode}
                                    popupMatchSelectWidth={false}
                                    style={{ width: 150 }}
                                    options={[
                                        { value: "confirm", label: "① 弹窗确认后生成" },
                                        { value: "draft", label: "② 只建节点，不生成" },
                                        { value: "direct", label: "③ 直接生成（扣积分）" },
                                    ]}
                                />
                                <button type="button" className="dp-toggle" aria-pressed={autoMatch} title="载入视频组、粘贴和创作时自动匹配本组素材" onClick={() => setAutoMatch((v) => !v)}>
                                    <span className="dp-toggle-track">
                                        <span />
                                    </span>
                                    自动匹配 · {autoMatch ? "开" : "关"}
                                </button>
                            </div>
                            <div className="dp-toolbar-group">
                                <Popover trigger="click" placement="bottomRight" content={selectionContent}>
                                    <Button aria-label="视频选择操作" type={selected.length ? "primary" : "default"} icon={<CheckSquare size={15} />}>
                                        {selected.length || null}
                                    </Button>
                                </Popover>
                                <Popover trigger="click" placement="bottomRight" content={colorContent}>
                                    <Button aria-label="视频颜色分组">
                                        <span className="dp-color-dots">
                                            {VIDEO_COLORS.slice(0, 3).map((c) => (
                                                <i key={c.id} style={{ background: c.hex }} />
                                            ))}
                                        </span>
                                        颜色分组
                                    </Button>
                                </Popover>
                                <Popover trigger="click" placement="bottomRight" content={filterContent}>
                                    <Button icon={<SlidersHorizontal size={15} />}>筛选</Button>
                                </Popover>
                                <Popover trigger="click" placement="bottomRight" content={viewContent}>
                                    <Button icon={<LayoutGrid size={15} />}>视图</Button>
                                </Popover>
                                <Button>全局提示词</Button>
                                <Button icon={<FileText size={15} />}>导入视频组</Button>
                            </div>
                        </div>
                    </header>
                ) : null}

                <div className="dp-studio-body">
                    {agentOpen && section === "results" && <AgentPanel onClose={() => setAgentOpen(false)} target={agentTarget} />}
                    <div className="dp-results-col">
                        {section === "results" ? (
                            <div className="dp-results-scroll" style={{ paddingBottom: (composerVisible ? composerHeight : 52) + 24 }}>
                                <div className="dp-gallery" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                                    {videos.map((v) => (
                                        <VideoTile
                                            key={v.id}
                                            v={v}
                                            selected={selected.includes(v.id)}
                                            onSelect={(c) => setSelected((s) => (c ? [...s, v.id] : s.filter((x) => x !== v.id)))}
                                            onOpen={() => setDetailId(v.id)}
                                            onAgent={() => sendToAgent(v)}
                                            onLike={() => setVideos((list) => list.map((x) => (x.id === v.id ? { ...x, liked: !x.liked } : x)))}
                                            onEdit={() => {
                                                setComposerVisible(true);
                                                message.info("预览：载入 " + v.number + " 的提示词、参考素材与参数（不自动生成）");
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <AssetsMain
                                category={category}
                                role={role}
                                selectedId={assetSel}
                                onSelect={setAssetSel}
                                onOpenDetail={setAssetDetail}
                                inspectorOpen={inspectorOpen}
                                onToggleInspector={() => setInspectorOpen((v) => !v)}
                                sidebarToggle={toggleSidebar}
                                bottomPad={(composerVisible ? composerHeight : 52) + 24}
                            />
                        )}
                        {(section === "results" || section === "elements") && (
                            <div className="dp-composer-dock" ref={dock}>
                                {composerVisible ? <PromptPanel width={composerWidth} onCollapse={() => setComposerVisible(false)} paramsOpen={demo.params} /> : <MiniDock onExpand={() => setComposerVisible(true)} />}
                            </div>
                        )}
                    </div>
                    {section === "elements" && inspectorOpen && <AssetInspector id={assetSel} onClose={() => setInspectorOpen(false)} onOpenDetail={() => setAssetDetail(assetSel)} />}
                </div>
            </main>
            <VideoDetailModal
                video={detail}
                onClose={() => setDetailId("")}
                onStep={(d) => {
                    const i = videos.findIndex((v) => v.id === detailId);
                    const next = videos[i + d];
                    if (next) setDetailId(next.id);
                }}
                onAgent={() => {
                    if (detail) sendToAgent(detail);
                    setDetailId("");
                }}
            />
            <AssetDetailModal id={assetDetail} onClose={() => setAssetDetail("")} onSwitch={setAssetDetail} />
        </div>
    );
}
