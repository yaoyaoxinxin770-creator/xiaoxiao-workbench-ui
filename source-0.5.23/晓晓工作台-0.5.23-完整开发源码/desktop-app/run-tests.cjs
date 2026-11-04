// Enumerate the active source suites explicitly; output/ contains archived historical snapshots.
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const files=['jimeng-canvas-extension','desktop-app'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(n=>/^test-.*\.mjs$/.test(n)&&!['test-video-share.mjs','test-video-share-package.mjs'].includes(n)).map(n=>path.join(root,dir,n))).sort();
console.log('范围排除（非通过）：desktop-app/test-video-share.mjs、desktop-app/test-video-share-package.mjs；当前仅验收本机个人版。');
let passed=0,skippedCount=0;const failures=[];
for(const file of files){const r=spawnSync(process.execPath,[file],{cwd:path.dirname(file),encoding:'utf8',timeout:180000});const skipped=/^\s*(?:SKIP(?:PED)?\b|测试[^\n]*跳过|跳过[^\n]*测试)|^ok[^\n]*#\s*SKIP\b/im.test((r.stdout||'')+'\n'+(r.stderr||''));if(r.status===0&&!r.error&&!skipped){passed++;console.log('PASS '+path.relative(root,file));if(file.includes('desktop-app'))console.log(r.stdout.trim());}else{if(skipped)skippedCount++;failures.push(path.relative(root,file));console.log('FAIL '+file+'\n'+r.stdout+'\n'+r.stderr+'\n'+(r.error||'')+(skipped?'\nDetected skipped test; suite must fail.':''));}}
console.log(JSON.stringify({discovered:files.length,executed:passed+failures.length,passed,failed:failures.length,skipped:skippedCount,failures},null,2));
process.exitCode=failures.length?1:0;
