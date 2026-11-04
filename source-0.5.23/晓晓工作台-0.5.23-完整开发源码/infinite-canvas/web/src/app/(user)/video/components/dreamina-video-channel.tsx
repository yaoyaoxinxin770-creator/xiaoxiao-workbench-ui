"use client";
import {useEffect,useState} from "react";
import {Popover,Select} from "antd";
import {ChevronDown,Check} from "lucide-react";
import {ModelPicker} from "@/components/model-picker";
import {PippitVideoQuickControls} from "@/components/pippit-video-quick-controls";
import {useConfigStore,type AiConfig} from "@/stores/use-config-store";
import {dreaminaVersionForConfig} from "@/services/api/dreamina";
import {isOiioiiConfig} from "@/services/api/oiioii";
import {useEffectiveConfig} from "@/stores/use-config-store";
import {isPippitConfig} from "@/services/api/pippit";
import {workbench} from "@/services/api/workbench";
type Spec={resolution?:{default?:string;options:string[]}};
export function DreaminaVideoParameters({config,onChange,provider="dreamina",interpolationFps,onInterpolationChange}:{provider?:"dreamina"|"pippit";config:AiConfig;onChange:(key:"videoModel"|"size"|"videoSeconds"|"vquality",value:string)=>void;interpolationFps?:0|30|60;onInterpolationChange?:(value:0|30|60)=>void}){
 return <>
  <div data-dreamina-model className="w-auto shrink-0"><ModelPicker selectedLabel={/^seedance_2\.5_draft$/i.test(config.videoModel)?"seedance 2.5 draft":undefined} config={config} value={config.videoModel} channelId={config.videoChannelId} capability="video" onChange={model=>onChange("videoModel",model)} className="canvas-compact-control !h-8 !rounded-full" fullWidth={false}/></div>
  <PippitVideoQuickControls compact provider={provider} dreaminaVersion={dreaminaVersionForConfig(config)} dreaminaAccountProfile={config.dreaminaAccountProfile} model={config.videoModel} size={config.size} seconds={config.videoSeconds} vquality={config.vquality} interpolationFps={interpolationFps} onInterpolationChange={onInterpolationChange} onChange={onChange}/>
 </>;
}

export function DreaminaCreationMode(){
 const config=useConfigStore(s=>s.config),effective=useEffectiveConfig();
 const provider=config.videoStudioProvider==="dreamina"?"dreamina":isOiioiiConfig({...effective,model:effective.videoModel,activeChannelId:effective.videoChannelId})?"oiioii":isPippitConfig(effective)?"pippit":null;
 if(!provider||provider==="dreamina"&&config.dreaminaVersion==="legacy")return null;
 const key=provider==="dreamina"?"dreaminaGenerationMode":provider==="oiioii"?"oiioiiGenerationMode":"pippitGenerationMode",label=provider==="dreamina"?"即梦":provider==="oiioii"?"Oii":"小云雀";
 return <Select aria-label={label+"创作方式"} className="!w-52 shrink-0" popupMatchSelectWidth={false} value={config[key]||(provider==="dreamina"?"confirm":"direct")} onChange={value=>useConfigStore.getState().updateConfig(key,value)} options={[{value:"confirm",label:"① 弹窗确认后生成"},{value:"draft",label:"② 只建节点，不生成"},{value:"direct",label:"③ 直接生成（扣积分）"}]}/>;
}

export function DreaminaInterpolationParameter({value,onChange}:{value:0|30|60;onChange:(value:0|30|60)=>void}){
 const [open,setOpen]=useState(false),options=[{value:0 as const,label:"不补帧"},{value:30 as const,label:"30 FPS"},{value:60 as const,label:"60 FPS"}];
 return <Popover trigger="click" open={open} onOpenChange={setOpen} content={<div role="listbox" aria-label="即梦补帧选项" className="grid min-w-36 gap-1">{options.map(option=><button type="button" role="option" aria-selected={value===option.value} key={option.value} className="flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent" onClick={()=>{onChange(option.value);setOpen(false);}}>{option.label}{value===option.value&&<Check className="size-4"/>}</button>)}</div>}>
  <button type="button" aria-label="即梦补帧" title="补帧帧率" className="flex h-9 items-center gap-2 rounded-xl bg-accent/50 px-3 text-sm text-foreground">{options.find(option=>option.value===value)?.label}<ChevronDown className="size-4"/></button>
 </Popover>;
}
