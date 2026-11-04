// Read arguments from a private local file so long prompts do not hit Windows' command-line limit.
const fs=require('node:fs'),{pathToFileURL}=require('node:url');
const [entry,argsFile]=process.argv.slice(2);
const args=JSON.parse(fs.readFileSync(argsFile,'utf8'));
fs.unlinkSync(argsFile);
process.argv=[process.execPath,entry,...args];
import(pathToFileURL(entry).href).catch(()=>{console.error('Oii CLI 启动失败');process.exitCode=1;});
