// Loads the UMD TypeTale engine served from /xiaoxiao (built by build-native-workbench.cjs).
// The model family must load first: the core factory reads global.TypeTaleModelFamily at load time.
export type TypeTaleCoreApi = Record<string, any> & {
    normalizeState: (input?: any) => any;
    normalizeShot: (input?: any, index?: number) => any;
    normalizeChapter: (input?: any, index?: number) => any;
    normalizeProvider: (input?: any, index?: number) => any;
    normalizeAsset: (input?: any, index?: number) => any;
    normalizeJob: (input?: any, index?: number) => any;
    normalizeFamilyOverrides: (input?: any) => any;
    splitShots: (source: string) => any[];
    compilePrompt: (shot: any, assets: any[], options?: any) => any;
    scopeAssetsToProject: (assets: any[], projectPath: string) => any[];
    pruneShotAssetBindings: (shots: any[], assets: any[]) => any[];
    resolveFamily: (provider: any, overrides?: any) => any;
    buildExecutionRequest: (provider: any, shot: any, compiled: any, context?: any) => any;
    defaultState: () => any;
    nowIso: () => string;
    makeId: (prefix: string) => string;
    modelFamily: Record<string, any>;
};

declare global {
    interface Window { TypeTaleCore?: TypeTaleCoreApi; TypeTaleModelFamily?: Record<string, any>; }
}

let pending: Promise<TypeTaleCoreApi> | null = null;

function inject(src: string) {
    return new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`脚本加载失败：${src}`));
        document.head.append(script);
    });
}

export function loadTypeTaleCore(): Promise<TypeTaleCoreApi> {
    if (window.TypeTaleCore) return Promise.resolve(window.TypeTaleCore);
    if (!pending) {
        pending = (async () => {
            await inject("/xiaoxiao/typetale-model-family.js");
            await inject("/xiaoxiao/typetale-core.js");
            if (!window.TypeTaleCore) throw new Error("字字动画内核加载失败");
            return window.TypeTaleCore;
        })().catch((error) => { pending = null; throw error; });
    }
    return pending;
}
