import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-supervisor-'));
const output=path.join(root,'port.txt');
const service=path.join(root,'service.cjs'),owner=path.join(root,'owner.cjs');
fs.writeFileSync(service,'const server=require("net").createServer();server.listen(0,"127.0.0.1",()=>require("fs").writeFileSync(process.argv[2],String(server.address().port)));');
fs.writeFileSync(owner,'const {spawnManaged}=require('+JSON.stringify(path.join(import.meta.dirname,'managed-runtime.js'))+');spawnManaged(process.execPath,'+JSON.stringify(process.execPath)+',['+JSON.stringify(service)+','+JSON.stringify(output)+'],{cwd:'+JSON.stringify(root)+',env:process.env,stdio:["ignore","ignore","ignore"]});');
const child=spawn(process.execPath,[owner],{windowsHide:true});
const alive=port=>new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.on('connect',()=>{socket.destroy();resolve(true);});socket.on('error',()=>resolve(false));});
try{
  const deadline=Date.now()+10000;while(!fs.existsSync(output)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
  assert.ok(fs.existsSync(output),'监督进程必须真正启动服务');const port=Number(fs.readFileSync(output,'utf8'));assert.equal(await alive(port),true);
  const ended=once(child,'exit');child.kill();await ended;
  const stopped=Date.now()+10000;while(await alive(port)&&Date.now()<stopped)await new Promise(r=>setTimeout(r,50));
  assert.equal(await alive(port),false,'桌面主进程被强制结束后，监督进程必须释放服务端口');
  console.log('异常退出清理通过：真实服务端口随所属主进程退出而释放');
}finally{child.kill();assert.ok(path.basename(root).startsWith('workbench-supervisor-'));fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
