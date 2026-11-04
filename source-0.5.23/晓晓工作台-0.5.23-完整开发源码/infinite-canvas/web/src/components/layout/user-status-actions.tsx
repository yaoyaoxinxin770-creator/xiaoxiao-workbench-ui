"use client";

import type { CSSProperties, RefObject } from "react";
import { Avatar, Dropdown, Tooltip } from "antd";
import { Keyboard, LogOut, Palette, RotateCw, Settings2, Shield } from "lucide-react";
import type { ItemType } from "antd/es/menu/interface";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {DreaminaVideoChannel} from "./dreamina-channel-controls";

import { GenerationProviderSwitch } from "./generation-provider-switch";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { CreditSymbol } from "@/constant/credits";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    accountOnly?:boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    accountOpen?: boolean;
    onAccountOpenChange?: (open: boolean) => void;
    accountRef?: RefObject<HTMLDivElement | null>;
    getPopupContainer?: (node: HTMLElement) => HTMLElement;
};

export function UserStatusActions({ showConfig = true, accountOnly = false, variant = "default", onOpenShortcuts, accountOpen, onAccountOpenChange, accountRef, getPopupContainer }: UserStatusActionsProps) {
    const videoPage = usePathname() === "/video";
    const theme = useThemeStore((state) => state.theme);
    const skin = useThemeStore(state=>state.skin);
    const setSkin = useThemeStore(state=>state.setSkin);
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.clearSession);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const userName = user?.displayName || user?.username || "";
    const credits = user?.credits ?? 0;
    const avatarUrl = user?.avatarUrl?.trim();
    const avatarText = (userName.trim()[0] || "U").toUpperCase();
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;
    const avatarStyle: CSSProperties | undefined = variant === "canvas" ? { borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text, background: "transparent" } : undefined;
    const menuItems: ItemType[] = [
        { key: "user", disabled: true, label: <span className="font-medium text-current">{userName}</span> },
        ...(user?.role === "admin" ? [{ key: "admin", icon: <Shield className="size-4" />, label: <Link href="/admin">管理后台</Link> }] : []),
        ...(onOpenShortcuts ? [{ key: "shortcuts", icon: <Keyboard className="size-4" />, label: "快捷键", onClick: onOpenShortcuts }] : []),
        { type: "divider" },
        { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录", onClick: logout },
    ];

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {!accountOnly&&showConfig ? videoPage ? <DreaminaVideoChannel /> : <GenerationProviderSwitch /> : null}
            {!accountOnly&&showConfig&&!videoPage ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            {!accountOnly&&<><button type="button" className={naturalIconClass} style={iconStyle} aria-label="刷新界面" title="刷新界面 (F5)"
                onClick={() => { try { sessionStorage.setItem("xiaoxiao:allow-reload", "1"); } catch {} location.reload(); }}>
                <RotateCw className="size-4" />
            </button>
            <Dropdown
                trigger={["click"]}
                menu={{
                    selectedKeys: [skin === "comic" ? "comic" : theme === "dark" ? "dark" : skin === "neutral" ? "light" : "pink"],
                    items: [
                        { key: "pink", label: <span className="inline-flex items-center gap-2" title="柔粉精修 · 默认"><span className="size-2.5 rounded-full bg-[#C93663]" /><span>暖樱粉</span></span> },
                        { key: "light", label: <span className="inline-flex items-center gap-2" title="雾白工作室 · 中性灰 + 靛蓝"><span className="size-2.5 rounded-full border border-slate-300 bg-[linear-gradient(135deg,#F5F5F6_50%,#5B5BD6_50%)]" /><span>云母白</span></span> },
                        { key: "dark", label: <span className="inline-flex items-center gap-2" title="胭脂墨黑 · 胭脂粉 × 墨黑撞色"><span className="size-2.5 rounded-full bg-[linear-gradient(135deg,#000000_50%,#FF7CA2_50%)] ring-1 ring-[#FF7CA2]/60" /><span>影视暗房</span></span> },
                        { key: "comic", label: <span className="inline-flex items-center gap-2" title="漫画分镜 · 墨线 + 番茄红"><span className="size-2.5 rounded-full bg-[#E8452C] ring-1 ring-[#1B1A17]" /><span>漫画分镜</span></span> },
                    ],
                    onClick: ({ key }) => setSkin(key === "pink" ? "pink" : key === "comic" ? "comic" : "neutral", key === "dark" ? "dark" : "light"),
                }}
            >
                <button type="button" className={naturalIconClass} style={iconStyle} aria-label="切换工作台皮肤" title="切换工作台皮肤（暖樱粉 / 云母白 / 影视暗房 / 漫画分镜）">
                    <Palette className="size-4" />
                </button>
            </Dropdown>
            </>}
            {(accountOnly||variant==="canvas")&&<><VersionReleaseModal style={versionStyle} />
            <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} />
            {variant === "canvas" && user ? (
                <Tooltip title="当前算力点余额" placement="bottom">
                    <div className="flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-xs font-medium tabular-nums opacity-75 transition hover:opacity-100" style={{ color: canvasTheme.node.text }}>
                        <CreditSymbol className="text-sm leading-none" />
                        <span>{credits.toLocaleString()}</span>
                    </div>
                </Tooltip>
            ) : null}
            {!user && onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {!user ? (
                <Link href="/login" className="px-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline" style={iconStyle}>
                    登录
                </Link>
            ) : null}
            {user ? (
                <div ref={accountRef}>
                    <Dropdown open={accountOpen} onOpenChange={onAccountOpenChange} trigger={["click"]} placement="bottomRight" getPopupContainer={getPopupContainer} styles={{ root: { minWidth: 150 } }} menu={{ items: menuItems }}>
                        <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-[0] leading-[0] transition" aria-label="账户菜单">
                            <Avatar
                                size={24}
                                src={avatarUrl ? <img src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined}
                                alt={userName}
                                className="!flex !items-center !justify-center border border-border bg-transparent text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-foreground"
                                style={avatarStyle}
                            >
                                {avatarText}
                            </Avatar>
                        </button>
                    </Dropdown>
                </div>
            ) : null}</>}
        </div>
    );
}
