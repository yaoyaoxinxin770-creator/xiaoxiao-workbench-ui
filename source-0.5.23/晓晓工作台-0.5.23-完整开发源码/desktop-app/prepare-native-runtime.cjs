const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'../infinite-canvas/web'),dest=path.join(__dirname,'infinite-canvas-web');
function copy(a,b){fs.mkdirSync(b,{recursive:true});for(const item of fs.readdirSync(a,{withFileTypes:true})){const from=path.join(a,item.name),to=path.join(b,item.name);if(fs.statSync(from).isDirectory())copy(from,to);else fs.copyFileSync(from,to);}}
copy(path.join(source,'.next/standalone'),dest);copy(path.join(source,'public'),path.join(dest,'public'));copy(path.join(source,'.next/static'),path.join(dest,'.next/static'));
console.log('Prepared original Next standalone frontend with native personal routes.');
