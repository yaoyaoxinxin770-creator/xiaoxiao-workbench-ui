"use client";
import {writeElementDrag} from "../element-drag";
import {useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {Drawer,Button,Dropdown,Empty,App} from "antd";
import {Plus,MoreHorizontal,Play,Pause,Star,AtSign,Layers,RefreshCw,ArrowLeft,EyeOff} from "lucide-react";
import {useAssetStore,type Asset} from "@/stores/use-asset-store";
import {useVideoStudioStore} from "@/stores/use-video-studio-store";
import {groupElements,compareElementOrder,elementPinnedAt} from "../element-model";
import {ElementThumbnail} from "./element-asset-card";
import {notifyLocalAssetLoadError} from "@/services/api/local-assets";
import {LocalAssetMenu} from "./local-asset-menu";
import {ElementAudioStripCard} from "./element-audio-strip";

function ArchiveAudio({asset}:{asset:Extract<Asset,{kind:"audio"}>}){
 const audio=useRef<HTMLAudioElement>(null),[playing,setPlaying]=useState(false),[time,setTime]=useState(0),[duration,setDuration]=useState((asset.data.durationMs||0)/1000),[error,setError]=useState(false);
 useEffect(()=>{setError(false);audio.current?.load();},[asset.data.url]);
 const format=(n:number)=>Math.floor(n/60)+":"+String(Math.floor(n%60)).padStart(2,"0");
 return <div className="archive-voice" onClick={e=>e.stopPropagation()}><audio ref={audio} preload="metadata" src={asset.data.url} onLoadedMetadata={e=>{setError(false);if(Number.isFinite(e.currentTarget.duration))setDuration(e.currentTarget.duration);}} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>{setError(true);if(asset.localFile)notifyLocalAssetLoadError(asset);}}/><button type="button" aria-label={(playing?"暂停 ":"试听 ")+asset.title} onClick={()=>{const a=audio.current;if(a){if(playing)a.pause();else void a.play().catch(()=>setError(true));}}}>{playing?<Pause size={12}/>:<Play size={12}/>}</button><input type="range" aria-label={"试听进度 "+asset.title} min={0} max={duration||1} step={0.1} value={Math.min(time,duration||1)} onChange={e=>{if(audio.current)audio.current.currentTime=Number(e.target.value);setTime(Number(e.target.value));}}/><span className="archive-voice-title" title={asset.title}>{error?"音频无法读取":asset.title}</span><time>{format(playing?time:duration)}</time></div>;
}

function dedupeAudioList(list:Array<Extract<Asset,{kind:"audio"}>>){
 const seen=new Set<string>();
 return list.filter(a=>{
  const key=a.title.normalize("NFKC").trim().toLowerCase()+"|"+Math.round((a.data.durationMs||0)/200);
  if(seen.has(key))return false;
  seen.add(key);
  return true;
 });
}

type Props={
 items:Asset[];
 catalog:Asset[];
 selectedRole:string;
 inspectedAssetId?:string;
 onInspect?:(asset:Asset,groupKey:string)=>void;
 onClearRole?:()=>void;
 onAddForRole?:(roleName:string)=>void;
 renderCard:(asset:Asset,eager?:boolean)=>ReactNode;
 selectionFor?:(asset:Asset)=>ReactNode;
 onAdd:(category:string)=>void;
 onEdit:(asset:Asset)=>void;
 onReference:(asset:Asset)=>void;
};

export function ElementArchive({items,catalog,selectedRole,inspectedAssetId,onInspect,onClearRole,onAddForRole,renderCard,onAdd,onEdit,onReference,selectionFor}:Props){
 const {message}=App.useApp();
 const groups=useMemo(()=>groupElements(items,catalog),[items,catalog]),allGroups=useMemo(()=>groupElements(catalog),[catalog]),[selected,setSelected]=useState("");
 const [variantOffsets,setVariantOffsets]=useState<Record<string,number>>({});
 const [showRoleDisabled,setShowRoleDisabled]=useState(true);
 useEffect(()=>{setShowRoleDisabled(true);},[selectedRole]);
 const rules=useVideoStudioStore(s=>s.projects.find(p=>p.id===s.activeProjectId)?.elementRules);
 const picked=allGroups.find(g=>g.key===selected),voices=picked?.category==="人物"?dedupeAudioList((allGroups.find(g=>g.category==="音频"&&g.name===picked.name)?.items||[]).filter((a):a is Extract<Asset,{kind:"audio"}>=>a.kind==="audio"&&!rules?.[a.id]?.disabled)):[];
 const sections=[...new Set(groups.map(g=>g.category))];
 const activeRoleGroup=selectedRole?allGroups.find(g=>g.key===selectedRole):undefined;

 if(activeRoleGroup){
  const roleVisuals=[...items.filter(a=>a.kind!=="audio")].sort((a,b)=>compareElementOrder(a,b,rules));
  const disabledVisuals=activeRoleGroup.items.filter(a=>a.kind!=="audio"&&Boolean(rules?.[a.id]?.disabled)).sort((a,b)=>compareElementOrder(a,b,rules));
  const roleAudios=dedupeAudioList(items.filter((a):a is Extract<Asset,{kind:"audio"}>=>a.kind==="audio"));
  return <div className="asset-archive" data-element-archive data-role-showcase={activeRoleGroup.name}>
   <div className="archive-content">
    <section className="archive-section" data-archive-category="人物">
     <div className="wb-role-showcase-head">
      <div className="flex min-w-0 items-baseline gap-2.5">
       <h2 className="archive-heading !m-0">{activeRoleGroup.name}</h2>
       <span className="text-xs text-muted-foreground">共 {roleVisuals.length} 张展示图{roleAudios.length?` · ${roleAudios.length} 条配音声线`:""}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
       {disabledVisuals.length>0&&<Button size="small" type={showRoleDisabled?"default":"text"} icon={<EyeOff className="size-3.5"/>} onClick={()=>setShowRoleDisabled(v=>!v)}>{showRoleDisabled?`收起已禁用 (${disabledVisuals.length})`:`查看已禁用 (${disabledVisuals.length})`}</Button>}
       {onClearRole&&<Button size="small" icon={<ArrowLeft className="size-3.5"/>} onClick={onClearRole}>返回全部</Button>}
       <Button size="small" type="primary" icon={<Plus className="size-3.5"/>} onClick={()=>onAddForRole?onAddForRole(activeRoleGroup.name):onAdd("人物")}>添加「{activeRoleGroup.name}」设定图</Button>
      </div>
     </div>
     {roleVisuals.length===0?<Empty description="当前角色没有启用的展示图"/>:<div className="wb-role-showcase-grid">
      {roleVisuals.map((a,idx)=><LocalAssetMenu key={a.id} asset={a} hideRelink hideRolePin><article data-archive-card={a.id} className="group relative wb-role-showcase-card" draggable onDragStart={event=>{writeElementDrag(event.dataTransfer,a);}}>
       {selectionFor?.(a)}<button type="button" aria-label={"预览 "+a.title} title="点击放大查看高清大图" className="wb-role-showcase-thumb" onClick={()=>{onInspect?.(a,activeRoleGroup.key);onEdit(a);}}>
        <ElementThumbnail asset={a} eager={idx<8}/>
        {Number(rules?.[a.id]?.priority)>0&&<span className="archive-priority"><Star size={10}/>优先{rules?.[a.id]?.priority}</span>}
       </button>
       <div className="wb-role-showcase-foot">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={a.title}>{a.title}</span>
        <button type="button" className="wb-inline-primary-btn" disabled={Boolean(rules?.[a.id]?.disabled)} onClick={e=>{e.stopPropagation();onReference(a);}}><AtSign size={12}/>引用</button>
       </div>
      </article></LocalAssetMenu>)}
     </div>}
     {showRoleDisabled&&disabledVisuals.length>0&&<div className="mt-5 border-t border-border pt-4">
      <h3 className="mb-3 text-xs font-semibold text-muted-foreground">已禁用的备用图（点击可查看大图或重新启用）</h3>
      <div className="wb-role-showcase-grid">
       {disabledVisuals.map(a=><LocalAssetMenu key={a.id} asset={a} hideRelink hideRolePin><article data-disabled-asset={a.id} className="group relative wb-role-showcase-card">
        <button type="button" aria-label={"预览 "+a.title} className="wb-role-showcase-thumb" onClick={()=>{onInspect?.(a,activeRoleGroup.key);onEdit(a);}}>
         <ElementThumbnail asset={a}/>
        </button>
        <div className="wb-role-showcase-foot">
         <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={a.title}>{a.title}（已禁用）</span>
        </div>
       </article></LocalAssetMenu>)}
      </div>
     </div>}
    </section>
    {roleAudios.length>0&&<section className="archive-section" data-archive-category="音频">
     <h2 className="archive-heading">配音声线<span>{roleAudios.length} 条声纹</span></h2>
     <div className="wb-audio-grid">
      {roleAudios.map(audioAsset=><ElementAudioStripCard key={audioAsset.id} asset={audioAsset} selection={selectionFor?.(audioAsset)} roleName={activeRoleGroup.name} selected={inspectedAssetId===audioAsset.id} onInspect={()=>onInspect?.(audioAsset,activeRoleGroup.key)} onEdit={()=>onEdit(audioAsset)} onReference={()=>onReference(audioAsset)}/>)}
     </div>
    </section>}
   </div>
  </div>;
 }

 return <div className="asset-archive" data-element-archive><div className="archive-content">{!groups.length&&<Empty description="没有符合筛选条件的素材"/>}{sections.map(section=>{
 const audioItems=section==="音频"?groups.filter(g=>g.category==="音频").flatMap(g=>dedupeAudioList(g.items.filter((a):a is Extract<Asset,{kind:"audio"}>=>a.kind==="audio")).map(audioAsset=>({audioAsset,roleName:g.name,groupKey:g.key}))):[];
 return <section key={section} className="archive-section" data-archive-category={section}><h2 className="archive-heading">{section==="音频"?"配音声线":section}<span>{section==="音频"?audioItems.length+" 条声纹":groups.filter(g=>g.category===section).length+(section==="人物"?" 个角色":section==="场景"?" 组空间":" 组")}</span></h2>{section==="音频"?<div className="wb-audio-grid">{audioItems.map(({audioAsset,roleName,groupKey})=><ElementAudioStripCard key={audioAsset.id} asset={audioAsset} selection={selectionFor?.(audioAsset)} roleName={roleName} selected={inspectedAssetId===audioAsset.id} onInspect={()=>onInspect?.(audioAsset,groupKey)} onEdit={()=>onEdit(audioAsset)} onReference={()=>onReference(audioAsset)}/>)}</div>:<div className="archive-grid">{groups.filter(g=>g.category===section).map((g,i)=>{
 const family=allGroups.find(v=>v.key===g.key)||g;
 const orderedPictures=[...g.items.filter(a=>a.kind==="image")].sort((a,b)=>compareElementOrder(a,b,rules));
 const offset=variantOffsets[g.key]||0;
 const cover=orderedPictures.length?orderedPictures[offset%orderedPictures.length]:[...g.items].sort((a,b)=>compareElementOrder(a,b,rules))[0]||g.items[0];
 const hasStack=orderedPictures.length>1;
 const voice=dedupeAudioList((section==="人物"?allGroups.find(v=>v.category==="音频"&&v.name===g.name)?.items||[]:g.items).filter((a):a is Extract<Asset,{kind:"audio"}>=>a.kind==="audio"&&!rules?.[a.id]?.disabled));
 const disabled=family.items.filter(a=>rules?.[a.id]?.disabled).length;
 const isCardSelected=selected===g.key||selectedRole===g.key;
 const isRolePinned=section==="人物"&&family.items.some(a=>elementPinnedAt(a)>0);
 const toggleRolePin=()=>{const next=isRolePinned?0:Date.now(),ids=new Set(family.items.map(item=>item.id));useAssetStore.setState(s=>({assets:s.assets.map(a=>ids.has(a.id)?{...a,metadata:{...a.metadata,elementRolePinnedAt:next,elementPinnedAt:next}}:a)}));message.success(isRolePinned?"已取消置顶":"已置顶人物");};

 return <LocalAssetMenu key={g.key} asset={cover} hideRelink><article data-archive-card={g.key} data-has-stack={hasStack||undefined} data-selected={isCardSelected} className={"group relative archive-group "+(hasStack?"has-variant-stack ":"")+(section==="场景"?"archive-scene":"")} draggable onDragStart={event=>{writeElementDrag(event.dataTransfer,cover);}} onClick={()=>onInspect?.(cover,g.key)}>
 {selectionFor?.(cover)}<div className="archive-group-cover-wrap">
  <button type="button" className="archive-group-cover" aria-label={"预览 "+g.name} title="点击放大查看高清大图" onClick={e=>{e.stopPropagation();onInspect?.(cover,g.key);onEdit(cover);}}>
   <ElementThumbnail asset={cover} eager={i<6}/>
   {Number(rules?.[cover.id]?.priority)>0&&<span className="archive-priority"><Star size={10}/>优先{rules?.[cover.id]?.priority}</span>}
  </button>
  {hasStack&&<button type="button" data-variant-cycle={g.key} aria-label={"切换变体 "+g.name} title="点击在卡片上切换变体封面" className="wb-stack-cycle-pill" onClick={e=>{e.stopPropagation();const next=(offset+1)%orderedPictures.length;setVariantOffsets(prev=>({...prev,[g.key]:next}));onInspect?.(orderedPictures[next],g.key);}}><Layers size={11}/><span>{(offset%orderedPictures.length)+1}/{orderedPictures.length}</span><RefreshCw size={10}/></button>}
 </div>
 <div className="archive-group-main"><div className="archive-title-row"><button type="button" data-archive-group={g.key} aria-label={"查看素材归档 "+g.name} className="archive-title" title={g.name} onClick={e=>{e.stopPropagation();setSelected(g.key);}}>{cover.title}</button>{section==="人物"?<span className="archive-kind">人物</span>:<span className="archive-kind">{section}</span>}<Dropdown trigger={["click"]} menu={{items:[...(section==="人物"?[{key:"pin",label:isRolePinned?"取消置顶":"置顶人物"}]:[]),{key:"detail",label:"展开全部变体抽屉"},{key:"edit",label:"大图查看与编辑"},{key:"use",label:"引用当前素材",disabled:Boolean(rules?.[cover.id]?.disabled)}],onClick:({key})=>key==="pin"?toggleRolePin():key==="detail"?setSelected(g.key):key==="edit"?onEdit(cover):onReference(cover)}}><button type="button" aria-label={g.name+" 更多操作"} className="archive-more" onClick={e=>e.stopPropagation()}><MoreHorizontal size={17}/></button></Dropdown></div>
 <span className="archive-meta">{`分组：${g.name}（共 ${orderedPictures.length?orderedPictures.length+" 张":g.items.length+" 份素材"}）`}{section==="人物"&&voice.length?" · "+voice.length+" 个音色":""}</span>
 {section==="人物"&&orderedPictures.length>1&&<div className="archive-miniatures">{orderedPictures.slice(0,4).map((a,idx)=><button type="button" key={a.id} data-active={a.id===cover.id||undefined} aria-label={"切换参考 "+a.title} title={a.title+"（点击放大查看）"} onClick={e=>{e.stopPropagation();setVariantOffsets(prev=>({...prev,[g.key]:idx}));onInspect?.(a,g.key);onEdit(a);}}><ElementThumbnail asset={a}/></button>)}{disabled>0&&<button type="button" className="archive-disabled" onClick={e=>{e.stopPropagation();setSelected(g.key);}}>+{disabled} 已禁用</button>}</div>}
 {voice.slice(0,1).map(a=><ArchiveAudio key={a.id} asset={a}/>)}

 <div className="archive-quick-row"><button type="button" className="wb-inline-ghost-btn" onClick={e=>{e.stopPropagation();setSelected(g.key);}}>全部参考</button><button type="button" className="wb-inline-primary-btn" disabled={Boolean(rules?.[cover.id]?.disabled)} onClick={e=>{e.stopPropagation();onReference(cover);}}><AtSign size={12}/>引用</button></div>
 </div></article></LocalAssetMenu>;
 })}{(section==="人物"||section==="场景"||section==="道具")&&<button type="button" className="archive-add" onClick={()=>onAdd(section)}><Plus size={21}/>{section==="人物"?"新建角色":section==="道具"?"新建道具":"新建场景"}</button>}</div>}</section>;})}</div>
 <Drawer open={Boolean(picked)} onClose={()=>setSelected("")} title={picked?.name||"素材档案"} width={420} zIndex={900} destroyOnHidden>{picked&&<><p className="archive-meta mb-4">{picked.category} · {picked.items.length} 份素材</p>{picked.items.find(a=>a.kind==="image")&&<div className="archive-detail-cover"><ElementThumbnail asset={picked.items.find(a=>a.kind==="image")!} eager/></div>}<h3 className="archive-detail-heading">参考素材</h3><div className="archive-detail-grid">{[...picked.items].sort((a,b)=>compareElementOrder(a,b,rules)).map((a,i)=>renderCard(a,i<4))}</div>{voices.length>0&&<section className="mt-6"><h3 className="mb-3 font-semibold">音色</h3>{voices.map(a=><div key={a.id} className="mb-4">{a.kind==="audio"&&<ArchiveAudio asset={a}/>}<Button size="small" className="mt-2" onClick={()=>onReference(a)}>引用音色</Button></div>)}</section>}</>}</Drawer></div>;
}
