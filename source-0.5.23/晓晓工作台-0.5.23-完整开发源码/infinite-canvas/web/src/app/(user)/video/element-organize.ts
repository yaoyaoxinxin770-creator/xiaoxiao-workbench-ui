import type {Asset} from '@/stores/use-asset-store';
export type ElementMove={kind:'role'|'category'|'disabled';name:string};
export function elementMovePatch(asset:Asset,target:ElementMove):Partial<Asset>{
 if(target.kind==='disabled')return {};
 if(target.kind==='role'&&!['image','audio'].includes(asset.kind))throw Error('只有图片和音频可以移入角色库');
 if(target.kind==='category'&&!['人物','场景','道具','未分类'].includes(target.name))throw Error('此分类不支持移动素材');
 if(target.kind==='category'&&asset.kind!=='image'&&target.name!=='未分类')throw Error('音频和视频按文件类型分类，不能移到'+target.name);
 const category=asset.kind==='audio'?'音频':asset.kind==='video'?'视频':target.kind==='role'?'人物':target.name;
 const metadata={...asset.metadata,elementManualCategory:category,elementRoleGroup:undefined};
 if(target.kind==='role')Object.assign(metadata,{elementManualGroup:target.name.trim(),elementPerformer:target.name.trim()});
 else Object.assign(metadata,{elementManualGroup:'',elementPerformer:''});
 return {category,metadata};
}
export function draggedElementIds(id:string,selected:string[]){return selected.includes(id)?selected:[id];}
