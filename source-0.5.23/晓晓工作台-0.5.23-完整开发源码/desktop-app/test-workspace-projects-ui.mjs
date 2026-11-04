import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),temp=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-tabs-ui-'));
const env={...process.env,WORKSPACE_TABS_TEST_ROOT:temp};delete env.ELECTRON_RUN_AS_NODE;
try{const result=spawnSync(require('electron'),['--disable-gpu',path.join(import.meta.dirname,'workspace-projects-ui-check.cjs')],{env,encoding:'utf8',timeout:120000,windowsHide:true});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;assert.equal(result.status,0);assert.match(result.stdout,/多项目原生界面验收通过/);}finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('workspace-tabs-ui-'));fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
