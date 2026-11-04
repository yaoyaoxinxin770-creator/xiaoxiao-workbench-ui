// 仅预览用的“未连接”桥接桩。
// 根布局里的 ClientRootInit 会调用 workbench()，在普通浏览器（没有桌面程序注入 desktopBridge）中会同步抛错，
// 使整个页面无法渲染。预览路由在模块加载时挂一个惰性桩：每个方法都返回被拒绝的 Promise，
// 不返回任何假数据、不访问网络或本地文件；生产页面不会引用本文件，桌面程序中已存在的真实桥接不会被覆盖。
export const PREVIEW_BRIDGE_FLAG = "__xiaoxiaoDesignPreviewStub";

export function installPreviewBridge() {
    if (typeof window === "undefined" || window.desktopBridge) return;
    const reject = (method: string) => () => Promise.reject(new Error(`设计预览未连接本机服务（${method}）`));
    const stub = new Proxy({} as Record<string, (...args: unknown[]) => Promise<unknown>>, {
        get: (_target, key) => {
            if (key === PREVIEW_BRIDGE_FLAG) return true;
            if (key === "isDesktop") return false;
            if (typeof key !== "string" || key === "then") return undefined;
            return reject(key);
        },
    });
    window.desktopBridge = stub;
}

installPreviewBridge();
