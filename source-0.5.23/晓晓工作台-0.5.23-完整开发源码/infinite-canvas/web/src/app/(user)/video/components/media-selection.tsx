"use client";
import {Check} from "lucide-react";
export function MediaSelection({label,selected,onChange}:{label:string;selected:boolean;onChange:(checked:boolean)=>void}) {
 return <label data-media-selection className={"absolute left-2 top-2 z-10 size-7 cursor-pointer transition-opacity "+(selected?"opacity-100":"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")} onClick={event=>event.stopPropagation()}>
 <input type="checkbox" aria-label={label} checked={selected} onChange={event=>onChange(event.target.checked)} className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full border border-white/60 bg-black/30 backdrop-blur-sm checked:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"/>
 <Check aria-hidden className="pointer-events-none absolute inset-1.5 size-4 text-white opacity-0 peer-checked:opacity-100"/>
 </label>;
}
