const fs = require('fs');
const path = require('path');

const VIDEO_MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const TASK_PREFIX_RE = /^(?:dreamina-canvas|dreamina-legacy-agent|dreamina|pippit-canvas|pippit|oiioii):/;

// Only studio-owned copies live here. References and CLI credentials never enter this tree.
class VideoStudioFiles {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
    const originOpt = typeof options === 'function' ? options : options?.origin;
    this.origin = typeof originOpt === 'function' ? originOpt : () => String(originOpt || 'http://127.0.0.1:17842');
    this.userDataDir = options?.userDataDir ? path.resolve(options.userDataDir) : path.resolve(this.root, '..', '..');
  }
  guardInside(base, file) {
    const rootDir = path.resolve(base), resolved = path.resolve(file), relative = path.relative(rootDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('路径超出允许目录');
    let cursor = resolved;
    while (cursor !== path.dirname(cursor)) {
      if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw Error('视频目录不能是链接');
      if (cursor === rootDir) break;
      cursor = path.dirname(cursor);
    }
    return resolved;
  }
  guard(file) {
    const resolved=path.resolve(file), relative=path.relative(this.root,resolved);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('路径超出视频创作台目录');
    let cursor=resolved;
    while(cursor!==path.dirname(cursor)) { if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('视频目录不能是链接'); if(cursor===this.root)break;cursor=path.dirname(cursor); }
    return resolved;
  }
  id(value) { if(typeof value!=='string'||!/^[-\w]{1,100}$/.test(value))throw Error('无效的视频项目标识');return value; }
  name(value) {
    const name=String(value||'').trim();
    if(!name||name.length>100||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||name==='.'||name==='..'||name.toLowerCase().startsWith('.studio'))throw Error('名称不能包含 Windows 路径保留字符或保留名称');
    return name;
  }
  index() { const file=this.guard(path.join(this.root,'.studio-index.json'));return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{}; }
  saveIndex(index) { this.atomic(path.join(this.root,'.studio-index.json'),index); }
  atomic(file,value) { this.guard(file);fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file); }
  record(id) {
    this.id(id);const folder=this.index()[id];if(!folder)throw Error('视频项目尚未建立本地目录');
    const directory=this.guard(path.join(this.root,folder));
    return {directory, data:JSON.parse(fs.readFileSync(this.guard(path.join(directory,'.studio-project.json')),'utf8'))};
  }
  free(directory,name) { let file=this.guard(path.join(directory,name)), n=1;const ext=path.extname(name),stem=path.basename(name,ext);while(fs.existsSync(file))file=this.guard(path.join(directory,stem+' ('+(n++)+')'+ext));return file; }
  sync(project) {
    const id=this.id(project.id),name=this.name(project.name),index=this.index();
    const folders=project.folders||[], ids=new Set(), names=new Set(), locations={};
    for(const f of folders){this.id(f.id);this.name(f.name);if(ids.has(f.id))throw Error('重复文件夹');ids.add(f.id);const key=(f.parentId+'|'+f.name).toLowerCase();if(names.has(key))throw Error('同一位置已有同名文件夹');names.add(key);}
    const relative=(id,chain=[])=>{if(!id)return '';if(chain.includes(id))throw Error('文件夹不能相互包含');const f=folders.find(f=>f.id===id);if(!f)throw Error('文件夹的上级不存在');return path.join(relative(f.parentId,[...chain,id]),f.name);};
    for(const f of folders)locations[f.id]=relative(f.id);
    let directory=index[id]?this.guard(path.join(this.root,index[id])):this.free(this.root,name);
    const existing=fs.existsSync(path.join(directory,'.studio-project.json'));
    if(existing && project.change===false){const record=this.record(id);for(const location of Object.values(record.data.locations))fs.mkdirSync(this.guard(path.join(record.directory,location)),{recursive:true});return {path:record.directory,folders:record.data.locations};}
    let data=existing?this.record(id).data:{id,name,folders:[],locations:{},videos:{}};
    const previous=JSON.parse(JSON.stringify(data)), previousIndex={...index};let committed=false;
    const undo=[];
    const mkdir=dir=>{this.guard(dir);if(!fs.existsSync(dir)){mkdir(path.dirname(dir));fs.mkdirSync(dir);undo.push(()=>fs.rmdirSync(dir));}};
    const move=(a,b)=>{this.guard(a);this.guard(b);if(a===b)return;if(fs.existsSync(b))throw Error('目标目录已有同名文件：'+path.basename(b));fs.renameSync(a,b);undo.push(()=>fs.renameSync(b,a));};
    try {
      if(existing && data.name!==name){const dest=this.guard(path.join(this.root,name));move(directory,dest);directory=dest;}
      mkdir(directory);
      const old={...data.locations};
      for(const [fid,dest] of Object.entries(locations).sort((a,b)=>a[1].split(path.sep).length-b[1].split(path.sep).length)) {
        const source=old[fid];if(source&&source!==dest&&fs.existsSync(path.join(directory,source))){mkdir(path.dirname(path.join(directory,dest)));move(path.join(directory,source),path.join(directory,dest));for(const key of Object.keys(old))if(old[key]===source||old[key].startsWith(source+path.sep))old[key]=dest+old[key].slice(source.length);for(const video of Object.values(data.videos))if(video.file.startsWith(source+path.sep))video.file=dest+video.file.slice(source.length);}
        else mkdir(path.join(directory,dest));
      }
      const removed=Object.keys(old).filter(fid=>!(fid in locations));
      const flatten=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=this.guard(path.join(dir,item.name));if(item.isDirectory())flatten(file);else{const dest=this.free(directory,item.name);move(file,dest);for(const video of Object.values(data.videos))if(path.join(directory,video.file)===file){video.file=path.basename(dest);video.folderId='';}}}fs.rmdirSync(dir);undo.push(()=>fs.mkdirSync(dir));};
      for(const fid of removed.sort((a,b)=>old[b].length-old[a].length)){const dir=path.join(directory,old[fid]);if(fs.existsSync(dir))flatten(dir);}
      data={...data,name,folders,locations};this.atomic(path.join(directory,'.studio-project.json'),data);committed=true;index[id]=path.basename(directory);this.saveIndex(index);
      return {path:directory,folders:locations};
    }catch(error){
      const rollbackErrors=[];
      if(!existing && committed){try{fs.unlinkSync(this.guard(path.join(directory,'.studio-project.json')));}catch(e){rollbackErrors.push(e);}}
      for(const revert of undo.reverse()){try{revert();}catch(e){rollbackErrors.push(e);}}
      if(existing && committed){try{this.atomic(path.join(this.root,previousIndex[id],'.studio-project.json'),previous);}catch(e){rollbackErrors.push(e);}}
      try{this.atomic(path.join(this.root,'.studio-index.json'),previousIndex);}catch(e){rollbackErrors.push(e);}
      if(rollbackErrors.length)throw new AggregateError([error,...rollbackErrors],'目录更新失败，部分回退未完成：'+error.message);
      throw error;
    }
  }
  videoUrl(projectId, videoId, version = 0) {
    const suffix = version ? '?v=' + Math.trunc(version) : '';
    return this.origin() + '/workbench/studio-video/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(videoId) + suffix;
  }
  videoInfo({projectId,videoId}) {
    const {directory,data}=this.record(projectId);
    const video=data.videos[this.id(videoId)];
    if (!video) return null;
    const file=this.guard(path.join(directory,video.file));
    if (!fs.existsSync(file)) return null;
    const stat=fs.statSync(file);
    if (!stat.isFile()) return null;
    return {path:file,folderId:video.folderId,projectId,bytes:stat.size,url:this.videoUrl(projectId,videoId,stat.mtimeMs)};
  }
  resolveTaskVideo(taskId) {
    const rawId = String(taskId || '').replace(TASK_PREFIX_RE, '').trim();
    if (!rawId || !/^[-\w]{1,120}$/.test(rawId) || !this.userDataDir || !fs.existsSync(this.userDataDir)) return null;
    const candidateDirs = [
      path.join(this.userDataDir, 'dreamina', rawId, 'output'),
      path.join(this.userDataDir, 'pippit', rawId, 'output'),
      path.join(this.userDataDir, 'oiioii', 'tasks', rawId, 'output'),
    ];
    const accountsRoot = path.join(this.userDataDir, 'dreamina-canvas', 'accounts');
    try {
      if (fs.existsSync(accountsRoot) && !fs.lstatSync(accountsRoot).isSymbolicLink()) {
        for (const entry of fs.readdirSync(accountsRoot, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.isSymbolicLink() && /^[-\w]{1,120}$/.test(entry.name)) {
            candidateDirs.push(path.join(accountsRoot, entry.name, rawId, 'output'));
          }
        }
      }
    } catch { /* ignore unreadable account dir */ }
    for (const dir of candidateDirs) {
      try {
        const safeDir = this.guardInside(this.userDataDir, dir);
        if (!fs.existsSync(safeDir) || !fs.statSync(safeDir).isDirectory()) continue;
        for (const item of fs.readdirSync(safeDir, { withFileTypes: true })) {
          if (!item.isFile() || item.isSymbolicLink()) continue;
          const ext = path.extname(item.name).toLowerCase();
          if (!(ext in VIDEO_MIME)) continue;
          const file = this.guardInside(this.userDataDir, path.join(safeDir, item.name));
          const stat = fs.statSync(file);
          if (stat.isFile() && stat.size > 0) {
            return {
              path: file,
              folderId: '',
              projectId: '',
              bytes: stat.size,
              url: this.origin() + '/workbench/task-video/' + encodeURIComponent(rawId) + '?v=' + Math.trunc(stat.mtimeMs),
            };
          }
        }
      } catch { /* skip invalid candidate */ }
    }
    return null;
  }
  resolveVideo({ videoId = '', projectId = '', taskId = '' } = {}) {
    const validVideoId = typeof videoId === 'string' && /^[-\w]{1,100}$/.test(videoId);
    const validProjectId = typeof projectId === 'string' && /^[-\w]{1,100}$/.test(projectId);
    if (validVideoId && validProjectId) {
      try {
        const direct = this.videoInfo({ projectId, videoId });
        if (direct) return direct;
      } catch { /* project directory may not exist yet */ }
    }
    if (validVideoId) {
      let idx = {};
      try { idx = this.index(); } catch { idx = {}; }
      for (const pid of Object.keys(idx)) {
        if (pid === projectId || !/^[-\w]{1,100}$/.test(pid)) continue;
        try {
          const hit = this.videoInfo({ projectId: pid, videoId });
          if (hit) return hit;
        } catch { /* skip unreadable project */ }
      }
    }
    if (taskId) return this.resolveTaskVideo(taskId);
    if (validVideoId) return this.resolveTaskVideo(videoId);
    return null;
  }
  serveStream(req, res, file) {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { 'Allow': 'GET, HEAD' });
      res.end();
      return;
    }
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('本地视频文件不存在');
      return;
    }
    let stat;
    try { stat = fs.statSync(file); } catch { stat = null; }
    if (!stat || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('本地视频文件不可用');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const mime = VIDEO_MIME[ext] || 'video/mp4';
    let start = 0, end = Math.max(0, stat.size - 1), status = 200;
    if (req.headers.range && stat.size > 0) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range).trim());
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
        res.end();
        return;
      }
      start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
      end = m[1] && m[2] ? Math.min(Number(m[2]), end) : end;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
        res.end();
        return;
      }
      status = 206;
    }
    const headers = {
      'Content-Type': mime,
      'Content-Length': stat.size === 0 ? 0 : Math.max(0, end - start + 1),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    };
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || stat.size === 0) {
      res.end();
      return;
    }
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.destroy(); });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
  serve(req, res, projectId, videoId) {
    let hit = null;
    try { hit = this.resolveVideo({ videoId, projectId }); } catch { hit = null; }
    this.serveStream(req, res, hit?.path || '');
  }
  serveTask(req, res, taskId) {
    let hit = null;
    try { hit = this.resolveTaskVideo(taskId); } catch { hit = null; }
    this.serveStream(req, res, hit?.path || '');
  }
  write(payload) {
    const {directory,data}=this.record(payload.projectId);this.id(payload.videoId);
    if(payload.folderId && !(payload.folderId in data.locations))throw Error('视频目标文件夹不存在');
    if(this.videoInfo(payload))return this.move({...payload,ids:[payload.videoId]});
    const bytes=Buffer.from(payload.bytes||[]);if(!bytes.length)throw Error('视频内容为空');
    const ext=/webm/i.test(payload.mimeType)?'.webm':/quicktime/i.test(payload.mimeType)?'.mov':'.mp4';
    const title=String(payload.title||'视频').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,70)||'视频';
    const target=this.guard(path.join(directory,data.locations[payload.folderId]||''));fs.mkdirSync(target,{recursive:true});
    const file=this.free(target,title+ext);
    fs.writeFileSync(file+'.tmp',bytes,{flag:'wx'});fs.renameSync(file+'.tmp',file);
    data.videos[payload.videoId]={file:path.relative(directory,file),folderId:payload.folderId||''};this.atomic(path.join(directory,'.studio-project.json'),data);
    return {path:file};
  }
  move({projectId,ids,folderId}) {
    const {directory,data}=this.record(projectId);if(folderId && !(folderId in data.locations))throw Error('目标文件夹不存在');
    const changes=[],next=JSON.parse(JSON.stringify(data));
    try{for(const id of ids){this.id(id);const video=next.videos[id];if(!video)continue;
      const old=this.guard(path.join(directory,video.file));if(!fs.existsSync(old))throw Error('本地视频文件不存在，请先恢复或重新保存：'+video.file);if(video.folderId===folderId)continue;
      const target=this.guard(path.join(directory,data.locations[folderId]||''));fs.mkdirSync(target,{recursive:true});const dest=this.free(target,path.basename(old));fs.renameSync(old,dest);changes.push([dest,old]);video.file=path.relative(directory,dest);video.folderId=folderId||'';
    }this.atomic(path.join(directory,'.studio-project.json'),next);return {path:directory};}catch(error){for(const [a,b] of changes.reverse())fs.renameSync(a,b);throw error;}
  }
  open({projectId,folderId=''}) { const {directory,data}=this.record(projectId);if(folderId && !(folderId in data.locations))throw Error('文件夹不存在');return this.guard(path.join(directory,data.locations[folderId]||'')); }
  recycle(id) { const {directory}=this.record(id);const trash=this.guard(path.join(this.root,'.studio-trash'));fs.mkdirSync(trash,{recursive:true});const dest=this.free(trash,path.basename(directory));fs.renameSync(directory,dest);const index=this.index();delete index[id];try{this.saveIndex(index);}catch(error){fs.renameSync(dest,directory);throw error;}return {path:dest}; }
}
module.exports={VideoStudioFiles};
