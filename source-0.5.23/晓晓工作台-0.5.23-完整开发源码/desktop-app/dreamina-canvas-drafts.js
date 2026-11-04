const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {codeName,referenceName}=require('./dreamina-canvas-targets');
const kinds=['image','video','audio'];
const kindNames={image:'图片',video:'视频',audio:'音频',any:'素材'};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clean=s=>String(s||'').normalize('NFKC').trim();
// Keep name-ranking behavior aligned with video/prompt-references.ts; parity is regression-tested.
const normalize = (value) => String(value || "").normalize("NFKC").trim();
const nameKey = (value) => normalize(value).replace(/\s+/gu, "");
const roleName = (value) => normalize(value).replace(/\s*\((?:OS\s*\/\s*vo|OS|vo)\).*$/i, "").trim();
// Asset names often carry a numbered code prefix (C02 胡副局, S01 妖管局大门口): strip before matching.
const CODE_PREFIX = /^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u;
const stripCode = (v) => normalize(v).replace(CODE_PREFIX, "").trim();
// Optional age annotations may be absent from an asset title. Conflicting explicit ages stay distinct.
const ageName = (v) => stripCode(v).replace(/[（(]\s*\d{1,3}\s*岁\s*[）)]|\d{1,3}\s*岁/gu, "").replace(/[-－_\s·・]+/gu, " ").trim();
const ageCompatible = (a, b) => { const x = a.match(/\d{1,3}\s*岁/gu), y = b.match(/\d{1,3}\s*岁/gu); return !x || !y || x.join() === y.join(); };
function nameMatchesAsset(displayName, name) {
    const a = normalize(displayName), s = stripCode(a), b = normalize(name);
    const boundaryMatch = [a, s].some(v => { if (nameKey(v) === nameKey(b))
        return true; return v.startsWith(b) && /^[-_\s·（(【.]/u.test(v.slice(b.length)); });
    return Boolean(b) && (boundaryMatch || ageCompatible(a, b) && Boolean(ageName(b)) && (ageName(a) === ageName(b) || ageName(a).startsWith(ageName(b) + " ")));
}
// Match either direction at a suffix boundary. Prefer more matching characters,
// then the shortest unmatched suffix; equal candidates require manual binding.
function closestNamedAssets(assets, name) {
    const b = normalize(name), boundary = /^[-_\s·・（(【.]/u, separator = /[-_\s·・（(【.、]/u;
    const score = (a) => {
        const n = normalize(a.referenceRule?.name || a.title), s = stripCode(n);
        const rules = (v) => nameKey(v) === nameKey(b) ? [b.length, 0, 0] : v.startsWith(b) && boundary.test(v.slice(b.length)) ? [b.length, v.length - b.length, 0] : b.startsWith(v) && boundary.test(b.slice(v.length)) ? [v.length, b.length - v.length, 0] : typeof a.metadata?.elementPerformer === "string" && normalize(a.metadata.elementPerformer) === b ? [b.length, Math.abs(v.length - b.length), 0] : null;
        const hit = rules(n) || (s !== n ? rules(s) : null);
        if (hit)
            return hit;
        const x = ageName(n), y = ageName(b);
        if (ageCompatible(n, b) && x && y) {
            if (x === y)
                return [y.length, 0, 0];
            if (x.startsWith(y + " "))
                return [y.length, x.length - y.length, 0];
            if (y.startsWith(x + " "))
                return [x.length, y.length - x.length, 0];
        }
        // Fallback: the name appears as a whole segment inside the asset name (场景_胡副局_日景).
        if (b.length >= 2) {
            const at = s.indexOf(b);
            if (at > 0 && separator.test(s[at - 1]) && (at + b.length === s.length || separator.test(s[at + b.length])))
                return [b.length, s.length - b.length, 1];
        }
        return null;
    };
    const ranked = assets.map(asset => ({ asset, rank: score(asset) })).filter(x => x.rank !== null);
    ranked.sort((a, b) => b.rank[0] - a.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]);
    const best = ranked[0]?.rank;
    return best ? ranked.filter(x => x.rank[0] === best[0] && x.rank[1] === best[1] && x.rank[2] === best[2]).map(x => x.asset) : [];
}

const isSceneAsset = (a) => a.kind === "image" && (a.category === "场景" || /^(?:场景\s*)?S\d{1,3}(?=$|[\s_\-－.])/i.test(normalize(a.title)));
const sceneKey = (value) => stripCode(value).replace(/[\s_\-－]+/gu, "").toLocaleLowerCase();
function catalogSceneReferences(line, assets) {
    const names = [...new Set(assets.filter(a => isSceneAsset(a) && !a.referenceRule?.disabled).flatMap(a => [a.title, a.referenceRule?.name || ""]).flatMap(n => [normalize(n), stripCode(n)]).filter(n => sceneKey(n).length >= 2))];
    const positions = [], ends = [];
    let compact = "";
    for (let at = 0; at < line.length;) {
        const ch = String.fromCodePoint(line.codePointAt(at)), value = ch.normalize("NFKC").toLocaleLowerCase();
        if (!/^[\s_\-－]+$/u.test(value))
            for (const part of value) {
                compact += part;
                positions.push(at);
                ends.push(at + ch.length);
            }
        at += ch.length;
    }
    const hits = [];
    for (const name of names) {
        const key = normalize(name).replace(/[\s_\-－]+/gu, "").toLocaleLowerCase();
        let at = compact.indexOf(key);
        while (at >= 0) {
            const start = positions[at], end = ends[at + key.length - 1];
            if (key.length >= 4 || (!line[start - 1] || /[\s，。；;：:、|｜【（(]/u.test(line[start - 1])) && (!line[end] || /[\s，。；;：:、|｜】）)]/u.test(line[end])))
                hits.push({ value: line.slice(start, end), start, end });
            at = compact.indexOf(key, at + 1);
        }
    }
    const picked = [];
    for (const hit of hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start))
        if (!picked.some(p => hit.start < p.end && hit.end > p.start))
            picked.push(hit);
    return picked.sort((a, b) => a.start - b.start);
}

// Explicit section declarations and known scene names. Never treat ordinary dialogue as assets.
function referencesInPrompt(prompt,names=[],sceneAssets=[]){
 const tokens=[];let section='',offset=0;
 const add=(name,kind,start,end)=>{if(clean(name)&&!tokens.some(t=>start<t.end&&end>t.start))tokens.push({name:clean(name),kind,start,end});};
 for(const line of prompt.split('\n')){
  const heading=/^\s*【([^】]+)】/.exec(line);if(section==='场景与连续状态'&&heading&&/^承接视频编号/.test(heading[1])){offset+=line.length+1;continue;}if(heading&&(section!=='场景与连续状态'||/^(?:场景与连续状态|出场人物|声音锁定|项目规格|全局视觉|全局规则|镜头[0-9一二三四五六七八九十]|视频编号|承接视频编号|光线|声音与台词|配音|音效|画幅|制作要求|[^】]*(?:OS|vo))/i.test(heading[1]))){section=heading[1];offset+=line.length+1;continue;}
  if(section==='场景与连续状态'){for(const m of line.matchAll(/【([^】]+)】/g)){const start=offset+m.index+1;add(m[1],'image',start,start+m[1].length);}for(const ref of catalogSceneReferences(line,sceneAssets))add(ref.value,'image',offset+ref.start,offset+ref.end);}
  if(section==='出场人物'){
   const aliases=[...line.matchAll(/资产\s*【([^】]+)】/g)];
   for(const m of aliases){const start=offset+m.index+m[0].indexOf(m[1]);add(m[1],'image',start,start+m[1].length);}
   if(!aliases.length&&!/不入镜|仅.*(?:声音|发声|画外音)|不生成完整形象/.test(line)){const m=/^\s*(@?[^:：|｜【】]{1,40})\s*[:：]/.exec(line);if(m){const start=offset+line.indexOf(m[1]);add(m[1].replace(/^@/,''),'image',start,start+m[1].length);}}
  }
  if(section==='声音锁定'){const m=/^\s*(@?[^:：|｜【】]{1,40})\s*[:：|｜]/.exec(line);if(m&&m[1].trim()!=='语速锁定'){const start=offset+line.indexOf(m[1]);add(m[1].replace(/^@/,'').replace(/\s*[（(](?:OS|vo).*$/i,''),'audio',start,start+m[1].length);}}
  for(const m of line.matchAll(/@/g)){
   const start=offset+m.index;if(tokens.some(t=>start>=t.start&&start<t.end))continue;
   const rest=line.slice(m.index+1),typed=/^(图片|视频|音频)\s*【([^】]+)】/.exec(rest);
   if(typed){add(typed[2],{图片:'image',视频:'video',音频:'audio'}[typed[1]],start,start+typed[0].length+1);continue;}
   const known=names.filter(n=>n&&rest.startsWith(n)&&(!rest[n.length]||/[\s@{}，。；;：:、|｜【】（）()]/.test(rest[n.length]))).sort((a,b)=>b.length-a.length)[0];
   const name=known||/^[^\s@{}，。；;：:、|｜【】（）()]+/.exec(rest)?.[0];
   if(name)add(name,/^图片\d+$/.test(name)?'image':/^视频\d+$/.test(name)?'video':/^音频\d+$/.test(name)?'audio':'any',start,start+name.length+1);
  }
  offset+=line.length+1;
 }
 return tokens.sort((a,b)=>a.start-b.start);
}
// A historical selection is local to this submission; library disabled/priority settings stay unchanged.
function isPreservedReference(reference,bindings={}){
 const id=reference.assetId,name=String(reference.name||'').normalize('NFKC').trim();
 return Boolean(id&&bindings['preserve:asset:'+id]&&!bindings['omit:asset:'+id]&&!bindings['omit:'+reference.kind+':'+name]&&(!bindings['replace:asset:'+id]||bindings['replace:asset:'+id]===id));
}
function assetsForSelectedReferences(assets,bindings,selections){
 const ids=new Set(selections.filter(r=>isPreservedReference(r,bindings)).map(r=>r.assetId));
 return assets.map(a=>ids.has(a.id)?{...a,referenceRule:{...a.referenceRule,disabled:false}}:a);
}
function planGroup(group,nodes,assets,bindings=[],selections=[]){
 assets=assetsForSelectedReferences(assets,group.bindings||{},selections);
 const historicalNodes=new Set(selections.filter(r=>isPreservedReference(r,group.bindings)).map(r=>r.nodeId));
 const names=[...nodes.map(n=>n.title),...assets.map(a=>a.referenceRule?.name||a.title),...bindings.map(b=>b.name)].filter(Boolean);
 const tokens=referencesInPrompt(group.prompt,names,assets),issues=[],references=[],mentions=[];
 const sceneNames=new Set(assets.filter(isSceneAsset).flatMap(a=>[a.title,a.referenceRule?.name||""].map(sceneKey)).filter(Boolean));
 const same=(a,b)=>referenceName(a)===referenceName(b)||Boolean(codeName(a)&&codeName(a)===codeName(b))||Boolean(sceneNames.has(sceneKey(a))&&sceneKey(a)===sceneKey(b));
 const equivalent=(a,b)=>same(a,b)||Boolean(ageName(a)&&ageCompatible(clean(a),clean(b))&&ageName(a)===ageName(b));
 const disabled=assets.filter(a=>a.referenceRule?.disabled&&!assets.some(other=>!other.referenceRule?.disabled&&other.kind===a.kind&&equivalent(other.title,a.title)));
 const excluded=nodes.filter(n=>!historicalNodes.has(n.nodeId)&&disabled.some(a=>n.type===a.kind&&(equivalent(n.title,a.title)||bindings.some(b=>b.kind===a.kind&&same(b.name,a.title)&&b.nodeId===n.nodeId)))).map(n=>n.nodeId);
 bindings=bindings.filter(b=>!excluded.includes(b.nodeId));
 nodes=nodes.filter(n=>!excluded.includes(n.nodeId));
 selections=selections.filter(r=>isPreservedReference(r,group.bindings)||!group.bindings?.['omit:asset:'+r.assetId]&&!assets.some(a=>a.kind===r.kind&&a.referenceRule?.disabled&&(r.assetId?a.id===r.assetId:same(a.title,r.name))));
 if(group.autoMatch===false){nodes=nodes.filter(n=>selections.some(r=>r.nodeId===n.nodeId&&r.kind===n.type));bindings=bindings.filter(b=>selections.some(r=>r.nodeId===b.nodeId&&r.kind===b.kind));}
 assets=assets.map(a=>{const id=group.bindings?.['replace:asset:'+a.id];if(!id)return a;const replacement=assets.find(x=>x.id===id&&x.kind===a.kind&&!x.referenceRule?.disabled&&!group.bindings?.['omit:asset:'+x.id]);return replacement?{...a,id:replacement.id}:{...a,referenceRule:{...a.referenceRule,disabled:true}};});
 const available=assets.filter(a=>!group.bindings?.["omit:asset:"+a.id]&&!a.referenceRule?.disabled&&(group.autoMatch!==false||selections.some(r=>r.kind===a.kind&&(r.assetId?r.assetId===a.id:same(r.name,a.title)))));
 const ruleMatch=(a,name)=>[a.title,a.referenceRule?.name].some(n=>n&&nameMatchesAsset(n,name));
 const issue=(token,reason,reasonCode,candidates=[])=>{const i={...token,reason,candidates};Object.defineProperty(i,'reasonCode',{value:reasonCode});if(!issues.some(i=>i.name===token.name&&i.kind===token.kind))issues.push(i);};
 for(const token of tokens){
   if(group.autoMatch===false&&!/^(图片|视频|音频)\d+$/.test(token.name)&&!selections.some(r=>(token.kind==='any'||token.kind===r.kind)&&(equivalent(r.name,token.name)||available.some(a=>(r.assetId?r.assetId===a.id:same(r.name,a.title))&&(ruleMatch(a,token.name)||a.id===group.bindings?.[token.kind+':'+token.name]||a.id===group.bindings?.['manual:'+token.kind+':'+token.name])))))continue;
   if(group.bindings?.['omit:'+token.kind+':'+token.name])continue;
  const manual=available.find(a=>a.id===group.bindings?.['manual:'+token.kind+':'+token.name]&&(token.kind==='any'||token.kind===a.kind));
  const explicit=manual||available.find(a=>a.id===group.bindings?.[token.kind+':'+token.name]&&(token.kind==='any'||token.kind===a.kind));
  const allowed=k=>token.kind==='any'?(explicit?k===explicit.kind:true):token.kind===k;
   // The current group's file selection owns its reference, ahead of canvas titles.
   const slotSelection=/^(图片|视频|音频)(\d+)$/.exec(token.name),slotType=slotSelection&&{图片:'image',视频:'video',音频:'audio'}[slotSelection[1]];
   const selectedOptions=selections.filter(r=>allowed(r.kind)).map(r=>{const asset=available.find(a=>a.kind===r.kind&&(r.assetId?a.id===r.assetId:same(a.title,r.name)));return {...asset,id:r.assetId||r.nodeId,title:asset?.title||referenceName(r.name),kind:r.kind,selection:r};});
   const selectedHits=slotSelection?selectedOptions.filter(a=>a.kind===slotType).slice(Number(slotSelection[2])-1,Number(slotSelection[2])):explicit?selectedOptions.filter(a=>a.id===explicit.id):closestNamedAssets(selectedOptions,token.name);
   const selectedNodes=[...new Map(selectedHits.map(a=>[a.selection.nodeId,a])).values()];
   if(selectedNodes.length){
    const multi=selectedNodes.length>1,priority=Number(selectedNodes[0].referenceRule?.priority);
    if(multi&&!selectedNodes.every(a=>a.kind===selectedNodes[0].kind&&isPreservedReference(a.selection,group.bindings))&&!(priority>0&&selectedNodes.every(a=>a.kind===selectedNodes[0].kind&&Number(a.referenceRule?.priority)===priority))){issue(token,'本组已选素材有多个不同版本，请明确引用','ambiguous');continue;}
    const picked=selectedNodes.map(a=>nodes.find(n=>n.nodeId===a.selection.nodeId&&n.type===a.kind));
    if(picked.some(n=>!n?.resources?.some(r=>r.type===n.type&&r.status==='success'))){issue(token,'本组所选素材节点尚未就绪','not_ready');continue;}
    for(const n of picked)if(!references.some(r=>r.nodeId===n.nodeId))references.push({nodeId:n.nodeId,kind:n.type,name:n.title});
    mentions.push({...token,nodeId:picked[0].nodeId,...(multi?{nodeIds:picked.map(n=>n.nodeId)}:{})});continue;
   }
  // Removing an old reference must not silently replace it with an automatic alternative.
  if(assets.some(a=>group.bindings?.['omit:asset:'+a.id]&&allowed(a.kind)&&equivalent(a.title,token.name))&&!available.some(a=>allowed(a.kind)&&equivalent(a.title,token.name)))continue;
  const preferred=manual?[]:available.filter(a=>allowed(a.kind)&&Number(a.referenceRule?.priority)>0&&ruleMatch(a,token.name));
  if(token.kind==='any'&&!explicit&&new Set(preferred.map(a=>a.kind)).size>1){issue(token,"同名优先素材有多种类型，请明确图片或音频","ambiguous");continue;}
  const highest=Math.max(0,...preferred.map(a=>Number(a.referenceRule?.priority)));
  const aliases=explicit?[]:available.filter(a=>allowed(a.kind)&&a.referenceRule?.name&&same(a.referenceRule.name,token.name));
  const priority=preferred.filter(a=>Number(a.referenceRule?.priority)===highest);
  if(priority.length||aliases.length){
   const chosen=priority.length?priority:aliases;
   if(!priority.length&&chosen.length>1){issue(token,"项目元素库存在同名歧义","ambiguous",chosen.map(a=>({assetId:a.id,name:a.title,kind:a.kind})));continue;}
   const picked=[];let failed=false;
   for(const a of chosen){
    const selected=selections.filter(r=>r.kind===a.kind&&(r.assetId?r.assetId===a.id:same(r.name,a.title)));
    const mapped=selected.length?selected:bindings.filter(b=>b.kind===a.kind&&same(b.name,a.title));
    const hits=mapped.length?nodes.filter(n=>mapped.some(b=>b.nodeId===n.nodeId&&n.type===a.kind)):nodes.filter(n=>n.type===a.kind&&same(n.title,a.title));
    const reason=hits.length>1?"优先素材在画布存在同名歧义，请指定节点":!hits.length?"优先素材已找到，画布尚未绑定；本次不上传":!hits[0].resources?.some(r=>r.type===a.kind&&r.status==="success")?"优先画布素材尚未就绪":"";
    if(reason){issue(token,reason,hits.length>1?"ambiguous":!hits.length?"local_unbound":"not_ready",[{assetId:a.id,name:a.title,kind:a.kind}]);failed=true;}else if(!picked.some(n=>n.nodeId===hits[0].nodeId))picked.push(hits[0]);
   }
   if(!failed){for(const n of picked)if(!references.some(r=>r.nodeId===n.nodeId))references.push({nodeId:n.nodeId,kind:n.type,name:n.title});if(picked.length)mentions.push({...token,nodeId:picked[0].nodeId,...(picked.length>1?{nodeIds:picked.map(n=>n.nodeId)}:{})});}continue;
  }
  const name=explicit?.title||token.name;
  const slot=/^(图片|视频|音频)(\d+)$/.exec(token.name),slotKind=slot&&{图片:'image',视频:'video',音频:'audio'}[slot[1]],chosen=slot?selections.filter(r=>r.kind===slotKind).slice(Number(slot[2])-1,Number(slot[2])):explicit?selections.filter(r=>allowed(r.kind)&&(r.assetId?r.assetId===explicit.id:same(r.name,explicit.title))):[];
  const mapped=chosen.length?chosen.map(r=>({kind:r.kind,nodeId:r.nodeId})):bindings.filter(b=>allowed(b.kind)&&same(b.name,name));
  let hits=mapped.length?nodes.filter(n=>mapped.some(b=>b.nodeId===n.nodeId&&b.kind===n.type)):nodes.filter(n=>allowed(n.type)&&same(n.title,name));
  if(!mapped.length&&!hits.length)hits=closestNamedAssets(nodes.filter(n=>allowed(n.type)),name);
  let reason='',reasonCode='',local=[];
  if(mapped.length&&!hits.length){reason='已绑定的画布节点失效，请重新绑定';reasonCode='binding_unavailable';}
  if(!hits.length&&!reason){
   const selected=selections.filter(r=>allowed(r.kind)&&same(r.name,name));
   if(selected.length)hits=nodes.filter(n=>selected.some(r=>r.nodeId===n.nodeId&&r.kind===n.type));
  }
  if(!hits.length&&!reason){
   local=explicit?[explicit]:available.filter(a=>allowed(a.kind)&&same(a.title,name));
   if(!local.length)local=closestNamedAssets(available.filter(a=>allowed(a.kind)),name);
   const pickedLocal=local.filter(a=>selections.some(r=>r.kind===a.kind&&(r.assetId?r.assetId===a.id:same(r.name,a.title))));
    if(pickedLocal.length)local=pickedLocal;
    if(local.length){const selected=selections.filter(r=>local.some(a=>a.kind===r.kind&&(r.assetId?r.assetId===a.id:same(r.name,a.title)))),mappedLocal=selected.length?selected:local.length===1?bindings.filter(b=>b.kind===local[0].kind&&same(b.name,local[0].title)):[];hits=nodes.filter(n=>mappedLocal.some(b=>n.nodeId===b.nodeId&&n.type===b.kind));}
   if(!hits.length){reasonCode=local.length>1?'ambiguous':local.length===1?'local_unbound':'not_found';reason=local.length>1?'项目元素库存在同名歧义':local.length===1?'项目元素库已找到，画布尚未绑定；本次不上传':'画布和项目元素库均未找到';}
  }
  if(hits.length===1){
   const n=hits[0];if(!n.resources?.some(r=>r.type===n.type&&r.status==='success')){reason='画布素材尚未就绪';reasonCode='not_ready';}
   else{if(!references.some(r=>r.nodeId===n.nodeId))references.push({nodeId:n.nodeId,kind:n.type,name:n.title});mentions.push({...token,nodeId:n.nodeId});continue;}
  }else if(hits.length>1){reason='画布存在同名歧义，请在画布管理指定节点';reasonCode='ambiguous';}
  if(!issues.some(i=>i.name===token.name&&i.kind===token.kind)){const issue={...token,reason,candidates:(hits.length?hits.map(n=>({name:n.title,nodeId:n.nodeId,kind:n.type})):local.map(a=>({name:a.title,assetId:a.id,kind:a.kind})))};
   // Diagnostic policy must not change the stable identity of previously saved drafts.
   Object.defineProperty(issue,'reasonCode',{value:reasonCode});issues.push(issue);}
 }
 let prompt=group.prompt;
 for(const m of [...mentions].reverse()){const inline=(m.nodeIds||[m.nodeId]).map(id=>'{{node:'+id+'}}').join(''),existing=/^(?:\{\{node:[^}]+\}\})+/.exec(prompt.slice(m.end));if(existing){if(existing[0]!==inline)issues.push({...m,reason:'正文已有不同资产引用，请重新绑定'});continue;}prompt=prompt.slice(0,m.end)+inline+prompt.slice(m.end);}
 const durationMatch=/总时长\s*[:：]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i.exec(group.prompt),seconds=durationMatch?Number(durationMatch[1]):null;
 return {groupId:group.id,number:group.number,title:group.title,originalPrompt:group.prompt,prompt,references,mentions,issues,duration:seconds===null?null:Math.ceil(seconds-.5)};
}

// Verify the semantic inline parts, not merely the echoed prompt or attachment list.
function verifyPromptReferences(generation,prompt){
 if(!/\{\{node:[^}]+\}\}/.test(prompt))return true;
 if(!Array.isArray(generation?.promptParts))return false;
 let rebuilt='';for(const part of generation.promptParts){if(part.kind==='text'&&typeof part.text==='string'){if(/\{\{node:[^}]+\}\}/.test(part.text))return false;rebuilt+=part.text;}else if(part.kind==='reference'&&Number.isInteger(part.referenceIndex)){const ref=generation.references?.[part.referenceIndex];if(ref?.kind!=='node'||typeof ref.id!=='string')return false;rebuilt+='{{node:'+ref.id+'}}';}else return false;}
 return rebuilt===prompt;
}
function videoNodeTitle(prompt,number){
 const id=/^[ \t]*【?[ \t]*视频编号[ \t]*[:：]?[ \t]*([Vv]?\d+(?:-\d+)*)(?=[^\d-]|$)/m.exec(String(prompt||''))?.[1]||(/^[Vv]?\d+(?:-\d+)*$/.test(String(number||''))?String(number):'');
 return id?'视频编号'+id.toUpperCase():'视频草稿';
}
class DreaminaCanvasDrafts{
 constructor(service){this.service=service;this.pending=new Map();}
 directory(token){if(!/^[a-f0-9]{64}$/.test(token))throw Error('无效的草稿准备记录');return path.join(this.service.dataDir,'_draft-plans',token);}
 async show(projectId,ids){const nodes=[];for(let i=0;i<ids.length;i+=10){const r=await this.service.command(['node','show','--project-id',projectId,...ids.slice(i,i+10).flatMap(id=>['--node-id',id])]);for(const entry of r.nodes||[])if(entry.result==='FOUND')nodes.push(entry.node);}return nodes;}
 async preview({projectKey,groups,assets=[],model,ratio,resolution}){
  if(!Array.isArray(groups)||!groups.length||groups.length>100||groups.some(g=>typeof g.id!=='string'||!g.id||typeof g.prompt!=='string'||!g.prompt.trim())||new Set(groups.map(g=>g.id)).size!==groups.length)throw Error('请选择 1—100 个独立视频组');
  if(!Array.isArray(assets)||assets.length>3000)throw Error('项目素材列表无效');
  const account=await this.service.account(),target=await this.service.targets.settings(projectKey);
  if(!target?.locked||target.account!==account)throw Error('请先在画布管理锁定当前项目的画布');
  const found=await this.service.targets.nodes(target.projectId),nodes=await this.show(target.projectId,found.map(n=>n.nodeId));
  if(nodes.length!==found.length)throw Error('画布素材正在变化，请重新核对');
  const catalog=await this.service.models(),spec=catalog.specs[model];if(!spec)throw Error('当前模型不可用，请刷新即梦模型');
  const plans=groups.map(g=>planGroup(g,nodes,assets.filter(a=>kinds.includes(a.kind)),target.bindings));
  for(const p of plans){
   const mode=p.references.length?'m2v':'t2v',m=spec.modes.find(m=>m.name===mode),flag=k=>m?.flags.find(f=>f.flag==='--'+k),d=flag('duration');
   p.model=model;p.ratio=ratio;p.resolution=resolution;p.mode=mode;
   if(!m||!flag('ratio')?.values.includes(ratio)||!flag('resolution')?.values.includes(resolution)||!d||p.duration===null||p.duration<d.min||p.duration>d.max||(p.duration-d.min)%(d.step||1)!==0||p.prompt.length>(flag('prompt')?.maxLength??0))p.error='模型参数、完整提示词长度或识别时长不符合官方规格，请调整后重新核对';
   const limits=m?.references;if(p.references.length>(limits?.max??0)||kinds.some(k=>p.references.filter(r=>r.kind===k).length>(limits?.types?.find(t=>t.mediaType===k)?.max??0)))p.error='引用数量超过当前模型限制';
  }
  const token=hash({account,projectKey,projectId:target.projectId,plans}),dir=this.directory(token);
  return this.service.targets.serial(dir,async()=>{
   let record=await this.service.read(dir);if(!record){
    const layouts=nodes.map(n=>n.layout).filter(l=>Number.isFinite(l?.x)&&Number.isFinite(l?.y));
    const x=layouts.length?Math.round(Math.max(...layouts.map(l=>l.x+(l.width||500)))+600):0,y=layouts.length?Math.round(Math.min(...layouts.map(l=>l.y))):0;
    const prepared=[];
    for(const [i,p] of plans.entries()){
     const itemDir=path.join(this.service.dataDir,'_draft-items',hash({account,projectKey,projectId:target.projectId,plan:p}));
     const item=await this.service.targets.serial(itemDir,async()=>{let prior=await this.service.read(itemDir);if(!prior){prior={nodeId:require('./dreamina-canvas-service').nodeId(),updateId:randomUUID(),x,y:y+i*600};await this.service.save(itemDir,prior);}return prior;});
     prepared.push({...p,...item,status:'planned'});
    }
    record={token,account,projectKey,projectId:target.projectId,webUrl:target.webUrl,name:target.name,plans:prepared};await this.service.save(dir,record);
   }else{
    // Backfill identities for plans saved before the per-group ledger existed.
    for(const p of plans){const prior=record.plans.find(r=>r.groupId===p.groupId);if(!prior)throw Error("草稿记录不完整");const itemDir=path.join(this.service.dataDir,"_draft-items",hash({account,projectKey,projectId:target.projectId,plan:p}));await this.service.targets.serial(itemDir,async()=>{const item=await this.service.read(itemDir);if(item&&item.nodeId!==prior.nodeId)throw Error("该组已有不同草稿记录，请先核对原节点");if(!item)await this.service.save(itemDir,{nodeId:prior.nodeId,updateId:prior.updateId,x:prior.x,y:prior.y});});}
   }return record;
  });
 }
 async create({token,groupIds,allowIncomplete=false}){
  const dir=this.directory(token);return this.service.targets.serial(dir,async()=>{
   const record=await this.service.read(dir);if(!record)throw Error('草稿核对记录不存在，请重新核对');
   if(record.account!==await this.service.account())throw Error('草稿属于另一即梦账号');
   const target=await this.service.targets.settings(record.projectKey);if(target?.projectId!==record.projectId||!target.locked)throw Error('项目画布已切换，请重新核对');
   if(!Array.isArray(groupIds)||!groupIds.length||new Set(groupIds).size!==groupIds.length||groupIds.some(id=>!record.plans.some(p=>p.groupId===id)))throw Error('请选择核对过的视频组');
   const chosen=record.plans.filter(p=>groupIds.includes(p.groupId));
   if(chosen.some(p=>p.error))throw Error('部分组的模型参数需要调整');
   if(!allowIncomplete&&chosen.some(p=>p.issues.length))throw Error('存在缺失或歧义素材，请先补齐，或明确保留未匹配文字创建草稿');
   for(const p of chosen){
    let node=(await this.show(record.projectId,[p.nodeId]))[0];
    if(!node){
     if(p.status==='saved')throw Error('原草稿已被删除；请在官网核对，不重复创建');
     for(const r of p.references)await this.service.targets.node(record.projectId,r.nodeId,r.kind);
     // No quote, confirm, run, upload or paid-generation path exists in this method.
     p.status='saving';await this.service.save(dir,record);
     // Use the verified two-save route: place an empty node, then save its generation configuration.
     const args=['node','create','video','--project-id',record.projectId,'--node-id',p.nodeId,'--update-id',p.updateId,'--title',videoNodeTitle(p.originalPrompt||p.prompt,p.number),'--import-kind','external_generated','--x',String(Math.round(p.x)),'--y',String(Math.round(p.y))];
     try{const saved=await this.service.command(args);if(saved.node?.nodeId!==p.nodeId)throw Error('官网返回的草稿身份不一致');}catch(error){p.errorMessage=error.message;await this.service.save(dir,record);throw error;}
     node=(await this.show(record.projectId,[p.nodeId]))[0];
    }
    if(!node)throw Error('官网尚未查到原草稿，请稍后核对原节点');
    if(node.generation?.prompt!==p.prompt){
     if(p.status==='saved'||node.generation?.prompt||node.resources?.length)throw Error('原草稿已在官网修改，请手动核对，已阻止覆盖');
     for(const r of p.references)await this.service.targets.node(record.projectId,r.nodeId,r.kind);
     p.generationUpdateId||=randomUUID();p.status='preparing';await this.service.save(dir,record);
     await this.service.command(['node','edit','video','--project-id',record.projectId,'--node-id',p.nodeId,'--update-id',p.generationUpdateId,'--title',videoNodeTitle(p.originalPrompt||p.prompt,p.number),'--mode',p.mode,'--model',p.model,'--prompt',p.prompt,'--ratio',p.ratio,'--resolution',p.resolution,'--duration',String(p.duration),'--count','1',...p.references.flatMap(r=>['--ref','node:'+r.nodeId])]);
     node=(await this.show(record.projectId,[p.nodeId]))[0];
    }
    const refs=node?.generation?.references||[],expected=p.references.map(r=>r.nodeId);
    if(node?.generation?.prompt!==p.prompt||!verifyPromptReferences(node?.generation,p.prompt)||node?.generation?.model!==p.model||node?.generation?.mode!==p.mode||node?.generation?.ratio!==p.ratio||node?.generation?.resolution?.toLowerCase()!==p.resolution.toLowerCase()||node?.generation?.durationSeconds!==p.duration||node?.generation?.outputCount!==1||refs.length!==expected.length||refs.some(r=>r.kind!=='node'||!expected.includes(r.id))||expected.some(id=>!node?.upstreamNodeIds?.includes(id))||!Number.isFinite(node?.layout?.x)||!Number.isFinite(node?.layout?.y)||Math.abs(node.layout.x-Math.round(p.x))>.01||Math.abs(node.layout.y-Math.round(p.y))>.01)throw Error('草稿正文、参数、引用或排列未通过回读验证，保留原节点，请勿重复创建');
    p.status='saved';delete p.errorMessage;await this.service.save(dir,record);
   }return record;
  });
 }
}
module.exports={isPreservedReference,assetsForSelectedReferences,DreaminaCanvasDrafts,referencesInPrompt,planGroup,kindNames,verifyPromptReferences,videoNodeTitle};
