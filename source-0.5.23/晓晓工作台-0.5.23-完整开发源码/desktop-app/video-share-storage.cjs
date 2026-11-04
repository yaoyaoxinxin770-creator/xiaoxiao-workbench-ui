const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {storagePaths}=require('./workbench-storage');
function configureShareStorage(app,env=process.env){
 const exeDir=app.isPackaged?path.dirname(app.getPath('exe')):__dirname;
 const home=path.basename(exeDir)==='应用'?path.dirname(exeDir):exeDir;
 const paths=storagePaths(home,env.VIDEO_STUDIO_TEST_PROFILE||path.join(home,'工作台数据'));
 for(const key of ['Path','PATH','SystemRoot','WINDIR','COMSPEC','APPDATA','LOCALAPPDATA','USERPROFILE'])if(env[key])env[key]=env[key].split(String.fromCharCode(92,92)).join(String.fromCharCode(92));
 for(const dir of [paths.data,paths.temp,paths.logs,paths.crashDumps,paths.cliRoaming,paths.cliLocal])fs.mkdirSync(dir,{recursive:true});
 app.setPath('userData',paths.data);app.setPath('sessionData',paths.data);app.setPath('temp',paths.temp);app.setPath('crashDumps',paths.crashDumps);app.setAppLogsPath(paths.logs);
 env.TEMP=env.TMP=paths.temp;env.WORKBENCH_CLI_ROAMING_DIR=paths.cliRoaming;env.WORKBENCH_CLI_LOCAL_DIR=paths.cliLocal;env.WORKBENCH_DREAMINA_STATE_DIR=paths.cliState;
 // Initialize only a new, empty recipient-owned journal; never rewrite existing records or credentials.
 if(!fs.existsSync(paths.cliState)){
  fs.mkdirSync(paths.cliState,{recursive:true});
  if(process.platform==='win32'){
   const system32=path.join(env.SystemRoot||env.WINDIR||'C:\\Windows','System32');
   const who=spawnSync(path.join(system32,'whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true,env});
   const sid=who.stdout?.match(/S-1-5-21-(?:\d+-){3}\d+/)?.[0];
   if(who.status!==0||!sid)throw Error('无法确认当前 Windows 用户，请检查新数据目录权限。');
   for(const args of [[paths.cliState,'/setowner','*'+sid],[paths.cliState,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F']]){
    const r=spawnSync(path.join(system32,'icacls.exe'),args,{encoding:'utf8',windowsHide:true,env});if(r.status!==0)throw Error('即梦私有任务目录初始化失败，请让 Codex 检查该新目录权限。');
   }
  }
 }
 return paths;
}
module.exports={configureShareStorage};
