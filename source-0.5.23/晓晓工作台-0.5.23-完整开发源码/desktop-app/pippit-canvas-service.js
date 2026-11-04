const {cliEnvironment}=require('./workbench-storage');
const fs=require('node:fs/promises'),path=require('node:path'),{promisify}=require('node:util'),{execFile}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const runFile=promisify(execFile);
class PippitCanvasService {
  constructor({pippit,dataDir,canvasEntry,nodeExecutable=process.execPath,execute=runFile}){Object.assign(this,{pippit,dataDir,canvasEntry,nodeExecutable,execute});this.queue=Promise.resolve();}
  key(value){if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(value))throw Error('无效的视频项目 ID');return value;}
  async read(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
  async save(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value));await fs.rename(tmp,file);}
  async settings(projectKey){this.key(projectKey);const config=await this.read(path.join(this.dataDir,'targets.json'),{});return {target:config[projectKey]||null,lastReport:await this.read(path.join(this.dataDir,projectKey+'-report.json'),null)};}
  async semantic(name,canvasId,input={}){
    const file=path.join(this.dataDir,'requests',randomUUID()+'.json');await this.save(file,input);
    try{const {stdout}=await this.execute(this.nodeExecutable,[this.canvasEntry,this.pippit.executable,'canvas','command','run',name,'--canvas-id',canvasId,'--file',file,'--team-id','0'],{windowsHide:true,timeout:120000,maxBuffer:16*1024*1024,env:{...cliEnvironment(),ELECTRON_RUN_AS_NODE:'1',PIPPIT_CLI_DISABLE_UPDATE_CHECK:'1'}});const result=JSON.parse(stdout.trim());if(result.ok!==true)throw Error(result.message||result.error?.message||result.error||'画布操作未成功');return result;}
    catch(error){
      // SDK transaction logs include an entire stack on stderr; the public result
      // carries the useful reason on stdout, even when the CLI exits with code 1.
      let result;try{result=JSON.parse(String(error.stdout||'').trim());}catch{}
      if(result?.ok===false&&typeof result.message==='string')throw Error(result.message);
      const unresolved=/UNRESOLVED_PROMPT_REFERENCE: ([0-9]+)/.exec(String(error.stderr||error.message||''));
      if(unresolved)throw Error('画布提示词引用无法解析，素材节点：'+unresolved[1]);
      throw Error(String(error.message||'画布操作失败').trim());
    }finally{await fs.unlink(file).catch(()=>{});}
  }
  async nodeAsset(id){
    if(typeof id!=='string'||!/^\d+$/.test(id))throw Error('无效的画布资产 ID');
    const result=await this.pippit.command(['canvas','get','--asset-id',id]);
    const entry=result.assets?.find(a=>String(a.PippitAssetID)===id);
    if(!entry)return null;
    const text=entry.TextInfo?.content;if(typeof text!=='string'||!text.trim())return null;
    let asset;try{asset=JSON.parse(text);}catch{throw Error('官网节点资产正文无效，请核对画布');}
    if(asset?.pippitAssetId!==id)throw Error('官网节点资产身份不匹配');return asset;
  }
  async snapshot(target){const result=await this.semantic('get_snapshot',target.canvasId);const doc=result.data?.document,root=doc?.assets?.[target.canvasId];if(doc?.rootCanvasId!==target.canvasId||root?.type!=='canvas'||String(root.content?.metadata?.projectId)!==target.projectId)throw Error('目标项目与画布不匹配，已停止同步');return doc;}
  async configure({projectKey,url,auto=true}){
    this.key(projectKey);const parsed=new URL(url);if(parsed.protocol!=='https:'||!['xyq.jianying.com','www.xiaoyunque.com','xiaoyunque.com'].includes(parsed.hostname)||parsed.pathname!=='/project')throw Error('请填写小云雀官网画布链接');
    const projectId=parsed.searchParams.get('projectId'),canvasId=parsed.searchParams.get('canvasId');if(!/^\d+$/.test(projectId||'')||!/^\d+$/.test(canvasId||''))throw Error('链接缺少项目或画布 ID');
    const target={projectId,canvasId,url:'https://xyq.jianying.com/project?projectId='+projectId+'&canvasId='+canvasId,auto:Boolean(auto)},doc=await this.snapshot(target);target.title=doc.assets[canvasId].content.metadata.title||'小云雀画布';
    const file=path.join(this.dataDir,'targets.json'),config=await this.read(file,{});await this.save(file,{...config,[projectKey]:target});return this.settings(projectKey);
  }
  journal(scope,canvasId,taskId,index){return path.join(this.dataDir,'records',createHash('sha256').update(JSON.stringify([scope,canvasId,taskId,index])).digest('hex')+'.json');}
  media(upload){const video=upload.asset?.Video,meta=video?.metadata;if(!upload.pippit_asset_id||!upload.asset_id||!meta?.width||!meta.height||!meta.duration_ms)throw Error('上传视频缺少可播放的媒体信息，请回查素材');return {pippitAssetId:String(upload.pippit_asset_id),assetId:String(video.asset_id||upload.asset_id),vid:video.vid||upload.locator?.vid,frameWidth:meta.width,frameHeight:meta.height,durationMs:meta.duration_ms,metadata:{width:meta.width,height:meta.height,durationMs:meta.duration_ms,durationMS:meta.duration_ms,format:'video'}};}
  async sync({projectKey,items,automatic=false}){
    this.key(projectKey);if(!Array.isArray(items)||items.length>2000)throw Error('视频同步列表无效');
    const target=(await this.settings(projectKey)).target;if(!target||(automatic&&!target.auto))return {synced:0,skipped:0,failed:0,errors:[],disabled:true};
    const work=async()=>{
      const report={synced:0,skipped:0,failed:0,errors:[]};
      const auth=await this.pippit.command(['status']);if(!auth.logged_in||!auth.credential_scope)throw Error('请先完成小云雀网页登录授权');
      for(const item of items){try{
        const dir=this.pippit.taskDir(item.taskId),task=await this.pippit.read(dir);if(task?.type!=='video'||task.status!=='completed'||!task.result?.completed||!task.result.videos?.length)throw Error('该任务没有已下载的小云雀视频');
        for(const [index,entry] of task.result.videos.entries()){
          const outputRoot=await fs.realpath(path.join(dir,'output')),source=await fs.realpath(path.resolve(entry.output_path||'')),relative=path.relative(outputRoot,source);
          if(relative.startsWith('..')||path.isAbsolute(relative)||!['.mp4','.webm','.mov','.avi','.mkv','.m4v','.wmv','.flv'].includes(path.extname(source).toLowerCase()))throw Error('视频不属于原生成任务');
          const size=(await fs.stat(source)).size;if(!size||size>=500000000)throw Error('视频为空或超过小云雀上传限制');
          const file=this.journal(auth.credential_scope,target.canvasId,item.taskId,index);let record=await this.read(file,{}),doc=await this.snapshot(target);
          if(record.nodeId&&doc.assets[record.nodeId]){
            if(doc.assets[record.nodeId].type!=='biz/video'||doc.assets[record.nodeId].content?.pippitAssetId!==record.media?.pippitAssetId)throw Error('原同步节点已变更，请核对画布');
            await this.save(file,{...record,phase:'confirmed'});report.skipped++;continue;
          }
          if(record.phase==='uploading'&&record.uploadedAssetId){
            const known=await this.pippit.command(['canvas','get','--asset-id',String(record.uploadedAssetId)]),asset=known.assets?.find(a=>String(a.PippitAssetID)===String(record.uploadedAssetId));
            record.media=this.media({pippit_asset_id:asset?.PippitAssetID,asset_id:asset?.Video?.asset_id,asset});record.phase='uploaded';await this.save(file,record);
          }
          if(['uploading','submitting'].includes(record.phase))throw Error('上次同步结果未确认，已阻止重复写入，请核对画布');
          if(!record.media){
            record={phase:'uploading',taskId:item.taskId,index,canvasId:target.canvasId};await this.save(file,record);
            const upload=await this.pippit.command(['canvas','upload','--path',source],300000);record.uploadedAssetId=upload.pippit_asset_id;await this.save(file,record);
            if(upload.state!=='ready')throw Error('素材仍在处理，请稍后核对；不会重复上传');record.media=this.media(upload);record.phase='uploaded';await this.save(file,record);
          }
          if(!record.nodeId){const reserved=await this.pippit.command(['canvas','allocate','--count','1']);record.nodeId=reserved.asset_ids?.[0];if(typeof record.nodeId!=='string'||!/^\d+$/.test(record.nodeId))throw Error('画布未返回有效节点 ID');await this.save(file,record);}
          const nodes=Object.values(doc.assets[target.canvasId].content.nodes||{}),bottom=Math.max(0,...nodes.map(n=>n.y+n.h));
          const input={nodeKind:'video',id:record.nodeId,center:{x:0,y:bottom+240},initialData:{...record.media,name:String(item.title||'工作台生成视频').slice(0,100),source:'uploaded',uploadPath:'optimized',playback:{muted:true}}};
          record.phase='submitting';await this.save(file,record);
          try{await this.semantic('create_biz_node',target.canvasId,input);}catch(error){const check=await this.snapshot(target).catch(()=>null);if(!check?.assets[record.nodeId])throw error;}
          const verified=await this.snapshot(target),asset=verified.assets[record.nodeId],node=verified.assets[target.canvasId].content.nodes?.[record.nodeId];
          if(asset?.type!=='biz/video'||asset.content?.pippitAssetId!==record.media.pippitAssetId||!node)throw Error('画布写入尚未确认，请核对；不会重复写入');
          record.phase='confirmed';await this.save(file,record);report.synced++;
        }
      }catch(error){report.failed++;report.errors.push({taskId:item.taskId,error:error.message});}}
      await this.save(path.join(this.dataDir,projectKey+'-report.json'),report);return report;
    };
    const pending=this.queue.then(work);this.queue=pending.catch(()=>{});return pending;
  }
}
module.exports={PippitCanvasService};
