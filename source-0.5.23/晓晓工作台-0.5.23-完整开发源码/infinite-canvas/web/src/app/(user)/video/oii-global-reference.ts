import type {Asset} from '@/stores/use-asset-store';
import type {AiConfig} from '@/stores/use-config-store';
import type {ReferenceVideo} from '@/types/media';
export function oiiGlobalAsset(config:AiConfig,assets:Asset[]){
 if(config.oiioiiGlobalReference?.enabled===false)return null;
 const id=config.oiioiiGlobalReference?.assetId;
 if(id){const asset=assets.find(a=>a.id===id&&a.kind==='video');if(!asset)throw Error('Oii 固定参考视频已移除，请在渠道设置更换或关闭');return asset as Extract<Asset,{kind:'video'}>;}
 const matches=assets.filter((a):a is Extract<Asset,{kind:'video'}>=>a.kind==='video'&&a.title.replace(/\s/g,'')==='2秒打折');
 const unique=[...new Map(matches.map(a=>[a.localFile?.id||a.data.storageKey||a.data.url,a])).values()];
 if(unique.length>1)throw Error('找到多个“2秒打折”视频，请在 Oii 渠道设置选择固定参考');
 return unique[0]||null;
}
export function withOiiGlobalVideo(config:AiConfig,assets:Asset[],references:ReferenceVideo[]){
 const asset=oiiGlobalAsset(config,assets);if(!asset)return references;
 if(references.some(r=>r.assetId===asset.id||r.url===asset.data.url||Boolean(r.storageKey&&r.storageKey===asset.data.storageKey)))return references;
 return [...references,{id:'oii-global-'+asset.id,assetId:asset.id,name:asset.title,type:asset.data.mimeType,url:asset.data.url,storageKey:asset.data.storageKey,bytes:asset.data.bytes,width:asset.data.width,height:asset.data.height}];
}
