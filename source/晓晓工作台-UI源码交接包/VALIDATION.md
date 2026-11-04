# VALIDATION · 第 1 轮（设计选型预览）

运行环境：云端 Linux 容器，Node.js 22.23.4，npm 10.9.9，Next.js 16.2.9，Playwright 自带 Chromium。日期 2026-11-04。

## 实际执行的检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 安装依赖 | `npm ci`（在 `infinite-canvas/web`） | ✅ 成功，安装 681 个包，用时约 42 秒。锁文件未变。 |
| 类型检查 | `npx tsc --noEmit -p .` | ✅ 退出码 0，0 个错误（全项目，含新增预览文件）。格式化后重跑仍为 0。 |
| 前端构建 | `npx next build` | ✅ 退出码 0；`/design-preview`、`/design-preview/overview` 生成为静态页。构建日志提示“Skipping validation of types”（`next.config.ts` 中 `ignoreBuildErrors: true`，所以类型以上一行 tsc 为准），另有 1 条既有警告：`next.config.ts` → `src/app/api/codex-agent/route.ts` 的文件追踪范围过大（NFT），与本轮改动无关。 |
| 代码格式 | `npx prettier --check "src/app/design-preview/**/*.{ts,tsx,css}"` | ✅ 新增文件全部符合项目 Prettier 配置。 |
| 基线文件未改动 | 按 `manifest.json` 逐个比对 SHA-256 | ✅ 379 / 379 一致，无缺失。 |
| 预览渲染 | `npm run dev` + Playwright（1440×900，另含 1100×760 窄窗口） | ✅ 4 个方案 × 6 个视图 + 窄窗口 + 总览，共 26 张截图全部渲染完成，见 `preview-screenshots/`。 |
| 预览交互抽查 | Playwright 脚本 + 人工查看截图 | ✅ 视频卡片悬停按钮顺序、生成参数胶囊点击定位、视频详情、资产详情、Agent 侧栏、目录栏收起、功能栏收起可用。 |

## 预览运行中观察到的控制台信息（均为既有行为或云端环境所致）

- `GET /api/settings 502`，以及 `loadPublicSettings` 抛出的“接口连接失败，请确认后端服务已启动”（未处理的 Promise 拒绝）：根布局请求本机 Go 后端（127.0.0.1:8080），云端没有该服务。开发模式下 Next 左下角会显示 “1 Issue”，截图时用注入样式隐藏了 Next 开发浮标，界面本身不受影响。
- 开发服务器热更新期间偶发一次 `SyntaxError: Unexpected end of JSON input`（500），发生在保存文件后立即请求页面时，重新请求即恢复；生产构建中未出现。
- 没有发现预览组件自身的运行时错误。

## 未执行 / 不在本轮范围

- `npm run build`：该脚本会先运行未包含在交接包里的 `../canvas-agent` 构建脚本，未执行；用 `npx next build` 代替检查前端构建。
- 真实渠道生成、扣费、补帧、轮询恢复、账号授权、本地文件读写、Electron 桌面程序：云端没有这些服务，也没有授权，**未测试**。预览中的相关按钮只显示“预览：……”提示。
- 生产页面在桌面程序中的视觉回归：本轮未改生产文件，因此不涉及；选定方案后的下一轮需在本机按影响范围验证。
- 分享版：未修改、未测试。
