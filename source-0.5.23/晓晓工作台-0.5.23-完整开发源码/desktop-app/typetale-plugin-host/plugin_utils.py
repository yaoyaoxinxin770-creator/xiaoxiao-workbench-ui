# -*- coding: utf-8 -*-
"""插件工具模块 —— 宿主提供给插件的统一配置读写接口。

字字动画的 168 个插件都写着 ``from plugin_utils import load_plugin_config``，
所以本工作台想直接跑这些插件，就必须提供一个同名同签名的模块。

本文件是**工作台自己的实现**，不是从 .pyd 反编译出来的（原 plugins/plugin_utils.py
是真源码，接口与行为以它为准，这里重写成等价实现并保留原有的三个关键设计）：

1. 每个 config.json 一把 RLock，把 load/save/update 串行化。同一个 config 在并发
   保存下会 read-modify-write，后写的线程用过期快照把先写的字段覆盖回旧值
   （典型表现：切换模型后 model 字段被同批触发的 aspect_ratio 写盘回退）。
2. 写临时文件 + os.replace 的原子写，避免读到半个文件、避免写一半崩溃损坏配置。
3. 空值覆盖保护：api_key / base_url / model 这类字段已有值时，不允许被空串覆盖。

配置路径沿用原布局 ``user_resources/plugins/{插件类型}/{插件文件夹名}/config.json``，
相对于进程 CWD 解析 —— 宿主（runner.py 的调用方）负责把 CWD 设成工作台的插件数据根
目录，这样从字字动画里拷过来的 config.json 放进同样的相对路径就能直接生效。
"""

import json
import os
import re
import threading
from pathlib import Path

_CONFIG_LOCKS = {}
_CONFIG_LOCKS_GUARD = threading.Lock()
_MAX_CONFIG_KEYS_PER_UPDATE = 128
_MAX_CONFIG_KEY_LENGTH = 96
_MAX_CONFIG_VALUE_JSON_BYTES = 256 * 1024
_CONFIG_KEY_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")

_PROTECTED_EMPTY_OVERWRITE_KEYS = {
    "api_key",
    "apikey",
    "access_key",
    "secret_key",
    "base_url",
    "model",
    "model_family",
    "browser_exe",
}


def _is_empty_config_value(value):
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def _is_protected_empty_overwrite_key(key):
    normalized = str(key or "").strip().lower()
    if normalized in _PROTECTED_EMPTY_OVERWRITE_KEYS:
        return True
    return normalized.endswith(
        ("_token", "_secret", "_password", "_passwd", "_cookie")
    )


def _validate_config_key(key):
    if not isinstance(key, str):
        raise ValueError("插件配置 key 必须是字符串")
    if not key or len(key) > _MAX_CONFIG_KEY_LENGTH or not _CONFIG_KEY_RE.match(key):
        raise ValueError("非法插件配置 key: %r" % (key,))


def _validate_config_value(value):
    try:
        encoded = json.dumps(value, ensure_ascii=False)
    except TypeError as exc:
        raise ValueError("插件配置值必须可 JSON 序列化") from exc
    if len(encoded.encode("utf-8")) > _MAX_CONFIG_VALUE_JSON_BYTES:
        raise ValueError("插件配置值过大")


def _normalize_config_updates(updates):
    if not isinstance(updates, dict):
        raise ValueError("插件配置更新必须是 dict")
    if len(updates) > _MAX_CONFIG_KEYS_PER_UPDATE:
        raise ValueError("单次插件配置更新字段过多")
    normalized = {}
    for key, value in updates.items():
        _validate_config_key(key)
        _validate_config_value(value)
        normalized[key] = value
    return normalized


def _filter_empty_overwrite_updates(current, updates, allow_empty_overwrite=False):
    updates = _normalize_config_updates(updates)
    if allow_empty_overwrite:
        return updates, []
    safe_updates = {}
    skipped_keys = []
    for key, value in dict(updates).items():
        if (
            _is_protected_empty_overwrite_key(key)
            and key in current
            and not _is_empty_config_value(current.get(key))
            and _is_empty_config_value(value)
        ):
            skipped_keys.append(key)
            continue
        safe_updates[key] = value
    return safe_updates, skipped_keys


def _get_config_lock(config_path):
    """获取或创建给定 config 路径对应的可重入锁。"""
    key = str(config_path)
    with _CONFIG_LOCKS_GUARD:
        lock = _CONFIG_LOCKS.get(key)
        if lock is None:
            lock = threading.RLock()
            _CONFIG_LOCKS[key] = lock
        return lock


def _get_plugin_folder_name(plugin_file):
    return Path(plugin_file).parent.name


def _get_plugin_subfolder_name(plugin_file):
    """插件类型目录名，例如 image_plugins / video_plugins。"""
    return Path(plugin_file).parent.parent.name


def _get_config_path(plugin_file, create_parent=False):
    plugin_folder_name = _get_plugin_folder_name(plugin_file)
    plugin_subfolder_name = _get_plugin_subfolder_name(plugin_file)
    relative_path = "user_resources/plugins/%s/%s" % (
        plugin_subfolder_name,
        plugin_folder_name,
    )
    config_dir = Path(relative_path).resolve()
    if create_parent:
        config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / "config.json"


def load_plugin_config(plugin_file):
    """加载插件配置，始终从磁盘读取以保证一致性。"""
    config_path = _get_config_path(plugin_file)
    with _get_config_lock(config_path):
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as handle:
                    loaded = json.load(handle)
                return loaded if isinstance(loaded, dict) else {}
            except Exception as exc:
                print("[PluginUtils] 加载配置文件失败: %s" % exc)
        return {}


def save_plugin_config(plugin_file, params):
    """保存插件配置（临时文件 + os.replace 原子写）。"""
    config_path = _get_config_path(plugin_file, create_parent=True)
    with _get_config_lock(config_path):
        tmp_path = str(config_path) + ".tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as handle:
                json.dump(params, handle, ensure_ascii=False, indent=2)
            os.replace(tmp_path, config_path)
        except Exception as exc:
            print("[PluginUtils] 保存配置文件失败: %s" % exc)
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
            raise


def update_plugin_param(plugin_file, key, value, allow_empty_overwrite=False):
    """更新单个插件参数；整段 read-modify-write 在同一把锁内执行。"""
    config_path = _get_config_path(plugin_file)
    with _get_config_lock(config_path):
        current = load_plugin_config(plugin_file)
        updates, skipped_keys = _filter_empty_overwrite_updates(
            current, {key: value}, allow_empty_overwrite=allow_empty_overwrite
        )
        if skipped_keys:
            print("[PluginUtils] 跳过空值覆盖保护: %s" % ", ".join(skipped_keys))
            return False
        current.update(updates)
        save_plugin_config(plugin_file, current)
    masked = "***" if ("key" in key.lower() or "password" in key.lower()) else value
    print("[PluginUtils] 参数已更新: %s = %s" % (key, masked))
    return True


def update_plugin_params(plugin_file, params_dict, allow_empty_overwrite=False):
    """批量更新插件参数。"""
    config_path = _get_config_path(plugin_file)
    with _get_config_lock(config_path):
        current = load_plugin_config(plugin_file)
        updates, skipped_keys = _filter_empty_overwrite_updates(
            current, params_dict, allow_empty_overwrite=allow_empty_overwrite
        )
        if updates:
            current.update(updates)
            save_plugin_config(plugin_file, current)
    if skipped_keys:
        print("[PluginUtils] 跳过空值覆盖保护: %s" % ", ".join(skipped_keys))
    print("[PluginUtils] 批量更新参数: %d 个" % len(updates))
    return {
        "saved_keys": list(updates.keys()),
        "skipped_empty_overwrite_keys": skipped_keys,
    }


def get_plugin_params(plugin_file):
    """获取插件当前参数的副本。"""
    return load_plugin_config(plugin_file).copy()
