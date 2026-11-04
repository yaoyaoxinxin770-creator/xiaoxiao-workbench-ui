import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json'));
const ts=require('typescript'),source=fs.readFileSync(path.join(web,'src/app/(user)/video/prompt-references.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('exports',js)(exports);const match=exports.matchPromptAssets;
const assets=[{id:'1',title:'妹妹女主',kind:'image'},{id:'2',title:'路边炸串摊（黄昏）',kind:'image'},{id:'3',title:'苏瑶',kind:'audio'},{id:'4',title:'苏瑶',kind:'image'},{id:'5',title:'夏茉',kind:'audio'}];
const prompt='【出场人物】\n苏瑶：资产【妹妹女主】\n【场景与连续状态】\n场景：傍晚/外，路边炸串摊（参照【路边炸串摊（黄昏）】）。\n【声音锁定】\n@苏瑶｜声线：清亮。\n@夏茉｜声线：干脆。';
assert.deepEqual(match(prompt,assets).matches.map(a=>a.id),['1','2','3','5']);
assert.equal(match('【场景与连续状态】\n场景：参照【路边炸串摊(黄昏)】',assets).matches[0].id,'2','全角半角括号统一匹配');
assert.deepEqual(match('@苏瑶 ',assets).matches,[],'三个段落外不自动匹配');
assert.equal(match('@苏瑶 ',assets,{'any:苏瑶':'3'}).matches[0].id,'3','手动 @ 选择仍可在段落外使用');
assert.equal(match('提起苏瑶但未引用',assets).matches.length,0,'对白中的普通角色名不自动绑定');
assert.equal(match('【出场人物】\n妹妹女主变装：首次出场',assets).matches.length,0,'名称前缀不能误绑定');
assert.equal(match('【出场人物】\n苏瑶：资产【妹妹女主】',[...assets,{id:'dup',title:'妹妹女主',kind:'image'}]).matches.length,0,'同名多图不猜');
assert.equal(match('【出场人物】\n苏瑶：资产【妹妹女主】',[{id:'v',title:'妹妹女主_upscayl_3x_upscayl-standard-4x',kind:'image'}]).matches[0].id,'v','别名命中带版本后缀的素材名');
assert.deepEqual(match('【出场人物】\n苏瑶：资产【妹妹女主】',[{id:'v1',title:'妹妹女主_v1',kind:'image'},{id:'v2',title:'妹妹女主_v2',kind:'image'}]).ambiguous,['妹妹女主'],'并列版本不猜');
const coded=[{id:'c2',title:'C02 胡副局',kind:'image',category:'人物'},{id:'c3',title:'C03 白光',kind:'image',category:'人物'},{id:'s1',title:'S01 妖管局大门口',kind:'image',category:'场景'},{id:'seg',title:'场景_胡副局_日景',kind:'image',category:'场景'}];
const codedPrompt='【出场人物】\n胡副局：开镜在场\n白光：开镜在场\n【场景与连续状态】\n场景：日/外，【妖管局大门口】。';
assert.deepEqual(match(codedPrompt,coded).matches.map(a=>a.id).sort(),['c2','c3','s1'],'编号前缀素材按剥前缀后的精确名命中，词段命中不抢精确名');
assert.equal(match('【出场人物】\n胡副局：开镜在场',[coded[3]]).matches[0].id,'seg','角色名作为完整词段出现在素材名中部时按相似度兜底命中');
assert.deepEqual(match('【出场人物】\n胡副局：开镜在场',[coded[3],{id:'seg2',title:'特写_胡副局_夜景',kind:'image'}]).ambiguous,['胡副局'],'并列词段命中不猜');
assert.equal(match('【出场人物】\n胡副局：开镜在场',[{id:'x',title:'胡副局长',kind:'image'}]).matches.length,0,'无分隔符的加长名不算词段命中');
const store=createRequire(import.meta.url)('./asset-store');assert.equal(store.matchSceneAsset(prompt,[{kind:'scenes',mediaType:'image',displayName:'路边炸串摊（黄昏）',relativePath:'场景/炸串.png'}]).relativePath,'场景/炸串.png');
console.log('明确资产别名、参照场景、声音锁定、括号归一、同名歧义与前缀隔离 PASS');

const roundSource=fs.readFileSync(path.join(web,'src/app/(user)/video/prompt-duration.ts'),'utf8'),roundExports={};new Function('exports',ts.transpileModule(roundSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(roundExports);
for(const [input,expected] of [[29.2,29],[29.5,29],[29.5001,30],[29.6,30],[4.5,4],[0.5,0]])assert.equal(roundExports.promptDuration('总时长：'+input+'秒'),expected);
assert.equal(roundExports.promptDuration('没有总时长'),null);
const cast=[{id:'hero',title:'女主',kind:'image'},{id:'variant',title:'女主 居家睡衣',kind:'image'},{id:'voice',title:'女主',kind:'audio'},{id:'man',title:'陆霖辞',kind:'image'},{id:'manvoice',title:'陆霖辞-比较低沉',kind:'audio'}];
const script='总时长：29.2秒\n【出场人物】\n女主：资产【女主】\n陆霖辞：资产【陆霖辞】\n【声音锁定】\n@女主｜声线：清亮\n@陆霖辞｜声线：低沉';
const fixed=match(script,cast);assert.deepEqual(fixed.issues,[]);assert.equal(fixed.matches.length,4);assert.ok(fixed.bindings.some(b=>b.kind==='audio'&&script.slice(b.start,b.end)==='@女主'));
assert.ok(fixed.bindings.some(b=>b.kind==='image'&&script.slice(b.start,b.end)==='女主'));
assert.equal(match('【声音锁定】\n女主｜声线：清亮',cast).matches[0].id,'voice');
const unknown=match('【出场人物】\n缺图：资产【缺图】\n【声音锁定】\n@缺声｜声线：低沉',cast);assert.deepEqual(unknown.issues.map(i=>[i.name,i.kind]),[['缺图','image'],['缺声','audio']]);
const choices=[...cast,{id:'voice2',title:'女主',kind:'audio'}];assert.equal(match(script,choices).issues[0].kind,'audio');assert.equal(match(script,choices,{'audio:女主':'voice2'}).issues.length,0);
assert.equal(exports.repairPromptMentions('@女主@女主｜声线：女 @陆霖辞@陆霖辞-比较低沉｜声线：男'),'@女主｜声线：女 @陆霖辞-比较低沉｜声线：男');assert.equal(exports.repairPromptMentions('@女主@男主'),'@女主@男主');
console.log('角色头部与别名/同名图音分别引用/手动消除歧义/重复 @ 修复/29.5取整边界：PASS');

const noisy='【全局视觉】\n资产【假图】 @假声\n【场景与连续状态】\n场景：路边炸串摊（参照【路边炸串摊（黄昏）】）。\n【光线】\n场景：假场景\n【出场人物】\n女主：资产【女主】\n陆霖辞Q版·兜帽态：后续入镜\n【声音锁定】\n@女主｜声线：清亮\n【镜头01】 3.8s｜全景\n构图(开镜静态)：床边\n画面进程：灯泡闪烁\n声音与台词：资产【假图】 @假声\n【女主（OS/vo）】（配音指令：回忆）';
const scoped=match(noisy,[...cast,assets[1]]);assert.deepEqual(scoped.issues.map(i=>[i.name,i.kind]),[['陆霖辞Q版·兜帽态','image']]);assert.deepEqual(scoped.matches.map(a=>a.id),['2','hero','voice']);
assert.equal(noisy.slice(scoped.issues[0].start,scoped.issues[0].end),'陆霖辞Q版·兜帽态','缺失卡定位精确对应出场人物声明');
assert.equal(match('【声音锁定】\n@缺声｜声线：低沉\n【镜头01】 3.8s\n表演与互动：平静',cast).issues.length,1,'有后缀的镜头标题终止音频段落');
assert.equal(match('【出场人物】\n女主：资产【女主】\n【声音与台词】\n@假声｜声线：其他',cast).issues.length,0,'声音与台词不属于自动匹配段落');
console.log('三个指定段落/镜头标题边界/正文不误匹配/精确缺失定位：PASS');

const scenePrompt='【场景与连续状态】\n场景：夜/内，女主出租屋室内（参照【女主出租屋室内】）';
const sceneAssets=[{id:'room',title:'女主出租屋室内',kind:'image',category:'未分类'}];
assert.deepEqual(match(scenePrompt,sceneAssets).issues,[],'明确场景引用不应被未分类标签拦截');
assert.equal(match(scenePrompt,[...sceneAssets,{id:'other',title:'女主出租屋室内',kind:'image',category:'人物'}],{'image:女主出租屋室内':'room'}).matches[0].id,'room','手动绑定原图覆盖自动分类');
console.log('明确场景引用与手动绑定不被标签误拦截：PASS');

const chosenVariant=match("手动引用 @女主 居家睡衣 后继续描述",cast,{"any:女主 居家睡衣":"variant"});
assert.equal(chosenVariant.bindings[0].asset.id,"variant");assert.equal(chosenVariant.bindings[0].name,"女主 居家睡衣");assert.equal("手动引用 @女主 居家睡衣 后继续描述".slice(chosenVariant.bindings[0].start,chosenVariant.bindings[0].end),"@女主 居家睡衣");assert.equal(match("手动引用 @女主 居家睡衣 后继续描述",cast).matches.length,0,"未选择的正文不参与自动匹配");
console.log("含空格的手动 @ 完整名称与原文范围：PASS");

const qName='【出场人物】\n陆霖辞Q版·兜帽态：后续入镜';
assert.equal(match(qName,[{id:'normal',title:'陆霖辞',kind:'image'},{id:'q',title:'陆霖辞Q版',kind:'image'}]).matches[0].id,'q');
assert.equal(match('【出场人物】\n女主 居家睡衣·晚间：开镜在场',[{id:'short',title:'女主',kind:'image'},{id:'long',title:'女主 居家睡衣',kind:'image'}]).matches[0].id,'long','最长匹配优先');
assert.equal(match(qName,[{id:'q1',title:'陆霖辞Q版',kind:'image'},{id:'q2',title:'陆霖辞Q版',kind:'image'}]).ambiguous.length,1,'同等名称保持歧义');
assert.equal(match(qName,[{id:'q1',title:'陆霖辞Q版',kind:'image'},{id:'q2',title:'陆霖辞Q版',kind:'image'}],{'image:陆霖辞Q版·兜帽态':'q2'}).matches[0].id,'q2','手选优先');
assert.equal(match('【出场人物】\n陆霖辞Q版变装：入镜',[{id:'q',title:'陆霖辞Q版',kind:'image'}]).matches.length,0,'无边界状态名不冒认');
console.log('短素材名匹配声明状态后缀，匹配字符最多优先，同等候选不误绑：PASS');

const localUrl='http://127.0.0.1:17842/workbench/local-media/'+ 'a'.repeat(48);
const spacing=[{id:'base',kind:'image',title:'女主'},{id:'sleep',kind:'image',title:'女主居家睡衣',referenceRule:{priority:1}},{id:'work',kind:'image',title:'女主 快餐店工作服'}];
assert.deepEqual(match('【出场人物】\n女主：资产【女主 　居家睡衣】',spacing).matches.map(a=>a.id),['sleep'],'内部空格统一后命中完整服装名，不退回泛角色图');
assert.equal(match('【出场人物】\n女主：资产【女主居家睡衣】',[spacing[2]]).matches.length,0,'不同服装不得混配');
const copiedVoice=[{id:'old',kind:'audio',title:'女主',data:{url:localUrl}},{id:'revision',kind:'audio',title:'女主',data:{url:localUrl+'?v=1'}},{id:'local',kind:'audio',title:'女主',localFile:{id:'a'.repeat(48)},data:{url:localUrl+'?v=2'}}];
assert.deepEqual(match('【声音锁定】\n@女主｜声线：清亮',copiedVoice).matches.map(a=>a.id),['local'],'同一文件历史记录不产生音频假歧义');
assert.equal(match('【声音锁定】\n@女主｜声线：清亮',[...copiedVoice,{id:'other',kind:'audio',title:'女主',data:{url:localUrl+'different'}}]).ambiguous.length,1,'不同文件的同名音频仍保持歧义');
assert.equal(match('【声音锁定】\n@女主｜声线：清亮',copiedVoice,{'manual:audio:女主':'old'}).matches[0].id,'old','保留明确手动选择');
assert.equal(match('【声音锁定】\n@女主｜声线：清亮',copiedVoice,{'omit:asset:local':'local'}).matches.length,0,'手动移除仍有效');
console.log('空格同名/完整服装名/同文件历史副本/真实多音色歧义/手动选择与排除：PASS');

assert.equal(match('【声音锁定】\n@女主｜声线：清亮',copiedVoice,{'omit:asset:old':'old'}).matches.length,0,'历史同源记录的手动排除不因去重而丢失');
