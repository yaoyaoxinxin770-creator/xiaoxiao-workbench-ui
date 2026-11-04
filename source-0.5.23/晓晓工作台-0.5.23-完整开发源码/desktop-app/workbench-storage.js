const fs=require('node:fs'),path=require('node:path');
function storagePaths(home,profile){
  if(!path.isAbsolute(home)||profile&&!path.isAbsolute(profile))throw Error('工作台数据位置必须是绝对路径');
  const data=path.resolve(profile||path.join(home,'工作台数据'));
  return {home:path.resolve(home),data,temp:path.join(data,'临时文件'),logs:path.join(data,'logs'),crashDumps:path.join(data,'crashes'),cliRoaming:path.join(data,'cli','roaming'),cliLocal:path.join(data,'cli','local'),cliState:path.join(data,'cli','dreamina-business-state')};
}
function configureStorage(app,env=process.env){
  const current=app.getPath('userData'),normal=path.join(app.getPath('appData'),app.getName());
  // Native test fixtures may already have set their own profile before loading main.
  const profile=env.WORKBENCH_PROFILE_DIR||(path.resolve(current)!==path.resolve(normal)?current:null);
  const home=env.WORKBENCH_HOME_DIR||require('./assets/storage-home.json').home;
  const paths=storagePaths(home,profile);
  for(const dir of [paths.data,paths.temp,paths.logs,paths.crashDumps,paths.cliRoaming,paths.cliLocal])fs.mkdirSync(dir,{recursive:true});
  app.setPath('userData',paths.data);app.setPath('sessionData',paths.data);app.setPath('temp',paths.temp);app.setPath('crashDumps',paths.crashDumps);app.setAppLogsPath(paths.logs);
  env.TEMP=env.TMP=paths.temp;env.WORKBENCH_CLI_ROAMING_DIR=paths.cliRoaming;env.WORKBENCH_CLI_LOCAL_DIR=paths.cliLocal;env.WORKBENCH_DREAMINA_STATE_DIR=paths.cliState;
  return paths;
}
function cliEnvironment(env=process.env){return {...env,...(env.WORKBENCH_CLI_ROAMING_DIR?{APPDATA:env.WORKBENCH_CLI_ROAMING_DIR}:{}),...(env.WORKBENCH_CLI_LOCAL_DIR?{LOCALAPPDATA:env.WORKBENCH_CLI_LOCAL_DIR}:{}),...(env.WORKBENCH_DREAMINA_STATE_DIR?{DREAMINA_CANVAS_STATE_DIR:env.WORKBENCH_DREAMINA_STATE_DIR}:{})};}
module.exports={storagePaths,configureStorage,cliEnvironment};
