import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{DreaminaService}=require('./dreamina-service'),{DreaminaReferenceCache}=require('./dreamina-reference-cache');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamina-ref-cache-')),service=new DreaminaService({executable:'fixture',dataDir:root}),resources=new Map(),nodes=new Map(),calls=[];
let sequence=0,lostUpload=false,lostCreate=false,deny=false,interruptBeforeUpload=false,resourceReadDenied=false;
const value=(args,name)=>args[args.indexOf('--'+name)+1];
service.command=async args=>{
 calls.push(args);const resourceId=args[1]==='get'?args[2]:value(args,'resource-id'),nodeId=value(args,'node-id');
 if(deny&&args[1]==='show'){const error=Error('只读权限检查失败');error.code='permission-denied';throw error;}
 if(args[0]==='resource'&&args[1]==='upload'){if(interruptBeforeUpload){interruptBeforeUpload=false;throw Object.assign(Error('service temporarily unavailable'),{code:'service.500',class:'service_unavailable',retryable:true});}resources.set(resourceId,{resourceId,type:value(args,'type'),status:'success',sha:createHash('sha256').update(await fs.readFile(value(args,'file'))).digest('hex')});if(lostUpload){lostUpload=false;throw Error('response lost');}return {resourceId,mediaType:value(args,'type')};}
 if(args[0]==='resource'&&args[1]==='get'){if(resourceReadDenied)throw Object.assign(Error('resource access denied'),{code:'service.403',class:'permission_denied'});if(!resources.has(resourceId))throw Object.assign(Error('The requested resource was not found.'),{code:'service.6',class:'invalid_input'});return resources.get(resourceId);}
 if(args[0]==='node'&&args[1]==='create'){assert.ok(resources.has(resourceId));const node={nodeId,type:args[2],resources:[{resourceId,type:args[2],status:'success'}]};nodes.set(nodeId,node);if(lostCreate){lostCreate=false;throw Error('response lost');}return {node};}
 if(args[0]==='node'&&args[1]==='show')return {nodes:[nodes.has(nodeId)?{result:'FOUND',node:nodes.get(nodeId)}:{result:'NOT_FOUND'}]};
 assert.fail('unexpected '+args);
};
const create=()=>new DreaminaReferenceCache(service,()=> 'node_'+String(++sequence).padStart(10,'0')),media=(kind='image',bytes='same',name='素材.png')=>({kind,bytes:Buffer.from(bytes),name,ext:kind==='image'?'png':kind==='audio'?'wav':'mp4'}),target={account:'42',projectId:'project-A'},uploads=()=>calls.filter(a=>a[1]==='upload').length,sources=()=>calls.filter(a=>a[0]==='node'&&a[1]==='create').length;
try{
 let cache=create();const [a,b]=await Promise.all([cache.resolve(target,media()),cache.resolve(target,media('image','same','改名.png'))]);assert.equal(a.nodeId,b.nodeId);assert.equal(b.name,'改名.png');assert.equal(uploads(),1);assert.equal(sources(),1);
 cache=create();assert.equal((await cache.resolve(target,media())).nodeId,a.nodeId);assert.equal(uploads(),1,'重启持久复用');
 await cache.resolve(target,media('image','changed'));assert.equal(uploads(),2,'同名但内容改变必须作为新素材');
 await cache.resolve({...target,account:'99'},media());await cache.resolve({...target,projectId:'project-B'},media());assert.equal(uploads(),4,'账号与画布缓存隔离');
 for(const kind of ['video','audio']){const first=await cache.resolve(target,media(kind));assert.equal((await cache.resolve(target,media(kind))).nodeId,first.nodeId);}assert.equal(uploads(),6,'图片视频音频分类型复用');
 nodes.delete(a.nodeId);const rebuilt=await cache.resolve(target,media());assert.notEqual(rebuilt.nodeId,a.nodeId);assert.equal(rebuilt.resourceId,a.resourceId);assert.equal(uploads(),6,'来源节点删除只重建节点，不重传有效资源');
 nodes.get(rebuilt.nodeId).resources[0].resourceId='manual-other';const replaced=await cache.resolve(target,media());assert.notEqual(replaced.nodeId,rebuilt.nodeId);assert.equal(nodes.get(rebuilt.nodeId).resources[0].resourceId,'manual-other','不覆盖用户修改的节点');assert.equal(replaced.resourceId,a.resourceId);assert.equal(uploads(),6);
 deny=true;await assert.rejects(()=>cache.resolve(target,media()),/权限/);deny=false;assert.equal(uploads(),6,'回读失败不盲目重传');
 lostUpload=true;await assert.rejects(()=>cache.resolve(target,media('image','lost-upload')),/response lost/);const beforeLostUpload=uploads();cache=create();await cache.resolve(target,media('image','lost-upload'));assert.equal(uploads(),beforeLostUpload,'上传响应丢失时按原资源 ID 回读恢复');
 lostCreate=true;await assert.rejects(()=>cache.resolve(target,media('image','lost-create')),/response lost/);const beforeLostCreate=sources();cache=create();await cache.resolve(target,media('image','lost-create'));assert.equal(sources(),beforeLostCreate,'创建来源节点响应丢失时回读原节点');
 interruptBeforeUpload=true;await assert.rejects(()=>cache.resolve(target,media('image','never-registered')),/素材身份已保留/);const failedUpload=calls.filter(a=>a[1]==='upload').at(-1),beforeResume=uploads();
 resourceReadDenied=true;await assert.rejects(()=>cache.resolve(target,media('image','never-registered')),/access denied/);resourceReadDenied=false;assert.equal(uploads(),beforeResume,'权限错误不能当作素材不存在');
 cache=create();const resumed=await cache.resolve(target,media('image','never-registered'));assert.equal(uploads(),beforeResume+1);assert.equal(resumed.resourceId,value(failedUpload,'resource-id'),'首次上传未登记时按原幂等资源 ID 恢复');
 await cache.resolve(target,media('image','never-registered'));assert.equal(uploads(),beforeResume+1,'恢复后继续复用，不再上传');
 // 修复前已有上传任务：依据保存的原文件字节比对，采用已验证的原节点。
 const legacy={account:target.account,projectId:target.projectId,references:[{kind:'image',name:'旧素材',nodeId:'node_legacy0001',resourceId:'legacy-resource',updateId:'original-update',submitId:'original-submit'}]};const dir=path.join(root,'old-job');await service.save(dir,legacy);await fs.writeFile(path.join(dir,'reference-0.png'),'legacy-bytes');nodes.set('node_legacy0001',{nodeId:'node_legacy0001',type:'image',resources:[{resourceId:'legacy-resource',type:'image',status:'success'}]});const beforeLegacy=uploads();assert.equal((await cache.resolve(target,media('image','legacy-bytes'))).nodeId,'node_legacy0001');assert.equal(uploads(),beforeLegacy,'采用旧任务素材零上传');
 console.log('即梦素材复用：内容哈希、改名/变更、重启/并发、账号/画布/类型隔离、旧任务采用、节点删除/修改、读失败保护、上传/建节点响应丢失恢复全部通过；零生成。');
}finally{assert.ok(path.basename(root).startsWith('dreamina-ref-cache-'));await fs.rm(root,{recursive:true,force:true});}
