export type Workspace = "jimeng" | "typetale";
export type LocalProject = { path: string; name: string; workspace: Workspace; lastOpenedAt?: string };
type Bridge = Record<string, (...args: any[]) => Promise<any>>;
declare global { interface Window { desktopBridge?: Bridge; personalWorkbench?: Record<string, any>; } }

export function workbench(): Bridge {
    if (!window.desktopBridge && location.origin === "http://127.0.0.1:17843") {
        const names = ["pippitOfficialStatus","pippitOfficialOpen","pippitOfficialConfirm","dreaminaInterpolationStatus","dreaminaInterpolationOpen","dreaminaInterpolationConfirm","dreaminaLegacyAgentSettings","dreaminaLegacyAgentBind","dreaminaLegacyAgentCapture","oiioiiStatus","oiioiiLogin","oiioiiModels","oiioiiWorkspaces","oiioiiSelectWorkspace","oiioiiCreateWorkspace","oiioiiSubmit","oiioiiQuery","dreaminaDraftPreview","dreaminaDraftCreate","dreaminaCanvasSettings","dreaminaCanvasList","dreaminaCanvasBind","dreaminaCanvasNodes","dreaminaCanvasConfigure","dreaminaCanvasCapture","dreaminaAccounts","dreaminaAccountCreate","dreaminaAccountEdit","dreaminaAccountSelect","dreaminaStatus","dreaminaCredits","dreaminaLogin","dreaminaCheckLogin","dreaminaModels","dreaminaDescribe","dreaminaReferenceNeeds","dreaminaSubmit","dreaminaQuery","dreaminaPrepare", "dreaminaConfirm","localVideoTaskStates","libraryList","libraryEdit","libraryBrief","libraryPreview","libraryImport","libraryExport","pippitCanvasCheck","pippitCanvasSettings","pippitCanvasConfigure","pippitCanvasSync","pippitStatus","pippitLogin","pippitCredits","pippitModels","pippitDescribe","pippitSubmit","pippitQuery","pippitAgentSubmit","pippitAgentQuery","legacyWorkbenchState","inspectProject","readRecent","writeRecent","saveProject","readDraft","readRuns","scanProjectsRoot","chooseDirectory","createJimengProject","chooseFiles","scanProject","readProject","readDocument","groupCharacters","listAssets","connectorStatus","execute","cancelExecution","cdpSettings","cdpConfigure","cdpTargets","cdpLaunch","cdpOpenAndConnect","cdpRecover","cdpAcknowledge","assetList","assetLinkFiles","assetLinkFolder","assetUnlinkFolder","assetClearReferences","assetEdit","assetBind","assetBindCharacter","assetBindSegmentAudio","assetAudioPreview","assetImport","assetImportPaths","assetLinkPaths","assetDelete","assetThumb","assetFullImage","typetaleReadState","typetaleWriteState","typetaleScanPlugins","typetaleChoosePluginDir","typetaleInspectPlugin","typetaleReadPluginConfig","typetaleWritePluginConfig","typetaleListModelFamilies","typetaleValidateModelFamily","typetaleExecute","typetaleQueryVideo","typetaleDownloadResult","typetaleOpenPath","typetaleOpenOutputDir"];
        const bridge = Object.fromEntries(names.map(method=>[method, async (...args:any[])=>{
            const response = await fetch("http://127.0.0.1:17842/workbench/api", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({method,args})});
            const body = await response.json();
            if(!response.ok) throw new Error(body.error || "本地工作台连接失败");
            return body.result;
        }]));
        Object.defineProperty(bridge,"isDesktop",{value:true});
        window.desktopBridge = bridge;
    }
    if (!window.desktopBridge) throw new Error("请使用晓晓工作台桌面程序打开本地项目。");
    return window.desktopBridge;
}
export const sameProjectPath = (a: string, b: string) => a.replace(/[\\/]$/, "").toLowerCase() === b.replace(/[\\/]$/, "").toLowerCase();

export async function registerLocalProject(path: string, workspace: Workspace): Promise<LocalProject> {
    const bridge = workbench();
    const [info, recent] = await Promise.all([bridge.inspectProject(path), bridge.readRecent()]);
    if (!info?.pathAvailable) throw new Error("项目路径不可用，请重新选择文件夹。");
    if (info.configError) throw new Error("project.json 无法读取，请先修复项目配置再打开。");
    const projects: LocalProject[] = (recent.projects || []).map((p: LocalProject) => ({...p, workspace:p.workspace === "typetale" ? "typetale" : "jimeng"}));
    const existing = projects.find(p => sameProjectPath(p.path, path));
    const owner = existing?.workspace || (info.hasProjectConfig ? info.project?.workspace || "jimeng" : info.hasTypetaleState ? "typetale" : "");
    if (owner && owner !== workspace) throw new Error("这个文件夹已属于另一个场景，请为即梦和字字动画使用不同的项目文件夹。");
    if (workspace === "jimeng") {
        const result = await bridge.saveProject(path, {...info.project, workspace, mode:"queue", modeLocked:true, folders:info.folders});
        if (!result?.ok) throw new Error("项目配置保存失败。");
    } else if (!info.hasTypetaleState) {
        const result = await bridge.typetaleWriteState(path, {workspace, projectPath:path});
        if (!result?.ok) throw new Error(result?.error || "工作区初始化失败。");
    }
    const item: LocalProject = {path, workspace, name:info.project?.name || path.split(/[\\/]/).pop() || path, lastOpenedAt:new Date().toISOString()};
    const result = await bridge.writeRecent([item, ...projects.filter(p=>!sameProjectPath(p.path,path))].slice(0,50));
    if (!result?.ok) throw new Error("项目列表保存失败。");
    return item;
}

export async function activateLocalProject(item: LocalProject) {
    await registerLocalProject(item.path, item.workspace);
    if (item.workspace === "typetale") {
        localStorage.setItem("typetale-workbench-state", JSON.stringify({workspace:"typetale", projectPath:item.path}));
        return;
    }
    const bridge = workbench();
    const [info, draft] = await Promise.all([bridge.inspectProject(item.path), bridge.readDraft(item.path)]);
    let live: any = {};
    try { live = JSON.parse(localStorage.getItem("jimeng-workbench-project") || "{}"); } catch {}
    const matching = sameProjectPath(live.projectPath || "", item.path);
    localStorage.setItem("jimeng-workbench-project", JSON.stringify({
        ...info.project, ...(matching ? live : {}), projectPath:item.path,
        assetFolders:{...info.folders,character:info.folders?.characters?.relativePath || "",scene:info.folders?.scenes?.relativePath || ""},
        mode:"queue", source:(matching ? live.source : draft?.text) || "", segments:matching ? live.segments || [] : [],
    }));
}
