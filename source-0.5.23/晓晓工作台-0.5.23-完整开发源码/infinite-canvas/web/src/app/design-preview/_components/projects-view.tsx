"use client";
// 项目管理页预览，对应生产 src/app/(user)/projects/page.tsx 的结构：标题区、搜索/排序/刷新/扫描/新建、画布入口、视频项目网格、即梦项目。
import { useMemo, useState } from "react";
import { App, Button, Dropdown, Input, Modal, Select, Tag } from "antd";
import { FolderPlus, LoaderCircle, Maximize2, MoreHorizontal, Plus, RefreshCw, ScanSearch, Search } from "lucide-react";
import { mockJimengProjects, mockProjects, type MockProject } from "../_mock/mock-data";
import { SceneArt } from "../_mock/mock-art";

export function ProjectsView({ onOpen }: { onOpen: () => void }) {
    const { message } = App.useApp();
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState("recent");
    const [creating, setCreating] = useState<string | null>(null);
    const projects = useMemo(() => {
        const list = mockProjects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
        return sort === "name" ? list.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true })) : list;
    }, [search, sort]);
    const menu = (p: MockProject) => ({
        items: [
            { key: "rename", label: "重命名项目" },
            { key: "open", label: "打开本地文件夹" },
            { key: "delete", label: "删除项目", danger: true },
        ],
        onClick: ({ key }: { key: string }) => message.info(`预览：「${p.name}」${key === "delete" ? "删除前会先确认范围" : key === "open" ? "打开本地文件夹" : "重命名"}（未执行）`),
    });
    return (
        <main className="dp-projects" aria-label="项目管理">
            <div className="dp-projects-inner">
                <header className="dp-projects-head">
                    <div>
                        <p className="dp-eyebrow">晓晓工作台 · 本地创作项目</p>
                        <h1>项目管理</h1>
                    </div>
                    <div className="dp-projects-actions">
                        <Input aria-label="搜索项目" placeholder="搜索项目" prefix={<Search size={15} />} value={search} onChange={(e) => setSearch(e.target.value)} allowClear style={{ width: 208 }} />
                        <Select
                            aria-label="项目排序"
                            value={sort}
                            onChange={setSort}
                            options={[
                                { value: "recent", label: "最近活动" },
                                { value: "name", label: "项目名称" },
                            ]}
                        />
                        <Button icon={<RefreshCw size={15} />} onClick={() => message.success("预览：已刷新（模拟）")}>
                            刷新
                        </Button>
                        <Button icon={<ScanSearch size={15} />}>扫描目录</Button>
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    { key: "jimeng", label: "即梦自动发送项目", extra: "输入名称" },
                                    { key: "video", label: "视频创作台项目", extra: "输入名称" },
                                    { key: "canvas", label: "画布项目", extra: "输入名称" },
                                ],
                                onClick: ({ key }) => setCreating(key),
                            }}
                        >
                            <Button type="primary" icon={<FolderPlus size={15} />} aria-label="新建项目">
                                新建项目
                            </Button>
                        </Dropdown>
                    </div>
                </header>

                <section className="dp-canvas-entry">
                    <span className="dp-canvas-entry-icon">
                        <Maximize2 size={18} />
                    </span>
                    <div>
                        <h2>画布与 Agent</h2>
                        <p>继续在你的画布中整理素材和创作</p>
                    </div>
                    <Button>打开我的画布</Button>
                </section>

                <section>
                    <h2 className="dp-section-title">
                        视频创作台项目<span>{projects.length} 个</span>
                    </h2>
                    <div className="dp-project-grid">
                        {projects.map((p) => (
                            <Dropdown key={p.id} trigger={["contextMenu"]} menu={menu(p)}>
                                <article
                                    className="dp-project-card"
                                    role="button"
                                    tabIndex={0}
                                    aria-label={"打开视频项目 " + p.name}
                                    onClick={onOpen}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            onOpen();
                                        }
                                    }}
                                >
                                    <div className="dp-project-cover" data-count={p.covers.length}>
                                        {p.covers.length ? (
                                            p.covers.map((c, i) => <SceneArt key={i} scene={c.scene} seed={c.seed} />)
                                        ) : (
                                            <div className="dp-project-cover-empty">
                                                <strong>{p.name.slice(0, 2)}</strong>
                                                <span>生成第一段视频后自动作为封面</span>
                                            </div>
                                        )}
                                        {p.busy && (
                                            <span className="dp-project-busy">
                                                <LoaderCircle size={12} className="dp-spin" />
                                                任务运行中
                                            </span>
                                        )}
                                    </div>
                                    <div className="dp-project-info">
                                        <div className="dp-project-text">
                                            <h3 title={p.name}>{p.name}</h3>
                                            <p className="dp-project-stats">
                                                <span>{p.groups} 视频组</span>
                                                <span>{p.assets} 素材</span>
                                                <span>{p.folders} 文件夹</span>
                                            </p>
                                            <p className="dp-project-recent">{p.recent ? "最近生成 " + p.recent : "尚无生成记录"}</p>
                                        </div>
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <Dropdown trigger={["click"]} menu={menu(p)}>
                                                <Button type="text" size="small" aria-label={p.name + " 更多操作"} icon={<MoreHorizontal size={18} />} />
                                            </Dropdown>
                                        </div>
                                    </div>
                                </article>
                            </Dropdown>
                        ))}
                        <button type="button" className="dp-project-new" onClick={() => setCreating("video")}>
                            <Plus size={22} />
                            新建视频项目
                        </button>
                    </div>
                </section>

                <section>
                    <h2 className="dp-section-title">
                        即梦自动发送项目<span>{mockJimengProjects.length} 个</span>
                    </h2>
                    <div className="dp-jimeng-grid">
                        {mockJimengProjects.map((j) => (
                            <article key={j.id} className="dp-jimeng-card">
                                <div className="dp-jimeng-head">
                                    <h3>{j.name}</h3>
                                    <Tag>即梦</Tag>
                                </div>
                                <p className="dp-path">{j.path}</p>
                                <div className="dp-chip-row">
                                    <span className="dp-chip">人物 {j.characters}</span>
                                    <span className="dp-chip">场景 {j.scenes}</span>
                                    <span className="dp-chip">音频 {j.audio}</span>
                                    {j.failed && <Tag color="error">有失败任务</Tag>}
                                </div>
                                <div className="dp-jimeng-foot">
                                    <Button>打开项目</Button>
                                    <a>Elements 素材库</a>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>
            <Modal
                title={creating === "video" ? "新建视频创作台项目" : creating === "jimeng" ? "新建即梦自动发送项目" : "新建画布项目"}
                open={Boolean(creating)}
                onCancel={() => setCreating(null)}
                onOk={() => {
                    setCreating(null);
                    message.success("预览：不会真的创建项目");
                }}
                okText="创建并打开"
                cancelText="取消"
            >
                <Input autoFocus aria-label="新项目名称" defaultValue={creating === "video" ? "视频项目 6" : creating === "jimeng" ? "即梦项目 3" : "无限画布 2"} />
            </Modal>
        </main>
    );
}
