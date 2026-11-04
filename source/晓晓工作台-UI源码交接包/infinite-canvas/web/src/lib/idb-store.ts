import localforage from "localforage";

// 同一个 IndexedDB 库里每新增一个 store 都要做一次版本升级；多个 createInstance
// 并发升级时 localforage 的就绪链会永久挂起，之后所有写入静默丢失。这里把所有
// store 的打开串成一条队列，一个开完再开下一个，彻底避开并发升级。
const DB = "infinite-canvas";
let queue: Promise<unknown> = Promise.resolve();

export type IdbStore = Pick<LocalForage, "getItem" | "setItem" | "removeItem" | "iterate" | "keys" | "clear" | "length">;

export function createStore(storeName: string): IdbStore {
    const ready = queue.then(() => {
        const instance = localforage.createInstance({ name: DB, storeName });
        return instance.ready().then(() => instance);
    });
    queue = ready.catch(() => undefined);
    const call = <K extends keyof IdbStore>(method: K) => ((...args: unknown[]) => ready.then(instance => (instance[method] as (...a: unknown[]) => unknown)(...args))) as IdbStore[K];
    return { getItem: call("getItem"), setItem: call("setItem"), removeItem: call("removeItem"), iterate: call("iterate"), keys: call("keys"), clear: call("clear"), length: call("length") };
}
