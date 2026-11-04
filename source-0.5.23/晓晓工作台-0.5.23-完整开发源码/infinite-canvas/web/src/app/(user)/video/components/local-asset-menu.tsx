"use client";
import type {ReactElement} from 'react';
import {App,Dropdown} from 'antd';
import {useAssetStore,type Asset} from '@/stores/use-asset-store';
import {useVideoStudioStore} from '@/stores/use-video-studio-store';
import {useElementMoves} from '../use-element-moves';
import {ImageReplacementTarget} from './image-replacement-target';
import {elementCategory,elementPinnedAt,groupElements,elementPriorityPatch} from '../element-model';
import {assetsForReference} from '../prompt-references';
import {localSourceId,openLocalAssetFolder,replaceLocalAssetImage,relinkLocalAsset,relinkLocalFolder,type LocalAssetReference} from '@/services/api/local-assets';
export function LocalAssetMenu({asset,reference,kind,children,hideRelink=false,allowUnclassify=false,hideRolePin=false}:{hideRelink?:boolean;allowUnclassify?:boolean;hideRolePin?:boolean;asset?:Asset;reference?:LocalAssetReference;kind?:string;children:ReactElement}){
 const moves=useElementMoves();
 const {message,modal}=App.useApp(),id=localSourceId(asset,reference,kind),assets=useAssetStore(s=>s.assets),project=useVideoStudioStore(s=>s.projects.find(p=>p.id===s.activeProjectId));
 const candidates=asset?[asset]:reference?assetsForReference(assets,reference,kind||''):[],members=candidates.filter(a=>project?.elementIds.includes(a.id)),target=members.length===1?members[0]:undefined,rule=target?project?.elementRules?.[target.id]:undefined;
 const projectAssets=project?assets.filter(a=>project.elementIds.includes(a.id)):assets;
 const roleGroup=target&&elementCategory(target)==='人物'?groupElements(projectAssets,projectAssets).find(g=>g.category==='人物'&&g.items.some(item=>item.id===target.id)):undefined;
 const roleItems=roleGroup?roleGroup.items:target&&elementCategory(target)==='人物'?[target]:[];
 const rolePinned=roleItems.some(item=>elementPinnedAt(item)>0);
 return <Dropdown trigger={['contextMenu']} menu={{items:[
  ...(!hideRolePin&&target&&elementCategory(target)==='人物'?[{key:'pin-role',label:rolePinned?'取消置顶':'置顶人物'}]:[]),
  ...(target?[{key:'priority',label:Number(rule?.priority)>0?'取消优先':'设为优先'},{key:'disabled',label:rule?.disabled?'取消禁用':'禁用素材'}]:[]),
  ...(target?.kind==='image'?[{key:'replace-image',label:'替换图片…'}]:[]),
  ...(target&&allowUnclassify?[{key:"unclassify",label:"移到未分类"}]:[]),
  ...(target&&hideRelink?[{key:'move',label:'移动到…',children:moves.menuItems}]:[]),
  ...(target?[{key:'delete',label:'删除素材',danger:true}]:[]),
  ...(!hideRelink&&target?.localFile?[{key:'relink-one',label:'重新定位此素材…'}]:[]),
  ...(!hideRelink&&(id||target?.localFile)?[{key:'relink-folder',label:'选择文件夹一键定位…'}]:[]),
  {type:'divider' as const},
  {key:'folder',label:'打开本地所在文件夹',disabled:!id,title:id?undefined:'此素材没有绑定本地原文件'},
 ],onClick:({key})=>{
 if(key==='pin-role'&&target){const next=rolePinned?0:Date.now(),ids=new Set(roleItems.map(item=>item.id));useAssetStore.setState(s=>({assets:s.assets.map(a=>ids.has(a.id)?{...a,metadata:{...a.metadata,elementRolePinnedAt:next,elementPinnedAt:next}}:a)}));message.success(rolePinned?'已取消置顶':'已置顶人物');return;}
 if(key==='unclassify'&&target){moves.move([target],{kind:'category',name:'未分类'});return;}
 if(key.startsWith('move:')&&target){moves.choose([target],key.slice(5));return;}
 if(key==='delete'&&target&&project){modal.confirm({title:'删除元素',content:'将「'+target.title+'」从当前项目元素库移除？原文件会保留。',okText:'删除',cancelText:'取消',okButtonProps:{danger:true},onOk:()=>useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>p.id===project.id?{...p,elementIds:p.elementIds.filter(id=>id!==target.id)}:p)}))});return;}
 if(key==='replace-image'&&target){void replaceLocalAssetImage(target).then(changed=>{if(changed)message.success('图片已替换，旧图已保留到禁用区');}).catch(error=>message.error(error.message||'替换图片失败'));return;}
 if(key==='folder'){void openLocalAssetFolder(id).catch(error=>message.error(error.message||'打开文件夹失败'));return;}
 if(key==='relink-one'&&target){void relinkLocalAsset(target).then(()=>message.success('已重新定位')).catch(error=>message.error(error.message||'重新定位失败'));return;}
 if(key==='relink-folder'){void relinkLocalFolder(projectAssets).then(res=>{if(!res.canceled)message.success(res.healedCount>0?`一键定位完成：已恢复 ${res.healedCount} 个素材`:'未在该文件夹找到匹配的缺失素材');}).catch(error=>message.error(error.message||'批量定位失败'));return;}
 if(!target||!project||!['priority','disabled'].includes(key))return;
 useVideoStudioStore.setState(s=>({projects:s.projects.map(p=>{if(p.id!==project.id)return p;const current=p.elementRules?.[target.id]||{},patch=key==='priority'?elementPriorityPatch(current,Number(current.priority)>0?0:1,p.elementRules||{}):{disabled:!current.disabled,...(!current.disabled?{disabledAt:Date.now()}:{})};return {...p,elementRules:{...p.elementRules,[target.id]:{...current,...patch}}};})}));
 message.success(key==='priority'?(Number(rule?.priority)>0?'已取消优先':'已设为优先'):(rule?.disabled?'已取消禁用':'已禁用素材'));
 }}}>{hideRelink&&target?.kind==='image'?<ImageReplacementTarget onFile={async files=>{if(await replaceLocalAssetImage(target,files))message.success('图片已替换，旧图已保留到禁用区');}}>{children}</ImageReplacementTarget>:children}</Dropdown>;
}
