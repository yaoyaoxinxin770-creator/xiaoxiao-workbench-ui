"""云端诊断用：生成 deepseek-agent-ui-check.cjs 的副本，只在“参数面板”出现后多等 600ms 再测量（弹层缩放动画），其余断言原样保留。
用法: python3 deepseek-wait-diag.py <副本的 desktop-app 目录>  → 写出 cloud-diag2-deepseek-agent-ui-check.cjs（不改原文件）。"""
import os, sys
d = sys.argv[1]
s = open(os.path.join(d, "deepseek-agent-ui-check.cjs"), encoding="utf-8").read()
old = "await fixture.until(()=>visible('[data-generation-params-popover]'),'参数面板');"
assert s.count(old) == 1
open(os.path.join(d, "cloud-diag2-deepseek-agent-ui-check.cjs"), "w", encoding="utf-8").write(
    s.replace(old, old + "await fixture.sleep(600);/*CLOUD-DIAG: wait for popover zoom animation before measuring*/"))
print("written")
