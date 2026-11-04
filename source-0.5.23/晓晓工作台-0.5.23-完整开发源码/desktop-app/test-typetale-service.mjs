import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const service = require('./typetale-service');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typetale-workbench-'));
const app = {getPath: () => path.join(root, 'userData')};

try {
  const pluginDir = path.join(root, 'plugins', 'video_plugins', 'demo-plugin');
  fs.mkdirSync(pluginDir, {recursive:true});
  fs.writeFileSync(path.join(pluginDir, 'main.py'), 'def generate(context):\n    return context\n', 'utf8');
  fs.writeFileSync(path.join(pluginDir, 'info.json'), JSON.stringify({name:'演示插件', scope:'project'}), 'utf8');
  fs.mkdirSync(path.join(pluginDir, 'ui'), {recursive:true});
  fs.writeFileSync(path.join(pluginDir, 'ui', 'index.html'), '<html></html>', 'utf8');

  const scan = await service.scanPluginFolder(path.join(root, 'plugins'));
  assert.equal(scan.ok, true);
  assert.equal(scan.plugins.length, 1);
  assert.equal(scan.plugins[0].name, '演示插件');
  assert.equal(scan.plugins[0].hasUi, true);

  const written = await service.writeState(root, {
    projectPath:root,
    assets:[
      {id:'local-scene', name:'本作品场景', kind:'scenes', path:'场景/本作品场景.png'},
      {id:'foreign-char', name:'其他作品角色', kind:'characters', path:'F:/other-project/人物/角色B.png'},
    ],
    shots:[{id:'01', title:'镜头一', prompt:'@角色A 出场', bindings:{assetIds:['local-scene', 'foreign-char']}}],
    providers:[{id:'p1', name:'CLI', type:'cli', command:process.execPath, argsTemplate:['-e', 'console.log("{shotId}")']}],
  }, app);
  assert.equal(written.ok, true);
  assert.ok(fs.existsSync(written.path));
  assert.deepEqual(written.state.assets.map(asset => asset.id), ['local-scene']);
  assert.deepEqual(written.state.shots[0].bindings.assetIds, ['local-scene']);
  const read = await service.readState(root, app);
  assert.equal(read.state.projectPath, root);
  assert.equal(read.state.shots[0].id, '01');
  assert.deepEqual(read.state.assets.map(asset => asset.id), ['local-scene']);
  assert.equal(read.state.providers[0].type, 'cli');

  const dryRun = await service.execute({
    projectPath:root,
    provider:{type:'generic-video', baseUrl:'https://relay.example.com', model:'demo'},
    shot:{id:'01', prompt:'hello'},
    compiled:{prompt:'hello', references:[], referenceMap:{}},
    dryRun:true,
  }, app);
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.request.url, 'https://relay.example.com/v1/videos');

  const isolatedRun = await service.execute({
    projectPath:root,
    provider:{type:'generic-video', baseUrl:'https://relay.example.com', model:'demo'},
    shot:{id:'02', prompt:'@其他作品角色 出场', bindings:{assetIds:['foreign-char']}},
    assets:[{id:'foreign-char', name:'其他作品角色', kind:'characters', path:'F:/other-project/人物/角色B.png'}],
    dryRun:true,
  }, app);
  assert.equal(isolatedRun.ok, true);
  assert.equal(isolatedRun.request.body.reference_images.length, 0);
  assert.deepEqual(isolatedRun.request.body.metadata.missing_mentions, ['其他作品角色']);

  const cli = await service.execute({
    projectPath:root,
    provider:{type:'cli', command:process.execPath, argsTemplate:['-e', 'console.log("{shotId}")']},
    shot:{id:'01', prompt:'hello'},
    compiled:{prompt:'hello', references:[], referenceMap:{}},
  }, app);
  assert.equal(cli.response.ok, true);
  assert.equal(cli.response.stdout.trim(), '01');
  console.log('TypeTale state store, plugin scan and CLI execution passed');
} finally {
  fs.rmSync(root, {recursive:true, force:true});
}
