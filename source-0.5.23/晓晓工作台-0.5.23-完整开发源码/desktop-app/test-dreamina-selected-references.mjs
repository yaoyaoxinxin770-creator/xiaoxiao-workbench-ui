import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{planGroup}=require('./dreamina-canvas-drafts');
const node=(nodeId,title,type='image')=>({nodeId,title,type,resources:[{type,status:'success'}]});
for(const kind of ['image','audio']){
 const title=kind==='image'?'女主 居家睡衣':'陆霖辞-比较低沉',name=kind==='image'?title:'陆霖辞',prompt=kind==='image'?'【出场人物】\n女主：资产【'+name+'】':'【声音锁定】\n@'+name+'｜声线：低沉',asset={id:'asset',title,kind},selection={assetId:'asset',kind,name:title,nodeId:'current'},nodes=[node('old-a',title,kind),node('old-b',title,kind),node('current','Local selection',kind)];
 const plan=planGroup({prompt},nodes,[asset],[],[selection]);assert.deepEqual(plan.issues,[]);assert.deepEqual(plan.references.map(r=>r.nodeId),['current']);assert.equal(plan.prompt.replace(/\{\{node:[^}]+\}\}/g,''),prompt);
 const duplicates=planGroup({prompt},nodes,[asset],[],[selection,{...selection,assetId:'copy'}]);assert.deepEqual(duplicates.issues,[]);assert.equal(duplicates.references.length,1,'同一个文件的多个已选记录只引用一次');
 const omitted=planGroup({prompt,bindings:{['omit:asset:'+asset.id]:asset.id}},nodes,[asset],[],[selection]);assert.deepEqual(omitted.references,[]);
 const disabled=planGroup({prompt},nodes,[{...asset,referenceRule:{disabled:true}}],[],[selection]);assert.deepEqual(disabled.references,[],'禁用元素不得经本组选择重新加入');
}
const assets=['正面','侧面'].map((v,i)=>({id:'a'+i,title:'陆霖辞-'+v,kind:'image',referenceRule:{priority:1}})),selections=assets.map((a,i)=>({assetId:a.id,kind:a.kind,name:a.title,nodeId:'selected'+i})),nodes=selections.map(s=>node(s.nodeId,s.name));
const multi=planGroup({prompt:'【出场人物】\n陆霖辞：开镜在场'},nodes,assets,[],selections);assert.deepEqual(multi.issues,[]);assert.equal(multi.references.length,2,'同级优先多图引用继续保留');

for(const kind of ['image','audio','video']){
 const asset={id:'historical',kind,title:'原素材',referenceRule:{disabled:true,priority:0}},alternate={id:'preferred',kind,title:'原素材 新版',referenceRule:{name:'原素材',priority:3}},selection={assetId:asset.id,name:asset.title,kind,nodeId:'historical-node'};
 const prompt='@'+{image:'图片',audio:'音频',video:'视频'}[kind]+'【原素材】',bindings={'preserve:asset:historical':'historical'};
 const inputs=[node(selection.nodeId,asset.title,kind),node('new-node',alternate.title,kind)];
 for(const autoMatch of [true,false]){
  const restored=planGroup({prompt,bindings,autoMatch},inputs,[asset,alternate],[],[selection]);
  assert.deepEqual(restored.issues,[]);assert.deepEqual(restored.references.map(r=>r.nodeId),['historical-node'],'禁用历史素材与自动匹配开关无关，不被新优先图替换：'+kind);
 }
 assert.equal(asset.referenceRule.disabled,true,'只作用于本次提交，不改资产库禁用状态');
 assert.deepEqual(planGroup({prompt,bindings:{...bindings,'omit:asset:historical':'historical'}},inputs,[asset],[],[selection]).references,[],'手动移除优先于历史保留');
}
const historicalBindings=Object.fromEntries(assets.map(a=>['preserve:asset:'+a.id,a.id]));
const oldMulti=planGroup({prompt:'【出场人物】\n陆霖辞：开镜在场',bindings:historicalBindings},nodes,assets.map((a,i)=>({...a,referenceRule:{disabled:true,priority:i}})),[],selections);
assert.equal(oldMulti.references.length,2);assert.deepEqual(oldMulti.issues,[],'两张历史参考不因现在优先级不同而变成歧义');
console.log('历史图片/音频/视频：禁用保留、优先级不替换、手动移除优先、原库不变与同角色多图完整保留：PASS');
console.log('当前已选图片/音频优先于画布同名节点、同源去重、禁用与排除、同级多图、原文保持：PASS');
