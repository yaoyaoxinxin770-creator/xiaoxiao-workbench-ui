import {loadAgentSettings} from "@/lib/agent-settings";
import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { jsonrepair } from "jsonrepair";

export const runtime = "nodejs";
export const maxDuration = 180;

const joinPath = (...parts: string[]) => parts.filter(Boolean).join(path.sep);

function resolveCodexBinary(): { bin: string; isCmd: boolean } {
    const candidates: string[] = [];
    const localAppData = process.env.LOCALAPPDATA || joinPath(os.homedir(), "AppData", "Local");
    const codexBinRoot = joinPath(localAppData, "OpenAI", "Codex", "bin");
    try {
        if (fs.existsSync(codexBinRoot)) {
            const dirs = fs
                .readdirSync(codexBinRoot, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => joinPath(codexBinRoot, d.name, "codex.exe"))
                .filter(p => fs.existsSync(p))
                .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
            candidates.push(...dirs);
        }
    } catch {
        // ignore
    }
    try {
        const cfgPath = joinPath(os.homedir(), ".codex", "config.toml");
        if (fs.existsSync(cfgPath)) {
            const cfg = fs.readFileSync(cfgPath, "utf8");
            const match = cfg.match(/CODEX_CLI_PATH\s*=\s*['"]([^'"]+)['"]/);
            if (match?.[1] && fs.existsSync(match[1])) candidates.push(match[1]);
        }
    } catch {
        // ignore
    }
    const fixedPaths = [
        "F:\\KimiData\\daimon-share\\daimon\\npm-global\\codex.cmd",
        joinPath(process.env.APPDATA || "", "npm", "codex.cmd"),
    ];
    for (const p of fixedPaths) {
        if (p && fs.existsSync(p)) candidates.push(p);
    }
    const chosen = candidates[0] || "codex";
    return { bin: chosen, isCmd: chosen.toLowerCase().endsWith(".cmd") || chosen === "codex" };
}

function resolveWorkDir(): string {
    const preferred = "F:\\RuanJian\\codex";
    try {
        if (fs.existsSync(preferred)) return preferred;
    } catch {
        // ignore
    }
    return os.tmpdir();
}

function extractAgentJson(raw: string): {
    summary: string;
    changes: string[];
    prompt: string;
    params?: { seconds?: string; size?: string; resolution?: string; model?: string };
} {
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
            const parsed = JSON.parse(jsonrepair(candidate.slice(firstBrace, lastBrace + 1)));
            if (parsed && typeof parsed === "object" && typeof parsed.prompt === "string" && parsed.prompt.trim() && parsed.prompt.length <= 250000) {
                const params: Record<string, string> = {};
                for (const [key, pattern] of Object.entries({ seconds: /^[1-9]\d{0,2}$/, size: /^(?:adaptive|[1-9]\d?:[1-9]\d?)$/, resolution: /^\d{3,4}p$/i, model: /^[a-z0-9_.:/-]{1,100}$/i })) {
                    const value = parsed.params?.[key];
                    if (value === undefined || value === '') continue;
                    if (typeof value !== 'string' || !pattern.test(value)) throw Error('无效参数');
                    params[key] = value;
                }
                return {
                    summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : "已按你的要求完成视频提示词修改。",
                    changes: Array.isArray(parsed.changes) ? parsed.changes.map(String).filter(Boolean) : [],
                    prompt: parsed.prompt.trim(),
                    params: Object.keys(params).length ? params : undefined,
                };
            }
        } catch {
            // fallback below
        }
    }
    throw Error("模型返回格式不完整，未修改原提示词，请重试");
}

function getAvailableCodexModels(): { slug: string; name: string }[] {
    try {
        const cacheFile = joinPath(os.homedir(), ".codex", "models_cache.json");
        if (fs.existsSync(cacheFile)) {
            const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
            if (Array.isArray(data.models)) {
                return data.models.map((m: any) => ({ slug: m.slug, name: m.display_name || m.slug }));
            }
        }
    } catch {
        // ignore
    }
    return [
        { slug: "gpt-6.1-sol", name: "GPT-6.1-Sol" },
        { slug: "gpt-6-astra", name: "GPT-6-Astra" },
        { slug: "gpt-6.1-terra", name: "GPT-6.1 Terra" },
        { slug: "gpt-6-sol", name: "GPT-6-Sol" },
        { slug: "gpt-reserve", name: "GPT-Reserve" },
        { slug: "gpt-6-luna", name: "GPT-6-Luna" },
        { slug: "gpt-5.6-sol", name: "GPT-5.6-Sol" },
        { slug: "gpt-5.6-terra", name: "GPT-5.6-Terra" },
        { slug: "gpt-5.6-luna", name: "GPT-5.6-Luna" },
    ];
}

export async function GET() {
    const { bin } = resolveCodexBinary();
    const authFile = joinPath(os.homedir(), ".codex", "auth.json");
    const hasAuth = fs.existsSync(authFile);
    const models = getAvailableCodexModels();
    return NextResponse.json({
        ok: true,
        available: Boolean(bin),
        authenticated: hasAuth,
        binary: path.basename(bin),
        models,
        source: "Codex 本机额度",
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const instruction = String(body?.instruction || "").trim();
        const targetTitle = String(body?.targetTitle || "当前视频组").trim();
        const currentPrompt = String(body?.currentPrompt || "").trim();
        const globalPrompt = String(body?.globalPrompt || "").trim();
        const currentParams = body?.currentParams || {};
        const projectAssets = Array.isArray(body?.projectAssets) ? body.projectAssets : [];
        const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];

        if(instruction.length>20000||currentPrompt.length>250000||projectAssets.length>3000)throw Error("本次上下文过长，请缩小处理范围");
        if (!instruction) {
            return NextResponse.json({ ok: false, error: "请输入需要 Agent 修改的要求" }, { status: 400 });
        }

        const assetLines = projectAssets
            .slice(0, 3000)
            .map((a: any) => `- [${a.category || a.kind || "素材"}] ${a.title}${Array.isArray(a.aliases) && a.aliases.length ? `（别名：${a.aliases.join("、")}）` : ""}`)
            .join("\n");

        const historyLines = history
            .map((h: any) => `${h.role === "user" ? "用户" : "Agent"}：${String(h.text || "").slice(0, 400)}`)
            .join("\n");

        const fullPrompt = [
            "你是「晓晓的AI工作台」内置的漫剧/短剧视频提示词修改 Agent（类似 Runow 的画布创作 Agent）。",
            "用户的目标是针对已经生成但画面有问题、或需要调整剧情/人物/动作/镜头/时长的视频提示词进行精准改写。",
            "",
            "【严格守则】",
            "1. 如果原提示词带有【视频编号...】、【承接视频编号...】、【出场人物】、【场景与连续状态】、分镜时间段等结构，请完整保留该结构格式，只修改用户要求变动的部分或修复画面毛病，不要随意删改无关镜头。",
            "2. 保留原有的有效素材名称与 @引用（或者从下方「当前项目可用资产」中选用真实存在的角色/场景/道具/音频名称），绝对不要凭空编造不存在的 @素材名。",
            "3. 如果用户要求修改时长（如“改成4秒”、“改成10秒”）、画幅比例（如“改成9:16竖屏”）、清晰度（如“480p”、“720p”、“1080p”）或模型（如“Seedance 2.0”、“Seedance 2.5”），除了在提示词内同步更新总时长/时间轴外，还要在返回 JSON 的 params 字段中填入对应参数值。",
            "4. 请只输出一个合法的 JSON 对象（不要加多余的解释文字），JSON 结构如下：",
            "{",
            '  "summary": "用1~2句话简明告诉用户本次改了哪里",',
            '  "changes": ["修改点1", "修改点2"],',
            '  "prompt": "修改后的完整视频提示词正文（可直接填入工作台提示词框）",',
            '  "params": {',
            '    "seconds": "若用户未要求改时长则留空字符串，若要求改时长则填纯数字字符串如 \'4\'",',
            '    "size": "若用户未要求改画幅则留空字符串，若要求则填 \'16:9\' 或 \'9:16\' 等",',
            '    "resolution": "若用户未要求改清晰度则留空字符串，若要求则填 \'480p\'、\'720p\' 或 \'1080p\'",',
            '    "model": "若用户未要求改模型则留空字符串，若要求则填如 \'seedance_2.0\' 或 \'seedance_2.5\'"',
            "  }",
            "}",
            "",
            `【当前目标】${targetTitle}`,
            `【当前生成参数】模型=${currentParams.model || "默认"} | 时长=${currentParams.seconds || ""}s | 比例=${currentParams.size || ""} | 清晰度=${currentParams.resolution || ""}`,
            globalPrompt ? `【项目全局提示词】\n${globalPrompt}` : "",
            assetLines ? `【当前项目可用资产（供核对人物/场景/声音名称）】\n${assetLines}` : "",
            historyLines ? `【最近对话上下文】\n${historyLines}` : "",
            `【当前原视频提示词】\n${currentPrompt || "（当前提示词为空，请根据用户指令直接编写完整视频提示词）"}`,
            "",
            `【用户本次修改指令】\n${instruction}`,
        ]
            .filter(Boolean)
            .join("\n");

        const backend = String(body?.backend || "codex").trim();
        const selectedModel = String(body?.model || "").trim();
        let customApi = body?.customApi;
        if(customApi?.useSavedKey){const saved=await loadAgentSettings(true);if(saved?.customApi?.baseUrl!==customApi.baseUrl)throw Error("API地址已变化，请重新保存配置");customApi={...customApi,apiKey:saved.customApi.apiKey};}

        if (backend === "custom-api" || (customApi?.baseUrl && backend !== "codex")) {
            const baseUrl = String(customApi?.baseUrl || "").trim().replace(/\/+$/, "");
            const apiKey = String(customApi?.apiKey || "").trim();
            const modelName = String(customApi?.model || "").trim() || "gpt-4o";
            if (!baseUrl) {
                return NextResponse.json({ ok: false, error: "未配置自定义 API 的 Base URL" }, { status: 400 });
            }
            const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
            const controller = new AbortController();
            const onAbort = () => controller.abort();
            const timeout=setTimeout(()=>controller.abort(),120000);
            if(request.signal.aborted)controller.abort();
            request.signal.addEventListener("abort", onAbort);

            try {
                const fetchRes = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: "You are an AI video prompt engineering expert. You must output only a single valid JSON object strictly matching the user instructions." },
                            { role: "user", content: fullPrompt },
                        ],
                        ...(new URL(baseUrl).hostname==="api.deepseek.com"?{thinking:{type:"disabled"},response_format:{type:"json_object"}}:{temperature:0.3}),
                    }),
                    signal: controller.signal,
                });

                if (!fetchRes.ok) {
                    const errText = await fetchRes.text();
                    return NextResponse.json({ ok: false, error: `自定义 API 请求失败 (${fetchRes.status}): ${errText.replaceAll(apiKey||"__no_key__","[已隐藏]").slice(0, 300)}` }, { status: 500 });
                }
                const apiJson = await fetchRes.json();
                const replyText = apiJson.choices?.[0]?.message?.content || "";
                if (!replyText) {
                    return NextResponse.json({ ok: false, error: "自定义 API 未返回有效文字回复" }, { status: 500 });
                }
                const parsed = extractAgentJson(replyText);
                return NextResponse.json({
                    ok: true,
                    summary: parsed.summary,
                    changes: parsed.changes,
                    prompt: parsed.prompt,
                    params: parsed.params,
                    steps: [
                        { label: `读取目标视频 ${targetTitle}`, tag: "Canvas", status: "done" },
                        { label: `核对项目资产库（${projectAssets.length} 项）`, tag: "Assets", status: "done" },
                        { label: `自定义 API (${modelName}) 分析改写提示词`, tag: "API", status: "done" },
                        { label: "生成可回填提示词与参数建议", tag: "Tool", status: "done" },
                    ],
                });
            } finally {
                clearTimeout(timeout);
                request.signal.removeEventListener("abort", onAbort);
            }
        }

        const { bin, isCmd } = resolveCodexBinary();
        const workDir = resolveWorkDir();
        const args = [
            "exec",
            "--skip-git-repo-check",
            "--ephemeral",
            ...(selectedModel ? ["-m", selectedModel] : ["--ignore-user-config"]),
            "-c",
            'model_reasoning_effort="low"',
            "-s",
            "read-only",
            "--json",
            "-C",
            workDir,
            "-",
        ];

        const result = await new Promise<{ agentText: string; stderr: string; errorMsg: string; usage?: any }>((resolve, reject) => {
            const child = isCmd
                ? spawn("cmd.exe", ["/d", "/s", "/c", bin, ...args], { cwd: workDir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
                : spawn(bin, args, { cwd: workDir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });

            let stdout = "";
            let stderr = "";
            const timer = setTimeout(() => {
                child.kill();
                reject(new Error("Codex 响应超时，请稍后重试"));
            }, 120000);

            const onAbort = () => {
                clearTimeout(timer);
                child.kill();
                reject(new Error("用户已暂停思考"));
            };
            if (request.signal.aborted) {
                onAbort();
                return;
            }
            request.signal.addEventListener("abort", onAbort);

            child.stdout.on("data", chunk => {
                stdout += chunk.toString("utf8");
            });
            child.stderr.on("data", chunk => {
                stderr += chunk.toString("utf8");
            });
            child.on("error", err => {
                clearTimeout(timer);
                request.signal.removeEventListener("abort", onAbort);
                reject(err);
            });
            child.on("close", () => {
                clearTimeout(timer);
                request.signal.removeEventListener("abort", onAbort);
                let agentText = "";
                let errorMsg = "";
                let usage: any = undefined;
                for (const line of stdout.split(/\r?\n/)) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("{")) continue;
                    try {
                        const evt = JSON.parse(trimmed);
                        if (evt.type === "item.completed" && evt.item?.type === "agent_message" && evt.item?.text) {
                            agentText = evt.item.text;
                        } else if (evt.type === "turn.completed" && evt.usage) {
                            usage = evt.usage;
                        } else if (evt.type === "error" && evt.message) {
                            errorMsg = evt.message;
                        } else if (evt.type === "turn.failed" && evt.error?.message) {
                            errorMsg = evt.error.message;
                        }
                    } catch {
                        // ignore non-json line
                    }
                }
                resolve({ agentText, stderr, errorMsg, usage });
            });

            child.stdin.write(fullPrompt, "utf8");
            child.stdin.end();
        });

        if (!result.agentText) {
            return NextResponse.json(
                {
                    ok: false,
                    error: result.errorMsg || result.stderr.trim() || "Codex 未返回有效结果，请检查本机 Codex 登录状态",
                },
                { status: 500 },
            );
        }

        const parsed = extractAgentJson(result.agentText);
        return NextResponse.json({
            ok: true,
            summary: parsed.summary,
            changes: parsed.changes,
            prompt: parsed.prompt,
            params: parsed.params,
            usage: result.usage,
            steps: [
                { label: `读取目标视频 ${targetTitle}`, tag: "Canvas", status: "done" },
                { label: `核对项目资产库（${projectAssets.length} 项）`, tag: "Assets", status: "done" },
                { label: "Codex 分析画面问题并改写提示词", tag: "Codex", status: "done" },
                { label: "生成可回填提示词与参数建议", tag: "Tool", status: "done" },
            ],
        });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "调用本机 Codex Agent 失败" },
            { status: 500 },
        );
    }
}
