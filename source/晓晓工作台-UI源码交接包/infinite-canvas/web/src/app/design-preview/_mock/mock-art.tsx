"use client";
// 仅预览用：以代码生成的 SVG 插画代替真实视频封面和人物素材（原创矢量图形，无外部版权素材）。
import { useId } from "react";
import { portraitPalette, type SceneKind } from "./mock-data";

function rand(seed: number) {
    let s = seed * 9301 + 49297;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

const SCENES: Record<SceneKind, { sky: [string, string, string]; ground: string; glow: string }> = {
    harbor: { sky: ["#0E1A33", "#24365E", "#5C5A86"], ground: "#0A1222", glow: "#FFB46B" },
    rooftop: { sky: ["#3A2E6B", "#E66F7E", "#FFC48A"], ground: "#2A1E3A", glow: "#FFE0A6" },
    neon: { sky: ["#120F24", "#2A1B45", "#40265C"], ground: "#0B0918", glow: "#FF5FA2" },
    classroom: { sky: ["#F6E7D2", "#F3D9B8", "#E9C49A"], ground: "#B98D64", glow: "#FFF3D6" },
    forest: { sky: ["#163828", "#2F6B4A", "#9ACB8C"], ground: "#0F2619", glow: "#E8F7C8" },
    cafe: { sky: ["#3B2418", "#7A4A30", "#C98A58"], ground: "#2A1810", glow: "#FFD49A" },
    sky: { sky: ["#7DB7F0", "#B8D9F7", "#FDE6EF"], ground: "#6C9A6A", glow: "#FFFFFF" },
    station: { sky: ["#0D1420", "#1C2A3D", "#3B4E66"], ground: "#070B12", glow: "#9FE0FF" },
};

export function SceneArt({ scene, seed = 1, className, vertical = false }: { scene: SceneKind; seed?: number; className?: string; vertical?: boolean }) {
    const uid = useId().replace(/:/g, "");
    const r = rand(seed + scene.length * 17);
    const c = SCENES[scene];
    const w = vertical ? 90 : 160,
        h = vertical ? 160 : 90;
    const horizon = h * (0.58 + r() * 0.1);
    const moonX = w * (0.15 + r() * 0.7),
        moonY = h * (0.14 + r() * 0.18);
    const buildings = Array.from({ length: 9 }, (_, i) => ({ x: (i / 9) * w - 4 + r() * 6, bw: w / 9 + 2 + r() * 6, bh: h * (0.12 + r() * 0.26) }));
    const figureX = w * (0.32 + r() * 0.36);
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
            <defs>
                <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={c.sky[0]} />
                    <stop offset=".55" stopColor={c.sky[1]} />
                    <stop offset="1" stopColor={c.sky[2]} />
                </linearGradient>
                <radialGradient id={`glow${uid}`} cx=".5" cy=".5" r=".5">
                    <stop offset="0" stopColor={c.glow} stopOpacity=".95" />
                    <stop offset="1" stopColor={c.glow} stopOpacity="0" />
                </radialGradient>
                <linearGradient id={`ground${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={c.ground} stopOpacity=".85" />
                    <stop offset="1" stopColor={c.ground} />
                </linearGradient>
            </defs>
            <rect width={w} height={h} fill={`url(#sky${uid})`} />
            <circle cx={moonX} cy={moonY} r={h * 0.34} fill={`url(#glow${uid})`} opacity=".55" />
            <circle cx={moonX} cy={moonY} r={h * (scene === "sky" || scene === "classroom" ? 0.07 : 0.055)} fill={c.glow} opacity=".95" />
            {scene === "sky" &&
                [0, 1, 2].map((i) => (
                    <g key={i} fill="#fff" opacity=".85">
                        <ellipse cx={w * (0.2 + i * 0.3) + r() * 10} cy={h * (0.25 + r() * 0.2)} rx={14 + r() * 10} ry={5 + r() * 3} />
                    </g>
                ))}
            {scene === "sky" && <path d={`M${w * 0.7} ${h * 0.28} l6 -6 l6 6 l-6 8z`} fill="#E8597A" />}
            {scene === "classroom" &&
                [0, 1, 2].map((i) => (
                    <g key={i}>
                        <rect x={w * 0.12 + i * w * 0.27} y={h * 0.12} width={w * 0.2} height={h * 0.38} fill="#FFF8EA" opacity=".85" />
                        <path d={`M${w * 0.12 + i * w * 0.27 + w * 0.1} ${h * 0.12}v${h * 0.38}M${w * 0.12 + i * w * 0.27} ${h * 0.31}h${w * 0.2}`} stroke="#D4AC80" strokeWidth="1" />
                    </g>
                ))}
            {(scene === "harbor" || scene === "rooftop" || scene === "neon" || scene === "station") &&
                buildings.map((b, i) => (
                    <g key={i}>
                        <rect x={b.x} y={horizon - b.bh} width={b.bw} height={b.bh} fill={c.ground} opacity={0.72 + (i % 3) * 0.08} />
                        {Array.from({ length: 4 }, (_, j) => (
                            <rect key={j} x={b.x + 2 + (j % 2) * (b.bw / 2 - 1)} y={horizon - b.bh + 3 + Math.floor(j / 2) * 6} width={1.6} height={2} fill={scene === "neon" && j % 2 ? "#5EE6FF" : c.glow} opacity={r() > 0.45 ? 0.85 : 0.12} />
                        ))}
                    </g>
                ))}
            {scene === "neon" && (
                <>
                    <rect x={w * 0.14} y={horizon - h * 0.3} width={w * 0.1} height={h * 0.07} rx="1" fill="none" stroke="#FF5FA2" strokeWidth="1.2" />
                    <rect x={w * 0.66} y={horizon - h * 0.36} width={w * 0.06} height={h * 0.14} rx="1" fill="none" stroke="#5EE6FF" strokeWidth="1.2" />
                </>
            )}
            {scene === "forest" &&
                Array.from({ length: 11 }, (_, i) => {
                    const x = (i / 10) * w + r() * 8 - 4,
                        th = h * (0.3 + r() * 0.3);
                    return <path key={i} d={`M${x} ${horizon - th} L${x - 9} ${horizon + 2} L${x + 9} ${horizon + 2} Z`} fill={i % 2 ? "#123020" : "#1C4430"} />;
                })}
            {scene === "cafe" && (
                <>
                    <rect x={w * 0.08} y={h * 0.14} width={w * 0.38} height={h * 0.42} fill="#F7C98F" opacity=".25" />
                    <path d={`M${w * 0.27} ${h * 0.14}v${h * 0.42}M${w * 0.08} ${h * 0.35}h${w * 0.38}`} stroke="#3B2418" strokeWidth="1.4" opacity=".6" />
                    <circle cx={w * 0.72} cy={h * 0.2} r={h * 0.05} fill="#FFE2B0" />
                    <path d={`M${w * 0.72} 0v${h * 0.15}`} stroke="#2A1810" strokeWidth=".8" />
                    <path d={`M${w * 0.63} ${horizon - 3} q4 -9 8 0 l2 -5 l2 5 q3 2 0 4 h-12z`} fill="#1A0E08" />
                </>
            )}
            <rect y={horizon} width={w} height={h - horizon} fill={`url(#ground${uid})`} />
            {(scene === "harbor" || scene === "neon" || scene === "station") &&
                Array.from({ length: 7 }, (_, i) => <rect key={i} x={moonX - 10 + r() * 20 - i * 2} y={horizon + 3 + i * 3.2} width={8 + r() * 14} height=".8" fill={c.glow} opacity={0.5 - i * 0.06} />)}
            {scene === "harbor" && <rect x={w * 0.55} y={horizon - 1} width={w * 0.5} height="2.4" fill="#05080F" />}
            {scene === "station" && (
                <>
                    <rect x={-2} y={horizon - h * 0.2} width={w * 0.62} height={h * 0.16} rx="2" fill="#101A28" />
                    {Array.from({ length: 6 }, (_, i) => (
                        <rect key={i} x={3 + i * (w * 0.095)} y={horizon - h * 0.17} width={w * 0.07} height={h * 0.08} fill="#9FE0FF" opacity=".55" />
                    ))}
                </>
            )}
            {(scene === "harbor" || scene === "neon" || scene === "station" || scene === "rooftop") &&
                Array.from({ length: scene === "rooftop" ? 0 : 26 }, (_, i) => <path key={i} d={`M${r() * w} ${r() * h}l-1.4 5`} stroke="#CFE3FF" strokeWidth=".35" opacity=".45" />)}
            <g transform={`translate(${figureX} ${horizon - 1})`} fill="#06060C" opacity=".92">
                <ellipse cx="0" cy={-h * 0.21} rx={h * 0.028} ry={h * 0.034} />
                <path d={`M${-h * 0.045} 0 Q${-h * 0.05} ${-h * 0.15} 0 ${-h * 0.175} Q${h * 0.05} ${-h * 0.15} ${h * 0.045} 0Z`} />
                {scene === "harbor" && <path d={`M${-h * 0.11} ${-h * 0.24} Q0 ${-h * 0.36} ${h * 0.11} ${-h * 0.24}Z`} fill="#E8F1FF" opacity=".35" />}
            </g>
            {scene === "rooftop" && (
                <g transform={`translate(${figureX + h * 0.13} ${horizon - 1})`} fill="#1A0F24" opacity=".9">
                    <ellipse cx="0" cy={-h * 0.23} rx={h * 0.03} ry={h * 0.036} />
                    <path d={`M${-h * 0.05} 0 Q${-h * 0.055} ${-h * 0.16} 0 ${-h * 0.19} Q${h * 0.055} ${-h * 0.16} ${h * 0.05} 0Z`} />
                </g>
            )}
            <rect width={w} height={h} fill="url(#none)" />
        </svg>
    );
}

export function PortraitArt({ index = 0, className, square = false }: { index?: number; className?: string; square?: boolean }) {
    const uid = useId().replace(/:/g, "");
    const p = portraitPalette[index % portraitPalette.length];
    const w = 90,
        h = square ? 90 : 120;
    const cy = h * 0.42;
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
            <defs>
                <linearGradient id={`pbg${uid}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={p.bg[0]} />
                    <stop offset="1" stopColor={p.bg[1]} />
                </linearGradient>
            </defs>
            <rect width={w} height={h} fill={`url(#pbg${uid})`} />
            <circle cx={w * 0.78} cy={h * 0.16} r="14" fill="#fff" opacity=".35" />
            {/* back hair */}
            <path d={`M${w * 0.24} ${cy} Q${w * 0.2} ${cy - 30} ${w / 2} ${cy - 32} Q${w * 0.8} ${cy - 30} ${w * 0.76} ${cy} L${w * 0.8} ${cy + 26} Q${w / 2} ${cy + 34} ${w * 0.2} ${cy + 26}Z`} fill={p.hair} />
            {/* shoulders */}
            <path d={`M${w * 0.06} ${h} Q${w * 0.1} ${cy + 30} ${w / 2} ${cy + 26} Q${w * 0.9} ${cy + 30} ${w * 0.94} ${h}Z`} fill={p.outfit} />
            <path d={`M${w * 0.42} ${cy + 20} h${w * 0.16} v10 q-${w * 0.08} 6 -${w * 0.16} 0z`} fill={p.skin} />
            {/* face */}
            <ellipse cx={w / 2} cy={cy} rx={w * 0.2} ry={w * 0.23} fill={p.skin} />
            {/* bangs */}
            <path
                d={`M${w * 0.29} ${cy - 4} Q${w * 0.3} ${cy - 27} ${w / 2} ${cy - 26} Q${w * 0.72} ${cy - 27} ${w * 0.71} ${cy - 2} Q${w * 0.62} ${cy - 14} ${w * 0.54} ${cy - 12} Q${w * 0.47} ${cy - 18} ${w * 0.4} ${cy - 10} Q${w * 0.34} ${cy - 12} ${w * 0.29} ${cy - 4}Z`}
                fill={p.hair}
            />
            {/* eyes */}
            {[0.42, 0.58].map((x) => (
                <g key={x}>
                    <ellipse cx={w * x} cy={cy + 3} rx="3.1" ry="4" fill="#2A2236" />
                    <circle cx={w * x + 1} cy={cy + 1.6} r="1.1" fill="#fff" />
                </g>
            ))}
            <path d={`M${w * 0.47} ${cy + 12} q${w * 0.03} 2 ${w * 0.06} 0`} stroke="#C2706F" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <ellipse cx={w * 0.37} cy={cy + 9} rx="3.4" ry="1.8" fill="#F29BA8" opacity=".45" />
            <ellipse cx={w * 0.63} cy={cy + 9} rx="3.4" ry="1.8" fill="#F29BA8" opacity=".45" />
        </svg>
    );
}

export function AudioWave({ seed = 1, bars = 28, className }: { seed?: number; bars?: number; className?: string }) {
    const r = rand(seed);
    return (
        <svg viewBox={`0 0 ${bars * 4} 24`} preserveAspectRatio="none" className={className} aria-hidden>
            {Array.from({ length: bars }, (_, i) => {
                const v = 3 + Math.abs(Math.sin(i * 0.6 + seed)) * 14 + r() * 6;
                return <rect key={i} x={i * 4 + 0.6} y={12 - v / 2} width="2.2" height={v} rx="1.1" fill="currentColor" opacity={0.45 + (i % 4) * 0.12} />;
            })}
        </svg>
    );
}
