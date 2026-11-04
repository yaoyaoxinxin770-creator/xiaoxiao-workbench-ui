"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Asset } from "@/stores/use-asset-store";
import { groupedElements } from "../element-model";

function ElementGrid({items,size,renderCard}:{items:Asset[];size:number;renderCard:(asset:Asset)=>ReactNode}) {
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0),[margin,setMargin]=useState(0);
 const scroll=()=>ref.current?.closest<HTMLElement>("[data-reference-library],[data-video-results-scroll]")||null;
 useEffect(()=>{const observer=new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(next>0){setWidth(next);const host=scroll();if(ref.current&&host&&ref.current.getClientRects().length)setMargin(ref.current.getBoundingClientRect().top-host.getBoundingClientRect().top+host.scrollTop);}});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 useLayoutEffect(()=>{const host=scroll();if(ref.current&&host&&ref.current.getClientRects().length)setMargin(ref.current.getBoundingClientRect().top-host.getBoundingClientRect().top+host.scrollTop);},[width,items]);
 const columns=Math.max(1,Math.floor((width+12)/(size+12))),cardWidth=Math.min(size,width||size),height=cardWidth*0.75+46;
 const virtual=useVirtualizer({count:Math.ceil(items.length/columns),getScrollElement:scroll,estimateSize:()=>height,scrollMargin:margin,overscan:2,getItemKey:i=>items[i*columns].id});
 useEffect(()=>{virtual.measure();},[height,columns,items,virtual]);
 const style={gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,"+size+"px),"+size+"px))"};
 return <div ref={ref} data-element-grid data-total-assets={items.length} className="relative" style={items.length>=80?{height:virtual.getTotalSize()}:undefined}>
 {items.length<80?<div className="grid auto-rows-max items-start gap-3" style={style}>{items.map(renderCard)}</div>:virtual.getVirtualItems().map(row=><div key={row.key} className="absolute left-0 top-0 grid w-full items-start gap-3" style={{...style,transform:"translateY("+(row.start-margin)+"px)"}}>{items.slice(row.index*columns,(row.index+1)*columns).map(renderCard)}</div>)}
 </div>;
}
export function ElementLibrary({items,group,size=200,renderCard,catalogItems=items}:{items:Asset[];group:string;size?:number;catalogItems?:Asset[];renderCard:(asset:Asset,eager?:boolean)=>ReactNode}) {
 const ref=useRef<HTMLDivElement>(null),groups=useMemo(()=>groupedElements(items,group,catalogItems),[items,group,catalogItems]);
 const eagerIds=useMemo(()=>new Set((group==="none"?items:groups.flatMap(g=>g.items)).slice(0,8).map(a=>a.id)),[items,groups,group]);
 const card=(asset:Asset)=>renderCard(asset,eagerIds.has(asset.id));
 const categories=useMemo(()=>[...new Set(groups.map(g=>g.category))],[groups]);
 const navigation=useMemo(()=>{const seen=new Set<string>();return groups.filter(g=>{if(seen.has(g.name))return false;seen.add(g.name);return true;});},[groups]);
 const jump=(key:string)=>{const target=Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-element-name]")||[]).find(n=>n.dataset.elementName===key),host=ref.current?.closest<HTMLElement>("[data-reference-library],[data-video-results-scroll]");if(target&&host)host.scrollTo({top:host.scrollTop+target.getBoundingClientRect().top-host.getBoundingClientRect().top-12,behavior:"smooth"});};
 return <div ref={ref} className="flex items-start gap-2">
 {group!=="none"&&items.length>0&&<div className="sticky top-2 z-10 h-7 w-5 shrink-0"><nav aria-label={group==="date"?"素材日期大纲":"素材名称大纲"} data-element-outline className="group absolute left-0 top-0 max-h-[55vh] w-5 overflow-y-auto rounded-lg hover:w-56 hover:bg-card hover:shadow-lg focus-within:w-56 focus-within:bg-card focus-within:shadow-lg" style={{scrollbarWidth:"thin"}}>{navigation.map(g=><button key={g.key} title={g.name} aria-label={"跳转素材 "+g.name} onClick={event=>{jump(g.key);if(event.detail)event.currentTarget.blur();}} className="flex h-7 w-full items-center gap-2 rounded px-1 text-left text-xs hover:bg-accent focus-visible:bg-accent"><span aria-hidden className="h-0.5 w-3 shrink-0 bg-muted-foreground/50"/><span className="hidden truncate group-hover:block group-focus-within:block">{g.name}</span></button>)}</nav></div>}
 <div className="min-w-0 flex-1">{group==="none"?<ElementGrid items={items} size={size} renderCard={card}/>:<div className="space-y-6">{categories.map(category=><section key={category} data-element-category={category}>{category&&<h2 className="mb-3 text-sm font-semibold text-muted-foreground">{category}</h2>}<div className="space-y-5">{groups.filter(g=>g.category===category).map(g=><section key={g.key} data-element-name={g.key}><h3 className="mb-2 font-medium">{g.name}</h3><ElementGrid items={g.items} size={size} renderCard={card}/></section>)}</div></section>)}</div>}</div>
 </div>;
}
