"use client";
import { createStore } from "@/lib/idb-store";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveStudioVideoInfo } from "@/services/api/video-studio-files";

type Source = { id: string; url: string; storageKey: string; bytes: number; logId?: string; taskId?: string };
const storage = createStore("video_posters");
const queue: (() => Promise<void>)[] = [];
const cache = new Map<string, Blob>();
let decoding = 0;
function pump() {
    while (decoding < 2 && queue.length) { decoding++; queue.shift()!().finally(() => { decoding--; pump(); }); }
}
export function requestVideoPoster(source: Source, signal: AbortSignal): Promise<Blob | null> {
    const key = `${source.storageKey || source.id}:${source.bytes}`;
    return new Promise(resolve => {
        queue.push(async () => {
            try {
            if (signal.aborted) { resolve(null); return; }
            let blob = cache.get(key) || await storage.getItem<Blob>(key).catch(() => null);
            if (!blob && !signal.aborted) {
                const local = (source.logId || source.taskId) ? await resolveStudioVideoInfo({ videoId: source.logId || "", taskId: source.taskId || source.id }) : null;
                const mediaUrl = local?.url || await resolveMediaUrl(source.storageKey, source.url);
                if (mediaUrl) blob = await extractPoster(mediaUrl, signal);
                if (!blob && local?.url && source.url && local.url !== source.url && !signal.aborted) {
                    const fallback = await resolveMediaUrl(source.storageKey, source.url);
                    if (fallback && fallback !== local.url) blob = await extractPoster(fallback, signal);
                }
                if (blob) await storage.setItem(key, blob).catch(() => {});
            }
            if (blob) { cache.delete(key); cache.set(key, blob); if (cache.size > 100) cache.delete(cache.keys().next().value!); }
            resolve(signal.aborted ? null : blob || null);
            } catch { resolve(null); }
        });
        pump();
    });
}
function extractPoster(url: string, signal: AbortSignal): Promise<Blob | null> {
    return new Promise(resolve => {
        const video = document.createElement("video");
        video.muted = true; video.playsInline = true; video.preload = "auto";
        video.crossOrigin = "anonymous";
        let settled = false;
        const finish = (blob: Blob | null) => {
            if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
            video.onloadeddata = video.onseeked = video.onerror = null; video.pause(); video.removeAttribute("src"); video.load(); resolve(blob);
        };
        const abort = () => finish(null);
        const timer = setTimeout(abort, 12000);
        signal.addEventListener("abort", abort, { once: true });
        const capture = () => {
            if (signal.aborted || !video.videoWidth) { finish(null); return; }
            try {
                const canvas = document.createElement("canvas"); canvas.width = Math.min(640, video.videoWidth); canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
                canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(finish, "image/jpeg", 0.78);
            } catch { finish(null); }
        };
        video.onerror = abort; video.onseeked = capture;
        video.onloadeddata = () => { if (video.duration > 0.1) video.currentTime = 0.05; else capture(); };
        if (signal.aborted) abort(); else video.src = url;
    });
}
