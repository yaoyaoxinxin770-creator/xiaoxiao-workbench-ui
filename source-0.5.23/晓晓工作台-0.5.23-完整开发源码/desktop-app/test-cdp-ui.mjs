import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jimeng-cdp-ui-'));
env.JIMENG_CDP_UI_TEST_ROOT=temp;
try{
  const result=spawnSync(require('electron'),['--disable-gpu',path.join(import.meta.dirname,'cdp-ui-check.cjs')],{env,encoding:'utf8',timeout:90000,windowsHide:true});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  if(result.error)throw result.error;assert.equal(result.status,0,'Production Electron CDP settings smoke test');assert.match(result.stdout,/Production Electron entry:.*PASS/,'必须执行到验收结束');
}finally{
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('jimeng-cdp-ui-'));
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
