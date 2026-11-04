"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Cpu } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useAutoDLWorkflowNames } from "@/hooks/use-autodl-workflow";
import { isWorkflowProtocol } from "@/lib/model-channel";
import { cn } from "@/lib/utils";
import { workbench } from "@/services/api/workbench";
import { fetchPippitModels } from "@/services/api/pippit";
import type { WorkflowRef } from "@/lib/workflow-channel";
import { filterModelsByCapability, normalizeLocalChannels, useConfigStore, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    channelId?: string;
    capability?: ModelCapability;
    onChange: (model: string, channelId?: string) => void;
    workflowRef?: WorkflowRef;
    onWorkflowChange?: (ref?: WorkflowRef) => void;
    className?: string;
    fullWidth?: boolean;
    selectedLabel?: string;
    placeholder?: string;
    onMissingConfig?: () => void;
};

type PickerBase = { key: string; channelId?: string; channelName: string; protocol?: string; baseUrl?: string };
type PickerOption = (PickerBase & { model: string }) | (PickerBase & { model: ""; workflowRef: WorkflowRef; label: string });

export function ModelPicker({ config, value, channelId, capability, onChange, workflowRef, onWorkflowChange, className, fullWidth = false, selectedLabel, placeholder = "选择模型", onMissingConfig }: ModelPickerProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const [pippitBalance, setPippitBalance] = useState<number | null>(null);
    const [balanceState, setBalanceState] = useState<"loading" | "ready" | "unavailable">("loading");
    const [modelSyncState, setModelSyncState] = useState<"idle" | "loading" | "error">("idle");
    const token = useUserStore((state) => state.token);
    const userReady = useUserStore((state) => state.isReady);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const setPippitCatalog = useConfigStore((state) => state.setPippitCatalog);
    const pippitMedia = config.generationProvider === "pippit" && capability !== "text";
    useEffect(() => {
        if (!open || !pippitMedia) return;
        let active = true;
        Promise.resolve().then(() => workbench().pippitCredits()).then((result: { balance: number }) => {
            if (active) { setPippitBalance(result.balance); setBalanceState("ready"); }
        }).catch(() => { if (active) setBalanceState("unavailable"); });
        return () => { active = false; };
    }, [open, pippitMedia]);
    const workflowEnabled = Boolean(!pippitMedia && onWorkflowChange && capability && capability !== "text");
    const channelOptions = useMemo<PickerOption[]>(() => {
        const channels =
            config.channelMode === "remote" && !pippitMedia
                ? config.publicChannels.map((channel) => ({ id: channel.id, protocol: channel.protocol, name: channel.name || "云端渠道", baseUrl: channel.baseUrl, models: channel.models, modelCapabilities: undefined, workflows: channel.workflows || [] }))
                : normalizeLocalChannels(config).map((channel) => ({ id: channel.id, protocol: channel.protocol, name: channel.name || "本地渠道", baseUrl: channel.baseUrl, models: channel.models, modelCapabilities: channel.modelCapabilities, workflows: channel.workflowSummaries || [] }));
        const models = channels.filter(channel => !isWorkflowProtocol(channel.protocol || "") && (pippitMedia ? channel.protocol === "pippit-cli" : config.generationProvider === "other" ? channel.protocol !== "pippit-cli" : true)).flatMap((channel) => (channel.models ?? []).map((model) => ({ key: `${channel.id}::${model}`, channelId: channel.id, channelName: channel.name, protocol: channel.protocol, baseUrl: channel.baseUrl, model, modelCapabilities: channel.modelCapabilities })));
        const scoped=capability==="video"&&config.generationProvider==="other"&&config.otherVideoChannelId?models.filter(item=>item.channelId===config.otherVideoChannelId):models;
        const filtered = capability ? scoped.filter((item) => (item.protocol === "pippit-cli" || item.protocol === "dreamina-cli" || item.protocol === "oiioii-cli") ? item.modelCapabilities?.[item.model] === capability : filterModelsByCapability([item.model], capability, item.protocol || "").length > 0) : scoped;
        if (!workflowEnabled || !token) return filtered;
        const scope = config.channelMode === "remote" ? "system" : "personal";
        return [...filtered, ...channels.flatMap((channel) => isWorkflowProtocol(channel.protocol || "") ? channel.workflows.filter((entry) => entry.enabled && entry.capability === capability && entry.provider === channel.protocol).map((entry) => {
            const ref: WorkflowRef = { scope, channelId: channel.id || "", kind: entry.kind, workflowId: entry.workflowId };
            return { key: `workflow:${JSON.stringify([ref.scope, ref.channelId, ref.kind, ref.workflowId])}`, channelId: channel.id, channelName: channel.name, protocol: channel.protocol, baseUrl: channel.baseUrl, model: "", workflowRef: ref, label: entry.title || entry.workflowId };
        }) : [])];
    }, [capability, config, token, workflowEnabled, pippitMedia]);
    const modelLabel = useAutoDLWorkflowNames(channelOptions);
    const displayModel=(model:string,option?:PickerOption)=>model==="seedance_2.5_draft"&&option?.channelId==="local-dreamina-canvas"?"Seedance 2.5 样片版":model==="seedance_pro_fast"&&option?.channelId==="local-dreamina-canvas"?"Seedance 1.0 快速版":modelLabel(model,option);
    const currentOption = useMemo(() => {
        if (workflowRef && workflowEnabled) return channelOptions.find((item) => "workflowRef" in item && item.key === `workflow:${JSON.stringify([workflowRef.scope, workflowRef.channelId, workflowRef.kind, workflowRef.workflowId])}`);
        if (pippitMedia && !channelOptions.some(item => item.model === value)) return channelOptions.find(item => item.model === (capability === "image" ? config.imageModel : config.videoModel));
        if (!value) return undefined;
        return channelOptions.find((item) => item.model === value && item.channelId === channelId) || channelOptions.find((item) => item.model === value);
    }, [channelId, channelOptions, value, workflowEnabled, workflowRef, pippitMedia, capability, config.imageModel, config.videoModel]);
    const options = channelOptions;
    const current = pippitMedia ? currentOption?.model || "" : workflowRef && workflowEnabled ? (currentOption && "label" in currentOption && typeof currentOption.label === "string" ? currentOption.label : "") : (currentOption || config.channelMode !== "remote" ? value || "" : "");
    const currentValue = current && currentOption ? currentOption.key : "";

	useEffect(() => {
		if (workflowRef && workflowEnabled) {
			const workflowOptionsReady = workflowRef.scope === "system"
				? publicSettings !== null
				: config.workflowSyncTouched === true;
			if (token && userReady && workflowOptionsReady && !currentOption && channelOptions.some((item) => !("workflowRef" in item))) {
				onWorkflowChange?.(undefined);
            }
            return;
        }
        if (!pippitMedia && value && currentOption?.channelId && !("workflowRef" in currentOption) && channelId !== currentOption.channelId) onChange(value, currentOption.channelId);
	}, [channelId, channelOptions, config.workflowSyncTouched, currentOption, onChange, onWorkflowChange, publicSettings, token, userReady, value, workflowEnabled, workflowRef, pippitMedia]);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={current ? currentValue : ""}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length && config.channelMode === "local") {
                    onMissingConfig?.();
                    return;
                }
                if (nextOpen) { setBalanceState("loading"); window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId })); }
                setOpen(nextOpen);
            }}
            onValueChange={(nextValue) => {
                const option = options.find((item) => item.key === nextValue);
                if (!option) return;
                if ("workflowRef" in option) onWorkflowChange?.(option.workflowRef);
                else { onChange(option.model, option.channelId); if (workflowRef) onWorkflowChange?.(undefined); }
            }}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full gap-1.5 rounded-full border border-input bg-transparent px-2.5 text-sm font-normal shadow-sm transition-colors",
                    fullWidth ? "w-full min-w-0 justify-start" : "w-fit min-w-0 justify-start",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={workflowRef && workflowEnabled && !currentOption ? "工作流已停用、未公开或删除，请重新选择" : current || placeholder}
            >
                <ModelIcon model={current} />
                <span className={cn("canvas-model-picker-text min-w-0 truncate text-left", fullWidth ? "flex-1" : "shrink")}>{workflowRef && workflowEnabled ? current || "工作流已停用、未公开或删除，请重新选择" : selectedLabel || displayModel(current, currentOption) || placeholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className="z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {pippitMedia ? <div role="status" className="px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-2"><span>小云雀当前积分：{balanceState === "ready" && pippitBalance !== null ? pippitBalance.toLocaleString() : balanceState === "loading" ? "查询中…" : "暂时无法获取"}</span><button type="button" className="shrink-0 underline" disabled={modelSyncState === "loading"} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setModelSyncState("loading"); void fetchPippitModels().then(setPippitCatalog).then(() => setModelSyncState("idle")).catch(() => setModelSyncState("error")); }}>{modelSyncState === "loading" ? "同步中…" : "刷新模型"}</button></div>
                    <div>本次扣点：CLI 暂无实时预估；以小云雀实际结算为准。</div>
                    {modelSyncState === "error" ? <div>模型同步失败，请检查小云雀登录后重试。</div> : null}
                </div> : null}
                {options.length ? (
                    options.map((option) => (
                        <SelectItem key={option.key} value={option.key} textValue={`${"workflowRef" in option ? option.label : displayModel(option.model, option)} ${option.model} ${option.channelName}`}>
                            <ModelLabel model={"workflowRef" in option ? option.workflowRef.workflowId : option.model} label={"workflowRef" in option ? `工作流 · ${option.label}` : option.model.endsWith("_draft") ? `${option.model} · 480P样片` : displayModel(option.model, option)} channelName={option.channelName} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty__" disabled>
                        {config.channelMode === "remote" ? "暂无可用模型" : "请先到配置里拉取模型列表"}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function ModelLabel({ model, label, channelName }: { model: string; label?: string; channelName?: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate" title={model}>{label || model}</span>
            {channelName ? <span className="ml-auto max-w-24 shrink-0 truncate text-xs opacity-50">{channelName}</span> : null}
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(model);
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
