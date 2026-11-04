const path=require('path');
const fs=require('fs');
const store=require('./asset-store');
const library=require('./project-library');
const {IMAGE_EXT,AUDIO_EXT}=require('./project-assets');
function createActions({dialog,nativeImage,getWindow,analyzer,getMediaOrigin}) {
  const actions={};
  actions.list=(root,source)=>store.collect(root,analyzer,source);
  actions.linkFolder=async(root,kind)=>{
    if(!['characters','scenes','props','audio'].includes(kind)) throw Error('无效素材分类');
    const result=await dialog.showOpenDialog(getWindow(),{title:'绑定原素材文件夹（只建索引，不复制文件）',properties:['openDirectory']});
    return result.canceled?{canceled:true}:{config:store.linkFolder(root,kind,result.filePaths[0])};
  };
  actions.linkFiles=async(root,kind)=>{
    if(!['characters','scenes','props','audio'].includes(kind)) throw Error('无效素材分类');
    const extensions=[...(kind==='audio'?AUDIO_EXT:IMAGE_EXT)].map(ext=>ext.slice(1));
    const result=await dialog.showOpenDialog(getWindow(),{title:'选择原素材（只引用，不复制）',properties:['openFile','multiSelections'],filters:[{name:kind==='audio'?'音频':'图片',extensions}]});
    return result.canceled?{canceled:true}:{config:store.linkFiles(root,kind,result.filePaths)};
  };
  // 拖入的绝对路径按扩展名/目录名归入对应分类，逐类建引用，仍不复制文件。
  actions.linkPaths=(root,kind,paths)=>{
    const groups={};let skipped=0;
    for(const source of Array.isArray(paths)?paths:[]){
      const ext=path.extname(String(source||'')).toLowerCase();
      let target=null;
      if(AUDIO_EXT.has(ext))target='audio';
      else if(IMAGE_EXT.has(ext)){
        target=['characters','scenes','props'].includes(kind)?kind:store.inferCategory(source,'auto');
        if(!['characters','scenes','props'].includes(target))target='characters';
      }else{skipped++;continue;}
      (groups[target]||=[]).push(source);
    }
    let config;
    for(const [target,files]of Object.entries(groups))config=store.linkFiles(root,target,files);
    return {config,linked:Object.values(groups).flat().length,skipped};
  };
  actions.clearReferences=(root,relatives)=>store.clearReferences(root,relatives,analyzer);
  actions.unlinkFolder=(root,id)=>({config:store.unlinkFolder(root,id)});
  actions.libraryList=root=>library.list(root,analyzer);
  actions.libraryEdit=(root,ids,patch)=>library.edit(root,ids,patch);
  actions.libraryBrief=(root,text)=>library.saveBrief(root,text);
  actions.libraryPreview=(root,relative)=>library.preview(root,relative,getMediaOrigin?.());
  actions.libraryImport=async(root,folderId)=>{
    const result=await dialog.showOpenDialog(getWindow(),{title:'导入生成结果到当前项目（复制文件）',properties:['openFile','multiSelections'],filters:[{name:'媒体文件',extensions:['png','jpg','jpeg','webp','bmp','gif','mp4','mov','webm','mkv','m4v','avi','mp3','wav','m4a','ogg','flac','aac']}]});
    return result.canceled?{canceled:true}:library.importResults(root,result.filePaths,folderId);
  };
  actions.libraryExport=async(root,relatives)=>{
    const result=await dialog.showOpenDialog(getWindow(),{title:'选择资产导出目录',properties:['openDirectory','createDirectory']});
    return result.canceled?{canceled:true}:library.exportFiles(root,relatives,result.filePaths[0]);
  };
  actions.edit=(root,relative,patch)=>({config:store.edit(root,relative,patch)});
  actions.bind=(root,key,zone,relative,remove)=>({config:store.bind(root,key,zone,relative,remove)});
  actions.bindCharacter=(root,key,role,relative,remove,disable)=>({config:store.bindCharacter(root,key,role,relative,remove,disable)});
  actions.bindSegmentAudio=(root,key,role,relative,disable)=>({config:store.bindSegmentAudio(root,key,role,relative,disable)});
  actions.audioPreview=async(root,relative)=>{
    const file=store.inside(root,relative),ext=path.extname(file).toLowerCase();
    if(!AUDIO_EXT.has(ext))throw Error('只能试听音频素材');
    const stat=await fs.promises.stat(file);
    if(stat.size>20*1024*1024)throw Error('试听支持 20MB 以内的音频');
    const mime={'.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.flac':'audio/flac','.aac':'audio/aac'}[ext]||'application/octet-stream';
    return {preview:`data:${mime};base64,${(await fs.promises.readFile(file)).toString('base64')}`};
  };
  actions.import=async(root,category)=>{
    const result=await dialog.showOpenDialog(getWindow(),{title:'添加图片或音频到当前项目（复制原文件）',properties:['openFile','multiSelections'],filters:[{name:'图片或音频',extensions:[...IMAGE_EXT,...AUDIO_EXT].map(e=>e.slice(1))}]});
    return {added:result.canceled?[]:store.importImages(root,result.filePaths,category)};
  };
  actions.importPaths=(root,paths)=>({added:store.importImages(root,Array.isArray(paths)?paths:[],'auto')});
  actions.delete=async(root,relative)=>{
    const file=store.inside(root,relative);
    const choice=await dialog.showMessageBox(getWindow(),{type:'warning',title:'从磁盘删除素材',message:`删除 ${path.basename(file)}？`,detail:`将从磁盘永久删除，无法撤销。\n${file}\n此项目内的分镜及音频引用也会移除。`,buttons:['取消','从磁盘删除'],defaultId:0,cancelId:0,noLink:true});
    if(choice.response!==1)return {deleted:false};
    store.removeFile(root,relative); return {deleted:true};
  };
  // OS thumbnail extraction is asynchronous. Only compressed previews reach the renderer.
  const cache=new Map(), pending=new Map(), waiting=[]; let active=0;
  const pump=()=>{while(active<2&&waiting.length){active++; const job=waiting.shift();job().finally(()=>{active--;pump();});}};
  actions.thumb=async(root,relative,size)=>{
    const file=store.inside(root,relative); if(!['image','video'].includes(library.mediaType(file)))throw Error('非图片或视频');
    const dim=size===512?512:160;
    const stat=fs.statSync(file), key=file+':'+stat.mtimeMs+':'+stat.size+':'+dim;
    if(cache.has(key))return {preview:cache.get(key)};
    if(!pending.has(key)) {
      const task=new Promise((resolve,reject)=>{waiting.push(async()=>{try{
        const img=await nativeImage.createThumbnailFromPath(file,{width:dim,height:dim});
        if(img.isEmpty())throw Error('无法生成缩略图');
        const preview='data:image/jpeg;base64,'+img.toJPEG(dim===512?82:72).toString('base64');
        cache.set(key,preview);while(cache.size>120)cache.delete(cache.keys().next().value);
        resolve(preview);
      }catch(e){reject(e);}finally{pending.delete(key);}});});
      pending.set(key,task);pump();
    }
    return {preview:await pending.get(key)};
  };
  // 点击放大时才读这一张原图，读完即走，不进缓存——任何时刻内存里只有一张大图。
  actions.fullImage=async(root,relative)=>{
    const file=store.inside(root,relative);
    const extension=path.extname(file).toLowerCase();
    if(!IMAGE_EXT.has(extension))throw Error('非图片');
    const stat=fs.statSync(file);
    if(stat.size>40*1024*1024)throw Error('原图超过 40MB，已跳过放大预览');
    const mime=({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp','.gif':'image/gif'})[extension]||'application/octet-stream';
    return {image:`data:${mime};base64,`+fs.readFileSync(file).toString('base64'),bytes:stat.size};
  };
  return actions;
}
function register(options) {
  const {ipcMain,getWindow}=options;
  const actions=createActions(options);
  const handle=(name,fn)=>ipcMain.handle('assets:'+name,async(event,...args)=>{
    if(event.sender!==getWindow()?.webContents) return {ok:false,error:'非工作台请求'};
    try {return {ok:true,...await fn(...args)};} catch(e) {return {ok:false,error:e.message};}
  });
  for(const [name,action] of Object.entries(actions)) handle(name,action);
  return actions;
}
module.exports={register,createActions};
