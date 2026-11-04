export type AssetNavigation={projectId:string;id:string;category:string};
let pending:AssetNavigation|null=null;
export function showStudioAsset(target:AssetNavigation){pending=target;window.dispatchEvent(new CustomEvent('workbench:show-asset',{detail:target}));}
export function pendingStudioAsset(projectId:string){return pending?.projectId===projectId?pending:null;}
export function consumeStudioAsset(id:string){if(pending?.id===id)pending=null;}
