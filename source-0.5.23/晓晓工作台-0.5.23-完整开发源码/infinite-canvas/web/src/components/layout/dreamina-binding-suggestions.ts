export type Binding={kind:string;name:string;nodeId:string};
export type CanvasNode={nodeId:string;type:string;title?:string;status:string};
type LocalAsset={kind:string;title:string};
export type BindingSuggestion={kind:string;name:string;matches:CanvasNode[];state:'bound'|'unique'|'ambiguous'|'missing'};
export const bindingName=(name:string)=>name.normalize("NFKC").trim().replace(/\.(png|jpe?g|webp|mp4|webm|mov|wav|mp3|m4a)$/i,"").toLowerCase();
const stripCode=(name:string)=>bindingName(name).replace(/^[a-z]?\d+\s+/,"");
export const sameBinding=(b:Binding,asset:LocalAsset)=>b.kind===asset.kind&&bindingName(b.name)===bindingName(asset.title);
export function chooseBinding(rows:Binding[],asset:LocalAsset,nodeId:string){
 const index=rows.findIndex(b=>sameBinding(b,asset));
 return index<0?[...rows,{kind:asset.kind,name:asset.title,nodeId}]:rows.map((b,i)=>i===index?{...b,nodeId}:b);
}
export function suggestBindings(assets:LocalAsset[],nodes:CanvasNode[],bindings:Binding[]){
 let rows=[...bindings];const results:BindingSuggestion[]=[];
 for(const asset of assets){
  if(results.some(r=>r.kind===asset.kind&&bindingName(r.name)===bindingName(asset.title)))continue;
  if(rows.some(b=>sameBinding(b,asset)&&b.nodeId)){results.push({kind:asset.kind,name:asset.title,matches:[],state:'bound'});continue;}
  let matches=nodes.filter(n=>n.type===asset.kind&&bindingName(n.title||'')===bindingName(asset.title));
  if(!matches.length&&stripCode(asset.title))matches=nodes.filter(n=>n.type===asset.kind&&stripCode(n.title||'')===stripCode(asset.title));
  matches=[...new Map(matches.map(n=>[n.nodeId,n])).values()];
  const state=matches.length===1?'unique':matches.length?'ambiguous':'missing';
  results.push({kind:asset.kind,name:asset.title,matches,state});
  if(state==='unique')rows=chooseBinding(rows,asset,matches[0].nodeId);
 }
 return {bindings:rows,results};
}
