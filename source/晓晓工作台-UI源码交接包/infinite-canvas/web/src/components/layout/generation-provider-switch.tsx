"use client";
import { useConfigStore } from "@/stores/use-config-store";

export function GenerationProviderSwitch() {
    const provider = useConfigStore(state => state.generationProvider);
    const setProvider = useConfigStore(state => state.setGenerationProvider);
    return <div className="inline-flex items-center gap-2 text-xs" role="group" aria-label="生成渠道">
        {([{value: "pippit", label: "小云雀"}, {value: "other", label: "其他渠道"}] as const).map(option =>
            <button key={option.value} type="button" aria-pressed={provider === option.value} onClick={() => setProvider(option.value)}
                className="px-1 py-1 transition hover:opacity-100" style={{color: "inherit", opacity: provider === option.value ? 1 : 0.5, fontWeight: provider === option.value ? 600 : 400}}>
                {option.label}
            </button>)}
    </div>;
}
