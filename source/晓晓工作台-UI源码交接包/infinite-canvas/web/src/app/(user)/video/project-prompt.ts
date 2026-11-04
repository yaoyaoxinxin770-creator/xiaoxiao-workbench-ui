export type ProjectPromptRule={enabled:boolean;text:string;position:'start'|'end'|'afterHeading';heading?:string};
export type ProjectPrompt=ProjectPromptRule & {primaryEnabled?:boolean;additional?:ProjectPromptRule[]};
export const projectPromptRules=(rule:ProjectPrompt)=>[{enabled:rule.primaryEnabled??true,text:rule.text,position:rule.position,heading:rule.heading},...(rule.additional||[])];
export function applyProjectPrompt(source:string,rule?:ProjectPrompt){
 if(!rule?.enabled)return {prompt:source,missingHeading:false};
 const buckets=new Map<string,ProjectPromptRule>(),ends:string[]=[];let missingHeading=false;
 for(const entry of projectPromptRules(rule)){
  if(!entry.enabled||!entry.text.trim())continue;
  const heading=(entry.heading||'').trim().replace(/^【|】$/g,''),value={...entry,text:entry.text.trim(),heading};
  if(entry.position==='end'){ends.push(value.text);continue;}
  if(entry.position==='afterHeading'&&applyOne(source,value).missingHeading){missingHeading=true;ends.push(value.text);continue;}
  const key=entry.position+':'+(entry.position==='afterHeading'?heading:''),previous=buckets.get(key);buckets.set(key,previous?{...value,text:previous.text+'\n\n'+value.text}:value);
 }
 let prompt=source;for(const entry of buckets.values())prompt=applyOne(prompt,entry).prompt;
 if(ends.length)prompt=applyOne(prompt,{enabled:true,position:'end',text:ends.join('\n\n')}).prompt;
 return {prompt,missingHeading};
}
function applyOne(source:string,rule?:ProjectPromptRule){
 const text=rule?.text.trim();if(!rule?.enabled||!text)return {prompt:source,missingHeading:false};
 if(rule.position==='start')return {prompt:source===text||source.startsWith(text+'\n')?source:text+'\n\n'+source,missingHeading:false};
 const append=()=>source===text||source.endsWith('\n'+text)?source:source.replace(/\s+$/u,'')+'\n\n'+text;
 if(rule.position!=='afterHeading')return {prompt:append(),missingHeading:false};
 const heading=(rule.heading||'').trim().replace(/^【|】$/g,''),escaped=heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const match=heading?new RegExp('^[\\t ]*(?:\\*\\*)?【'+escaped+'】(?:\\*\\*)?','m').exec(source):null;
 if(!match)return {prompt:append(),missingHeading:true};
 const at=match.index+match[0].length,rest=source.slice(at).replace(/^\r?\n/,'');
 return {prompt:rest===text||rest.startsWith(text+'\n')?source:source.slice(0,at)+'\n'+text+'\n'+rest,missingHeading:false};
}
