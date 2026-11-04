import type {ReferenceImage} from '@/types/image';
import type {ReferenceAudio,ReferenceVideo} from '@/types/media';
export type ComposerReferenceState={references:ReferenceImage[];audioReferences:ReferenceAudio[];videoReferences:ReferenceVideo[];firstFrame:ReferenceImage|null;lastFrame:ReferenceImage|null;loadedGroup?:string;negativePrompt?:string;bindings:Record<string,string>};
const sameItems=<T>(a:T[],b:T[])=>a===b||a.length===b.length&&a.every((item,index)=>item===b[index]);
const sameBindings=(a:Record<string,string>,b:Record<string,string>)=>a===b||Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>a[key]===b[key]);
export const sameComposerReferences=(a:ComposerReferenceState|undefined,b:ComposerReferenceState|undefined)=>a===b||Boolean(a&&b&&sameItems(a.references,b.references)&&sameItems(a.audioReferences,b.audioReferences)&&sameItems(a.videoReferences,b.videoReferences)&&a.firstFrame===b.firstFrame&&a.lastFrame===b.lastFrame&&sameBindings(a.bindings,b.bindings)&&a.loadedGroup===b.loadedGroup&&a.negativePrompt===b.negativePrompt);
