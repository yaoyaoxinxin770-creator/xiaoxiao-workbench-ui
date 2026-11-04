"use client";
import {App,Button,Input} from 'antd';
import {useAssetStore,type Asset} from '@/stores/use-asset-store';
import {useVideoStudioStore} from '@/stores/use-video-studio-store';
import {groupElements} from './element-model';
import {elementMovePatch,type ElementMove} from './element-organize';
let roleCache:{assets:Asset[];project:unknown;roles:string[]}|undefined;
export function useElementMoves(){
 const {message,modal}=App.useApp(),assets=useAssetStore(s=>s.assets),project=useVideoStudioStore(s=>s.projects.find(p=>p.id===s.activeProjectId));
 if(!roleCache||roleCache.assets!==assets||roleCache.project!==project)roleCache={assets,project,roles:project?[...new Set(groupElements(assets.filter(a=>project.elementIds.includes(a.id))).filter(g=>g.category==='人物').map(g=>g.name))]:[]};const roles=roleCache.roles;
 const move=(items:Asset[],target:ElementMove)=>{if(!project||!items.length)return;try{
  const patches=items.map(a=>elementMovePatch(a,target)),before=items.map(a=>({id:a.id,category:a.category,metadata:a.metadata,rule:project.elementRules?.[a.id]})),projectId=project.id;
  items.forEach((a,i)=>{if(target.kind!=='disabled')useAssetStore.getState().updateAsset(a.id,patches[i]);});
  if(target.kind==='disabled')useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===projectId?{...p,elementRules:{...p.elementRules,...Object.fromEntries(items.map(a=>[a.id,{...p.elementRules?.[a.id],disabled:true,disabledAt:Date.now()}]))}}:p)}));
  const key='move-'+Date.now();message.success({key,duration:8,content:<span>已移动 {items.length} 个素材到 {target.name} <Button size="small" type="link" onClick={()=>{for(const a of before){const current=useAssetStore.getState().assets.find(v=>v.id===a.id);if(current&&target.kind!=='disabled'){const metadata={...current.metadata};for(const k of ['elementManualCategory','elementManualGroup','elementPerformer','elementRoleGroup']){if(Object.prototype.hasOwnProperty.call(a.metadata||{},k))metadata[k]=a.metadata![k];else delete metadata[k];}useAssetStore.getState().updateAsset(a.id,{category:a.category,metadata});}}if(target.kind==='disabled')useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===projectId?{...p,elementRules:{...p.elementRules,...Object.fromEntries(before.map(a=>[a.id,a.rule||{}]))}}:p)}));message.destroy(key);}}>撤销</Button></span>});
 }catch(e){message.error(e instanceof Error?e.message:'移动失败');}};
 const choose=(items:Asset[],key:string)=>{if(key==='new-role'){let value='';modal.confirm({title:'新建角色并移入',content:<Input aria-label="新角色名称" placeholder="角色名称" onChange={e=>{value=e.target.value;}}/>,okText:'移动',cancelText:'取消',onOk:()=>{if(!value.trim())return Promise.reject(Error('请填写角色名称'));move(items,{kind:'role',name:value.trim()});}});return;}const [kind,...parts]=key.split(':');move(items,{kind:kind as ElementMove['kind'],name:decodeURIComponent(parts.join(':'))});};
 const options=[{label:'剧目角色',options:[...roles.map(name=>({value:'role:'+encodeURIComponent(name),label:name})),{value:'new-role',label:'＋ 新建角色…'}]},{label:'资产分类',options:['人物','场景','道具','未分类'].map(name=>({value:'category:'+encodeURIComponent(name),label:name}))}];
 const menuItems=options.map((g,i)=>({key:'move-group-'+i,label:g.label,children:g.options.map(o=>({key:'move:'+o.value,label:o.label}))}));
 return {roles,move,choose,options,menuItems};
}
