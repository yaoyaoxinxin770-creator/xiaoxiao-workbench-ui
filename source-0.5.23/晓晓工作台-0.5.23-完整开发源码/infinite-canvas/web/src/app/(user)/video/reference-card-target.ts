import {assetsForReference} from "./prompt-references";
export function referenceCardTarget(prompt:string,bindings:{name:string;kind:string;asset:{id:string};start:number;end:number}[],assets:Parameters<typeof assetsForReference>[0],reference:Parameters<typeof assetsForReference>[1],kind:string,index:number){
 const ids=new Set(assetsForReference(assets,reference,kind).map(a=>a.id)),matches=bindings.filter(b=>b.kind===kind&&ids.has(b.asset.id)).sort((a,b)=>(b.end-b.start)-(a.end-a.start));
 if(matches.length)return {...matches[0],kind};
 const slot=({image:"图片",audio:"音频",video:"视频"} as Record<string,string>)[kind]+(index+1),name=prompt.includes("@"+slot)?slot:reference.name,start=prompt.indexOf(name);
 return {name,kind,start,end:start<0?-1:start+name.length};
}
