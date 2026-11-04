import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{LocalAssetLinks,categoryFor}=require('./local-asset-links');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-local-links-'));
let server;
try {
 const source=path.join(temp,'女主','小红.png'),index=path.join(temp,'profile','links.json');fs.mkdirSync(path.dirname(source));fs.writeFileSync(source,'0123456789');
 const original=fs.statSync(source),links=new LocalAssetLinks(index,()=>`http://127.0.0.1:${server.address().port}`);
 server=http.createServer((req,res)=>links.serve(req,res,req.url.split('/').pop()));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const [asset]=links.register([source]);assert.equal(asset.category,'人物');assert.equal(asset.path,source);assert.equal(links.register([source])[0].id,asset.id);
 assert.equal(fs.statSync(source).mtimeMs,original.mtimeMs);assert.deepEqual(fs.readdirSync(path.dirname(index)),['links.json'],'只保存路径索引，不复制原素材');
 const reopened=new LocalAssetLinks(index,()=>`http://127.0.0.1:${server.address().port}`);assert.equal(reopened.describe(asset.id).path,source);
 const range=await fetch(asset.url,{headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(await range.text(),'2345');assert.equal(range.headers.get('content-type'),'image/png');
 assert.equal((await fetch(asset.url,{method:'HEAD'})).headers.get('content-length'),'10');assert.equal((await fetch(asset.url,{headers:{Range:'bytes=100-'} })).status,416);
 assert.equal((await fetch(asset.url.replace(asset.id,'arbitrary'))).status,404);
 assert.equal((await fetch(asset.url,{method:'POST'})).status,405);
 assert.throws(()=>links.register(['relative.png']));assert.throws(()=>links.register([index]));
 assert.equal(categoryFor('F:/素材/场景/客厅.png','image'),'场景');assert.equal(categoryFor('F:/素材/道具/杯子.png','image'),'道具');assert.equal(categoryFor('F:/素材/不明确.png','image'),'未分类');assert.equal(categoryFor('F:/女主/小红.wav','audio'),'音频');
 const before=links.describe(asset.id);fs.writeFileSync(source,'new-image-content');const after=links.describe(asset.id);assert.equal(after.id,before.id);assert.notEqual(after.revision,before.revision);assert.equal(after.bytes,17);assert.equal(await (await fetch(after.url+'?v='+encodeURIComponent(after.revision))).text(),'new-image-content');fs.writeFileSync(source,'0123456789');
 fs.renameSync(source,source+'.moved');assert.throws(()=>links.describe(asset.id),/移动或删除/);assert.equal((await fetch(asset.url)).status,404);
 assert.equal(fs.readFileSync(source+'.moved','utf8'),'0123456789');

 // 1) 原文件夹内将图片重命名 -> 自动追踪恢复
 const renamedInPlace=path.join(temp,'女主','小红-改名立绘.png');
 fs.renameSync(source+'.moved',renamedInPlace);
 assert.equal(links.describe(asset.id).path,renamedInPlace,'同文件夹内重命名自动追踪定位');
 const trackedResponse=await fetch(asset.url);assert.equal(trackedResponse.status,200);assert.equal(await trackedResponse.text(),'0123456789');await new Promise(resolve=>setImmediate(resolve));

 // 2) 给文件夹重命名 -> 自动追踪恢复
 const renamedDir=path.join(temp,'角色立绘');
 fs.renameSync(path.join(temp,'女主'),renamedDir);
 assert.equal(links.describe(asset.id).path,path.join(renamedDir,'小红-改名立绘.png'),'文件夹重命名自动追踪定位');

 // 3) 跨层级移动文件夹位置并同时改文件名 -> 自动追踪恢复
 const movedDeep=path.join(temp,'新归档','2026','小红_终版.png');
 fs.mkdirSync(path.dirname(movedDeep),{recursive:true});
 fs.renameSync(path.join(renamedDir,'小红-改名立绘.png'),movedDeep);
 assert.equal(links.describe(asset.id).path,movedDeep,'移动文件夹且重命名后自动追踪定位');

 // 4) 旧版无 ino/hash 的历史记录改了父文件夹名（如【耽美】漫剧 -> 【纯爱】漫剧）-> 自动祖先兄弟追踪 + 前缀扩散恢复
 const newDramaRoot=path.join(temp,'【纯爱】漫剧','经年余念');
 fs.mkdirSync(path.join(newDramaRoot,'人物'),{recursive:true});
 fs.writeFileSync(path.join(newDramaRoot,'人物','C01 祝余.png'),'char-png-bytes');
 fs.writeFileSync(path.join(newDramaRoot,'祝余.mp3'),'voice-mp3-bytes');
 links.entries['legacy-img']={path:path.join(temp,'【耽美】漫剧','经年余念','人物','C01 祝余.png'),realPath:path.join(temp,'【耽美】漫剧','经年余念','人物','C01 祝余.png')};
 links.entries['legacy-mp3']={path:path.join(temp,'【耽美】漫剧','经年余念','祝余.mp3'),realPath:path.join(temp,'【耽美】漫剧','经年余念','祝余.mp3')};
 const synced=links.sync(['legacy-img','legacy-mp3']);
 assert.equal(synced.resolved['legacy-img']?.path,path.join(newDramaRoot,'人物','C01 祝余.png'),'历史记录父目录改名自动追踪恢复');
 assert.equal(synced.resolved['legacy-mp3']?.path,path.join(newDramaRoot,'祝余.mp3'),'父级音频同步自动恢复');

 // 5) 一键定位文件夹（模拟跨盘复制导致 ino 变化，且用户仅选择「人物」子文件夹，父目录音频同样恢复且保留原 id）
 const manualRoot=path.join(temp,'手动迁移目录','经年余念');
 fs.mkdirSync(path.join(manualRoot,'人物'),{recursive:true});
 fs.writeFileSync(path.join(manualRoot,'人物','C06 岑父.png'),'cenfu-bytes');
 fs.writeFileSync(path.join(manualRoot,'岑念因.mp3'),'cennianyin-bytes');
 links.entries['manual-img']={path:'Z:\\不存在旧盘\\经年余念\\人物\\C06 岑父.png',realPath:'Z:\\不存在旧盘\\经年余念\\人物\\C06 岑父.png'};
 links.entries['manual-mp3']={path:'Z:\\不存在旧盘\\经年余念\\岑念因.mp3',realPath:'Z:\\不存在旧盘\\经年余念\\岑念因.mp3'};
 const batch=links.relinkFolder([path.join(manualRoot,'人物')],['manual-img','manual-mp3']);
 assert.equal(batch.healedCount,2,'选人物子目录一键恢复全部关联缺失素材');
 assert.equal(batch.resolved['manual-img']?.id,'manual-img','保持原素材ID不变');
 assert.equal(batch.resolved['manual-img']?.path,path.join(manualRoot,'人物','C06 岑父.png'));
 assert.equal(batch.resolved['manual-mp3']?.path,path.join(manualRoot,'岑念因.mp3'));

 console.log('原文件引用：无复制、去重、重启、分类、范围读取、追踪定位（改文件名/改文件夹/移位置）与一键文件夹定位通过');
} finally {if(server)await new Promise(resolve=>server.close(resolve));assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
