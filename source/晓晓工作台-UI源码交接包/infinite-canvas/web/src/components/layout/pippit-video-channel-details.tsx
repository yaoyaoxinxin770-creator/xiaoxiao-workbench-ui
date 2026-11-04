"use client";
import {useEffect,useRef,useState} from "react";
import {Button,Select} from "antd";
import {workbench} from "@/services/api/workbench";
import {fetchPippitModels} from "@/services/api/pippit";
import {useConfigStore} from "@/stores/use-config-store";
import {useVideoStudioStore} from "@/stores/use-video-studio-store";
import {pippitCanvasSettings,type CanvasSettings} from "@/services/api/pippit-canvas";
type Official={ready:boolean;accountId?:string;loginWindowOpen?:boolean;error?:string};
export function PippitVideoChannelDetails({onClose}:{onClose:()=>void}){
 const projectKey=useVideoStudioStore(s=>s.activeProjectId);
 const [status,setStatus]=useState<{logged_in:boolean;accountId?:string}|null>(null),[balance,setBalance]=useState<number|null>(null),[target,setTarget]=useState<CanvasSettings['target']>(null),[official,setOfficial]=useState<Official|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const current=useRef(projectKey);current.current=projectKey;
 const refresh=async(models=false)=>{const key=projectKey;setBusy('refresh');setError('');try{const [s,b,c,o]=await Promise.allSettled([workbench().pippitStatus(),workbench().pippitCredits(),pippitCanvasSettings(key),workbench().pippitOfficialStatus()]);if(current.current!==key)return;if(s.status==='fulfilled')setStatus(s.value);if(b.status==='fulfilled')setBalance(b.value.balance);if(c.status==='fulfilled')setTarget(c.value.target);if(o.status==='fulfilled')setOfficial(o.value);const failed=[s,c,o].find(r=>r.status==='rejected');if(failed?.status==='rejected')setError(failed.reason?.message||'连接检查失败');if(models)useConfigStore.getState().setPippitCatalog(await fetchPippitModels());}catch(e){if(current.current===key)setError(e instanceof Error?e.message:'小云雀连接失败');}finally{if(current.current===key)setBusy('');}};
 useEffect(()=>{setTarget(null);void refresh();const changed=()=>void refresh();window.addEventListener('pippit-credits-changed',changed);window.addEventListener('pippit-canvas-changed',changed);return()=>{window.removeEventListener('pippit-credits-changed',changed);window.removeEventListener('pippit-canvas-changed',changed);};},[projectKey]);
 return <><div data-testid="pippit-channel-details" className="w-80 space-y-3 text-sm">
 <div className="flex items-center gap-2"><Select aria-label="当前小云雀账号" className="min-w-0 flex-1" value="current" options={[{value:'current',label:official?.accountId?'小云雀账号 '+official.accountId:status?.logged_in?'已授权账号':'未授权'}]}/><Button size="small" onClick={()=>{onClose();window.dispatchEvent(new Event('pippit-open-account-settings'));}}>账号管理</Button></div>
 <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{target?'画布：'+target.title:'未指定画布'}</span><Button size="small" onClick={()=>{onClose();window.dispatchEvent(new Event('pippit-open-canvas-settings'));}}>画布管理</Button></div>
 <p className="text-xs text-muted-foreground">{official?.ready?'官方后台会话已就绪':'官方后台会话尚未启用'} · 无需浏览器插件</p>
 <p role="status">{error||(status?.logged_in?'小云雀余额 '+(balance===null?'暂不可用':balance.toLocaleString()):busy?'正在检查小云雀…':'小云雀授权状态未确认')}</p>
 <div className="flex gap-2"><Button size="small" loading={Boolean(busy)} onClick={()=>void refresh(true)}>刷新</Button><Button size="small" disabled={Boolean(busy)} onClick={()=>{onClose();window.dispatchEvent(new Event('pippit-open-account-settings'));}}>检查授权</Button></div>
 <p className="text-xs text-muted-foreground">在所选画布创建节点、引用素材并生成，完成后自动保存回工作台。使用当前小云雀账号积分。</p>
 </div></>;
}
