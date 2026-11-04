"use client";
// 项目资产库预览，对应 video-elements.tsx / element-archive.tsx / element-inspector-panel.tsx。
// 字段保持精简：名称、别名（多个）、分类、禁用、优先级、角色/分组；不加入描述、作者、状态、匹配名称输入框。
import { useMemo, useState } from "react";
import { App, Button, Dropdown, Input, Modal, Select, Tag, Tooltip } from "antd";
import { ChevronDown, EyeOff, LayoutGrid, Maximize2, Music2, PanelRightClose, PanelRightOpen, Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { mockAssets, mockCharacters, type MockAsset } from "../_mock/mock-data";
import { AudioWave, PortraitArt, SceneArt } from "../_mock/mock-art";

const CATEGORIES = ["全部", "人物", "场景", "道具", "音频", "视频", "未分类", "已禁用"] as const;

export function AssetArt({ a, square }: { a: MockAsset; square?: boolean }) {
    if (a.category === "音频")
        return (
            <span className="dp-audio-art">
                <Music2 size={18} />
                <AudioWave seed={a.name.length} bars={22} />
            </span>
        );
    if (a.portrait !== undefined) return <PortraitArt index={a.portrait} square={square} />;
    return <SceneArt scene={a.scene || "harbor"} seed={a.seed} />;
}

export function AssetSidebar({ category, role, onCategory, onRole }: { category: string; role: string; onCategory: (c: string) => void; onRole: (r: string) => void }) {
    const count = (c: string) => (c === "已禁用" ? mockAssets.filter((a) => a.disabled).length : mockAssets.filter((a) => !a.disabled && (c === "全部" || a.category === c)).length);
    return (
        <nav className="dp-asset-nav" aria-label="素材归档导航">
            <h2>资产分类</h2>
            <div className="dp-asset-cats">
                {CATEGORIES.map((c) => (
                    <button key={c} type="button" aria-pressed={category === c && !role} onClick={() => onCategory(c)}>
                        {c === "已禁用" && <EyeOff size={14} />}
                        <span>{c}</span>
                        <em data-warn={c === "未分类" && count(c) > 0}>{count(c)}</em>
                    </button>
                ))}
            </div>
            <div className="dp-role-head">
                <h2>剧目角色</h2>
                <button type="button" aria-label="恢复隐藏角色" title="恢复角色目录显示">
                    <EyeOff size={14} />
                    <span>1</span>
                </button>
                <button type="button" aria-label="新建角色" title="新建角色素材">
                    <Plus size={15} />
                </button>
            </div>
            <div className="dp-roles">
                {mockCharacters.map((c) => (
                    <Dropdown
                        key={c.id}
                        trigger={["contextMenu"]}
                        menu={{
                            items: [
                                { key: "pin", label: c.pinned ? "取消置顶" : "置顶人物" },
                                { key: "hide", label: "不在角色目录显示" },
                            ],
                        }}
                    >
                        <button type="button" aria-pressed={role === c.id} onClick={() => onRole(c.id)} data-pinned={c.pinned}>
                            <span className="dp-role-avatar">
                                <PortraitArt index={c.portrait} square />
                            </span>
                            <span className="dp-role-name">{c.name}</span>
                            <em>{c.count}</em>
                        </button>
                    </Dropdown>
                ))}
            </div>
        </nav>
    );
}

function PriorityBadge({ a }: { a: MockAsset }) {
    if (a.disabled) return <span className="dp-badge dp-badge-off">已禁用</span>;
    if (a.priority) return <span className="dp-badge dp-badge-pri">优先{a.priority}</span>;
    return null;
}

export function AssetsMain({
    category,
    role,
    selectedId,
    onSelect,
    onOpenDetail,
    inspectorOpen,
    onToggleInspector,
    sidebarToggle,
    bottomPad,
}: {
    category: string;
    role: string;
    selectedId: string;
    onSelect: (id: string) => void;
    onOpenDetail: (id: string) => void;
    inspectorOpen: boolean;
    onToggleInspector: () => void;
    sidebarToggle: React.ReactNode;
    bottomPad: number;
}) {
    const { message } = App.useApp();
    const [search, setSearch] = useState("");
    const [layout, setLayout] = useState<"archive" | "grid">("archive");
    const roleInfo = mockCharacters.find((c) => c.id === role);
    const items = useMemo(() => {
        let list = mockAssets.filter((a) => (role ? a.character === role : category === "全部" ? true : category === "已禁用" ? a.disabled : a.category === category));
        if (search) list = list.filter((a) => a.name.includes(search) || a.aliases?.some((x) => x.includes(search)));
        return list;
    }, [category, role, search]);
    const active = items.filter((a) => !a.disabled).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const disabled = items.filter((a) => a.disabled);
    const groups = useMemo(() => {
        const map = new Map<string, MockAsset[]>();
        for (const a of active) map.set(a.group, [...(map.get(a.group) || []), a]);
        return [...map.entries()];
    }, [active]);
    const menu = (a: MockAsset) => ({
        items: [
            { key: "pin", label: "置顶" },
            { key: "priority", label: a.priority ? "取消优先" : "设为优先" },
            { key: "disable", label: a.disabled ? "取消禁用" : "禁用" },
            { type: "divider" as const },
            { key: "move", label: "移动到…" },
            { key: "replace", label: "替换图片…" },
            { key: "delete", label: "删除素材", danger: true },
            { type: "divider" as const },
            { key: "folder", label: "打开本地所在文件夹" },
        ],
        onClick: () => message.info("预览：右键菜单顺序为 置顶/优先/禁用 在前，打开本地所在文件夹在最后"),
    });
    const heading = roleInfo ? roleInfo.name : category;
    return (
        <div className="dp-assets-main">
            <header className="dp-elements-header">
                {sidebarToggle}
                <span className="dp-elements-count">
                    <strong>资产</strong> {mockAssets.length}
                </span>
                <div className="dp-elements-toolbar">
                    <Input aria-label="搜索视频项目资产" prefix={<Search size={14} />} placeholder="搜索素材 / @角色 / 场景" value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: 164 }} />
                    <div className="dp-seg dp-seg-sm" role="group" aria-label="素材展示方式">
                        <button type="button" aria-pressed={layout === "archive"} onClick={() => setLayout("archive")}>
                            智能叠卡
                        </button>
                        <button type="button" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>
                            全部文件
                        </button>
                    </div>
                    <span className="dp-flex1" />
                    <Button size="small" icon={<ChevronDown size={13} />} iconPlacement="end">
                        按序号
                    </Button>
                    <Tooltip title="筛选素材">
                        <Button size="small" aria-label="筛选素材" icon={<SlidersHorizontal size={13} />} />
                    </Tooltip>
                    <Tooltip title="视图">
                        <Button size="small" aria-label="素材视图" icon={<LayoutGrid size={13} />} />
                    </Tooltip>
                    <Tooltip title="定位缺失的本地文件；先勾选素材则只定位所选">
                        <Button size="small">定位</Button>
                    </Tooltip>
                    <Button size="small" aria-pressed={inspectorOpen} icon={inspectorOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />} onClick={onToggleInspector}>
                        检查器
                    </Button>
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [{ key: "files", label: "导入选定文件" }, { key: "folder", label: "导入整个文件夹" }, { key: "relink-folder", label: "一键定位缺失文件夹…" }, { type: "divider" }, { key: "create", label: "添加元素" }],
                        }}
                    >
                        <Button size="small" type="primary" icon={<Plus size={13} />}>
                            添加素材
                        </Button>
                    </Dropdown>
                </div>
            </header>
            <div className="dp-assets-scroll" style={{ paddingBottom: bottomPad }}>
                <h2 className="dp-archive-heading">
                    {roleInfo && (
                        <span className="dp-archive-avatar">
                            <PortraitArt index={roleInfo.portrait} square />
                        </span>
                    )}
                    {heading}
                    <span>
                        {active.length} 个可用 · {disabled.length} 个已禁用
                    </span>
                </h2>
                {layout === "archive" ? (
                    <div className="dp-archive-grid">
                        {groups.map(([name, list]) => {
                            const cover = list[0];
                            return (
                                <Dropdown key={name} trigger={["contextMenu"]} menu={menu(cover)}>
                                    <button type="button" className="dp-archive-group" data-selected={list.some((a) => a.id === selectedId)} onClick={() => onSelect(cover.id)} onDoubleClick={() => onOpenDetail(cover.id)}>
                                        <span className="dp-archive-cover" data-audio={cover.category === "音频" || undefined}>
                                            <AssetArt a={cover} />
                                            <PriorityBadge a={cover} />
                                        </span>
                                        <span className="dp-archive-main">
                                            <strong title={cover.name}>{cover.name}</strong>
                                            <small>{name}</small>
                                            <span className="dp-archive-meta">
                                                {list.length} 张 · {list.reduce((s, a) => s + (a.variants || 1), 0)} 个变体
                                                {cover.aliases?.length ? " · 别名 " + cover.aliases.length : ""}
                                            </span>
                                            <span className="dp-archive-minis">
                                                {list.slice(0, 4).map((a) => (
                                                    <span key={a.id} className="dp-mini-thumb" data-selected={a.id === selectedId}>
                                                        <AssetArt a={a} square />
                                                    </span>
                                                ))}
                                            </span>
                                            <span className="dp-archive-open" onClick={(e) => (e.stopPropagation(), onOpenDetail(cover.id))}>
                                                查看详情 →
                                            </span>
                                        </span>
                                    </button>
                                </Dropdown>
                            );
                        })}
                        {(category === "道具" || role === "") && category === "道具" && (
                            <button type="button" className="dp-new-prop">
                                <Plus size={18} />
                                新建道具
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="dp-file-grid">
                        {active.map((a) => (
                            <Dropdown key={a.id} trigger={["contextMenu"]} menu={menu(a)}>
                                <button type="button" className="dp-file-card" data-selected={a.id === selectedId} onClick={() => onSelect(a.id)} onDoubleClick={() => onOpenDetail(a.id)}>
                                    <span className="dp-file-thumb">
                                        <AssetArt a={a} />
                                        <PriorityBadge a={a} />
                                    </span>
                                    <span className="dp-file-name">{a.name}</span>
                                </button>
                            </Dropdown>
                        ))}
                    </div>
                )}
                <details className="dp-disabled-zone" open>
                    <summary>
                        <EyeOff size={14} />
                        查看已禁用 <span>{disabled.length}</span>
                        <small>禁用素材不参与自动引用，图片正常清晰显示</small>
                    </summary>
                    <div className="dp-file-grid">
                        {disabled.map((a) => (
                            <Dropdown key={a.id} trigger={["contextMenu"]} menu={menu(a)}>
                                <button type="button" className="dp-file-card" data-selected={a.id === selectedId} onClick={() => onSelect(a.id)}>
                                    <span className="dp-file-thumb">
                                        <AssetArt a={a} />
                                        <PriorityBadge a={a} />
                                    </span>
                                    <span className="dp-file-name">{a.name}</span>
                                </button>
                            </Dropdown>
                        ))}
                        {!disabled.length && <p className="dp-muted">当前分类没有已禁用素材</p>}
                    </div>
                </details>
            </div>
        </div>
    );
}

function AssetFields({ a, compact }: { a: MockAsset; compact?: boolean }) {
    const [priority, setPriority] = useState(a.disabled ? "off" : String(a.priority || 0));
    const [aliases, setAliases] = useState(a.aliases || []);
    const [draft, setDraft] = useState("");
    return (
        <div className="dp-fields" data-compact={compact}>
            <div className="dp-seg dp-seg-full" role="group" aria-label="引用优先级">
                {[
                    ["0", "普通"],
                    ["1", "优先1"],
                    ["2", "优先2"],
                    ["off", "禁用"],
                ].map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={priority === k} data-off={k === "off" || undefined} onClick={() => setPriority(k)}>
                        {k !== "0" && k !== "off" && <Star size={11} />}
                        {l}
                    </button>
                ))}
            </div>
            <label>
                <span>名称</span>
                <Input size="small" defaultValue={a.name} aria-label="素材名称" />
            </label>
            <label>
                <span>别名（参与提示词匹配）</span>
                <div className="dp-alias-box">
                    {aliases.map((x) => (
                        <Tag key={x} closable onClose={() => setAliases((v) => v.filter((y) => y !== x))}>
                            {x}
                        </Tag>
                    ))}
                    <input
                        aria-label="添加别名"
                        placeholder={aliases.length ? "继续添加…" : "输入后回车添加"}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && draft.trim() && !e.nativeEvent.isComposing) {
                                setAliases((v) => [...v, draft.trim()]);
                                setDraft("");
                            }
                        }}
                    />
                </div>
            </label>
            <div className="dp-field-row">
                <label>
                    <span>分类</span>
                    <Select size="small" defaultValue={a.category} options={["人物", "场景", "道具", "音频", "视频", "未分类"].map((v) => ({ value: v, label: v }))} />
                </label>
                <label>
                    <span>角色 / 分组</span>
                    <Select size="small" defaultValue={a.group} options={[...new Set(mockAssets.map((x) => x.group))].map((v) => ({ value: v, label: v }))} />
                </label>
            </div>
        </div>
    );
}

export function AssetInspector({ id, onClose, onOpenDetail }: { id: string; onClose: () => void; onOpenDetail: () => void }) {
    const a = mockAssets.find((x) => x.id === id) || mockAssets[0];
    return (
        <aside className="dp-inspector" aria-label="资产属性检查器">
            <header>
                <strong>属性检查器</strong>
                <button type="button" className="dp-tool-btn" aria-label="收起属性检查器" title="收起右侧检查器" onClick={onClose}>
                    <PanelRightClose size={14} />
                </button>
            </header>
            <div className="dp-inspector-preview" data-audio={a.category === "音频" || undefined}>
                <AssetArt a={a} />
                <button type="button" className="dp-zoom" aria-label={"放大查看 " + a.name} title="打开高清大图与完整弹窗" onClick={onOpenDetail}>
                    <Maximize2 size={13} />
                </button>
            </div>
            <h3 className="dp-inspector-name">{a.name}</h3>
            <p className="dp-muted dp-inspector-sub">
                {a.group} · {a.category}
                {a.variants ? " · " + a.variants + " 个变体" : ""}
            </p>
            <AssetFields key={a.id} a={a} compact />
        </aside>
    );
}

export function AssetDetailModal({ id, onClose, onSwitch }: { id: string; onClose: () => void; onSwitch: (id: string) => void }) {
    const a = mockAssets.find((x) => x.id === id);
    const siblings = a ? mockAssets.filter((x) => x.group === a.group) : [];
    return (
        <Modal open={Boolean(a)} onCancel={onClose} footer={null} width="min(1080px, 94vw)" centered title={a ? a.name : ""} classNames={{ root: "dp-modal-root" }} closeIcon={<X size={16} />} destroyOnHidden>
            {a && (
                <div className="dp-asset-detail">
                    <div className="dp-asset-stage" data-audio={a.category === "音频" || undefined}>
                        <AssetArt a={a} />
                    </div>
                    <div className="dp-asset-side">
                        <div className="dp-asset-side-head">
                            <PriorityBadge a={a} />
                            <span className="dp-muted">
                                {a.group} · {a.category}
                            </span>
                        </div>
                        <AssetFields key={a.id} a={a} />
                        <div className="dp-variants">
                            <strong>同组变体</strong>
                            <div>
                                {siblings.map((s) => (
                                    <Dropdown
                                        key={s.id}
                                        trigger={["contextMenu"]}
                                        menu={{
                                            items: [
                                                { key: "uncat", label: "移到未分类" },
                                                { key: "del", label: "删除该素材（原文件保留）", danger: true },
                                            ],
                                        }}
                                    >
                                        <button type="button" aria-pressed={s.id === a.id} onClick={() => onSwitch(s.id)} title={s.name}>
                                            <AssetArt a={s} square />
                                        </button>
                                    </Dropdown>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
