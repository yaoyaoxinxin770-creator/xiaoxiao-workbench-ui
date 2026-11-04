"use client";
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {Input,Popover,Modal} from "antd";
import type {TextAreaProps} from "antd/es/input";
import {Music2} from "lucide-react";
import {useAssetStore,type Asset} from "@/stores/use-asset-store";
import {useVideoStudioStore} from "@/stores/use-video-studio-store";
import {projectReferenceAssets,matchPromptAssets,repairPromptMentions,assetMatchNames} from "../prompt-references";
import {sameComposerReferences,type ComposerReferenceState} from '../composer-reference-state';
import {createPromptHistory} from "../prompt-history";
import {scrollPromptToScene} from "../prompt-locate";
import {dialogueHtml,promptHighlightRanges,PROMPT_HIGHLIGHT_CLASSES} from "../dialogue-highlight";
// Preserve original source text in every visual chip, including its original @.
export function referenceText(node:Node):string {
 if(node.nodeType===Node.TEXT_NODE)return node.textContent||"";
 if(node instanceof HTMLElement&&node.dataset.raw!==undefined)return node.dataset.raw;
 if(node.nodeName==="BR")return "\n";
 return Array.from(node.childNodes).map((child,i)=>((child.nodeName==="DIV"||child.nodeName==="P")&&i?"\n":"")+referenceText(child)).join("");
}

function referenceSelection(root: HTMLElement) {
 const selection=getSelection();if(!selection?.rangeCount)return null;
 const selected=selection.getRangeAt(0);if(!root.contains(selected.startContainer)||!root.contains(selected.endContainer))return null;
 const lengthTo=(node:Node,offset:number)=>{const range=document.createRange();range.selectNodeContents(root);range.setEnd(node,offset);return referenceText(range.cloneContents()).length;};
 return {start:lengthTo(selected.startContainer,selected.startOffset),end:lengthTo(selected.endContainer,selected.endOffset)};
}
function restoreReferenceSelection(root:HTMLElement,start:number,end=start) {
 const point=(position:number):{node:Node;offset:number}=>{
  let remaining=Math.max(0,position);
  const visit=(node:Node):{node:Node;offset:number}|null=>{
   if(node instanceof HTMLElement&&node.dataset.raw!==undefined){if(remaining<=node.dataset.raw.length){const parent=node.parentNode!;return {node:parent,offset:Array.from(parent.childNodes).indexOf(node)+(remaining===0?0:1)};}remaining-=node.dataset.raw.length;return null;}
   if(node.nodeType===Node.TEXT_NODE){const length=node.textContent?.length||0;if(remaining<=length)return {node,offset:remaining};remaining-=length;return null;}
   for(const child of Array.from(node.childNodes)){const found=visit(child);if(found)return found;}return null;
  };
  return visit(root)||{node:root,offset:root.childNodes.length};
 };
 const from=point(start),to=point(end),range=document.createRange();range.setStart(from.node,from.offset);range.setEnd(to.node,to.offset);getSelection()?.removeAllRanges();getSelection()?.addRange(range);
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
// Preserve unchanged chips/images and only replace the edited DOM range.
export function patchPromptHtml(root:HTMLElement,html:string){
 const template=document.createElement("template");template.innerHTML=html;
 const before=Array.from(root.childNodes),after=Array.from(template.content.childNodes);
 let start=0,end=0;while(start<before.length&&start<after.length&&before[start].isEqualNode(after[start]))start++;
 while(end<before.length-start&&end<after.length-start&&before[before.length-end-1].isEqualNode(after[after.length-end-1]))end++;
 if(start===before.length&&start===after.length)return;
 const range=document.createRange();range.setStart(root,start);range.setEnd(root,before.length-end);range.deleteContents();
 const fragment=document.createDocumentFragment();for(const node of after.slice(start,after.length-end))fragment.append(node);range.insertNode(fragment);
}
type Props=Omit<TextAreaProps,"value"|"onChange">&{value:string;onChange:(value:string)=>void;onBind:(asset:Asset,name?:string,kind?:string)=>Promise<boolean>;onMatch:(value:string)=>Promise<void>;bindings?:Record<string,string>;boundNames?:string[];focusSceneRevision?:number;referenceState?:ComposerReferenceState;onRestoreReferences?:(state:ComposerReferenceState)=>void};
export function PromptReferenceInput({value,onChange,onBind,onMatch,bindings={},boundNames=[],focusSceneRevision=0,referenceState,onRestoreReferences,...props}:Props){
 const all=useAssetStore(s=>s.assets),projects=useVideoStudioStore(s=>s.projects),activeProjectId=useVideoStudioStore(s=>s.activeProjectId),project=projects.find(p=>p.id===activeProjectId);
 const assets=useMemo(()=>{const ids=new Set(project?.elementIds);return projectReferenceAssets(all.filter(a=>ids.has(a.id)),project?.elementRules);},[all,project?.elementIds,project?.elementRules]);
 const lastInput=useRef<string|null>(null),[matchedValue,setMatchedValue]=useState(value);
 const renderedValue=lastInput.current===value?matchedValue:value;
 useEffect(()=>{if(value===matchedValue)return;const timer=setTimeout(()=>setMatchedValue(value),160);return()=>clearTimeout(timer);},[value,matchedValue]);
 const report=useMemo(()=>matchPromptAssets(renderedValue,assets,bindings),[renderedValue,assets,bindings]);
 const composing=useRef(false),focusedSceneRevision=useRef(0);
 const editor=useRef<HTMLDivElement>(null),caret=useRef<number|null>(null),text=useRef(value);text.current=value;
 const history=useRef(createPromptHistory(value,value.length,referenceState,sameComposerReferences)),atomicInput=useRef(false),pendingSelection=useRef<{text:string;caret:number}|null>(null);
 const historyScene=useRef(focusSceneRevision);
 if(historyScene.current!==focusSceneRevision){historyScene.current=focusSceneRevision;pendingSelection.current=null;history.current=createPromptHistory(value,value.length,referenceState,sameComposerReferences);}
 const pushHistory=(next:string,position:number,force=false)=>history.current.push(next,position,force,Date.now(),referenceState);
 useEffect(()=>{if(composing.current)return;const pending=pendingSelection.current;if(pending){if(value!==pending.text)return;pushHistory(value,pending.caret,true);pendingSelection.current=null;return;}if(history.current.current().text!==value||!sameComposerReferences(history.current.current().context,referenceState))pushHistory(value,value.length,true);},[value,referenceState]);
 const navigateHistory=(redo=false)=>{const snapshot=redo?history.current.redo():history.current.undo();if(!snapshot)return;if(snapshot.context)onRestoreReferences?.(snapshot.context);caret.current=snapshot.caret;text.current=snapshot.text;setQuery(null);setTarget(null);onChange(snapshot.text);};
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||!(event.ctrlKey||event.metaKey)||!['z','y'].includes(event.key.toLowerCase()))return;const target=event.target as HTMLElement;if(!target?.closest('[data-video-composer]')||target.matches('input,textarea,[contenteditable=true]'))return;event.preventDefault();navigateHistory(event.shiftKey||event.key.toLowerCase()==='y');};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 const [preview,setPreview]=useState<Asset|null>(null);
  const [query,setQuery]=useState<string|null>(null),[search,setSearch]=useState(""),[category,setCategory]=useState("全部"),[busy,setBusy]=useState(false),[target,setTarget]=useState<{name:string;kind:string}|null>(null);
 const range=useRef({start:0,end:0}),wrapper=useRef<HTMLDivElement>(null);
 const [anchor,setAnchor]=useState({x:0,y:0,height:20});
 const positionPicker=(chip?:HTMLElement)=>{const selection=getSelection();if(!chip&&(!selection?.rangeCount||!editor.current?.contains(selection.anchorNode)))return;const selected=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;
 if(selected&&!chip){selected.collapse(false);if(selected.endContainer.nodeType!==Node.TEXT_NODE){let node=selected.endContainer.childNodes[selected.endOffset-1];while(node?.lastChild)node=node.lastChild;if(node?.nodeType===Node.TEXT_NODE){selected.setStart(node,node.textContent?.length||0);selected.collapse(true);}}}
 const r=chip?chip.getBoundingClientRect():selected!.getBoundingClientRect(),parent=wrapper.current?.getBoundingClientRect();if(parent&&r.height)setAnchor({x:r.right-parent.left,y:r.top-parent.top,height:r.height});};
 const groupIds=new Set([...report.matches.map(a=>a.id),...assets.filter(a=>boundNames.includes(a.kind+":"+a.title)||Boolean(bindings["preserve:asset:"+a.id])).map(a=>a.id)]);
 const defaultCategory=assets.filter(a=>(a.kind==="image"||a.kind==="audio")&&groupIds.has(a.id)).length>2?"本组":"全部";
 const offset=()=>editor.current?referenceSelection(editor.current)?.start??value.length:value.length;
 useLayoutEffect(()=>{
  if(composing.current||renderedValue!==value)return;
  if(!value&&editor.current){editor.current.style.paddingBottom="";editor.current.scrollTop=0;setQuery(null);setTarget(null);}
  let html="",cursor=0;const dialogue=promptHighlightRanges(value);
  for(const b of [...report.bindings].sort((a,b)=>a.start-b.start)){if(b.start<cursor||!boundNames.includes(b.kind+":"+b.asset.title))continue;
   const chosen=report.bindings.filter(x=>x.start===b.start&&x.end===b.end&&boundNames.includes(x.kind+":"+x.asset.title));
   html+=dialogueHtml(value,cursor,b.start,dialogue);const raw=value.slice(b.start,b.end);
   const media=chosen.map(x=>'<span data-reference-variant="'+escape(x.asset.id)+'" style="display:inline-flex;align-items:center;gap:3px;border:1px solid var(--border);border-radius:6px;padding:2px 4px;margin-left:5px"><b>@</b>'+ (x.asset.kind==="image"?'<img alt="" title="'+escape(x.asset.title)+'" src="'+escape(x.asset.data.dataUrl)+'" style="width:26px;height:26px;object-fit:cover;border-radius:4px"/>':'<span title="'+escape(x.asset.title)+'">♫</span>')+'</span>').join('');
   html+='<span contenteditable="false" data-reference-chip="'+escape(b.kind)+'" data-name="'+escape(b.name)+'" data-kind="'+escape(b.kind)+'" data-raw="'+escape(raw)+'" title="'+escape(b.asset.title)+'" style="display:inline-flex;align-items:center;gap:4px;vertical-align:middle;padding:1px 0;cursor:pointer;color:var(--muted-foreground)"><span>'+escape(b.name)+'</span>'+media+'</span>';cursor=b.end;
  }
  html+=dialogueHtml(value,cursor,value.length,dialogue);if(editor.current&&editor.current.innerHTML!==html){const selected=caret.current!==null?{start:caret.current,end:caret.current}:document.activeElement===editor.current?referenceSelection(editor.current):null;const scrollTop=editor.current.scrollTop;patchPromptHtml(editor.current,html);editor.current.scrollTop=scrollTop;if(selected)restoreReferenceSelection(editor.current,selected.start,selected.end);}caret.current=null;
  if(editor.current&&focusedSceneRevision.current!==focusSceneRevision){focusedSceneRevision.current=focusSceneRevision;setQuery(null);setTarget(null);scrollPromptToScene(editor.current,value);}
 },[value,renderedValue,report,boundNames.join("|"),focusSceneRevision]);
 const openStart=useRef(-1);
 const inspect=()=>{if(!editor.current)return;const selected=referenceSelection(editor.current);if(selected&&selected.start!==selected.end){setQuery(null);setTarget(null);return;}const raw=referenceText(editor.current),end=offset(),m=raw.slice(0,end).match(/@([^@\n，。；;：:、|｜]*)$/);range.current={start:m?end-m[0].length:end,end};if(m&&!(m[1].endsWith(" ")&&assets.some(a=>a.title===m[1].trim()))){positionPicker();setTarget(null);setQuery(m[1]);setSearch(m[1]);if(query===null||range.current.start!==openStart.current)setCategory(defaultCategory);openStart.current=range.current.start;}else setQuery(null);};
 const openBinding=(name:string,kind:string)=>{setTarget({name,kind});setQuery("");setSearch(name);setCategory(defaultCategory);};
 const select=async(asset:Asset)=>{const before=text.current,{start,end}=range.current,nextMention=repairPromptMentions(before.slice(0,start)+"@"+asset.title+" "+before.slice(end)),nextCaret=start+asset.title.length+2;history.current.rememberCaret(offset());if(!target)pendingSelection.current={text:nextMention,caret:nextCaret};setBusy(true);try{if(!await onBind(asset,target?.name||query?.trim()||asset.title,target?.kind||"any")){pendingSelection.current=null;return;}if(target){setTarget(null);setQuery(null);return;}if(text.current!==before){pendingSelection.current=null;pushHistory(text.current,offset(),true);return;}caret.current=nextCaret;onChange(nextMention);setQuery(null);requestAnimationFrame(()=>editor.current?.focus());}catch(error){pendingSelection.current=null;throw error;}finally{setBusy(false);}};
 const allowed=assets.filter(a=>(!a.referenceRule?.disabled||groupIds.has(a.id)||Boolean(bindings["preserve:asset:"+a.id]))&&(a.kind==="image"||a.kind==="audio")&&(!target||target.kind==="any"||a.kind===target.kind));
 const categories=["本组","全部","人物","群像","场景","道具","待确认","音频"];
 const inCategory=(a:Asset,c:string)=>c==="本组"?groupIds.has(a.id):c==="全部"||c==="音频"&&a.kind==="audio"||c==="待确认"&&(!a.category||a.category==="未分类")||a.kind!=="audio"&&a.category===c;
 const options=allowed.filter(a=>inCategory(a,category)&&assetMatchNames(a).some(n=>n.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
 const picker=<div className="w-96 max-w-[80vw]"><Input aria-label="搜索图片 / 音频 / 角色" placeholder="搜索图片 / 音频 / 角色" value={search} onChange={e=>setSearch(e.target.value)}/><div className="my-2 flex flex-wrap gap-1">{categories.map(c=><button key={c} type="button" className={"rounded-full border border-border px-2 py-1 text-xs "+(category===c?"bg-accent":"")} onClick={()=>setCategory(c)}>{c} {allowed.filter(a=>inCategory(a,c)).length}</button>)}</div><div className="max-h-64 overflow-y-auto" role="listbox" aria-label="提示词引用素材">{options.map(a=><button disabled={busy} type="button" role="option" aria-label={"@ "+a.title} key={a.id} onMouseDown={e=>e.preventDefault()} onClick={()=>void select(a)} className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-accent">{a.kind==="image"?<img src={a.data.dataUrl} alt="" className="size-10 rounded object-cover"/>:<Music2 className="size-10 p-2 text-primary"/>}<span className="min-w-0 flex-1 truncate">{a.title}</span><small className="text-muted-foreground">{a.kind==="audio"?"音频":a.category||"待确认"}</small></button>)}{!options.length&&<p className="p-2 text-xs text-muted-foreground">当前项目没有匹配素材，可先导入或清空搜索</p>}</div></div>;
 return <div className="min-w-0"><div ref={wrapper} className="relative">
 <div ref={editor} role="textbox" aria-label="视频提示词" aria-multiline="true" contentEditable suppressContentEditableWarning data-prompt-reference-editor data-value={value} className={PROMPT_HIGHLIGHT_CLASSES+" overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary "+(props.className||"")} style={{minHeight:props.rows?props.rows*22:80,...props.style}} onScroll={()=>{if(query!==null){if(target){const chip=Array.from(editor.current?.querySelectorAll<HTMLElement>("[data-reference-chip]")||[]).find(c=>c.dataset.name===target.name&&c.dataset.kind===target.kind);if(chip)positionPicker(chip);}else positionPicker();}}} onBeforeInput={()=>{if(!composing.current)history.current.rememberCaret(offset());}} onCompositionStart={()=>{history.current.rememberCaret(offset());composing.current=true;}} onCompositionEnd={()=>{composing.current=false;if(editor.current){const pos=offset(),nextT=referenceText(editor.current);caret.current=null;pushHistory(nextT,pos,true);text.current=nextT;lastInput.current=nextT;onChange(nextT);inspect();}}} onInput={()=>{if(!editor.current||composing.current)return;const pos=offset(),nextT=referenceText(editor.current);caret.current=null;pushHistory(nextT,pos,atomicInput.current);text.current=nextT;lastInput.current=nextT;onChange(nextT);inspect();}} onKeyUp={e=>{if(!["Escape","Enter"].includes(e.key))inspect();}} onClick={e=>{const selection=getSelection();if(selection&&!selection.isCollapsed){setQuery(null);setTarget(null);return;}const chip=(e.target as HTMLElement).closest<HTMLElement>("[data-reference-chip]");if(chip){const variant=(e.target as HTMLElement).closest<HTMLElement>("[data-reference-variant]")||chip.querySelector<HTMLElement>("[data-reference-variant]");const asset=all.find(a=>a.id===variant?.dataset.referenceVariant);setQuery(null);setTarget(null);if(asset)setPreview(asset);}else inspect();}} onKeyDown={e=>{if(composing.current||e.nativeEvent.isComposing)return;if((e.ctrlKey||e.metaKey)&&(e.key==="z"||e.key==="Z")){e.preventDefault();navigateHistory(e.shiftKey);return;}if((e.ctrlKey||e.metaKey)&&(e.key==="y"||e.key==="Y")){e.preventDefault();navigateHistory(true);return;}if(e.key==="Escape"){setQuery(null);return;}if(e.key==="Enter"){e.preventDefault();if(query===null)document.execCommand("insertText",false,"\n");}}} onCopy={e=>{const selection=getSelection();if(!selection?.rangeCount)return;e.preventDefault();e.clipboardData.setData("text/plain",referenceText(selection.getRangeAt(0).cloneContents()));}} onPaste={e=>{e.preventDefault();history.current.rememberCaret(offset());atomicInput.current=true;try{document.execCommand("insertText",false,e.clipboardData.getData("text/plain"));}finally{atomicInput.current=false;}if(editor.current){const pos=offset(),nextT=referenceText(editor.current);caret.current=null;pushHistory(nextT,pos,true);onChange(nextT);}setTimeout(()=>void onMatch(text.current),0);}}/>
 <Popover open={query!==null} onOpenChange={open=>{if(!open){setQuery(null);setTarget(null);}}} trigger={[]} placement="topLeft" content={picker}><span aria-hidden data-mention-anchor className="pointer-events-none absolute w-px" style={{left:anchor.x,top:anchor.y,height:anchor.height}}/></Popover>{!value&&<p className="pointer-events-none absolute left-3 right-10 top-2 text-sm text-muted-foreground">{props.placeholder}</p>}</div>
 <Modal open={Boolean(preview)} title={preview?.title} footer={null} width={1000} onCancel={()=>setPreview(null)} destroyOnClose>{preview?.kind==="image"?<img src={preview.data.dataUrl} alt={preview.title} className="mx-auto max-h-[75vh] max-w-full object-contain"/>:preview?.kind==="audio"?<audio autoPlay controls src={preview.data.url} className="w-full"/>:preview?.kind==="video"?<video controls src={preview.data.url} className="max-h-[75vh] w-full"/>:null}</Modal>
 </div>;
}
