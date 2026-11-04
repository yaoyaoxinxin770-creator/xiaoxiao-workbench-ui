"use client";
import {useEffect,useMemo} from 'react';
import {Select} from 'antd';
import {ModelPicker} from './model-picker';
import {type AiConfig} from '@/stores/use-config-store';
import {ratioForSize} from '@/services/api/pippit';
import {PippitVideoQuickControls,type VideoSpec} from './pippit-video-quick-controls';
export function OiioiiVideoParameters({config,onChange}:{config:AiConfig;onChange:(key:'videoModel'|'videoChannelId'|'size'|'videoSeconds'|'vquality',value:string)=>void}){
 const spec=config.localChannels.find(c=>c.id===config.videoChannelId)?.oiioiiModels?.[config.videoModel];
 const durations=useMemo(()=>[...new Set((spec?.durations||[]).flatMap(value=>{const range=/^(\d+)-(\d+)$/.exec(String(value));return range?Array.from({length:Math.min(120,Number(range[2])-Number(range[1])+1)},(_,i)=>String(Number(range[1])+i)):[String(value)];}))].map(Number).filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b).map(String),[spec]);
 const ratios=spec?.aspect_ratios||[],resolutions=spec?.sizes||[];
 const quickSpec=useMemo<VideoSpec>(()=>({ratio:{options:spec?.aspect_ratios||[]},duration:{options:durations.map(Number)},resolution:{options:resolutions}}),[spec,durations,resolutions]);
 const currentRatio=(()=>{try{return ratioForSize(config.size);}catch{return config.size;}})();
 useEffect(()=>{if(durations.length&&!durations.includes(config.videoSeconds))onChange('videoSeconds',durations[0]);if(ratios.length&&!ratios.includes(currentRatio))onChange('size',ratios[0]);const resolution=/[pk]$/i.test(config.vquality)?config.vquality:config.vquality+'p';if(resolutions.length&&!resolutions.includes(resolution))onChange('vquality',resolutions[0]);},[config.videoSeconds,config.vquality,currentRatio,durations,ratios,resolutions,onChange]);
 return <><div data-oiioii-model className="w-auto shrink-0"><ModelPicker config={config} value={config.videoModel} channelId={config.videoChannelId} capability="video" className="canvas-compact-control !h-8 !rounded-full" onChange={model=>onChange('videoModel',model)} fullWidth={false}/></div><PippitVideoQuickControls compact provider="other" providedSpec={quickSpec} model={config.videoModel} size={config.size} seconds={config.videoSeconds} vquality={/[pk]$/i.test(config.vquality)?config.vquality:config.vquality+'p'} resolutionOptions={resolutions} resolutionAriaLabel="Oii 清晰度" onChange={onChange}/></>;
}
