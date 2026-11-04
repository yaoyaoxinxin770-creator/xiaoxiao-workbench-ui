import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'jimeng-ui-test-'));
env.JIMENG_ASSET_TEST_ROOT=temporary;
let result;
try { result=spawnSync(require('electron'),['--disable-gpu','--disable-software-rasterizer',path.join(import.meta.dirname,'asset-ui-check.cjs')],{env,encoding:'utf8',timeout:90000}); }
finally {const resolved=path.resolve(temporary);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('jimeng-ui-test-'));fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.error)throw result.error;
if(result.status!==0)throw Error('Electron asset UI test failed: '+result.status);
