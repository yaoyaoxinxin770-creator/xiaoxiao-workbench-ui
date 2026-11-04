"use client";
import {Star} from "lucide-react";
import {useAssetStore,type Asset} from "@/stores/use-asset-store";
import {favoriteMetadata,isElementFavorite} from "../element-favorites";
export function ElementFavoriteButton({asset}:{asset:Asset}){const favorite=isElementFavorite(asset);return <button type="button" aria-label={(favorite?"取消收藏 ":"收藏 ")+asset.title} aria-pressed={favorite} title={favorite?"取消收藏":"收藏"} className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm" onClick={event=>{event.stopPropagation();const current=useAssetStore.getState().assets.find(a=>a.id===asset.id);if(current)useAssetStore.getState().updateAsset(asset.id,{metadata:favoriteMetadata(current,!isElementFavorite(current))});}}><Star className="size-4" fill={favorite?"currentColor":"none"}/></button>;}
