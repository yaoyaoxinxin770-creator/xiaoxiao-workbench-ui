// Map canonical prompt offsets through visual reference chips without changing text.
export function locatePromptRange(editor: HTMLElement, start: number, end: number, select = true) {
 let offset=0;
 const point=(position:number,preferNext=false):{node:Node;offset:number}|null=>{
  offset=0;
  const walk=(parent:Node):{node:Node;offset:number}|null=>{
   for(const child of Array.from(parent.childNodes)) {
    const atomic=child instanceof HTMLElement&&child.dataset.raw!==undefined;
    const length=atomic?(child as HTMLElement).dataset.raw!.length:(child.textContent||"").length;
    if(position<offset+length||!preferNext&&position===offset+length) {
     if(child.nodeType===Node.TEXT_NODE)return {node:child,offset:Math.max(0,position-offset)};
     if(atomic){const index=Array.from(parent.childNodes).indexOf(child);return {node:parent,offset:index+(position>offset?1:0)};}
     return walk(child);
    }
    offset+=length;
   }
   return null;
  };
  return walk(editor);
 };
 const a=point(start,true),b=point(end);if(!a||!b)return;
 const range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);
 if(select){editor.focus({preventScroll:true});getSelection()?.removeAllRanges();getSelection()?.addRange(range);}
 // Keep the real content height; synthetic padding leaves a blank screen at the end.
 editor.style.paddingBottom="";
 const target=range.getClientRects()[0],bounds=editor.getBoundingClientRect();
 if(target)editor.scrollTop+=target.top-bounds.top-12;
}

export function scrollPromptToScene(editor:HTMLElement,prompt:string) {
 const header="【场景与连续状态】",start=prompt.indexOf(header);
 if(start<0){editor.style.paddingBottom="";editor.scrollTop=0;return;}
 locatePromptRange(editor,start,start+header.length,false);
}
