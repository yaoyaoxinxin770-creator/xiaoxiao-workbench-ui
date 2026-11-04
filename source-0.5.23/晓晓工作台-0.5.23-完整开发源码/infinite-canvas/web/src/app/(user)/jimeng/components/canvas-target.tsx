"use client";

import { useEffect, useState } from "react";
import { App, Button, Select } from "antd";
import { Plus, RefreshCw } from "lucide-react";
import { workbench } from "@/services/api/workbench";

export function CanvasTarget({ busy }: { busy: boolean }) {
    const { message } = App.useApp();
    const [targets, setTargets] = useState<any[]>([]);
    const [selected, setSelected] = useState("");
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<any>({});
    const [note, setNote] = useState("刷新列表，选择已打开的即梦画布");
    const refresh = async () => {
        setLoading(true);
        try {
            const api = workbench();
            const settings = await api.cdpSettings(); setConfig(settings);
            const items = await api.cdpTargets(); setTargets(items); setSelected(settings.targetId || "");
            setNote(settings.mode === "extension" ? "正在使用扩展连接；选择画布会切换为直连" : items.length ? "选择本次发送的目标画布" : "没有找到画布，请先打开即梦专用浏览器；普通浏览器标签不会出现在此列表。");
        } catch (err: any) { setNote(err.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (busy || loading) return;
        let alive = true;
        const timer = setInterval(() => { workbench().cdpSettings().then(settings => { if (alive && settings.targetId !== selected) refresh(); }).catch(() => {}); }, 3000);
        return () => { alive = false; clearInterval(timer); };
    }, [busy, loading, selected]); // eslint-disable-line react-hooks/exhaustive-deps
    const connect = async (id: string) => {
        if (busy || loading) return;
        setLoading(true);
        try {
            await workbench().cdpConfigure({ mode: "cdp", port: config.port || 9333, targetId: id });
            setSelected(id);
            const status = await workbench().connectorStatus();
            setNote(status.online ? "已连接：" + (status.connector?.url || "即梦画布") : status.error || "画布尚未就绪");
            if (!status.online) message.warning(status.error || "画布尚未就绪");
        } catch (err: any) { message.error(err.message); setNote(err.message); }
        finally { setLoading(false); }
    };
    const openNew = async () => {
        setLoading(true);
        try {
            await workbench().cdpLaunch({ newCanvas: true });
            setNote("已打开即梦新建入口。在官网创建画布后，回来刷新列表并选择；当前目标未变更。");
            message.info("在即梦创建新画布后，返回刷新列表即可选择。");
        } catch (err: any) { message.error(err.message); }
        finally { setLoading(false); }
    };
    const target = targets.find(item => item.id === selected);
    return <div className="mx-4 mt-2 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2" data-testid="canvas-target">
        <b className="text-xs">目标画布</b>
        <Select aria-label="目标即梦画布" className="min-w-48 max-w-full flex-1 md:max-w-lg" size="small" placeholder="请选择已打开的画布" value={targets.some(item => item.id === selected) ? selected : undefined} disabled={busy || loading} onChange={connect} options={targets.map(item => ({ value:item.id,label:(item.title || "即梦画布") + " · " + item.url.split("/").pop() }))} />
        <Button size="small" icon={<RefreshCw className="size-3" />} disabled={busy} loading={loading} onClick={refresh}>刷新画布列表</Button>
        <Button size="small" icon={<Plus className="size-3" />} disabled={busy || loading} onClick={openNew}>打开新建入口</Button>
        <p className="w-full break-all text-xs text-muted-foreground">{target ? "本次目标：" + target.title + " · " + target.url + "。" : ""}{note}{busy ? " · 执行中已锁定目标" : ""}</p>
    </div>;
}
