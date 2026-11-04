// Desktop-only asset metadata and filesystem operations. No execution integration.
const fs = require('fs');
const path = require('path');
const {IMAGE_EXT, AUDIO_EXT, FOLDER_ALIASES, characterNamesFromPrompt} = require('./project-assets');
const categories = ['characters','groups','scenes','props','other','pending','audio'];
const metaKeys = ['assetOverrides','segmentAssetBindings','segmentCharacterBindings','segmentAudioBindings','audioBindings','folderLinks','folderSelection','assetExcludedPaths'];
function inferCategory(source, requested = 'pending') {
  if (requested && requested !== 'pending' && requested !== 'all' && requested !== 'auto') return requested;
  const text = String(source || '').replace(/\\/g, '/').toLowerCase();
  const parts = text.split('/');
  if (parts.some(p => ['人物','角色','人物图','角色图','characters'].includes(p) || p.startsWith('人物') || p.startsWith('角色'))) return 'characters';
  if (parts.some(p => ['场景','背景','场景图','背景图','scenes'].includes(p) || p.startsWith('场景') || p.startsWith('背景'))) return 'scenes';
  if (parts.some(p => ['道具','物件','道具图','props'].includes(p) || p.startsWith('道具') || p.startsWith('物件'))) return 'props';
  if (parts.some(p => ['群像','合照'].includes(p)) || /群像|合照|多人同框/.test(text)) return 'groups';
  const name = parts.at(-1) || '';
  if (/角色|人物|人形|服装|肖像/.test(name)) return 'characters';
  if (/场景|背景|餐厅|客厅|卧室|街道|森林|室内|室外/.test(name)) return 'scenes';
  if (/道具|玉佩|令牌|项链|钥匙|法器|物件/.test(name)) return 'props';
  return 'pending';
}
function inside(root, relative, mustExist = true) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw Error('需要项目内相对路径');
  const config=read(root), linked=relative.startsWith('@linked/');
  if((config.assetExcludedPaths||[]).includes(relative)) throw Error('素材引用已清空，请重新绑定');
  if(linked) {
    const [,id,...parts]=relative.split('/');
    const link=(config.folderLinks||[]).find(item=>item.id===id);
    if(!link || !parts.length) throw Error('素材文件夹未绑定');
    if(link.files && !link.files.some(name=>name.toLowerCase()===parts.join('/').toLowerCase())) throw Error('该文件未被选中绑定');
    root=link.path;relative=parts.join('/');
  }
  const base = fs.realpathSync(root), file = path.resolve(base, relative);
  const rel = path.relative(base, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).includes('.jimeng')) throw Error('路径不在项目素材范围内');
  let check = file;
  while (!fs.existsSync(check)) { if (mustExist) throw Error('素材已不存在，请刷新'); check = path.dirname(check); }
  const actual = path.relative(base, fs.realpathSync(check));
  if (actual.startsWith('..') || path.isAbsolute(actual)) throw Error('拒绝访问项目外链接');
  if(linked && relative.split(/[\\/]/).length!==1) throw Error('绑定文件夹只读取最外层文件');
  return file;
}
function configFile(root) { const dir=path.join(root,'.jimeng'); if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink()) throw Error('配置目录不能是链接'); return path.join(dir,'project.json'); }
function parseConfigFile(file) {
  if(!fs.existsSync(file)) return null;
  const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim();
  if(!text) return null;
  try {
    const value=JSON.parse(text);
    return value&&!Array.isArray(value)&&typeof value==='object'?value:null;
  } catch { return null; }
}
function read(root) {
  const file=configFile(root);
  if (!fs.existsSync(file)) return {};
  const value=parseConfigFile(file);
  if(value)return value;
  const candidates=[file+'.bak',file+'.tmp',...fs.readdirSync(path.dirname(file)).filter(name=>name.startsWith('project.json.')&&name.endsWith('.tmp')).map(name=>path.join(path.dirname(file),name))]
    .filter(candidate=>fs.existsSync(candidate)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
  for(const candidate of candidates){
    const recovered=parseConfigFile(candidate);
    if(!recovered)continue;
    const broken=file+`.corrupt-${Date.now()}`;fs.copyFileSync(file,broken);write(root,recovered);return recovered;
  }
  const broken=file+`.corrupt-${Date.now()}`;fs.copyFileSync(file,broken);write(root,{});return {};
}
function write(root, config) {
  const file=configFile(root); fs.mkdirSync(path.dirname(file),{recursive:true});
  const previous=parseConfigFile(file);if(previous)fs.writeFileSync(file+'.bak',JSON.stringify(previous,null,2));
  const temporary=file+`.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {fs.writeFileSync(temporary,JSON.stringify(config,null,2));fs.renameSync(temporary,file);} finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function collect(root, analyzer, source='', options={}) {
  const started=performance.now(), config=read(root), assets=[], warnings=[];
  const roles=characterNamesFromPrompt(source,analyzer);
  const overrides=config.folderRecognitionOverrides||{};
  const mapped=Object.fromEntries(Object.keys(FOLDER_ALIASES).map(k=>[k,overrides[k]||config.folders?.[k]?.relativePath||'']));
  function visit(dir,inherited='other',link=null) {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if(entry.name.startsWith('.') || entry.name==='node_modules' || entry.isSymbolicLink()) continue;
      const full=path.join(dir,entry.name), relativePath=link ? '@linked/'+link.id+'/'+path.relative(link.path,full).split(path.sep).join('/') : path.relative(root,full).split(path.sep).join('/');
      if(entry.isDirectory()) {
        if(link) continue;
        const name=entry.name.trim().toLowerCase();
        const kind=Object.keys(FOLDER_ALIASES).find(k=>mapped[k]===relativePath) || Object.keys(FOLDER_ALIASES).find(k=>FOLDER_ALIASES[k].some(n=>n.toLowerCase()===name)) || ({'群像':'groups','其他':'other','待确认':'pending'})[name];
        if(kind==='videoOutput') continue;
        try { visit(full,link ? inherited : kind || inherited,link); } catch(e) { warnings.push(`${relativePath}：${e.message}`); }
        continue;
      }
      const ext=path.extname(entry.name).toLowerCase(), audio=AUDIO_EXT.has(ext);
      if(!audio&&!IMAGE_EXT.has(ext)) continue;
      if(link?.files && !link.files.some(name=>name.toLowerCase()===entry.name.toLowerCase())) continue;
      if((config.assetExcludedPaths||[]).includes(relativePath)) continue;
      const manual=config.assetOverrides?.[relativePath]||{};
      const displayName=manual.displayName || path.basename(entry.name,ext);
      const role=Object.hasOwn(manual,'role') ? manual.role : analyzer.matchCharacterPrefix(displayName,roles);
      if(link && (link.kind==='audio' ? !audio : audio)) continue;
      let kind=audio?'audio':link ? link.kind : (role ? (analyzer.isLikelyGroupCharacter(role)?'groups':'characters') : inherited);
      if(!link && !audio && (kind==='characters'&&!role || /^(ChatGPT\s*Image|IMG[_-]|image[_-])/i.test(displayName))) kind='pending';
      if(!audio && /群像|合照|多人同框/.test(displayName)) kind='groups';
      if(!audio && categories.includes(manual.category)) kind=manual.category==='audio'?'other':manual.category;
      const stat=fs.statSync(full);
      assets.push({relativePath,displayName,role,kind,mediaType:audio?'audio':'image',size:stat.size,mtimeMs:stat.mtimeMs,...(link?{sourcePath:full,folderLinkId:link.id}:{})});
    }
  }
  if(!config.folderSelection) visit(root);
  for(const link of config.folderLinks||[]) {
    try { visit(fs.realpathSync(link.path),link.kind,link); } catch(e) { warnings.push(`${link.path}：文件夹不可用，请重新绑定`); }
  }
  const before=JSON.stringify(config.segmentAssetBindings||{});
  (options.autoBind===false?[]:splitSourceSegments(source)).forEach(({id,prompt},index)=>{
    const key=`video:${id}:${index}`;
    const match=matchSceneAsset(prompt,assets);
    if(match&&!(config.segmentAssetBindings?.[key]?.scenes||[]).length){
      config.segmentAssetBindings||={};config.segmentAssetBindings[key]||={characters:[],scenes:[],other:[]};
      config.segmentAssetBindings[key].scenes=[match.relativePath];
    }
  });
  if(before!==JSON.stringify(config.segmentAssetBindings||{}))write(root,config);
  return {assets,roles:[...new Set([...roles,...assets.map(a=>a.role).filter(Boolean)])],config,warnings,scanMs:Math.round((performance.now()-started)*100)/100};
}
// 切分必须和工作台里的 parseSource 完全一致，否则服务端算出来的分镜键和界面
// 对不上，自动场景绑定就落不到正确的分镜上。模板可能写成【视频编号06】也可能
// 写成“视频编号06”，旧正则只认后者，于是带【】的模板一条都切不出来，场景自动
// 匹配从来没运行过。
function splitSourceSegments(source) {
    const lines = String(source || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map(line => /^[ \t]*(?:\\?\x60){3,}/.test(line) ? line.replace(/\\(?=\x60)/g, '') : line);
    const fenceMark = /^[ \t]*(\x60{3,}|~{3,})(.*)$/;
    let start = 0, end = lines.length, level = 0, fence = '';
    // Only the third section contains importable video prompts; ignore headings inside code blocks.
    for (const [i, line] of lines.entries()) {
        const mark = fenceMark.exec(line);
        if (mark) {
            if (!fence)
                fence = mark[1];
            else if (mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim())
                fence = '';
            continue;
        }
        if (fence)
            continue;
        const heading = /^[ \t]{0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
        if (!heading)
            continue;
        if (!level && /^第[三3]部分\s*[:：]\s*纯视频生成提示词\s*$/.test(heading[2].replace(/\*/g, '').replace(/\s+#+\s*$/, '').trim())) {
            start = i + 1;
            level = heading[1].length;
        }
        else if (level && heading[1].length <= level) {
            end = i;
            break;
        }
    }
    const scoped = lines.slice(start, end), blocks = [], plain = [];
    let language = '', body = [], hasFences = false;
    fence = '';
    for (const line of scoped) {
        const footer = /^\s*#{1,6}\s+(?:想请你确认|请你确认|请确认|补充说明|附录)(?:\s|$|[:：])/.test(line);
        if (footer && (!fence || /^\s*---+\s*$/.test(body.filter(l => l.trim()).at(-1) || '')))
            break;
        const mark = fenceMark.exec(line);
        if (!fence) {
            if (mark) {
                fence = mark[1];
                language = mark[2].trim();
                body = [];
                hasFences = true;
            }
            else
                plain.push(line);
            continue;
        }
        if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) {
            if (/^(?:plaintext|plain|text|txt|prompt)?$/i.test(language))
                blocks.push(body.join('\n'));
            fence = '';
        }
        else
            body.push(line);
    }
    if (fence && /^(?:plaintext|plain|text|txt|prompt)?$/i.test(language) && body.length)
        blocks.push(body.join('\n').replace(/\n[ \t]*(?:---+|\*\*\*+)[ \t]*$/, ''));
    const sources = hasFences ? blocks : [plain.filter(line => !/^\s*(?:\*{0,2}#{1,6}\s*|\*{2}\s*)第\d+(?:集第\d+)?组/.test(line)).join('\n')];
    return sources.flatMap(source => {
        const normalized = source.trim(), videos = [...normalized.matchAll(/^[ \t]*【?[ \t]*视频编号[ \t]*[:：]?[ \t]*([Vv]?\d+(?:-\d+)*)[^\n]*/gm)];
        if (!videos.length)
            return [];
        const specs = [...normalized.matchAll(/^[ \t]*【项目规格】/gm)].map(match => match.index);
        // Retain the specifications-before-number layout used by older plain-text prompts.
        const boundaries = specs.length && specs[0] < videos[0].index ? specs : videos.map(match => match.index);
        return boundaries.map((begin, index) => {
            const prompt = normalized.slice(begin, boundaries[index + 1] ?? normalized.length).trim().replace(/\n[ \t]*---+[ \t]*$/, '').trim();
            const match = /^[ \t]*【?[ \t]*视频编号[ \t]*[:：]?[ \t]*([Vv]?\d+(?:-\d+)*)[^\n]*/m.exec(prompt);
            return match ? { id: match[1], prompt } : null;
        }).filter((item) => Boolean(item));
    });
}
// 不同模板声明场景的位置不一样：有的写在首行表头“｜场景：庄园花丛｜”，有的只
// 不同模板声明场景的位置不一样：有的写在首行表头“｜场景：庄园花丛｜”，有的只
// 不同模板声明场景的位置不一样：有的写在首行表头“｜场景：庄园花丛｜”，有的只
// 写在【场景与连续状态】小节里“场景：主卧·夜·内（…）：大床…”。后者以前完全
// 匹配不到，因为只看了第一行。
function sceneDeclarations(prompt){
  const found=[];
  const push=(value,priority)=>{if(value&&String(value).trim())found.push({value:String(value).trim(),priority});};
  push((prompt.match(/场景母版ID\s*[=:：]\s*([^；;\n｜|]+)/)||[])[1],0);
  const lines=String(prompt||'').split('\n');
  push((lines[0].match(/场景\s*[:：]\s*([^｜|；;\n]+)/)||[])[1],1);
  let inSceneBlock=false;
  for(const raw of lines.slice(1)){
    const line=raw.trim();
    if(/^【[^】]*】/.test(line)){inSceneBlock=/^【[^】]*场景[^】]*】/.test(line);continue;}
    const match=line.match(/(?:^|[|｜])\s*场景\s*[:：]\s*([^｜|；;]+)/);
    if(match){for(const ref of match[1].matchAll(/(?:参照|参考)\s*【([^】]+)】/g))push(ref[1],0);push(match[1],inSceneBlock?2:3);}
  }
  return found.sort((a,b)=>a.priority-b.priority).map(item=>item.value);
}
// “主卧·夜·内（记忆闪回结束）：大床…”里真正的场景名是“主卧”，但“宴会厅附属·
// 狭小休息隔间”本身就带“·”。所以按 · 从长到短逐段回退，取第一个能精确对上的，
// 长的优先——这样“宴会厅附属·狭小休息隔间”不会被误截成“宴会厅附属”。
function sceneNameCandidates(value){
  const text=String(value||'').trim();
  const ladder=head=>{
    const parts=String(head||'').split(/[·・]/).map(part=>part.trim()).filter(Boolean);
    const out=[];
    for(let take=parts.length;take>=1;take-=1)out.push(parts.slice(0,take).join('·'));
    return out;
  };
  // 两种切法都要试：素材名自己可能带括号（“宋宅主卧(管家破门之后)”），
  // 也可能是提示词在括号里写补充说明（“主卧·夜·内（记忆闪回结束）”）。
  const keepBrackets=(text.split(/[：:，,。；;]/)[0]||'').trim();
  const dropBrackets=(text.split(/[（(：:，,。；;]/)[0]||'').trim();
  return [...new Set([text,keepBrackets,...ladder(keepBrackets),dropBrackets,...ladder(dropBrackets)].filter(Boolean))];
}
function matchSceneAsset(prompt,assets){
  // 剥掉 SC01 / S01 / 03- 这类编号前缀再比对。
  const normalize=value=>String(value||'').normalize('NFKC').replace(/^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u,'').replace(/[\s·_-]/g,'').toLowerCase();
  const scenes=assets.filter(a=>a.kind==='scenes'&&a.mediaType==='image');
  const namesOf=asset=>[asset.displayName,asset.relativePath.split('/').pop().replace(/\.[^.]+$/,'')];
  const declarations=sceneDeclarations(prompt);
  // 第一轮：整名相等。“主卧”绝不能命中“主卧浴室”或“宋宅主卧(管家破门之后)”。
  for(const declaration of declarations){
    for(const candidate of sceneNameCandidates(declaration)){
      const target=normalize(candidate);
      if(!target)continue;
      const hits=scenes.filter(asset=>namesOf(asset).some(name=>normalize(name)===target));
      if(hits.length===1)return hits[0];
      if(hits.length>1)return null;   // 同名多张时不猜，交给人工绑定
    }
  }
  // 第二轮：整名对不上时按首段前缀回退。提示词写“月亮街·两年前雨夜·外”，素材叫
  // “月亮街雨夜”——首段“月亮街”已经足够指认，而且只有它一张以此开头。
  for(const declaration of declarations){
    const head=(String(declaration).split(/[（(：:，,。；;]/)[0]||'').trim();
    const tokens=head.split(/[·・]/).map(part=>part.trim()).filter(Boolean);
    if(!tokens.length)continue;
    const prefix=normalize(tokens[0]);
    if(prefix.length<2)continue;      // 一个字的前缀太容易撞车，不用
    const hits=scenes.filter(asset=>namesOf(asset).some(name=>normalize(name).startsWith(prefix)));
    if(!hits.length)continue;
    if(hits.length===1)return hits[0];
    // 同一前缀多张时，看还有哪些后续段落出现在素材名里，必须分出唯一的最高分。
    const scored=hits.map(asset=>({
      asset,
      score:tokens.slice(1).filter(token=>namesOf(asset).some(name=>normalize(name).includes(normalize(token)))).length,
    })).sort((a,b)=>b.score-a.score);
    if(scored[0].score>0&&(!scored[1]||scored[0].score>scored[1].score))return scored[0].asset;
  }
  return null;
}
function edit(root, relative, patch) {
  inside(root,relative); const config=read(root), changes={};
  for(const key of ['displayName','role']) if(Object.hasOwn(patch,key)) { if(typeof patch[key]!=='string'||patch[key].length>200) throw Error('名称过长或无效'); changes[key]=patch[key].trim(); }
  if(patch.category!==undefined) { if(!categories.includes(patch.category)) throw Error('无效分类'); changes.category=patch.category; }
  if (['__proto__','constructor','prototype'].includes(changes.role)) throw Error('无效角色名');
  config.assetOverrides||={}; config.assetOverrides[relative]={...config.assetOverrides[relative],...changes};
  if(patch.audio!==undefined) {
    const role=changes.role ?? config.assetOverrides[relative].role;
    if(!role) throw Error('先填写角色名称再绑定音频');
    config.audioBindings||={};
    if(patch.audio) { const file=inside(root,patch.audio); if(!AUDIO_EXT.has(path.extname(file).toLowerCase())) throw Error('不是音频文件'); config.audioBindings[role]=patch.audio; }
    else delete config.audioBindings[role];
  }
  write(root,config); return config;
}
function bind(root, segmentKey, zone, relative, remove=false) {
  if(!['characters','scenes','other'].includes(zone)||typeof segmentKey!=='string'||!segmentKey||segmentKey.length>300||['__proto__','constructor','prototype'].includes(segmentKey)) throw Error('无效分镜');
  if(!remove) inside(root,relative);
  const config=read(root); config.segmentAssetBindings||={};
  const segment=config.segmentAssetBindings[segmentKey]||={characters:[],scenes:[],other:[]};
  segment[zone]=(segment[zone]||[]).filter(p=>p!==relative);
  if(!remove) segment[zone].push(relative);
  write(root,config); return config;
}
// `disable` records "this group does not use this character at all", mirroring
// how bindSegmentAudio stores 不上传. It is distinct from `remove`, which only
// clears a manual choice and lets automatic matching take over again.
function bindCharacter(root, segmentKey, role, relative, remove=false, disable=false) {
  if(typeof segmentKey!=='string'||!segmentKey||segmentKey.length>300||['__proto__','constructor','prototype'].includes(segmentKey)) throw Error('无效分镜');
  if(typeof role!=='string'||!role.trim()||role.length>200||['__proto__','constructor','prototype'].includes(role)) throw Error('无效角色');
  if(!remove&&!disable) { const file=inside(root,relative); if(!IMAGE_EXT.has(path.extname(file).toLowerCase())) throw Error('角色形象必须是图片'); }
  const config=read(root);config.segmentCharacterBindings||={};const segment=config.segmentCharacterBindings[segmentKey]||{};
  if(disable) segment[role.trim()]=false;
  else if(remove||!relative) delete segment[role.trim()]; else segment[role.trim()]=relative;
  if(Object.keys(segment).length) config.segmentCharacterBindings[segmentKey]=segment; else delete config.segmentCharacterBindings[segmentKey];
  write(root,config);return config;
}
function bindSegmentAudio(root, segmentKey, role, relative, disable=false) {
  if(typeof segmentKey!=='string'||!segmentKey||segmentKey.length>300||['__proto__','constructor','prototype'].includes(segmentKey)) throw Error('无效分镜');
  if(typeof role!=='string'||!role.trim()||role.length>200||['__proto__','constructor','prototype'].includes(role)) throw Error('无效角色');
  if(relative) { const file=inside(root,relative); if(!AUDIO_EXT.has(path.extname(file).toLowerCase())) throw Error('角色音频必须是音频文件'); }
  const config=read(root);config.segmentAudioBindings||={};const segment=config.segmentAudioBindings[segmentKey]||{};
  if(disable) segment[role.trim()]=false;
  else if(relative) segment[role.trim()]=relative;
  else delete segment[role.trim()];
  if(Object.keys(segment).length) config.segmentAudioBindings[segmentKey]=segment; else delete config.segmentAudioBindings[segmentKey];
  write(root,config);return config;
}
function importImages(root, sources, category) {
  if(!categories.includes(category)&&category!=='auto') category='pending';
  const config=read(root), folderKinds={characters:'人物',groups:'群像',scenes:'场景',props:'道具',other:'其他',pending:'待确认',audio:'音频'}; const added=[];
  for(const source of sources) {
    const ext=path.extname(source).toLowerCase(); const isAudio=AUDIO_EXT.has(ext);
    if(!IMAGE_EXT.has(ext)&&!isAudio) throw Error('只能添加图片或音频');
    const chosen=isAudio?'audio':inferCategory(source,category);
    const folder=config.folderRecognitionOverrides?.[chosen]||config.folders?.[chosen]?.relativePath||folderKinds[chosen]||'待确认';
    const dir=inside(root,folder,false); fs.mkdirSync(dir,{recursive:true});
    let target=path.join(dir,path.basename(source)), i=1;
    if(path.resolve(source).toLowerCase()===target.toLowerCase()) {added.push(path.relative(root,target).split(path.sep).join('/')); continue;}
    while(fs.existsSync(target)) target=path.join(dir,`${path.basename(source,ext)} (${i++})${ext}`);
    fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
    const relative=path.relative(root,target).split(path.sep).join('/'); added.push(relative);
    config.assetOverrides||={}; config.assetOverrides[relative]={category:chosen};
  }
  write(root,config); return added;
}
function removeFile(root, relative) {
  const file=inside(root,relative), ext=path.extname(file).toLowerCase();
  if(!IMAGE_EXT.has(ext)&&!AUDIO_EXT.has(ext)) throw Error('只能删除素材文件');
  const config=read(root); fs.unlinkSync(file);
  if(config.assetOverrides) delete config.assetOverrides[relative];
  for(const [role,value] of Object.entries(config.audioBindings||{})) if(value===relative) delete config.audioBindings[role];
  for(const zones of Object.values(config.segmentAssetBindings||{})) for(const zone of ['characters','scenes','other']) if(Array.isArray(zones[zone])) zones[zone]=zones[zone].filter(p=>p!==relative);
  for(const bindings of Object.values(config.segmentCharacterBindings||{})) for(const [role,value] of Object.entries(bindings)) if(value===relative) delete bindings[role];
  for(const bindings of Object.values(config.segmentAudioBindings||{})) for(const [role,value] of Object.entries(bindings)) if(value===relative) delete bindings[role];
  write(root,config);
}
function linkFolder(root,kind,folder) {
  if(!['characters','scenes','props','audio'].includes(kind)) throw Error('只能绑定人物、场景、道具或音频文件夹');
  const target=fs.realpathSync(folder);
  if(!fs.statSync(target).isDirectory()) throw Error('请选择文件夹');
  const config=read(root);config.folderLinks||=[];
  const existing=config.folderLinks.find(link=>link.path.toLowerCase()===target.toLowerCase());
  if(existing && existing.kind!==kind) throw Error('这个文件夹已绑定到其他分类，请先解除绑定');
  if(existing) delete existing.files;
  else config.folderLinks.push({id:require('node:crypto').randomUUID(),kind,path:target,name:path.basename(target)});
  config.folderSelection=true;write(root,config);return config;
}
function linkFiles(root,kind,sources) {
  if(!['characters','scenes','props','audio'].includes(kind)||!Array.isArray(sources)||!sources.length) throw Error('请选择图片或音频');
  const files=sources.map(source=>fs.realpathSync(source));
  for(const file of files) if(!fs.statSync(file).isFile() || !(kind==='audio'?AUDIO_EXT:IMAGE_EXT).has(path.extname(file).toLowerCase())) throw Error(kind==='audio'?'只能绑定音频文件':'只能绑定图片文件');
  const config=read(root);config.folderLinks||=[];
  for(const file of files) {
    const dir=path.dirname(file),name=path.basename(file);
    const sameDir=config.folderLinks.filter(item=>item.path.toLowerCase()===dir.toLowerCase());
    if(sameDir.some(item=>item.kind!==kind && (item.kind==='audio')===(kind==='audio') && (!item.files || item.files.some(value=>value.toLowerCase()===name.toLowerCase())))) throw Error('该文件已绑定到其他分类，请先解除绑定');
    let link=sameDir.find(item=>item.kind===kind);
    if(!link) {link={id:require('node:crypto').randomUUID(),kind,path:dir,name:path.basename(dir),files:[]};config.folderLinks.push(link);}
    if(link.files && !link.files.some(value=>value.toLowerCase()===name.toLowerCase())) link.files.push(name);
    config.assetExcludedPaths=(config.assetExcludedPaths||[]).filter(value=>value!=='@linked/'+link.id+'/'+name);
  }
  config.folderSelection=true;write(root,config);return config;
}
function unlinkFolder(root,id) {
  const config=read(root);config.folderLinks=(config.folderLinks||[]).filter(link=>link.id!==id);write(root,config);return config;
}
function clearReferences(root,relatives,analyzer) {
  if(relatives!==null && (!Array.isArray(relatives)||relatives.some(value=>typeof value!=='string'))) throw Error('无效素材选择');
  const config=read(root), available=collect(root,analyzer,'',{autoBind:false}).assets;
  const known=new Set(available.map(asset=>asset.relativePath));
  const removed=new Set(relatives===null ? known : relatives);
  if([...removed].some(value=>!known.has(value))) throw Error('素材索引已变化，请刷新后重选');
  config.assetExcludedPaths=[...new Set([...(config.assetExcludedPaths||[]),...removed])];
  for(const relative of removed) if(config.assetOverrides) delete config.assetOverrides[relative];
  for(const [role,value] of Object.entries(config.audioBindings||{})) if(removed.has(value)||relatives===null) delete config.audioBindings[role];
  for(const zones of Object.values(config.segmentAssetBindings||{})) for(const zone of ['characters','scenes','other']) if(Array.isArray(zones[zone])) zones[zone]=zones[zone].filter(value=>relatives!==null&&!removed.has(value));
  for(const key of ['segmentCharacterBindings','segmentAudioBindings']) for(const bindings of Object.values(config[key]||{})) for(const [role,value] of Object.entries(bindings)) if(removed.has(value)||relatives===null) delete bindings[role];
  if(relatives===null) {config.folderLinks=[];config.folderSelection=true;}
  write(root,config);return {config,cleared:removed.size};
}
module.exports={inside,read,write,collect,edit,bind,bindCharacter,bindSegmentAudio,importImages,removeFile,metaKeys,categories,inferCategory,matchSceneAsset,splitSourceSegments,linkFolder,linkFiles,unlinkFolder,clearReferences};
