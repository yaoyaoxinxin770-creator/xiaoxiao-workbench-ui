"use client";

import { Input } from "antd";

import { useTypetaleStore } from "../stores/use-typetale-store";

export function CliPanel() {
    const store = useTypetaleStore.getState();
    const provider = useTypetaleStore((s) => s.state.providers.find((p: any) => p.id === s.state.activeProviderId) || s.state.providers[0]);

    return (
        <div>
            <label className="mb-3 block">
                <span className="mb-1 block text-xs text-muted-foreground">CLI 命令</span>
                <Input
                    size="small"
                    value={provider?.command || ""}
                    data-testid="typetale-cli-command"
                    placeholder="例如 C:\Tools\ai.exe"
                    onChange={(e) => store.saveProvider({ command: e.target.value, type: "cli" })}
                />
            </label>
            <label className="mb-3 block">
                <span className="mb-1 block text-xs text-muted-foreground">参数模板</span>
                <Input
                    size="small"
                    value={(provider?.argsTemplate || []).join("|")}
                    placeholder="用 | 分隔；支持 {prompt} {shotId}"
                    onChange={(e) => store.saveProvider({ argsTemplate: e.target.value.split("|").map((item: string) => item.trim()).filter(Boolean) })}
                />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">提交分镜时会用当前提示词、分镜编号、参考图路径替换模板变量。</p>
        </div>
    );
}
