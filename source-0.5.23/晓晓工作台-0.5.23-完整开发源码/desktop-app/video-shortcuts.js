const fs=require('node:fs'),path=require('node:path');
class VideoShortcuts{
 constructor({file,videos,shell,choose}){Object.assign(this,{file,videos,shell,choose});this.queue=Promise.resolve();}
 read(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
 create(payload){const work=this.queue.then(()=>this.createOnce(payload));this.queue=work.catch(()=>{});return work;}
 async createOnce({projectId,ids}){
  this.videos.id(projectId);if(!Array.isArray(ids)||!ids.length||ids.length>2000)throw Error('请选择已完成的视频');
  const sources=[...new Set(ids)].map(id=>{const video=this.videos.videoInfo({projectId,videoId:id});if(!video)throw Error('视频尚未保存到工作台，请先等待归档完成');if(!fs.statSync(video.path).isFile())throw Error('原视频不是可读取文件');return {id,target:fs.realpathSync(video.path)};});
  const settings=this.read(),last=settings[projectId]?.directory;const selected=await this.choose(last);if(!selected)return {canceled:true,created:0};
  const directory=fs.realpathSync(selected);if(!fs.statSync(directory).isDirectory())throw Error('请选择文件夹');
  let created=0,existing=0;for(const source of sources){const stem=path.basename(source.target,path.extname(source.target));let n=0,file;for(;;){file=path.join(directory,stem+(n?' ('+n+')':'')+'.lnk');if(!fs.existsSync(file))break;try{if(path.resolve(this.shell.readShortcutLink(file).target)===path.resolve(source.target)){existing++;file=null;break;}}catch{}n++;}
   if(!file)continue;if(!this.shell.writeShortcutLink(file,'create',{target:source.target,cwd:path.dirname(source.target),description:'晓晓工作台视频快捷方式；原视频保留在工作台'}))throw Error('创建视频快捷方式失败：'+file);created++;
  }
  fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({...settings,[projectId]:{directory}}));fs.renameSync(this.file+'.tmp',this.file);
  return {path:directory,created,existing,canceled:false};
 }
}
module.exports={VideoShortcuts};
