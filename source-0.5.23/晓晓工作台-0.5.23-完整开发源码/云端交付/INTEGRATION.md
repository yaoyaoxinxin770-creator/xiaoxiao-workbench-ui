# INTEGRATION · UI 第 2 轮（基于 0.5.23）

## 交付物在哪里

- 展开的完整源码：仓库分支 `claude/nice-franklin-bp0cu2` 下的 `source-0.5.23/晓晓工作台-0.5.23-完整开发源码/`。提交顺序：
  1. `e5fd53c Add untouched 0.5.23 full development source baseline`：原样解压的 0.5.23 基线（889 个文件 SHA-256 与 `SOURCE_MANIFEST.json` 一致）。
  2. 之后的提交：本轮全部改动。在包根目录执行 `git diff e5fd53c -- .` 即可只看改动。
- `云端交付/0.5.23-ui-round2.patch`：相对 0.5.23 基线的统一差异（含新增文件；不含 `云端交付/` 本身）。云端已在原样 0.5.23 副本上 `git apply --check` 并应用，结果与分支中的源码逐文件一致。
- `云端交付/改动文件-0.5.23-UI第2轮.zip`：只含修改和新增的文件，路径相对本包根目录。
- `云端交付/改动文件清单.json`：每个文件的状态（修改 / 新增）、0.5.23 原文件的 SHA-256 和本轮文件的 SHA-256。
- `云端交付/截图/`：生产界面截图（四套皮肤，用最终构建拍摄）与设计预览总览。
- `云端交付/云端截图脚本/`、`云端交付/云端Electron检查脚本/`：云端验证用脚本（只在云端 Linux 使用，见各自 README）。

旧目录 `source/晓晓工作台-UI源码交接包/` 是第 1 轮（0.5.22 UI 包）的记录，已被本轮取代，不要再用它合并。

## 合并顺序（本机 AI）

1. 确认本机源码仍是 0.5.23：按 `改动文件清单.json` 中 `status` 为 `modified` 的文件核对 `baselineSha256`（PowerShell：`Get-FileHash -Algorithm SHA256 <文件>`）。一致说明该文件自 0.5.23 起本机没有改过，可以直接应用补丁；不一致的文件需要逐文件合并。不要整目录覆盖。
2. 在本机源码根目录先检查、再应用：

```bash
git apply --check 云端交付/0.5.23-ui-round2.patch
```

```bash
git apply 云端交付/0.5.23-ui-round2.patch
```

   如果不想把设计预览路由（`/design-preview`，虚构数据，只供挑选方案）打进个人版，改用下面的命令；生产代码不引用设计预览，云端已验证这样应用后其余文件照常生效：

```bash
git apply --exclude="infinite-canvas/web/src/app/design-preview/*" 云端交付/0.5.23-ui-round2.patch
```

   冲突最可能出现在 `video-studio.tsx`、`codex-agent-panel.tsx`、`video-gallery.tsx`、`app-theme.ts`。
3. 依赖：没有新增或升级依赖，`package.json` 与锁文件未改，无需重新 `npm ci`。
4. 按 `AGENTS.md` 的本机打包链路执行：`infinite-canvas/web` 内类型检查与 `next build --webpack` → 根目录 `node desktop-app/prepare-native-runtime.cjs` → 现有 Electron 配置打包个人版 → 成品一致性与隔离启动检查。本轮没有改 `public/xiaoxiao`，`build-native-workbench.cjs` 可按原流程执行，产物不应因本轮变化。
5. 本机验证（见下节）通过后，再按原 VBS 入口部署。

## 与原组件 / 接口的对应关系

| 改动 | 原组件 / 接口 | 兼容性 |
| --- | --- | --- |
| 皮肤 | `useThemeStore`（`skin`、`theme`、`setSkin`）、`getAntThemeConfig(dark, skin)`、`html[data-skin]` 与 `.dark` | 存储键 `infinite-canvas:theme_store`、版本 1 不变；`pink`、`neutral` 两个原值含义不变，只换配色；新增 `comic`。影视暗房弹窗底色保持原 #1D1F23 |
| Agent 宽度 | `useWorkbenchLayoutStore`（`xiaoxiao:layout`，版本 2） | 只新增字段，旧数据缺省为 380 |
| Agent 侧栏 | `CodexAgentPanel` props 新增可选 `closing`、`onLocateTarget` | 不传时与原先一致；发送、暂停、自动回填、迟到回复保护、切换目标停止都没有改 |
| 修改对比 | 新增 `src/app/(user)/video/agent-prompt-diff.ts` | 只读计算，不参与回填 |
| 卡片 | `StudioTile` 新增可选 `agentLinked`、`flash`；`VideoGallery` 新增可选 `locate` | 不传时与原先一致；编号位置、选择圈、悬浮按钮顺序不变 |
| 顶部工具栏 | `[data-video-toolbar]` 内按钮外加两层分组容器 | 按钮、顺序、`aria-label` 不变；分隔线与开启柔光不占宽度，操作区宽度与 0.5.23 逐像素一致 |
| 样式 | 新增 `src/app/workbench-v3.css`，在 `layout.tsx` 中于 `globals.css` 之后引入 | 选择器只用现有 `data-*` / class 钩子；减少动态效果的系统设置由 `globals.css` 原规则统一生效 |

新增的 DOM 钩子（只增不改）：`data-toolbar-actions`、`data-toolbar-group`、`data-agent-resizer`、`data-agent-pulse`、`data-agent-target`、`data-agent-flash`、`data-agent-diff`、`data-agent-msg`、`data-status`（视频卡片）、`[data-codex-agent-panel]` 的 `data-state` / `data-busy` / `data-resizing`。原有的 `id`、`data-*`、`aria-label` 和按钮文字都保留。

## 需要本机完成的验证

云端已经用包内真实的 Electron / Next / Go 在 Linux + Xvfb 下跑过完整测试入口，并与原样 0.5.23 逐项对比（结果见 VALIDATION.md）。本机仍需在 Windows 上执行：

- 完整入口 `node desktop-app/run-tests.cjs`（当前 167 项，含新增的 `test-agent-prompt-diff.mjs`）。云端两边以相同原因失败的项目（Windows 专用、缺官方 CLI 等，见 VALIDATION.md 第三节）需要在本机确认结果。
- `test-deepseek-agent-ui.mjs`：云端原测试在参数弹层动画结束前测量尺寸而失败（基线同样失败）；用“等 0.6 秒再测”的诊断副本，两边都完整通过，但 Agent 密钥的 DPAPI 加密保存在云端是替身，必须在本机用原测试确认。
- Windows 打包、成品一致性、隔离启动、VBS 入口、托盘与系统通知。
- 人工体验：四套皮肤切换；Agent 侧栏打开 / 收起 / 拖动交界 / 加宽 / 定位；中文输入法输入长提示词（第 39 条）；拖动排序视频；不同窗口宽度与 Windows 缩放比例。

## 预览入口

```bash
cd infinite-canvas/web
```

```bash
npm run dev
```

- 设计预览（虚构数据，独立路由）：`http://localhost:3000/design-preview/overview`、`http://localhost:3000/design-preview?scheme=noir&view=video`（`scheme` 为 `sakura` / `noir` / `mist` / `comic`，`view` 为 `projects` / `video` / `assets`）。
- 生产界面需要桌面程序的 `desktopBridge` 才能读取真实项目；云端截图使用的是只在测试浏览器里注入的替身数据（见 VALIDATION.md），这些替身脚本不在源码中。
