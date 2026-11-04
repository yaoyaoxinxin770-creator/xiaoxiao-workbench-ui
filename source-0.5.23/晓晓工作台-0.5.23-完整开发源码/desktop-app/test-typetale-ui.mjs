import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {STATIC_FILES} = require('./browser-workbench-service');
const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'workbench.html'), 'utf8');
const workbench = fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'workbench.js'), 'utf8');
const preload = fs.readFileSync(path.join(import.meta.dirname, 'preload.js'), 'utf8');
const typetaleJs = fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'typetale-workbench.js'), 'utf8');
const typetaleCss = fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'typetale-workbench.css'), 'utf8');
const projectPage = fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'project-page.js'), 'utf8');
const projectModel = require('./project-model');
const packageJson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf8'));

for (const scene of ['projects', 'jimeng', 'typetale']) {
  assert.match(html, new RegExp(`data-scene=["']${scene}["']`));
}
assert.match(html, /id="typetaleView"/);
assert.match(html, /typetale-workbench\.js/);
assert.match(html, /typetale-workbench\.css/);
assert.match(html, /typetale-core\.js/);
// 模型族必须先于 typetale-core.js 加载：core 在工厂调用那一刻就要拿到它。
assert.match(html, /typetale-model-family\.js/);
assert.ok(
  html.indexOf('typetale-model-family.js') < html.indexOf('typetale-core.js'),
  'typetale-model-family.js 必须排在 typetale-core.js 之前',
);
assert.match(workbench, /workbenchShowScene/);
assert.match(workbench, /typetale:scene-shown/);
assert.match(workbench, /workspaceView\.hidden = active !== 'jimeng'/);
assert.match(workbench, /typetaleView\.hidden = active !== 'typetale'/);

for (const token of ['tt-rail', 'tt-drawer', 'ttDrawerClose', 'data-tt-drawer="provider"', 'data-tt-drawer="assets"', 'data-tt-drawer="jobs"']) {
  assert.ok(typetaleJs.includes(token), `typetale-workbench.js missing ${token}`);
}
// 字字动画场景：模型族与插件参数面板的关键控件
for (const token of [
  'ttProviderKind', 'ttProviderFamily', 'ttFamilyNote', 'renderFamilySelect',
  'ttShotFirstFrame', 'ttShotLastFrame', 'ttShotBatch', 'ttShotRound', 'ttShotNegative',
  'inspectActivePlugin', 'typetaleWritePluginConfig', 'tt-overflow-row',
  'familyOverrides', 'compiled.overflow',
]) assert.ok(typetaleJs.includes(token), `typetale-workbench.js missing ${token}`);
assert.ok(
  typetaleJs.includes('tt-plugin-blocked'),
  '桥接桩与 .pyd 插件必须在插件列表里被禁用，不能等到执行阶段才炸',
);

for (const token of [
  'PROJECT_STORAGE_PREFIX',
  'storageKeyFor(root)',
  'scopeAssetsToProject',
  'pruneShotAssetBindings',
  'state.assets.filter(asset => asset.kind === kind)',
  "row.className = `tt-asset-item",
  "$('#ttAssetKind').onchange = renderAssets",
  '请先选择项目；素材只会导入当前项目',
]) {
  assert.ok(typetaleJs.includes(token), `typetale-workbench.js missing ${token}`);
}
assert.ok(!typetaleJs.includes('localAssets'), 'typetale-workbench.js must not fall back to assets from another project');
for (const token of ['.tt-shot-params', '.tt-plugin-detail', '.tt-plugin-params', '.tt-overflow-row', '.tt-plugin-blocked']) {
  assert.ok(typetaleCss.includes(token), `typetale-workbench.css missing ${token}`);
}
for (const token of ['.tt-shell', '.tt-rail', '.tt-drawer{position:absolute', '.tt-drawer-body section[hidden]', '.tt-table', '.tt-shots-panel', '.tt-detail-panel', '.tt-side-panel', 'padding:0 24px 28px 0', 'border-radius:0 20px 20px 0']) {
  assert.ok(typetaleCss.includes(token), `typetale-workbench.css missing ${token}`);
}

for (const relative of [
  'jimeng-canvas-extension/typetale-model-family.js',
  'desktop-app/typetale-model-family.js',
  'jimeng-canvas-extension/typetale-core.js',
  'jimeng-canvas-extension/typetale-workbench.js',
  'jimeng-canvas-extension/typetale-workbench.css',
]) assert.ok(STATIC_FILES.has(relative), `${relative} must be served to browser clients`);

for (const method of [
  'typetaleReadState', 'typetaleWriteState', 'typetaleScanPlugins', 'typetaleChoosePluginDir',
  'typetaleExecute', 'typetaleQueryVideo', 'typetaleDownloadResult', 'typetaleOpenOutputDir',
  'typetaleInspectPlugin', 'typetaleReadPluginConfig', 'typetaleWritePluginConfig',
  'typetaleListModelFamilies', 'typetaleValidateModelFamily',
]) assert.match(preload, new RegExp(method));

assert.ok(packageJson.build.files.includes('typetale-core.js'));
assert.ok(packageJson.build.files.includes('typetale-model-family.js'));
// 插件宿主是 Python 脚本，不打进包里插件一个都跑不起来。
assert.ok(packageJson.build.files.includes('typetale-plugin-host/**'));
for (const file of ['runner.py', 'plugin_utils.py']) {
  assert.ok(fs.existsSync(path.join(import.meta.dirname, 'typetale-plugin-host', file)), `缺少插件宿主文件 ${file}`);
}
assert.ok(packageJson.build.files.includes('typetale-service.js'));
assert.ok(packageJson.build.files.includes('assets/**'));
assert.equal(packageJson.build.win.icon, 'assets/typetale-workbench.ico');
assert.ok(fs.existsSync(path.join(import.meta.dirname, 'assets', 'typetale-workbench.ico')));
assert.equal(
  fs.readFileSync(path.join(import.meta.dirname, 'typetale-core.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'typetale-core.js'), 'utf8'),
  'renderer 和主进程使用的 typetale-core.js 必须保持一致'
);
assert.equal(
  fs.readFileSync(path.join(import.meta.dirname, 'typetale-model-family.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'jimeng-canvas-extension', 'typetale-model-family.js'), 'utf8'),
  'renderer 和主进程使用的 typetale-model-family.js 必须保持一致'
);
assert.ok(packageJson.build.extraResources.some(item => item.to === 'jimeng-canvas-extension'));
assert.ok(packageJson.build.extraResources.some(item => item.to === 'desktop-app' && item.filter.includes('browser-bridge.js')));

const decodeLauncher=file=>{const bytes=fs.readFileSync(path.join(root,file));return bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8');};
const launcher=decodeLauncher('启动晓晓工作台.vbs'),alias=decodeLauncher('启动即梦工作台.vbs');
assert.ok(launcher.includes(["","dist","win-unpacked","晓晓的AI工作台.exe"].join(String.fromCharCode(92))),"固定使用本地最新成品");
assert.ok(!launcher.includes('GetExtensionName')&&!launcher.includes('electron.exe'),'不枚举exe或回退开发版');
assert.match(launcher,/env\("TEMP"\)/);assert.ok(launcher.includes('WORKBENCH_PROFILE_DIR'));
assert.ok(alias.includes('启动晓晓工作台.vbs'),'旧启动器统一转交固定入口');

for (const id of ['createProject', 'createTypetaleProject', 'emptyOpenProject', 'emptyOpenTypetaleProject', 'jimengProjects', 'typetaleProjects', 'typetaleProjectList']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `workbench.html missing ${id}`);
}
for (const token of [
  "workspace:normalizeWorkspace(item.workspace)",
  "project.workspace = 'jimeng'",
  "workbenchChooseProjectForScene",
  "typetaleOpenProject",
  "这个文件夹已经属于",
  "hasTypetaleState ? 'typetale'",
  "window.typetaleIsRunning?.()",
]) assert.ok(projectPage.includes(token), `project-page.js missing isolation token: ${token}`);
assert.ok(!typetaleJs.includes('legacyProjectPath'), 'TypeTale must not use the Jimeng legacy project fallback');
assert.ok(!typetaleJs.includes('jimeng-workbench-project'), 'TypeTale must not read the current Jimeng project');
assert.ok(typetaleJs.includes("pointer?.workspace === 'typetale'"), 'TypeTale current-project pointer must be workspace tagged');
assert.ok(typetaleJs.includes("window.workbenchChooseProjectForScene('typetale')"), 'TypeTale folder chooser must register scene ownership');
assert.ok(typetaleJs.includes('window.typetaleIsRunning = () => running'), 'TypeTale must block project switching while a batch is running');
assert.equal(projectModel.normalizeProject({}, 'C:\\legacy-project').workspace, null, 'legacy project stays unassigned until project-list migration');
assert.equal(projectModel.normalizeProject({workspace:'jimeng'}, 'C:\\jimeng-project').workspace, 'jimeng');
assert.equal(projectModel.normalizeProject({workspace:'typetale'}, 'C:\\typetale-project').workspace, 'typetale');
assert.equal(projectModel.normalizeProject({workspace:'unknown'}, 'C:\\invalid-project').workspace, null);
assert.ok(fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8').includes("hasTypetaleState = fs.existsSync(path.join(root, '.typetale', 'workbench.json'))"));

console.log('TypeTale scene navigation, model family UI, plugin params panel, static allowlist, IPC surface and launcher packaging passed');
