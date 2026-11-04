# CHANGES · 第 1 轮（设计选型预览）

路径相对于 `infinite-canvas/web`，另有说明的除外。

## 修改的生产文件

**无。** 本轮没有修改任何生产页面、组件、样式、store、service、API route 或配置。
已用 `manifest.json` 逐个核对 379 个基线文件的 SHA-256，全部一致。

> `next dev` 运行时会自动改写 `next-env.d.ts`，提交前已从原 ZIP 恢复为原文件。

## 删除的文件

无。

## 新增文件（全部为“仅预览”，生产界面不引用）

| 文件 | 用途 |
| --- | --- |
| `src/app/design-preview/page.tsx` | 预览入口 `/design-preview`；读取 `scheme` / `view` 等 URL 参数，嵌套独立的 Ant Design 主题，组合外壳与各页面。 |
| `src/app/design-preview/overview/page.tsx` | 方案总览 `/design-preview/overview`，并排对比 4 个方案并链接到各页面。 |
| `src/app/design-preview/design-preview.css` | 预览样式。全部选择器以 `.dp-` 前缀或 `html[data-dp-scheme]` 限定，含 4 套方案变量和各方案细节。 |
| `src/app/design-preview/_components/schemes.ts` | 方案元信息（名称、色板、说明）与每个方案的 Ant Design 主题配置。 |
| `src/app/design-preview/_components/shell.tsx` | 预览控制条、顶部页签栏（对应 `app-top-nav.tsx`）、最左功能栏（对应 `app-navigation.tsx`）。 |
| `src/app/design-preview/_components/projects-view.tsx` | 项目管理页预览（对应 `(user)/projects/page.tsx`）。 |
| `src/app/design-preview/_components/studio-view.tsx` | 视频创作主界面预览：目录栏、视频/资产切换、工具栏、视频网格、浮动提示词坞、筛选/颜色/视图/选择弹层（对应 `video-studio.tsx`）。 |
| `src/app/design-preview/_components/video-tile.tsx` | 视频卡片预览：直角纯画面、悬浮按钮顺序、右键菜单、各生成状态（对应 `video-gallery.tsx` 中的卡片）。 |
| `src/app/design-preview/_components/prompt-panel.tsx` | 浮动提示词面板、参考素材卡、高亮编辑区、生成参数胶囊与面板、视频组切换、收起后的迷你坞（对应 `video/page.tsx` 的 bottom 布局、`composer-group-navigation.tsx`、`dreamina-video-channel.tsx`）。 |
| `src/app/design-preview/_components/agent-panel.tsx` | Agent 侧栏预览（对应 `codex-agent-panel.tsx`），含模拟“思考中 / 暂停”。 |
| `src/app/design-preview/_components/video-detail-modal.tsx` | 视频详情弹窗预览（备注、作品信息、提示词置顶/置底箭头、截取视频帧）。 |
| `src/app/design-preview/_components/assets-view.tsx` | 项目资产：分类与剧目角色目录、分组卡、全部文件、查看已禁用、属性检查器、资产详情弹窗（对应 `video-elements.tsx`、`element-archive.tsx`、`element-inspector-panel.tsx`）。 |
| `src/app/design-preview/_mock/mock-data.ts` | 虚构项目、文件夹、视频、参考素材、资产、角色、Agent 对话、任务数据。 |
| `src/app/design-preview/_mock/mock-art.tsx` | 用代码生成的原创 SVG 插画（场景封面、人物头像、音频波形），代替真实素材。 |
| `src/app/design-preview/_mock/preview-bridge.ts` | 仅在没有 `window.desktopBridge` 时安装的“未连接”桩：每个方法都返回被拒绝的 Promise，不返回假数据。原因见 INTEGRATION.md。 |

## 新增的非源码文件（交接包根目录）

| 文件 | 用途 |
| --- | --- |
| `设计方案说明.md` | 4 个方案的对比、共同改进、需要确认的显示差异、下一轮计划。 |
| `CHANGES.md` / `INTEGRATION.md` / `VALIDATION.md` | 本文件及整合、验证说明。 |
| `preview-screenshots/*.jpg` | 26 张预览截图（1440×900，2 倍像素）。 |

仓库根目录另加 `.gitignore`（忽略 `node_modules/`、`.next/`、`*.tsbuildinfo`）。
