import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'infinite-canvas-ui-'));
const env = {...process.env,INFINITE_CANVAS_UI_TEST_ROOT:temp};
delete env.ELECTRON_RUN_AS_NODE;
try {
  const result = spawnSync(require('electron'),['--disable-gpu',path.join(import.meta.dirname,'infinite-canvas-ui-check.cjs')],{env,encoding:'utf8',timeout:90000,windowsHide:true});
  process.stdout.write(result.stdout||'');
  process.stderr.write(result.stderr||'');
  if(result.error)throw result.error;
  assert.equal(result.status,0,'无限画布真实 Electron 界面验收');
  assert.match(result.stdout,/原生本体验收通过/,'必须执行到全部界面断言完成，不能启动后提前退出');
} finally {
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(temp).startsWith('infinite-canvas-ui-'));
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
