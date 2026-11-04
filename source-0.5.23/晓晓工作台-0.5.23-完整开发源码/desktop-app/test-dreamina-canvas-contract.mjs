import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{nodeId,parseJson}= {...require('./dreamina-canvas-service'),...require('./dreamina-service')},exe=path.join(import.meta.dirname,'dreamina-canvas-runtime/dreamina-canvas.exe');
for(const kind of ['video','image','audio']){
 const id=nodeId();assert.match(id,/^node_[0-9abcdefghjkmnpqrstvwxyz]{10}$/);
 const args=['node','create',kind,'--project-id',randomUUID(),'--node-id',id,'--update-id',randomUUID(),'--title','工作台参数验证','--dry-run','--format','json','--non-interactive','--profile','wb-'+randomUUID().replaceAll('-','')];
 if(kind==='video')args.push('--mode','t2v','--model','seedance_2.5','--prompt','原文','--ratio','16:9','--resolution','480p','--duration','28','--count','1');
 else args.push('--resource-id',randomUUID(),'--submit-id',randomUUID(),'--import-kind','local_upload');
 const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stderr);const result=parseJson(r.stdout);assert.equal(result.ok,true);assert.equal(result.data.validationScope,'local');assert.deepEqual(result.data.sideEffects,[]);assert.equal(result.data.plan.node.value,id);assert.ok(result.data.unverified.includes('authentication'),'dry-run cannot establish account or generation success');
}
console.log('新版官方 CLI 契约测试通过：真实二进制校验视频配置和图片/音频导入、公开节点格式；明确仅本地验证，无上传、无扣费、无跳过。');
