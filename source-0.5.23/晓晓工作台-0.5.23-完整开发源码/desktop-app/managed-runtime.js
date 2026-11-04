const {spawn}=require('node:child_process');
const path=require('node:path');
function spawnManaged(nodeExecutable,executable,args,options){
  const child=spawn(nodeExecutable,[path.join(__dirname,'runtime-supervisor.cjs'),executable,...args],{...options,env:{...options.env,ELECTRON_RUN_AS_NODE:'1'},stdio:[...options.stdio,'ipc']});
  // Windows 的 kill 会直接终止监督进程；通过 IPC 请求它先释放所持有的服务句柄。
  child.kill=()=>{if(child.connected)child.send('stop',()=>{});return true;};
  return child;
}
module.exports={spawnManaged};
