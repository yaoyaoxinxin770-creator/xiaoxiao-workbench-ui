"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createStore } from "@/lib/idb-store";
import { nanoid } from "nanoid";
import type {GenerationLog} from '@/app/(user)/video/page';
import {groupCanReplacePrompt,type PromptChange} from "@/app/(user)/video/prompt-replacement";
import { DEFAULT_PROJECT_ID, descendantFolderIds, placementFor, type Placement, type StudioProject, type StudioVideoGroup } from "@/app/(user)/video/studio-model";

const storage = createStore("video_studio");
type VideoStudioStore = {
    ready: boolean; activeProjectId: string; folderId: string;
    drafts: Record<string, any>; views: Record<string, any>; selectedFolders: Record<string,string>;
    saveDraft: (id:string,draft:any) => void; saveView: (id:string,view:any) => void;
    deleteProject: (id:string) => void;
    groups: StudioVideoGroup[]; removedGroups: StudioVideoGroup[]; groupElementIds: Record<string,string[]>;
    restoreGroup:(id:string)=>void; wrapVideo:(log:{id:string;title:string;prompt:string})=>void; addGroupElements:(scope:string,ids:string[])=>void;
    importGroups: (items:{id:string;prompt:string}[],folderId:string) => number;
    removeGroup: (id:string) => void;
    replaceGroupPrompts:(projectId:string,changes:PromptChange[],find:string,replacement:string,logs?:GenerationLog[])=>number;
    linkGroup: (id:string,logIds:string[]) => void;
    projects: StudioProject[]; placements: Record<string, Placement>;
    selectProject: (id: string) => void; selectFolder: (id: string) => void;
    createProject: (name: string) => void; editProject: (patch: Partial<Pick<StudioProject, "name" | "brief" | "globalPrompt">>, projectId?:string) => void;
    addFolder: (name: string) => void; renameFolder: (id: string, name: string, projectId?:string) => void;
    reorderFolder: (id:string, targetId:string, after:boolean) => void;
    deleteFolder: (id:string, projectId?:string) => void;
    place: (ids: string[], patch: Partial<Placement>) => void;
    addElement: (id: string, projectId?: string) => void;
};
export const useVideoStudioStore = create<VideoStudioStore>()(persist((set, get) => ({
    drafts: {}, views: {}, selectedFolders: {},
    saveDraft:(id,draft)=>set(s=>({drafts:{...s.drafts,[id]:draft}})),
    saveView:(id,view)=>set(s=>({views:{...s.views,[id]:view}})),
    deleteProject:id=>set(s=>{const projects=s.projects.filter(p=>p.id!==id);const activeProjectId=s.activeProjectId===id?projects[0]?.id||"":s.activeProjectId;return {projects,activeProjectId,folderId:s.activeProjectId===id?"":s.folderId,groups:s.groups.filter(g=>g.projectId!==id),removedGroups:s.removedGroups.filter(g=>g.projectId!==id),groupElementIds:Object.fromEntries(Object.entries(s.groupElementIds).filter(([key])=>!key.startsWith(id+":"))),placements:s.placements,drafts:Object.fromEntries(Object.entries(s.drafts).filter(([key])=>key!==id)),views:Object.fromEntries(Object.entries(s.views).filter(([key])=>key!==id))};}),
    groups: [], removedGroups: [], groupElementIds: {},
    addGroupElements:(scope,ids)=>set(s=>({groupElementIds:{...s.groupElementIds,[scope]:[...new Set([...(s.groupElementIds[scope]||[]),...ids])]}})),
    restoreGroup:id=>set(s=>{const group=s.removedGroups.find(g=>g.id===id);return group?{groups:[...s.groups,group],removedGroups:s.removedGroups.filter(g=>g.id!==id)}:s;}),
    wrapVideo:log=>{const s=get(),p=placementFor(s.placements,log.id);if(s.groups.some(g=>g.logIds.includes(log.id)))return;const removed=s.removedGroups.find(g=>g.logIds.includes(log.id));if(removed){s.restoreGroup(removed.id);return;}const match=log.prompt.match(/【?视频编号\s*(\d+)/),number=match?.[1]||String(s.groups.filter(g=>g.projectId===p.projectId).length+1).padStart(2,"0");set({groups:[...s.groups,{id:nanoid(),number,title:"视频 "+number,prompt:log.prompt,projectId:p.projectId,folderId:p.folderId,createdAt:Date.now(),logIds:[log.id]}]});},
    importGroups: (items,folderId) => {
        const state=get(), project=state.projects.find(p=>p.id===state.activeProjectId);
        if(!project || (folderId&&!project.folders.some(f=>f.id===folderId)))throw Error("请选择有效的视频文件夹");
        const additions:StudioVideoGroup[]=[];
        for(const item of items){if(state.groups.some(g=>g.projectId===project.id&&g.folderId===folderId&&g.prompt===item.prompt)||additions.some(g=>g.prompt===item.prompt))continue;
            additions.push({id:nanoid(),number:item.id,title:"视频 "+item.id,prompt:item.prompt,projectId:project.id,folderId,createdAt:Date.now(),logIds:[]});}
        set({groups:[...state.groups,...additions]});return additions.length;
    },
    replaceGroupPrompts:(projectId,changes,find,replacement,logs=[])=>{
        const state=get(),ids=new Set(changes.map(change=>change.id)),transform=(source:string)=>source.split(find).join(replacement);
        if(!find||!state.projects.some(p=>p.id===projectId)||ids.size!==changes.length)throw Error("替换范围或查找文本无效");
        for(const change of changes){const group=state.groups.find(g=>g.id===change.id&&g.projectId===projectId);if(!group||!groupCanReplacePrompt(group,logs)||group.prompt!==change.before||change.after!==transform(change.before))throw Error("视频组内容已变化，请重新查看预览后替换");}
        if(!changes.length)return 0;
        const updates=new Map(changes.map(change=>[change.id,change.after])),draft=state.drafts[projectId];
        set({groups:state.groups.map(group=>group.projectId===projectId&&updates.has(group.id)?{...group,prompt:updates.get(group.id)!}:group),...(draft&&ids.has(draft.loadedGroup)?{drafts:{...state.drafts,[projectId]:{...draft,prompt:transform(draft.prompt||"")}}}:{})});return changes.length;
    },
    removeGroup: id => set(s=>({groups:s.groups.filter(g=>g.id!==id),removedGroups:[...s.removedGroups,...s.groups.filter(g=>g.id===id)]})),
    linkGroup: (id,logIds) => set(s=>({groups:s.groups.map(g=>g.id===id?{...g,logIds:[...new Set([...g.logIds,...logIds])]}:g),removedGroups:s.removedGroups.map(g=>g.id===id?{...g,logIds:[...new Set([...g.logIds,...logIds])]}:g)})),
    ready: false, activeProjectId: DEFAULT_PROJECT_ID, folderId: "", placements: {},
    projects: [{ id: DEFAULT_PROJECT_ID, name: "默认视频项目", brief: "", folders: [], elementIds: [] }],
    selectProject: id => { if (get().projects.some(p => p.id === id)) set({ activeProjectId: id, folderId: get().selectedFolders[id] || "" }); },
    selectFolder: id => { if (!id || get().projects.find(p => p.id === get().activeProjectId)?.folders.some(f => f.id === id)) set(s=>({ folderId: id, selectedFolders:{...s.selectedFolders,[s.activeProjectId]:id} })); },
    createProject: name => { if (!name.trim()) return; const project = { id: nanoid(), name: name.trim(), brief: "", folders: [], elementIds: [] }; set(s => ({ projects: [...s.projects, project], activeProjectId: project.id, folderId: "" })); },
    editProject: (patch,projectId=get().activeProjectId) => set(s => ({ projects: s.projects.map(p => p.id === projectId ? { ...p, ...patch } : p) })),
    addFolder: name => { if (!name.trim()) return; const id = nanoid(); set(s => ({ projects: s.projects.map(p => p.id === s.activeProjectId ? { ...p, folders: [...p.folders, { id, name: name.trim(), parentId: s.folderId }] } : p), folderId: id })); },
    renameFolder: (id, name,projectId=get().activeProjectId) => { if (name.trim()) set(s => ({ projects: s.projects.map(p => p.id === projectId ? { ...p, folders: p.folders.map(f => f.id === id ? { ...f, name: name.trim() } : f) } : p) })); },
    reorderFolder: (id,targetId,after) => set(s=>({projects:s.projects.map(p=>{
        if(p.id!==s.activeProjectId || id===targetId)return p;
        const moving=p.folders.find(f=>f.id===id),target=p.folders.find(f=>f.id===targetId);
        if(!moving || !target || moving.parentId!==target.parentId)return p;
        const folders=p.folders.filter(f=>f.id!==id),index=folders.findIndex(f=>f.id===targetId);
        folders.splice(index+(after?1:0),0,moving);return {...p,folders};
    })})),
    deleteFolder: (id,projectId=get().activeProjectId) => set(s=>{
        const project=s.projects.find(p=>p.id===projectId);
        if(!project?.folders.some(f=>f.id===id))return s;
        const removed=descendantFolderIds(project.folders,id);
        return {projects:s.projects.map(p=>p.id===project.id?{...p,folders:p.folders.filter(f=>!removed.has(f.id))}:p),
            folderId:s.activeProjectId===project.id&&removed.has(s.folderId)?"":s.folderId,
            selectedFolders:{...s.selectedFolders,[project.id]:removed.has(s.selectedFolders[project.id])?"":s.selectedFolders[project.id]||""},
            placements:Object.fromEntries(Object.entries(s.placements).map(([key,value])=>[key,value.projectId===project.id&&removed.has(value.folderId)?{...value,folderId:""}:value])),
            groups:s.groups.map(g=>g.projectId===project.id&&removed.has(g.folderId)?{...g,folderId:""}:g),removedGroups:s.removedGroups.map(g=>g.projectId===project.id&&removed.has(g.folderId)?{...g,folderId:""}:g)};
    }),
    place: (ids, patch) => set(s => ({ placements: { ...s.placements, ...Object.fromEntries(ids.map(id => [id, { ...placementFor(s.placements, id), ...patch }])) } })),
    addElement: (id, projectId = get().activeProjectId) => set(s => ({ projects: s.projects.map(p => p.id === projectId ? { ...p, elementIds: [...new Set([...p.elementIds, id])] } : p) })),
}), {
    name: "video-studio-projects", storage: createJSONStorage(() => ({
        getItem: name => storage.getItem<string>(name), setItem: async (name, value) => { await storage.setItem(name, value); }, removeItem: name => storage.removeItem(name),
    })),
    skipHydration: typeof window === "undefined",
    partialize: ({ projects, placements, activeProjectId, folderId, groups, removedGroups, groupElementIds, drafts, views, selectedFolders }) => ({ projects, placements, activeProjectId, folderId, groups, removedGroups, groupElementIds, drafts, views, selectedFolders }),
    onRehydrateStorage: () => (_state, error) => { if (error) console.error("视频项目配置读取失败", error); useVideoStudioStore.setState({ ready: !error }); },
}));
