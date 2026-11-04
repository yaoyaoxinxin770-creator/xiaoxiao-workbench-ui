import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json')),ts=require('typescript'),cache=new Map();
function load(rel){if(cache.has(rel))return cache.get(rel);const out={};cache.set(rel,out);new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join(web,'src',rel),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('./')?load(path.posix.join(path.posix.dirname(rel),name+'.ts')):require(name),out);return out;}
const {compareElementOrder,filterElements,elementPriorityPatch,groupElements}=load('app/(user)/video/element-model.ts'),{matchPromptAssets,projectReferenceAssets}=load('app/(user)/video/prompt-references.ts'),{videoColorFor}=load('app/(user)/video/video-colors.ts'),{canRecoverLocalVideoTask}=load('app/(user)/video/local-task-recovery.ts'),{runningTaskItems}=load('app/(user)/video/running-tasks.ts'),{studioVideoChannel,isInterpolatedVideoLog,projectUsedModels,groupNeedsPlaceholder}=load('app/(user)/video/studio-results.ts');
const make=(id,title=id,kind='image',category='人物',metadata={})=>({id,title,kind,category,metadata,tags:[],createdAt:'2026-01-01',updatedAt:'2026-01-01',data:{dataUrl:'file:'+id,url:'file:'+id,durationMs:5000}});
const images=[make('C'),make('B'),make('A'),make('Z')],rules={};for(const id of ['A','B','C'])rules[id]=elementPriorityPatch(rules[id]||{},1,rules);
assert.deepEqual([...images].sort((a,b)=>compareElementOrder(a,b,rules)).map(a=>a.id),['A','B','C','Z']);
rules.B={...rules.B,...elementPriorityPatch(rules.B,0,rules)};assert.deepEqual([...images].sort((a,b)=>compareElementOrder(a,b,rules)).map(a=>a.id),['A','C','B','Z']);
for(const sort of ['name','newest','used','serial'])assert.deepEqual(filterElements(images,{search:'',category:'全部',kind:'all',author:'all',performer:'all',status:'all',sort,rules}).map(a=>a.id),['A','C','B','Z']);
const actor=make('actor','陆太太','image','人物',{elementAliases:['陆母','陈母']}),scene=make('scene','出租屋室内','image','场景',{elementAliases:['客厅大厅']}),audio=make('voice','陈太太','audio','音频',{elementManualGroup:'陆母',elementPerformer:'陆母'});assert.ok(matchPromptAssets("【出场人物】\n陆母：在场",[actor]).matches.some(a=>a.id==='actor'));assert.ok(matchPromptAssets('【场景与连续状态】\n客厅大厅，白天。',[scene]).matches.some(a=>a.id==='scene'));assert.equal(matchPromptAssets("【出场人物】\n陆母：在场",projectReferenceAssets([actor],{actor:{disabled:true}})).matches.length,0);assert.ok(matchPromptAssets("【出场人物】\n陆母：在场",[actor,make('another','另一张','image','人物',{elementAliases:['陆母']})]).ambiguous.includes('陆母'));
const grouped=groupElements([actor,audio]);assert.equal(grouped.find(g=>g.category==='音频').name,'陆母');assert.equal(audio.title,'陈太太');
const groups=[{id:'g',logIds:['v1','v2'],color:'teal'}];assert.equal(videoColorFor('v1',groups,{v1:{color:'blue'}}),'blue');assert.equal(videoColorFor('v2',groups,{v1:{color:'blue'},v2:{color:''}}),'');
const interrupted={id:'wait',createdAt:1,title:'等待',prompt:'',status:'待核对',interruptedAt:10,task:{id:'pippit:original',status:'processing'}};assert.equal(canRecoverLocalVideoTask(interrupted),false);const running=runningTaskItems([interrupted],[{id:'video-default',name:'测试'}],[],{});assert.equal(running[0].active,false);assert.equal(running[0].phase,'本地已中断');assert.equal(interrupted.task.status,'processing');
assert.equal(runningTaskItems([interrupted],[{id:'video-default',name:'测试'}],[],{wait:{projectId:'video-default',folderId:'',review:'none',trashedAt:20}}).length,0);
assert.equal(groupNeedsPlaceholder({id:'g-wait',logIds:['wait']},[interrupted],false,{wait:{projectId:'video-default',folderId:'',review:'none',trashedAt:20}}),true);
assert.equal(studioVideoChannel({task:{id:'dreamina-canvas:1'}}),'dreamina');
assert.equal(studioVideoChannel({task:{id:'oiioii:1'}}),'oiioii');
assert.equal(studioVideoChannel({task:{id:'pippit:1'}}),'pippit');
assert.equal(isInterpolatedVideoLog({task:{id:'dreamina-canvas:1',interpolatedNodeId:'n1'}}),true);
assert.equal(isInterpolatedVideoLog({task:{id:'dreamina-canvas:1'}}),false);
assert.deepEqual(projectUsedModels([{id:'l1',model:'seedance_2.0'},{id:'l2',model:'seedance_2.5_draft'},{id:'l3',model:'导入视频'},{id:'l4',model:'kling_other_project'}],{l1:{projectId:'p1',folderId:'',review:'none'},l2:{projectId:'p1',folderId:'',review:'none'},l3:{projectId:'p1',folderId:'',review:'none'},l4:{projectId:'p2',folderId:'',review:'none'}},'p1'),['seedance_2.0','seedance_2.5_draft']);
const gallerySource = fs.readFileSync(path.join(web, 'src/app/(user)/video/components/video-gallery.tsx'), 'utf8');
assert.ok(gallerySource.includes('key:"open-folder",label:"打开视频文件夹位置"'), '包含打开视频文件夹位置');
assert.ok(gallerySource.indexOf('key:"open-folder"') < gallerySource.indexOf('key:"delete-group"'), '打开视频文件夹位置位于删除视频组正上方');
const actionsBlock = gallerySource.slice(gallerySource.indexOf('data-video-actions'));
const reeditIdx = actionsBlock.indexOf('重新编辑视频'), agentIdx = actionsBlock.indexOf('发给 Agent'), starIdx = actionsBlock.indexOf('收藏视频');
assert.ok(reeditIdx !== -1 && agentIdx !== -1 && starIdx !== -1 && reeditIdx < agentIdx && agentIdx < starIdx, '悬浮操作按钮顺序为：重新编辑 -> 发给 Agent -> 收藏');

const pageSource = fs.readFileSync(path.join(web, 'src/app/(user)/video/page.tsx'), 'utf8');
assert.ok(pageSource.includes('<ComposerGroupNavigation currentId={loadedGroupId||""}'), '组导航位于底部工具栏行内');
assert.ok(pageSource.includes('aria-label="重新匹配"'), '重新匹配按钮保留aria-label');
assert.ok(pageSource.includes('!rounded-full'), '开始创作按钮为紧凑圆角样式');

const agentPanelSource = fs.readFileSync(path.join(web, 'src/app/(user)/video/components/codex-agent-panel.tsx'), 'utf8');
assert.ok(agentPanelSource.includes('aria-label="暂停 Agent 思考"'), '包含暂停 Agent 思考按钮');
assert.ok(agentPanelSource.includes('aria-label="编辑快捷指令"'), '包含自定义/编辑快捷指令');
assert.ok(agentPanelSource.includes('aria-label="配置 Agent 模型"'), '包含 Agent 模型与接口配置');

console.log('交付文档规则：优先FIFO与取消后保序/各种排序一致/人物场景别名及歧义禁用/音频明确归属/单视频颜色覆盖/中断不冒充远端完成/待处理任务删除与渠道补帧当前项目模型筛选/打开视频文件夹位置/悬浮按钮重排/工具栏组导航与参数胶囊/Agent暂停与快捷指令与模型接口配置：PASS');
