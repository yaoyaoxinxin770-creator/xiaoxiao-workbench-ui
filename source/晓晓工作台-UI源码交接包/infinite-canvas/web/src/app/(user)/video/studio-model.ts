export type ReviewState = "none" | "in-progress" | "pending" | "approved" | "rejected";
export type StudioVideoGroup = { id:string; number:string; title:string; prompt:string; projectId:string; folderId:string; createdAt:number; logIds:string[]; color?:string; bindings?:Record<string,string> };
export type StudioFolder = { id: string; name: string; parentId: string };
export type ElementReferenceRule = { disabled?:boolean; disabledAt?:number; priority?:number; priorityOrder?:number; priorityHistoryOrder?:number; name?:string };
export type StudioProject = { id: string; name: string; brief: string; folders: StudioFolder[]; elementIds: string[]; elementRules?:Record<string,ElementReferenceRule>;videoColorLabels?:Record<string,string>;globalPrompt?:import('./project-prompt').ProjectPrompt };
export type Placement = { projectId: string; folderId: string; review: ReviewState; trashedAt?: number; liked?: boolean; downloadedAt?: number; color?:string; note?:string; lastViewedAt?: number };
export const DEFAULT_PROJECT_ID = "video-default";
export const REVIEW_OPTIONS = [{ value: "none", label: "无状态" }, { value: "in-progress", label: "进行中" }, { value: "pending", label: "待审" }, { value: "approved", label: "已通过" }, { value: "rejected", label: "已拒绝" }];
export function placementFor(placements: Record<string, Placement>, id: string): Placement {
    return placements[id] || { projectId: DEFAULT_PROJECT_ID, folderId: "", review: "none" };
}
export function descendantFolderIds(folders: StudioFolder[], id: string): Set<string> {
    const ids = new Set([id]);
    for (let changed = true; changed;) {
        changed = false;
        for (const folder of folders) if (ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true; }
    }
    return ids;
}
export function folderTrail(folders: StudioFolder[], id: string): StudioFolder[] {
    const result: StudioFolder[] = [], visited = new Set<string>();
    while (id && !visited.has(id)) { visited.add(id); const folder = folders.find(item => item.id === id); if (!folder) break; result.unshift(folder); id = folder.parentId; }
    return result;
}
export function inStudioScope(placement: Placement, project: StudioProject, folderId: string, trash: boolean): boolean {
    return placement.projectId === project.id && Boolean(placement.trashedAt) === trash && (!folderId || placement.folderId === folderId);
}

// Labels belong to the source video, never to a filtered list position.
export function studioVideoNumber(log:{id:string;prompt?:string;title?:string},fallback:number,group?:StudioVideoGroup) {
 const source=[log.prompt,log.title].find(text=>/【\s*视频编号\s*[Vv]?\d+/u.test(text||''));
 const number=source?.match(/【\s*视频编号\s*([Vv]?\d+(?:-\d+)*)/u)?.[1]||group?.number||String(fallback);
 const attempt=group?.logIds.indexOf(log.id)??-1;
 return number.padStart(2,'0')+(attempt>0?' · '+(attempt+1):'');
}
export function studioFileError(error:unknown) {
 const text=error instanceof Error?error.message:String(error);
 if(text.includes('ENOENT'))return '本地视频文件或目标文件夹不存在，请重试保存视频后再移动。';
 return text.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
}
