const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assets = require('./asset-store');
const {IMAGE_EXT, AUDIO_EXT, FOLDER_ALIASES} = require('./project-assets');

const VIDEO_EXT = new Set(['.mp4','.mov','.webm','.mkv','.m4v','.avi']);
const REVIEW = ['none','in-progress','pending','approved','rejected'];
const tickets = new Map();
const mediaType = file => IMAGE_EXT.has(path.extname(file).toLowerCase()) ? 'image' : AUDIO_EXT.has(path.extname(file).toLowerCase()) ? 'audio' : VIDEO_EXT.has(path.extname(file).toLowerCase()) ? 'video' : '';
const slash = text => text.split(path.sep).join('/');
const keyOf = text => String(text).replace(/\\/g,'/').toLowerCase();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')); }
  catch { throw Error(`无法读取 ${path.basename(file)}，请修复文件后重试`); }
}
function metadataPath(root) {
  const base = fs.realpathSync(root), dir = path.join(base,'.studio');
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw Error('项目配置目录不能是链接');
  const file = path.join(dir,'library.json');
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('项目配置文件不能是链接');
  return file;
}
function readMetadata(root) {
  const value = readJson(metadataPath(root));
  if (!object(value) || (value.items !== undefined && !object(value.items))) throw Error('资产库配置格式无效');
  return {brief:'',items:{},...value};
}
function writeMetadata(root, value) {
  const file = metadataPath(root);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if (fs.existsSync(file)) fs.copyFileSync(file,file+'.bak');
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {fs.writeFileSync(temporary,JSON.stringify(value,null,2));fs.renameSync(temporary,file);}
  finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function localPath(root, value) {
  if (!value) return '';
  const relative = path.isAbsolute(value) ? path.relative(fs.realpathSync(root),value) : value;
  try {assets.inside(root,relative,false);return slash(relative);} catch {return '';}
}

// One project index joins files, references and generation records. It never fetches cloud media.
function list(root, analyzer) {
  const base = fs.realpathSync(root), metadata = readMetadata(base);
  const config = assets.read(base), state = readJson(path.join(base,'.typetale','workbench.json'));
  const source = (state.sourceText || (config.episodes || []).map(ep=>ep.source || '').join('\n') || (fs.existsSync(path.join(base,'.jimeng/draft.txt'))?fs.readFileSync(path.join(base,'.jimeng/draft.txt'),'utf8'):''));
  const collected = assets.collect(base,analyzer,source,{autoBind:false});
  const inputs = new Map(collected.assets.map(item=>[keyOf(item.relativePath),item]));
  const items = new Map(), folders = new Map(), warnings = [...collected.warnings];
  const addFolder = (id,title,parent='',kind='folder') => {if(!folders.has(id))folders.set(id,{id,title,parent,kind});return id;};
  const outputNames = new Set([...FOLDER_ALIASES.videoOutput,'typetale-output'].map(keyOf));
  const configuredOutput = config.folders?.videoOutput?.relativePath;
  const isOutput = relative => relative.split('/').some(part=>outputNames.has(keyOf(part))) || Boolean(configuredOutput && (keyOf(relative).startsWith(keyOf(configuredOutput)+'/')));
  function addFile(relative) {
    const type = mediaType(relative);if(!type)return null;
    const id = 'file:'+relative, file = assets.inside(base,relative), stat = fs.statSync(file);
    if(!stat.isFile())return null;
    const input = inputs.get(keyOf(relative)), patch = metadata.items[id] || {};
    const result = isOutput(relative) || type === 'video' || patch.output === true;
    const item = {id,relativePath:relative,sourcePath:input?.sourcePath,displayName:input?.displayName || path.basename(relative,path.extname(relative)),role:input?.role || '',audioPath:config.audioBindings?.[input?.role] || '',category:input?.kind || 'other',mediaType:type,source:result?'result':'element',size:stat.size,createdAt:stat.birthtime.toISOString(),updatedAt:stat.mtime.toISOString(),status:'none',elementStatus:'active',groupIds:[],...patch};
    const parts = relative.split('/').slice(0,-1);let parent='';
    parts.forEach((title,index)=>{const label=title==='@linked'?'已绑定文件夹':parts[0]==='@linked'&&index===1?(config.folderLinks||[]).find(link=>link.id===title)?.name||title:title;parent=addFolder('path:'+parts.slice(0,index+1).join('/'),label,parent);item.groupIds.push(parent);});
    items.set(id,item);return item;
  }
  function visit(dir) {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if(entry.name.startsWith('.') || entry.name==='node_modules' || entry.isSymbolicLink())continue;
      const file = path.join(dir,entry.name);
      try {if(entry.isDirectory())visit(file);else addFile(slash(path.relative(base,file)));}
      catch(error){warnings.push(`${entry.name}：${error.message}`);}
    }
  }
  if(config.workspace==='jimeng') {
    for(const asset of collected.assets) try{addFile(asset.relativePath);}catch(error){warnings.push(error.message);}
    return {name:config.name||path.basename(base),root:base,brief:metadata.brief,items:[...items.values()],folders:[...folders.values()],warnings,folderLinks:config.folderLinks||[],folderSelection:Boolean(config.folderSelection)};
  }
  visit(base);
  const addResult = (result, shot, group, parent, provider={}) => {
    const relative = localPath(base,result.path || result.outputPath), url = /^https?:\/\//i.test(result.url || result.resultUrl || '') ? result.url || result.resultUrl : '';
    if(!relative&&!url)return;
    const id = relative ? 'file:'+relative : 'remote:'+url;
    let item = items.get(id);
    if(!item) {
      item = {id,relativePath:relative,url,displayName:relative?path.basename(relative):`镜头 ${shot.id} · 云端结果`,mediaType:mediaType(relative || new URL(url).pathname) || 'video',source:'result',size:0,createdAt:result.createdAt || shot.updatedAt || '',status:'none',elementStatus:'active',groupIds:[],missing:Boolean(relative),...(metadata.items[id] || {})};
      items.set(id,item);
    }
    item.source='result';item.url ||= url;
    item.groupIds=[...new Set([...item.groupIds,parent,group])];
    item.shotId=String(shot.id || '');
    if(result.prompt!==undefined)item.prompt=result.prompt;
    item.model=result.model || item.model || '';item.provider=result.providerName || item.provider || '';
    item.createdAt=result.createdAt || item.createdAt;
  };
  const chapters = state.chapters || [];
  for(const shot of state.shots || []) {
    const chapter = chapters.find(ch=>ch.id===shot.chapterId);
    const parent = addFolder('chapter:'+(chapter?.id || 'ungrouped'),chapter?.name || chapter?.title || '未分章','','chapter');
    const group = addFolder('shot:'+shot.id,`镜头 ${shot.id}${shot.title?' · '+shot.title:''}`,parent,'shot');
    const provider = (state.providers || []).find(p=>p.id===shot.providerId) || {};
    const history = [...(shot.results || [])];
    if(shot.outputPath || shot.resultUrl)history.push({path:shot.outputPath,url:shot.resultUrl});
    for(const result of history)addResult(result,shot,group,parent,provider);
    // Existing plugin outputs have a documented viewer index in their file name.
    const prefix=String(shot.viewerIndex || Number(shot.id)).padStart(4,'0')+'_';
    for(const item of items.values())if(item.source==='result'&&item.relativePath?.startsWith('typetale-output/')&&path.basename(item.relativePath).startsWith(prefix))addResult({path:item.relativePath},shot,group,parent,provider);
  }
  const jobs=state.jobs || [];
  for(const job of jobs){const shot=(state.shots || []).find(s=>s.id===job.shotId);if(shot&&(job.outputPath||job.resultUrl))addResult({path:job.outputPath,url:job.resultUrl,createdAt:job.updatedAt,...(job.prompt?{prompt:job.prompt,model:job.model,providerName:job.providerName}:{})},shot,'shot:'+shot.id,'chapter:'+(shot.chapterId||'ungrouped'),(state.providers || []).find(p=>p.id===job.providerId));}
  const episodes = config.episodes?.length ? config.episodes : state.shots?.length ? [] : [{id:'ep1',name:'第1集',source:'',segments:[]}];
  episodes.forEach((episode,epIndex)=>{
    const parent=addFolder('episode:'+episode.id,episode.name || '分集','','episode');
    const segments=episode.segments?.length?episode.segments:assets.splitSourceSegments(episode.source || '');
    segments.forEach((segment,index)=>{
      const group=addFolder(`video:${episode.id}:${segment.id}:${index}`,`视频 ${segment.id}${segment.name?' · '+segment.name:''}`,parent,'shot');
      const bindingKey=`${epIndex?'ep:'+episode.id+':':''}video:${segment.id}:${index}`;
      const refs=config.segmentAssetBindings?.[bindingKey] || {};
      const paths=[...Object.values(refs).flat(),...Object.values(config.segmentCharacterBindings?.[bindingKey] || {}),...Object.values(config.segmentAudioBindings?.[bindingKey] || {})].filter(p=>typeof p==='string');
      for(const relative of paths){const item=items.get('file:'+relative);if(item)item.groupIds=[...new Set([...item.groupIds,parent,group])];}
      for(const result of segment.results || [])addResult(result,segment,group,parent);
    });
  });
  for(const item of items.values()) {
    const patch=metadata.items[item.id] || {}, manual=patch.folderId;
    if(Object.hasOwn(patch,'folderId'))item.groupIds=item.groupIds.filter(id=>id.startsWith('path:'));
    if(manual&&folders.has(manual)){item.groupIds.push(manual);let folder=folders.get(manual);while(folder?.parent){item.groupIds.push(folder.parent);folder=folders.get(folder.parent);}}
    item.groupIds=[...new Set(item.groupIds)];
  }
  return {name:config.name || path.basename(base),root:base,brief:metadata.brief,items:[...items.values()],folders:[...folders.values()],warnings};
}
function edit(root, ids, patch) {
  if(!Array.isArray(ids)||!ids.length||ids.length>1000)throw Error('请选择资产');
  if(!object(patch))throw Error('编辑内容无效');
  const value=readMetadata(root), changes={};
  if(patch.status!==undefined){if(!REVIEW.includes(patch.status))throw Error('无效审片状态');changes.status=patch.status;}
  if(patch.elementStatus!==undefined){if(!['active','draft'].includes(patch.elementStatus))throw Error('无效元素状态');changes.elementStatus=patch.elementStatus;}
  if(patch.folderId!==undefined){if(typeof patch.folderId!=='string'||patch.folderId.length>500)throw Error('无效文件夹');changes.folderId=patch.folderId;}
  for(const id of ids){
    if(typeof id!=='string'||(!id.startsWith('file:')&&!id.startsWith('remote:http')))throw Error('无效资产');
    if(id.startsWith('file:'))assets.inside(root,id.slice(5),false);
    value.items[id]={...value.items[id],...changes};
  }
  writeMetadata(root,value);return {updated:ids.length};
}
function saveBrief(root,text) {
  if(typeof text!=='string'||text.length>200000)throw Error('项目简介最多 20 万字');
  const value=readMetadata(root);value.brief=text;writeMetadata(root,value);return {saved:true};
}
function importResults(root, files, folderId='') {
  const copied=[], value=readMetadata(root);
  for(const source of files) {
    if(!mediaType(source)||!fs.statSync(source).isFile())throw Error('请选择图片、音频或视频文件');
    const stem=path.basename(source,path.extname(source)), ext=path.extname(source);
    const dir=assets.inside(root,'视频素材',false);fs.mkdirSync(dir,{recursive:true});
    let name=stem+ext,n=1;while(fs.existsSync(path.join(dir,name)))name=`${stem}-${n++}${ext}`;
    const relative='视频素材/'+name;fs.copyFileSync(source,assets.inside(root,relative,false),fs.constants.COPYFILE_EXCL);
    const id='file:'+relative;value.items[id]={output:true,folderId};copied.push(relative);
  }
  writeMetadata(root,value);return {added:copied};
}
function exportFiles(root, relatives, destination) {
  if(!Array.isArray(relatives)||!relatives.length||relatives.length>1000)throw Error('请选择本地资产');
  const sources=[...new Set(relatives)].map(relative=>({relative,file:assets.inside(root,relative)}));
  if(sources.some(item=>!mediaType(item.file)||!fs.statSync(item.file).isFile()))throw Error('只支持导出媒体文件');
  const target=fs.realpathSync(destination), exported=[];
  for(const {relative,file} of sources){const ext=path.extname(file),stem=path.basename(file,ext);let name=stem+ext,n=1;while(fs.existsSync(path.join(target,name)))name=`${stem}-${n++}${ext}`;fs.copyFileSync(file,path.join(target,name),fs.constants.COPYFILE_EXCL);exported.push({relative,name});}
  return {exported:exported.length,destination:target};
}
function preview(root,relative,origin='http://127.0.0.1:17842') {
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('预览服务地址无效');
  const file=assets.inside(root,relative);if(!mediaType(file)||!fs.statSync(file).isFile())throw Error('只能预览项目内媒体');
  const token=crypto.randomBytes(24).toString('hex');
  for(const [id,ticket] of tickets)if(ticket.expires<Date.now())tickets.delete(id);
  while(tickets.size>=200)tickets.delete(tickets.keys().next().value);
  tickets.set(token,{root:fs.realpathSync(root),relative,expires:Date.now()+30*60*1000});
  return {preview:origin+'/workbench/media/'+token};
}
function serveMedia(req,res,token) {
  const ticket=tickets.get(token);if(!ticket||ticket.expires<Date.now()){res.writeHead(404);res.end();return;}
  let file;try{file=assets.inside(ticket.root,ticket.relative);}catch{res.writeHead(404);res.end();return;}
  const stat=fs.statSync(file), ext=path.extname(file).toLowerCase();
  const mime={'.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.flac':'audio/flac','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[ext] || 'application/octet-stream';
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}start=m[1]?Number(m[1]):Math.max(0,stat.size-Number(m[2]));end=m[1]&&m[2]?Math.min(Number(m[2]),end):end;if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}status=206;}
  const headers={'Content-Type':mime,'Content-Length':Math.max(0,end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  res.writeHead(status,headers);if(req.method==='HEAD'||!stat.size){res.end();return;}
  const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
module.exports={list,edit,saveBrief,importResults,exportFiles,preview,serveMedia,mediaType};
