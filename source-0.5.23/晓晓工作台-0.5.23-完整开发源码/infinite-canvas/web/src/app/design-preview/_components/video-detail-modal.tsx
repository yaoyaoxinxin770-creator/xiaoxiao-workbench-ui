"use client";
// 视频详情弹窗预览：顶部上一条/下一条、审片状态、归档文件夹；备注显示在“作品信息与生成详情”上方；
// 提示词置顶箭头在“复制”右侧，置底箭头在底部操作区右侧；底部主操作“截取视频帧”替代原下载按钮。
import { useRef } from "react";
import { App, Button, Modal, Select } from "antd";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, Camera, Copy, Pause, Pencil, StickyNote, Volume2 } from "lucide-react";
import { VIDEO_COLORS, longPrompt, mockFolders, mockReferences, mockVideos, type MockVideo } from "../_mock/mock-data";
import { PortraitArt, SceneArt } from "../_mock/mock-art";
import { highlightPrompt } from "./prompt-panel";

export function VideoDetailModal({ video, onClose, onStep, onAgent }: { video: MockVideo | null; onClose: () => void; onStep: (d: number) => void; onAgent: () => void }) {
    const { message } = App.useApp();
    const scroll = useRef<HTMLDivElement>(null);
    const index = video ? mockVideos.findIndex((v) => v.id === video.id) : -1;
    const color = VIDEO_COLORS.find((c) => c.id === video?.color);
    return (
        <Modal title={video?.title || "视频详情"} open={Boolean(video)} onCancel={onClose} footer={null} width="min(1240px, 96vw)" centered classNames={{ root: "dp-modal-root" }} destroyOnHidden>
            {video && (
                <div className="dp-detail">
                    <div className="dp-detail-bar">
                        <Button aria-label="上一个视频结果" disabled={index <= 0} icon={<ArrowLeft size={15} />} onClick={() => onStep(-1)} />
                        <Button aria-label="下一个视频结果" disabled={index >= mockVideos.length - 1} icon={<ArrowRight size={15} />} onClick={() => onStep(1)} />
                        <span className="dp-detail-index">
                            {index + 1} / {mockVideos.length}
                        </span>
                        <Select
                            aria-label="视频详情审片状态"
                            style={{ width: 132 }}
                            defaultValue="pending"
                            options={[
                                { value: "none", label: "未审片" },
                                { value: "pending", label: "待审片" },
                                { value: "pass", label: "通过" },
                                { value: "redo", label: "需返工" },
                            ]}
                        />
                        <Select aria-label="视频详情归档文件夹" style={{ width: 220 }} defaultValue="f-ep1" options={[{ value: "", label: "项目根目录" }, ...mockFolders.map((f) => ({ value: f.id, label: f.name }))]} />
                    </div>
                    <div className="dp-detail-grid">
                        <div className="dp-player">
                            <div className="dp-player-frame">
                                <SceneArt scene={video.scene} seed={video.seed} />
                                <span className="dp-tile-number">{video.number}</span>
                            </div>
                            <div className="dp-player-controls">
                                <button type="button" aria-label="暂停">
                                    <Pause size={15} />
                                </button>
                                <span className="dp-mono">00:06.12 / 00:15.00</span>
                                <div className="dp-timeline">
                                    <span style={{ width: "41%" }} />
                                    <i style={{ left: "41%" }} />
                                </div>
                                <button type="button" aria-label="音量">
                                    <Volume2 size={15} />
                                </button>
                            </div>
                        </div>
                        <div className="dp-detail-side" ref={scroll}>
                            {video.note && (
                                <div className="dp-detail-note" style={{ borderColor: color?.hex }}>
                                    <StickyNote size={14} style={{ color: color?.hex }} />
                                    <div>
                                        <strong>{color?.label || "备注"}</strong>
                                        <p>{video.note}</p>
                                    </div>
                                </div>
                            )}
                            <h3 className="dp-detail-h">作品信息与生成详情</h3>
                            <dl className="dp-info-grid">
                                <div>
                                    <dt>渠道</dt>
                                    <dd>{video.channel}</dd>
                                </div>
                                <div>
                                    <dt>模型</dt>
                                    <dd>{video.model}</dd>
                                </div>
                                <div>
                                    <dt>时长</dt>
                                    <dd>{video.seconds}s</dd>
                                </div>
                                <div>
                                    <dt>画幅</dt>
                                    <dd>{video.ratio}</dd>
                                </div>
                                <div>
                                    <dt>清晰度</dt>
                                    <dd>{video.resolution}</dd>
                                </div>
                                <div>
                                    <dt>补帧（实际完成）</dt>
                                    <dd>{video.fps}</dd>
                                </div>
                                <div>
                                    <dt>生成时间</dt>
                                    <dd>{video.createdAt}</dd>
                                </div>
                                <div>
                                    <dt>视频编号</dt>
                                    <dd>{video.number}</dd>
                                </div>
                            </dl>
                            <div className="dp-detail-prompt">
                                <header>
                                    <strong>提示词</strong>
                                    <span className="dp-flex1" />
                                    <button type="button" className="dp-small-btn" onClick={() => message.success("预览：已复制提示词")}>
                                        <Copy size={12} />
                                        复制
                                    </button>
                                    <button type="button" className="dp-tool-btn" aria-label="滚动到顶部" title="置顶" onClick={() => scroll.current?.scrollTo({ top: 0, behavior: "smooth" })}>
                                        <ArrowUp size={14} />
                                    </button>
                                </header>
                                <pre>{highlightPrompt(longPrompt)}</pre>
                            </div>
                            <div className="dp-detail-refs">
                                <strong>本次参考素材</strong>
                                <div>
                                    {mockReferences
                                        .filter((r) => r.kind === "image" && !r.missing)
                                        .map((r) => (
                                            <figure key={r.id}>
                                                {r.portrait !== undefined ? <PortraitArt index={r.portrait} square /> : <SceneArt scene={r.scene || "harbor"} seed={r.seed} />}
                                                <figcaption>{r.name}</figcaption>
                                            </figure>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <footer className="dp-detail-actions">
                        <Button type="primary" icon={<Camera size={15} />} onClick={() => message.info("预览：截取当前帧，保存为 PNG 到资产库-视频目录")}>
                            截取视频帧
                        </Button>
                        <Button icon={<Pencil size={15} />}>重新编辑</Button>
                        <Button icon={<Bot size={15} />} onClick={onAgent}>
                            发给 Agent
                        </Button>
                        <span className="dp-flex1" />
                        <button type="button" className="dp-tool-btn" aria-label="滚动到底部" title="置底" onClick={() => scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" })}>
                            <ArrowDown size={14} />
                        </button>
                    </footer>
                </div>
            )}
        </Modal>
    );
}
