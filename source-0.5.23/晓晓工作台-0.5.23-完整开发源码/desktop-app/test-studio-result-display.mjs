import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json')),ts=require('typescript');
function load(name,stubs={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join(web,'src/app/(user)/video',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>stubs[n]||require(n),exports);return exports;}
const model=load('studio-model'),{visibleStudioLogs:visible,compareStudioResults:compare,shortcutScopeIds:scope,manualGenerationLabel:label}=load('studio-results',{'./studio-model':model});
const make=(id,i,extra={})=>({id,createdAt:i,title:'标题',prompt:'【视频编号01-2】',status:'失败',task:{id:'client_video_task_'+id,status:'queued'},error:'素材引用未就绪',...extra});
const a=make('a',1),b=make('b',2),good=make('good',3,{status:'成功',video:{url:'local'},task:{id:'platform:good',status:'completed'}}),audit=make('audit',4,{error:'视频违规，审核未通过',task:{id:'platform:bad',status:'failed'}}),c=make('c',5),d=make('d',6),pending=make('pending',7,{status:'生成中'}),unknown=make('unknown',8,{status:'待核对',task:{id:'dreamina-canvas:client_video_task_unknown',status:'unknown'}});
const group={id:'group',projectId:'p',folderId:'f',createdAt:1,number:'01-2',title:'标题',prompt:'原稿',logIds:[a.id,b.id]},placements={};
assert.deepEqual(visible([a,b],[group],placements).map(l=>l.id),['b']);
const all=[a,b,good,audit,c,d],g={...group,logIds:all.map(l=>l.id)};assert.deepEqual(visible(all,[g],placements).map(l=>l.id),['good','audit','d']);assert.deepEqual(visible([...all,pending],[{...g,logIds:[...g.logIds,pending.id]}],placements).map(l=>l.id),['good','audit','pending']);assert.deepEqual(visible([c,unknown],[{...group,logIds:[c.id,unknown.id]}],placements).map(l=>l.id),['unknown']);assert.equal(all.length,6,'原记录不删除');const unclear={...unknown,status:'失败',error:'网络断开，结果未知'};assert.deepEqual(visible([unclear,b],[{...group,logIds:[unclear.id,b.id]}],{}).map(l=>l.id),[unclear.id],'提交不确定的旧失败也不得隐藏');
assert.deepEqual(visible([a,b],[group],{a:{projectId:'p',folderId:'f',review:'none',trashedAt:1}}).map(l=>l.id),['a','b']);
const n10=make('10',1,{prompt:'【视频编号01-10】'}),n2=make('2',3,{prompt:'【视频编号01-2】'});assert.deepEqual([n10,n2].sort((a,b)=>compare(a,b,'name',[])).map(l=>l.id),['2','10']);assert.ok(compare(n10,n2,'oldest',[])<0);assert.ok(compare(n10,n2,'newest',[])>0);
assert.ok(compare(n2,make('plain',0,{prompt:'没有编号',title:'其他视频'}),'name',[])<0,'有编号的组排在无编号视频前');
const project={id:'p',name:'项目',folders:[{id:'f',name:'后续4',parentId:''},{id:'child',name:'子目录',parentId:'f'},{id:'other',name:'其他',parentId:''}],elementIds:[],brief:''},media=['f','child','other','trash','foreign'].map((id,i)=>make(id,i,{status:'成功',video:{url:id}})),where=Object.fromEntries(media.map(l=>[l.id,{projectId:l.id==='foreign'?'q':'p',folderId:l.id==='trash'?'f':l.id,review:'none',...(l.id==='trash'?{trashedAt:1}:{})}]));
assert.deepEqual(scope(media,project,'f',where),['f']);assert.deepEqual(scope(media,project,'',where),['f','child','other']);
for(const [channel,site] of [['local-dreamina-canvas','即梦'],['local-dreamina','即梦'],['local-pippit','小云雀'],['local-oiioii','Oii']])assert.equal(label({config:{videoChannelId:channel}}),'节点已建立 · '+site+'官网手动生成');
console.log('视频展示：本地失败合并/平台审核失败保留/成功替换/不确定任务保留/原记录不删/编号自然排序/文件夹与全部快捷方式范围/官网名称：PASS');

const {isUnreadVideo}=load('studio-results',{'./studio-model':model});
const fresh={...good,model:'seedance',createdAt:10,lastPolledAt:30,completionNotifiedAt:35},placed={projectId:'p',folderId:'f',review:'none'};
assert.equal(isUnreadVideo(fresh,placed),true);assert.equal(isUnreadVideo(fresh,{...placed,lastViewedAt:20}),true);assert.equal(isUnreadVideo(fresh,{...placed,lastViewedAt:35}),false);assert.equal(isUnreadVideo({...fresh,model:'导入视频'},placed),false);assert.equal(isUnreadVideo({...fresh,status:'生成中'},placed),false);assert.equal(isUnreadVideo({...fresh,video:undefined},placed),false);
console.log('新视频未读：完成前查看不清除/完成后查看清除/导入、生成中与节点无标记：PASS');

const {studioResultRank:rank}=load('studio-results',{'./studio-model':model});
const groups=Array.from({length:14},(_,i)=>({...group,id:'v'+(i+1),number:'V'+String(i+1).padStart(2,'0'),createdAt:i+1,logIds:i===4?['old-v5','pending-v5']:i===5?['pending-v6']:[]}));
const order=groups.map(g=>'group:'+g.id),placeholders=groups.map(g=>({id:'group:'+g.id})),pendingV5=make('pending-v5',100,{prompt:'【视频编号V05｜剧本1】',status:'生成中'}),pendingV6=make('pending-v6',101,{prompt:'【视频编号V06｜剧本1】',status:'待核对'});
const cards=placeholders.filter(l=>!['group:v5','group:v6'].includes(l.id)).concat(pendingV5,pendingV6);
const sorted=(items,manual=order)=>items.slice().sort((a,b)=>rank(a,manual,groups)-rank(b,manual,groups)).map(l=>l.id);
const expected=order.map(id=>id==='group:v5'?pendingV5.id:id==='group:v6'?pendingV6.id:id);
assert.deepEqual(sorted(cards),expected,'建节点中的任务沿用占位卡原位置');
assert.deepEqual(sorted(cards.map(l=>l.id===pendingV5.id?{...l,status:'成功',video:{url:'final'}}:l)),expected,'回传成品不改变组位置');
assert.equal(rank(pendingV5,order.map(id=>id==='group:v5'?'old-v5':id),groups),4,'旧失败尝试被隐藏后仍继承原位置');
const custom=order.slice();custom.splice(1,0,custom.splice(4,1)[0]);assert.equal(sorted(cards,custom)[1],pendingV5.id,'用户自定义组顺序继续保留');
assert.deepEqual(cards.slice().sort((a,b)=>compare(a,b,'oldest',groups)).map(l=>l.id),expected,'日期排序使用组创建时间，生成时不跳位');
assert.deepEqual(cards.slice().sort((a,b)=>compare(a,b,'name',groups)).map(l=>l.id),expected,'V编号自然排序不随任务状态变化');
console.log('组位置：占位/建节点/成功同槽、历史失败替换、手动排序、组创建日期、V编号排序：PASS');

const missingSeven=order.filter(id=>id!=='group:v7');assert.deepEqual(sorted(cards,missingSeven),expected,'旧手动顺序未记录的组仍留在原相邻组之间');

const {groupNeedsPlaceholder}=load('studio-results',{'./studio-model':model});assert.equal(groupNeedsPlaceholder(group,[a,b],true),true);assert.equal(groupNeedsPlaceholder({...group,logIds:[good.id]},[good],true),false);assert.equal(groupNeedsPlaceholder({...group,logIds:[unknown.id]},[unknown],true),false);console.log('V15准备失败隐藏后仍保留本组占位：PASS');
