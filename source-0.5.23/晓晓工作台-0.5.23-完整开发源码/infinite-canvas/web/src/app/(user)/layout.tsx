"use client";

import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

const VideoPage = lazy(() => import("./video/page"));
import { AppNavigation } from "@/components/layout/app-navigation";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { PersonalWorkbenchHost } from "@/components/layout/personal-workbench-host";
import { fetchUserConfig } from "@/services/api/user-config";
import { useUserStore } from "@/stores/use-user-store";

const protectedPrefixes = ["/asset-library"];

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [pendingNavigation,setPendingNavigation]=useState<string|null>(null);
    useLayoutEffect(()=>{
        if(!pendingNavigation)return;
        const target=new URL(pendingNavigation,window.location.origin);
        if(pathname!==target.pathname)return;
        // Cached route shells can restore their earlier search string. Apply the
        // requested project after the destination shell commits.
        if(window.location.pathname+window.location.search!==pendingNavigation) window.history.replaceState(null,"",pendingNavigation);
        setPendingNavigation(null);
    },[pathname,pendingNavigation]);
    const [videoStarted, setVideoStarted] = useState(false);
    useEffect(() => { if(pathname === "/video") setVideoStarted(true); }, [pathname]);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const wasLoggedOutRef = useRef(false);
    const isProtectedPage = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

    useEffect(() => {
        if (!isReady || !isProtectedPage || user) return;
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }, [isProtectedPage, isReady, pathname, router, user]);

    useEffect(() => {
        if (!isReady) return;
        if (!user) {
            wasLoggedOutRef.current = true;
            return;
        }
        const syncCanvasAfterLogin = wasLoggedOutRef.current;
        const token = useUserStore.getState().token;
        if (!token) return;
        wasLoggedOutRef.current = false;
        fetchUserConfig(token).then(async (config) => {
            const syncEnabled = config.syncCapabilities?.userData === true;
            const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
            const canvasStore = useCanvasStore.getState();
            canvasStore.setSyncEnabled(syncEnabled);
            if (
                syncCanvasAfterLogin &&
                syncEnabled &&
                canvasStore.hydrated
            ) {
                void canvasStore.syncWithRemote(token, true);
            }
            const { useAssetStore } = await import("@/stores/use-asset-store");
            void useAssetStore.getState().hydrateAccountAssets(token, syncEnabled);
        }).catch(() => { });
    }, [isReady, user]);

    useEffect(() => {
        const navigate = (event: Event) => {
            const target = (event as CustomEvent<string>).detail;
            const url = new URL(target,window.location.origin);
            if (url.origin===window.location.origin && ["/projects", "/jimeng", "/typetale", "/video"].includes(url.pathname)) {
                // Project selection changes the query only. Native history updates
                // search params without starting another route/server transition.
                if(url.pathname===window.location.pathname) {setPendingNavigation(null);window.history.pushState(null,"",url.pathname+url.search);}
                else {setPendingNavigation(url.pathname+url.search);router.push(url.pathname+url.search); }
            }
        };
        window.addEventListener("xiaoxiao:navigate", navigate);
        return () => window.removeEventListener("xiaoxiao:navigate", navigate);
    }, [router]);

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <Suspense fallback={<div className="h-20 shrink-0" />}><AppTopNav /></Suspense>
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <AppNavigation/>
                <div className="min-w-0 flex-1 overflow-hidden">
                <div className="h-full" hidden={pathname === "/video"}>{isProtectedPage && (!isReady || !user) || pathname === "/video" ? null : children}</div>
                {videoStarted && <div className="h-full" hidden={pathname !== "/video"}><Suspense fallback={<div className="p-4">正在打开视频创作台…</div>}><VideoPage /></Suspense></div>}
                <Suspense fallback={null}><PersonalWorkbenchHost /></Suspense>
                </div>
            </div>
        </div>
    );
}
