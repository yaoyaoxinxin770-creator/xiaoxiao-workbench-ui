#!/bin/bash
# 云端 Linux 容器专用：用包内真实的 Electron 主进程 / Next 前端 / Go 后端运行包内测试入口，并对比原始 0.5.23 与修改后源码。
# 不修改源码与测试；只在工作目录里构建副本。不要在 Windows 本机使用（本机直接按 AGENTS.md 运行 run-tests.cjs）。
#
# 用法: cloud-electron-checks.sh <仓库根目录> <工作目录> [基线提交=e5fd53c]
# 需要: git、Go（会按 go.mod 自动取工具链）、Node 22、npm、xvfb-run；infinite-canvas/web/node_modules 已按锁文件安装。
set -u
REPO=$1; WORK=$2; BASE_COMMIT=${3:-e5fd53c}
PKG="source-0.5.23/晓晓工作台-0.5.23-完整开发源码"; SRC="$REPO/$PKG"
mkdir -p "$WORK"; cd "$WORK" || exit 1
step(){ echo "=== $(date +%H:%M:%S) $*"; }

step "1. 原样 0.5.23（git archive 基线提交）与修改后源码副本"
mkdir -p base mod
(cd "$REPO" && git archive "$BASE_COMMIT" "$PKG") | tar -x -C base --strip-components=2
(cd "$SRC" && tar --exclude=./infinite-canvas/web/node_modules --exclude=./infinite-canvas/web/.next --exclude=./desktop-app/node_modules --exclude=./desktop-app/infinite-canvas-web -cf - .) | tar -x -C mod

step "2. Go 后端（Linux 可执行文件，按服务要求命名为 infinite-canvas-server.exe）"
mkdir -p bin && (cd base/infinite-canvas && go build -o "$WORK/bin/infinite-canvas-server.exe" .)

step "3. desktop-app 依赖（按 desktop-app/package-lock.json，含 Electron）"
mkdir -p deskdeps && cp base/desktop-app/package.json base/desktop-app/package-lock.json deskdeps/ && (cd deskdeps && npm ci --no-audit --no-fund)

for T in base mod; do
  step "4. $T：next build（standalone）→ prepare-native-runtime → 放入依赖与后端"
  cp -al "$SRC/infinite-canvas/web/node_modules" "$T/infinite-canvas/web/node_modules"
  (cd "$T/infinite-canvas/web" && npx next build --webpack > "$WORK/build-$T.log" 2>&1) || { echo "build $T failed"; exit 1; }
  (cd "$T" && node desktop-app/prepare-native-runtime.cjs) && cp -al deskdeps/node_modules "$T/desktop-app/node_modules" && cp bin/infinite-canvas-server.exe "$T/desktop-app/infinite-canvas-runtime/"
  # Agent 密钥保存只支持 Windows DPAPI：仅在云端副本的构建产物里短路平台判断，并用只回显的 PowerShell 替身（不加密）。
  for f in $(grep -rl "本机密钥保护仅支持Windows" "$T/desktop-app/infinite-canvas-web/.next/server"); do
    sed -i -E 's/"win32"!==process\.platform(\)return void [A-Za-z_$]+\(Error\("本机密钥保护仅支持Windows"\)\))/false\1/' "$f"
  done
done
mkdir -p fakewin/System32/WindowsPowerShell/v1.0
printf '#!/bin/sh\n# DPAPI stand-in for cloud runs only: echoes the payload (NOT encryption).\nexec cat\n' > fakewin/System32/WindowsPowerShell/v1.0/powershell.exe
chmod +x fakewin/System32/WindowsPowerShell/v1.0/powershell.exe

step "5. 两边并行运行包内完整入口 desktop-app/run-tests.cjs（Xvfb 虚拟屏）"
# 容器差异：root 运行需要 ELECTRON_DISABLE_SANDBOX；未设语言环境时 Chromium 读不了中文文件名，需 LANG=C.UTF-8；
# assets/storage-home.json 是 Windows 路径，需给绝对的 WORKBENCH_HOME_DIR。
for T in base mod; do
  mkdir -p "home-$T"
  (cd "$T" && env -u NODE_OPTIONS -u ELECTRON_RUN_AS_NODE LANG=C.UTF-8 LC_ALL=C.UTF-8 SystemRoot="$WORK/fakewin" ELECTRON_DISABLE_SANDBOX=1 WORKBENCH_HOME_DIR="$WORK/home-$T" \
    xvfb-run -a -s "-screen 0 1920x1080x24" node desktop-app/run-tests.cjs > "$WORK/full-$T.txt" 2>&1) &
done
wait
step "6. 对比"
for T in base mod; do echo "$T: $(grep -c '^PASS' "full-$T.txt") PASS / $(grep -c '^FAIL' "full-$T.txt") FAIL"; done
diff <(grep -E '^(PASS|FAIL)' full-base.txt | sed -E 's#^(PASS|FAIL) .*/(desktop-app|jimeng-canvas-extension)/#\1 \2/#' | sort -k2) \
     <(grep -E '^(PASS|FAIL)' full-mod.txt  | sed -E 's#^(PASS|FAIL) .*/(desktop-app|jimeng-canvas-extension)/#\1 \2/#' | sort -k2) && echo "两边逐项结果相同"
