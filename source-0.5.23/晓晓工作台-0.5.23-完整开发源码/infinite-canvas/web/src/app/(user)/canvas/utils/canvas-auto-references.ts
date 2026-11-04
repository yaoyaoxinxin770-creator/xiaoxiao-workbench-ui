type NamedReference = {id:string;title:string;kind:string};

/** Match explicit media names, never infer visual or audio content from a filename. */
export function autoReferenceMedia(text:string,assets:NamedReference[],explicitIds:string[]=[]) {
    const explicit=new Set(explicitIds), groups=new Map<string,NamedReference[]>();
    for(const asset of assets) {
        const name=asset.title.trim().replace(/\.(png|jpe?g|webp|gif|bmp|svg|mp4|mov|webm|mp3|wav)$/i,"");
        if(name.length<2 || /^(图片|视频|音频|参考图|全景图|image|video|audio)\s*\d*$/i.test(name))continue;
        groups.set(name,[...(groups.get(name)||[]),asset]);
    }
    const matches=[...groups].flatMap(([name,items])=>{
        const at=text.indexOf(name);
        if(at<0)return [];
        // Latin filenames must not match a fragment of a longer word.
        if(/^[\w .-]+$/.test(name) && (/[\w]/.test(text[at-1]||"") || /[\w]/.test(text[at+name.length]||"")))return [];
        const prefix=text.slice(Math.max(0,at-12),at).split(/[，,。；;\n]/).pop() || "";
        const suffix=text.slice(at+name.length,at+name.length+5);
        if(/不要|不用|别用|不使用|排除|不参考/.test(prefix) || /^(?:不要|不用|别用|不使用)/.test(suffix))return [];
        return [{name,items,at,end:at+name.length}];
    }).filter((item,_,all)=>!all.some(other=>other!==item && other.at<=item.at && other.end>=item.end && other.name.length>item.name.length)).sort((a,b)=>a.at-b.at);
    const ids=[...explicitIds],ambiguous:string[]=[];
    for(const match of matches) {
        if(match.items.every(item=>item.kind==="text"))continue;
        if(match.items.some(item=>explicit.has(item.id)))continue;
        if(match.items.length>1)ambiguous.push(match.name);
        else if(!ids.includes(match.items[0].id))ids.push(match.items[0].id);
    }
    return {ids,ambiguous};
}
