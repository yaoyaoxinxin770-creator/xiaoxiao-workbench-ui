import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),temp=fs.mkdtempSync(path.join(os.tmpdir(),'workbench-startup-'));
const env={...process.env,WORKBENCH_PROFILE_DIR:temp};delete env.ELECTRON_RUN_AS_NODE;
try{
  const result=spawnSync(require('electron'),['--disable-gpu',path.join(import.meta.dirname,'workbench-startup-check.cjs')],{env,encoding:'utf8',timeout:90000,windowsHide:true});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;
  assert.equal(result.status,0);assert.match(result.stdout,/启动恢复验收通过/,'不能静默略过原生双实例验证');
}finally{assert.ok(path.basename(temp).startsWith('workbench-startup-'));fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
