import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'), require=createRequire(path.join(web,'package.json')), ts=require('typescript');
function load(file,stubs={}) { const js=ts.transpileModule(fs.readFileSync(path.join(web,'src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const exports={};new Function('require','exports','module',js)(name=>name in stubs?stubs[name]:require(name),exports,{exports});return exports; }
const studio=load('app/(user)/video/studio-model.ts');
const {filterElements,elementInfo,groupElements}=load('app/(user)/video/element-model.ts',{'./studio-model':studio});
const assets=[
 {id:'hong',title:'小红',kind:'image',category:'人物',tags:['红衣'],createdAt:'2026-01-02',metadata:{elementStatus:'approved',elementAuthor:'晓晓',elementPerformer:'小红',elementLastUsedAt:50}},
 {id:'room',title:'客厅',kind:'image',category:'场景',tags:[],createdAt:'2026-01-01',metadata:{elementStatus:'pending',elementDescription:'白色窗帘',elementLastUsedAt:90}},
 {id:'voice',title:'小红声音',kind:'audio',category:'音频',tags:[],createdAt:'2026-01-03'},
];
const filters={search:'',category:'全部',kind:'all',author:'all',performer:'all',status:'all',sort:'newest'};
assert.deepEqual(filterElements(assets,filters).map(a=>a.id),['voice','hong','room']);
assert.deepEqual(filterElements(assets,{...filters,category:'人物',status:'approved',author:'晓晓',performer:'小红'}).map(a=>a.id),['hong']);
assert.equal(filterElements(assets,{...filters,category:'场景',status:'approved'}).length,0);
assert.equal(filterElements(assets,{...filters,kind:'audio'})[0].id,'voice');
assert.equal(filterElements(assets,{...filters,search:'白色窗帘'})[0].id,'room');
assert.equal(filterElements(assets,{...filters,search:'红衣'})[0].id,'hong');
assert.equal(filterElements(assets,{...filters,sort:'used'})[0].id,'room');
assert.equal(filterElements(assets,{...filters,sort:'oldest'})[0].id,'room');
assert.equal(elementInfo({...assets[0],metadata:{elementStatus:'invalid'}}).status,'none');
const model=load('components/prompts/prompt-library-model.ts');
const prompts=[{id:'a',title:'A',coverUrl:'image-a',prompt:'文本A',category:'人物',tags:['肖像','共享']},{id:'b',title:'B',coverUrl:'image-b',prompt:'文本B',category:'场景',tags:['共享']},{id:'c',title:'C',coverUrl:'image-c',prompt:'文本C',category:'场景',tags:['风景']}];
const removed={deletedIds:[],deletedCategories:['人物'],deletedTags:['肖像']};
const kept=model.applyPromptRemovals(prompts,removed);
assert.equal(kept.length,3);assert.equal(kept[0].coverUrl,'image-a');assert.equal(kept[0].prompt,'文本A');assert.equal(kept[0].category,'');assert.deepEqual(kept[0].tags,['共享']);
assert.deepEqual(model.promptFacets(kept),{categories:['场景'],tags:['共享','风景']});
const withoutA=model.applyPromptRemovals(prompts,{deletedIds:['a'],deletedCategories:[],deletedTags:[]});
assert.equal(withoutA.some(p=>p.coverUrl==='image-a'||p.prompt==='文本A'),false);
assert.deepEqual(model.promptFacets(withoutA),{categories:['场景'],tags:['共享','风景']},'只消除孤立的分类和标签，共享项保留');
assert.equal(prompts[0].category,'人物','不能修改服务器原始快照');
const data=new Map(),storage={getItem:async key=>data.get(key)||null,setItem:async(key,value)=>{data.set(key,value);},removeItem:async key=>data.delete(key)};
const stubs={'@/lib/localforage-storage':{localForageStorage:storage}};
const {usePromptLibraryStore:store}=load('stores/use-prompt-library-store.ts',stubs);
await store.persist.rehydrate();store.getState().deletePrompt('a');store.getState().deletePrompt('a');store.getState().deleteCategory('人物');store.getState().deleteTag('肖像');
await new Promise(resolve=>setTimeout(resolve,0));
const {usePromptLibraryStore:reopened}=load('stores/use-prompt-library-store.ts',stubs);await reopened.persist.rehydrate();
assert.equal(reopened.getState().ready,true);assert.deepEqual(reopened.getState().deletedIds,['a']);assert.deepEqual(reopened.getState().deletedCategories,['人物']);assert.deepEqual(reopened.getState().deletedTags,['肖像']);
assert.equal(model.applyPromptRemovals(prompts,reopened.getState()).length,2,'服务器刷新后仍不恢复已删卡片');
const records=Array.from({length:501},(_,i)=>({...prompts[0],id:String(i)}));let calls=[];
const {fetchPromptCatalog}=load('services/api/prompts.ts',{'@/services/api/request':{compactApiParams:x=>x,apiGet:async(_url,args)=>{calls.push(args);return {total:501,items:records.slice((args.page-1)*500,args.page*500)};}}});
assert.equal((await fetchPromptCatalog()).length,501);assert.deepEqual(calls.map(c=>c.page),[1,2]);assert.equal(calls[0].pageSize,500);
const broken=load('services/api/prompts.ts',{'@/services/api/request':{compactApiParams:x=>x,apiGet:async()=>({total:2,items:[prompts[0]]})}});
await assert.rejects(broken.fetchPromptCatalog(),/分页数据不完整/);
console.log('元素分类/演员/作者/状态交叉筛选、最近使用排序；提示词删除、保留图文的分类标签删除、跨页孤立分类、重启持久化和分页完整性：PASS');

store.getState().deletePrompts(["b","c","b"]);await new Promise(resolve=>setTimeout(resolve,0));const {usePromptLibraryStore:batchReloaded}=load("stores/use-prompt-library-store.ts",stubs);await batchReloaded.persist.rehydrate();assert.deepEqual(batchReloaded.getState().deletedIds,["a","b","c"]);assert.equal(model.applyPromptRemovals(prompts,batchReloaded.getState()).length,0,"批量删除保存所有所选 ID，重启不恢复");

const variant=(title,category='人物',kind='image')=>({...assets[0],id:title,category,kind,title,metadata:{}});
const grouped=groupElements([variant('陆霖辞'),variant('陆霖辞-1'),variant('陆霖辞1'),variant('陆霖辞2'),variant('陆霖辞Q版'),variant('陆霖辞-比较低沉','音频','audio'),variant('女主'),variant('女主 居家睡衣'),variant('女主 快餐店工作服'),variant('女主出租屋室内','场景'),variant('女主出租屋阳台','场景')]);
assert.equal(grouped.find(g=>g.category==='人物'&&g.name==='陆霖辞').items.length,5);
assert.equal(grouped.find(g=>g.category==='人物'&&g.name==='女主').items.length,3);
assert.equal(grouped.find(g=>g.category==='音频').name,'陆霖辞');
assert.equal(grouped.find(g=>g.category==='场景').name,'女主出租屋');assert.equal(grouped.find(g=>g.category==='场景').items.length,2);
assert.equal(grouped.filter(g=>g.name==='陆霖辞').length,2,'图音独立分区，大纲再按名称去重');
assert.equal(groupElements([variant('场景1','场景'),variant('场景2','场景')]).length,2,'数字场景名不擅自合并');
console.log('真实无演员字段的编号/Q版/服装变体归并，人物/场景/音频独立分区：PASS');

const favorites=load('app/(user)/video/element-favorites.ts');
const original={metadata:{localFileMissing:false,elementPerformer:'女主'}};
const starred={id:'star',metadata:favorites.favoriteMetadata(original,true)},pinned={id:'pin',metadata:favorites.pinnedMetadata(starred,123)};
assert.equal(favorites.isElementFavorite(starred),true);assert.equal(favorites.sortFavoriteElements([starred,pinned])[0].id,'pin');assert.equal(original.metadata.elementFavorite,undefined,'星标不改写其他原数据');
const reloaded=JSON.parse(JSON.stringify(pinned));assert.equal(favorites.sortFavoriteElements([starred,reloaded])[0].id,'pin','重载保留置顶');
assert.equal(favorites.favoriteMetadata(reloaded,false).elementPinnedAt,0,'取消收藏移除置顶');assert.equal(favorites.favoriteMetadata(original,true).elementPerformer,'女主','保留原元数据');
console.log('素材星标与置顶独立持久化，取消收藏清除置顶，原文件元数据保留：PASS');

const {groupedElements,detectUncategorizedSuggestions}=load('app/(user)/video/element-model.ts',{'./studio-model':studio});
assert.deepEqual(groupedElements(assets,'none'),[],'不分组不计算大纲');
assert.deepEqual(groupedElements(assets,'date').map(g=>g.name),['2026-01-03','2026-01-02','2026-01-01']);
assert.equal(groupedElements(assets,'date').flatMap(g=>g.items).length,assets.length,'日期分组保留所有素材');
assert.deepEqual(groupedElements(assets,'name'),groupElements(assets),'两处素材库共用名称分组');

const uncatCatalog=[
 {...variant('陆霖辞','人物'),data:{dataUrl:'same-hero.png'}},
 variant('女主出租屋室内','场景'),
 variant('女主出租屋阳台','场景'),
 {...variant('陆霖辞','未分类'),id:'u-dup',data:{dataUrl:'same-hero.png'}},
 {...variant('陆霖辞-战损西装','未分类'),id:'u-char'},
 {...variant('陆霖辞家客厅','未分类'),id:'u-home'},
 {...variant('女主出租屋走廊','未分类'),id:'u-scene'},
 {...variant('陆霖辞-已禁用','未分类'),id:'u-disabled'},
 {...variant('路边石子','未分类'),id:'u-other'},
];
const suggestions=detectUncategorizedSuggestions(uncatCatalog,{'u-disabled':{disabled:true}});
assert.deepEqual(suggestions.map(s=>[s.assetId,s.suggestedCategory,s.suggestedPerformer||'',Boolean(s.duplicateOfId),s.reason]),[
 ['u-dup','人物','陆霖辞',true,'exact-duplicate'],
 ['u-char','人物','陆霖辞',false,'character-prefix'],
 ['u-home','场景','',false,'scene-prefix'],
 ['u-scene','场景','',false,'scene-prefix'],
]);
console.log('未分类同名副本/同前缀角色变体/角色家宅与场景前缀智能识别，跳过已禁用与无关项：PASS');
