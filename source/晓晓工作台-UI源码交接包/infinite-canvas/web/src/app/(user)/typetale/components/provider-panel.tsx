"use client";

import { useMemo } from "react";
import { Button, Input, Select } from "antd";
import { Plus } from "lucide-react";

import { useTypetaleStore } from "../stores/use-typetale-store";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="mb-3 block"><span className="mb-1 block text-xs text-muted-foreground">{label}</span>{children}</label>;
}

export function ProviderPanel() {
    const state = useTypetaleStore((s) => s.state);
    const core = useTypetaleStore((s) => s.core);
    const store = useTypetaleStore.getState();
    const provider = store.activeProvider() || (core ? core.normalizeProvider({ name: "通用视频 API" }) : null);
    const families: any = core?.modelFamily;

    const familyData = useMemo(() => {
        if (!core || !provider) return { list: [], resolved: null as any, note: "" };
        const kind = families.safeKind(provider.kind);
        const overrides = core.normalizeFamilyOverrides(state.familyOverrides)[kind] || {};
        const list = families.listFamilies(kind, overrides);
        const resolved = core.resolveFamily(provider, state.familyOverrides);
        const limits = families.familyLimits(resolved);
        const limitText = families.limitKeysFor(kind)
            .map((key: string) => `${({ images: "参考图", videos: "参考视频", audios: "参考音频" } as Record<string, string>)[key]} ${limits[key] === null ? "不限" : limits[key]}`)
            .join(" · ");
        const chip = resolved.expand_chips ? families.chipToken(resolved, "image", 1) : "保持 @实体名 原文";
        const note = `${provider.modelFamily ? "已手动选择" : `按模型名推断为 ${resolved.name}`} · chip：${chip} · ${limitText}${resolved.note ? ` · ${resolved.note}` : ""}`;
        return { list, resolved, note };
    }, [core, families, provider, state.familyOverrides]);

    if (!provider) return null;

    const save = (patch: Record<string, any>) => store.saveProvider({ ...provider, ...patch });
    const familyOptions = familyData.list.map((family: any) => ({
        value: family.id,
        label: `${family.name}${[family.builtin ? "" : "自建", family.modified ? "已修改" : ""].filter(Boolean).length ? `（${[family.builtin ? "" : "自建", family.modified ? "已修改" : ""].filter(Boolean).join(" · ")}）` : ""}`,
    }));

    return (
        <div>
            <Field label="当前通道">
                <div className="flex gap-1.5">
                    <Select
                        size="small"
                        className="flex-1"
                        value={state.providers.some((item: any) => item.id === provider.id) ? provider.id : undefined}
                        placeholder="未配置通道"
                        options={state.providers.map((item: any) => ({ value: item.id, label: item.name }))}
                        onChange={store.setActiveProvider}
                    />
                    <Button size="small" icon={<Plus className="size-3.5" />} aria-label="新增通道" onClick={store.addProvider} />
                </div>
            </Field>
            <Field label="名称"><Input size="small" value={provider.name} onChange={(e) => save({ name: e.target.value || "未命名通道" })} /></Field>
            <Field label="类型">
                <Select size="small" className="w-full" value={provider.type} onChange={(v) => save({ type: v })} options={[
                    { value: "generic-video", label: "通用视频 API" },
                    { value: "typetale-plugin", label: "字字动画插件" },
                    { value: "cli", label: "网站 CLI" },
                ]} />
            </Field>
            <Field label="Base URL"><Input size="small" value={provider.baseUrl} placeholder="https://api.example.com" onChange={(e) => save({ baseUrl: e.target.value })} /></Field>
            <Field label="API Key"><Input.Password size="small" value={provider.apiKey} placeholder="只保存在本地工作区" onChange={(e) => save({ apiKey: e.target.value })} /></Field>
            <Field label="模型"><Input size="small" value={provider.model} placeholder="模型名" onChange={(e) => save({ model: e.target.value })} /></Field>
            <Field label="模型类型">
                <Select
                    size="small"
                    className="w-full"
                    value={provider.kind}
                    data-testid="typetale-provider-kind"
                    options={[{ value: "video", label: "视频模型" }, { value: "image", label: "图片模型" }]}
                    onChange={(v) => save({ kind: v, modelFamily: "" })}
                />
            </Field>
            <Field label="模型族">
                <Select
                    size="small"
                    className="w-full"
                    value={provider.modelFamily || familyData.resolved?.id}
                    data-testid="typetale-provider-family"
                    options={familyOptions}
                    onChange={(v) => save({ modelFamily: v })}
                />
                <small className="mt-1 block text-xs text-muted-foreground">{familyData.note || "族决定 @素材 展开成什么 token、参考前缀怎么出、最多带几张素材。"}</small>
            </Field>
            <Field label="参数">
                <div className="flex gap-1.5">
                    <Input size="small" value={provider.duration} placeholder="时长" onChange={(e) => save({ duration: e.target.value })} />
                    <Input size="small" value={provider.aspectRatio} placeholder="比例" onChange={(e) => save({ aspectRatio: e.target.value })} />
                    <Input size="small" value={provider.resolution} placeholder="分辨率" onChange={(e) => save({ resolution: e.target.value })} />
                </div>
            </Field>
            <Field label="参考图">
                <Select size="small" className="w-full" value={provider.referenceMode} onChange={(v) => save({ referenceMode: v })} options={[
                    { value: "paths", label: "本地路径" },
                    { value: "data_url", label: "Data URL" },
                    { value: "url", label: "URL" },
                    { value: "none", label: "不带参考图" },
                ]} />
            </Field>
            <Field label="插件目录">
                <Input size="small" value={provider.pluginPath || provider.pluginName || ""} data-testid="typetale-provider-plugin" placeholder="选择 plugins 目录或单个插件目录" onChange={(e) => save({ pluginPath: e.target.value, type: "typetale-plugin" })} />
            </Field>
            <Field label="CLI 命令"><Input size="small" value={provider.command} data-testid="typetale-provider-command" placeholder="例如 C:\\Tools\\ai.exe" onChange={(e) => save({ command: e.target.value })} /></Field>
            <Field label="参数模板"><Input size="small" value={(provider.argsTemplate || []).join("|")} placeholder="用 | 分隔；支持 {prompt} {shotId}" onChange={(e) => save({ argsTemplate: e.target.value.split("|").map((item: string) => item.trim()).filter(Boolean) })} /></Field>
            <Button size="small" type="primary" onClick={() => save({})}>保存通道</Button>
        </div>
    );
}
