import type { Metadata } from "next";
import Script from "next/script";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AppProviders } from "@/components/layout/app-providers";
import "antd/dist/reset.css";
import "./globals.css";
import React from "react";

export const metadata: Metadata = {
    title: "晓晓工作台 · 无限画布",
    description: "一个无限画布创作工具",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN" suppressHydrationWarning className="font-sans">
            <body
                className="bg-background text-foreground antialiased"
                style={{
                    fontFamily: '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif',
                }}
            >
                <Script
                    id="theme-script"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `try{var s=JSON.parse(localStorage.getItem("infinite-canvas:theme_store")||"{}");var t=s.version===1&&s.state&&s.state.theme==="dark"?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t;document.documentElement.dataset.skin=s.state&&s.state.skin==="neutral"?"neutral":"pink"}catch(e){}`,
                    }}
                />
                <AntdRegistry>
                    <AppProviders>{children}</AppProviders>
                </AntdRegistry>
            </body>
        </html>
    );
}
