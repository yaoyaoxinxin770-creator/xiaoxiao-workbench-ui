"use client";
import {recordElementEdit} from "@/app/(user)/video/element-edit-history";
import { assetsForReference } from "@/app/(user)/video/prompt-references";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";
import {elementCategory,groupElements} from "@/app/(user)/video/element-model";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";

export type LocalFile = {
  id: string;
  path: string;
  title: string;
  kind: "image" | "audio" | "video";
  mimeType: string;
  bytes: number;
  revision?: string;
  category: string;
  url: string;
};

type SyncPayload = {
  resolved?: Record<string, LocalFile>;
  missing?: Record<string, string>;
  healedCount?: number;
  canceled?: boolean;
};

function buildLocalAssetUrl(item: LocalFile, bustStamp?: number): string {
  const base = item.revision ? item.url + "?v=" + encodeURIComponent(item.revision) : item.url;
  return bustStamp ? base + (base.includes("?") ? "&" : "?") + "t=" + bustStamp : base;
}

function patchAssetWithLocalFile(asset: Asset, item: LocalFile, bustStamp?: number): Asset {
  if (asset.kind === "text") return asset;
  const url = buildLocalAssetUrl(item, bustStamp);
  const data =
    asset.kind === "image"
      ? { ...asset.data, dataUrl: url, mimeType: item.mimeType, bytes: item.bytes }
      : { ...asset.data, url, mimeType: item.mimeType, bytes: item.bytes };
  return {
    ...asset,
    localFile: { id: item.id, path: item.path },
    coverUrl: asset.kind === "image" ? url : asset.coverUrl,
    data,
    metadata: { ...asset.metadata, localFileMissing: false },
  } as Asset;
}

function applySyncPayload(
  payload: SyncPayload,
  forceBustForMissing = false,
): { healedCount: number; missingCount: number; urlByLocalId: Record<string, string> } {
  const resolved = payload.resolved || {};
  const missing = payload.missing || {};
  const bustStamp = Date.now();
  const now = new Date().toISOString();
  const urlByLocalId: Record<string, string> = {};
  let healedCount = 0;
  let changed = false;

  const currentAssets = useAssetStore.getState().assets;
  const nextAssets = currentAssets.map(asset => {
    const localId = asset.localFile?.id;
    if (!localId || asset.kind === "text") return asset;
    const item = resolved[localId];
    if (item) {
      const wasMissing = asset.metadata?.localFileMissing === true;
      const pathChanged = asset.localFile?.path !== item.path;
      const currentUrl = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
      const targetUrl = buildLocalAssetUrl(item, wasMissing || forceBustForMissing ? bustStamp : undefined);
      if (!wasMissing && !pathChanged && !forceBustForMissing && (currentUrl === targetUrl || currentUrl.split(/[?&]t=/)[0] === targetUrl)) {
        urlByLocalId[localId] = currentUrl;
        return asset;
      }
      urlByLocalId[localId] = targetUrl;
      if (wasMissing || pathChanged) healedCount++;
      changed = true;
      return { ...patchAssetWithLocalFile(asset, item, wasMissing || forceBustForMissing ? bustStamp : undefined), updatedAt: now };
    }
    if (Object.prototype.hasOwnProperty.call(missing, localId)) {
      if (asset.metadata?.localFileMissing === true) return asset;
      changed = true;
      return {
        ...asset,
        metadata: { ...asset.metadata, localFileMissing: true },
        updatedAt: now,
      };
    }
    return asset;
  });

  if (changed) {
    useAssetStore.setState({ assets: nextAssets });
  }
  if (typeof window !== "undefined" && Object.keys(urlByLocalId).length > 0) {
    window.dispatchEvent(new CustomEvent("workbench:local-assets-healed", { detail: { urlByLocalId, resolved } }));
  }
  return {
    healedCount: Math.max(healedCount, Number(payload.healedCount) || 0),
    missingCount: Object.keys(missing).length,
    urlByLocalId,
  };
}

export async function refreshLocalAsset(asset: Asset): Promise<Asset> {
  if (!asset.localFile || asset.kind === "text") return asset;
  const bridge = window.desktopBridge;
  if (!bridge?.localAssetResolve) throw Error("原文件引用仅在桌面工作台可用");
  const item: LocalFile = await bridge.localAssetResolve(asset.localFile.id);
  return patchAssetWithLocalFile(asset, item);
}

export async function syncLocalAssets(targetAssets?: Asset[]): Promise<{ healedCount: number; missingCount: number }> {
  const bridge = window.desktopBridge;
  if (!bridge?.localAssetSync) return { healedCount: 0, missingCount: 0 };
  const pool = targetAssets || useAssetStore.getState().assets;
  const ids = [...new Set(pool.flatMap(a => (a.localFile?.id ? [a.localFile.id] : [])))];
  if (!ids.length) return { healedCount: 0, missingCount: 0 };
  const result: SyncPayload = await bridge.localAssetSync(ids);
  const applied = applySyncPayload(result);
  return { healedCount: applied.healedCount, missingCount: applied.missingCount };
}

export async function relinkLocalFolder(
  targetAssets?: Asset[],
): Promise<{ canceled: boolean; healedCount: number; missingCount: number }> {
  const bridge = window.desktopBridge;
  if (!bridge?.localAssetRelinkFolder) throw Error("请使用更新后的桌面工作台进行一键文件夹定位");
  const pool = targetAssets || useAssetStore.getState().assets;
  const ids = [...new Set(pool.flatMap(a => (a.localFile?.id ? [a.localFile.id] : [])))];
  const result: SyncPayload = await bridge.localAssetRelinkFolder({ ids });
  if (result?.canceled) return { canceled: true, healedCount: 0, missingCount: 0 };
  const applied = applySyncPayload(result, true);
  return { canceled: false, healedCount: applied.healedCount, missingCount: applied.missingCount };
}

async function storeLinks(items: LocalFile[], projectId: string) {
  const ids: string[] = [];
  for (const item of items) {
    const url = buildLocalAssetUrl(item);
    const store = useAssetStore.getState();
    const existing = store.assets.find(asset => asset.localFile?.id === item.id);
    let id = existing?.id;
    if (existing) store.updateAsset(existing.id, await refreshLocalAsset(existing));
    else {
      let width = 0, height = 0, durationMs = 0;
      if (item.kind === "image")
        await new Promise<void>(resolve => {
          const image = new Image();
          image.onload = () => { width = image.naturalWidth; height = image.naturalHeight; resolve(); };
          image.onerror = () => resolve();
          image.src = url;
        });
      else
        await new Promise<void>(resolve => {
          const media = document.createElement(item.kind) as HTMLMediaElement;
          const done = () => { media.removeAttribute("src"); media.load(); resolve(); };
          media.preload = "metadata";
          media.onloadedmetadata = () => {
            durationMs = Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : 0;
            if (media instanceof HTMLVideoElement) { width = media.videoWidth; height = media.videoHeight; }
            done();
          };
          media.onerror = done;
          media.src = url;
        });
      const base = {
        title: item.title,
        coverUrl: item.kind === "image" ? url : "",
        tags: [],
        category: item.category,
        source: "local-reference",
        localFile: { id: item.id, path: item.path },
        metadata: { elementAuthor: "我", elementStatus: "none" },
      };
      const data = { url, mimeType: item.mimeType, bytes: item.bytes, width, height, durationMs };
      id = store.addAsset(
        item.kind === "image"
          ? { ...base, kind: "image", data: { ...data, dataUrl: url } }
          : item.kind === "audio"
            ? { ...base, kind: "audio", data }
            : { ...base, kind: "video", data },
      );
    }
    useVideoStudioStore.getState().addElement(id!, projectId);
    ids.push(id!);
  }
  return ids;
}

export async function importLocalElements(projectId: string, files?: File[]) {
  const bridge = window.desktopBridge;
  if (bridge?.localAssetChoose) {
    const items: LocalFile[] = files ? await bridge.localAssetDrop(files) : await bridge.localAssetChoose();
    return storeLinks(items, projectId);
  }
  if (!files) throw Error("请在桌面工作台选择原文件");
  const ids: string[] = [];
  for (const file of files) {
    const base = { title: file.name.replace(/\.[^.]+$/, ""), coverUrl: "", tags: [], category: "未分类", source: "upload" };
    let id: string;
    if (file.type.startsWith("image/")) {
      const image = await uploadImage(file);
      id = useAssetStore.getState().addAsset({ ...base, kind: "image", coverUrl: image.url, data: { ...image, dataUrl: image.url } });
    } else if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
      const media = await uploadMediaFile(file);
      id = useAssetStore.getState().addAsset(
        file.type.startsWith("audio/")
          ? { ...base, kind: "audio", data: media }
          : { ...base, kind: "video", data: { ...media, width: media.width || 0, height: media.height || 0 } },
      );
    } else throw Error("请选择图片、音频或视频");
    useVideoStudioStore.getState().addElement(id, projectId);
    ids.push(id);
  }
  return ids;
}

export async function importLocalFolder(projectId: string) {
  if (!window.desktopBridge?.localAssetChooseFolder) throw Error("请使用更新后的桌面工作台导入文件夹");
  return storeLinks(await window.desktopBridge.localAssetChooseFolder(), projectId);
}

export async function relinkLocalAsset(asset: Asset) {
  if (!asset.localFile || asset.kind === "text") throw Error("此素材不是原文件引用");
  const bridge = window.desktopBridge;
  if (bridge?.localAssetRelinkSingle) {
    const otherIds = useAssetStore
      .getState()
      .assets.flatMap(a => (a.id !== asset.id && a.localFile?.id ? [a.localFile.id] : []));
    const res = await bridge.localAssetRelinkSingle({ id: asset.localFile.id, otherIds });
    if (res?.canceled) return;
    applySyncPayload(res, true);
    return;
  }
  const items: LocalFile[] = await bridge!.localAssetChoose();
  if (!items.length) return;
  if (items.length !== 1 || items[0].kind !== asset.kind) throw Error("请选择一个相同类型的原文件");
  const item = items[0];
  useAssetStore.getState().updateAsset(asset.id, patchAssetWithLocalFile(asset, item, Date.now()));
}

export type LocalAssetReference = { assetId?: string; name: string; storageKey?: string; dataUrl?: string; url?: string };
export function localSourceId(asset?: Asset, reference?: LocalAssetReference, kind?: string) {
  if (asset?.localFile) return asset.localFile.id;
  if (reference) {
    const candidates = assetsForReference(useAssetStore.getState().assets, reference, kind || ""),
      ids = [...new Set(candidates.flatMap(a => (a.localFile ? [a.localFile.id] : [])))];
    if (ids.length === 1) return ids[0];
    const match = /\/workbench\/local-media\/([a-f0-9]{48})(?:[?#]|$)/.exec(reference.dataUrl || reference.url || "");
    if (match) return match[1];
  }
  return "";
}
const recentAutoTrackCooldown = new Map<string, number>();
let pendingAutoTrackTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAutoTrackAssets = new Map<string, Asset>();

export function notifyLocalAssetLoadError(asset: Asset) {
  const localId = asset.localFile?.id;
  if (!localId || typeof window === "undefined" || !window.desktopBridge?.localAssetSync) return;
  const last = recentAutoTrackCooldown.get(localId) || 0;
  if (Date.now() - last < 8000) return;
  recentAutoTrackCooldown.set(localId, Date.now());
  pendingAutoTrackAssets.set(asset.id, asset);
  if (pendingAutoTrackTimer) clearTimeout(pendingAutoTrackTimer);
  pendingAutoTrackTimer = setTimeout(() => {
    const batch = [...pendingAutoTrackAssets.values()];
    pendingAutoTrackAssets.clear();
    pendingAutoTrackTimer = null;
    void syncLocalAssets(batch).catch(() => {});
  }, 180);
}

export async function openLocalAssetFolder(id: string) {
  if (!window.desktopBridge?.localAssetOpenFolder) throw Error("请使用更新后的桌面工作台打开本地素材文件夹");
  await window.desktopBridge.localAssetOpenFolder(id);
}

export async function replaceLocalAssetImage(asset: Asset,files?:File[]): Promise<boolean> {
  if(asset.kind!=="image")throw Error("仅支持替换图片");
  const bridge=window.desktopBridge;if(!bridge?.localAssetChoose)throw Error("请在桌面工作台选择替换图片");
  if(files&&(files.length!==1||!files[0].type.startsWith("image/")))throw Error("请拖入一张图片文件");
  const items:LocalFile[]=files?await bridge.localAssetDrop(files):await bridge.localAssetChoose();if(!items.length)return false;
  if(items.length!==1||items[0].kind!=="image")throw Error("请选择一张替换图片");
  const current=useAssetStore.getState().assets.find(a=>a.id===asset.id);if(!current||current.kind!=="image")throw Error("原素材已改变，请重新选择");
  const item=items[0],patched=patchAssetWithLocalFile(current,item),url=buildLocalAssetUrl(item);
  const size=await new Promise<{width:number;height:number}>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(Error("无法读取替换图片"));image.src=url;});
  const studio=useVideoStudioStore.getState(),project=studio.projects.find(p=>p.id===studio.activeProjectId);
  let backupId="";
  if(project?.elementIds.includes(current.id)){
    const family=groupElements(useAssetStore.getState().assets.filter(a=>project.elementIds.includes(a.id))).find(g=>g.items.some(a=>a.id===current.id));
    const {id:oldId,createdAt,updatedAt,...original}=current;
    backupId=useAssetStore.getState().addAsset({...original,metadata:{...original.metadata,elementManualCategory:elementCategory(current),elementManualGroup:family?.name||'',elementPerformer:family?.name||'',elementRoleGroup:undefined,replacedFrom:oldId}});
    useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===project.id?{...p,elementIds:[...p.elementIds,backupId],elementRules:{...p.elementRules,[backupId]:{...p.elementRules?.[current.id],disabled:true,disabledAt:Date.now()}}}:p)}));
  }
  useAssetStore.getState().updateAsset(current.id,{...patched,data:{...patched.data,...size,storageKey:undefined}} as Partial<Asset>);
  const urlByLocalId:Record<string,string>={[item.id]:url};if(current.localFile)urlByLocalId[current.localFile.id]=url;
  window.dispatchEvent(new CustomEvent("workbench:local-assets-healed",{detail:{urlByLocalId,replacedAssetId:current.id}}));
  if(project){const after=useAssetStore.getState().assets.find(a=>a.id===current.id)!;const restore=(value:Asset,expected:Asset,undo:boolean)=>{const latest=useAssetStore.getState().assets.find(a=>a.id===current.id);if(!latest||latest.localFile?.id!==expected.localFile?.id)throw Error('该图片后来已发生其他替换，不能覆盖；请先核对素材');useAssetStore.getState().updateAsset(current.id,{localFile:value.localFile,coverUrl:value.coverUrl,data:value.data} as Partial<Asset>);if(backupId)useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>{if(p.id!==project.id)return p;const rules={...p.elementRules};if(undo)delete rules[backupId];else rules[backupId]={...p.elementRules?.[current.id],disabled:true,disabledAt:Date.now()};return {...p,elementIds:undo?p.elementIds.filter(id=>id!==backupId):[...new Set([...p.elementIds,backupId])],elementRules:rules};})}));const restoredUrl=value.kind==='image'?value.data.dataUrl:'';window.dispatchEvent(new CustomEvent('workbench:local-assets-healed',{detail:{replacedAssetId:current.id,urlByLocalId:{[item.id]:restoredUrl,...(current.localFile?{[current.localFile.id]:restoredUrl}:{})}}}));};recordElementEdit(project.id,{label:'替换图片',undo:()=>restore(current,after,true),redo:()=>restore(after,current,false)});}
  return true;
}
