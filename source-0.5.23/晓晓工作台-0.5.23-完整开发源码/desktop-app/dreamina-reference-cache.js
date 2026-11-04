const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
class DreaminaReferenceCache{
 constructor(service,createNodeId){this.service=service;this.createNodeId=createNodeId;this.pending=new Map();}
 async ready(target,media){
  const fingerprint=hash(media.bytes),key=hash([target.account,target.projectId,media.kind,fingerprint].join(String.fromCharCode(0))),cached=await this.service.read(path.join(this.service.dataDir,'_reference-cache',key));
  if(!cached||cached.status!=='ready')return null;
  if(cached.account!==target.account||cached.projectId!==target.projectId||cached.kind!==media.kind||cached.fingerprint!==fingerprint)throw Error('即梦素材缓存身份不匹配，请核对原画布');
  const shown=await this.service.command(['node','show','--project-id',target.projectId,'--node-id',cached.nodeId]),node=shown.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===cached.nodeId)?.node;
  return node?.type===media.kind&&node.resources?.length===1&&node.resources[0].resourceId===cached.resourceId&&node.resources[0].type===media.kind&&node.resources[0].status==='success'?{kind:media.kind,name:media.name,nodeId:cached.nodeId,resourceId:cached.resourceId,fingerprint}:null;
 }
 async resolve(target,media){
  const fingerprint=hash(media.bytes),key=hash([target.account,target.projectId,media.kind,fingerprint].join(String.fromCharCode(0)));
  if(this.pending.has(key))return {...await this.pending.get(key),name:media.name};
  const work=this.resolveOnce(target,media,fingerprint,key).finally(()=>this.pending.delete(key));this.pending.set(key,work);return work;
 }
 async legacy(target,media,fingerprint){
  let entries;try{entries=await fs.readdir(this.service.dataDir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}
  for(const entry of entries){
   if(!entry.isDirectory()||['projects','_reference-cache'].includes(entry.name))continue;
   const dir=path.join(this.service.dataDir,entry.name),task=await this.service.read(dir);
   if(task?.account!==target.account||task.projectId!==target.projectId)continue;
   for(const [i,ref]of (task.references||[]).entries()){
    if(ref.kind!==media.kind||!ref.resourceId||!ref.nodeId)continue;
    const file=path.join(dir,'reference-'+i+'.'+media.ext);
    let bytes;try{if((await fs.stat(file)).size!==media.bytes.length)continue;bytes=await fs.readFile(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(hash(bytes)===fingerprint)return {...ref,status:'ready'};
   }
  }
  return null;
 }
 async resolveOnce(target,media,fingerprint,key){
  const s=this.service,dir=path.join(s.dataDir,'_reference-cache',key);
  let cached=await s.read(dir),fresh=!cached;
  if(cached&&(cached.account!==target.account||cached.projectId!==target.projectId||cached.kind!==media.kind||cached.fingerprint!==fingerprint))throw Error('即梦素材缓存身份不匹配，请核对原画布');
  if(!cached){
   const legacy=await this.legacy(target,media,fingerprint);
   cached={...(legacy||{resourceId:randomUUID(),nodeId:this.createNodeId(),updateId:randomUUID(),submitId:randomUUID(),status:'planned'}),account:target.account,projectId:target.projectId,kind:media.kind,name:media.name,fingerprint};
   await s.save(dir,cached);fresh=!legacy;
  }
  const result=()=>({kind:media.kind,name:media.name,resourceId:cached.resourceId,nodeId:cached.nodeId,updateId:cached.updateId,submitId:cached.submitId,fingerprint});
  if(!fresh){
   const shown=await s.command(['node','show','--project-id',target.projectId,'--node-id',cached.nodeId]);
   const node=shown.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===cached.nodeId)?.node;
   if(node?.type===media.kind&&node.resources?.[0]?.resourceId===cached.resourceId&&node.resources[0].type===media.kind&&node.resources[0].status==='success'){
    cached.status='ready';await s.save(dir,cached);return result();
   }
   if(cached.status==='ready'){
    // 用户删除或改动来源节点时，不覆盖它；保留原资源，另建一个来源节点。
    Object.assign(cached,{nodeId:this.createNodeId(),updateId:randomUUID(),submitId:randomUUID(),status:'uploaded'});await s.save(dir,cached);
   }
   if(cached.status!=='planned'){
    let resource;try{resource=await s.command(['resource','get',cached.resourceId,'--project-id',target.projectId]);}catch(error){
     // 上传未完成且原身份明确不存在：沿用官方 resource-id 幂等键恢复导入。
     if(cached.status!=='uploading'||error.code!=='service.6'||error.class!=='invalid_input')throw error;
     cached.status='planned';await s.save(dir,cached);
    }
    if(resource&&(resource.resourceId!==cached.resourceId||resource.type!==media.kind||resource.status!=='success'))throw Error('已登记的即梦参考素材尚不可用，原身份已保留，请核对画布后重试');
    if(resource){cached.status='uploaded';await s.save(dir,cached);}
   }
  }
  if(cached.status==='planned'){
   const file=path.join(dir,'reference.'+media.ext);await fs.writeFile(file,media.bytes);
   cached.status='uploading';await s.save(dir,cached);
   let uploaded;try{uploaded=await s.command(['resource','upload','--project-id',target.projectId,'--resource-id',cached.resourceId,'--type',media.kind,'--file',file,'--name',media.name]);}catch(error){
    if(error.retryable===true)error.message='即梦暂时无法上传「'+media.name+'」，素材身份已保留，可稍后继续原草稿（'+error.code+'）';
    throw error;
   }
   if(uploaded.resourceId!==cached.resourceId||uploaded.mediaType!==media.kind)throw Error('参考素材注册身份不匹配');
   cached.status='uploaded';await s.save(dir,cached);
  }
  const created=await s.command(['node','create',media.kind,'--project-id',target.projectId,'--node-id',cached.nodeId,'--update-id',cached.updateId,'--submit-id',cached.submitId,'--title',cached.name,'--resource-id',cached.resourceId,'--import-kind','local_upload']);
  if(created.node?.nodeId!==cached.nodeId)throw Error('参考素材节点身份不匹配');
  // 回读来源，既验证素材已就绪，也为响应丢失恢复保留稳定身份。
  const shown=await s.command(['node','show','--project-id',target.projectId,'--node-id',cached.nodeId]),node=shown.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===cached.nodeId)?.node;
  if(node?.type!==media.kind||node.resources?.[0]?.resourceId!==cached.resourceId||node.resources[0].type!==media.kind||node.resources[0].status!=='success')throw Error('参考素材节点尚未确认，原素材身份已保留');
  cached.status='ready';await s.save(dir,cached);return result();
 }
}
module.exports={DreaminaReferenceCache};
