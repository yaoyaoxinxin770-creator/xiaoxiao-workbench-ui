const fs = require('fs');
const path = require('path');
const {execFile} = require('child_process');
const {promisify} = require('util');
const core = require('./typetale-core');

const execFileAsync = promisify(execFile);
const PLUGIN_HOST_DIR = path.join(__dirname, 'typetale-plugin-host');
const PLUGIN_RUNNER = path.join(PLUGIN_HOST_DIR, 'runner.py');
const RESULT_MARKER = '__TYPETALE_RESULT__=';
const PROGRESS_MARKER = '__TYPETALE_PROGRESS__=';
// 真实插件目录的类型层名字，来自 plugins/ 下的实际布局。
const PLUGIN_CATEGORIES = new Set(['image_plugins', 'video_plugins', 'post_process_plugins', 'lip_sync_plugins', 'tool_plugins']);
const IMAGE_MIME = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.bmp':'image/bmp','.gif':'image/gif'};

function ensureHttpUrl(value) {
  const text = core.normalizeBaseUrl(value);
  if (!/^https?:\/\//i.test(text)) throw new Error('Provider baseUrl 必须是 http/https 地址');
  return text;
}

function statePath(root, app) {
  if (root) return path.join(path.resolve(root), '.typetale', 'workbench.json');
  return path.join(app.getPath('userData'), 'typetale-workbench.json');
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); }
  catch (_) { return fallback; }
}

async function writeJson(file, value) {
  await fs.promises.mkdir(path.dirname(file), {recursive:true});
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.promises.rename(temporary, file);
}

function outputDir(root, app) {
  const base = root ? path.resolve(root) : app.getPath('userData');
  return path.join(base, 'typetale-output');
}

function pluginRunDir(root, app) {
  const base = root ? path.resolve(root) : app.getPath('userData');
  return path.join(base, '.typetale', 'plugin-runs');
}

// 插件进程的 CWD。plugin_utils 用相对路径 user_resources/plugins/... 定位 config.json，
// 所以这个目录必须全局固定：跟着项目走的话，同一个插件在每个项目里都要重填一次
// API Key。从字字动画拷过来的 config.json 放进同样的相对路径即可直接生效。
function pluginDataRoot(app) {
  return path.join(app.getPath('userData'), 'typetale-host');
}

// 与 plugin_utils._get_config_path 完全一致的路径计算，供 UI 直接读写插件参数。
function pluginConfigPath(app, pluginPath) {
  const dir = path.resolve(String(pluginPath || ''));
  return path.join(pluginDataRoot(app), 'user_resources', 'plugins', path.basename(path.dirname(dir)), path.basename(dir), 'config.json');
}

function pythonExecutable(provider) {
  return core.normalizeProvider(provider || {}).pythonPath || provider?.extra?.pythonPath || process.env.TYPETALE_PYTHON || 'python';
}

function normalizeProjectState(root, value = {}) {
  const normalized = core.normalizeState({...(value || {}), projectPath:root || value?.projectPath || ''});
  normalized.assets = core.scopeAssetsToProject(normalized.assets, normalized.projectPath);
  normalized.shots = core.pruneShotAssetBindings(normalized.shots, normalized.assets);
  return normalized;
}

async function readState(root, app) {
  const file = statePath(root, app);
  const value = await readJson(file, null);
  return {ok:true, path:file, state:normalizeProjectState(root, value)};
}

async function writeState(root, state, app) {
  const normalized = normalizeProjectState(root, {...(state || {}), updatedAt:new Date().toISOString()});
  const file = statePath(root, app);
  await writeJson(file, normalized);
  return {ok:true, path:file, state:normalized};
}

async function scanPluginFolder(root) {
  const base = path.resolve(root);
  if (!fs.existsSync(base)) return {ok:false, plugins:[], error:'插件目录不存在'};
  const plugins = [];
  const seen = new Set();
  async function visit(dir, depth) {
    if (plugins.length >= 500 || depth > 4 || seen.has(dir)) return;
    seen.add(dir);
    let entries;
    try { entries = await fs.promises.readdir(dir, {withFileTypes:true}); }
    catch (_) { return; }
    const names = new Set(entries.map(entry => entry.name));
    const compiledEntry = [...names].find(name => /^main\..*\.pyd$/i.test(name));
    if (names.has('main.py') || compiledEntry) {
      const info = await readJson(path.join(dir, 'info.json'), await readJson(path.join(dir, 'plugin.json'), {}));
      const category = path.basename(path.dirname(dir));
      const source = names.has('main.py') ? await fs.promises.readFile(path.join(dir, 'main.py'), 'utf8').catch(() => '') : '';
      // 桥接桩（# Auto-generated bridge 开头）只是把调用转发到原程序的 .pyd，
      // 离了字字动画本体必崩，所以在这里就标出来，不能当可执行插件用。
      const bridgeStub = source.startsWith('# Auto-generated bridge');
      plugins.push({
        id: path.basename(dir),
        name: info.display_name || info.displayName || info.name || path.basename(dir),
        path: dir,
        scope: info.scope || '',
        category: PLUGIN_CATEGORIES.has(category) ? category : '',
        type: category || '',
        // model_family_ui = 'self' 表示插件自己的 ui/index.html 画模型族下拉，
        // 宿主就不要再画一个（见 example_with_ui 的注释）。
        modelFamilyUi: info.model_family_ui || info.modelFamilyUi || 'host',
        hasUi: fs.existsSync(path.join(dir, 'ui', 'index.html')),
        hasConfig: names.has('config.json'),
        hasSource: names.has('main.py') && !bridgeStub,
        bridgeStub,
        compiledOnly: !names.has('main.py') && Boolean(compiledEntry),
        entry: names.has('main.py') ? 'main.py' : compiledEntry,
      });
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '__pycache__') continue;
      await visit(path.join(dir, entry.name), depth + 1);
    }
  }
  await visit(base, 0);
  return {ok:true, plugins:plugins.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))};
}

function resolveReferencePath(reference, root) {
  const value = String(reference?.path || '');
  return path.isAbsolute(value) || !root ? path.resolve(value) : path.resolve(root, value);
}

async function encodeReference(reference, root) {
  const file = resolveReferencePath(reference, root);
  const stat = await fs.promises.stat(file);
  if (stat.size > 30 * 1024 * 1024) throw new Error(`参考图过大：${reference.name || reference.path}`);
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return {...reference, data_url:`data:${mime};base64,${(await fs.promises.readFile(file)).toString('base64')}`};
}

function extractTaskId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.id || payload.task_id || payload.taskId || payload.data?.id || payload.data?.task_id || payload.data?.taskId || '');
}

function extractResultUrl(payload) {
  const values = [];
  const visit = value => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(payload?.data?.url || payload?.url || payload?.result_url || payload?.output || payload?.video || payload?.videos || payload?.data);
  return values.find(value => /\.(mp4|mov|webm|mkv)(?:[?#]|$)/i.test(value)) || values[0] || '';
}

async function submitGenericVideo(provider, request, root) {
  const baseUrl = ensureHttpUrl(provider.baseUrl);
  const url = new URL(request.url || `${baseUrl}/v1/videos`);
  const body = {...request.body};
  const references = Array.isArray(body.reference_images) ? body.reference_images : [];
  if (provider.referenceMode === 'none') delete body.reference_images;
  else if (provider.referenceMode === 'data_url') body.reference_images = await Promise.all(references.map(reference => encodeReference(reference, root)));
  else if (provider.referenceMode === 'url') body.reference_images = references.map(reference => reference.url || reference.data_url || resolveReferencePath(reference, root));
  else body.reference_images = references.map(reference => ({...reference, path:resolveReferencePath(reference, root)}));
  const response = await fetch(url, {
    method:request.method || 'POST',
    headers:request.headers || {},
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(Math.max(5, Number(provider.timeoutSeconds) || 900) * 1000),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch (_) { payload = {raw:text}; }
  return {
    ok:response.ok,
    status:response.status,
    statusText:response.statusText,
    payload,
    taskId:extractTaskId(payload),
    resultUrl:extractResultUrl(payload),
  };
}

async function queryGenericVideo(provider, taskId) {
  const baseUrl = ensureHttpUrl(provider.baseUrl);
  const url = new URL(`${baseUrl}/v1/videos/${encodeURIComponent(String(taskId || '').trim())}`);
  const response = await fetch(url, {
    headers:provider.apiKey ? {Authorization:`Bearer ${provider.apiKey}`} : {},
    signal:AbortSignal.timeout(Math.max(5, Number(provider.timeoutSeconds) || 60) * 1000),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch (_) { payload = {raw:text}; }
  return {ok:response.ok, status:response.status, payload, resultUrl:extractResultUrl(payload)};
}

async function downloadResult(provider, resultUrl, root, app, fileName = '') {
  if (!resultUrl) throw new Error('任务还没有返回视频地址');
  const url = /^https?:\/\//i.test(resultUrl) ? resultUrl : `${ensureHttpUrl(provider.baseUrl)}/${String(resultUrl).replace(/^\/+/, '')}`;
  const response = await fetch(url, {signal:AbortSignal.timeout(10 * 60 * 1000)});
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('下载结果为空');
  const dir = outputDir(root, app);
  await fs.promises.mkdir(dir, {recursive:true});
  const ext = path.extname(new URL(url).pathname) || '.mp4';
  const safe = String(fileName || `typetale-${Date.now()}`).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120) || 'typetale';
  const file = path.join(dir, safe.toLowerCase().endsWith(ext.toLowerCase()) ? safe : `${safe}${ext}`);
  await fs.promises.writeFile(file, bytes);
  return {ok:true, path:file, bytes:bytes.length};
}

// 跑一次插件宿主。inspect 模式读 get_info()/get_params()，generate 模式执行生成。
// 结果走独立的 result 文件而不是只认 stdout：插件普遍会把提示词原样回显，正文里
// 如果刚好出现标记串，靠扫 stdout 解析就会读到错的东西。
async function runPluginHost(provider, pluginPath, mode, {contextPayload = null, root = '', app, timeoutSeconds} = {}) {
  const pluginDir = path.resolve(String(pluginPath || ''));
  if (!fs.existsSync(path.join(pluginDir, 'main.py'))) throw new Error(`插件目录中没有 main.py：${pluginDir}`);
  const runDir = pluginRunDir(root, app);
  const dataRoot = pluginDataRoot(app);
  await fs.promises.mkdir(runDir, {recursive:true});
  await fs.promises.mkdir(dataRoot, {recursive:true});
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const resultFile = path.join(runDir, `${stamp}.result.json`);
  const contextFile = path.join(runDir, `${stamp}.context.json`);
  const args = [PLUGIN_RUNNER, mode, pluginDir, resultFile];
  if (contextPayload) {
    await fs.promises.writeFile(contextFile, JSON.stringify(contextPayload, null, 2), 'utf8');
    args.push(contextFile);
  }
  let stdout = '';
  let stderr = '';
  let launchError = null;
  try {
    const finished = await execFileAsync(pythonExecutable(provider), args, {
      cwd:dataRoot,
      timeout:Math.max(5, Number(timeoutSeconds) || Number(provider?.timeoutSeconds) || 900) * 1000,
      maxBuffer:32 * 1024 * 1024,
      // 不写 .pyc：宿主目录会被打进安装包，跑一次就多一个 __pycache__ 很难看；
      // 插件目录是用户自己的素材目录，同样不该被我们污染。
      env:{...process.env, PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1', PYTHONDONTWRITEBYTECODE:'1'},
      windowsHide:true,
    });
    stdout = String(finished.stdout || '');
    stderr = String(finished.stderr || '');
  } catch (error) {
    // 插件报错时 runner 以退出码 1 结束，但结果文件已经写好了，所以先收集输出再判断。
    stdout = String(error?.stdout || '');
    stderr = String(error?.stderr || error?.message || '');
    launchError = error;
  }
  let payload = null;
  try { payload = JSON.parse(await fs.promises.readFile(resultFile, 'utf8')); }
  catch (_) {
    const line = stdout.split(/\r?\n/).reverse().find(item => item.startsWith(RESULT_MARKER));
    if (line) { try { payload = JSON.parse(line.slice(RESULT_MARKER.length)); } catch (__) { payload = null; } }
  }
  await fs.promises.unlink(contextFile).catch(() => {});
  await fs.promises.unlink(resultFile).catch(() => {});
  const progress = stdout.split(/\r?\n/)
    .filter(line => line.startsWith(PROGRESS_MARKER))
    .map(line => { try { return JSON.parse(line.slice(PROGRESS_MARKER.length)).message; } catch (_) { return ''; } })
    .filter(Boolean);
  const log = stdout.split(/\r?\n/).filter(line => line && !line.startsWith(RESULT_MARKER) && !line.startsWith(PROGRESS_MARKER)).join('\n');
  if (!payload) {
    throw new Error(launchError
      ? `插件宿主启动失败：${stderr.trim().split(/\r?\n/).slice(-3).join(' ') || launchError.message}`
      : '插件没有返回结果（宿主未写出结果文件）');
  }
  return {...payload, progress, stdout:log, stderr};
}

async function inspectPlugin(provider, pluginPath, app) {
  const payload = await runPluginHost(provider, pluginPath, 'inspect', {app, timeoutSeconds:120});
  return {...payload, configPath:pluginConfigPath(app, pluginPath)};
}

async function executePlugin(provider, request, root, app) {
  const payload = await runPluginHost(provider, provider.pluginPath, 'generate', {
    contextPayload:request.context || {},
    root,
    app,
  });
  if (payload.ok === false) {
    const error = new Error(payload.error || '插件执行失败');
    // fatal 来自插件自己的 PLUGIN_ERROR::: 约定：调用方不应该再重试。
    error.fatal = Boolean(payload.fatal);
    error.detail = payload.traceback || payload.stderr || '';
    throw error;
  }
  return {
    ok:true,
    result:payload.result || [],
    files:payload.files || [],
    missingFiles:payload.missingFiles || [],
    progress:payload.progress || [],
    stdout:payload.stdout,
    stderr:payload.stderr,
  };
}

async function executeCli(provider, request, root) {
  const command = String(request.command || '').trim();
  if (!command) throw new Error('CLI Provider 未配置 command');
  const result = await execFileAsync(command, request.args || [], {
    cwd:request.cwd || root || process.cwd(),
    timeout:Math.max(5, Number(request.timeoutSeconds) || 900) * 1000,
    maxBuffer:16 * 1024 * 1024,
    env:{...process.env, ...(request.env || {})},
    windowsHide:true,
  });
  return {ok:true, stdout:result.stdout, stderr:result.stderr};
}

// 编译结果里的路径是项目相对路径，交给插件/API 之前要变成绝对路径。
// referenceMap 用 0 基槽位号作键（插件协议），tokenMap 用 chip token 作键，
// 两者都从同一份 references 重算，避免绝对化之后三处路径不一致。
function absolutizeCompiled(compiled, root) {
  const value = compiled && typeof compiled === 'object' ? {...compiled} : {};
  value.references = (Array.isArray(value.references) ? value.references : []).map(reference => ({
    ...reference,
    path:resolveReferencePath(reference, root),
  }));
  value.referenceMap = Object.fromEntries(value.references
    .filter(reference => reference.mediaType === 'image')
    .map(reference => [reference.slot, reference.path]));
  value.tokenMap = Object.fromEntries(value.references
    .filter(reference => reference.token)
    .map(reference => [reference.token, reference.path]));
  const frames = value.frames && typeof value.frames === 'object' ? value.frames : {};
  value.frames = {
    ...frames,
    first:frames.first ? resolveReferencePath({path:frames.first}, root) : '',
    last:frames.last ? resolveReferencePath({path:frames.last}, root) : '',
  };
  return value;
}

async function execute(payload, app) {
  const provider = core.normalizeProvider(payload?.provider || {});
  const shot = core.normalizeShot(payload?.shot || {});
  const projectPath = String(payload?.projectPath || '').trim();
  const assets = core.scopeAssetsToProject(payload?.assets || [], projectPath);
  // 始终在这里重新编译，不复用渲染层传来的 compiled：执行用的提示词、payload 里的
  // 参考图、前缀里的声明必须出自同一次编译，否则三者会在用户编辑时漂移。
  const compiled = absolutizeCompiled(core.compilePrompt(shot, assets, {
    provider,
    familyOverrides:payload?.familyOverrides || {},
  }), projectPath);
  const request = core.buildExecutionRequest(provider, shot, compiled, {
    projectPath,
    outputDir:outputDir(projectPath, app),
    audioPath:payload?.audioPath || '',
    audioDuration:payload?.audioDuration || 0,
  });
  if (payload?.dryRun) return {ok:true, dryRun:true, request};
  if (request.kind === 'generic-video') return {request, response:await submitGenericVideo(provider, request, projectPath)};
  if (request.kind === 'cli') return {request, response:await executeCli(provider, request, projectPath)};
  if (request.kind === 'typetale-plugin') return {request, response:await executePlugin(provider, request, projectPath, app)};
  return {ok:false, error:`不支持的 Provider 类型：${request.kind}`};
}

// 插件参数的真相源是插件自己的 config.json（plugin_utils 的布局）。UI 直接读写
// 这个文件，而不是把参数塞进工作区状态：这样从字字动画拷过来的插件配置能原样复用，
// 插件自己调 update_plugin_param 写的值工作台也能立刻看见。
async function readPluginConfig(app, pluginPath) {
  const file = pluginConfigPath(app, pluginPath);
  return {ok:true, path:file, params:await readJson(file, {}) || {}};
}

async function writePluginConfig(app, pluginPath, params) {
  const file = pluginConfigPath(app, pluginPath);
  const current = await readJson(file, {}) || {};
  const next = {...current, ...(params && typeof params === 'object' ? params : {})};
  // 空值覆盖保护与 plugin_utils 一致：已有值的 api_key / base_url / model 这类字段
  // 不允许被空串冲掉（UI 上一个没填的输入框不应该清空已保存的密钥）。
  const skipped = [];
  for (const [key, value] of Object.entries(next)) {
    const protectedKey = /^(api_?key|access_key|secret_key|base_url|model|model_family|browser_exe)$/i.test(key)
      || /(_token|_secret|_password|_passwd|_cookie)$/i.test(key);
    const emptied = value === '' || value === null || value === undefined;
    if (protectedKey && emptied && current[key]) { next[key] = current[key]; skipped.push(key); }
  }
  await writeJson(file, next);
  return {ok:true, path:file, params:next, skippedEmptyOverwrite:skipped};
}

function createActions({app, dialog, shell}) {
  return {
    readState: root => readState(root, app),
    writeState: (root, state) => writeState(root, state, app),
    scanPlugins: root => scanPluginFolder(root),
    inspectPlugin: (pluginPath, provider) => inspectPlugin(provider || {}, pluginPath, app),
    readPluginConfig: pluginPath => readPluginConfig(app, pluginPath),
    writePluginConfig: (pluginPath, params) => writePluginConfig(app, pluginPath, params),
    listModelFamilies: (kind, overrides) => ({ok:true, kind:core.modelFamily.safeKind(kind), families:core.modelFamily.listFamilies(kind, overrides || {})}),
    validateModelFamily: (spec, kind) => ({ok:true, errors:core.modelFamily.validateFamily(spec, kind), preview:core.modelFamily.samplePreview(spec, kind)}),
    execute: payload => execute(payload, app),
    queryVideo: (provider, taskId) => queryGenericVideo(core.normalizeProvider(provider || {}), taskId),
    downloadResult: (provider, resultUrl, root, fileName) => downloadResult(core.normalizeProvider(provider || {}), resultUrl, root, app, fileName),
    openPath: async target => {
      const value = String(target || '').trim();
      if (!value) return {ok:false, error:'路径为空'};
      return {ok:true, result:await shell.openPath(path.resolve(value))};
    },
    openOutputDir: async root => {
      const dir = outputDir(root, app);
      await fs.promises.mkdir(dir, {recursive:true});
      return {ok:true, path:dir, result:await shell.openPath(dir)};
    },
    choosePluginDir: async () => {
      const result = await dialog.showOpenDialog({properties:['openDirectory']});
      if (result.canceled) return {canceled:true, plugins:[]};
      return {...await scanPluginFolder(result.filePaths[0]), root:result.filePaths[0]};
    },
  };
}

module.exports = {
  createActions,
  readState,
  writeState,
  scanPluginFolder,
  execute,
  submitGenericVideo,
  queryGenericVideo,
  downloadResult,
  runPluginHost,
  inspectPlugin,
  executePlugin,
  executeCli,
  readPluginConfig,
  writePluginConfig,
  pluginDataRoot,
  pluginConfigPath,
  absolutizeCompiled,
  extractTaskId,
  extractResultUrl,
};
