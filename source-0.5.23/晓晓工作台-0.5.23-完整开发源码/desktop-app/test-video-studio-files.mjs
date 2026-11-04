import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{VideoStudioFiles}=require('./video-studio-files');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'studio-files-'));
try {
  const service=new VideoStudioFiles(path.join(temp,'projects'));
  let project={id:'film-a',name:'影片甲',folders:[{id:'episode1',name:'第1集',parentId:''},{id:'shot',name:'镜头一',parentId:'episode1'},{id:'episode2',name:'第2集',parentId:''}]};
  const directory=service.sync(project).path;
  assert.equal(path.basename(directory),'影片甲');assert.ok(fs.existsSync(path.join(directory,'第1集','镜头一')));
  fs.rmdirSync(path.join(directory,'第2集'));service.sync({...project,change:false});assert.ok(fs.existsSync(path.join(directory,'第2集')),'已建档但缺失的空目录自动恢复');
  const bytes=Buffer.from('controlled video bytes');
  const first=service.write({projectId:project.id,folderId:'shot',videoId:'video1',title:'第一组',mimeType:'video/webm',bytes}).path;
  assert.deepEqual(fs.readFileSync(first),bytes);
  fs.rmdirSync(path.join(directory,'第2集'));
  service.move({projectId:project.id,ids:['video1'],folderId:'episode2'});
  const moved=service.videoInfo({projectId:project.id,videoId:'video1'}).path;
  assert.ok(moved.includes('第2集'));assert.ok(!fs.existsSync(first));assert.deepEqual(fs.readFileSync(moved),bytes);
  project={...project,name:'影片甲改名',folders:project.folders.map(f=>f.id==='episode2'?{...f,name:'第2集改名'}:f)};
  const renamed=service.sync(project).path;
  assert.ok(!fs.existsSync(directory));assert.ok(service.videoInfo({projectId:project.id,videoId:'video1'}).path.includes('第2集改名'));
  service.write({projectId:project.id,folderId:'shot',videoId:'video2',title:'第一组',mimeType:'video/webm',bytes});
  // Preserve even a file added manually to a folder, and avoid overwriting equal filenames.
  fs.writeFileSync(path.join(renamed,'第1集','镜头一','手工视频.mp4'),'manual');
  project={...project,folders:[]};service.sync(project);
  assert.equal(service.videoInfo({projectId:project.id,videoId:'video2'}).folderId,'');
  assert.equal(fs.readFileSync(path.join(renamed,'手工视频.mp4'),'utf8'),'manual');
  assert.ok(!fs.existsSync(path.join(renamed,'第1集')));
  assert.throws(()=>service.sync({...project,name:'../outside'}),/名称/);
  assert.throws(()=>service.sync({...project,folders:[{id:'x',name:'同名',parentId:''},{id:'y',name:'同名',parentId:''}]}),/同名/);
  assert.throws(()=>service.sync({...project,folders:[{id:'x',name:'x',parentId:'y'},{id:'y',name:'y',parentId:'x'}]}),/相互包含/);
  assert.throws(()=>service.move({projectId:project.id,ids:['video1'],folderId:'missing'}),/不存在/);
  const outside=path.join(temp,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'private.txt'),'keep');
  fs.symlinkSync(outside,path.join(renamed,'link'),'junction');
  assert.throws(()=>service.guard(path.join(renamed,'link','private.txt')),/链接/);fs.unlinkSync(path.join(renamed,'link'));
  // A metadata commit failure must roll back both directory moves and stored paths.
  const saveIndex=service.saveIndex;service.saveIndex=()=>{throw Error('controlled index failure');};
  assert.throws(()=>service.sync({...project,name:'不能留下半次重命名'}),/controlled index failure/);
  assert.ok(fs.existsSync(renamed));assert.equal(service.record(project.id).data.name,project.name);
  assert.ok(fs.existsSync(service.videoInfo({projectId:project.id,videoId:'video1'}).path));
  assert.throws(()=>service.recycle(project.id),/controlled index failure/);assert.ok(fs.existsSync(renamed));
  assert.throws(()=>service.sync({id:'new-failed',name:'失败的新项目',folders:[]}),/controlled index failure/);assert.ok(!fs.existsSync(path.join(service.root,'失败的新项目')));
  service.saveIndex=saveIndex;
  const trash=service.recycle(project.id).path;assert.ok(!fs.existsSync(renamed));assert.ok(fs.readdirSync(trash).some(f=>f.endsWith('.webm')));
  assert.equal(fs.readFileSync(path.join(outside,'private.txt'),'utf8'),'keep');
  service.sync({...project,name:'影片甲改名'});assert.notEqual(service.open({projectId:project.id}),trash);
  // Verify resolveVideo across projects, task output fallback, and HTTP 200/206 Range streaming.
  const http = await import('node:http');
  let port = 0;
  const streamRoot = path.join(temp, 'userData');
  const streamService = new VideoStudioFiles(path.join(streamRoot, 'video-studio', 'projects'), {
    origin: () => `http://127.0.0.1:${port}`,
    userDataDir: streamRoot,
  });
  const server = http.createServer((req, res) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname.startsWith('/workbench/studio-video/')) {
      const parts = pathname.split('/').filter(Boolean);
      return streamService.serve(req, res, decodeURIComponent(parts[2] || ''), decodeURIComponent(parts[3] || ''));
    }
    if (pathname.startsWith('/workbench/task-video/')) {
      const parts = pathname.split('/').filter(Boolean);
      return streamService.serveTask(req, res, decodeURIComponent(parts[2] || ''));
    }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  try {
    streamService.sync({ id: 'proj-1', name: '病娇遇上穷鬼', folders: [{ id: 'f4', name: '后续4', parentId: '' }] });
    const mp4Payload = Buffer.from('0123456789ABCDEF-REAL-MP4-BYTES');
    streamService.write({ projectId: 'proj-1', folderId: 'f4', videoId: 'vid-09-3', title: '【视频编号09-3', mimeType: 'video/mp4', bytes: mp4Payload });
    const directHit = streamService.resolveVideo({ videoId: 'vid-09-3', projectId: 'proj-1' });
    assert.ok(directHit?.url.includes('/workbench/studio-video/proj-1/vid-09-3'));
    assert.equal(directHit.bytes, mp4Payload.length);
    const crossHit = streamService.resolveVideo({ videoId: 'vid-09-3', projectId: 'other-proj' });
    assert.equal(crossHit?.projectId, 'proj-1', '跨项目或未同步归属时仍可按 videoId 定位本地归档视频');
    const fullRes = await fetch(directHit.url);
    assert.equal(fullRes.status, 200);
    assert.equal(fullRes.headers.get('accept-ranges'), 'bytes');
    assert.equal(fullRes.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.deepEqual(Buffer.from(await fullRes.arrayBuffer()), mp4Payload);
    const rangeRes = await fetch(directHit.url, { headers: { Range: 'bytes=4-9' } });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range'), `bytes 4-9/${mp4Payload.length}`);
    assert.equal(await rangeRes.text(), '456789');
    const taskOutDir = path.join(streamRoot, 'dreamina-canvas', 'accounts', 'wb-acc1', 'client_video_task_abc123', 'output');
    fs.mkdirSync(taskOutDir, { recursive: true });
    fs.writeFileSync(path.join(taskOutDir, 'result.mp4'), Buffer.from('TASK-MP4-STREAM'));
    const taskHit = streamService.resolveVideo({ videoId: 'unarchived-id', projectId: 'proj-1', taskId: 'dreamina-canvas:client_video_task_abc123' });
    assert.ok(taskHit?.url.includes('/workbench/task-video/client_video_task_abc123'));
    const taskRes = await fetch(taskHit.url, { headers: { Range: 'bytes=0-3' } });
    assert.equal(taskRes.status, 206);
    assert.equal(await taskRes.text(), 'TASK');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('真实视频目录验证通过：创建/嵌套/移动/重命名/删除散开/重名保护/路径与链接隔离/项目回收/Range流式播放恢复。');
} finally {assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('studio-files-'));fs.rmSync(temp,{recursive:true,force:true});}
