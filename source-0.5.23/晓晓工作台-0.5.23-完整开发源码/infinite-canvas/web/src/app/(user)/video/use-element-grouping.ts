"use client";
import { useSyncExternalStore } from "react";
const key="xiaoxiao.element-grouping",event="xiaoxiao-element-grouping-changed";
const valid=(value:string|null):value is "name"|"date"|"none"=>value==="name"||value==="date"||value==="none";
const subscribe=(notify:()=>void)=>{window.addEventListener("storage",notify);window.addEventListener(event,notify);return()=>{window.removeEventListener("storage",notify);window.removeEventListener(event,notify);};};
export function useElementGrouping(fallback="name"){
 const group=useSyncExternalStore(subscribe,()=>{try{const value=localStorage.getItem(key);return valid(value)?value:fallback;}catch{return fallback;}},()=>fallback);
 const setGroup=(value:string)=>{if(!valid(value))return;try{localStorage.setItem(key,value);}catch{return;}window.dispatchEvent(new Event(event));};
 return [group,setGroup] as const;
}
