// Reuse the verified automation engines inside a scoped DOM panel. No iframe, second app shell, or polling on remount.
import localforage from "localforage";
import { isTypetaleBusy } from "@/app/(user)/typetale/stores/use-typetale-store";

export async function mountPersonalWorkbench(root: HTMLElement, navigate: (url: string) => void, projectKey = "") {
    const snapshots = localforage.createInstance({name:"xiaoxiao-jimeng-sessions",storeName:"projects"});
    const values: Record<string,string> = projectKey ? await snapshots.getItem<Record<string,string>>(projectKey) || {} : {};
    const seed = localStorage.getItem("jimeng-workbench-project");
    if (projectKey && seed && !values["jimeng-workbench-project"]) values["jimeng-workbench-project"] = seed;
    const scopedStorage = {getItem:(key:string)=>projectKey && ["jimeng-workbench-project","jimeng-workbench-logs"].includes(key)?values[key] || null:localStorage.getItem(key),setItem:(key:string,value:string)=>{if(projectKey && ["jimeng-workbench-project","jimeng-workbench-logs"].includes(key)){values[key]=value;void snapshots.setItem(projectKey,{...values}).catch(console.error);}else localStorage.setItem(key,value);},removeItem:(key:string)=>{if(projectKey && key in values){delete values[key];void snapshots.setItem(projectKey,{...values}).catch(console.error);}else localStorage.removeItem(key);}};
    const [markup, ...scripts] = await Promise.all([
        fetch("/xiaoxiao/panels.html").then(r=> { if (!r.ok) throw new Error("个人工具页面缺失"); return r.text(); }),
        ...["browser-bridge", "workbench", "typetale-model-family", "typetale-core", "typetale-workbench", "asset-workspace", "cdp-controls"].map(name=>fetch(`/xiaoxiao/${name}.js`).then(r=> { if (!r.ok) throw new Error(`个人工具 ${name} 缺失`); return r.text(); })),
    ]);
    root.innerHTML = markup;
    const owned = [...root.querySelectorAll<HTMLElement>("*")];
    const find = (selector:string) => root.querySelector<HTMLElement>(selector) || owned.find(node=>node.matches(selector)) || null;
    const listeners: (()=>void)[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const intervals = new Set<ReturnType<typeof setInterval>>();
    const events = new EventTarget();
    // Electron renders window.confirm/alert as invisible/blocking modals; route every
    // dialog through the main-process native message box instead. `window.confirm` /
    // `window.alert` inside sandboxed scripts resolve via scopedWindow below; bare
    // `confirm(...)`/`alert(...)` calls resolve to the real globals overridden here.
    const realConfirm = window.confirm.bind(window);
    const realAlert = window.alert.bind(window);
    const nativeConfirm = (msg: unknown) => {
        const r = (window as any).desktopBridge?.dialogConfirm?.(String(msg ?? ""), "确认");
        return r && typeof r === "object" && "response" in r ? r.response === 1 : realConfirm(String(msg ?? ""));
    };
    const nativeAlert = (msg: unknown) => {
        const r = (window as any).desktopBridge?.dialogAlert?.(String(msg ?? ""), "提示");
        if (!r || typeof r !== "object") realAlert(String(msg ?? ""));
    };

    const globals: Record<string, any> = {desktopBridge:window.desktopBridge, workbenchEvents:events,workbenchDisplayName:()=>{try{return JSON.parse(scopedStorage.getItem("jimeng-workbench-project")||"{}").name||"";}catch{return "";}},workbenchNode:find,workbenchLogs:()=>JSON.parse(scopedStorage.getItem("jimeng-workbench-logs")||"[]")};
    const scopedWindow = new Proxy(globals, {
        get(target, key: string) {
            if (key in target) return target[key];
            if (["addEventListener","removeEventListener","dispatchEvent"].includes(key)) return (events as any)[key].bind(events);
            if (key === "scrollTo") return () => root.parentElement?.scrollTo(0,0);
            if (key === "confirm")
                return (msg: unknown) => {
                    const r = (window as any).desktopBridge?.dialogConfirm?.(String(msg ?? ""), "确认");
                    return r && typeof r === "object" && "response" in r ? r.response === 1 : window.confirm(String(msg ?? ""));
                };
            if (key === "alert")
                return (msg: unknown) => {
                    const r = (window as any).desktopBridge?.dialogAlert?.(String(msg ?? ""), "提示");
                    if (!r || typeof r !== "object") window.alert(String(msg ?? ""));
                };
            const value = (window as any)[key];
            return typeof value === "function" ? value.bind(window) : value;
        },
    });
    const scopedDocument = new Proxy(document, {
        get(target, key: string) {
            if (key === "body") return root;
            // Reparented nodes (LegacySlot) leave the host subtree but keep their
            // ids/selectors, so fall back to the real document before failing.
            if (key === "querySelector") return (selector: string) => find(selector);
            if (key === "querySelectorAll") return (selector: string) => { return [...new Set([...root.querySelectorAll(selector),...owned.filter(node=>node.matches(selector))])]; };
            if (key === "getElementById") return (id: string) => find(`#${CSS.escape(id)}`);
            if (key === "addEventListener") return (name: string, fn: EventListener, options?: AddEventListenerOptions) => {
                document.addEventListener(name, fn, options); listeners.push(()=>document.removeEventListener(name,fn,options));
            };
            if (key === "head") return {append(node: HTMLElement) { if (node.tagName === "STYLE") { node.textContent = `@scope (.xiaoxiao-module) {${node.textContent}}`; root.append(node); } }, appendChild(node: HTMLElement) { this.append(node); return node; }};
            const value = (target as any)[key];
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    const timeout = (fn: (...args:any[])=>void, ms?: number, ...args:any[]) => {
        const timer = setTimeout(()=>{timers.delete(timer);fn(...args);},ms);timers.add(timer);return timer;
    };
    const interval = (fn: (...args:any[])=>void, ms?: number, ...args:any[]) => { const timer=setInterval(fn,ms,...args);intervals.add(timer);return timer; };
    sessionStorage.setItem("jimeng-open-project","1");
    for (const script of scripts) new Function("window","globalThis","document","setTimeout","setInterval","localStorage","confirm","alert", script)(scopedWindow,scopedWindow,scopedDocument,timeout,interval,scopedStorage,nativeConfirm,nativeAlert);
    // The host section stays hidden while the React storyboard page renders.
    // Park the connection bar in a laid-out (but invisible) wrapper so its
    // controls keep measurable geometry until the page's LegacySlot re-homes it.
    let parked: { node: HTMLElement; parent: HTMLElement; next: ChildNode | null; park: HTMLElement } | null = null;
    const topActions = root.querySelector<HTMLElement>(".top-actions");
    if (topActions) {
        const park = document.createElement("div");
        park.className = "xiaoxiao-module";
        park.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none";
        document.body.appendChild(park);
        parked = { node: topActions, parent: topActions.parentElement as HTMLElement, next: topActions.nextSibling, park };
        topActions.hidden = false;
        park.appendChild(topActions);
    }
    const busy = () => isTypetaleBusy() || Boolean(globals.typetaleIsRunning?.()) || Boolean(globals.workbenchRunStatus?.().running) || (globals.workbenchAllSegments?.()||[]).some((s:any)=>s.status==="running");
    const projects = () => navigate("/projects");
    globals.workbenchChooseProjectForScene = projects;
    for (const id of ["projectNav","chooseProjectFolder","newProject","ttChooseProject"]) {
        const node = root.querySelector<HTMLButtonElement>(`#${id}`); if (node) node.onclick=projects;
    }
    const showScene = globals.workbenchShowScene;
    globals.workbenchShowScene = (scene: string) => ["jimeng","typetale"].includes(scene) ? showScene(scene) : projects();
    const unload = (event: BeforeUnloadEvent) => { if(busy()){event.preventDefault();event.returnValue="";} };
    window.addEventListener("beforeunload", unload);
    window.personalWorkbench = globals;
    return {
        globals, busy,
        destroy() { listeners.forEach(fn=>fn());timers.forEach(clearTimeout);intervals.forEach(clearInterval);window.removeEventListener("beforeunload",unload);if(parked){parked.parent.insertBefore(parked.node,parked.next);parked.park.remove();}if(window.personalWorkbench===globals)delete window.personalWorkbench;root.replaceChildren(); },
    };
}
