// 字字动画场景的真 Electron 渲染层冒烟检查。
// 静态断言（test-typetale-ui.mjs）只能证明字符串在文件里，证明不了 renderShell /
// bindEvents 真的跑通了 —— 少一个 DOM id、族模块加载顺序写反，都是运行期才炸。
const {app, BrowserWindow} = require('electron');
const assert = require('assert/strict');
const http = require('http');
const path = require('path');

const temporary = process.env.TYPETALE_UI_TEST_ROOT;
assert.ok(temporary, '需要 TYPETALE_UI_TEST_ROOT');
app.setPath('userData', temporary);

// 本地连接器端口在 CI/并发下可能被占，改成随机端口，避免冒烟检查因端口冲突失败。
const originalCreate = http.createServer;
http.createServer = function createServer(...args) {
  const server = originalCreate.apply(this, args);
  const listen = server.listen;
  server.listen = function patchedListen(port, ...rest) {
    return port === 17842 ? listen.call(server, 0, ...rest) : listen.call(server, port, ...rest);
  };
  return server;
};

const fixture = require('./native-ui-fixture.cjs');
require('./main');

const errors = [];

app.whenReady().then(async () => {
  try {
    const win = await fixture.nativeWindow();
    win.webContents.on('console-message', (event, level, message) => {
      if (level >= 3) errors.push(message);
    });
    win.webContents.on('preload-error', (event, file, error) => errors.push(`${file}: ${error.message}`));
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await win.loadURL(new URL('/typetale',win.webContents.getURL()).href);
    await fixture.until(()=>win.webContents.executeJavaScript('Boolean(window.personalWorkbench && document.getElementById("ttProviderFamily"))'),"原生字字动画工具加载");
    const run = script => win.webContents.executeJavaScript(script.replace(/window\.(TypeTaleCore|TypeTaleModelFamily|workbenchShowScene)/g, "window.personalWorkbench.$1"));

    // 模块加载顺序：core 在工厂调用那一刻就要拿到族模块。
    assert.equal(await run('typeof window.TypeTaleModelFamily'), 'object', '族模块必须先于 core 加载');
    assert.equal(await run('typeof window.TypeTaleCore'), 'object');
    assert.equal(await run('typeof window.TypeTaleCore.resolveFamily'), 'function');

    await run("window.workbenchShowScene('typetale')");
    assert.equal(await run("document.getElementById('typetaleView').hidden"), false, '字字动画场景必须可见');

    // renderShell 真的把新控件画出来了（静态断言查不出 innerHTML 里的拼写错误）。
    for (const id of ['ttProviderKind', 'ttProviderFamily', 'ttFamilyNote', 'ttPluginDetail',
      'ttShotFirstFrame', 'ttShotLastFrame', 'ttShotBatch', 'ttShotRound', 'ttShotNegative']) {
      assert.equal(await run(`Boolean(document.getElementById(${JSON.stringify(id)}))`), true, `renderShell 少了 #${id}`);
    }

    // 族下拉被真的填充过，且说明行给出了 chip 格式与上限。
    const familyIds = await run("[...document.getElementById('ttProviderFamily').options].map(item => item.value)");
    assert.ok(familyIds.includes('jimeng_2_0'), `族下拉没有出厂视频族：${familyIds.join(',')}`);
    assert.ok(familyIds.includes('h3'));
    assert.ok(!familyIds.includes('omni_nano'), '视频通道不能列出图片族');
    const note = await run("document.getElementById('ttFamilyNote').textContent");
    assert.match(note, /参考图/, `族说明行没有渲染上限：${note}`);

    // 切到图片模型后族表必须换成图片族（图片族与视频族互不混用）。
    await run("document.getElementById('ttProviderKind').value = 'image'; document.getElementById('ttProviderKind').onchange();");
    const imageFamilyIds = await run("[...document.getElementById('ttProviderFamily').options].map(item => item.value)");
    assert.ok(imageFamilyIds.includes('omni_nano'), `切到图片模型后没有图片族：${imageFamilyIds.join(',')}`);
    assert.ok(!imageFamilyIds.includes('jimeng_2_0'), '图片通道不能列出视频族');
    await run("document.getElementById('ttProviderKind').value = 'video'; document.getElementById('ttProviderKind').onchange();");

    // 端到端走一遍编译：@素材名 → chip token + 参考前缀，超限素材标红且不进 payload。
    const compiled = await run(`(() => {
      const core = window.TypeTaleCore;
      const assets = [
        core.normalizeAsset({id:'c1', name:'苏喻枝', kind:'characters', path:'人物/苏喻枝.png'}),
        core.normalizeAsset({id:'s1', name:'办公室', kind:'scenes', path:'场景/办公室.png'}),
        core.normalizeAsset({id:'p1', name:'咖啡杯', kind:'props', path:'道具/咖啡杯.png'}),
      ];
      const shot = core.normalizeShot({id:'01', prompt:'@苏喻枝 在 @办公室 拿起 @咖啡杯', bindings:{assetIds:['c1','s1','p1']}});
      return core.compilePrompt(shot, assets, {
        provider:{kind:'video', modelFamily:'capped'},
        familyOverrides:{video:{capped:{id:'capped', name:'只带两张图', kind:'video', expand_chips:true, limits:{images:2}}}},
      });
    })()`);
    assert.match(compiled.prompt, /@图片1 在 @图片2 拿起 @咖啡杯/, `chip 展开或超限保留原文不对：${compiled.prompt}`);
    assert.match(compiled.prompt, /图1是苏喻枝；图2是办公室。/);
    assert.deepEqual(compiled.overflow.map(item => item.name), ['咖啡杯']);
    assert.equal(Object.keys(compiled.referenceMap).length, 2, '超限素材不能进 referenceMap');

    // IPC 面：新接口在 preload 里真的暴露出来了（拼错名字静态断言查不出来）。
    for (const method of ['typetaleInspectPlugin', 'typetaleReadPluginConfig', 'typetaleWritePluginConfig',
      'typetaleListModelFamilies', 'typetaleValidateModelFamily']) {
      assert.equal(await run(`typeof window.desktopBridge[${JSON.stringify(method)}]`), 'function', `preload 少了 ${method}`);
    }
    const families = await run("window.desktopBridge.typetaleListModelFamilies('video', {})");
    assert.equal(families.ok, true);
    assert.ok(families.families.some(family => family.id === 'jimeng_2_0'));
    const invalid = await run("window.desktopBridge.typetaleValidateModelFamily({id:'bad id', name:''}, 'video')");
    assert.ok(invalid.errors.length >= 2, '族校验必须把错误回报给 UI');

    // 插件宿主脚本随包分发，缺了插件一个都跑不起来。
    const fs = require('fs');
    for (const file of ['runner.py', 'plugin_utils.py']) {
      assert.ok(fs.existsSync(path.join(__dirname, 'typetale-plugin-host', file)), `缺少插件宿主文件 ${file}`);
    }

    assert.deepEqual(errors, [], `渲染层有报错：${errors.join(' | ')}`);
    console.log('TypeTale 渲染层冒烟：模块加载顺序、场景切换、族下拉与 kind 隔离、编译与超限标注、IPC 面全部通过');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
