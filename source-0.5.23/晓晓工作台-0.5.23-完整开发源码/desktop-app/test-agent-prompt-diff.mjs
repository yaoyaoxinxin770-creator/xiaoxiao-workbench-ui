import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const web=path.resolve(import.meta.dirname,'../infinite-canvas/web'),require=createRequire(path.join(web,'package.json')),ts=require('typescript'),exports={};
new Function('exports',ts.transpileModule(fs.readFileSync(path.join(web,'src/app/(user)/video/agent-prompt-diff.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const {diffPromptLines,diffLineChars,diffStats}=exports;
// 相同内容（含不同换行符）不产生差异。
assert.deepEqual(diffPromptLines('镜头1：远景\r\n台词：林雾：“你迟到了七年。”','镜头1：远景\n台词：林雾：“你迟到了七年。”'),[]);
// 只改一句：成对显示删除/新增，逐字标出改动，台词行原样保留并折叠远处未改动行。
const before=['【视频编号V07｜第7组】','镜头1（0-4s）：远景，雨夜渡口。','镜头2（4-9s）：停在三步之外。','台词：林雾：“你迟到了七年。”','画面风格：赛璐璐。','负面要求：不要水印。'].join('\n');
const after=before.replace('停在三步之外','停在约五步之外的栈桥另一端');
const blocks=diffPromptLines(before,after);
assert.deepEqual(blocks.map(b=>b.kind),['skip','same','del','add','same','skip']);
assert.equal(blocks[0].count,1);assert.equal(blocks[5].count,2);
const del=blocks[2],add=blocks[3];
assert.equal(del.text,'镜头2（4-9s）：停在三步之外。');assert.equal(add.text,'镜头2（4-9s）：停在约五步之外的栈桥另一端。');
assert.equal(del.spans.map(s=>s.text).join(''),del.text,'逐字片段拼回原句');assert.equal(add.spans.map(s=>s.text).join(''),add.text,'逐字片段拼回新句');
assert.ok(add.spans.some(s=>s.changed&&s.text.includes('约')),'标出新增文字');assert.ok(del.spans.some(s=>s.changed&&s.text.includes('三')),'标出删除文字');
assert.ok(add.spans.some(s=>!s.changed&&s.text.startsWith('镜头2（4-9s）：停在')),'未改动前缀不标记');
assert.deepEqual(diffStats(blocks),{added:1,removed:1});
// 纯新增和纯删除的行。
const grown=diffPromptLines('A\nB','A\nB\nC');assert.deepEqual(grown.map(b=>b.kind),['skip','same','add']);assert.equal(grown[0].count,1);assert.equal(grown[2].text,'C');
const shrunk=diffPromptLines('A\nB\nC','A\nC');assert.deepEqual(shrunk.map(b=>b.kind),['same','del','same']);assert.equal(shrunk[1].text,'B');
// 过长内容放弃比较（调用方回退为全文显示），逐字比较过长时整行标记。
const long=Array.from({length:700},(_,i)=>'第'+i+'行').join('\n');assert.equal(diffPromptLines(long,long.split('\n').reverse().join('\n')),null);
const wide=diffLineChars('甲'.repeat(500),'乙'.repeat(500));assert.deepEqual(wide.del,[{text:'甲'.repeat(500),changed:true}]);
console.log('Agent提示词修改对比：相同/替换逐字/新增/删除/折叠/超长回退：PASS');
