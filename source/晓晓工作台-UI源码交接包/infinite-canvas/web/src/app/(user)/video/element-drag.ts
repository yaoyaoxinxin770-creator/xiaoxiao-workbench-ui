import type {Asset} from '@/stores/use-asset-store';
export const elementDragType='application/x-video-element';
export function writeElementDrag(data:DataTransfer,asset:Asset){data.setData(elementDragType,asset.id);data.setData(elementDragType+'-'+asset.kind,'1');data.effectAllowed='all';}
export function elementDragKind(data:DataTransfer){return ['image','audio','video'].find(kind=>data.types.includes(elementDragType+'-'+kind));}
