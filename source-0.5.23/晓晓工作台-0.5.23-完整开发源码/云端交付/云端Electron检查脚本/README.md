# 云端 Electron 检查脚本（仅云端 Linux 容器使用）

本轮在云端用包内**真实的** Electron 主进程、preload、Next standalone 前端和 Go 后端运行了包内测试入口，结果见 `../VALIDATION.md`。这些脚本记录具体做法，便于复核；本机 Windows 直接按 `AGENTS.md` 运行 `node desktop-app/run-tests.cjs`，不需要也不应使用这里的脚本。

- `cloud-electron-checks.sh`：从基线提交导出原样 0.5.23、复制修改后源码，分别构建并在 Xvfb 虚拟屏下并行运行 `desktop-app/run-tests.cjs`，最后逐项对比。
- `deepseek-wait-diag.py`：生成 DeepSeek Agent 检查的诊断副本（只在参数弹层出现后多等 600ms 再测量，断言不改），用来让后半段的 Agent 断言在云端跑完。

为适应容器做的调整（两边完全相同，都不改源码和测试文件）：

| 调整 | 原因 |
| --- | --- |
| `ELECTRON_DISABLE_SANDBOX=1` | 容器以 root 运行，Electron 拒绝在 root 下启用沙箱 |
| `LANG=C.UTF-8`、`LC_ALL=C.UTF-8` | 容器未设语言环境时，Chromium 无法通过 CDP 设置中文文件名（如“空白区导入.wav”） |
| `WORKBENCH_HOME_DIR=<绝对路径>` | `desktop-app/assets/storage-home.json` 是 Windows 路径，在 Linux 不是绝对路径 |
| Go 后端按 Linux 编译，命名为 `infinite-canvas-server.exe` | 服务按此文件名启动后端 |
| `SystemRoot` 指向只回显的 PowerShell 替身，并在**云端构建产物**里短路 `process.platform !== "win32"` 判断 | Agent 自定义 API 密钥用 Windows DPAPI 加密保存；替身不加密，只为让后续 Agent 断言能执行。DPAPI 本身必须在本机验证 |
| 去掉 `NODE_OPTIONS` | 容器代理设置里的 `--use-openssl-ca` 不被 Electron 支持 |
