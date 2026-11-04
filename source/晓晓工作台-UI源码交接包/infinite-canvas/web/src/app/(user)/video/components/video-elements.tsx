"use client";
import {pendingStudioAsset,consumeStudioAsset} from '../asset-navigation';
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { App, Button, Checkbox, Dropdown, Empty, Input, Modal, Popover, Select, Slider, Table } from "antd";
import { AtSign, FolderSearch, LayoutGrid, PanelRightClose, PanelRightOpen, Plus, RefreshCw, SlidersHorizontal, Sparkles, Star, Trash2, Upload, EyeOff, Search, ChevronDown } from "lucide-react";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";
import { useWorkbenchLayoutStore } from "@/stores/use-workbench-layout-store";
import { uploadImage } from "@/services/image-storage";
import { importLocalElements, importLocalFolder, relinkLocalAsset, relinkLocalFolder, syncLocalAssets } from "@/services/api/local-assets";
import { uploadMediaFile } from "@/services/file-storage";
import { ELEMENT_CATEGORIES, elementInfo, filterElements, groupElements, elementCategory, elementPinnedAt, detectUncategorizedSuggestions, dedupeProjectAssets, elementPreviewVariants, sameElementSource, compareElementOrder, elementPriorityPatch } from "../element-model";
import {stepElementHistory} from "../element-edit-history";
import {LocalAssetMenu} from "./local-asset-menu";
import {useElementMoves} from '../use-element-moves';
import {draggedElementIds} from '../element-organize';
import {useElementGrouping} from "../use-element-grouping";
import {ElementArchive} from "./element-archive";
import { ElementLibrary } from "./element-library";
import { MediaSelection } from "./media-selection";
import {favoriteMetadata} from "../element-favorites";
import { ElementAssetCard, ElementThumbnail } from "./element-asset-card";
import { ElementInspectorPanel } from "./element-inspector-panel";
import type {ElementReferenceRule} from "../studio-model";
import { REVIEW_OPTIONS } from "../studio-model";

type VideoElementsProps = {
    active?: boolean;
    search: string;
    onSearch: (value: string) => void;
    toolbarTarget: HTMLElement | null;
    sidebarTarget: HTMLElement | null;
    inspectorTarget?: HTMLElement | null;
    onUseAsset: (asset: Asset) => void;
};

export function VideoElements({ active=true, search, onSearch, toolbarTarget, sidebarTarget, inspectorTarget=null, onUseAsset }: VideoElementsProps) {
    const assets = useAssetStore(state => state.assets);
    const addAsset=useAssetStore(s=>s.addAsset),updateAsset=useAssetStore(s=>s.updateAsset);
    const projects=useVideoStudioStore(s=>s.projects),activeProjectId=useVideoStudioStore(s=>s.activeProjectId),addElement=useVideoStudioStore(s=>s.addElement);
    const inspectorOpen = useWorkbenchLayoutStore(s => s.inspectorOpen);
    const toggleInspector = useWorkbenchLayoutStore(s => s.toggleInspector);
    const setInspectorOpen = useWorkbenchLayoutStore(s => s.setInspectorOpen);
    const project = projects.find(item => item.id === activeProjectId) || projects[0];
    const projectAssets = useMemo(()=>{const ids=new Set(project.elementIds);return assets.filter(asset=>ids.has(asset.id));},[assets,project.elementIds]);
    const { message, modal } = App.useApp();
    const moves=useElementMoves();
    useEffect(()=>{if(!active)return;const key=(e:KeyboardEvent)=>{if(e.defaultPrevented||!(e.ctrlKey||e.metaKey)||!['z','y'].includes(e.key.toLowerCase()))return;const target=e.target as HTMLElement;if(target?.closest('input,textarea,[contenteditable=true],[data-video-composer]'))return;try{const label=stepElementHistory(project.id,e.shiftKey||e.key.toLowerCase()==='y');if(label){e.preventDefault();message.success((e.shiftKey||e.key.toLowerCase()==='y'?'已重做':'已撤销')+label);}}catch(error){e.preventDefault();message.error(error instanceof Error?error.message:'无法撤销');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active,project.id]);
    const remove = (asset: Asset) => modal.confirm({title:"删除元素",content:`将「${asset.title}」从当前项目元素库移除？原文件会保留。`,okText:"删除",cancelText:"取消",okButtonProps:{danger:true},onOk:()=>{useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===project.id?{...p,elementIds:p.elementIds.filter(id=>id!==asset.id)}:p)}));}});

    const [category, setCategory] = useState("全部"), [kind, setKind] = useState("all"), [author, setAuthor] = useState("all"), [performer, setPerformer] = useState("all"), [status, setStatus] = useState("all"), [sort, setSort] = useState("serial");
    const [selectedRole,setSelectedRole]=useState("");
    const [disabledOpen,setDisabledOpen]=useState<Record<string,boolean>>({});
    const [inspectedId, setInspectedId] = useState<string>("");
    const archiveGroups=useMemo(()=>groupElements(dedupeProjectAssets(projectAssets, project.elementRules).kept),[projectAssets,project.elementRules]);
    const projectView=useVideoStudioStore(s=>s.views[project.id]);
    const hiddenRoleKeys=(projectView?.hiddenRoleKeys||[]) as string[];
    const setRoleHidden=(key:string,hidden:boolean)=>{const store=useVideoStudioStore.getState(),view=store.views[project.id]||{},keys=view.hiddenRoleKeys||[];store.saveView(project.id,{...view,hiddenRoleKeys:hidden?[...new Set([...keys,key])]:keys.filter((id:string)=>id!==key)});};
    const hiddenRoleGroups=archiveGroups.filter(g=>g.category==="人物"&&hiddenRoleKeys.includes(g.key));
    const uncatSuggestions = useMemo(() => detectUncategorizedSuggestions(projectAssets, project.elementRules), [projectAssets, project.elementRules]);
    const missingLocalAssets = useMemo(() => projectAssets.filter(a => a.localFile && a.metadata?.localFileMissing === true), [projectAssets]);
    const [relinking, setRelinking] = useState(false);
    // The video page owns project/focus syncing; opening this tab must not run it twice.
    const chooseCategory=(value:string)=>{setCategory(value);setSelectedRole("");};
    const [layout, setLayout] = useState("archive"), [size, setSize] = useState(200);
    const [group,setGroup]=useElementGrouping(category==="场景"?"none":"name");
    const [editing, setEditing] = useState<{ asset: Asset | null; projectId: string } | null>(null);
    const [aliases,setAliases]=useState("");
    const [title, setTitle] = useState(""), [editCategory, setEditCategory] = useState("人物"), [editPerformer, setEditPerformer] = useState("");
    const [rule,setRule]=useState<ElementReferenceRule>({});
    const saveRule=(id:string,patch:ElementReferenceRule,projectId=project.id)=>useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===projectId?{...p,elementRules:{...p.elementRules,[id]:{...p.elementRules?.[id],...patch,...(patch.priority!==undefined?elementPriorityPatch(p.elementRules?.[id]||{},patch.priority,p.elementRules||{}):{}),...(patch.disabled&&!p.elementRules?.[id]?.disabled?{disabledAt:Date.now()}:{})}}}:p)}));
    const ruleSelected=(patch:ElementReferenceRule)=>{for(const asset of selectedAssets)saveRule(asset.id,patch);setSelectedIds([]);};
    const [dragging, setDragging] = useState(false);
    const [selectedIds,setSelectedIds]=useState<string[]>([]);
    const selectedSet=useMemo(()=>new Set(selectedIds),[selectedIds]);
    const selectedAssets=projectAssets.filter(asset=>selectedSet.has(asset.id));
    const select=(id:string,checked:boolean)=>setSelectedIds(ids=>checked?[...new Set([...ids,id])]:ids.filter(value=>value!==id));
    const favoriteSelected=()=>{for(const asset of selectedAssets)updateAsset(asset.id,{metadata:favoriteMetadata(asset,true)});setSelectedIds([]);};
    const [dropTarget,setDropTarget]=useState('');
    const dropProps=(key:string)=>({onDragOver:(event:React.DragEvent)=>{if(!event.dataTransfer.types.includes('application/x-video-element'))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=key==='category:音频'||key==='category:视频'||key==='category:全部'?'none':'move';setDropTarget(key);},onDragLeave:()=>setDropTarget(''),onDrop:(event:React.DragEvent)=>{const id=event.dataTransfer.getData('application/x-video-element');if(!id)return;event.preventDefault();event.stopPropagation();setDropTarget('');const ids=draggedElementIds(id,selectedIds),items=projectAssets.filter(a=>ids.includes(a.id));moves.choose(items,key);},'data-drop-active':dropTarget===key||undefined,style:dropTarget===key?{outline:'2px solid var(--primary)',outlineOffset:-2}:undefined});
    const relinkSelected=async(folder=false)=>{setRelinking(true);try{if(folder){const r=await relinkLocalFolder(selectedAssets);if(!r.canceled)message.success('已恢复 '+r.healedCount+' 个所选素材');}else{for(const asset of selectedAssets.filter(a=>a.localFile))await relinkLocalAsset(asset);message.success('所选素材定位已完成');}}catch(e){message.error(e instanceof Error?e.message:'定位失败');}finally{setRelinking(false);}};
    const content=useRef<HTMLElement>(null);
    useEffect(()=>{const apply=(detail:ReturnType<typeof pendingStudioAsset>)=>{if(!active||detail?.projectId!==project.id)return;chooseCategory(detail.category||'视频');onSearch('');setKind('all');setAuthor('all');setPerformer('all');setStatus('all');setInspectedId(detail.id);setSelectedIds([detail.id]);consumeStudioAsset(detail.id);};const show=(event:Event)=>apply((event as CustomEvent).detail);apply(pendingStudioAsset(project.id));window.addEventListener('workbench:show-asset',show);return()=>window.removeEventListener('workbench:show-asset',show);},[project.id,active]);
    const [file, setFile] = useState<File | null>(null), [saving, setSaving] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const filtered = useMemo(()=>{
        const role=archiveGroups.find(g=>g.key===selectedRole),roleIds=role?new Set(archiveGroups.filter(g=>g.key===role.key||(g.category==="音频"&&g.name===role.name)).flatMap(g=>g.items.map(a=>a.id))):null;
        const visible=projectAssets.filter(a=>(category==="已禁用"?Boolean(project.elementRules?.[a.id]?.disabled):!project.elementRules?.[a.id]?.disabled)&&(!roleIds||roleIds.has(a.id)));
        return filterElements(dedupeProjectAssets(visible, project.elementRules).kept,{search,category:category==="已禁用"?"全部":category,kind,author,performer,status,sort,rules:project.elementRules});
    },[projectAssets,project.elementRules,archiveGroups,selectedRole,search,category,kind,author,performer,status,sort]);

    const disabledFiltered=useMemo(()=>{const role=archiveGroups.find(g=>g.key===selectedRole),ids=role?new Set(archiveGroups.filter(g=>g.key===role.key||g.category==="音频"&&g.name===role.name).flatMap(g=>g.items.map(a=>a.id))):null;return filterElements(projectAssets.filter(a=>project.elementRules?.[a.id]?.disabled&&(!ids||ids.has(a.id))&&(!selectedRole||a.kind==="audio")),{search,category:category==="已禁用"?"全部":category,kind,author,performer,status,sort,rules:project.elementRules});},[projectAssets,project.elementRules,archiveGroups,selectedRole,search,category,kind,author,performer,status,sort]);
    const disabledCategories=category==="已禁用"?[]:selectedRole?(disabledFiltered.length?["音频"]:[]):category==="全部"?["人物","场景","道具","音频","视频"]:[category];

    const inspectedAsset = useMemo(() => {
        if (inspectedId) {
            const hit = projectAssets.find(a => a.id === inspectedId);
            if (hit) return hit;
        }
        return filtered[0] || projectAssets[0] || null;
    }, [inspectedId, projectAssets, filtered]);

    const inspectedFamily = useMemo(() => {
        if (!inspectedAsset) return { name: "", items: [] as Asset[] };
        const found = archiveGroups.find(g => g.items.some(a => a.id === inspectedAsset.id));
        const raw = found ? found.items : [inspectedAsset];
        const kept = elementPreviewVariants(raw, project.elementRules, inspectedAsset.id);
        return { name: found ? found.name : inspectedAsset.title, items: kept.sort((a,b)=>compareElementOrder(a,b,project.elementRules)) };
    }, [inspectedAsset, archiveGroups, project.elementRules]);

    const mergeUncategorized = () => {
        if (!uncatSuggestions.length) return;
        for (const suggestion of uncatSuggestions) {
            const asset = projectAssets.find(item => item.id === suggestion.assetId);
            if (!asset) continue;
            updateAsset(asset.id, { category: suggestion.suggestedCategory, metadata: suggestion.suggestedPerformer ? { ...asset.metadata, elementPerformer: suggestion.suggestedPerformer } : asset.metadata });
        }
        message.success(`智能整理完成：归类 ${uncatSuggestions.length} 项，相同来源副本已折叠显示`);
    };

    const open = (asset: Asset | null) => {
        if (asset) setInspectedId(asset.id);
        setAliases(Array.isArray(asset?.metadata?.elementAliases)?asset.metadata.elementAliases.join("、"):"");setRule(asset?{...project.elementRules?.[asset.id]}:{});setTitle(asset?.title || ""); setEditCategory(asset?elementCategory(asset):"人物"); setEditPerformer(asset?(archiveGroups.find(g=>g.items.some(a=>a.id===asset.id))?.name||""):""); setFile(null); setEditing({ asset, projectId: project.id });
    };
    const save = async () => {
        if (!editing || !title.trim() || saving) return;
        const target = editing;
        setSaving(true);
        try {
            const metadata = { ...target.asset?.metadata, elementAliases:[...new Set(aliases.split(/[、,，;；]+/).map(v=>v.trim()).filter(Boolean))], elementPerformer: editCategory==="未分类"?"":editPerformer.trim(), elementManualCategory:editCategory, elementManualGroup:editCategory==="未分类"?"":editPerformer.trim(), ...(editCategory!=="人物"||editPerformer.trim()!==target.asset?.metadata?.elementPerformer?{elementRoleGroup:undefined}:{}) };
            if (target.asset) {updateAsset(target.asset.id, { title: title.trim(), category: editCategory, metadata });saveRule(target.asset.id,rule,target.projectId);}
            else {
                const base = { title: title.trim(), category: editCategory, coverUrl: "", tags: [], metadata };
                let id: string;
                if (file && window.desktopBridge?.localAssetDrop) {
                    const ids = await importLocalElements(target.projectId, [file]); id = ids[0]; updateAsset(id,{title:title.trim(),category:editCategory,metadata});
                } else if (file?.type.startsWith("image/")) {
                    const image = await uploadImage(file);
                    id = addAsset({ ...base, kind: "image", coverUrl: image.url, data: { ...image, dataUrl: image.url } });
                } else if (file && (file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
                    const media = await uploadMediaFile(file);
                    id = file.type.startsWith("audio/") ? addAsset({ ...base, kind: "audio", data: media }) : addAsset({ ...base, kind: "video", data: { ...media, width: media.width || 0, height: media.height || 0 } });
                } else if (file) throw new Error("请选择图片、音频或视频文件");
                else id = addAsset({ ...base, kind: "text", data: { content: "" } });
                addElement(id, target.projectId);saveRule(id,rule,target.projectId);
            }
            setEditing(null); message.success(target.asset ? "元素已保存" : "元素已添加到项目");
        } catch (error) { message.error(error instanceof Error ? error.message : "保存元素失败"); }
        finally { setSaving(false); }
    };
    const importFiles = async (files?: File[]) => {
        const importCategory=category,projectId=project.id,role=archiveGroups.find(g=>g.key===selectedRole&&g.category==="人物"),previousIds=new Set(project.elementIds),previousAssets=new Set(assets.map(a=>a.id));
        setSaving(true);
        try {
            const ids=await importLocalElements(projectId,files);
            if(role)for(const id of ids){
                const asset=useAssetStore.getState().assets.find(a=>a.id===id);
                if(!asset||!["image","audio","video"].includes(asset.kind))continue;
                const assignedCategory=asset.kind==="audio"?"音频":asset.kind==="video"?"视频":"人物";
                const metadata={...asset.metadata,elementPerformer:role.name,elementRoleGroup:role.key,elementManualCategory:assignedCategory,elementManualGroup:role.name};
                // Reusing an original file must not rename another role or another project's asset.
                if(previousAssets.has(id)&&asset.metadata?.elementRoleGroup!==role.key){
                    const {id:originalId,createdAt,updatedAt,...copy}=asset;
                    const existing=useAssetStore.getState().assets.find(a=>a.metadata?.elementRoleGroup===role.key&&sameElementSource(a,asset));
                    const assignedId=existing?.id||addAsset({...copy,category:assignedCategory,metadata});
                    useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===projectId?{...p,elementIds:[...new Set([...p.elementIds.filter(value=>value!==originalId||previousIds.has(originalId)),assignedId])]}:p)}));
                }else updateAsset(id,{category:assignedCategory,metadata});
            }
            if(!role&&["人物","场景","道具","未分类"].includes(importCategory))for(const id of ids){const asset=useAssetStore.getState().assets.find(a=>a.id===id);if(asset?.kind==="image")updateAsset(id,{category:importCategory,metadata:{...asset.metadata,elementManualCategory:importCategory,elementManualGroup:"",elementPerformer:"",elementRoleGroup:undefined}});}
            if(ids.length)message.success(`已引用 ${ids.length} 个原文件${role?`，素材已归入「${role.name}」`:""}`);
        }catch(error){message.error(error instanceof Error?error.message:"引用失败");}
        finally{setSaving(false);setDragging(false);}
    };
    const importFolder=async()=>{const projectId=project.id;setSaving(true);try{const ids=await importLocalFolder(projectId);if(ids.length)message.success("已导入 "+ids.length+" 个素材");else message.info("文件夹中没有支持的图片、音频或视频");}catch(error){message.error(error instanceof Error?error.message:"导入失败");}finally{setSaving(false);}};
    const handleAutoTrack = async () => {
        setRelinking(true);
        try {
            const res = await syncLocalAssets(projectAssets);
            if (res.healedCount > 0) {
                message.success(`自动追踪完成：已找回 ${res.healedCount} 个改名/移动的素材${res.missingCount > 0 ? `，仍有 ${res.missingCount} 个需选择文件夹定位` : ""}`);
            } else if (res.missingCount > 0) {
                message.info(`仍有 ${res.missingCount} 个素材无法自动推算位置，请点击「选择文件夹一键定位」`);
            } else {
                message.success("当前项目所有本地素材路径均已正常连接");
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "自动追踪失败");
        } finally {
            setRelinking(false);
        }
    };
    const handleRelinkFolder = async () => {
        setRelinking(true);
        try {
            const res = await relinkLocalFolder(projectAssets);
            if (!res.canceled) {
                if (res.healedCount > 0) {
                    message.success(`一键定位完成：已批量恢复 ${res.healedCount} 个素材${res.missingCount > 0 ? `（剩余 ${res.missingCount} 个不在该目录）` : ""}`);
                } else if (res.missingCount > 0) {
                    message.warning("所选文件夹中未找到匹配的缺失素材，请选择存放图片/音频的上级文件夹重试");
                } else {
                    message.success("当前项目所有本地素材均已正常连接");
                }
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "一键定位失败");
        } finally {
            setRelinking(false);
        }
    };
    const use = (asset: Asset) => { if(project.elementRules?.[asset.id]?.disabled){message.info("此元素已禁用，请先在编辑元素中启用");return;} updateAsset(asset.id, { metadata: { ...asset.metadata, elementLastUsedAt: Date.now() } }); onUseAsset(asset); };
    const options = (values: string[]) => [{ value: "all", label: "全部" }, ...Array.from(new Set(values)).filter(Boolean).map(value => ({ value, label: value }))];
    const filter = <div className="grid w-60 gap-3"><label>作者<Select aria-label="筛选元素作者" className="w-full" value={author} onChange={setAuthor} options={options(projectAssets.map(asset => elementInfo(asset).author))}/></label><label>演员<Select aria-label="筛选元素演员" className="w-full" value={performer} onChange={setPerformer} options={options(projectAssets.map(asset => elementInfo(asset).performer))}/></label><label>状态<Select aria-label="筛选元素状态" className="w-full" value={status} onChange={setStatus} options={[{ value: "all", label: "全部" }, ...REVIEW_OPTIONS]}/></label><label>素材类型<Select aria-label="项目素材类型" className="w-full" value={kind} onChange={setKind} options={[{value:"all",label:"全部素材"},{value:"image",label:"图片"},{value:"audio",label:"音频"},{value:"video",label:"视频"},{value:"text",label:"文本"}]}/></label><label>排序方式<Select aria-label="元素排序" className="w-full" value={sort} onChange={setSort} options={[{value:"serial",label:"按序号"},{value:"name",label:"名称（A—Z）"},{value:"newest",label:"最近创建"},{value:"used",label:"最近使用"},{value:"oldest",label:"最早创建"}]}/></label><Button onClick={()=>{setAuthor("all");setPerformer("all");setStatus("all");setKind("all");setSort("serial");}}>清除筛选</Button></div>;
    const view = <div className="grid w-56 gap-3"><label>布局<Select aria-label="元素布局" className="w-full" value={layout} onChange={setLayout} options={[{value:"archive",label:"智能叠卡归档"},{value:"grid",label:"网格"},{value:"kanban",label:"看板"},{value:"table",label:"表格"}]}/></label><label>分组<Select aria-label="元素分组" className="w-full" value={group} onChange={setGroup} options={[{value:"none",label:"不分组"},{value:"date",label:"创建日期"},{value:"name",label:"名称"}]}/></label><label>卡片尺寸<Slider aria-label="元素卡片尺寸" min={140} max={360} value={size} onChange={setSize}/></label></div>;
    const drawerCard = (asset: Asset, eager = false) => <ElementAssetCard key={asset.id} asset={asset} eager={eager} onOpen={()=>open(asset)} onReference={()=>use(asset)} selectControl={<MediaSelection label={"选择元素 "+asset.title} selected={selectedSet.has(asset.id)} onChange={checked=>select(asset.id,checked)}/>} draggable/>;
    const gridCard = (asset: Asset, eager = false) => <ElementAssetCard key={asset.id} asset={asset} eager={eager} selected={inspectorOpen&&inspectedAsset?.id===asset.id} onOpen={()=>open(asset)} onReference={()=>use(asset)} selectControl={<MediaSelection label={"选择元素 "+asset.title} selected={selectedSet.has(asset.id)} onChange={checked=>select(asset.id,checked)}/>} draggable/>;

    const modalVariants = useMemo(() => {
        const current = editing?.asset;
        if (!current || (current.kind !== "image" && current.kind !== "video")) return [];
        const owner = archiveGroups.find(g => g.items.some(a => a.id === current.id));
        if (!owner) return [current];
        const relatedGroups = archiveGroups.filter(
            g => g.key === owner.key || (owner.name && g.name === owner.name && (owner.category === "人物" || g.category === "人物")),
        );
        const seen = new Set<string>();
        const list: Asset[] = [];
        for (const g of relatedGroups) {
            for (const item of g.items) {
                if ((item.kind === "image" || item.kind === "video") && !seen.has(item.id)) {
                    seen.add(item.id);
                    list.push(item);
                }
            }
        }
        const kept = elementPreviewVariants(list, project.elementRules, current.id);
        return kept.sort((a, b) => {
            const da = Boolean(project.elementRules?.[a.id]?.disabled) ? 1 : 0;
            const db = Boolean(project.elementRules?.[b.id]?.disabled) ? 1 : 0;
            if (da !== db) return da - db;
            return compareElementOrder(a,b,project.elementRules);
        });
    }, [editing?.asset, archiveGroups, project.elementRules]);

    const toolbar=<div data-elements-toolbar data-archive-mode={layout==="archive"} className="flex min-w-0 flex-1 items-center gap-2">
        <Input aria-label="搜索视频项目资产" prefix={<Search size={15}/>} placeholder="搜索素材 / @角色 / 场景" className="asset-search shrink-0" value={search} onChange={event=>onSearch(event.target.value)} allowClear/>
        <div className="asset-layout-switch" role="group" aria-label="素材展示方式">
            <button type="button" data-layout-mode="archive" aria-pressed={layout==="archive"} onClick={()=>setLayout("archive")}>智能叠卡</button>
            <button type="button" data-layout-mode="grid" aria-pressed={layout!=="archive"} onClick={()=>setLayout("grid")}>全部文件</button>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {selectedAssets.length>0&&<Popover trigger="click" content={<div className="flex max-w-96 flex-wrap gap-2"><Select aria-label="移动所选素材" placeholder="移动到…" className="w-44" value={undefined} options={moves.options} onChange={(key:string)=>moves.choose(selectedAssets,key)}/><Button size="small" onClick={()=>moves.move(selectedAssets,{kind:"category",name:"未分类"})}>移出角色库</Button><Button size="small" loading={relinking} disabled={!selectedAssets.some(a=>a.localFile)} onClick={()=>void relinkSelected()}>重新定位所选</Button><Button size="small" loading={relinking} onClick={()=>void relinkSelected(true)}>按文件夹定位所选</Button><Button size="small" onClick={favoriteSelected}>收藏所选</Button><Button size="small" onClick={()=>ruleSelected({disabled:true})}>禁用所选</Button><Button size="small" onClick={()=>ruleSelected({disabled:false})}>启用所选</Button><Button size="small" onClick={()=>ruleSelected({priority:1})}>优先引用所选</Button><Button size="small" onClick={()=>ruleSelected({priority:0})}>恢复普通优先级</Button><Button size="small" onClick={()=>setSelectedIds([])}>取消选择</Button></div>}><Button size="small" aria-label="元素选择操作">已选 {selectedAssets.length}</Button></Popover>}
            <Dropdown trigger={["click"]} menu={{selectedKeys:[sort],items:[{key:"serial",label:"按序号"},{key:"name",label:"按名称"},{key:"used",label:"最近使用"},{key:"newest",label:"最近创建"}],onClick:({key})=>setSort(key)}}><Button size="small" className="asset-sort" icon={<ChevronDown size={14}/>} iconPosition="end">{sort==="serial"?"按序号":sort==="used"?"最近使用":sort==="newest"?"最近创建":"按名称"}</Button></Dropdown>
            <Popover trigger="click" content={filter}><Button size="small" title="筛选素材" icon={<SlidersHorizontal className="size-3.5"/>}>筛选</Button></Popover>
            <Select style={{display:layout==="archive"?"none":undefined}} aria-label="元素名称分组" size="small" className="!w-24 shrink-0" value={group} onChange={setGroup} options={[{value:"name",label:"按名称"},{value:"date",label:"按日期"},{value:"none",label:"不分组"}]}/>
            <Popover trigger="click" content={view}><Button size="small" icon={<LayoutGrid className="size-3.5"/>}>视图</Button></Popover>
            <Button size="small" aria-label="切换属性检查器" aria-pressed={inspectorOpen} title={inspectorOpen?"收起右侧属性检查器":"展开右侧属性检查器"} type={inspectorOpen?"default":"text"} className={inspectorOpen?"!border-primary/40 !bg-accent/60 !text-accent-foreground":""} icon={inspectorOpen?<PanelRightClose className="size-3.5"/>:<PanelRightOpen className="size-3.5"/>} onClick={toggleInspector}>检查器</Button>
            {missingLocalAssets.length > 0 && (
                <Button size="small" danger data-toolbar-batch-relink loading={relinking} icon={<FolderSearch className="size-3.5"/>} onClick={() => void handleRelinkFolder()}>
                    一键定位 ({missingLocalAssets.length})
                </Button>
            )}
            <Dropdown trigger={["click"]} menu={{items:[{key:"files",label:"导入选定文件"},{key:"folder",label:"导入整个文件夹"},{key:"relink-folder",label:"一键定位缺失文件夹…"},{type:"divider"},{key:"create",label:"添加元素"}],onClick:({key})=>{if(key==="files")void importFiles();else if(key==="folder")void importFolder();else if(key==="relink-folder")void handleRelinkFolder();else open(null);}}}><Button size="small" type="primary" loading={saving} icon={<Plus className="size-3.5"/>}>添加素材</Button></Dropdown>
        </div>
    </div>;

    const sidebar=<nav className="asset-sidebar-nav" aria-label="素材归档导航"><h2>资产分类</h2><div className="asset-categories">{[...ELEMENT_CATEGORIES,"视频","未分类","已禁用"].map(value=>{const count=projectAssets.filter(a=>value==="已禁用"?project.elementRules?.[a.id]?.disabled:!project.elementRules?.[a.id]?.disabled&&(value==="全部"||elementCategory(a)===value)).length;return <button type="button" key={value} {...dropProps(value==="已禁用"?"disabled:已禁用":"category:"+value)} aria-label={"素材分类 "+value} title={value==="已禁用"?"已禁用素材保留管理，不参与自动引用":undefined} aria-pressed={category===value&&!selectedRole} onClick={()=>chooseCategory(value)}>{value==="已禁用"&&<EyeOff size={15}/>}<span className="truncate">{value}</span><span className={value==="未分类"&&count?"asset-warning-count":"asset-count"}>{count}</span></button>;})}</div><div className="asset-role-heading"><h2>剧目角色</h2>{hiddenRoleGroups.length>0&&<Dropdown trigger={["click"]} menu={{items:hiddenRoleGroups.map(g=>({key:g.key,label:"恢复显示 · "+g.name})),onClick:({key})=>setRoleHidden(key,false)}}><button type="button" aria-label="恢复隐藏角色" title="恢复角色目录显示"><EyeOff size={15}/><span className="text-xs">{hiddenRoleGroups.length}</span></button></Dropdown>}<button type="button" aria-label="新建角色" {...dropProps("new-role")} title="新建角色素材" onClick={()=>open(null)}><Plus size={17}/></button></div><div className="asset-roles">{archiveGroups.filter(g=>g.category==="人物"&&!hiddenRoleKeys.includes(g.key)&&g.items.some(a=>!project.elementRules?.[a.id]?.disabled)).map(g=>{const cover=g.items.find(a=>a.kind==="image"&&!project.elementRules?.[a.id]?.disabled)||g.items[0];const hasVoice=archiveGroups.some(v=>v.category==="音频"&&v.name===g.name&&v.items.some(a=>!project.elementRules?.[a.id]?.disabled));const isPinned=g.items.some(a=>elementPinnedAt(a)>0);return <Dropdown key={g.key} trigger={["contextMenu"]} menu={{items:[{key:"pin-role",label:isPinned?"取消置顶":"置顶人物"},{key:"hide-role",label:"不在角色目录显示"}],onClick:({key})=>{if(key==="hide-role")setRoleHidden(g.key,true);else if(key==="pin-role"){const next=isPinned?0:Date.now(),ids=new Set(g.items.map(item=>item.id));useAssetStore.setState(s=>({assets:s.assets.map(a=>ids.has(a.id)?{...a,metadata:{...a.metadata,elementRolePinnedAt:next,elementPinnedAt:next}}:a)}));message.success(isPinned?"已取消置顶":"已置顶人物");}}}}><button type="button" {...dropProps("role:"+encodeURIComponent(g.name))} aria-label={"角色 "+g.name} aria-pressed={selectedRole===g.key} onClick={()=>{setSelectedRole(selectedRole===g.key?"":g.key);setCategory("全部");}}><span className="asset-role-avatar" data-role-pinned={isPinned||undefined} style={isPinned?{boxShadow:"0 0 0 2px var(--background),0 0 0 5px var(--primary)"}:undefined}><ElementThumbnail asset={cover}/></span><span className="asset-role-name">{g.name}</span><span className="asset-count" title="可用参考素材">{g.items.filter(a=>!project.elementRules?.[a.id]?.disabled).length}</span></button></Dropdown>;})}</div></nav>;

    const inspector = inspectorOpen ? (
        <ElementInspectorPanel
            asset={inspectedAsset}
            groupName={inspectedFamily.name}
            groupItems={inspectedFamily.items}
            project={project}
            onSelectVariant={item => setInspectedId(item.id)}
            onUpdateAsset={(id, patch) => updateAsset(id, patch)}
            onSaveRule={(id, patch) => saveRule(id, patch)}
            onReference={use}
            onOpenModal={item => open(item)}
            onClose={() => setInspectorOpen(false)}
        />
    ) : null;

    useEffect(()=>{
        if(!active)return;
        const scroll=content.current?.closest<HTMLElement>('[data-video-results-scroll]');
        const reset=()=>{setDragging(false);if(scroll){scroll.style.outline='';delete scroll.dataset.audioDropActive;}};
        const over=(event:DragEvent)=>{if(category!=="音频"||!event.dataTransfer?.types.includes("Files"))return;event.preventDefault();event.dataTransfer.dropEffect="link";setDragging(true);};
        const leave=(event:DragEvent)=>{if(!scroll?.contains(event.relatedTarget as Node))reset();};
        const drop=(event:DragEvent)=>{if(content.current?.contains(event.target as Node)||category!=="音频"||!event.dataTransfer?.files.length)return;event.preventDefault();event.stopPropagation();reset();void importFiles(Array.from(event.dataTransfer.files));};
        scroll?.addEventListener('dragover',over);scroll?.addEventListener('dragleave',leave);scroll?.addEventListener('drop',drop);window.addEventListener('dragend',reset);window.addEventListener('drop',reset);window.addEventListener('blur',reset);
        return()=>{scroll?.removeEventListener('dragover',over);scroll?.removeEventListener('dragleave',leave);scroll?.removeEventListener('drop',drop);window.removeEventListener('dragend',reset);window.removeEventListener('drop',reset);window.removeEventListener('blur',reset);reset();};
    },[active,category,selectedRole,project.id]);
    useEffect(()=>{const scroll=content.current?.closest<HTMLElement>('[data-video-results-scroll]');if(!scroll)return;const previous=scroll.style.outline,offset=scroll.style.outlineOffset;if(active&&category==="音频"&&dragging){scroll.style.outline='2px dashed var(--primary)';scroll.style.outlineOffset='-2px';scroll.dataset.audioDropActive='true';}return()=>{scroll.style.outline=previous;scroll.style.outlineOffset=offset;delete scroll.dataset.audioDropActive;};},[active,category,dragging]);
    return <section ref={content} data-video-elements className={"relative min-h-full pb-6 "+(dragging?"rounded-xl outline-2 outline-dashed outline-primary bg-accent/30":"")} onDragOver={event=>{if(event.dataTransfer.types.includes("Files")){event.preventDefault();event.dataTransfer.dropEffect="link";setDragging(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{if(!event.dataTransfer.files.length)return;event.preventDefault();event.stopPropagation();setDragging(false);void importFiles(Array.from(event.dataTransfer.files));}}>
        {active&&toolbarTarget&&createPortal(toolbar,toolbarTarget)}
        {active&&sidebarTarget&&createPortal(sidebar,sidebarTarget)}
        {active&&inspectorTarget&&inspector&&createPortal(inspector,inspectorTarget)}

        {missingLocalAssets.length > 0 && (
            <div data-missing-assets-bar className="wb-smart-clean-bar mb-4 !border-destructive/35 !bg-destructive/8">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs">
                    <span className="truncate">
                        <strong className="text-destructive">检测到 {missingLocalAssets.length} 个本地素材路径已变动</strong>
                        （重命名文件、重命名文件夹或移动位置后可一键批量恢复）
                    </span>
                    {missingLocalAssets[0]?.localFile?.path && (
                        <span className="truncate text-[11px] text-muted-foreground" title={missingLocalAssets[0].localFile.path}>
                            原记录路径示例：{missingLocalAssets[0].localFile.path}
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button size="small" data-auto-track-btn loading={relinking} icon={<RefreshCw className="size-3.5" />} onClick={() => void handleAutoTrack()}>
                        自动追踪找回
                    </Button>
                    <Button size="small" type="primary" data-batch-relink-btn loading={relinking} icon={<FolderSearch className="size-3.5" />} onClick={() => void handleRelinkFolder()}>
                        选择文件夹一键定位
                    </Button>
                </div>
            </div>
        )}

        {uncatSuggestions.length > 0 && category !== "已禁用" && !selectedRole && (
            <div data-smart-clean-bar className="wb-smart-clean-bar mb-4">
                <div className="flex min-w-0 items-center gap-2 text-xs">
                    <Sparkles size={15} className="shrink-0 text-amber-600" />
                    <span className="truncate">
                        <strong>智能整理建议：</strong>检测到 <strong>{uncatSuggestions.length} 个「未分类」同名/同前缀素材</strong>（如{" "}
                        {uncatSuggestions.slice(0, 2).map(s => `「${s.title}」`).join("、")}），可自动归入对应角色与场景叠卡。
                    </span>
                </div>
                <button type="button" data-merge-uncategorized onClick={mergeUncategorized} className="wb-smart-clean-btn shrink-0">
                    一键归并去重 ({uncatSuggestions.length})
                </button>
            </div>
        )}

        {layout==="archive"&&projectAssets.length>0 ? <ElementArchive items={filtered} catalog={projectAssets} selectedRole={selectedRole} inspectedAssetId={inspectorOpen?inspectedAsset?.id:undefined} onInspect={asset=>{setInspectedId(asset.id);}} onClearRole={()=>setSelectedRole("")} onAddForRole={roleName=>{open(null);setEditCategory("人物");setEditPerformer(roleName);}} renderCard={drawerCard} onAdd={value=>{open(null);setEditCategory(value);}} onEdit={open} onReference={use} selectionFor={asset=><MediaSelection label={"选择元素 "+asset.title} selected={selectedSet.has(asset.id)} onChange={checked=>select(asset.id,checked)}/>}/> : !filtered.length ? <div className="flex min-h-72 flex-col items-center justify-center gap-4 py-12"><AtSign className="size-12 rounded-full bg-accent p-3"/><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={projectAssets.length?"没有符合筛选条件的元素":"暂无元素 · 添加人物、场景和道具，保持跨镜头一致性"}/><Button icon={<Plus className="size-4"/>} onClick={()=>open(null)}>创建元素</Button></div> : layout === "table" ? <Table rowKey="id" rowSelection={{selectedRowKeys:selectedIds,onChange:ids=>setSelectedIds(ids.map(String))}} dataSource={filtered} pagination={false} columns={[{title:"名称",render:(_:unknown,asset:Asset)=><Button type="link" onClick={()=>open(asset)}>{asset.title}</Button>},{title:"引用规则",render:(_:unknown,asset:Asset)=>project.elementRules?.[asset.id]?.disabled?"已禁用":Number(project.elementRules?.[asset.id]?.priority)>0?"优先 "+project.elementRules?.[asset.id]?.priority:"普通"},{title:"分类",render:(_:unknown,asset:Asset)=>elementCategory(asset)},{title:"作者",render:(_:unknown,asset:Asset)=>elementInfo(asset).author},{title:"演员",render:(_:unknown,asset:Asset)=>elementInfo(asset).performer || "—"},{title:"状态",render:(_:unknown,asset:Asset)=>REVIEW_OPTIONS.find(option=>option.value===elementInfo(asset).status)?.label},{title:"操作",render:(_:unknown,asset:Asset)=><Button size="small" onClick={()=>use(asset)}>引用到提示词</Button>}]}/> : layout === "kanban" ? <div className="flex gap-3 overflow-x-auto">{REVIEW_OPTIONS.map(option=><div key={option.value} className="w-64 shrink-0 space-y-3"><h2 className="font-medium">{option.label} · {filtered.filter(asset=>elementInfo(asset).status===option.value).length}</h2>{filtered.filter(asset=>elementInfo(asset).status===option.value).map(asset=>gridCard(asset))}</div>)}</div> : <ElementLibrary catalogItems={projectAssets} items={filtered} group={group} size={size} renderCard={gridCard}/>}

        {category==="道具"&&layout==="archive"&&!selectedRole&&!filtered.some(a=>elementCategory(a)==="道具")&&<button type="button" className="archive-add" onClick={()=>{open(null);setEditCategory("道具");}}><Plus size={21}/>新建道具</button>}
        {disabledCategories.map(c=>{const list=disabledFiltered.filter(a=>elementCategory(a)===c),key=project.id+":"+selectedRole+":"+c,expanded=disabledOpen[key]!==false;return <section key={key} data-disabled-category={c} className="mt-6 border-t border-border pt-4"><Button size="small" icon={<EyeOff size={14}/>} aria-expanded={expanded} onClick={()=>setDisabledOpen(s=>({...s,[key]:!expanded}))}>查看已禁用 · {c} ({list.length})</Button>{expanded&&<div className="mt-3">{list.length?<div className="archive-grid">{list.map(a=>gridCard(a))}</div>:<p className="text-xs text-muted-foreground">没有已禁用的{c}素材</p>}</div>}</section>;})}

        {(() => {
            if(!editing)return null;
            const media = editing?.asset && editing.asset.kind !== "text" ? editing.asset : null;
            const form = <div className="grid gap-3.5"><label>名称<Input aria-label="元素名称" value={title} onChange={event=>setTitle(event.target.value)} placeholder="例如：小红、客厅、手机"/></label><label>别名<Input aria-label="元素别名" value={aliases} onChange={e=>setAliases(e.target.value)} placeholder="多个别名用顿号或逗号分隔"/><span className="text-xs text-muted-foreground">别名也可用于提示词匹配，不改变原名称和文件。</span></label><label>分类<Select aria-label="元素分类" className="w-full" value={editCategory} onChange={setEditCategory} options={[...ELEMENT_CATEGORIES.slice(1),"视频","未分类"].map(value=>({value,label:value}))}/></label>{!editing?.asset && <div className="space-y-2"><input ref={input} type="file" hidden aria-label="上传元素文件" accept="image/*,audio/*,video/*" onChange={event=>{const next=event.target.files?.[0];if(next){setFile(next);if(!title.trim())setTitle(next.name.replace(/\.[^.]+$/,""));}event.target.value="";}}/><Button icon={<Upload className="size-4"/>} onClick={()=>input.current?.click()}>上传图片 / 音频 / 视频</Button><p className="break-all text-xs text-muted-foreground">{file?file.name:"不上传文件时，保存为文字元素。媒体将存入素材库，可引用到视频提示词。"}</p></div>}<fieldset className="grid gap-2.5 rounded-lg border border-border p-3"><legend className="text-sm">当前项目自动引用</legend><Checkbox checked={Boolean(rule.disabled)} onChange={e=>setRule(r=>({...r,disabled:e.target.checked}))}>禁用（保留素材，不参与引用）</Checkbox><label>优先级<Select aria-label="元素引用优先级" className="w-full" value={rule.priority||0} onChange={priority=>setRule(r=>({...r,priority}))} options={[{value:0,label:"普通"},{value:1,label:"优先 1"},{value:2,label:"优先 2（更高）"},{value:3,label:"优先 3（最高）"}]}/></label></fieldset><div><label>角色/分组名<Input aria-label="元素演员" value={editPerformer} onChange={event=>setEditPerformer(event.target.value)} placeholder="手动指定分组名称，如：祝余"/></label></div><p className="text-xs text-muted-foreground">编号优先整理同角色、同场景版本，名称词典补充未编号素材。分组只影响展示，不把其他年龄或服装版本一起用于生成。</p></div>;
            const detailPane = media ? (
                <div className="max-h-[78vh] space-y-3.5 overflow-y-auto pr-1">
                    {media.localFile&&<p className="break-all text-xs text-muted-foreground">原文件：{media.localFile.path}</p>}
                    {media.metadata?.localFileMissing===true&&<p className="text-xs text-destructive">原文件失效，请重新定位</p>}
                    {form}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="small" onClick={()=>{use(media);setEditing(null);}}>引用</Button>
                        {media.localFile&&<Button size="small" onClick={()=>void relinkLocalAsset(media).then(()=>{message.success("已重新定位");setEditing(null);}).catch(error=>message.error(error.message))}>重新定位</Button>}
                        <Button size="small" onClick={()=>{moves.move([media],{kind:"category",name:"未分类"});setEditing(null);}}>移出角色库</Button><Button size="small" danger title="删除元素" aria-label={"删除元素 "+media.title} onClick={()=>{remove(media);setEditing(null);}} icon={<Trash2 className="size-3"/>}>删除</Button>
                    </div>
                </div>
            ) : null;
            return <Modal title={editing?.asset?"编辑元素":"添加元素"} open={Boolean(editing)} onCancel={()=>{if(!saving)setEditing(null);}} onOk={()=>void save()} confirmLoading={saving} maskClosable={!saving} closable={!saving} okButtonProps={{disabled:!title.trim()}} cancelButtonProps={{disabled:saving}} okText="保存元素" cancelText="取消" destroyOnHidden width={media?(media.kind==="audio"?1100:"min(96vw, 1900px)"):undefined} style={media&&media.kind!=="audio"?{top:"4vh"}:undefined}>
                {media ? <div className={media.kind==="audio"?"grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5":"grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]"}>
                    <div data-testid="element-preview" className={`flex items-center justify-center overflow-hidden rounded-xl bg-secondary/50 ${media.kind==="audio"?"min-h-96":"h-[78vh]"}`}>{media.kind==="image"?<img src={media.data.dataUrl} alt={media.title} className="size-full object-contain"/>:media.kind==="audio"?<audio controls src={media.data.url} className="w-full"/>:<video controls src={media.data.url} className="size-full object-contain"/>}</div>
                    {media.kind!=="audio"&&modalVariants.length>1 ? (
                        <div className="grid max-h-[78vh] grid-cols-[96px_minmax(0,1fr)] gap-3">
                            <div data-modal-variants className="wb-modal-variant-strip">
                                <span className="wb-modal-variant-label">同组变体 ({modalVariants.length})</span>
                                {modalVariants.map(item => {
                                    const itemRule = project.elementRules?.[item.id];
                                    const activeItem = item.id === media.id;
                                    return (
                                        <LocalAssetMenu key={item.id} asset={item} hideRelink hideRolePin={Boolean(selectedRole)} allowUnclassify><button
                                            type="button"
                                            data-modal-variant={item.id}
                                            data-active={activeItem || undefined}
                                            aria-label={"切换变体大图 " + item.title}
                                            title={item.title}
                                            onClick={() => open(item)}
                                            className="wb-modal-variant-btn"
                                        >
                                            <span className="relative block w-full overflow-hidden rounded-md bg-secondary">
                                                <ElementThumbnail asset={item} eager />
                                                {itemRule?.disabled ? (
                                                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">已禁用</span>
                                                ) : Number(itemRule?.priority) > 0 ? (
                                                    <span className="wb-priority-chip absolute bottom-1 left-1"><Star size={9} />优先{itemRule?.priority}</span>
                                                ) : null}
                                            </span>
                                            <span className="wb-modal-variant-title">{item.title}</span>
                                        </button></LocalAssetMenu>
                                    );
                                })}
                            </div>
                            {detailPane}
                        </div>
                    ) : detailPane}
                </div> : form}
            </Modal>;
        })()}
    </section>;
}
