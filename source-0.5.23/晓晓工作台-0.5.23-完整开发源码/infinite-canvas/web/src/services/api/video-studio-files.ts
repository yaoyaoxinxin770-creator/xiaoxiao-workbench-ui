import { getMediaBlob, resolveMediaUrl, downloadRemoteMedia } from "@/services/file-storage";
import type { StudioProject } from "@/app/(user)/video/studio-model";
import type { GenerationLog } from "@/app/(user)/video/page";
import { placementFor } from "@/app/(user)/video/studio-model";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";

export type StudioResolvedVideo = { path: string; folderId: string; projectId: string; bytes: number; url: string };

const bridge = () => { const api=window.desktopBridge;if(!api?.videoStudioSync)throw Error("请使用新版本地桌面工作台管理视频文件夹");return api; };
const localVideoCache = new Map<string, StudioResolvedVideo>();

export async function resolveStudioVideoInfo({ videoId = "", projectId = "", taskId = "" }: { videoId?: string; projectId?: string; taskId?: string }): Promise<StudioResolvedVideo | null> {
    if (typeof window === "undefined" || !window.desktopBridge?.videoStudioResolve) return null;
    if (!videoId && !taskId) return null;
    const cacheKey = `${projectId}|${videoId}|${taskId}`;
    const cached = localVideoCache.get(cacheKey);
    if (cached?.url) return cached;
    try {
        const resolved = (await window.desktopBridge.videoStudioResolve({ videoId, projectId, taskId })) as StudioResolvedVideo | null;
        if (resolved?.url) localVideoCache.set(cacheKey, resolved);
        return resolved || null;
    } catch {
        return null;
    }
}

export async function resolveLogVideoCandidates(log: { id?: string; video?: { id?: string; url?: string; storageKey?: string; bytes?: number; fallbackUrl?: string } | null; task?: { id?: string } | null }): Promise<{ candidates: string[]; bytes: number }> {
    if (!log.video) return { candidates: [], bytes: 0 };
    const store = useVideoStudioStore.getState();
    const projectId = log.id ? placementFor(store.placements, log.id).projectId : store.activeProjectId;
    const [local, mediaUrl] = await Promise.all([
        resolveStudioVideoInfo({ videoId: log.id || "", projectId, taskId: log.task?.id || log.video.id || "" }),
        resolveMediaUrl(log.video.storageKey, log.video.url || "").catch(() => log.video?.url || ""),
    ]);
    const candidates = [local?.url || "", mediaUrl || "", log.video.fallbackUrl || "", log.video.url || ""].filter(
        (url, index, list): url is string => Boolean(url) && list.indexOf(url) === index,
    );
    return { candidates, bytes: log.video.bytes || local?.bytes || 0 };
}

export async function resolvePlayableVideo<T extends { id?: string; url: string; storageKey: string; bytes: number; fallbackUrl?: string }>(log: { id?: string; video?: T | null; task?: { id?: string } | null }): Promise<(T & { fallbackUrl?: string }) | undefined> {
    if (!log.video) return undefined;
    const { candidates, bytes } = await resolveLogVideoCandidates(log);
    return {
        ...log.video,
        url: candidates[0] || "",
        fallbackUrl: candidates[1] || undefined,
        bytes: bytes || log.video.bytes,
    };
}

export const syncStudioDirectory = (project:StudioProject,change=false) => bridge().videoStudioSync({id:project.id,name:project.name,folders:project.folders,change});
const writes=new Map<string,Promise<void>>();
export async function archiveStudioVideo(log:GenerationLog) {
    if(!log.video)return;
    if(writes.has(log.id))return writes.get(log.id);
    const job=(async()=>{
        const store=useVideoStudioStore.getState(), placement=placementFor(store.placements,log.id), project=store.projects.find(p=>p.id===placement.projectId);
        if(!project)return;
        await syncStudioDirectory(project);
        const saved=await bridge().videoStudioVideoInfo({projectId:project.id,videoId:log.id});
        if(saved){if(saved.folderId!==placement.folderId)await bridge().videoStudioMove({projectId:project.id,ids:[log.id],folderId:placement.folderId});return;}
        const video=log.video!;
        const blob=video.storageKey?await getMediaBlob(video.storageKey).catch(()=>null):null;
        let sourceUrl = blob ? "" : await resolveMediaUrl(video.storageKey, video.url).catch(() => video.url || "");
        if (!blob && !sourceUrl) {
            const recovered = await resolveStudioVideoInfo({ videoId: log.id, projectId: project.id, taskId: log.task?.id || video.id });
            sourceUrl = recovered?.url || "";
        }
        if (!blob && !sourceUrl) return;
        const file=blob||await downloadRemoteMedia(sourceUrl);
        const latest=useVideoStudioStore.getState();if(!latest.projects.some(p=>p.id===project.id))return;
        const destination=placementFor(latest.placements,log.id);
        await bridge().videoStudioWrite({projectId:project.id,folderId:destination.folderId,videoId:log.id,title:log.title||log.prompt.slice(0,40),mimeType:video.mimeType,bytes:new Uint8Array(await file.arrayBuffer())});
        localVideoCache.clear();
    })();writes.set(log.id,job);
    try{await job;}finally{writes.delete(log.id);}
}
export async function archiveStudioProject(project:StudioProject,logs:GenerationLog[]) {
    await syncStudioDirectory(project);
    for(const log of logs)if(log.video&&placementFor(useVideoStudioStore.getState().placements,log.id).projectId===project.id)await archiveStudioVideo(log);
}
export async function moveStudioVideos(project:StudioProject,logs:GenerationLog[],ids:string[],folderId:string) {
    await syncStudioDirectory(project);
    for(const log of logs)if(ids.includes(log.id)&&log.video)await archiveStudioVideo(log);
    await bridge().videoStudioMove({projectId:project.id,ids,folderId});
    useVideoStudioStore.getState().place(ids,{projectId:project.id,folderId});
}
export const openStudioDirectory = async(project:StudioProject,folderId:string) => {await syncStudioDirectory(project);return bridge().videoStudioOpenStorageDir({projectId:project.id,folderId});};
export const recycleStudioProject = async (id:string) => { const res = await bridge().videoStudioRecycle(id); localVideoCache.clear(); return res; };

export async function saveStudioVideoShortcuts(project:StudioProject,logs:GenerationLog[],ids:string[]){
 const selected=logs.filter(log=>ids.includes(log.id)&&log.video&&placementFor(useVideoStudioStore.getState().placements,log.id).projectId===project.id);
 if(!selected.length)throw Error("所选任务还没有可保存快捷方式的视频");
 for(const log of selected)await archiveStudioVideo(log);
 const api=bridge();if(!api.videoStudioShortcuts)throw Error("请重启更新后的桌面工作台");
 return api.videoStudioShortcuts({projectId:project.id,ids:selected.map(log=>log.id)});
}
