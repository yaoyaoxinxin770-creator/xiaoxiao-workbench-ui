import { create } from "zustand";
import { loadTypeTaleCore, type TypeTaleCoreApi } from "@/lib/typetale-core";
import { activateLocalProject, workbench } from "@/services/api/workbench";

const STORAGE_KEY = "typetale-workbench-state";
const storageKeyFor = (root: string) => (root ? `${STORAGE_KEY}:${root}` : STORAGE_KEY);

export type TypetaleDrawer = "batch" | "provider" | "characters" | "scenes" | "plugins" | "cli" | "jobs" | "project" | null;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

type TypetaleStore = {
    core: TypeTaleCoreApi | null;
    projectPath: string;
    state: any;
    running: boolean;
    paused: boolean;
    stopped: boolean;
    selectedShotId: string;
    editing: boolean;
    selectedJobId: string;
    filter: string;
    zoomMode: boolean;
    drawer: TypetaleDrawer;
    loading: boolean;
    error: string;
    isBusy: () => boolean;
    openProject: (root: string) => Promise<void>;
    closeProject: () => void;
    persist: () => Promise<void>;
    schedulePersist: () => void;
    log: (message: string, type?: string) => void;
    setDrawer: (drawer: TypetaleDrawer) => void;
    setFilter: (filter: string) => void;
    setZoomMode: (zoom: boolean) => void;
    selectShot: (id: string, editing?: boolean) => void;
    selectJob: (id: string) => void;
    setEditing: (open: boolean) => void;
    updateShot: (id: string, patch: Record<string, any>) => void;
    setSourceText: (text: string) => void;
    parseShots: (text: string) => void;
    addShotAfter: (index?: number) => void;
    deleteShot: (id: string) => void;
    mergeShot: (id: string, direction: "up" | "down") => void;
    splitShotAt: (id: string, lineIndex: number) => void;
    addChapter: (name: string, title: string) => void;
    renameChapter: (id: string, patch: Record<string, any>) => void;
    toggleChapter: (id: string) => void;
    removeChapter: (id: string) => void;
    assignShotChapter: (shotId: string, chapterId: string) => void;
    setActiveProvider: (id: string) => void;
    addProvider: () => void;
    saveProvider: (form: Record<string, any>, patch?: Record<string, any>) => any;
    compileShot: (shot: any) => any;
    activeProvider: () => any;
    refreshAssets: () => Promise<void>;
    importAssets: () => Promise<void>;
    submitShot: (shot: any) => Promise<boolean>;
    runShots: (shots: any[]) => Promise<void>;
    runSelected: () => Promise<void>;
    pauseRun: () => void;
    resumeRun: () => void;
    stopRun: () => void;
    refreshJob: () => Promise<void>;
    downloadResult: () => Promise<void>;
    scanPlugins: (pluginPath?: string) => Promise<any>;
    inspectPlugin: (pluginPath: string) => Promise<any>;
    savePluginParams: (pluginPath: string, patch: Record<string, any>) => Promise<any>;
    markDone: (id: string) => void;
};

function findResultValue(value: any): string {
    if (!value) return "";
    if (typeof value === "string" && (/^https?:\/\//i.test(value) || /\.(mp4|mov|webm|mkv)(?:[?#]|$)/i.test(value) || /^[a-z]:[\\/]/i.test(value))) return value;
    if (Array.isArray(value)) { for (const item of value) { const found = findResultValue(item); if (found) return found; } }
    if (typeof value === "object") { for (const item of Object.values(value)) { const found = findResultValue(item); if (found) return found; } }
    return "";
}

export function shotResults(shot: any): { path: string; url: string; createdAt: string }[] {
    if (Array.isArray(shot?.results) && shot.results.length) return shot.results;
    if (shot?.outputPath || shot?.resultUrl) return [{ path: shot.outputPath || "", url: shot.resultUrl || "", createdAt: shot.updatedAt || "" }];
    return [];
}

export const useTypetaleStore = create<TypetaleStore>()((set, get) => {
    // Mutate the persisted state through a draft so React sees fresh references.
    const mutate = (fn: (draft: any) => void, persist = true) => {
        const draft = structuredClone(get().state);
        fn(draft);
        set({ state: draft });
        if (persist) get().schedulePersist();
    };
    const log = (message: string, type = "ok") => {
        mutate((draft) => {
            draft.logs.unshift({ time: Date.now(), message: String(message), type });
            draft.logs = draft.logs.slice(0, 120);
        });
    };
    const activeShot = () => {
        const { state } = get();
        return state.shots.find((shot: any) => shot.id === state.activeShotId) || state.shots[0] || null;
    };
    const activeProvider = () => get().activeProvider();
    const compileShot = (shot: any) => get().compileShot(shot);
    const renumber = (shots: any[]) => shots.forEach((shot, index) => { shot.id = String(index + 1).padStart(2, "0"); shot.viewerIndex = index + 1; });

    return {
        core: null,
        projectPath: "",
        state: { shots: [], chapters: [], assets: [], providers: [], jobs: [], logs: [], familyOverrides: { video: {}, image: {} }, sourceText: "" },
        running: false,
        paused: false,
        stopped: false,
        selectedShotId: "",
        editing: false,
        selectedJobId: "",
        filter: "",
        zoomMode: false,
        drawer: null,
        loading: false,
        error: "",
        isBusy: () => get().running || get().state.shots.some((shot: any) => shot.status === "running"),

        openProject: async (root) => {
            root = String(root || "").trim();
            if (!root || (root === get().projectPath && get().state.projectPath === root)) return;
            if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
            await get().persist();
            set({ loading: true, error: "", running: false, paused: false, stopped: false, editing: false, selectedJobId: "" });
            const core = get().core || (await loadTypeTaleCore());
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspace: "typetale", projectPath: root, updatedAt: core.nowIso() }));
            const result = await workbench().typetaleReadState(root).catch(() => null);
            const normalized = core.normalizeState({ ...(result?.state || {}), projectPath: root });
            normalized.workspace = "typetale";
            normalized.assets = core.scopeAssetsToProject(normalized.assets, normalized.projectPath);
            normalized.shots = core.pruneShotAssetBindings(normalized.shots, normalized.assets);
            set({ core, projectPath: root, state: normalized, loading: false });
            await get().refreshAssets();
            await get().persist();
            log(`已打开字字动画项目：${root}`);
        },

        closeProject: () => { window.location.href = "/projects"; },

        persist: async () => {
            const { core, projectPath, state } = get();
            if (!core || !projectPath) return;
            const draft = structuredClone(state);
            draft.updatedAt = core.nowIso();
            draft.workspace = "typetale";
            draft.projectPath = projectPath;
            set({ state: draft });
            localStorage.setItem(storageKeyFor(projectPath), JSON.stringify(draft));
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspace: "typetale", projectPath, updatedAt: draft.updatedAt }));
            const result = await workbench().typetaleWriteState(projectPath, draft).catch((error: any) => ({ ok: false, error: String(error?.message || error) }));
            if (result?.ok === false) log(`工作区保存失败：${result.error}`, "error");
        },
        schedulePersist: () => {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => { void get().persist(); }, 400);
        },
        log,
        setDrawer: (drawer) => set({ drawer }),
        setFilter: (filter) => set({ filter }),
        setZoomMode: (zoomMode) => set({ zoomMode }),
        selectShot: (id, editing) => {
            mutate((draft) => { draft.activeShotId = id; });
            set({ selectedShotId: id, ...(editing === undefined ? {} : { editing }) });
        },
        selectJob: (selectedJobId) => set({ selectedJobId }),
        setEditing: (editing) => set({ editing }),
        updateShot: (id, patch) => {
            mutate((draft) => {
                const shot = draft.shots.find((item: any) => item.id === id);
                if (shot) { Object.assign(shot, patch); shot.updatedAt = get().core?.nowIso() || new Date().toISOString(); }
            });
        },
        setSourceText: (text) => { mutate((draft) => { draft.sourceText = text; }); },
        parseShots: (text) => {
            const core = get().core;
            if (!core) return;
            mutate((draft) => {
                draft.sourceText = text;
                const parsed = core.splitShots(text);
                const previous = new Map(draft.shots.map((shot: any) => [shot.id, shot]));
                draft.shots = parsed.map((shot: any, index: number) => {
                    const old: any = previous.get(shot.id);
                    return old ? { ...shot, chapterId: old.chapterId, lines: old.lines, results: old.results, selectedResult: old.selectedResult, tags: old.tags, voiceId: old.voiceId, bindings: old.bindings, status: old.status, selected: old.selected, remoteId: old.remoteId, resultUrl: old.resultUrl, outputPath: old.outputPath, error: old.error } : core.normalizeShot(shot, index);
                });
                draft.activeShotId = draft.shots[0]?.id || "";
            });
            log(`解析完成：${get().state.shots.length} 个分镜`);
        },
        addShotAfter: (index) => {
            const core = get().core;
            if (!core) return;
            mutate((draft) => {
                const at = index === undefined ? draft.shots.length : Math.min(Math.max(index + 1, 0), draft.shots.length);
                const shot = core.normalizeShot({ id: "00", title: "新分镜", prompt: "", status: "ready" }, at);
                if (index !== undefined && draft.shots[index]?.chapterId) shot.chapterId = draft.shots[index].chapterId;
                draft.shots.splice(at, 0, shot);
                renumber(draft.shots);
                draft.activeShotId = draft.shots[at].id;
            });
        },
        deleteShot: (id) => {
            mutate((draft) => {
                draft.shots = draft.shots.filter((shot: any) => shot.id !== id);
                renumber(draft.shots);
                if (draft.activeShotId === id) draft.activeShotId = draft.shots[0]?.id || "";
            });
        },
        mergeShot: (id, direction) => {
            mutate((draft) => {
                const index = draft.shots.findIndex((shot: any) => shot.id === id);
                const other = direction === "up" ? index - 1 : index + 1;
                if (index < 0 || other < 0 || other >= draft.shots.length) return;
                const [a, b] = direction === "up" ? [draft.shots[other], draft.shots[index]] : [draft.shots[index], draft.shots[other]];
                a.prompt = [a.prompt, b.prompt].filter(Boolean).join("\n");
                a.lines = [...(a.lines || []), ...(b.lines || [])];
                a.results = [...(a.results || []), ...(b.results || [])];
                draft.shots.splice(direction === "up" ? index : other, 1);
                renumber(draft.shots);
                draft.activeShotId = a.id;
            });
        },
        splitShotAt: (id, lineIndex) => {
            const core = get().core;
            if (!core) return;
            mutate((draft) => {
                const index = draft.shots.findIndex((shot: any) => shot.id === id);
                if (index < 0) return;
                const shot = draft.shots[index];
                const tail = (shot.lines || []).slice(lineIndex);
                if (!tail.length) return;
                shot.lines = (shot.lines || []).slice(0, lineIndex);
                const next = core.normalizeShot({ ...shot, id: "00", prompt: tail.join("\n"), lines: tail, results: [], selectedResult: -1, status: "ready", remoteId: "", resultUrl: "", outputPath: "", error: "" }, index + 1);
                draft.shots.splice(index + 1, 0, next);
                renumber(draft.shots);
                draft.activeShotId = next.id;
            });
        },
        addChapter: (name, title) => {
            const core = get().core;
            if (!core) return;
            mutate((draft) => {
                draft.chapters.push(core.normalizeChapter({ id: core.makeId("chapter"), name, title }, draft.chapters.length));
            });
        },
        renameChapter: (id, patch) => {
            mutate((draft) => {
                const chapter = draft.chapters.find((item: any) => item.id === id);
                if (chapter) Object.assign(chapter, patch);
            });
        },
        toggleChapter: (id) => {
            mutate((draft) => {
                const chapter = draft.chapters.find((item: any) => item.id === id);
                if (chapter) chapter.collapsed = !chapter.collapsed;
            });
        },
        removeChapter: (id) => {
            mutate((draft) => {
                draft.chapters = draft.chapters.filter((item: any) => item.id !== id);
                for (const shot of draft.shots) if (shot.chapterId === id) shot.chapterId = "";
            });
        },
        assignShotChapter: (shotId, chapterId) => { get().updateShot(shotId, { chapterId }); },
        setActiveProvider: (id) => { mutate((draft) => { draft.activeProviderId = id; }); },
        addProvider: () => {
            const core = get().core;
            if (!core) return;
            mutate((draft) => {
                const provider = core.normalizeProvider({ id: core.makeId("provider"), name: `通道 ${draft.providers.length + 1}` });
                draft.providers.push(provider);
                draft.activeProviderId = provider.id;
            });
        },
        saveProvider: (form, patch = {}) => {
            const core = get().core;
            if (!core) return null;
            let saved: any = null;
            mutate((draft) => {
                const existing = draft.providers.find((item: any) => item.id === draft.activeProviderId) || draft.providers[0] || null;
                const provider = core.normalizeProvider({ ...(existing || {}), ...form, id: existing?.id || core.makeId("provider") });
                Object.assign(provider, patch);
                if (existing) Object.assign(existing, provider);
                else draft.providers.push(provider);
                draft.activeProviderId = provider.id;
                saved = provider;
            });
            if (saved) log(`已保存通道：${saved.name}`);
            return saved;
        },
        compileShot: (shot) => {
            const { core, state } = get();
            if (!core || !shot) return null;
            return core.compilePrompt(shot, state.assets, { provider: activeProvider() || { kind: "video" }, familyOverrides: state.familyOverrides });
        },
        activeProvider: () => {
            const { state } = get();
            return state.providers.find((item: any) => item.id === state.activeProviderId) || state.providers[0] || null;
        },
        refreshAssets: async () => {
            const { core, projectPath, state } = get();
            if (!core || !projectPath) return;
            const result = await workbench().assetList(projectPath, state.sourceText).catch((error: any) => ({ ok: false, error: String(error?.message || error) }));
            if (result?.ok === false) {
                mutate((draft) => {
                    draft.assets = [];
                    draft.shots = core.pruneShotAssetBindings(draft.shots, draft.assets);
                });
                log(`素材刷新失败：${result.error}`, "error");
                return;
            }
            mutate((draft) => {
                const previous = new Map(draft.assets.map((asset: any) => [asset.id, asset]));
                const scanned = (result?.assets || []).map((item: any, index: number) => ({ ...(previous.get(item.relativePath) || {}),
                    id: item.relativePath || item.id || `asset-${index}`,
                    path: item.relativePath || item.path || "",
                    name: item.displayName || item.name,
                    kind: item.kind === "groups" ? "characters" : item.kind,
                    mediaType: item.mediaType,
                    projectPath,
                }));
                draft.assets = core.scopeAssetsToProject(scanned, projectPath);
                draft.shots = core.pruneShotAssetBindings(draft.shots, draft.assets);
            }, false);
            get().schedulePersist();
        },
        importAssets: async () => {
            const { projectPath } = get();
            if (!projectPath) { log("请先选择项目；素材只会导入当前项目，不会写入全局资产库", "error"); return; }
            const files = await workbench().chooseFiles?.();
            if (!files?.length) return;
            const result = await workbench().assetImportPaths(projectPath, files).catch((error: any) => ({ ok: false, error: String(error?.message || error) }));
            if (result?.ok === false) { log(`素材导入失败：${result.error}`, "error"); return; }
            await get().refreshAssets();
            log(`已导入 ${result?.added?.length || files.length} 个素材到当前项目`);
        },
        submitShot: async (shot) => {
            const { core, projectPath } = get();
            const provider = activeProvider();
            if (!core || !shot || !provider) { log("请先选择分镜并配置 Provider", "error"); return false; }
            const compiled = compileShot(shot);
            if (!compiled.prompt.trim()) { log(`视频 ${shot.id} 提示词为空`, "error"); return false; }
            for (const item of compiled.overflow) {
                log(`视频 ${shot.id}：${item.name} 超出「${compiled.family.name}」上限，未随请求发送`, "error");
            }
            const job = core.normalizeJob({ shotId: shot.id, providerId: provider.id, status: "running", message: "正在提交", prompt: compiled.prompt, model: provider.model, providerName: provider.name });
            mutate((draft) => {
                draft.jobs.unshift(job);
                const target = draft.shots.find((item: any) => item.id === shot.id);
                if (target) { target.status = "running"; target.error = ""; }
            });
            set({ selectedJobId: job.id });
            const applyResult = (patch: { job: Record<string, any>; shot: Record<string, any> }) => {
                mutate((draft) => {
                    const j = draft.jobs.find((item: any) => item.id === job.id);
                    const s = draft.shots.find((item: any) => item.id === shot.id);
                    if (j) Object.assign(j, patch.job);
                    if (s) {
                        Object.assign(s, patch.shot);
                        if (patch.job.status === "done") {
                            const files = patch.job.outputs?.length ? patch.job.outputs : patch.job.outputPath ? [patch.job.outputPath] : [];
                            const results = files.map((file: string) => ({ path: file, url: "", createdAt: core.nowIso(), prompt: compiled.prompt, model: provider.model, providerName: provider.name }));
                            if (!files.length && patch.job.resultUrl) results.push({ path: "", url: patch.job.resultUrl, createdAt: core.nowIso(), prompt: compiled.prompt, model: provider.model, providerName: provider.name });
                            s.results = [...results, ...(s.results || [])];
                        }
                    }
                });
            };
            try {
                const result = await workbench().typetaleExecute({
                    projectPath, provider, shot, assets: get().state.assets, compiled,
                    familyOverrides: get().state.familyOverrides,
                });
                if (result?.ok === false) throw new Error(result.error || "提交失败");
                const response = result?.response || result || {};
                if (response?.ok === false) throw new Error(response.statusText || response.payload?.error || response.error || `HTTP ${response.status || ""}`.trim());
                // 插件返回了路径但文件不在盘上，通常是插件吞掉了自己的异常，不能当成功。
                if (response.missingFiles?.length) throw new Error(`插件返回的文件不存在：${response.missingFiles.join("、")}`);
                const remoteId = response.taskId || "";
                const resultUrl = response.resultUrl || findResultValue(response.payload || response.files || response.result) || "";
                const outputPath = response.files?.[0] || response.outputPath || (!/^https?:\/\//i.test(resultUrl) ? resultUrl : "") || "";
                const status = provider.type === "generic-video" && remoteId ? "submitted" : "done";
                const message = remoteId ? `任务 ${remoteId}` : resultUrl || outputPath || "执行完成";
                applyResult({
                    job: { remoteId, resultUrl, outputPath, outputs: response.files || [], status, message },
                    shot: { remoteId, resultUrl, outputPath, status },
                });
                log(`视频 ${shot.id} 已提交：${message}`);
                return true;
            } catch (error: any) {
                const message = String(error?.message || error);
                applyResult({ job: { status: "error", message }, shot: { status: "error", error: message } });
                log(`视频 ${shot.id} 提交失败：${message}`, "error");
                return false;
            } finally {
                mutate((draft) => {
                    const j = draft.jobs.find((item: any) => item.id === job.id);
                    const s = draft.shots.find((item: any) => item.id === shot.id);
                    const stamp = core.nowIso();
                    if (j) j.updatedAt = stamp;
                    if (s) s.updatedAt = stamp;
                });
            }
        },
        runShots: async (shots) => {
            const { running } = get();
            if (running || !shots.length) { if (!shots.length) log("没有可执行的分镜", "error"); return; }
            set({ running: true, stopped: false, paused: false });
            try {
                for (const shot of shots) {
                    if (get().stopped) break;
                    while (get().paused && !get().stopped) await new Promise((resolve) => setTimeout(resolve, 300));
                    if (get().stopped) break;
                    // 提交前读最新快照，批量途中用户改的内容不能被旧引用覆盖。
                    const fresh = get().state.shots.find((item: any) => item.id === shot.id) || shot;
                    await get().submitShot(fresh);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
                log(get().stopped ? "批量执行已停止" : "批量执行结束");
            } finally {
                set({ running: false, paused: false, stopped: false });
                void get().persist();
            }
        },
        runSelected: async () => {
            const shots = get().state.shots.filter((shot: any) => shot.selected !== false && shot.status !== "done");
            await get().runShots(shots);
        },
        pauseRun: () => { if (get().running) set({ paused: true }); },
        resumeRun: () => { set({ paused: false }); },
        stopRun: () => { set({ stopped: true, paused: false }); },
        refreshJob: async () => {
            const { state, selectedJobId } = get();
            const shot = activeShot();
            const job = state.jobs.find((item: any) => item.id === selectedJobId) || state.jobs[0] || null;
            const provider = state.providers.find((item: any) => item.id === job?.providerId) || activeProvider();
            const remoteId = job?.remoteId || shot?.remoteId;
            if (!provider || provider.type !== "generic-video" || !remoteId) { log("当前任务没有可查询的远程视频 ID", "error"); return; }
            const result = await workbench().typetaleQueryVideo?.(provider, remoteId).catch((error: any) => ({ ok: false, error: String(error?.message || error) }));
            if (result?.ok === false || result?.response?.ok === false) { log(`查询失败：${result?.error || result?.response?.statusText || "未知错误"}`, "error"); return; }
            const payload = result?.payload || result;
            const resultUrl = result?.resultUrl || findResultValue(payload);
            mutate((draft) => {
                const j = draft.jobs.find((item: any) => item.id === job?.id);
                const s = draft.shots.find((item: any) => item.id === shot?.id);
                const stamp = get().core?.nowIso();
                if (j) { j.resultUrl = resultUrl || j.resultUrl; j.message = payload?.status || j.message; j.updatedAt = stamp; }
                if (s) { s.resultUrl = resultUrl || s.resultUrl; if (resultUrl) { s.status = "done"; if (!(s.results || []).some((r: any) => r.url === resultUrl)) s.results = [{ path: "", url: resultUrl, createdAt: stamp, prompt: job?.prompt || s.prompt, model: job?.model || provider.model, providerName: job?.providerName || provider.name }, ...(s.results || [])]; } }
            });
            log(payload?.status || resultUrl || "已查询");
        },
        downloadResult: async () => {
            const { state, selectedJobId, projectPath } = get();
            const shot = activeShot();
            const job = state.jobs.find((item: any) => item.id === selectedJobId) || state.jobs[0] || null;
            const provider = state.providers.find((item: any) => item.id === job?.providerId) || activeProvider();
            const resultUrl = job?.resultUrl || shot?.resultUrl;
            if (!provider || !resultUrl) { log("当前任务还没有可下载结果", "error"); return; }
            const result = await workbench().typetaleDownloadResult?.(provider, resultUrl, projectPath, `${shot?.id || "video"}-${Date.now()}`).catch((error: any) => ({ ok: false, error: String(error?.message || error) }));
            if (result?.ok === false) { log(`下载失败：${result.error}`, "error"); return; }
            const file = result?.path || "";
            mutate((draft) => {
                const j = draft.jobs.find((item: any) => item.id === job?.id);
                const s = draft.shots.find((item: any) => item.id === shot?.id);
                if (j) { j.outputPath = file; j.status = "done"; }
                if (s) {
                    s.outputPath = file; s.status = "done";
                    if (file) s.results = [{ path: file, url: resultUrl, createdAt: get().core?.nowIso(), prompt: job?.prompt || s.prompt, model: job?.model || provider.model, providerName: job?.providerName || provider.name }, ...(s.results || [])];
                }
            });
            log(`结果已保存：${file}`);
        },
        scanPlugins: async (pluginPath) => {
            const path = String(pluginPath ?? activeProvider()?.pluginPath ?? "").trim();
            const bridge = workbench();
            const result = path && bridge.typetaleScanPlugins ? await bridge.typetaleScanPlugins(path) : await bridge.typetaleChoosePluginDir?.();
            if (!result || result.canceled) return null;
            log(`插件扫描完成：${(result.plugins || []).length} 个`);
            return result;
        },
        inspectPlugin: async (pluginPath) => {
            const target = String(pluginPath || activeProvider()?.pluginPath || "").trim();
            if (!target) return null;
            const result = await workbench().typetaleInspectPlugin?.(target, activeProvider() || {}).catch((error: any) => ({ ok: false, error: String(error?.message || error) }));
            if (!result) { log("桌面桥不可用，无法读取插件参数", "error"); return null; }
            return result;
        },
        savePluginParams: async (pluginPath, patch) => {
            const written = await workbench().typetaleWritePluginConfig(pluginPath, patch).catch((error: any) => ({ ok: false, error: String(error?.message || error) }));
            if (written?.ok === false) { log(`插件参数保存失败：${written.error}`, "error"); return written; }
            if (written?.skippedEmptyOverwrite?.length) log(`已保留原值（不允许被空值覆盖）：${written.skippedEmptyOverwrite.join("、")}`, "error");
            log(`插件参数已保存：${written?.path || pluginPath}`);
            return written;
        },
        markDone: (id) => { get().updateShot(id, { status: "done" }); },
    };
});

export function isTypetaleBusy() {
    return useTypetaleStore.getState().isBusy();
}

export const STATUS_LABEL: Record<string, string> = { ready: "待准备", running: "执行中", submitted: "已提交", done: "已完成", error: "失败", queued: "排队中" };
export const KIND_LABEL: Record<string, string> = { characters: "角色", scenes: "场景", props: "道具", other: "素材", audio: "音频" };
