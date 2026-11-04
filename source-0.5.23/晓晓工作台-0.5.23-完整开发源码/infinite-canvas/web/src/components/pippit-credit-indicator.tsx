"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { workbench } from "@/services/api/workbench";

export function PippitCreditIndicator() {
    const [balance, setBalance] = useState<number | null>(null);
    const [state, setState] = useState<"loading" | "ready" | "error">("loading");
    const refresh = useCallback(() => {
        setState("loading");
        try {
            void workbench().pippitCredits().then((result: { balance: number }) => {
                setBalance(result.balance);
                setState("ready");
            }).catch(() => setState("error"));
        } catch { setState("error"); }
    }, []);
    useEffect(() => {
        refresh();
        window.addEventListener("pippit-credits-changed", refresh);
        return () => window.removeEventListener("pippit-credits-changed", refresh);
    }, [refresh]);
    return <span className="inline-flex min-w-0 items-center gap-1 text-[11px] leading-tight" title="CLI 仅提供账号余额；本次折扣和扣点由小云雀结算，目前无法读取官网实时预估价">
        <span>✦ 余额 {state === "ready" && balance !== null ? balance.toLocaleString() : state === "loading" ? "查询中" : "不可用"}</span>
        <button type="button" aria-label="刷新小云雀积分" title="刷新积分" className="rounded p-0.5 hover:bg-black/5" onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); refresh(); }}><RefreshCw className="size-3" /></button>
        <span className="opacity-60">· 本次扣点待官网结算</span>
    </span>;
}
