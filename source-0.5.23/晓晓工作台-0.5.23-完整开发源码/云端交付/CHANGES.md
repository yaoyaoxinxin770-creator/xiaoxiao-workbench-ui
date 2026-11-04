# CHANGES · UI 第 2 轮（基于 0.5.23 业务基线）

- 基线：`晓晓工作台-0.5.23-完整开发源码.zip`。解压后按 `SOURCE_MANIFEST.json` 核对 889 个文件 SHA-256 全部一致，并作为独立提交保存（`e5fd53c Add untouched 0.5.23 full development source baseline`），后续改动都是可审阅的差异。
- 0.5.23 的前端（`infinite-canvas/web`）与第 1 轮使用的 0.5.22 UI 交接包逐文件一致，第 1 轮的 `design-preview` 已原样迁入，再按本轮要求修改。
- 路径均相对于本包根目录（`晓晓工作台-0.5.23-完整开发源码/`）。完整差异见同目录 `0.5.23-ui-round2.patch`。

## 修改的生产文件

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `infinite-canvas/web/src/app/layout.tsx` | 引入 `workbench-v3.css`；首屏主题脚本识别 `comic` 皮肤 | 其他皮肤值的处理不变 |
| `infinite-canvas/web/src/lib/app-theme.ts` | 云母白改为雾白配色、影视暗房改为胭脂墨黑配色；新增漫画分镜；胭脂墨黑的主按钮等控件保持 #FF7CA2 原色（不被暗色算法压暗）；胭脂墨黑的弹窗沿用原影视暗房浮层底色 #1D1F23 | 暖樱粉（默认）取值未改；弹窗底色与原界面检查“弹窗配色同步”一致 |
| `infinite-canvas/web/src/stores/use-theme-store.ts` | `skin` 类型增加 `"comic"` | 只扩展取值，存储键与版本不变 |
| `infinite-canvas/web/src/stores/use-workbench-layout-store.ts` | 新增 `agentPanelWidth`（默认 380，限制 320–640）与 `setAgentPanelWidth` | 存在原 `xiaoxiao:layout` 中，旧数据没有该字段时取默认值 |
| `infinite-canvas/web/src/components/layout/user-status-actions.tsx` | 皮肤菜单新增“漫画分镜”；原“暖樱粉 / 云母白 / 影视暗房”文字与对应存储值不变，只更新色点与悬停说明 | 本机 UI 检查按原文字点击菜单仍可用 |
| `infinite-canvas/web/src/app/(user)/video/components/codex-agent-panel.tsx` | 宽度改由布局 store 管理；交界拖动手柄；`closing` 时立即停止本次思考；标题栏模型徽标与状态指示灯、思考扫描线、思考骨架；回复的“修改对比 / 修改后全文”视图；“定位”按钮；样式钩子 | 所有原有 `aria-label`、文案、发送 / 暂停 / 回填 / 迟到回复保护 / 目标切换停止逻辑保持原样 |
| `infinite-canvas/web/src/app/(user)/video/components/video-studio.tsx` | 顶部工具栏分为“创作控制 / 视图管理”两组（按钮与顺序不变）；Agent 侧栏 open → closing → closed 状态；侧栏开合后视频区柔和过渡；定位当前目标；Agent 填入提示词时面板发光；向卡片传入关联状态 | 收起后侧栏仍从 DOM 移除 |
| `infinite-canvas/web/src/app/(user)/video/components/video-gallery.tsx` | `VideoGallery` 新增可选 `locate`（平滑滚动到虚拟列表中的某一行）；`StudioTile` 新增可选 `agentLinked`、`flash`，并输出 `data-status`、`data-agent-target`、`data-agent-flash` 与 `--wb-progress` | 悬浮按钮顺序、右键菜单、选择与拖动排序未改 |
| `工作台功能保留规则.md` | 第 7、8、48 条按本轮确认更新（皮肤、卡片关联标识、Agent 衔接交互） | 其他条款未改 |

## 新增文件

| 文件 | 用途 | 性质 |
| --- | --- | --- |
| `infinite-canvas/web/src/app/workbench-v3.css` | 四套皮肤的颜色变量与动效层：Agent 侧栏滑入滑出、交界手柄、思考扫描线、消息进入、卡片悬停与生成进度、提示词面板浮层与发光、资产 / 项目卡片动效 | 生产 |
| `infinite-canvas/web/src/app/(user)/video/agent-prompt-diff.ts` | 行级 + 逐字修改对比（纯函数，只用于显示） | 生产 |
| `desktop-app/test-agent-prompt-diff.mjs` | 上面函数的单元测试 | 测试（个人版测试数 166 → 167） |
| `infinite-canvas/web/src/app/design-preview/**` | 设计预览路由与虚构数据（第 1 轮迁入；方案 B 改为胭脂墨黑） | 仅预览 |
| `云端交付/**` | 本文件、整合说明、验证记录、截图、补丁与改动文件 ZIP | 文档 |

## 删除的文件

无。

## 没有改动的部分

Electron 主进程与 preload、Go 后端、CLI 适配、渠道提交、扣费确认、任务恢复与轮询、素材匹配与引用、历史素材保留、账号隔离、存储结构、`video/page.tsx`（提示词编辑器与底部生成工具栏 JSX）、`desktop-app` 业务代码、版本号、锁文件与依赖。

## 用户可见的行为变化

1. 皮肤菜单变为四项；“云母白”“影视暗房”沿用原名称，但分别换成雾白、胭脂墨黑配色；新增“漫画分镜”。默认仍是暖樱粉。
2. Agent 侧栏：
   - 打开时滑入；点“收起 Agent 侧边栏”时先立即停止本次思考（与原先收起即卸载时一致），约 0.18 秒滑出后移除。
   - 侧栏与视频台交界处可以拖动调宽（320–640 像素），双击恢复 380，键盘左右键每次 20 像素；宽度会记住。原“加宽侧栏”按钮保留，切换宽度从 380↔500 改为 380↔520。
   - 回复卡片默认显示“修改对比”（与发送时的原提示词逐行、逐字对比），可切到“修改后全文”。该对比只用于显示，不参与回填判断。
   - 底部“当前目标”行新增“定位”，在视频台中滚动到该视频并闪烁高亮。
3. 视频卡片：悬停时封面轻微放大、出现描边，操作按钮依次滑入；Agent 侧栏打开期间，当前对象视频显示描边与“Agent”角标；生成中显示底部进度条与扫光。选择圈仍直接覆盖原编号（编号不让位）；已收藏的星号悬停时也不加实体底色。仍是直角纯画面，没有新增说明区块。
4. 视频页顶部工具栏分为两组，中间加细分隔线；按钮、顺序与位置关系不变（自动匹配开关仍在顶部工具栏）；“Agent”“自动匹配”开启时按钮外圈柔光。分隔线和柔光都不占布局宽度，工具栏宽度与 0.5.23 相同。
5. Agent 把修改填入提示词框时，提示词面板外圈短暂发光。

第 1 轮预览中的“资产工具栏图标化”没有应用到生产界面：生产界面的资产工具栏在检查器默认收起时已能单行显示，保持原样。

## 对照本机界面检查后修正的兼容问题

本轮在云端实际运行了包内的 Electron 界面检查（方法见 VALIDATION.md），并逐条比对了样式断言，修正了以下与原有验收冲突的地方：

| 问题 | 依据（包内检查） | 处理 |
| --- | --- | --- |
| 第 1 轮预览的“编号向右让开勾选圈” | `video-recovery-ui-check.cjs`：选择圈直接覆盖原数字，数字不让位 | 生产界面与设计预览均撤回，编号位置不动 |
| 工具栏分组的分隔线（11px）和自动匹配指示灯（14px）增加了宽度，1440 宽窗口下工具栏折成两行 | `layout-refinements-ui-check.cjs`：工具栏高度 ≤56px | 分隔线画进原有 8px 间隙，指示灯改为开启时外圈柔光；云端测得操作区宽度与 0.5.23 逐像素一致，修正后该检查通过 |
| 胭脂墨黑把弹窗底色也改成近黑 | `video-recovery-ui-check.cjs`：影视暗房弹窗背景 rgb(29, 31, 35) | 弹窗沿用原 #1D1F23 |
| 悬停与漫画皮肤给已收藏的星号加了实体底色 | `pippit-ui-check.cjs`：已收藏星号无实体底色 | 已收藏（`aria-pressed=true`）的星号不再加底色 |
