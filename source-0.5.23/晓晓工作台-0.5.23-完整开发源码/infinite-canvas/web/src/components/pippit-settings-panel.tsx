"use client";
import { useEffect, useRef, useState } from "react";
import { Button, InputNumber, Select } from "antd";
import { describePippitModel, ratioForSize } from "@/services/api/pippit";
import type { AiConfig } from "@/stores/use-config-store";

type Spec = {description?:string;pricing_rule?:{content?:string};ratio?:{options:(string|number)[];option_labels?:Record<string,string>};resolution?:{options:string[]};duration?:{min?:number;max?:number;step?:number;options?:number[]}};
export function PippitSettingsPanel({config,type,onChange,showCount=false,visualOnly=false,className}:{config:AiConfig;type:"image"|"video";onChange:(key:any,value:string)=>void;showCount?:boolean;visualOnly?:boolean;className?:string}) {
    const [spec,setSpec]=useState<Spec|null>(null),[error,setError]=useState(""),[revision,setRevision]=useState(0);
    const changeRef=useRef(onChange);changeRef.current=onChange;
    const model=config.model || (type==="image"?config.imageModel:config.videoModel);
    useEffect(()=>{
        let active=true;setSpec(null);setError("");
        if(!model)return;
        void describePippitModel(model,type).then(value=>{if(active)setSpec(value);}).catch(error=>{if(active)setError(error instanceof Error?error.message:"小云雀模型参数读取失败");});
        return ()=>{active=false;};
    },[model,type,revision]);
    useEffect(()=>{
        if(!spec)return;
        const ratios=(spec.ratio?.options || []).map(value=>type === "image" ? spec.ratio?.option_labels?.[String(value)] || "" : String(value)).filter(Boolean);
        let ratio="";try{ratio=ratioForSize(config.size);}catch{}
        if(ratios.length && !ratios.includes(ratio)) changeRef.current("size",ratios[0] === "adaptive" ? "auto" : ratios[0]);
        const resolution=type === "image" ? config.quality : /^\d+$/.test(config.vquality) ? config.vquality+"p" : config.vquality;
        if(resolution && resolution !== "auto" && !(spec.resolution?.options || []).includes(resolution)) changeRef.current(type === "image" ? "quality" : "vquality","auto");
        if(type === "video" && !visualOnly) {
            const seconds=Number(config.videoSeconds),duration=spec.duration;
            if(duration?.options?.length && !duration.options.includes(seconds)) changeRef.current("videoSeconds",String(duration.options[0]));
            else if(duration && (seconds < (duration.min || 1) || seconds > (duration.max || Infinity))) changeRef.current("videoSeconds",String(Math.max(duration.min || 1,Math.min(duration.max || seconds,seconds))));
        }
    },[spec,type,visualOnly,config.size,config.quality,config.vquality,config.videoSeconds]);
    if(!model)return <div className="text-xs opacity-60">请先同步小云雀模型</div>;
    if(error)return <div className="space-y-2 text-xs"><div>{error}</div><Button size="small" onClick={()=>setRevision(value=>value+1)}>重新读取参数</Button></div>;
    if(!spec)return <div className="text-xs opacity-60">正在读取小云雀模型参数…</div>;
    const ratios=(spec.ratio?.options || []).map(value=>({value:type==="image"?spec.ratio?.option_labels?.[String(value)] || "":String(value),label:type==="image"?spec.ratio?.option_labels?.[String(value)] || "":String(value)})).filter(item=>item.value);
    const resolution=type==="image"?config.quality:(/^\d+$/.test(config.vquality)?config.vquality+"p":config.vquality);
    let ratio="";try{ratio=ratioForSize(config.size);}catch{}
    return <div className={className || "space-y-3"} onMouseDown={event=>event.stopPropagation()}>
        <div className="text-xs opacity-60">{spec.description || "选项来自当前小云雀模型。"}</div>
        {spec.pricing_rule?.content?<div className="text-xs opacity-60">{spec.pricing_rule.content}</div>:null}
        {ratios.length>0?<label className="grid gap-1.5 text-xs">画面比例<Select aria-label="小云雀画面比例" value={ratio} options={ratios.map(item=>({...item,label:item.label==="adaptive"?"自动":item.label}))} onChange={value=>onChange("size",value==="adaptive"?"auto":value)} /></label>:null}
        {spec.resolution?.options?.length?<label className="grid gap-1.5 text-xs">分辨率<Select aria-label="小云雀分辨率" value={resolution} options={[{value:"auto",label:"默认"},...spec.resolution.options.map(value=>({value,label:value}))]} onChange={value=>onChange(type==="image"?"quality":"vquality",value)} /></label>:null}
        {type==="video" && model.endsWith("_draft")?<div className="text-xs opacity-60">先生成 480P 样片；确认满意后可在样片节点选择转成片。两步分别计费。</div>:null}
        {type==="video" && !visualOnly?<label className="grid gap-1.5 text-xs">视频时长（秒）{spec.duration?.options?.length?<Select value={Number(config.videoSeconds)} options={spec.duration.options.map(value=>({value,label:String(value)}))} onChange={value=>onChange("videoSeconds",String(value))}/>:<InputNumber min={spec.duration?.min || 1} max={spec.duration?.max} step={spec.duration?.step || 1} precision={0} value={Number(config.videoSeconds)} onChange={value=>{if(value!==null)onChange("videoSeconds",String(value));}}/>}</label>:null}
        {type==="image" && showCount?<label className="grid gap-1.5 text-xs">图片数量<InputNumber min={1} max={15} precision={0} value={Number(config.count)||1} onChange={value=>{if(value!==null)onChange("count",String(value));}}/></label>:null}
    </div>;
}
