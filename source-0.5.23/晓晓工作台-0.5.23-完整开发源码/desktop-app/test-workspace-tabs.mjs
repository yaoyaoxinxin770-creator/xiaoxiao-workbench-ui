import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json')),ts=require('typescript'),data=new Map();
const storage={createInstance:()=>({getItem:async key=>data.get(key)||null,setItem:async(key,value)=>data.set(key,value),removeItem:async key=>data.delete(key)})};
function load(){const text=fs.readFileSync(path.join(web,'src/stores/use-workspace-tabs-store.ts'),'utf8'),js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const exports={};new Function('require','exports',js)(name=>name==='localforage'?storage:require(name),exports);return exports;}
const {useWorkspaceTabsStore:store,projectTabId}=load();await store.persist.rehydrate();
store.getState().open({kind:'jimeng',target:'F:\\项目甲\\',name:'甲',href:'/jimeng?project=a'});
store.getState().open({kind:'jimeng',target:'f:\\项目甲',name:'甲新名',href:'/jimeng?project=a'});assert.equal(store.getState().tabs.length,1,'同一 Windows 路径只有一个页签');
store.getState().open({kind:'video',target:'video-a',name:'甲',href:'/video?project=video-a'});assert.equal(store.getState().tabs.length,2,'同名的即梦与视频项目互不覆盖');
const jimeng=projectTabId('jimeng','F:\\项目甲');store.getState().setBusy(jimeng,true);store.getState().close(jimeng);assert.equal(store.getState().tabs.length,2,'运行中不能意外关闭');
store.getState().rename(jimeng,'重命名');store.getState().setBusy(jimeng,false);store.getState().setError(jimeng,'目录不存在');
store.getState().setTaskCount(projectTabId('video','video-a'),2);assert.equal(store.getState().taskCounts['video:video-a'],2,'页签展示真实任务数');
await new Promise(r=>setTimeout(r,0));const {useWorkspaceTabsStore:reopened}=load();await reopened.persist.rehydrate();
assert.equal(reopened.getState().tabs[0].name,'重命名');assert.equal(reopened.getState().lastByKind.jimeng,jimeng);assert.deepEqual(reopened.getState().busy,{},'运行标记不冒充重启后的实际任务');assert.deepEqual(reopened.getState().errors,{});assert.deepEqual(reopened.getState().taskCounts,{},'重启后不把旧显示数量当成正在生成');
reopened.getState().close(jimeng);assert.equal(reopened.getState().tabs.length,1);assert.equal(reopened.getState().tabs[0].kind,'video');
console.log('统一项目页签验证通过：路径去重、同名渠道隔离、忙时关闭保护、名称与最近项目持久化、关闭不删除项目数据。');
