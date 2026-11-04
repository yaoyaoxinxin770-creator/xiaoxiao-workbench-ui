import type { Asset } from "@/stores/use-asset-store";
import { REVIEW_OPTIONS, type ReviewState, type ElementReferenceRule } from "./studio-model";

export const ELEMENT_CATEGORIES = ["全部", "人物", "场景", "道具", "音频"];
export function elementInfo(asset: Asset) {
    const metadata = asset.metadata || {};
    return {
        author: typeof metadata.elementAuthor === "string" ? metadata.elementAuthor : "我",
        performer: typeof metadata.elementPerformer === "string" ? metadata.elementPerformer : asset.category === "人物" ? asset.title : "",
        description: typeof metadata.elementDescription === "string" ? metadata.elementDescription : "",
        status: (REVIEW_OPTIONS.some(option => option.value === metadata.elementStatus) ? metadata.elementStatus : "none") as ReviewState,
        lastUsedAt: typeof metadata.elementLastUsedAt === "number" ? metadata.elementLastUsedAt : 0,
    };
}
export function filterElements(assets: Asset[], filters: { search: string; category: string; kind: string; author: string; performer: string; status: string; sort: string; rules?: Record<string,{disabled?:boolean;priority?:number}> }) {
    const search = filters.search.trim().toLocaleLowerCase();
    return assets.filter(asset => {
        const info = elementInfo(asset);
        return (filters.category === "全部" || (filters.category === "音频" ? asset.kind === "audio" : asset.kind !== "audio" && elementCategory(asset) === filters.category))
            && (filters.kind === "all" || asset.kind === filters.kind)
            && (filters.author === "all" || info.author === filters.author)
            && (filters.performer === "all" || info.performer === filters.performer)
            && (filters.status === "all" || info.status === filters.status)
            && (!search || `${asset.title} ${Array.isArray(asset.metadata?.elementAliases)?asset.metadata.elementAliases.join(" "):""} ${asset.category || ""} ${asset.tags.join(" ")} ${info.description}`.toLocaleLowerCase().includes(search));
    }).sort((a, b) => compareElementPriority(a,b,filters.rules) || (elementCategory(a) === "人物" && elementCategory(b) === "人物" && !filters.rules?.[a.id]?.disabled && !filters.rules?.[b.id]?.disabled ? elementPinnedAt(b) - elementPinnedAt(a) : 0) || (filters.sort === "serial" ? compareElementOrder(a,b,filters.rules) : filters.sort === "name" ? a.title.localeCompare(b.title,"zh-CN",{numeric:true}) : filters.sort === "used" ? elementInfo(b).lastUsedAt - elementInfo(a).lastUsedAt : filters.sort === "oldest" ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt)));
}

export function groupedElements(assets: Asset[], group: string, catalogAssets:Asset[]=assets) {
    if(group==="none")return [];
    if(group!=="date")return groupElements(assets,catalogAssets);
    const dates=new Map<string,Asset[]>();
    for(const asset of assets){const day=asset.createdAt.slice(0,10)||"未知日期";if(!dates.has(day))dates.set(day,[]);dates.get(day)!.push(asset);}
    return [...dates].sort(([a],[b])=>b.localeCompare(a)).map(([name,items])=>({key:name,name,category:"",items}));
}
// Codes describe a family; stages/versions after the code do not create new people.
const assetCode=(title:string)=>/^(?:(?:角色|场景)\s+)?([CS]\d{1,3})(?=$|[\s_\-－.])/i.exec(title.normalize("NFKC").trim());
export function elementCategory(asset:Asset){
 if(asset.kind==="audio")return "音频";if(asset.kind==="video")return "视频";
 if(typeof asset.metadata?.elementManualCategory==="string")return asset.metadata.elementManualCategory;
 if(asset.kind==="image"&&asset.metadata?.elementRoleGroup&&asset.metadata?.elementPerformer)return "人物";
 const code=asset.kind==="image"?assetCode(asset.title)?.[1].toUpperCase():undefined;
 return code?.startsWith("C")?"人物":code?.startsWith("S")?"场景":asset.category||"未分类";
}
export function groupElements(assets: Asset[],catalogAssets:Asset[]=assets) {
 const stem=(title:string)=>title.normalize("NFKC").trim().replace(/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]+|\d{1,3}[\s\-_.·、]+)/u,"").split(/[-－\s·_（(]/)[0].replace(/\d+$/,"").replace(/Q版(?:.*)?$/i,"");
 const manual=(asset:Asset)=>{const name=asset.metadata?.elementPerformer;return typeof name==="string"&&name.trim()&&name.trim()!==asset.title.trim()?stem(name):"";};
 const families=new Map<string,Asset[]>();
 for(const asset of catalogAssets){if(asset.metadata?.elementRoleGroup||typeof asset.metadata?.elementManualGroup==="string"||typeof asset.metadata?.elementManualCategory==="string")continue;const code=asset.kind==="image"?assetCode(asset.title)?.[1].toUpperCase():undefined;if(code){if(!families.has(code))families.set(code,[]);families.get(code)!.push(asset);}}
 const names=new Map<string,string>();
 for(const [code,items] of families){
  const explicit=[...new Set(items.map(manual).filter(Boolean))];
  const baseline=[...new Set(items.flatMap(asset=>{const match=assetCode(asset.title)!,after=asset.title.normalize("NFKC").trim().slice(match[0].length);return /^[ \t]+[^\s_\-－.]/u.test(after)?[after.trim().split(/[\s（(]/)[0]]:[];}))];
  const choices=explicit.length?explicit:[...new Set(baseline.map(name=>code.startsWith("C")?stem(name):name))];if(choices.length===1)names.set(code,choices[0]);
 }
 const dictionary=[...new Set([...catalogAssets.filter(a=>elementCategory(a)==="人物"&&!assetCode(a.title)).map(a=>manual(a)||stem(a.title)),...Array.from(names.entries()).filter(([code])=>code.startsWith("C")).map(([,name])=>name)])].filter(Boolean).sort((a,b)=>b.length-a.length);
 const trustedNames=new Set(Array.from(names.entries()).filter(([code])=>code.startsWith("C")).map(([,name])=>name));
 const knownName=(title:string)=>{const matches=(name:string)=>{const at=title.indexOf(name);return at>=0&&(at===0||/[\s_\-－.·（(]/u.test(title[at-1]))&&(at+name.length===title.length||/[\s_\-－.·（(\dQ]/iu.test(title[at+name.length]));};const trusted=dictionary.filter(n=>trustedNames.has(n)&&matches(n));return trusted.length===1?trusted[0]:trusted.length>1?undefined:dictionary.find(matches);};
 for(const [code,items] of families)if(!names.has(code)&&code.startsWith("C")){const found=[...new Set(items.map(a=>knownName(a.title)).filter(Boolean))];if(found.length===1)names.set(code,found[0]!);}
 const sceneCounts=new Map<string,number>();
 for(const asset of catalogAssets)if(elementCategory(asset)==="场景"){const base=asset.title.trim().replace(/(?:室内|室外|阳台)$/,"");sceneCounts.set(base,(sceneCounts.get(base)||0)+1);}
 const familyNames=new Map<string,string[]>();for(const [code,name] of names){const key=(code.startsWith("C")?"人物":"场景")+":"+name;familyNames.set(key,[...(familyNames.get(key)||[]),code]);}
 const grouped=new Map<string,{key:string;name:string;category:string;items:Asset[]}>();
 for(const asset of assets){
  const override=asset.metadata?.elementManualGroup;
   if(typeof override==="string"){const category=elementCategory(asset),name=override.trim()||asset.title,aliases=familyNames.get(category+":"+name),key=JSON.stringify([category,aliases?.length===1?aliases[0]:name]);if(!grouped.has(key))grouped.set(key,{key,name,category,items:[]});grouped.get(key)!.items.push(asset);continue;}
   const assigned=asset.kind==="image"&&typeof asset.metadata?.elementRoleGroup==="string"?asset.metadata.elementRoleGroup:"",performer=typeof asset.metadata?.elementPerformer==="string"?asset.metadata.elementPerformer.trim():"";
  if(assigned&&performer&&elementCategory(asset)==="人物"){if(!grouped.has(assigned))grouped.set(assigned,{key:assigned,name:performer,category:"人物",items:[]});grouped.get(assigned)!.items.push(asset);continue;}
  const category=elementCategory(asset),title=asset.title.trim(),code=asset.kind==="image"?assetCode(title)?.[1].toUpperCase():undefined;
  let name=code?names.get(code)||code:manual(asset)||title;
  if(!code&&(category==="人物"||category==="音频"))name=manual(asset)||knownName(title)||stem(title);
  if(!code&&category==="场景"){const base=title.replace(/(?:室内|室外|阳台)$/,"");if(base!==title&&(sceneCounts.get(base)||0)>1)name=base;}
  const aliases=familyNames.get(category+":"+name),identity=code||(aliases?.length===1?aliases[0]:name);
  const key=JSON.stringify([category,identity]);if(!grouped.has(key))grouped.set(key,{key,name,category,items:[]});grouped.get(key)!.items.push(asset);
 }
 const order=[...ELEMENT_CATEGORIES.slice(1),"视频","未分类"];
 const groupPinnedAt=(group:{category:string;items:Asset[]})=>group.category==="人物"?Math.max(0,...group.items.map(elementPinnedAt)):0;
 return [...grouped.values()].sort((a,b)=>(order.indexOf(a.category)<0?order.length:order.indexOf(a.category))-(order.indexOf(b.category)<0?order.length:order.indexOf(b.category))||groupPinnedAt(b)-groupPinnedAt(a)||a.name.localeCompare(b.name,"zh-CN",{numeric:true}));
}

export type UncategorizedSuggestion = {
    assetId: string;
    title: string;
    suggestedCategory: "人物" | "场景" | "道具" | "音频";
    suggestedPerformer?: string;
    duplicateOfId?: string;
    reason: "exact-duplicate" | "character-prefix" | "scene-prefix";
};

export function detectUncategorizedSuggestions(
    catalogAssets: Asset[],
    rules?: Record<string, { disabled?: boolean; priority?: number }>,
): UncategorizedSuggestion[] {
    const active = catalogAssets.filter(a => !rules?.[a.id]?.disabled);
    const norm = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const categorized = active.filter(a => {
        const cat = elementCategory(a);
        return cat === "人物" || cat === "场景" || cat === "道具" || cat === "音频";
    });
    const groups = groupElements(categorized, categorized);
    const exactByTitle = new Map<string, { asset: Asset; category: "人物" | "场景" | "道具" | "音频"; performer?: string }>();
    for (const g of groups) {
        if (g.category !== "人物" && g.category !== "场景" && g.category !== "道具" && g.category !== "音频") continue;
        const sorted = [...g.items].sort((a, b) => (Number(rules?.[b.id]?.priority) || 0) - (Number(rules?.[a.id]?.priority) || 0));
        for (const item of sorted) {
            const key = norm(item.title);
            if (!exactByTitle.has(key)) {
                exactByTitle.set(key, {
                    asset: item,
                    category: g.category,
                    performer: g.category === "人物" ? g.name : undefined,
                });
            }
        }
    }

    const characterNames = [...new Set(groups.filter(g => g.category === "人物" && g.name.trim().length >= 2).map(g => g.name.trim()))]
        .sort((a, b) => b.length - a.length);
    const sceneNames = [...new Set(groups.filter(g => g.category === "场景" && g.name.trim().length >= 2).map(g => g.name.trim()))]
        .sort((a, b) => b.length - a.length);

    const uncategorized = active
        .filter(a => elementCategory(a) === "未分类" && a.kind === "image" && typeof a.metadata?.elementManualCategory!=="string")
        .sort((a, b) => (Number(rules?.[b.id]?.priority) || 0) - (Number(rules?.[a.id]?.priority) || 0));

    const seenUncatTitles = new Map<string, Asset>();
    const results: UncategorizedSuggestion[] = [];

    for (const asset of uncategorized) {
        const rawTitle = asset.title.normalize("NFKC").trim();
        const key = norm(rawTitle);
        const exact = exactByTitle.get(key);
        if (exact) {
            results.push({
                assetId: asset.id,
                title: asset.title,
                suggestedCategory: exact.category,
                suggestedPerformer: exact.performer,
                duplicateOfId: sameElementSource(asset, exact.asset) ? exact.asset.id : undefined,
                reason: "exact-duplicate",
            });
            continue;
        }

        const charHit = characterNames.find(name => {
            if (!rawTitle.startsWith(name)) return false;
            const rest = rawTitle.slice(name.length);
            return !rest || /^[\s_\-－.·（(\dQ家房室厅]/iu.test(rest);
        });

        if (charHit) {
            const rest = rawTitle.slice(charHit.length);
            const isHomeScene = /^(?:家|房|客厅|卧室|厨房|书房|公寓|出租屋)/u.test(rest.trim());
            const prevSameUncat = seenUncatTitles.get(key);
            if (!prevSameUncat) seenUncatTitles.set(key, asset);
            results.push({
                assetId: asset.id,
                title: asset.title,
                suggestedCategory: isHomeScene ? "场景" : "人物",
                suggestedPerformer: isHomeScene ? undefined : charHit,
                duplicateOfId: prevSameUncat && sameElementSource(asset, prevSameUncat) ? prevSameUncat.id : undefined,
                reason: isHomeScene ? "scene-prefix" : "character-prefix",
            });
            continue;
        }

        const sceneHit = sceneNames.find(name => rawTitle.startsWith(name) && rawTitle.length > name.length);
        if (sceneHit) {
            const prevSameUncat = seenUncatTitles.get(key);
            if (!prevSameUncat) seenUncatTitles.set(key, asset);
            results.push({
                assetId: asset.id,
                title: asset.title,
                suggestedCategory: "场景",
                duplicateOfId: prevSameUncat && sameElementSource(asset, prevSameUncat) ? prevSameUncat.id : undefined,
                reason: "scene-prefix",
            });
        }
    }
    return results;
}

type ElementSource = { kind: Asset["kind"]; localFile?: Asset["localFile"]; data: { storageKey?: string; dataUrl?: string; url?: string; content?: string } };
type ElementRules = Record<string, { disabled?: boolean; priority?: number }>;
const elementTitle = (title: string) => title.normalize("NFKC").trim().replace(/\.(?:png|jpe?g|webp|gif|mp4|webm|wav|mp3|aac|m4a)$/i, "").replace(/\s+/g, " ").toLowerCase();
const sourceUrl = (asset: ElementSource) => asset.data?.dataUrl || asset.data?.url || "";
const sourceLocalId = (asset: ElementSource) => asset.localFile?.id || /\/workbench\/local-media\/([a-f0-9]{48})(?:[?#]|$)/.exec(sourceUrl(asset))?.[1];

// Names describe variants; only a shared source establishes that two records are copies.
export function sameElementSource(a: ElementSource, b: ElementSource): boolean {
    if (a.kind !== b.kind || a.kind === "text") return false;
    const localA = sourceLocalId(a), localB = sourceLocalId(b);
    if (localA && localB) return localA === localB;
    if (a.data?.storageKey && b.data?.storageKey) return a.data?.storageKey === b.data?.storageKey;
    const url = sourceUrl(a);
    return Boolean(url && url === sourceUrl(b));
}

export function dedupeProjectAssets(assets: Asset[], rules?: ElementRules): { kept: Asset[]; redundantIds: Set<string> } {
    const groups = new Map<string, Asset[]>(), redundantIds = new Set<string>();
    const score = (a: Asset) => {
        const enabled = !rules?.[a.id]?.disabled, available = a.metadata?.localFileMissing !== true;
        return [Number(enabled && available), Number(available), Number(enabled), Number(Boolean(a.localFile)), Number(rules?.[a.id]?.priority) || 0];
    };
    for (const asset of assets) {
        const key = asset.kind + ":" + elementTitle(asset.title) + ":" + (asset.metadata?.elementRoleGroup || "")+":"+String(asset.metadata?.elementManualCategory||"")+":"+String(asset.metadata?.elementManualGroup??""), group = groups.get(key) || [];
        const index = group.findIndex(item => sameElementSource(item, asset));
        if (index < 0) group.push(asset);
        else {
            const existing = group[index], before = score(existing), after = score(asset);
            const difference = after.map((n, i) => n - before[i]).find(n => n !== 0) || 0;
            const winner = difference > 0 ? asset : existing;
            redundantIds.add(winner === asset ? existing.id : asset.id);
            group[index] = winner;
        }
        groups.set(key, group);
    }
    return { kept: assets.filter(asset => !redundantIds.has(asset.id)), redundantIds };
}

// The legacy disabled thumbnails are hidden only in previews. Their records and bindings stay intact.
export function elementPreviewVariants(assets: Asset[], rules?: ElementRules, inspectedId?: string): Asset[] {
    const { kept } = dedupeProjectAssets(assets, rules);
    return kept.filter(asset => asset.id === inspectedId || asset.localFile || !rules?.[asset.id]?.disabled ||
        kept.filter(item => item.kind === asset.kind && elementTitle(item.title) === elementTitle(asset.title) && item.localFile && item.metadata?.localFileMissing !== true && !rules?.[item.id]?.disabled).length !== 1);
}

export function reusableProjectElement(assets: Asset[], incoming: ElementSource & { title: string }, projectIds: string[], rules?: ElementRules): Asset | undefined {
    const candidates = assets.filter(asset => sameElementSource(asset, incoming) && elementTitle(asset.title) === elementTitle(incoming.title));
    const local = candidates.filter(asset => projectIds.includes(asset.id));
    const pool = local.length ? local : candidates.filter(asset => asset.localFile && asset.metadata?.localFileMissing !== true);
    return dedupeProjectAssets(pool, rules).kept[0];
}

export function elementPinnedAt(asset:Pick<Asset,"metadata">):number{
 return Number(asset.metadata?.elementRolePinnedAt||asset.metadata?.elementPinnedAt||0)||0;
}
export function compareElementSerial(a:Pick<Asset,"title">,b:Pick<Asset,"title">){
 const key=(title:string)=>{const text=title.normalize("NFKC").trim().replace(/\.(?:png|jpe?g|webp|gif)$/i,"");const prefix=/^(?:[A-Za-z]{1,3})?(\d+)(?=$|[\s_.·、-])/.exec(text),suffix=/(?:[-_\s]?[（(]?)(\d+)[）)]?$/.exec(text);return prefix?[0,Number(prefix[1])]:suffix?[1,Number(suffix[1])]:[2,0];};
 const x=key(a.title),y=key(b.title);return x[0]-y[0]||x[1]-y[1]||a.title.localeCompare(b.title,"zh-CN",{numeric:true});
}
export function compareElementOrder(a:Asset,b:Asset,rules:Record<string,{disabled?:boolean;disabledAt?:number;priority?:number}>={}){
 return compareElementPriority(a,b,rules)||(elementCategory(a)==="人物"&&elementCategory(b)==="人物"?elementPinnedAt(b)-elementPinnedAt(a):0)||(Number(rules[b.id]?.priority)||0)-(Number(rules[a.id]?.priority)||0)||(rules[a.id]?.disabled&&rules[b.id]?.disabled?(Number(rules[b.id]?.disabledAt)||0)-(Number(rules[a.id]?.disabledAt)||0):0)||compareElementSerial(a,b);
}

export function elementPriorityPatch(current:ElementReferenceRule,priority:number,rules:Record<string,ElementReferenceRule>):ElementReferenceRule {
 if(priority>0&&!current.priority){const order=Math.max(Date.now(),...Object.values(rules).map(r=>Number(r.priorityHistoryOrder||r.priorityOrder||0)+1));return {priority,priorityOrder:order,priorityHistoryOrder:order};}
 return {priority,...(current.priority?{priorityHistoryOrder:current.priorityOrder||Date.now()}:{})};
}
export function compareElementPriority(a:Pick<Asset,"id">,b:Pick<Asset,"id">,rules:Record<string,ElementReferenceRule>={}){
 const x=rules[a.id]||{},y=rules[b.id]||{},rank=(r:ElementReferenceRule)=>r.priority?0:r.priorityHistoryOrder?1:2;
 return Number(Boolean(x.disabled))-Number(Boolean(y.disabled))||rank(x)-rank(y)||(rank(x)===0?(x.priorityOrder||0)-(y.priorityOrder||0):rank(x)===1?(x.priorityHistoryOrder||0)-(y.priorityHistoryOrder||0):0);
}
