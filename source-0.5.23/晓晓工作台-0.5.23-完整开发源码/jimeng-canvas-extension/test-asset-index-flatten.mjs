// 资产区不再把人物折叠成“单人区”：同一个人不同衣服本来就只是同名的多张素材，
// 折叠之后名字只能进二级页面才能改，还会凭空造出“未指定：xxx”这种伪角色名。
// 现在全部平铺，名字在最外层双击即可修改。
//
// 另外：列表里仍然用 160px 预览，点缩略图才按需读这一张原图，关掉立即释放。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, '../desktop-app/asset-workspace.js'), 'utf8');

assert.equal(/未指定：\$\{/.test(source), false, '不能再生成“未指定：xxx”伪角色名');
assert.equal(/个版本 · 点击展开/.test(source), false, '不能再有折叠成单人区的入口');
assert.equal(/aw-back/.test(source), false, '不能再有返回全部角色的二级页面');
assert.match(source, /name\.ondblclick/, '最外层的名字必须支持双击改名');

// 放大看原图：按需读取、用完释放。
assert.match(source, /assetFullImage\(projectRoot,\s*asset\.relativePath\)/, '放大时才读原图');
assert.match(source, /lightboxImage\.removeAttribute\('src'\)/, '关闭后必须释放大图');
assert.match(source, /aw-thumb-zoom/, '缩略图要有可放大的提示');
const ipc = await readFile(resolve(root, '../desktop-app/asset-ipc.js'), 'utf8');
assert.match(ipc, /actions\.fullImage=/, '必须有读取原图的接口');
assert.equal(/cache\.set\(key,\s*`data:\$\{mime\}/.test(ipc), false, '原图不能进缓存');
assert.match(ipc, /40\s*\*\s*1024\s*\*\s*1024/, '原图要有体积上限');

// 发送用的仍然是磁盘原图，预览接口不得进入执行路径。
const workbench = await readFile(resolve(root, 'workbench.js'), 'utf8');
assert.equal(/assetThumb/.test(workbench), false, '执行路径里不能出现预览接口');
assert.match(workbench, /relativePath:asset\.relativePath/, '发送清单只带文件路径');

// 两个重新匹配按钮各就各位。
assert.match(source, /\$\('\.editor-tools'\)\?\.prepend\(button\('↻ 重新匹配本组'/, '本组按钮在当前分组工具条');
assert.match(source, /draftToolbar\.append\(button\('↻ 重新匹配全部'/, '全部按钮在整稿工具条');

console.log('[OK] asset index is flat, renames inline, originals load on demand, rematch buttons sit next to what they act on');

// 预览里的 @ 缩略图和真正发送的 @ 锁定是两条独立路径。发送靠 lockedImages，
// 和预览画没画出来无关；但预览画不出来会让人不敢信任界面，所以两边都要对。
//
// 【出场人物】一行一个角色时，以前只装饰块里的第一行，而且把“何诞：开镜在场｜
// 首次镜头01｜20岁青年”整行切碎当成一堆假角色名。
{
  const preview = source.slice(source.indexOf('function renderWorkbenchPrompt('),
    source.indexOf('window.renderWorkbenchPrompt='));
  // 用不含反斜杠的片段断言，避免测试自己的转义出错。
  assert.ok(preview.includes(']*】/.test(line))header=false;'),
    '出场人物小节要一直画到下一个【…】为止');
  assert.ok(preview.includes('const head=line.split(/[：:]/)[0];'),
    '一行一个角色时只把冒号前的名字标成 @');
}

// 音色方块显示音色名，不再写“试听”；仍然点一下就播放。
assert.match(source, /const idleLabel=\(\)=>\{/, '音色方块要有动态标签');
assert.match(source, /play\.textContent=idleLabel\(\)/, '停止播放后要变回音色名');
assert.equal(/button\('▶ 试听'/.test(source), false, '方块上不应再写死“试听”');
assert.match(source, /play\.title=selected\(\)\?`点击试听/, '仍然要提示可以点击试听');

// 场景只保留整栏一个落点，内部卡片区不能再重复绑定；角色缺图卡则单独接收。
assert.equal(/target\(sceneCards,dropScene\);/.test(source), false,
  '场景内部卡片区不能再成为第二个拖放区');
assert.match(source, /if\(sceneCards\.parentElement\)target\(sceneCards\.parentElement,dropScene\);/,
  '整个“场景 / 其它”栏目都要是有效拖放区');
assert.match(source, /target\(missing,async asset=>\{/,
  '缺图角色卡必须有自己的落点');
assert.match(source, /\},\{exclusive:true\}\);\s*characterCards\.append\(missing\)/,
  '缺图角色卡拖放不能冒泡到外层角色区');
assert.match(source, /if\(characterCards\.parentElement\)target\(characterCards\.parentElement,dropCharacter\);/,
  '角色整栏仍要能添加额外角色');

// @ 选择区：搜索栏下面一排分类（直接映射资产库的分组），点一下只看那一类；
// 同一个人不同服装本来就是不同的素材名，显示和插入都必须用素材名。
assert.match(source, /const atTabs=el\('div','aw-at-tabs'\);/, '搜索栏下面要有分类栏');
assert.match(source, /atPicker\.append\(atSearch,atTabs,atResults\);/, '分类栏要在搜索栏和列表之间');
assert.match(source, /const AT_ORDER=\['characters','groups','scenes','props','other','pending','audio'\];/,
  '分类顺序要和资产库一致');
{
  const show = source.slice(source.indexOf('function maybeShowAtPicker(editor)'),
    source.indexOf('for(const editor of [sourceVisual,segmentVisual]'));
  assert.ok(show.includes("atCategory='all';"), '每次打开都要回到“全部”');
  assert.ok(show.includes('positionAtPicker();'), '弹出后要立刻按光标定位');
}
assert.match(source, /const token=asset\.displayName\|\|asset\.role;/, '显示和插入都用素材名');

// 卡片上的名字不能被省略号截断——截掉就分不清是哪一套服装了。
{
  const css = await readFile(new URL('../desktop-app/asset-audio-picker.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('#assets .aw-card-role{'), css.indexOf('#assets .aw-role-preview'));
  assert.equal(/text-overflow:ellipsis/.test(block), false, '角色名不能用省略号截断');
  assert.match(block, /white-space:normal/, '角色名要能换行完整显示');
  const caption = css.slice(css.indexOf('#assets .aw-card-caption{'));
  assert.equal(/text-overflow:ellipsis/.test(caption.slice(0, 200)), false, '卡片说明不能用省略号截断');
}

// 出场人物声明里的名字常带括号后缀（“何诞（人形）”“龙套下属若干（功能性群体）”），
// 素材却叫“何诞·初化人形睡衣”“龙套下属”。严格相等一个都对不上，界面就把已经
// 绑好的图说成“尚未匹配角色图片”，服装优先级匹配也根本没机会跑。
{
  const from = source.indexOf('function characterCandidates(');
  const to = source.indexOf('function characterCandidatesFor(');
  assert.ok(from >= 0 && to > from, '必须能取出候选匹配的纯函数');
  const assets = [
    {mediaType:'image', kind:'characters', role:'何诞', displayName:'何诞·人形居家常服', relativePath:'a'},
    {mediaType:'image', kind:'characters', role:'何诞', displayName:'何诞·初化人形睡衣', relativePath:'b'},
    {mediaType:'image', kind:'characters', role:'', displayName:'龙套下属', relativePath:'d'},
    {mediaType:'image', kind:'characters', role:'宋柏峰', displayName:'宋柏峰', relativePath:'e'},
  ];
  const characterCandidates = new Function('data', 'current', `${source.slice(from, to)}
return characterCandidates;`)({assets},()=>({prompt:''}));
  assert.deepEqual(characterCandidates('何诞（人形）').map(a => a.displayName),
    ['何诞·人形居家常服', '何诞·初化人形睡衣'], '带括号后缀的角色名要能找到全部服装');
  assert.deepEqual(characterCandidates('龙套下属若干（功能性群体）').map(a => a.displayName),
    ['龙套下属'], '角色名比素材名长时也要能对上');
  assert.deepEqual(characterCandidates('宋柏峰').map(a => a.displayName), ['宋柏峰']);
  assert.deepEqual(characterCandidates('不存在的人'), []);
}
// 手动绑定过的图必须永远在候选里，否则刚拖进去的图会被说成“未匹配”。
assert.match(source, /function characterCandidatesFor\(role,boundPath\)\{/);
assert.match(source, /if\(bound&&!candidates\.some/, '手动绑定要并进候选');

// @ 选择卡必须跟着光标走：滚动和改窗口大小都要重新定位，光标滚出可视区就收起。
assert.match(source, /window\.addEventListener\('scroll',positionAtPicker,true\);/,
  '滚动时要重新定位（捕获阶段，内层滚动容器也要算）');
assert.match(source, /window\.addEventListener\('resize',positionAtPicker\);/);
assert.match(source, /if\(rect\.bottom<0\|\|rect\.top>window\.innerHeight\)return hideAtPicker\(\);/,
  '光标滚出可视区就收起选择卡');

console.log('[OK] cast lines decorate per role, voice tiles show the voice name, drag targets are separated');
