# 云端截图与界面检查脚本（不属于工作台源码）

这些脚本只在测试浏览器里运行：注入一个返回固定结构的 `desktopBridge` 替身，向测试浏览器的 IndexedDB 写入虚构项目、视频与资产，并拦截 `/api`（`/api/codex-agent` 返回固定改写结果）。它们不修改源码、生产 store 或接口，也不会访问本机项目数据。

前提：端口 3000 上有工作台前端，可以是 `infinite-canvas/web` 内的 `npm run dev`，也可以是构建后的 standalone 服务（`next build` → `prepare-native-runtime.cjs` 后在 `desktop-app/infinite-canvas-web` 内以 `PORT=3000 node server.js` 启动；本轮最终截图用的是后者），并且运行环境里可以 `require("playwright")`。

- `node harness.cjs <输出目录> <缩放1或2> A,B,C,D all`：四套皮肤的项目管理、视频创作、Agent 思考中、Agent 回复对比、项目资产截图，并输出开合时间线、关联卡片、回填与定位、1440 宽窗口下顶部工具栏高度、视频详情弹窗底色等检查结果。皮肤代号：A 暖樱粉、B 影视暗房（胭脂墨黑）、C 云母白（雾白）、D 漫画分镜。
- `node narrow.cjs`：1024×800 窗口下检查视频页、打开 Agent 时和资产页是否出现页面横向溢出。
- `node toolbar-measure.cjs A,B,C,D`：1440×900 下测量视频页顶部工具栏的高度、左右两部分和按钮总宽，用于与原始 0.5.23 的构建逐像素对比。
- `node preview-shoot.cjs <输出目录> <缩放> [过滤]`：设计预览路由（`/design-preview`）截图。

这些检查只验证界面层；Agent 回复是测试替身，不代表真实 Codex / DeepSeek 或任何生成任务已验证。
