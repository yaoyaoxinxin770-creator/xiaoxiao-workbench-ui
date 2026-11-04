export const escapePromptHtml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type DialogueRange={start:number;end:number;role:string};
export function dialogueRanges(source:string):DialogueRange[]{
 const ranges:DialogueRange[]=[];
 for(const match of source.matchAll(/^.*?【([^\n]+?)】[（(]配音指令[:：]([^\n]*)/gm)){
  const line=match[0],body=match[2],bodyOffset=line.length-body.length,pipe=Math.max(body.lastIndexOf('｜'),body.lastIndexOf('|')),colon=body.slice(pipe+1).search(/[:：]/),end=Math.max(body.lastIndexOf('）'),body.lastIndexOf(')'));
  if(pipe<0||colon<0||end<pipe+1+colon+1)continue;
  const start=match.index!+bodyOffset+pipe+1+colon+1;
  ranges.push({start,end:match.index!+bodyOffset+end,role:match[1]});
 }return ranges;
}
export const PROMPT_HIGHLIGHT_CLASSES='[--prompt-heading:#096c95] [--prompt-field:#5a6b14] [--prompt-shot:#b53679] dark:[--prompt-heading:#9cdcfe] dark:[--prompt-field:#d5eaa3] dark:[--prompt-shot:#f2a7d1]';
export type PromptHighlight={start:number;end:number;role?:string;kind?:string};
export function promptHighlightRanges(source:string):PromptHighlight[]{
 const ranges:(PromptHighlight&{priority:number})[]=dialogueRanges(source).map(r=>({...r,kind:'dialogue',priority:4}));
 const add=(regex:RegExp,kind:string,priority:number)=>{for(const match of source.matchAll(regex))ranges.push({start:match.index!,end:match.index!+match[0].length,kind,priority});};
 add(/【[^】\n]+】/g,'heading',3);for(const r of ranges)if(r.kind==='heading'&&/^【镜头[\d一二三四五六七八九十]/.test(source.slice(r.start,r.end)))r.kind='shot';
 add(/^#{1,6}[ \t]+[^\n]+/gm,'heading',3);add(/“[^”\n]*”|"[^"\n]*"/g,'quote',2);add(/^[ \t]*(?:[-*][ \t]+)?[^\n:：【】]{1,35}[:：]/gm,'field',1);add(/\*\*[^*\n]+\*\*/g,'emphasis',1);add(/\b\d+(?:\.\d+)?(?:[-–]\d+(?:\.\d+)?)?s\b/g,'time',1);
 const points=[...new Set(ranges.flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b),result:PromptHighlight[]=[];
 for(let i=0;i<points.length-1;i++){const start=points[i],end=points[i+1],best=ranges.filter(r=>r.start<=start&&r.end>=end).sort((a,b)=>b.priority-a.priority)[0];if(!best)continue;const prior=result[result.length-1];if(prior&&prior.end===start&&prior.kind===best.kind&&prior.role===best.role)prior.end=end;else result.push({...best,start,end});}return result;
}
export function dialogueHtml(source:string,start=0,end=source.length,ranges:PromptHighlight[]=promptHighlightRanges(source)){
 let html='',cursor=start;for(const range of ranges){const a=Math.max(start,range.start),b=Math.min(end,range.end);if(a>=b)continue;const kind=range.kind||'dialogue',color=kind==='heading'?'var(--prompt-heading,var(--primary))':kind==='shot'?'var(--prompt-shot,var(--primary))':kind==='dialogue'?'var(--primary)':'var(--prompt-field,var(--primary))';html+=escapePromptHtml(source.slice(cursor,a))+'<span data-prompt-highlight="'+kind+'"'+(range.role?' data-dialogue-role="'+escapePromptHtml(range.role)+'"':'')+' style="color:'+color+';font-weight:600">'+escapePromptHtml(source.slice(a,b))+'</span>';cursor=b;}return html+escapePromptHtml(source.slice(cursor,end));
}
