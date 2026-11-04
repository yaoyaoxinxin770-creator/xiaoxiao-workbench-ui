import assert from 'node:assert/strict';
import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('../infinite-canvas/web/node_modules/typescript'),source=fs.readFileSync(new URL('../infinite-canvas/web/src/app/(user)/video/page.tsx',import.meta.url),'utf8');
const part=source.slice(source.indexOf('const previewGenerationLog = async'),source.indexOf('const retryGenerationLog = async'));
const js=ts.transpileModule(part,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
let release;const composerRevision={current:0},loadedGroup={current:''};
const run=new Function('deps', 'const {clearComposer,composerRevision,loadedGroup,projectId,useVideoStudioStore,normalizeLog}=deps;'+js+';return previewGenerationLog;')({clearComposer:()=>{composerRevision.current++;loadedGroup.current='';},composerRevision,loadedGroup,projectId:'project',useVideoStudioStore:{getState:()=>({activeProjectId:'project',groups:[{id:'old',logIds:['log-a']}]})},normalizeLog:()=>new Promise(resolve=>release=resolve)});
const old=run({id:'log-a'});composerRevision.current++;loadedGroup.current='new-group';release({id:'log-a'});await old;assert.equal(loadedGroup.current,'new-group','旧参数异步载入不得覆盖新组');
console.log('旧组参数异步返回后不覆盖当前组：PASS');
