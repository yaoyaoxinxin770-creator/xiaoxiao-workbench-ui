# VALIDATION · UI 第 2 轮（基于 0.5.23）

环境：云端 Linux 容器（4 核），Node.js 22.23.4、npm 10.9.9、Next.js 16.2.9；Go 按 `go.mod` 自动取 1.25 工具链；Electron 按 `desktop-app/package-lock.json` 用 `npm ci` 安装；Xvfb 虚拟屏；Playwright 自带 Chromium。日期 2026-11-04。前端依赖按原锁文件安装，`package.json` 与锁文件均未改动。

## 一、静态检查与构建（最终代码）

| 检查 | 命令 / 方法 | 结果 |
| --- | --- | --- |
| 基线完整性 | 按 `SOURCE_MANIFEST.json` 逐个比对 SHA-256 | 889 / 889 一致 |
| 前端基线对比 | `diff -rq` 比较 0.5.22 UI 包与 0.5.23 的 `infinite-canvas/web` | 除第 1 轮新增的 `design-preview` 外完全相同 |
| 类型检查 | `infinite-canvas/web` 内 `npx tsc --noEmit -p .` | 退出码 0，0 个错误（全项目） |
| 前端构建 | `npx next build --webpack` | 退出码 0；Compiled successfully（102 秒）；29 / 29 个静态页面。日志中的 “Skipping validation of types” 来自现有 `ignoreBuildErrors: true`，类型以上一行 tsc 为准 |
| 代码格式 | `npx prettier --check` 新增的 `workbench-v3.css`、`agent-prompt-diff.ts`、`design-preview/**` | 全部符合项目配置。已有文件只做最小改动，没有整体格式化 |
| 新增单元测试 | `node desktop-app/test-agent-prompt-diff.mjs` | PASS（相同、替换逐字、新增、删除、折叠、超长回退） |
| 读取前端源码的 Node 测试 | 33 项（原有 32 项 + 新增 1 项） | 33 / 33 PASS |
| 补丁 | 在 `git archive e5fd53c` 导出的原样 0.5.23 上 `git apply --check` 与 `git apply`，再与分支中的源码 `diff -rq` | `--check` 与应用均成功，应用后与分支中的源码逐文件一致（不含 `云端交付/`）。另用 `--exclude="infinite-canvas/web/src/app/design-preview/*"` 应用一次：只少设计预览目录，`tsc --noEmit` 0 个错误，新增单元测试 PASS |

## 二、包内完整测试入口：真实 Electron + Next + Go，原始 0.5.23 与修改后对比

方法：从基线提交导出原样 0.5.23，另复制一份修改后源码；两边分别 `next build --webpack` → `prepare-native-runtime.cjs`，Go 后端按 Linux 编译，`desktop-app` 依赖按锁文件安装；然后在 Xvfb 虚拟屏下并行运行包内的 `node desktop-app/run-tests.cjs`。所有 Electron 界面检查用的都是包内真实的主进程、preload、Next standalone 前端和 Go 后端。脚本见 `云端交付/云端Electron检查脚本/`。

为适应容器做的调整，两边完全相同，都不改源码和测试文件：root 运行需 `ELECTRON_DISABLE_SANDBOX=1`；容器未设语言环境时 Chromium 读不了中文文件名，需 `LANG=C.UTF-8`；`storage-home.json` 是 Windows 路径，需给绝对的 `WORKBENCH_HOME_DIR`；Agent 密钥保存只支持 Windows DPAPI，云端构建产物里短路平台判断并用只回显的 PowerShell 替身（不加密）。

| | 原始 0.5.23 | 修改后（最终代码） |
| --- | --- | --- |
| 发现 | 166 | 167（新增 `test-agent-prompt-diff.mjs`） |
| 通过 | 146 | 147（其中新增 1 项） |
| 失败 | 20 | 20 |

逐项对比：除新增测试外，有两项结果互换，都属于“改完立即刷新再检查是否保留”或“按坐标真实点击”这类时序竞争型断言：

- `test-dreamina-ui`：这一轮基线通过、修改后失败（“重启保留场景与两项补位”等待超时）。单独重复 3 次：基线 1 / 3 通过、修改后 3 / 3 通过，失败点相同。
- `test-media-fixes-ui`：这一轮基线失败、修改后通过；两边的诊断副本都通过（见第三节）。

最终代码之前还完整跑过一轮（工具栏指示灯改为柔光之前）：修改后通过 146 / 失败 21，差异项是 `test-studio-enhancements-ui`；这项在点“保存设置”后立即刷新页面再检查设置是否保留，原测试两边各重复 9 次都是通过 7 次（见第三节），最终代码这一轮也通过了。相关保存路径（`project-prompt-settings.tsx`、视频台 store）本轮没有改动。

### 两边都失败的 19 项

| 原因 | 数量 | 测试 |
| --- | --- | --- |
| 只有 Windows 才有的接口或文件 | 4 | `test-launcher-shortcut`（PowerShell 创建快捷方式）、`test-video-shortcuts`（`shell.writeShortcutLink`）、`test-infinite-canvas-ui`（`nativeImage.createThumbnailFromPath` 只在 Windows / macOS 提供）、`test-typetale-ui`（读取包内不存在的 `启动即梦工作台.vbs`） |
| 需要本机安装的 Chrome | 2 | `test-cdp-browser`、`test-mention-anchor-residue` |
| 未随包提供的官方 CLI / 预编译运行库 | 5 | `test-dreamina-service`（`dreamina.exe`）、`test-dreamina-canvas-contract`（`dreamina-canvas.exe`）、`test-pippit-service`、`test-oiioii-service`、`test-pippit-canvas-reference-recovery`（小云雀预编译运行库，交接文档已说明） |
| 包内未附带的历史输出目录或构建产物 | 3 | `test-dreamina-interpolated-ui`（`output/dreamina-sample-interpolation/job.json`）、`test-v2-refinement-ui`（写入 `output/修复实施-2026-10-25/` 时目录不存在）、`test-infinite-canvas-service`（ComfyUI 桥接附件 404，需 `build-native-workbench.cjs` 产物） |
| Linux 容器没有系统通知服务 | 1 | `test-video-recovery-ui`（完成通知计数 0 ≠ 1） |
| 云端时序：弹层 / 弹窗动画未结束就测量尺寸或按坐标真实点击 | 2 | `test-deepseek-agent-ui`、`test-studio-editing-ui`（`test-media-fixes-ui` 同属此类，本轮只在基线上失败） |
| 云端未确定原因 | 2 | `test-asset-ui`（旧版浏览器工作台页面的提及图片预览等待超时）、`test-local-asset-links`（“选人物子目录一键恢复全部关联缺失素材” 0 ≠ 2）。两项都不涉及本轮改动的前端，需本机复核 |

没有修改测试入口、断言或跳过任何测试。

## 三、诊断副本：让卡在环境问题上的检查跑完后半段

做法：只在云端临时副本里生成 `cloud-diag-*.cjs`，在指出的位置加等待或跳过 Linux 不支持的那一条断言，其余断言原样保留；包内测试文件不改。两边用同样的副本。

| 检查 | 诊断调整 | 原始 0.5.23 | 修改后 |
| --- | --- | --- | --- |
| `test-deepseek-agent-ui`：单击打开、参数面板、官方预设、本机加密保存、真实兼容 API 回填、坏 JSON 保护、编辑后迟到回复保护、暂停与切组保护 | 参数弹层出现后等 600ms 再测量 | PASS | PASS |
| `test-studio-editing-ui` | 窗口聚焦后等 600ms 再计算点击坐标 | PASS | PASS |
| `test-media-fixes-ui` | 同上 | PASS | PASS |
| `test-v2-refinement-ui` | 预先建立 `output/修复实施-2026-10-25/`（检查本身不改） | PASS | PASS |
| `test-video-recovery-ui` | 跳过“完成通知计数”一条（Linux 容器没有系统通知服务），后续断言原样 | PASS（第 1 次在“重启后顺序保留”等待超时，重跑通过） | PASS（含“选择圈直接覆盖原数字，数字不让位”、影视暗房弹窗底色 rgb(29, 31, 35)、白黑皮肤重载、300ms 长按换位与重载顺序） |
| `test-studio-enhancements-ui`（原测试重复运行） | 不调整，重复运行 | 9 次通过 7 次（失败点：“选择插入位置”“设置持久保留”等待超时） | 9 次通过 7 次（失败点相同） |
| `test-dreamina-ui`（原测试重复运行） | 不调整，重复运行（含完整入口中的运行） | 4 次通过 2 次（失败点：“重启保留场景与两项补位”等待超时） | 5 次通过 4 次（失败点相同） |

## 四、本轮对照本机检查发现并修正的问题

| 问题 | 发现方式 | 修正与复核 |
| --- | --- | --- |
| 工具栏分组的分隔线（11px）和自动匹配指示灯（14px）增加了宽度，1440 宽窗口下工具栏折成两行 | 云端第一次真实运行时 `test-layout-refinements-ui` 失败（“工具栏高度压缩”），基线通过 | 分隔线画进原有 8px 间隙，指示灯改为开启时外圈柔光；同一组截图数据下测得操作区宽度与 0.5.23 逐像素一致（暖樱粉 / 影视暗房均为 931px），重新构建后该检查 PASS |
| 第 1 轮预览的“编号向右让开勾选圈” | 逐条比对 `video-recovery-ui-check.cjs` 断言（选择圈直接覆盖原数字，数字不让位） | 生产与预览均撤回 |
| 胭脂墨黑把弹窗底色改成近黑 | 同上（影视暗房弹窗背景须为 rgb(29, 31, 35)） | 弹窗沿用原 #1D1F23 |
| 悬停与漫画皮肤给已收藏的星号加了实体底色 | 比对 `pippit-ui-check.cjs`（已收藏星号无实体底色） | 已收藏星号不再加底色；`test-pippit-ui` 两边均通过 |

## 五、生产界面渲染与交互（最终构建，测试浏览器替身数据）

方法：在 `desktop-app/infinite-canvas-web` 内用 standalone 服务（`PORT=3000 node server.js`）运行最终构建，用 Playwright 打开真实的 `/projects` 与 `/video`。只在测试浏览器里注入返回固定结构的 `desktopBridge` 替身，向 IndexedDB 写入虚构项目、视频组、视频记录、封面与资产，并拦截 `/api`（其中 `/api/codex-agent` 返回固定的改写结果）。脚本在 `云端交付/云端截图脚本/`，不在源码里。

| 检查项 | 结果（暖樱粉 / 影视暗房 / 云母白 / 漫画分镜） |
| --- | --- |
| 项目管理、视频创作、项目资产页面渲染 | 四套皮肤均通过，截图见 `云端交付/截图/` |
| 首屏皮肤 | `html[data-skin]` 与 `.dark` 分别为 pink / neutral+dark / neutral / comic |
| 点击卡片“发给 Agent” | 侧栏出现，入场动画 `wb-agent-in`；目标视频卡片出现关联描边（1 张） |
| 发送指令 | 出现“暂停 Agent 思考”、思考扫描线与骨架（见 *-3 截图） |
| 回复到达 | 自动填入提示词框（编辑器内容包含改写后的句子）；提示词面板发光；修改对比显示 6 行改动 |
| 底部“定位” | 目标卡片闪烁高亮（1 张） |
| 拖动交界 | 宽度由 380 变为 466 像素 |
| 点击“收起 Agent 侧边栏” | 状态依次为 open → closing → removed，closing 到移除约 0.20–0.22 秒，最终侧栏从 DOM 中移除 |
| 视频详情弹窗底色 | 暖樱粉、云母白 rgb(255, 255, 255)；影视暗房 rgb(29, 31, 35)；漫画分镜 rgb(255, 253, 247) |
| 顶部工具栏（1440 宽） | 操作区宽度与原始 0.5.23 构建逐像素一致：暖樱粉、影视暗房都是 931px（按钮合计 659px），云母白、漫画分镜控件略矮，为 927 / 929px。这组截图数据下目录栏 236px、面包屑较长，两边都折成两行（86px）；包内 1440 宽检查（≤56px）两边都通过 |
| 1024×800 窄窗口 | 视频页、打开 Agent 时、资产页均没有页面横向溢出 |
| 胭脂墨黑主按钮 | 计算样式为背景 rgb(255, 124, 162)、文字 rgb(0, 0, 0)（本轮开发构建上测量，相关代码之后未改） |
| 控制台 | 四套皮肤均无页面错误 |

注意：这些是界面层检查。Agent 回复来自测试替身，不代表真实 Codex / DeepSeek 调用已验证；没有提交任何生成任务。

## 六、未执行 / 需本机完成

- 在 Windows 本机完整运行 `node desktop-app/run-tests.cjs`，重点确认第二节“两边都失败”的项目，以及 `test-deepseek-agent-ui`、`test-studio-enhancements-ui`、`test-dreamina-ui`、`test-media-fixes-ui` 的原测试结果。
- Agent 自定义 API 密钥的 DPAPI 加密保存（云端用了替身）。
- `npm run build` 原脚本（会调用 Bun 构建桥接），本轮只运行了 `npx next build --webpack`。
- Windows 打包、成品一致性、隔离启动、VBS 入口、托盘与系统通知。
- 真实账号、真实 CLI、官网会话与扣费生成：没有授权，也未尝试。
- 中文输入法长文本输入、撤销重做与拖拽排序的人工体验（本轮没有改编辑器与排序逻辑，仍建议本机抽查）。
- 分享版：未修改、未测试。
