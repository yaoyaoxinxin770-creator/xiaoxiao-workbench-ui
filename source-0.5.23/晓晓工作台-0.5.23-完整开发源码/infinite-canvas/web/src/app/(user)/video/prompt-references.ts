export type ReferenceRule = {disabled?:boolean;priority?:number;name?:string};
export function projectReferenceAssets<T extends {id:string}>(assets:T[],rules:Record<string,ReferenceRule>={}){return assets.map(a=>({...a,referenceRule:rules[a.id]}));}
// Older saved references have no assetId; identify their actual file before applying a rule.
export function assetsForReference<T extends {id:string;kind:string;title:string;localFile?:{id:string};data?:{storageKey?:string;dataUrl?:string;url?:string;content?:string}}>(assets:T[],ref:{assetId?:string;name:string;storageKey?:string;dataUrl?:string;url?:string},kind:string){
 const pool=assets.filter(a=>a.kind===kind),direct=pool.filter(a=>a.id===ref.assetId);
 const localId=(u:string|undefined)=>/\/workbench\/local-media\/([a-f0-9]{48})(?:[?#]|$)/.exec(u||"")?.[1];
 const sameUrl=(a:string|undefined,b:string|undefined,al?:string)=>{const la=localId(a),lb=al||localId(b);if(la&&lb)return la===lb;return Boolean(a&&b&&(a===b||a.includes('/workbench/local-media/')&&a.split('?')[0]===b.split('?')[0]));};
 const exact=pool.filter(a=>ref.storageKey?ref.storageKey===a.data?.storageKey:sameUrl(ref.dataUrl||ref.url,a.data?.dataUrl||a.data?.url,a.localFile?.id));
 if(exact.length&&(!direct.length||!direct.some(d=>exact.some(e=>e.id===d.id))))return exact;
 if(ref.assetId&&direct.length)return direct;
 return exact.length?exact:ref.assetId?[]:pool.filter(a=>a.title===ref.name);
}

type NamedAsset = { id: string; title: string; kind: string; category?: string; referenceRule?:ReferenceRule; metadata?: Record<string,unknown>; localFile?:{id:string}; data?:{storageKey?:string;dataUrl?:string;url?:string;content?:string} };
export const assetMatchNames=(a:NamedAsset)=>[...new Set([a.title,a.referenceRule?.name,...(Array.isArray(a.metadata?.elementAliases)?a.metadata.elementAliases.filter((n):n is string=>typeof n==="string"):[])].filter((n):n is string=>Boolean(n)))];
const normalize = (value:string) => String(value||"").normalize("NFKC").trim();
const nameKey = (value:string) => normalize(value).replace(/\s+/gu, "");
const roleName = (value:string) => normalize(value).replace(/\s*\((?:OS\s*\/\s*vo|OS|vo)\).*$/i, "").trim();
// Asset names often carry a numbered code prefix (C02 胡副局, S01 妖管局大门口): strip before matching.
const CODE_PREFIX=/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u;
const stripCode=(v:string)=>normalize(v).replace(CODE_PREFIX,"").trim();
// Optional age annotations may be absent from an asset title. Conflicting explicit ages stay distinct.
const ageName=(v:string)=>stripCode(v).replace(/[（(]\s*\d{1,3}\s*岁\s*[）)]|\d{1,3}\s*岁/gu,"").replace(/[-－_\s·・]+/gu," ").trim();
const ageCompatible=(a:string,b:string)=>{const x=a.match(/\d{1,3}\s*岁/gu),y=b.match(/\d{1,3}\s*岁/gu);return !x||!y||x.join()===y.join();};
export function nameMatchesAsset(displayName: string, name: string) {
 const a=normalize(displayName), s=stripCode(a), b=normalize(name);
 const boundaryMatch=[a,s].some(v=>{if(nameKey(v)===nameKey(b))return true;return v.startsWith(b)&&/^[-_\s·（(【.]/u.test(v.slice(b.length));});
 return Boolean(b)&&(boundaryMatch||ageCompatible(a,b)&&Boolean(ageName(b))&&(ageName(a)===ageName(b)||ageName(a).startsWith(ageName(b)+" ")));
}
// Match either direction at a suffix boundary. Prefer more matching characters,
// then the shortest unmatched suffix; equal candidates require manual binding.
export function closestNamedAssets<T extends NamedAsset>(assets:T[], name:string):T[] {
 const b=normalize(name),boundary=/^[-_\s·・（(【.]/u,separator=/[-_\s·・（(【.、]/u;
 const scoreName=(a:T,name:string)=>{
  const n=normalize(name),s=stripCode(n);
  const rules=(v:string):number[]|null=>nameKey(v)===nameKey(b)?[b.length,0,0]:v.startsWith(b)&&boundary.test(v.slice(b.length))?[b.length,v.length-b.length,0]:b.startsWith(v)&&boundary.test(b.slice(v.length))?[v.length,b.length-v.length,0]:typeof a.metadata?.elementPerformer==="string"&&normalize(a.metadata.elementPerformer)===b?[b.length,Math.abs(v.length-b.length),0]:null;
  const hit=rules(n)||(s!==n?rules(s):null);if(hit)return hit;
  const x=ageName(n),y=ageName(b);
  if(ageCompatible(n,b)&&x&&y){if(x===y)return [y.length,0,0];if(x.startsWith(y+" "))return [y.length,x.length-y.length,0];if(y.startsWith(x+" "))return [x.length,y.length-x.length,0];}
  // Fallback: the name appears as a whole segment inside the asset name (场景_胡副局_日景).
  if(b.length>=2){const at=s.indexOf(b);if(at>0&&separator.test(s[at-1])&&(at+b.length===s.length||separator.test(s[at+b.length])))return [b.length,s.length-b.length,1];}
  return null;
 };
 const score=(a:T)=>assetMatchNames(a).map(name=>scoreName(a,name)).filter((v):v is number[]=>v!==null).sort((a,b)=>b[0]-a[0]||a[1]-b[1]||a[2]-b[2])[0]||null;
  const ranked=assets.map(asset=>({asset,rank:score(asset)})).filter(x=>x.rank!==null);
 ranked.sort((a,b)=>b.rank![0]-a.rank![0]||a.rank![1]-b.rank![1]||a.rank![2]-b.rank![2]);
 const best=ranked[0]?.rank;return best?ranked.filter(x=>x.rank![0]===best[0]&&x.rank![1]===best[1]&&x.rank![2]===best[2]).map(x=>x.asset):[];
}
// Only known scene names are recognized in unbracketed scene prose; no invented missing names.
const isSceneAsset=(a:NamedAsset)=>a.kind==="image"&&(a.category==="场景"||/^(?:场景\s*)?S\d{1,3}(?=$|[\s_\-－.])/i.test(normalize(a.title)));
const sceneKey=(value:string)=>stripCode(value).replace(/[\s_\-－]+/gu,"").toLocaleLowerCase();
export function catalogSceneReferences(line:string,assets:NamedAsset[]) {
 const names=[...new Set(assets.filter(a=>isSceneAsset(a)&&!a.referenceRule?.disabled).flatMap(a=>assetMatchNames(a)).flatMap(n=>[normalize(n),stripCode(n)]).filter(n=>sceneKey(n).length>=2))];
 const positions:number[]=[],ends:number[]=[];let compact="";
 for(let at=0;at<line.length;){const ch=String.fromCodePoint(line.codePointAt(at)!),value=ch.normalize("NFKC").toLocaleLowerCase();if(!/^[\s_\-－]+$/u.test(value))for(const part of value){compact+=part;positions.push(at);ends.push(at+ch.length);}at+=ch.length;}
 const hits:{value:string;start:number;end:number}[]=[];
 for(const name of names){const key=normalize(name).replace(/[\s_\-－]+/gu,"").toLocaleLowerCase();let at=compact.indexOf(key);while(at>=0){const start=positions[at],end=ends[at+key.length-1];if(key.length>=4||(!line[start-1]||/[\s，。；;：:、|｜【（(]/u.test(line[start-1]))&&(!line[end]||/[\s，。；;：:、|｜】）)]/u.test(line[end])))hits.push({value:line.slice(start,end),start,end});at=compact.indexOf(key,at+1);}}
 const picked:typeof hits=[];for(const hit of hits.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start))if(!picked.some(p=>hit.start<p.end&&hit.end>p.start))picked.push(hit);
 return picked.sort((a,b)=>a.start-b.start);
}
// Several historical records can point to one local file. Only a shared source
// removes ambiguity; equal names/durations alone never establish identity.
const referenceSource=(a:NamedAsset)=>{const url=a.data?.dataUrl||a.data?.url||"",local=a.localFile?.id||/\/workbench\/local-media\/([a-f0-9]{48})(?:[?#]|$)/.exec(url)?.[1];return a.kind+":"+(local?"local:"+local:a.data?.storageKey?"stored:"+a.data.storageKey:url?"url:"+url:"asset:"+a.id);};
function distinctReferenceAssets<T extends NamedAsset>(assets:T[],chosen?:T):T[]{
 const score=(a:T)=>Number(a.id===chosen?.id)*4+Number(!a.metadata?.localFileMissing)*2+Number(Boolean(a.localFile));
 const unique=new Map<string,T>();for(const a of assets){const key=referenceSource(a),old=unique.get(key);if(!old||score(a)>score(old))unique.set(key,a);}return [...unique.values()];
}
export function matchPromptAssets<T extends NamedAsset>(prompt: string, assets: T[], selected: Record<string,string> = {}) {
 const text=prompt, matches:T[]=[], ambiguous:string[]=[], missing:string[]=[], issues:{name:string;kind:string;reason:string;start:number;end:number}[]=[], bindings:{name:string;kind:string;asset:T;start:number;end:number}[]=[];
 const tokens:{value:string;kind:string|null;alternatives?:string[];scene?:boolean;reportIssue?:boolean;start?:number;end?:number}[]=[];
 let block="",offset=0;
 for(const line of text.split("\n")) {
  const lineOffset=offset;offset+=line.length+1;
  // Like the Jimeng workbench: a heading at the start of any line ends the section,
  // including 【镜头01】 3.8s and 【女主（OS/vo）】 followed by instructions.
  const heading=/^\s*【([^】]+)】/.exec(line);if(block==="场景与连续状态"&&heading&&/^承接视频编号/.test(heading[1]))continue;if(heading&&(block!=="场景与连续状态"||/^(?:场景与连续状态|出场人物|声音锁定|项目规格|全局视觉|全局规则|镜头[0-9一二三四五六七八九十]|视频编号|承接视频编号|光线|声音与台词|配音|音效|画幅|制作要求|[^】]*(?:OS|vo))/i.test(heading[1]))){block=heading[1];continue;}
  if(block==="出场人物") {
   const declared=/^\s*(@?[^:：|｜【】]{1,30})\s*[:：]/.exec(line);
   if(declared && !/仅(?:画外)?声音|仅声音|仅在照片/.test(line)) {
    const alias=/资产\s*【([^】]+)】/.exec(line),name=roleName(declared[1].replace(/^@/,"")),aliasRaw=alias?.[1]||"",aliasClean=aliasRaw.split("@")[0].trim();
    const alts=[...new Set((alias ? [aliasRaw,aliasClean] : [name]).filter(Boolean))];
    tokens.push({value:name,kind:"image",alternatives:alts,reportIssue:!alias,start:lineOffset+line.indexOf(declared[1]),end:lineOffset+line.indexOf(declared[1])+declared[1].length});
    if(alias)tokens.push({value:aliasRaw,kind:"image",alternatives:aliasClean&&aliasClean!==aliasRaw?[aliasRaw,aliasClean]:undefined,start:lineOffset+alias.index+alias[0].indexOf(alias[1]),end:lineOffset+alias.index+alias[0].indexOf(alias[1])+alias[1].length});
   }
  }
  if(block==="声音锁定") {const voice=/^\s*(@?[^:：|｜【】]{1,30})\s*[:：|｜]/.exec(line);if(voice&&voice[1].trim()!=="语速锁定")tokens.push({value:roleName(voice[1].replace(/^@/,"")),kind:"audio",start:lineOffset+line.indexOf(voice[1]),end:lineOffset+line.indexOf(voice[1])+voice[1].length});}
  if(block==="场景与连续状态"){
   const refs=[...line.matchAll(/【([^】]+)】/g)].map(ref=>({value:ref[1],start:ref.index+1,end:ref.index+1+ref[1].length}));
   for(const ref of catalogSceneReferences(line,assets))if(!refs.some(r=>ref.start<r.end&&ref.end>r.start))refs.push(ref);
   for(const ref of refs.sort((a,b)=>a.start-b.start))tokens.push({...ref,kind:"image",scene:true,start:lineOffset+ref.start,end:lineOffset+ref.end});
  }
 }
 for(const m of text.matchAll(/@([^\s@，。；;：:、|｜【]+)/g)) {
  // A manually chosen @ outside these sections remains usable; plain @ text
  // elsewhere never starts automatic matching or a missing-material warning.
  const explicit=Object.keys(selected).filter(key=>key.startsWith("any:")).map(key=>key.slice(4)).filter(name=>name&&text.startsWith(name,m.index+1)&&(!text[m.index+1+name.length]||/[\s@，。；;：:、|｜【】]/.test(text[m.index+1+name.length]))).sort((a,b)=>b.length-a.length)[0];
  const name=explicit||roleName(m[1]);if(selected["any:"+name]&&!tokens.some(t=>t.start===m.index))tokens.push({value:name,kind:null,start:m.index,end:m.index+1+(explicit?.length||m[1].length)});
 }
 
 for(const t of tokens) {
  const value=normalize(t.value),key=(t.kind||"any")+":"+value;if(!value)continue;
  const available=assets.filter(a=>(!a.referenceRule?.disabled||Boolean(selected["preserve:asset:"+a.id]))&&(t.kind?a.kind===t.kind:a.kind==="image"||a.kind==="audio"));
  const manualId=selected["manual:"+key]||(t.alternatives||[]).map(name=>selected["manual:"+(t.kind||"any")+":"+normalize(name)]).find(Boolean);
  const manual=available.find(a=>a.id===manualId);
  const chosen=manual||available.find(a=>a.id===(selected[key]||(t.alternatives||[]).map(name=>selected[(t.kind||"any")+":"+normalize(name)]).find(Boolean)));
  const preservedPool=available.filter(a=>Boolean(selected["preserve:asset:"+a.id]));
  const preservedFallback=!chosen&&preservedPool.length?(()=>{for(const candidate of t.alternatives||[value]){const exactHit=preservedPool.filter(a=>assetMatchNames(a).some(name=>name&&nameKey(name)===nameKey(candidate)));if(exactHit.length===1)return exactHit[0];const closeHit=closestNamedAssets(preservedPool,candidate);if(closeHit.length===1)return closeHit[0];}return undefined;})():undefined;
  const effectiveChosen=chosen||preservedFallback;
  const preserved=Boolean(effectiveChosen&&selected["preserve:asset:"+effectiveChosen.id]);
  const preferred=manual||preserved?[]:available.filter(a=>(!effectiveChosen||t.kind||a.kind===effectiveChosen.kind)&&Number(a.referenceRule?.priority)>0&&(t.alternatives||[value]).some(n=>assetMatchNames(a).some(name=>name&&nameMatchesAsset(name,n))));
  const highest=Math.max(0,...preferred.map(a=>Number(a.referenceRule?.priority)));
  let hits:T[]=preferred.filter(a=>Number(a.referenceRule?.priority)===highest);
  if(effectiveChosen&&!hits.length)hits=[effectiveChosen];
  if(!hits.length)for(const candidate of t.alternatives||[value]) {
   hits=available.filter(a=>assetMatchNames(a).some(name=>name&&nameKey(name)===nameKey(candidate)));if(hits.length)break;
  }
  if(!hits.length&&t.scene)hits=available.filter(a=>isSceneAsset(a)&&assetMatchNames(a).some(n=>n&&sceneKey(n)===sceneKey(value)));
  if(!hits.length)for(const candidate of t.alternatives||[value]){hits=closestNamedAssets(available,candidate);if(hits.length)break;}
  if(t.scene&&hits.length>1&&hits.filter(a=>a.category==="场景").length===1)hits=hits.filter(a=>a.category==="场景");
  if(selected["omit:"+key])continue;const excluded=new Set(assets.filter(a=>selected["omit:asset:"+a.id]).map(referenceSource));hits=hits.filter(a=>!excluded.has(referenceSource(a)));
  hits=hits.flatMap(a=>{const id=selected['replace:asset:'+a.id];if(!id)return [a];const replacement=available.find(x=>x.id===id);return replacement&&!excluded.has(referenceSource(replacement))?[replacement]:[];});
  hits=distinctReferenceAssets(hits,chosen);
  if(hits.length===1||highest>0){for(const asset of hits){if(!matches.some(a=>a.id===asset.id))matches.push(asset);if(t.start!==undefined&&t.end!==undefined)bindings.push({name:value,kind:asset.kind,asset,start:t.start,end:t.end});}}
  else if(t.reportIssue!==false) {const reason=hits.length>1?"多套素材，请选择版本":"未匹配素材";if(!issues.some(i=>i.name===value&&i.kind===(t.kind||"any")))issues.push({name:value,kind:t.kind||"any",reason,start:t.start!,end:t.end!});if(hits.length>1){if(!ambiguous.includes(value))ambiguous.push(value);}else if(!missing.includes(value))missing.push(value);}
 }
 return {matches,ambiguous,missing,issues,bindings};
}

// Bind each occurrence to the user's explicit replacement, even if the old asset
// later becomes disabled or no longer matches the automatic name candidates.
export function replacePromptReferenceBindings<T extends NamedAsset>(prompt:string,assets:T[],previous:Record<string,string>,oldIds:string[],replacement:{id:string}){
 const next={...previous},ids=new Set(oldIds),report=matchPromptAssets(prompt,assets,previous);
 for(const binding of report.bindings)if(ids.has(binding.asset.id)){
  const key=binding.kind+':'+normalize(binding.name);next[key]=replacement.id;next['manual:'+key]=replacement.id;delete next['omit:'+key];
 }
 for(const id of oldIds){delete next['preserve:asset:'+id];for(const [key,value] of Object.entries(next))if(value===id&&!key.startsWith('omit:'))next[key]=replacement.id;next['replace:asset:'+id]=replacement.id;}
 next['preserve:asset:'+replacement.id]=replacement.id;
 delete next['omit:asset:'+replacement.id];return next;
}
export function missingPromptReferences<T extends NamedAsset>(report:ReturnType<typeof matchPromptAssets<T>>,boundNames:string[]){
 const pending=report.matches.filter(a=>a.metadata?.localFileMissing||!boundNames.includes(a.kind+":"+a.title)).flatMap(a=>{const at=report.bindings.find(b=>b.asset.id===a.id);return at?[{name:at.name,kind:a.kind,start:at.start,end:at.end,reason:a.metadata?.localFileMissing?"原文件失效，请重新定位":"素材尚未加入，请绑定"}]:[];});
 return Array.from(new Map([...report.issues,...pending].map(i=>[i.kind+":"+i.name,i])).values());
}
export function repairPromptMentions(prompt:string){return prompt.replace(/@([^@\s，。；;：:、|｜【]+)@([^@\s，。；;：:、|｜【]+)/g,(raw,a,b)=>nameMatchesAsset(b,a)?"@"+b:raw);}

export function restorePromptBindings<T extends NamedAsset&{data?:{storageKey?:string;dataUrl?:string;url?:string;content?:string}}>(prompt:string,assets:T[],references:({kind:string}&Parameters<typeof assetsForReference>[1])[],previous:Record<string,string>={}){
 const included:T[]=[];for(const ref of references){const allCandidates=assetsForReference(assets,ref,ref.kind),enabled=allCandidates.filter(a=>!a.referenceRule?.disabled),candidates=enabled.length?enabled:allCandidates,chosen=candidates.find(a=>a.id===ref.assetId)||candidates.find(a=>a.title===ref.name)||(candidates.length===1?candidates[0]:undefined);if(chosen&&!included.some(a=>a.id===chosen.id))included.push(chosen);}
 const selected:Record<string,string>={};
 for(const asset of included)selected["preserve:asset:"+asset.id]=asset.id;
 const neutralAssets=assets.map(a=>({...a,referenceRule:included.some(i=>i.id===a.id)?{...a.referenceRule,disabled:false,priority:0}:a.referenceRule?.priority?{...a.referenceRule,priority:0}:a.referenceRule}));
 const report=matchPromptAssets(prompt,neutralAssets,selected),includedReport=matchPromptAssets(prompt,included.map(a=>({...a,referenceRule:{...a.referenceRule,disabled:false,priority:0}})),selected);
 for(const [key,id] of Object.entries(previous))if((key.startsWith("manual:")||key.startsWith("replace:asset:"))&&included.some(a=>a.id===id))selected[key]=id;
 for(const b of includedReport.bindings){const key=b.kind+':'+b.name.normalize('NFKC').trim();selected[key]=b.asset.id;selected['manual:'+key]=b.asset.id;}
 for(const token of [...report.bindings,...report.issues]){const candidates=closestNamedAssets(included.filter(a=>token.kind==='any'||a.kind===token.kind),token.name),key=token.kind+':'+token.name.normalize('NFKC').trim();if(candidates.length===1){selected[key]=candidates[0].id;selected['manual:'+key]=candidates[0].id;}}
 for(const asset of included)for(const kind of [asset.kind,'any']){for(const rawName of assetMatchNames(asset)){const key=kind+':'+rawName.normalize('NFKC').trim();if(included.filter(a=>assetMatchNames(a).some(n=>n.normalize('NFKC').trim()===rawName.normalize('NFKC').trim())&&(kind==='any'||a.kind===kind)).length===1){selected[key]=asset.id;selected['manual:'+key]=asset.id;}}}
 for(const [key,value] of Object.entries(previous)){if(!key.startsWith('omit:'))continue;if(key.startsWith('omit:asset:')){if(!included.some(a=>a.id===key.slice(11)))selected[key]=value;}else{const [,kind,...parts]=key.split(':'),name=parts.join(':');if(!closestNamedAssets(included.filter(a=>kind==='any'||a.kind===kind),name).length)selected[key]=value;}}
 return selected;
}
