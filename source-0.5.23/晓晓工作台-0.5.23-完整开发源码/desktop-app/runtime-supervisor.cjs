// IPC 管道随桌面主进程退出而关闭；由监督进程持有真实服务进程句柄并清理。
const {spawn}=require('node:child_process');
const child=spawn(process.argv[2],process.argv.slice(3),{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore','inherit','inherit']});
let stopping=false;
function stop(){if(stopping)return;stopping=true;child.kill();}
process.on('disconnect',stop);
process.on('message',message=>{if(message==='stop')stop();});
child.once('error',error=>{console.error(error);process.exit(1);});
child.once('exit',code=>process.exit(code??0));
if(!process.connected)stop();
