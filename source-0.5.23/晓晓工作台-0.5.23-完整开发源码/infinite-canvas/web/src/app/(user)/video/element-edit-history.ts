type Edit={label:string;undo:()=>void;redo:()=>void};
const histories=new Map<string,{past:Edit[];future:Edit[]}>();
export function recordElementEdit(projectId:string,edit:Edit){const h=histories.get(projectId)||{past:[],future:[]};h.past.push(edit);if(h.past.length>20)h.past.shift();h.future=[];histories.set(projectId,h);}
export function stepElementHistory(projectId:string,redo=false){const h=histories.get(projectId),from=redo?h?.future:h?.past,to=redo?h?.past:h?.future,edit=from?.at(-1);if(!edit||!to)return '';if(redo)edit.redo();else edit.undo();from!.pop();to.push(edit);return edit.label;}
