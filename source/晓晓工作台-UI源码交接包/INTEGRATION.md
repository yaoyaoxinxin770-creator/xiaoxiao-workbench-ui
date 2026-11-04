# INTEGRATION · 第 1 轮（设计选型预览）

## 启动与预览入口

```bash
cd infinite-canvas/web
```

```bash
npm ci
```

```bash
npm run dev
```

- 方案总览：`http://localhost:3000/design-preview/overview`
- 单页预览：`http://localhost:3000/design-preview?scheme=<方案>&view=<页面>`
  - `scheme`：`sakura`（A 柔粉精修）、`noir`（B 夜幕放映室）、`mist`（C 雾白工作室）、`comic`（D 漫画分镜）
  - `view`：`projects`、`video`、`assets`
  - 演示参数（可选）：`agent=1` 打开 Agent 侧栏；`params=1` 打开生成参数面板；`detail=v07` 打开视频详情；`asset=a1` 打开资产详情；`collapsed=1` 收起提示词；`rail=0` 收起功能栏；`sidebar=0` 收起目录栏；`bar=0` 隐藏预览控制条。

## 依赖变化

无。`package.json`、`package-lock.json`、`bun.lock` 未改动。
图标沿用已有的 `lucide-react`；插画为代码生成的原创 SVG；没有新增字体文件（预览使用系统字体栈：PingFang SC → Microsoft YaHei → Noto Sans SC / Noto Sans CJK SC → 文泉驿）。云端截图机器为显示中文粗体临时安装了系统字体 Noto Sans CJK SC，该字体没有放进源码。

## 与原组件 / 接口的对应关系

| 预览组件 | 对应生产文件 | 说明 |
| --- | --- | --- |
| `shell.tsx` · `PreviewTopBar` | `src/components/layout/app-top-nav.tsx` | 页签、任务胶囊与列表、渠道切换、窗口按钮的视觉。 |
| `shell.tsx` · `PreviewRail` | `src/components/layout/app-navigation.tsx` | 7 个入口及顺序、分隔线、收起。 |
| `projects-view.tsx` | `src/app/(user)/projects/page.tsx` | 标题区、搜索/排序/刷新/扫描/新建、画布入口、项目卡（封面拼图、统计、右键菜单）、即梦项目。 |
| `studio-view.tsx` | `src/app/(user)/video/components/video-studio.tsx` | 目录栏（含拖动调宽、收起为图标）、工具栏两组、视频网格、浮动坞底部余量。 |
| `video-tile.tsx` | `video-gallery.tsx` 的卡片 | 悬浮按钮顺序、右键菜单项、颜色/备注/未读点、生成状态。 |
| `prompt-panel.tsx` | `video/page.tsx`（bottom 布局）、`composer-group-navigation.tsx`、`dreamina-video-channel.tsx`、`prompt-reference-input.tsx` | 只模拟外观：高亮层叠在原生 textarea 上；生产中仍用 `PromptReferenceInput`，不得为套样式整块重挂载编辑器。 |
| `agent-panel.tsx` | `codex-agent-panel.tsx` | 标题、模型徽标、快捷指令、回填开关、暂停按钮。 |
| `video-detail-modal.tsx` | `video-studio.tsx` 中的详情 Modal 与 `renderDetail` | 备注位置、置顶/置底箭头位置、截取视频帧。 |
| `assets-view.tsx` | `video-elements.tsx`、`element-archive.tsx`、`element-inspector-panel.tsx` | 分类/角色目录、分组卡、禁用区、检查器字段。 |
| `schemes.ts` | `src/lib/app-theme.ts` | 选定后把对应主题写回 `getAntThemeConfig`。 |
| `design-preview.css` 变量 | `src/app/workbench-v2.css`、`src/app/globals.css` | 选定后把变量迁移到 `:root` / `[data-skin]` / `.dark`。 |

预览组件**没有**调用任何 store、service 或 API；生产组件的 props、事件和 store 动作没有被改动。

## 关于 `preview-bridge.ts`

根布局 `src/app/layout.tsx` → `ClientRootInit` 会在挂载时调用 `workbench().pippitStatus()`。在普通浏览器（没有桌面程序注入的 `window.desktopBridge`，且不是 `127.0.0.1:17843`）里，`workbench()` 会同步抛出“请使用晓晓工作台桌面程序打开本地项目。”，导致整个页面无法渲染。这是现有行为，本轮不改动。

为了能在云端浏览器预览，预览页在模块加载时检查：只有 `window.desktopBridge` 不存在时，才挂一个 Proxy 桩，所有方法都返回被拒绝的 Promise（“设计预览未连接本机服务”）。它不返回任何数据、不访问网络或文件。在桌面程序里真实桥接已存在，桩不会安装。预览页没有跳到生产路由的链接；如在同一浏览器标签内从预览手动跳到生产页面，请刷新页面。

## 合并顺序（本轮）

1. 本轮只新增 `src/app/design-preview/` 目录，可整体合入，也可暂不合入；不影响生产界面。
2. 不需要覆盖任何现有文件；按 `manifest.json` 核对，现有文件均未变化。

## 需本机完成的事项

- 本轮无必须事项。如需在本机看预览，按上面的命令启动后打开预览地址。
- 选定方案后的下一轮：在本机最新源码上按文件差异合并生产样式改动，并做个人版范围内的验证（输入法、撤销重做、拖拽、右键、浮动提示词余量、渠道参数等）。
