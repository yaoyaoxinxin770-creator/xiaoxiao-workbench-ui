# 晓晓原生工作台与 infinite-canvas

原作者：tigerowo 与 infinite-canvas 的贡献者。上游许可证 AGPL-3.0，全文见 LICENSE。

官方来源：https://github.com/tigerowo/infinite-canvas ，v0.8.0 公开源码提交 edd4452cb9b0d93dbb9c1ea5acdea1ee14015800。

infinite-canvas-server.exe 来自官方中文 MSI，二进制未修改，校验和见 ORIGIN.json。官方 Windows 构建使用另一个覆盖层提交，不能声称该二进制与公开标签源码完全相同；官方清单保存在工作台 output/infinite-canvas-build-manifest.json。

0.3.0 修改了上游 Next/React 前端：加入原生项目管理与个人自动化页、导航入口及 scoped DOM 运行时。修改后的源码位于工作台 infinite-canvas/web/src，个人执行模块与桌面生命周期代码位于 desktop-app 和 jimeng-canvas-extension。前端没有使用该官方二进制内嵌的网页。保留上游画布与作者标识。

构建说明见 desktop-app/README.md，发布目录提供对应的晓晓工作台-0.3.0-源码.zip。第三方依赖各自许可证保留在运行包 node_modules。

ComfyUI 附件由上游 canvas-agent/native/comfy-bridge 原始源码使用官方 Go 1.27.1 工具构建，未修改其源码。
