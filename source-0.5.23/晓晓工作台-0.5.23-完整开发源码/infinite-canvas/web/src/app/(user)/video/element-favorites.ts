import type { Asset } from "@/stores/use-asset-store";
export const isElementFavorite=(asset:Pick<Asset,"metadata">)=>asset.metadata?.elementFavorite===true;
export function favoriteMetadata(asset:Pick<Asset,"metadata">,favorite:boolean){return {...asset.metadata,elementFavorite:favorite,...(!favorite?{elementPinnedAt:0}:{})};}
export function pinnedMetadata(asset:Pick<Asset,"metadata">,at:number){return {...asset.metadata,elementFavorite:true,elementPinnedAt:at};}
export function sortFavoriteElements<T extends Pick<Asset,"metadata">>(assets:T[]):T[]{return [...assets].sort((a,b)=>Number(b.metadata?.elementPinnedAt||0)-Number(a.metadata?.elementPinnedAt||0));}
