const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const {spawnManaged} = require('./managed-runtime');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({status:res.statusCode, body}));
    });
    req.setTimeout(1000, () => req.destroy(new Error('画布服务连接超时')));
    req.on('error', reject);
  });
}

function reservePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? `无限画布端口 ${port} 已被占用，请关闭占用该端口的程序后重试。` : error.message)));
    server.listen(port, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
}

class InfiniteCanvasService {
  constructor({runtimeDir, webDir = path.join(runtimeDir, '..', 'infinite-canvas-web'), dataDir, port = 17843, backendPort = 17845, nodeExecutable = process.execPath, shell, entryPath = "/canvas"}) {
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('无限画布端口无效');
    this.entryPath = entryPath;
    this.runtimeDir = runtimeDir;
    this.webDir = webDir;
    this.backendPort = backendPort;
    this.nodeExecutable = nodeExecutable;
    this.webChild = null;
    this.dataDir = dataDir;
    this.port = port;
    this.shell = shell;
    this.child = null;
    this.starting = null;
    this.ready = false;
    this.error = '';
    this.stopping = false;
  }

  status() {
    return {ok:this.ready, running:Boolean(this.child || this.webChild), starting:Boolean(this.starting),
      url:this.ready ? `http://127.0.0.1:${this.port}${this.entryPath}` : '', version:'0.8.0',
      dataDir:this.dataDir, error:this.error};
  }

  start() {
    if (this.ready) return Promise.resolve(this.status());
    if (this.starting) return this.starting;
    this.stopping = false;
    this.error = '';
    this.starting = this.launch().catch(error => {
      this.error = error.message;
      this.ready = false;
      this.child?.kill();
      this.webChild?.kill();
      return this.status();
    }).finally(() => { this.starting = null; });
    return this.starting;
  }

  async launch() {
    const executable = path.join(this.runtimeDir, 'infinite-canvas-server.exe');
    if (!fs.existsSync(executable)) throw new Error('无限画布运行包缺失，请使用包含无限画布的新版本工作台。');
    const frontend = path.join(this.webDir, 'server.js');
    if (!fs.existsSync(frontend)) throw new Error('原生工作台前端缺失，请重新构建或使用完整的新版程序。');
    fs.mkdirSync(this.dataDir, {recursive:true});
    const settingsFile = path.join(this.dataDir, 'runtime-settings.json');
    let settings;
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (!settings.jwtSecret || !settings.adminPassword) throw new Error('无限画布本地配置不完整，请检查 runtime-settings.json。');
    } else {
      settings = {adminUsername:'xiaoxiao', adminPassword:crypto.randomBytes(24).toString('hex'), jwtSecret:crypto.randomBytes(32).toString('hex')};
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), {encoding:'utf8', mode:0o600});
    }
    const port = await reservePort(this.port);
    const backendPort = await reservePort(this.backendPort);
    if (this.stopping) throw new Error('无限画布启动已取消');
    this.port = port;
    this.backendPort = backendPort;
    const log = fs.openSync(path.join(this.dataDir, 'server.log'), 'a');
    let child;
    try {
      child = spawnManaged(this.nodeExecutable, executable, [], {cwd:this.dataDir, windowsHide:true,
        env:{...process.env, PORT:String(backendPort), GIN_MODE:'release',
          DATABASE_DSN:path.join(this.dataDir, 'infinite-canvas.db'),
          AI_LOG_DIR:path.join(this.dataDir, 'logs', 'ai-calls'),
          PROMPT_DATA_DIR:path.join(this.dataDir, 'prompts'),
          ADMIN_USERNAME:settings.adminUsername, ADMIN_PASSWORD:settings.adminPassword, JWT_SECRET:settings.jwtSecret},
        stdio:['ignore', log, log]});
    } finally { fs.closeSync(log); }
    this.child = child;
    child.once('error', error => { if (this.child === child) this.error = `无限画布无法启动：${error.message}`; });
    child.once('exit', code => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = false;
      this.webChild?.kill();
      if (!this.stopping) this.error ||= `无限画布服务已退出（${code}），请重新连接。`;
    });
    const webLog = fs.openSync(path.join(this.dataDir, 'frontend.log'), 'a');
    try {
      this.webChild = spawnManaged(this.nodeExecutable, this.nodeExecutable, [frontend], {cwd:this.webDir, windowsHide:true,
        env:{...process.env, ELECTRON_RUN_AS_NODE:'1', WORKBENCH_AGENT_SETTINGS_DIR:path.dirname(this.dataDir), NODE_ENV:'production', HOSTNAME:'127.0.0.1', PORT:String(port), API_BASE_URL:`http://127.0.0.1:${backendPort}`},
        stdio:['ignore',webLog,webLog]});
    } finally { fs.closeSync(webLog); }
    const webChild = this.webChild;
    webChild.once('error', error=>{if(this.webChild===webChild)this.error=`工作台前端无法启动：${error.message}`;});
    webChild.once('exit', code=>{
      if(this.webChild!==webChild)return;
      this.webChild=null;this.ready=false;this.child?.kill();
      if(!this.stopping)this.error ||= `工作台前端已退出（${code}），请查看 frontend.log。`;
    });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (this.stopping) throw new Error('无限画布启动已取消');
      if (this.error || !this.child || !this.webChild) throw new Error(this.error || '无限画布服务已退出');
      try {
        const [page, user] = await Promise.all([get(`http://127.0.0.1:${port}${this.entryPath}`), get(`http://127.0.0.1:${port}/api/auth/me`)]);
        if (page.status === 200 && page.body.includes('/_next/static/') && user.status === 200 && JSON.parse(user.body).code === 0) {
          if (this.stopping || this.child !== child) throw new Error('无限画布启动已取消');
          if(this.webChild!==webChild) throw new Error('工作台前端已退出');
          this.ready = true;
          return this.status();
        }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('无限画布启动超时，可打开本地数据目录查看 server.log 后重试。');
  }

  async openDataDir() {
    fs.mkdirSync(this.dataDir, {recursive:true});
    const error = await this.shell.openPath(this.dataDir);
    return error ? {ok:false, error} : {ok:true};
  }

  stop() {
    this.stopping = true;
    this.ready = false;
    this.child?.kill();
    this.webChild?.kill();
  }
}

module.exports = {InfiniteCanvasService};
