const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function createLauncherShortcut(home){
 home=path.resolve(home);const script=path.join(home,'启动晓晓工作台.vbs'),icon=path.join(home,'desktop-app/assets/typetale-workbench.ico'),file=path.join(home,'启动晓晓工作台.lnk');
 for(const p of [script,icon])if(!fs.existsSync(p))throw Error('启动入口所需文件不存在：'+p);
 const env={...process.env};for(const key of ['Path','PATH','SystemRoot','WINDIR','COMSPEC','APPDATA','LOCALAPPDATA','USERPROFILE'])if(env[key])env[key]=env[key].split(String.fromCharCode(92,92)).join(String.fromCharCode(92));
 const quote=value=>"'"+value.replaceAll("'","''")+"'",wscript=path.join(env.SystemRoot||'C:\\Windows','System32/wscript.exe');
 const ps="$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();$shell=New-Object -ComObject WScript.Shell;$link=$shell.CreateShortcut("+quote(file)+");$link.TargetPath="+quote(wscript)+";$link.Arguments="+quote('"'+script+'"')+";$link.WorkingDirectory="+quote(home)+";$link.IconLocation="+quote(icon+',0')+";$link.Description='启动晓晓的AI工作台';$link.WindowStyle=1;$link.Save();$read=$shell.CreateShortcut("+quote(file)+");@{path="+quote(file)+";target=$read.TargetPath;arguments=$read.Arguments;icon=$read.IconLocation;workingDirectory=$read.WorkingDirectory}|ConvertTo-Json -Compress";
 const result=spawnSync(path.join(env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{env,encoding:'utf8',windowsHide:true,timeout:30000});
 if(result.status!==0)throw Error(result.stderr||result.error||'创建启动快捷方式失败');const proof=JSON.parse(result.stdout);if(path.resolve(proof.target)!==path.resolve(wscript)||proof.arguments!=='"'+script+'"'||proof.icon!==icon+',0'||proof.workingDirectory!==home)throw Error('启动快捷方式核对失败');return proof;
}
module.exports={createLauncherShortcut};if(require.main===module)console.log(JSON.stringify(createLauncherShortcut(process.argv[2]||path.resolve(__dirname,'..'))));
