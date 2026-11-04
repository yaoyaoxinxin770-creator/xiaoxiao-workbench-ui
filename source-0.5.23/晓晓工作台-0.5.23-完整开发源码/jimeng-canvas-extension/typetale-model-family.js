// 模型族（model family）—— chip token 格式、参考前缀、素材上限的单一真相源。
//
// 这一层照搬字字动画 utils/model_family.py 的概念模型（该文件是 Cython .pyd，
// 无法反编译；下面是按 reconstructed_source/utils/model_family.pyi 的 docstring
// 与 ui_frontend 里 ModelFamilyManager 组件的校验/预览逻辑重写的等价实现）。
//
// 为什么工作台需要它：改造前参考前缀拼接散在 compilePrompt 一处、chip 只有
// "@image{n}" 一种格式、素材上限根本没有。三件事收归成「每个模型归属一个族」
// 之后，通用 API / 插件 / CLI 三条执行路径共用同一套编号，不会再出现
// 「payload 里有第 4 张图，但前缀只声明到图 3」。
//
// 诚实标注：族的 id、字段、校验规则、预览规则来自还原产物；但各族 limits 的
// 具体数字在原程序里是 .pyd 内的 _BUILTIN_FAMILIES，拿不到。下面的数字是本
// 工作台的出厂默认值，可在族编辑器里改，改后存 user_resources/model_families/。
(function attachModelFamily(global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.TypeTaleModelFamily = api;
})(typeof window !== 'undefined' ? window : globalThis, function createModelFamily() {
  const KIND_IMAGE = 'image';
  const KIND_VIDEO = 'video';
  const VALID_KINDS = [KIND_IMAGE, KIND_VIDEO];
  const MEDIA_IMAGE = 'image';
  const MEDIA_VIDEO = 'video';
  const MEDIA_AUDIO = 'audio';
  const MEDIA_TYPES = [MEDIA_IMAGE, MEDIA_VIDEO, MEDIA_AUDIO];
  const MEDIA_LIMIT_KEY = {image: 'images', video: 'videos', audio: 'audios'};
  const LIMIT_KEYS = ['images', 'videos', 'audios'];
  // 未识别出实体名时的兜底文案，对应 reference_slots.default_label。
  const MEDIA_NOUN = {image: '图', video: '视频', audio: '音频'};
  const DEFAULT_PREFIX_TEMPLATE = '{token}是{label}';
  const DEFAULT_PREFIX_TOKENS = {image: '图{n}', video: '视频{n}', audio: '音频{n}'};
  const JIMENG_CHIP_TOKENS = {image: '@图片{n}', video: '@视频{n}', audio: '@音频{n}'};
  const H3_TOKENS = {image: '<Picture {n}>', video: '<Video {n}>', audio: '<Audio {n}>'};
  const ID_RE = /^[A-Za-z0-9\-_.]+$/;

  function cleanText(value) { return String(value ?? '').trim(); }

  // 与 model_family.safe_kind 同义：把任意输入归一到 image / video，非法值回落 video。
  function safeKind(kind) {
    return cleanText(kind).toLowerCase() === KIND_IMAGE ? KIND_IMAGE : KIND_VIDEO;
  }

  // 图片模型不吃视频与音频参考，所以图片族只有 image 一种媒体。
  function mediaKeysFor(kind) {
    return safeKind(kind) === KIND_IMAGE ? [MEDIA_IMAGE] : MEDIA_TYPES.slice();
  }

  function limitKeysFor(kind) {
    return mediaKeysFor(kind).map(media => MEDIA_LIMIT_KEY[media]);
  }

  function spec(id, name, kind, options = {}) {
    const expand = options.expand_chips === true;
    return {
      id,
      name,
      kind,
      builtin: true,
      expand_chips: expand,
      merge_labels: options.merge_labels !== false,
      emit_prefix: options.emit_prefix !== false,
      prefix_template: options.prefix_template || DEFAULT_PREFIX_TEMPLATE,
      prefix_tokens: {...DEFAULT_PREFIX_TOKENS, ...(options.prefix_tokens || {})},
      chip_tokens: expand ? {...JIMENG_CHIP_TOKENS, ...(options.chip_tokens || {})} : null,
      limits: options.limits || null,
      infer_keywords: options.infer_keywords || [],
      note: options.note || '',
    };
  }

  // 出厂族。id 与语义来自 model_family.pyi 的常量名（FAMILY_JIMENG_20 等）；
  // limits 数字是工作台默认值，不是原程序值。
  const BUILTIN_FAMILIES = {
    video: [
      spec('none', '默认族（不展开 chip）', KIND_VIDEO, {
        expand_chips: false,
        note: '@实体名 保持原文，只靠参考前缀声明。不确定模型吃什么格式时用这个最安全。',
      }),
      spec('jimeng_2_0', '即梦 2.0 / Seedance 2.0', KIND_VIDEO, {
        expand_chips: true,
        limits: {images: 10, videos: 1, audios: 1},
        infer_keywords: ['seedance', '即梦', 'jimeng', 'doubao'],
        note: '@图片N 格式；上限用工作台默认 10 图 / 1 视频 / 1 音频。',
      }),
      spec('jimeng_2_5', '即梦 2.5 / Seedance 2.5', KIND_VIDEO, {
        expand_chips: true,
        limits: {images: 10, videos: 3, audios: 3},
        infer_keywords: ['seedance2.5', 'seedance-2.5', '即梦2.5'],
        note: '2.5 必须匹配原始串再判定，否则 seedance-2.0-mini 会被误命中（见 _has_25）。',
      }),
      spec('h3', 'H3（Picture 标签）', KIND_VIDEO, {
        expand_chips: true,
        merge_labels: false,
        chip_tokens: H3_TOKENS,
        prefix_tokens: H3_TOKENS,
        prefix_template: '{token} 是{label}',
        limits: {images: 4, videos: 1, audios: 1},
        infer_keywords: ['h3', 'hunyuan3', 'fl2va'],
        note: 'H3 不允许同标签合并：<Picture 1、3> 不是合法标签，必须逐个引用。',
      }),
      spec('wan_3_0', '通义万相 3.0', KIND_VIDEO, {
        expand_chips: false,
        limits: {images: 3, videos: 0, audios: 0},
        infer_keywords: ['wan3', 'wan-3', 'wan2.6', 'wanx', '万相'],
        note: 'wan 系走首尾帧输入位，参考图只做声明，不展开 chip。',
      }),
      spec('zzdh_video', '字字动画视频（系统固定）', KIND_VIDEO, {
        expand_chips: true,
        limits: {images: 10, videos: 1, audios: 1},
        infer_keywords: ['zzdh', 'zizidonghua'],
        note: '对应 family_for_zzdh_model；原程序里 UI 只读，这里允许改但不建议。',
      }),
    ],
    image: [
      spec('none', '默认族（不展开 chip）', KIND_IMAGE, {expand_chips: false}),
      spec('omni_nano', 'Nano Banana / Omni', KIND_IMAGE, {
        expand_chips: false,
        limits: {images: 6},
        infer_keywords: ['nano', 'banana', 'gemini', 'omni'],
      }),
      spec('omni_image2', 'Omni Image 2', KIND_IMAGE, {
        expand_chips: false,
        limits: {images: 4},
        infer_keywords: ['image2', 'image-2', 'omni2'],
      }),
      spec('zzdh_image', '字字动画图片（系统固定）', KIND_IMAGE, {
        expand_chips: false,
        limits: {images: 10},
        infer_keywords: ['zzdh', 'zizidonghua'],
      }),
    ],
  };

  function clone(value) {
    return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeLimits(value, kind) {
    if (!value || typeof value !== 'object') return null;
    const limits = {};
    let any = false;
    for (const key of limitKeysFor(kind)) {
      const raw = value[key];
      if (raw === '' || raw === null || raw === undefined) continue;
      const number = Number(raw);
      if (!Number.isInteger(number) || number < 0) continue;
      limits[key] = number;
      any = true;
    }
    return any ? limits : null;
  }

  function normalizeFamily(input, kind) {
    const value = input && typeof input === 'object' ? input : {};
    const resolvedKind = safeKind(value.kind || kind);
    const expand = value.expand_chips === true;
    const prefixTokens = {};
    const chipTokens = {};
    for (const media of mediaKeysFor(resolvedKind)) {
      prefixTokens[media] = cleanText(value.prefix_tokens?.[media]) || DEFAULT_PREFIX_TOKENS[media];
      chipTokens[media] = cleanText(value.chip_tokens?.[media]) || JIMENG_CHIP_TOKENS[media];
    }
    return {
      id: cleanText(value.id),
      name: cleanText(value.name) || cleanText(value.id),
      kind: resolvedKind,
      builtin: value.builtin === true,
      expand_chips: expand,
      merge_labels: value.merge_labels !== false,
      emit_prefix: value.emit_prefix !== false,
      prefix_template: cleanText(value.prefix_template) || DEFAULT_PREFIX_TEMPLATE,
      prefix_tokens: prefixTokens,
      chip_tokens: expand ? chipTokens : null,
      limits: normalizeLimits(value.limits, resolvedKind),
      infer_keywords: Array.isArray(value.infer_keywords) ? value.infer_keywords.map(cleanText).filter(Boolean) : [],
      note: cleanText(value.note),
    };
  }

  function builtinFamilies(kind) {
    return clone(BUILTIN_FAMILIES[safeKind(kind)] || []);
  }

  function builtinFamilyIds(kind) {
    return builtinFamilies(kind).map(family => family.id);
  }

  function isBuiltin(kind, familyId) {
    return builtinFamilyIds(kind).includes(cleanText(familyId));
  }

  // 用覆盖层字段合并到出厂默认之上。只合并已知字段，避免用户文件里的脏键污染
  // spec；dict 型字段整体替换而非浅合并——半个 chip_tokens 会渲染出错位的 token。
  function mergeSpec(base, override) {
    if (!override || typeof override !== 'object') return base;
    const merged = {...base};
    for (const key of ['name', 'prefix_template', 'note']) {
      if (cleanText(override[key])) merged[key] = cleanText(override[key]);
    }
    for (const key of ['expand_chips', 'merge_labels', 'emit_prefix']) {
      if (typeof override[key] === 'boolean') merged[key] = override[key];
    }
    for (const key of ['prefix_tokens', 'chip_tokens', 'limits']) {
      if (Object.hasOwn(override, key)) merged[key] = clone(override[key]);
    }
    if (Array.isArray(override.infer_keywords)) {
      merged.infer_keywords = override.infer_keywords.map(cleanText).filter(Boolean);
    }
    return merged;
  }

  // 该 kind 的生效族表：出厂默认（可被同 id 覆盖）+ 自建族。出厂族在前且保持
  // 声明顺序，自建族按 id 排序追加；每项带 builtin / modified 两个只读标记。
  function listFamilies(kind, overrides = {}) {
    const resolvedKind = safeKind(kind);
    const table = overrides && typeof overrides === 'object' ? overrides : {};
    const builtins = builtinFamilies(resolvedKind).map(family => {
      const override = table[family.id];
      const merged = normalizeFamily(mergeSpec(family, override), resolvedKind);
      return {...merged, builtin: true, modified: Boolean(override)};
    });
    const builtinIds = new Set(builtins.map(family => family.id));
    const custom = Object.entries(table)
      .filter(([id]) => !builtinIds.has(id))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, value]) => ({...normalizeFamily({...value, id}, resolvedKind), builtin: false, modified: false}));
    return [...builtins, ...custom];
  }

  function defaultFamily(kind, overrides = {}) {
    const families = listFamilies(kind, overrides);
    return families.find(family => family.id === 'none') || families[0] || normalizeFamily({id: 'none', name: '默认族'}, kind);
  }

  // 按 id 取生效族。取不到时 fallback 为真则回落默认族，否则返回 null。
  function getFamily(kind, familyId, {overrides = {}, fallback = true} = {}) {
    const id = cleanText(familyId);
    const found = listFamilies(kind, overrides).find(family => family.id === id);
    if (found) return found;
    return fallback ? defaultFamily(kind, overrides) : null;
  }

  function expandChipsEnabled(family) { return Boolean(family?.expand_chips); }
  // 缺字段按开启处理（老族文件兼容）。
  function emitPrefixEnabled(family) { return family?.emit_prefix !== false; }
  // 族是否允许同标签合并成一句（H3 为否）。
  function mergeLabelsEnabled(family) { return family?.merge_labels !== false; }

  // 返回 {images: n|null, videos: n|null, audios: n|null}。
  function familyLimits(family) {
    const limits = family?.limits && typeof family.limits === 'object' ? family.limits : {};
    return Object.fromEntries(LIMIT_KEYS.map(key => {
      const value = Number(limits[key]);
      return [key, Object.hasOwn(limits, key) && Number.isInteger(value) ? value : null];
    }));
  }

  // 族对某媒体类型的数量上限；null 表示族不施加上限。
  function familyLimit(family, mediaType) {
    const key = MEDIA_LIMIT_KEY[cleanText(mediaType)] || MEDIA_LIMIT_KEY.image;
    return familyLimits(family)[key];
  }

  // 按族上限把列表切成 (在限内, 超限) 两批。上限为 null 时全部算在限内。
  // 超限素材既不参与 chip 替换也不进参考前缀，与 payload 侧的截断保持严格一致。
  function clampToLimit(items, family, mediaType) {
    const list = Array.isArray(items) ? items : [];
    const limit = familyLimit(family, mediaType);
    if (limit === null) return {within: list.slice(), overflow: []};
    return {within: list.slice(0, limit), overflow: list.slice(limit)};
  }

  function renderTemplate(template, n) {
    return String(template || '').split('{n}').join(String(n));
  }

  // 渲染 chip token（如 @图片1 / <Picture 1>）。族不展开 chip 或该媒体类型无
  // 模板时返回空串，调用方应保持 @实体名 原文。
  function chipToken(family, mediaType, n) {
    if (!expandChipsEnabled(family)) return '';
    const template = family?.chip_tokens?.[cleanText(mediaType)] || '';
    return template ? renderTemplate(template, n) : '';
  }

  // 渲染参考前缀里的编号符号（如 图1 / <Picture 1>）。
  // n 可以是合并后的串（如 "1、3"），模板里的 {n} 原样替换。
  function prefixToken(family, mediaType, n) {
    const media = cleanText(mediaType);
    const template = family?.prefix_tokens?.[media] || DEFAULT_PREFIX_TOKENS[media] || '';
    return template ? renderTemplate(template, n) : '';
  }

  // 渲染一条完整的参考前缀句（如 图1是张三 / <Picture 1> 是张三）。
  function prefixSentence(family, mediaType, n, label) {
    const token = prefixToken(family, mediaType, n);
    if (!token) return '';
    return String(family?.prefix_template || DEFAULT_PREFIX_TEMPLATE)
      .split('{token}').join(token)
      .split('{label}').join(String(label ?? ''));
  }

  // 未识别出实体名时的兜底文案（参考图3 这类）。非默认族必须有兜底：一句声明都
  // 不发的话，API 就拿不到任何「token 指哪张素材」的映射。
  function defaultLabel(mediaType, n) {
    return `参考${MEDIA_NOUN[cleanText(mediaType)] || '图'}${n}`;
  }

  // 2.5 必须匹配原始串。先去点号再匹配 25 会把 seedance-2.0-mini 之类误命中。
  function has25(raw) {
    return /2[._-]5/.test(String(raw || ''));
  }

  // 按模型名/工作流名推断族 id。推断结果只用于 UI 默认显示，绝不写盘。
  // 自建族可通过 infer_keywords 声明自己的关键词，匹配优先于出厂族。
  function inferModelFamily(kind, name, overrides = {}) {
    const resolvedKind = safeKind(kind);
    const raw = cleanText(name);
    if (!raw) return 'none';
    const lowered = raw.toLowerCase();
    const families = listFamilies(resolvedKind, overrides);
    const ordered = [...families.filter(family => !family.builtin), ...families.filter(family => family.builtin)];
    for (const family of ordered) {
      if (!family.infer_keywords.some(keyword => lowered.includes(keyword.toLowerCase()))) continue;
      if (family.id === 'jimeng_2_0' && has25(raw) && families.some(item => item.id === 'jimeng_2_5')) return 'jimeng_2_5';
      return family.id;
    }
    return 'none';
  }

  // 校验一个族定义，返回错误信息列表（空列表表示通过）。
  // 开放 token 模板的代价是写错会静默失效——payload 照样发出去、参考图照样上传，
  // 只是模型完全不知道 <图片1> 指什么。所以这些校验是必需的而非可选的。
  function validateFamily(input, kind) {
    const value = input && typeof input === 'object' ? input : {};
    const resolvedKind = safeKind(kind ?? value.kind);
    const errors = [];
    const id = cleanText(value.id);
    if (!id) errors.push('族 id 不能为空');
    else if (!ID_RE.test(id)) errors.push('族 id 只能包含字母、数字、连字符、下划线和点');
    if (!cleanText(value.name)) errors.push('族名称不能为空');
    const mediaKeys = mediaKeysFor(resolvedKind);
    if (value.expand_chips === true) {
      for (const media of mediaKeys) {
        const token = cleanText(value.chip_tokens?.[media]);
        if (!token) errors.push(`chip_tokens.${media} 不能为空`);
        else if (!token.includes('{n}')) errors.push(`chip_tokens.${media} 必须包含 {n} 占位符`);
      }
    }
    for (const media of mediaKeys) {
      const token = cleanText(value.prefix_tokens?.[media]);
      if (!token) errors.push(`prefix_tokens.${media} 不能为空`);
      else if (!token.includes('{n}')) errors.push(`prefix_tokens.${media} 必须包含 {n} 占位符`);
    }
    const template = String(value.prefix_template ?? '');
    if (!template.includes('{token}')) errors.push('prefix_template 必须包含 {token} 占位符');
    if (!template.includes('{label}')) errors.push('prefix_template 必须包含 {label} 占位符');
    for (const key of limitKeysFor(resolvedKind)) {
      const raw = value.limits?.[key];
      if (raw === '' || raw === null || raw === undefined) continue;
      const number = Number(raw);
      if (!Number.isInteger(number)) errors.push(`limits.${key} 必须是非负整数`);
      else if (number < 0) errors.push(`limits.${key} 不能为负数`);
    }
    return errors;
  }

  // 渲染样例产出，让用户编辑时直接看到写错的后果。
  // 视频族用 3 图 1 视频 1 音频，图片族只用 3 图。
  function samplePreview(input, kind) {
    const value = input && typeof input === 'object' ? input : {};
    const resolvedKind = safeKind(kind ?? value.kind);
    const family = normalizeFamily(value, resolvedKind);
    const rows = resolvedKind === KIND_IMAGE
      ? [[MEDIA_IMAGE, 1, '角色'], [MEDIA_IMAGE, 2, '场景'], [MEDIA_IMAGE, 3, '道具']]
      : [[MEDIA_IMAGE, 1, '角色'], [MEDIA_IMAGE, 2, '场景'], [MEDIA_IMAGE, 3, '道具'], [MEDIA_VIDEO, 1, '运镜参考'], [MEDIA_AUDIO, 1, '人物音色']];
    const chips = [];
    const prefixes = [];
    for (const [media, n, label] of rows) {
      if (family.expand_chips) chips.push(chipToken(family, media, n));
      if (emitPrefixEnabled(family)) prefixes.push(prefixSentence(family, media, n, label));
    }
    return {
      chips,
      prefixes,
      merged: emitPrefixEnabled(family) && mergeLabelsEnabled(family) ? prefixSentence(family, MEDIA_IMAGE, '1、2', '角色') : '',
    };
  }

  return {
    KIND_IMAGE,
    KIND_VIDEO,
    VALID_KINDS,
    MEDIA_IMAGE,
    MEDIA_VIDEO,
    MEDIA_AUDIO,
    MEDIA_TYPES,
    MEDIA_LIMIT_KEY,
    LIMIT_KEYS,
    DEFAULT_PREFIX_TEMPLATE,
    safeKind,
    mediaKeysFor,
    limitKeysFor,
    builtinFamilies,
    builtinFamilyIds,
    isBuiltin,
    normalizeFamily,
    listFamilies,
    defaultFamily,
    getFamily,
    expandChipsEnabled,
    emitPrefixEnabled,
    mergeLabelsEnabled,
    familyLimits,
    familyLimit,
    clampToLimit,
    chipToken,
    prefixToken,
    prefixSentence,
    defaultLabel,
    inferModelFamily,
    validateFamily,
    samplePreview,
  };
});
