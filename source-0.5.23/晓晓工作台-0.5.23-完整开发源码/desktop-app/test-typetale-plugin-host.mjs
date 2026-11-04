// 插件宿主端到端测试：用一个按字字动画插件协议写的真插件，验证宿主把 context
// 交到 generate() 手里时字段、键类型、CWD、sys.path 都是对的。
//
// 这些东西错了不会在宿主侧报错，只会让插件静默拿到空值（比如 reference_images
// 的键变成字符串，插件就永远取不到首帧），所以必须真的把 Python 跑起来验。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const service = require('./typetale-service');
const core = require('./typetale-core');

const python = process.env.TYPETALE_PYTHON || 'python';
const probe = spawnSync(python, ['--version'], {encoding: 'utf8', windowsHide: true});
if (probe.error || probe.status !== 0) {
  console.log(`SKIPPED: 本机没有可用的 ${python}，插件宿主端到端测试未执行（不是通过，是没跑）`);
  process.exit(0);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typetale-plugin-host-'));
const app = {getPath: () => path.join(root, 'userData')};

// 插件目录层级必须是 <任意>/<类型目录>/<插件目录>/main.py —— plugin_utils 用
// 父目录名当插件类型来算 config.json 路径。
const pluginDir = path.join(root, 'plugins', 'video_plugins', 'probe_plugin');
fs.mkdirSync(pluginDir, {recursive: true});
fs.writeFileSync(path.join(pluginDir, 'main.py'), `# -*- coding: utf-8 -*-
import json, os, sys
from plugin_utils import load_plugin_config, update_plugin_param

_PLUGIN_FILE = __file__
_DEFAULTS = {"api_key": "", "model": "probe-model", "steps": 20}


def get_info():
    return {"name": "探针插件", "description": "验证宿主传参", "version": "9.9.9"}


def get_params():
    params = _DEFAULTS.copy()
    params.update(load_plugin_config(_PLUGIN_FILE))
    return params


def generate(context):
    progress = context.get('progress_callback')
    if progress:
        progress('探针开始')
    refs = context.get('reference_images') or {}
    # 真插件普遍用这一行判断要不要包成 {"参考图片MAP": ...}，键必须是 int。
    keys_are_int = bool(refs) and all(isinstance(key, int) for key in refs.keys())
    report = {
        "keys_are_int": keys_are_int,
        "ref0": refs.get(0),
        "first_frame_path": context.get('first_frame_path'),
        "end_frame_path": context.get('end_frame_path'),
        "batch_num": context.get('batch_num'),
        "viewer_index": context.get('viewer_index'),
        "generation_round": context.get('generation_round'),
        "output_position": context.get('output_position'),
        "is_video": context.get('is_video'),
        "negative_prompt": context.get('negative_prompt'),
        "selected_characters": context.get('selected_characters'),
        "model_family_id": (context.get('model_family') or {}).get('id'),
        "plugin_params": context.get('plugin_params'),
        "params_from_config": get_params(),
        "cwd": os.getcwd(),
        "has_plugin_utils": True,
    }
    out = os.path.join(context.get('project_path', '.'), 'report.json')
    with open(out, 'w', encoding='utf-8') as handle:
        json.dump(report, handle, ensure_ascii=False)
    if progress:
        progress('探针结束')
    return [out]
`, 'utf8');

// 故意写成致命错误的插件：PLUGIN_ERROR::: 前缀表示「别再重试」。
const fatalDir = path.join(root, 'plugins', 'video_plugins', 'fatal_plugin');
fs.mkdirSync(fatalDir, {recursive: true});
fs.writeFileSync(path.join(fatalDir, 'main.py'),
  'def generate(context):\n    raise Exception("PLUGIN_ERROR:::API Key 未设置")\n', 'utf8');

// 声称生成了文件却没落盘的插件：吞掉自己异常的典型表现，不能算成功。
const lyingDir = path.join(root, 'plugins', 'video_plugins', 'lying_plugin');
fs.mkdirSync(lyingDir, {recursive: true});
fs.writeFileSync(path.join(lyingDir, 'main.py'),
  'def generate(context):\n    return ["C:/definitely/not/here.mp4"]\n', 'utf8');

try {
  // ---- 扫描：分类、UI、桥接桩识别 ----------------------------------------
  fs.writeFileSync(path.join(pluginDir, 'info.json'), JSON.stringify({name: '探针插件', model_family_ui: 'self'}), 'utf8');
  const stubDir = path.join(root, 'plugins', 'image_plugins', 'bridge_stub');
  fs.mkdirSync(stubDir, {recursive: true});
  fs.writeFileSync(path.join(stubDir, 'main.py'), "# Auto-generated bridge for the Cython-compiled module 'main'.\n", 'utf8');
  const scan = await service.scanPluginFolder(path.join(root, 'plugins'));
  assert.equal(scan.ok, true);
  const probePlugin = scan.plugins.find(plugin => plugin.id === 'probe_plugin');
  assert.equal(probePlugin.category, 'video_plugins');
  assert.equal(probePlugin.modelFamilyUi, 'self');
  assert.equal(probePlugin.hasSource, true);
  const stubPlugin = scan.plugins.find(plugin => plugin.id === 'bridge_stub');
  assert.equal(stubPlugin.bridgeStub, true, '桥接桩必须被标出来：拷出来单独跑一定崩');
  assert.equal(stubPlugin.hasSource, false);

  // ---- inspect：读插件自己的 get_info / get_params ------------------------
  const inspected = await service.inspectPlugin({}, pluginDir, app);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.info.name, '探针插件');
  assert.equal(inspected.info.version, '9.9.9');
  assert.equal(inspected.params.model, 'probe-model');
  assert.equal(inspected.hasGenerate, true);

  // ---- 参数落盘路径与 plugin_utils 计算的一致 ----------------------------
  const written = await service.writePluginConfig(app, pluginDir, {api_key: 'secret-key', steps: 35});
  assert.equal(written.path, service.pluginConfigPath(app, pluginDir));
  assert.ok(written.path.includes(path.join('user_resources', 'plugins', 'video_plugins', 'probe_plugin')));
  // 空值覆盖保护：已有的 api_key 不能被空串冲掉。
  const reWritten = await service.writePluginConfig(app, pluginDir, {api_key: ''});
  assert.equal(reWritten.params.api_key, 'secret-key');
  assert.deepEqual(reWritten.skippedEmptyOverwrite, ['api_key']);

  // ---- 端到端执行 ---------------------------------------------------------
  const projectPath = path.join(root, 'project');
  fs.mkdirSync(projectPath, {recursive: true});
  const assets = [
    core.normalizeAsset({id: 'c1', name: '苏喻枝', kind: 'characters', path: '人物/苏喻枝.png'}),
    core.normalizeAsset({id: 's1', name: '办公室', kind: 'scenes', path: '场景/办公室.png'}),
    core.normalizeAsset({id: 'f1', name: '首帧', kind: 'other', path: '帧/first.png'}),
  ];
  const shot = core.normalizeShot({
    id: '05', prompt: '@苏喻枝 走进 @办公室', negativePrompt: '模糊',
    frames: {first: 'f1'}, batchNum: 2, viewerIndex: 8, generationRound: 3,
    bindings: {assetIds: ['c1', 's1', 'f1']},
  });
  const run = await service.execute({
    projectPath,
    provider: {id: 'p1', name: '探针', type: 'typetale-plugin', kind: 'video', pluginPath: pluginDir, modelFamily: 'jimeng_2_0'},
    shot,
    assets,
  }, app);
  assert.equal(run.response.ok, true);
  assert.deepEqual(run.response.missingFiles, []);
  assert.deepEqual(run.response.progress, ['探针开始', '探针结束'], 'progress_callback 必须由宿主注入并回传');

  const report = JSON.parse(fs.readFileSync(path.join(projectPath, 'report.json'), 'utf8'));
  assert.equal(report.has_plugin_utils, true, '插件必须能 import plugin_utils');
  assert.equal(report.keys_are_int, true, 'reference_images 的键必须是 int，否则插件取不到 参考图片MAP/首帧');
  assert.equal(report.ref0, path.resolve(projectPath, '人物/苏喻枝.png'));
  assert.equal(report.first_frame_path, path.resolve(projectPath, '帧/first.png'));
  assert.equal(report.end_frame_path, '');
  assert.equal(report.batch_num, 2);
  assert.equal(report.viewer_index, 8);
  assert.equal(report.generation_round, 3);
  assert.deepEqual(report.output_position, [0, 1]);
  assert.equal(report.is_video, true);
  assert.equal(report.negative_prompt, '模糊');
  assert.deepEqual(report.selected_characters, ['苏喻枝']);
  assert.equal(report.model_family_id, 'jimeng_2_0');
  // CWD 决定 config.json 的位置：跟着项目走的话每个项目都要重填一次 API Key。
  assert.equal(path.resolve(report.cwd), path.resolve(service.pluginDataRoot(app)));
  assert.equal(report.params_from_config.api_key, 'secret-key');
  assert.equal(report.params_from_config.steps, 35);

  // ---- 致命错误：剥掉 PLUGIN_ERROR::: 前缀并打上 fatal --------------------
  await assert.rejects(
    () => service.execute({projectPath, provider: {type: 'typetale-plugin', kind: 'video', pluginPath: fatalDir}, shot, assets}, app),
    error => {
      assert.equal(error.message, 'API Key 未设置');
      assert.equal(error.fatal, true);
      return true;
    },
  );

  // ---- 返回了路径但文件不存在：必须报出来，不能当成功 --------------------
  const lying = await service.execute({projectPath, provider: {type: 'typetale-plugin', kind: 'video', pluginPath: lyingDir}, shot, assets}, app);
  assert.deepEqual(lying.response.files, []);
  assert.equal(lying.response.missingFiles.length, 1);

  console.log('TypeTale 插件宿主：插件扫描分类、get_info/get_params、config 落盘、context 协议字段、int 键、CWD、progress 与致命错误全部通过');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
