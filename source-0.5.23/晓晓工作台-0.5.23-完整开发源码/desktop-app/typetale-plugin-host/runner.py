# -*- coding: utf-8 -*-
"""字字动画插件宿主 —— 在工作台里加载并执行一个插件文件夹的 main.py。

用法：
    python runner.py inspect  <plugin_dir> <result_file>
    python runner.py generate <plugin_dir> <result_file> <context_file>

插件协议（依据 plugins/image_plugins/example/main.py 的接口说明，以及
video_plugin_zzdhapi / sora2_plugin_comfly / video_plugin_geeknow 等真源码插件里
context.get(...) 的实际取值）：

- 插件 = 一个文件夹，含 main.py，必须有 generate(context)，可选 get_info() / get_params()
- generate() 返回生成文件的完整路径列表
- 插件用 raise Exception("PLUGIN_ERROR:::原因") 表示「不要再重试」的致命错误

宿主必须做对的三件事，漏掉任何一件插件都会以难查的方式失败：

1. **sys.path**：插件里写的是 ``from plugin_utils import load_plugin_config``，
   而它自己只 append 了插件目录和类型目录。plugin_utils.py 在 plugins 根目录，
   所以宿主要把「插件目录 / 类型目录 / plugins 根目录」都放进 sys.path，并把本
   宿主目录垫在最后作为兜底（插件树里没带 plugin_utils.py 时用我们的等价实现）。
2. **CWD**：plugin_utils 用相对路径 ``user_resources/plugins/...`` 定位 config.json，
   即相对于进程 CWD。宿主必须把 CWD 设成固定的插件数据根目录，否则同一个插件在
   不同项目里会读到不同的配置，API Key 每次都"丢了"。
3. **reference_images 的键类型**：协议里是 0 基**整数**键字典，但 JSON 里对象键
   只能是字符串。插件普遍写 ``all(isinstance(k, int) for k in keys)`` 来判断要不要
   包成 {"参考图片MAP": ...}，字符串键会让这个判断为假，接着
   reference_images.get("首帧") 永远取不到值。所以这里 json.loads 之后必须把
   数字字符串键转回 int。
"""

import io
import json
import os
import sys
import traceback
from pathlib import Path

RESULT_MARKER = "__TYPETALE_RESULT__="
PROGRESS_MARKER = "__TYPETALE_PROGRESS__="
FATAL_PREFIX = "PLUGIN_ERROR:::"


def _reconfigure_stdio():
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass
        elif stream is not None and hasattr(stream, "buffer"):
            setattr(sys, stream_name, io.TextIOWrapper(stream.buffer, encoding="utf-8", errors="replace"))


def _prepare_sys_path(plugin_dir):
    """插件目录 / 类型目录 / plugins 根目录 + 本宿主目录（兜底 plugin_utils）。"""
    host_dir = Path(__file__).resolve().parent
    plugin_dir = Path(plugin_dir).resolve()
    candidates = [plugin_dir, plugin_dir.parent, plugin_dir.parent.parent]
    for candidate in candidates:
        value = str(candidate)
        if value not in sys.path:
            sys.path.insert(0, value)
    # 兜底放最后：插件树自带 plugin_utils.py 时优先用它自己的那份。
    host_value = str(host_dir)
    if host_value in sys.path:
        sys.path.remove(host_value)
    sys.path.append(host_value)


def _load_module(plugin_dir):
    import importlib.util

    entry = Path(plugin_dir).resolve() / "main.py"
    if not entry.exists():
        raise RuntimeError("插件目录中没有 main.py：%s" % entry)
    # 模块名带上文件夹名，避免同一进程里多个插件互相顶掉 sys.modules['main']。
    module_name = "typetale_plugin_%s" % entry.parent.name.replace("-", "_").replace(".", "_")
    spec = importlib.util.spec_from_file_location(module_name, str(entry))
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载插件模块：%s" % entry)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _restore_int_keys(value):
    """把 JSON 里的数字字符串键还原成 int（见模块 docstring 第 3 点）。"""
    if not isinstance(value, dict):
        return value
    restored = {}
    for key, item in value.items():
        if isinstance(key, str) and key.lstrip("-").isdigit():
            restored[int(key)] = item
        else:
            restored[key] = item
    return restored


def _progress(message):
    try:
        sys.stdout.write(PROGRESS_MARKER + json.dumps({"message": str(message)}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def _emit(result_file, payload):
    text = json.dumps(payload, ensure_ascii=False, default=str)
    if result_file:
        # 结果走单独的文件：插件自己往 stdout 打了大量日志，混在一起解析容易被
        # 插件打印的内容干扰（有插件会原样回显提示词，里面可能就含有标记串）。
        Path(result_file).write_text(text, encoding="utf-8")
    sys.stdout.write(RESULT_MARKER + text + "\n")
    sys.stdout.flush()


def _call_optional(module, name):
    entry = getattr(module, name, None)
    if not callable(entry):
        return None
    try:
        return entry()
    except Exception as exc:
        print("[Runner] %s() 调用失败：%s" % (name, exc))
        return None


def _run_inspect(plugin_dir, result_file):
    module = _load_module(plugin_dir)
    info = _call_optional(module, "get_info") or {}
    params = _call_optional(module, "get_params") or {}
    _emit(result_file, {
        "ok": True,
        "info": info if isinstance(info, dict) else {},
        "params": params if isinstance(params, dict) else {},
        "hasGenerate": callable(getattr(module, "generate", None)),
        "hasExecute": callable(getattr(module, "execute", None)),
        "hasGetParams": callable(getattr(module, "get_params", None)),
    })


def _run_generate(plugin_dir, result_file, context_file):
    context = json.loads(Path(context_file).read_text(encoding="utf-8"))
    if not isinstance(context, dict):
        raise RuntimeError("context 必须是 JSON 对象")
    context["reference_images"] = _restore_int_keys(context.get("reference_images") or {})
    # progress_callback 是个可调用对象，过不了 JSON，只能由宿主在这里注入。
    context["progress_callback"] = _progress

    module = _load_module(plugin_dir)
    entry = getattr(module, "generate", None) or getattr(module, "execute", None)
    if not callable(entry):
        raise RuntimeError("插件既没有 generate() 也没有 execute()")

    result = entry(context)
    if hasattr(result, "__await__"):
        import asyncio

        result = asyncio.run(result)

    paths = [str(item) for item in result] if isinstance(result, (list, tuple)) else ([str(result)] if result else [])
    existing = [item for item in paths if os.path.exists(item)]
    _emit(result_file, {
        "ok": True,
        "result": paths,
        "files": existing,
        # 插件返回了路径但文件不在盘上，通常意味着它吞掉了自己的异常。
        "missingFiles": [item for item in paths if item not in existing],
    })


def main(argv):
    _reconfigure_stdio()
    if len(argv) < 3:
        print("用法：runner.py <inspect|generate> <plugin_dir> <result_file> [context_file]")
        return 2
    mode, plugin_dir, result_file = argv[0], argv[1], argv[2]
    _prepare_sys_path(plugin_dir)
    try:
        if mode == "inspect":
            _run_inspect(plugin_dir, result_file)
        elif mode == "generate":
            if len(argv) < 4:
                raise RuntimeError("generate 模式需要 context 文件")
            _run_generate(plugin_dir, result_file, argv[3])
        else:
            raise RuntimeError("未知模式：%s" % mode)
        return 0
    except BaseException as exc:  # noqa: BLE001 - 任何失败都要变成结构化结果回传
        message = str(exc)
        fatal = message.startswith(FATAL_PREFIX)
        _emit(result_file, {
            "ok": False,
            # PLUGIN_ERROR::: 前缀是插件声明「别再重试」的约定，剥掉前缀只留原因。
            "error": message[len(FATAL_PREFIX):] if fatal else message,
            "fatal": fatal,
            "traceback": traceback.format_exc(),
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
