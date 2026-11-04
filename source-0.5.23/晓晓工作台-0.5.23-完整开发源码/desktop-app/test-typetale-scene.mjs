// 在真 Electron 里跑字字动画场景的渲染层冒烟检查（见 typetale-ui-check.cjs）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const env = {...process.env};
delete env.ELECTRON_RUN_AS_NODE;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typetale-scene-ui-'));
env.TYPETALE_UI_TEST_ROOT = temp;

try {
  const result = spawnSync(require('electron'), ['--disable-gpu', path.join(import.meta.dirname, 'typetale-ui-check.cjs')], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  assert.equal(result.status, 0, '字字动画场景渲染层冒烟检查');
} finally {
  assert.ok(
    path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('typetale-scene-ui-'),
    '只删自己建的临时目录',
  );
  fs.rmSync(temp, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
}
