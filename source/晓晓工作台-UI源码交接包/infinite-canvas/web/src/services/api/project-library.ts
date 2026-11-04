import { workbench, type Workspace } from "./workbench";

export type LibraryItem = {
    id: string; relativePath: string; displayName: string; mediaType: "image" | "video" | "audio";
    source: "element" | "result"; category?: string; role?: string; size: number; createdAt: string;
    status: string; elementStatus: string; groupIds: string[]; missing?: boolean; url?: string;
    sourcePath?: string; shotId?: string; prompt?: string; model?: string; provider?: string; audioPath?: string;
};
export type LibraryFolder = { id: string; title: string; parent: string; kind: string };
export type ProjectLibrary = { name: string; root: string; brief: string; items: LibraryItem[]; folders: LibraryFolder[]; warnings: string[]; folderLinks?: {id:string;kind:string;path:string;name:string;files?:string[]}[]; folderSelection?: boolean };
export const libraryHref = (root: string, workspace: Workspace, view = "results") => `/projects/library?project=${encodeURIComponent(root)}&workspace=${workspace}&view=${view}`;
export async function libraryCall(method: string, ...args: any[]) {
    const response = await workbench()[method](...args);
    if (response?.ok === false) throw new Error(response.error || "资产库操作失败");
    return response;
}
