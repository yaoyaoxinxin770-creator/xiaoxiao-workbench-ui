"use client";
// 方案总览：并排对比 4 个设计方向，链接到各方案的可交互预览。仅预览用。
import "../_mock/preview-bridge";
import "../design-preview.css";
import { SCHEMES } from "../_components/schemes";
import { SceneArt, PortraitArt } from "../_mock/mock-art";

export default function DesignOverviewPage() {
    return (
        <div className="dp-overview">
            <header>
                <p className="dp-overview-eyebrow">晓晓工作台 · UI 设计方案（设计预览，全部为虚构模拟数据）</p>
                <h1>请选择一个设计方向</h1>
                <p className="dp-overview-lead">四个方案都保留现有功能、入口与操作方式，只改变视觉与排版。点击任一页面进入可交互预览，可在顶部随时切换方案对比。</p>
            </header>
            <div className="dp-overview-grid">
                {SCHEMES.map((s) => (
                    <article key={s.id} className="dp-ov-card" data-scheme={s.id}>
                        <div className="dp-ov-hero">
                            <div className="dp-ov-mock">
                                <span className="dp-ov-rail" />
                                <span className="dp-ov-side" />
                                <span className="dp-ov-tiles">
                                    {["harbor", "rooftop", "neon", "cafe", "station", "forest"].map((k, i) => (
                                        <span key={k}>
                                            <SceneArt scene={k as "harbor"} seed={i + 2} />
                                        </span>
                                    ))}
                                </span>
                                <span className="dp-ov-composer">
                                    <span className="dp-ov-avatar">
                                        <PortraitArt index={0} square />
                                    </span>
                                    <span className="dp-ov-avatar">
                                        <PortraitArt index={2} square />
                                    </span>
                                    <i />
                                    <b />
                                </span>
                            </div>
                        </div>
                        <div className="dp-ov-body">
                            <div className="dp-ov-title">
                                <span className="dp-ov-code">方案 {s.code}</span>
                                <h2>{s.name}</h2>
                            </div>
                            <p className="dp-ov-tagline">{s.tagline}</p>
                            <div className="dp-ov-swatches">
                                {s.swatches.map((c) => (
                                    <span key={c} style={{ background: c }} title={c} />
                                ))}
                            </div>
                            <p className="dp-ov-summary">{s.summary}</p>
                            <ul>
                                {s.points.map((p) => (
                                    <li key={p}>{p}</li>
                                ))}
                            </ul>
                            <p className="dp-ov-rule">{s.ruleNote}</p>
                            <nav>
                                <a href={`/design-preview?scheme=${s.id}&view=projects`}>项目管理</a>
                                <a href={`/design-preview?scheme=${s.id}&view=video&agent=1`}>视频创作 + Agent</a>
                                <a href={`/design-preview?scheme=${s.id}&view=assets`}>项目资产</a>
                            </nav>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
