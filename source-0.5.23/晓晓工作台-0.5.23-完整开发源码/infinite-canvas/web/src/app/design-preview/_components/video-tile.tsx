"use client";
// 视频卡片预览：直角纯画面，不加标题/渠道/时间说明区；右上角悬浮按钮顺序固定为 重新编辑 → 发给 Agent → 收藏。
import { App, Dropdown, Tooltip } from "antd";
import { AlertTriangle, Bot, Check, Clock3, LoaderCircle, Pencil, Play, Star } from "lucide-react";
import { VIDEO_COLORS, type MockVideo } from "../_mock/mock-data";
import { SceneArt } from "../_mock/mock-art";

export function VideoTile({ v, selected, onSelect, onOpen, onAgent, onLike, onEdit }: { v: MockVideo; selected: boolean; onSelect: (c: boolean) => void; onOpen: () => void; onAgent: () => void; onLike: () => void; onEdit: () => void }) {
    const { message } = App.useApp();
    const empty = v.state === "empty";
    const color = VIDEO_COLORS.find((c) => c.id === v.color);
    const menu = {
        items: [
            { key: "agent", label: "发给 Agent 修改…" },
            ...(v.state === "generating" ? [{ key: "stop", label: "中断本地等待…" }] : []),
            ...(v.state === "failed" || v.state === "awaiting" ? [{ key: "resume", label: v.state === "awaiting" ? "核对原画布任务" : "继续原画布草稿" }] : []),
            {
                key: "colors",
                label: "标记颜色",
                children: [
                    { key: "color:", label: "取消颜色" },
                    ...VIDEO_COLORS.map((c) => ({
                        key: "color:" + c.id,
                        label: (
                            <span className="dp-menu-color">
                                <i style={{ background: c.hex }} />
                                {c.label}
                            </span>
                        ),
                    })),
                ],
            },
            { key: "shortcut", label: "保存视频快捷…" },
            { type: "divider" as const },
            { key: "open-folder", label: "打开视频文件夹位置" },
            { key: "delete-group", label: "删除视频组", danger: true },
        ],
        onClick: ({ key }: { key: string }) => {
            if (key === "agent") onAgent();
            else message.info("预览：" + (key === "delete-group" ? "删除前会说明范围并确认，本地文件与官网节点不删除" : "该操作保留原有行为（未执行）"));
        },
    };
    return (
        <Dropdown trigger={["contextMenu"]} menu={menu}>
            <article className="dp-tile" data-state={v.state} data-selected={selected} aria-label={"视频 " + v.title}>
                {!empty && v.state !== "failed" && <SceneArt scene={v.scene} seed={v.seed} className="dp-tile-art" />}
                <button type="button" className="dp-tile-surface" aria-label={"查看视频 " + v.title} onClick={() => (empty ? onEdit() : onOpen())}>
                    {empty && <span className="dp-tile-load">载入本组</span>}
                    {v.state === "done" && (
                        <span className="dp-tile-play">
                            <Play size={22} />
                        </span>
                    )}
                    {v.state === "generating" && (
                        <span className="dp-tile-status">
                            <LoaderCircle className="dp-spin" size={22} />
                            <b>生成中 {v.progress}%</b>
                        </span>
                    )}
                    {v.state === "interpolating" && (
                        <span className="dp-tile-status">
                            <Clock3 size={20} />
                            <b>样片已生成，等待官方补帧完成后回传</b>
                        </span>
                    )}
                    {v.state === "node" && (
                        <span className="dp-tile-status">
                            <Check size={20} />
                            <b>节点已建立 · {v.channel}官网手动生成</b>
                        </span>
                    )}
                    {v.state === "awaiting" && (
                        <span className="dp-tile-status">
                            <b>待核对</b>
                            <small>原任务已保留，请核对画布提交状态</small>
                        </span>
                    )}
                    {v.state === "failed" && (
                        <span className="dp-tile-status dp-tile-failed">
                            <AlertTriangle size={18} />
                            <small>{v.error}</small>
                        </span>
                    )}
                </button>
                {v.state === "generating" && (
                    <>
                        <span className="dp-tile-progress" style={{ width: (v.progress || 0) + "%" }} />
                        <button type="button" className="dp-tile-stop" title="停止本地等待并保留原任务；不会误报官网已经取消" onClick={() => message.info("预览：中断本地等待，保留原任务身份")}>
                            中断等待
                        </button>
                    </>
                )}
                <span className="dp-tile-number">{v.number}</span>
                {!empty && (
                    <label className="dp-tile-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={"选择视频 " + v.title} checked={selected} onChange={(e) => onSelect(e.target.checked)} />
                        <Check size={14} />
                    </label>
                )}
                {!empty && (
                    <div className="dp-tile-actions">
                        <button type="button" aria-label={"重新编辑视频 " + v.title} title="重新编辑" onClick={onEdit}>
                            <Pencil size={14} />
                        </button>
                        <button type="button" aria-label={"发给 Agent " + v.title} title="发给 Agent 修改提示词" onClick={onAgent}>
                            <Bot size={14} />
                        </button>
                        <button type="button" aria-label={"收藏视频 " + v.title} aria-pressed={Boolean(v.liked)} title={v.liked ? "取消收藏" : "收藏"} data-liked={v.liked} onClick={onLike}>
                            <Star size={14} />
                        </button>
                    </div>
                )}
                {v.unread && <span className="dp-tile-unread" role="img" aria-label="未查看的新视频" title="未查看的新视频" />}
                {color && (
                    <Tooltip mouseEnterDelay={0} mouseLeaveDelay={0} placement="topRight" title={<span>{v.note || color.label + " · 点击添加备注"}</span>}>
                        <button type="button" className="dp-tile-color" aria-label={"视频备注 " + v.title} style={{ background: color.hex }} onClick={(e) => e.stopPropagation()} />
                    </Tooltip>
                )}
            </article>
        </Dropdown>
    );
}
