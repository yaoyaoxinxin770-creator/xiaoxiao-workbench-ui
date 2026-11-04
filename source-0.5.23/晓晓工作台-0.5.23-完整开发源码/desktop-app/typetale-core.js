(function attachTypeTaleCore(global, factory) {
  const isNode = typeof module === 'object' && Boolean(module.exports);
  // 模型族是编译提示词的前置依赖：浏览器侧由 workbench.html 先加载它的全局对象，
  // Node 侧直接 require。两边拿到的是同一份实现，不允许各自再写一套编号规则。
  const modelFamily = isNode ? require('./typetale-model-family') : global.TypeTaleModelFamily;
  const api = factory(modelFamily);
  if (isNode) module.exports = api;
  global.TypeTaleCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTypeTaleCore(modelFamily) {
  const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
  const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac']);
  const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv']);
  const ASSET_KINDS = new Set(['characters', 'scenes', 'props', 'other', 'audio']);
  const ASSET_KIND_ALIASES = new Map([['character', 'characters'], ['group', 'characters'], ['groups', 'characters'], ['scene', 'scenes'], ['prop', 'props'], ['image', 'other'], ['video', 'other']]);
  const PROVIDER_TYPES = new Set(['generic-video', 'typetale-plugin', 'cli']);
  const REFERENCE_MODES = new Set(['none', 'paths', 'data_url', 'url']);
  const MENTION_RE = /@([^\s@，。；;：:【】（）()\[\]{}<>]+)/g;

  function nowIso() {
    return new Date().toISOString();
  }

  function extensionOf(value) {
    return (String(value || '').match(/\.[^.\\/]+$/) || [''])[0].toLowerCase();
  }

  function basenameNoExt(value) {
    const name = String(value || '').split(/[\\/]/).pop() || '';
    return name.replace(/\.[^.]+$/, '');
  }

  function cleanText(value) {
    return String(value || '').trim();
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeBaseUrl(value) {
    return cleanText(value).replace(/\/+$/, '');
  }

  function normalizePathKey(value) {
    return cleanText(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }

  function isAbsolutePath(value) {
    const normalized = normalizePathKey(value);
    return /^[a-z]:\//.test(normalized) || normalized.startsWith('//') || normalized.startsWith('/');
  }

  function isPathInside(root, candidate) {
    const normalizedRoot = normalizePathKey(root);
    const normalizedCandidate = normalizePathKey(candidate);
    return Boolean(normalizedRoot) && (normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`));
  }

  function assetBelongsToProject(asset, projectPath) {
    const root = normalizePathKey(projectPath);
    if (!root) return true;
    const owner = normalizePathKey(asset?.projectPath || '');
    if (owner && owner !== root) return false;
    const assetPath = asset?.path || asset?.relativePath || '';
    return !isAbsolutePath(assetPath) || isPathInside(root, assetPath);
  }

  function scopeAssetsToProject(assets, projectPath) {
    const root = cleanText(projectPath);
    return (Array.isArray(assets) ? assets : [])
      .map((asset, index) => normalizeAsset({...(asset && typeof asset === 'object' ? asset : {}), projectPath:asset?.projectPath || root}, index))
      .filter(asset => assetBelongsToProject(asset, root));
  }

  function pruneShotAssetBindings(shots, assets) {
    const ids = new Set((Array.isArray(assets) ? assets : []).map(asset => normalizeAsset(asset).id));
    return (Array.isArray(shots) ? shots : []).map((shot, index) => {
      const normalized = normalizeShot(shot, index);
      normalized.bindings.assetIds = normalized.bindings.assetIds.filter(id => ids.has(id));
      return normalized;
    });
  }

  function inferAssetKind(filePath, fallback = 'other') {
    const ext = extensionOf(filePath);
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
    const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
    const parts = normalized.split('/');
    if (parts.some(part => ['人物', '角色', '人物图', '角色图', 'characters', 'character'].includes(part))) return 'characters';
    if (parts.some(part => ['场景', '背景', '场景图', '背景图', 'scenes', 'scene'].includes(part))) return 'scenes';
    if (parts.some(part => ['道具', '物件', '道具图', 'props', 'prop'].includes(part))) return 'props';
    const name = basenameNoExt(filePath);
    if (/角色|人物|人形|肖像|服装/.test(name)) return 'characters';
    if (/场景|背景|室内|室外|街道|卧室|客厅|森林|教室/.test(name)) return 'scenes';
    if (/道具|玉佩|令牌|项链|法器|物件/.test(name)) return 'props';
    return ASSET_KINDS.has(fallback) ? fallback : 'other';
  }

  function normalizeAsset(input, index = 0) {
    const value = input && typeof input === 'object' ? input : {};
    const path = cleanText(value.path || value.relativePath || value.file || '');
    const id = cleanText(value.id || path || `asset-${index + 1}`);
    const name = cleanText(value.name || value.displayName || basenameNoExt(path) || `素材 ${index + 1}`);
    const requestedKind = ASSET_KIND_ALIASES.get(cleanText(value.kind).toLowerCase()) || cleanText(value.kind);
    const kind = ASSET_KINDS.has(requestedKind) ? requestedKind : inferAssetKind(path || name, requestedKind);
    const ext = extensionOf(path);
    return {
      id,
      name,
      kind,
      path,
      projectPath: cleanText(value.projectPath || ''),
      mediaType: value.mediaType || (AUDIO_EXTENSIONS.has(ext) ? 'audio' : VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image'),
      aliases: Array.isArray(value.aliases) ? value.aliases.map(cleanText).filter(Boolean) : [],
      enabled: value.enabled !== false,
      createdAt: value.createdAt || nowIso(),
    };
  }

  function normalizeProvider(input, index = 0) {
    const value = input && typeof input === 'object' ? input : {};
    const type = PROVIDER_TYPES.has(value.type) ? value.type : 'generic-video';
    const model = cleanText(value.model || '');
    const kind = modelFamily.safeKind(value.kind || value.familyKind || 'video');
    return {
      id: cleanText(value.id || `provider-${index + 1}`),
      name: cleanText(value.name || `Provider ${index + 1}`),
      type,
      // 通道归属哪个 kind 决定它能选哪些族：图片族与视频族互不混用。
      kind,
      // 落盘即视为用户手动选择过；空串表示还没选，读取时才按模型名兜底推断，绝不写盘。
      modelFamily: cleanText(value.modelFamily || value.model_family || ''),
      baseUrl: normalizeBaseUrl(value.baseUrl || value.base_url || ''),
      apiKey: String(value.apiKey || value.api_key || ''),
      model,
      duration: cleanText(value.duration || '10'),
      aspectRatio: cleanText(value.aspectRatio || value.aspect_ratio || '16:9'),
      resolution: cleanText(value.resolution || '720p'),
      generationMode: cleanText(value.generationMode || value.generation_mode || '参考生视频'),
      referenceMode: REFERENCE_MODES.has(value.referenceMode) ? value.referenceMode : 'paths',
      pluginPath: cleanText(value.pluginPath || ''),
      pluginName: cleanText(value.pluginName || ''),
      // 插件参数的真相源是插件自己的 config.json（plugin_utils 约定）；这里缓存一份
      // 是为了在任务发布那一刻把值固定下来，避免执行途中用户改参数导致同批不一致。
      pluginParams: value.pluginParams && typeof value.pluginParams === 'object' ? value.pluginParams : {},
      pythonPath: cleanText(value.pythonPath || ''),
      command: cleanText(value.command || ''),
      argsTemplate: Array.isArray(value.argsTemplate) ? value.argsTemplate.map(String) : [],
      timeoutSeconds: Math.max(5, Number(value.timeoutSeconds) || 900),
      extra: value.extra && typeof value.extra === 'object' ? value.extra : {},
      enabled: value.enabled !== false,
      createdAt: value.createdAt || nowIso(),
    };
  }

  function normalizeBindings(input) {
    const value = input && typeof input === 'object' ? input : {};
    const direct = Array.isArray(value.assetIds) ? value.assetIds : [];
    return {
      assetIds: [...new Set([
        ...direct,
        ...(Array.isArray(value.characters) ? value.characters : []),
        ...(Array.isArray(value.scenes) ? value.scenes : []),
        ...(Array.isArray(value.props) ? value.props : []),
        ...(Array.isArray(value.other) ? value.other : []),
      ].map(cleanText).filter(Boolean))],
    };
  }

  function normalizeFrames(input) {
    const value = input && typeof input === 'object' ? input : {};
    return {
      first: cleanText(value.first || value.firstFrame || ''),
      last: cleanText(value.last || value.lastFrame || ''),
    };
  }

  function normalizeShot(input, index = 0) {
    const value = input && typeof input === 'object' ? input : {};
    return {
      id: cleanText(value.id || String(index + 1).padStart(2, '0')),
      title: cleanText(value.title || value.name || `视频 ${index + 1}`),
      prompt: String(value.prompt || ''),
      negativePrompt: String(value.negativePrompt || value.negative_prompt || ''),
      bindings: normalizeBindings(value.bindings),
      // 首尾帧是生成模式本身的输入位，与参考槽位无关，也不受族上限约束
      // （见 reference_slots.collect_frame_slots）。存素材 id，编译时才解析成路径。
      frames: normalizeFrames(value.frames),
      audioAssetId: cleanText(value.audioAssetId || ''),
      batchNum: Math.max(1, Number(value.batchNum ?? value.batch_num) || 1),
      // viewer_index / generation_round 决定插件的输出文件名，必须随分镜持久化，
      // 否则重生成会覆盖上一轮的产出。
      viewerIndex: Math.max(1, Number(value.viewerIndex ?? value.viewer_index) || index + 1),
      generationRound: Math.max(0, Number(value.generationRound ?? value.generation_round) || 0),
      sceneDuration: Number(value.sceneDuration ?? value.scene_duration) || 0,
      status: cleanText(value.status || 'ready'),
      selected: value.selected !== false,
      error: String(value.error || ''),
      remoteId: cleanText(value.remoteId || value.taskId || ''),
      resultUrl: cleanText(value.resultUrl || ''),
      outputPath: cleanText(value.outputPath || ''),
      // 文案行：每行一条台词/文案，空数组表示尚未拆分。
      lines: Array.isArray(value.lines) ? value.lines.map(item => String(item)) : [],
      chapterId: cleanText(value.chapterId || ''),
      // 生成结果历史完整保存；分镜行只展示最近 4 条；selectedResult=-1 表示未选中。
      results: (Array.isArray(value.results) ? value.results : [])
        .filter(item => item && typeof item === 'object')
        .map(item => ({path: cleanText(item.path || ''), url: cleanText(item.url || ''), createdAt: item.createdAt || nowIso(), ...(item.prompt !== undefined ? {prompt:String(item.prompt), model:cleanText(item.model || ''), providerName:cleanText(item.providerName || '')} : {})}))
        .filter(item => item.path || item.url),
      selectedResult: Number.isInteger(value.selectedResult) ? value.selectedResult : -1,
      tags: Array.isArray(value.tags) ? [...new Set(value.tags.map(cleanText).filter(Boolean))] : [],
      voiceId: cleanText(value.voiceId || ''),
      updatedAt: value.updatedAt || nowIso(),
    };
  }

  function normalizeChapter(input, index = 0) {
    const value = input && typeof input === 'object' ? input : {};
    return {
      id: cleanText(value.id || `chapter-${index + 1}`),
      name: cleanText(value.name || `章节${index + 1}`),
      title: cleanText(value.title || ''),
      collapsed: value.collapsed === true,
    };
  }

  function normalizeJob(input, index = 0) {
    const value = input && typeof input === 'object' ? input : {};
    return {
      id: cleanText(value.id || makeId('job')),
      shotId: cleanText(value.shotId || ''),
      providerId: cleanText(value.providerId || ''),
      prompt: String(value.prompt || ''), model: cleanText(value.model || ''), providerName: cleanText(value.providerName || ''),
      status: cleanText(value.status || 'queued'),
      message: String(value.message || ''),
      remoteId: cleanText(value.remoteId || ''),
      resultUrl: cleanText(value.resultUrl || ''),
      outputPath: cleanText(value.outputPath || ''),
      createdAt: value.createdAt || nowIso(),
      updatedAt: value.updatedAt || nowIso(),
    };
  }

  function defaultState() {
    return {
      schemaVersion: 1,
      projectPath: '',
      activeShotId: '',
      activeProviderId: '',
      sourceText: '',
      assets: [],
      providers: [],
      shots: [],
      chapters: [],
      jobs: [],
      logs: [],
      // 族覆盖层：同 id 覆盖出厂族，新 id 是自建族。对应原程序的
      // user_resources/model_families/{image|video}/{family_id}.json，
      // 「恢复默认」= 删掉该 id 的条目。
      familyOverrides: {video: {}, image: {}},
      updatedAt: nowIso(),
    };
  }

  function normalizeFamilyOverrides(input) {
    const value = input && typeof input === 'object' ? input : {};
    const result = {video: {}, image: {}};
    for (const kind of ['video', 'image']) {
      const table = value[kind] && typeof value[kind] === 'object' ? value[kind] : {};
      for (const [id, spec] of Object.entries(table)) {
        if (!spec || typeof spec !== 'object') continue;
        result[kind][cleanText(id)] = modelFamily.normalizeFamily({...spec, id}, kind);
      }
    }
    return result;
  }

  function normalizeState(input) {
    const base = defaultState();
    const value = input && typeof input === 'object' ? input : {};
    const providers = (Array.isArray(value.providers) ? value.providers : []).map(normalizeProvider).filter(provider => provider.enabled !== false);
    const projectPath = cleanText(value.projectPath || '');
    const assets = scopeAssetsToProject(value.assets, projectPath);
    const shots = pruneShotAssetBindings(value.shots, assets);
    const jobs = (Array.isArray(value.jobs) ? value.jobs : []).map(normalizeJob);
    return {
      ...base,
      ...value,
      schemaVersion: 1,
      projectPath,
      activeShotId: cleanText(value.activeShotId || shots[0]?.id || ''),
      activeProviderId: cleanText(value.activeProviderId || providers[0]?.id || ''),
      sourceText: String(value.sourceText || ''),
      assets,
      providers,
      shots,
      chapters: (Array.isArray(value.chapters) ? value.chapters : []).map(normalizeChapter).filter(chapter => chapter.id),
      jobs,
      logs: Array.isArray(value.logs) ? value.logs.slice(0, 200) : [],
      familyOverrides: normalizeFamilyOverrides(value.familyOverrides),
      updatedAt: value.updatedAt || nowIso(),
    };
  }

  // 宿主侧统一的族归属解析入口（对应 backend.model_family_service.resolve_model_family）。
  // 优先级：通道显式落盘值 → 按模型名推断 → 该 kind 的默认族。
  // 推断结果只在读取时兜底计算，绝不写盘；字段一旦存在就不再重新推断，这样切换
  // 模型不会把用户手动选过的族冲掉。
  function resolveFamily(provider, overrides = {}) {
    const normalized = normalizeProvider(provider || {});
    const kind = normalized.kind;
    const table = normalizeFamilyOverrides(overrides)[kind] || {};
    if (normalized.modelFamily) return modelFamily.getFamily(kind, normalized.modelFamily, {overrides: table});
    const inferred = modelFamily.inferModelFamily(kind, normalized.model || normalized.pluginName, table);
    return modelFamily.getFamily(kind, inferred, {overrides: table});
  }

  function splitShots(source) {
    const normalized = String(source || '').replace(/\r/g, '').trim();
    if (!normalized) return [];
    const marker = /(?:^|\n)\s*(?:【\s*(?:视频编号|分镜)\s*[^\n】]*】|(?:视频编号|分镜)\s*[:：]?\s*\d+[^\n]*)/g;
    const starts = [...normalized.matchAll(marker)].map(match => match.index + (match[0].startsWith('\n') ? 1 : 0));
    const chunks = starts.length ? starts.map((start, index) => normalized.slice(start, starts[index + 1] ?? normalized.length).trim()) : [normalized];
    return chunks.map((chunk, index) => {
      const id = (
        (chunk.match(/【\s*视频编号\s*([^】\s]+)\s*】/) || [])[1] ||
        (chunk.match(/视频编号\s*[:：]?\s*([^\s，。；;|｜】]+)/) || [])[1] ||
        (chunk.match(/【\s*分镜\s*([^】\s]+)\s*】/) || [])[1] ||
        (chunk.match(/分镜\s*[:：]?\s*([^\s，。；;|｜】]+)/) || [])[1] ||
        String(index + 1).padStart(2, '0')
      );
      const firstLine = chunk.split('\n').map(cleanText).find(Boolean) || '';
      return normalizeShot({
        id,
        title: firstLine.replace(/[【】]/g, '').slice(0, 80) || `视频 ${id}`,
        prompt: chunk,
        selected: true,
        status: 'ready',
      }, index);
    }).filter(shot => shot.prompt);
  }

  function extractMentions(prompt) {
    const found = [];
    for (const match of String(prompt || '').matchAll(MENTION_RE)) {
      const name = cleanText(match[1]);
      if (name && !found.includes(name)) found.push(name);
    }
    return found;
  }

  function assetNames(asset) {
    return [asset.name, basenameNoExt(asset.path), ...(asset.aliases || [])].map(cleanText).filter(Boolean);
  }

  function findAssetForMention(assets, mention) {
    const target = cleanText(mention).toLowerCase();
    if (!target) return null;
    return assets.find(asset => asset.enabled !== false && assetNames(asset).some(name => name.toLowerCase() === target)) || null;
  }

  function mediaTypeOf(asset) {
    const media = cleanText(asset?.mediaType).toLowerCase();
    return media === 'audio' || media === 'video' ? media : 'image';
  }

  // 去重键，与 reference_slots 的 reference_path_key 同义：先归一化分隔符与大小写
  // 再比较。按原始字符串去重会让相对/绝对、大小写不同的同一个文件各占一个槽位，
  // 编号一旦比实际上传的素材多算就会错位。
  function referencePathKey(asset) {
    return normalizePathKey(asset?.path || '') || `id:${cleanText(asset?.id).toLowerCase()}`;
  }

  function orderedShotAssets(shot, assets, {excludeIds = []} = {}) {
    const byId = new Map(assets.map(asset => [asset.id, asset]));
    const bound = normalizeBindings(shot?.bindings).assetIds.map(id => byId.get(id)).filter(Boolean);
    const mentioned = extractMentions(shot?.prompt).map(name => findAssetForMention(assets, name)).filter(Boolean);
    const skip = new Set(excludeIds.map(cleanText).filter(Boolean));
    const seen = new Set();
    const ordered = [];
    for (const asset of [...mentioned, ...bound]) {
      if (skip.has(asset.id)) continue;
      const key = referencePathKey(asset);
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(asset);
    }
    return ordered;
  }

  // 把分镜编译成「提示词 + 槽位表」。前缀声明、chip 展开、payload 截断三件事在这里
  // 共用同一套编号，这是 reference_slots 模块存在的全部理由：两套编号一旦错位，
  // 就会出现「payload 里有第 4 张图，但前缀只声明到图 3」——模型收到一张没人介绍的图。
  function compilePrompt(shot, assets, options = {}) {
    const normalizedShot = normalizeShot(shot);
    const normalizedAssets = (Array.isArray(assets) ? assets : []).map(normalizeAsset);
    const byId = new Map(normalizedAssets.map(asset => [asset.id, asset]));
    const family = options.family
      ? modelFamily.normalizeFamily(options.family, options.family.kind || options.kind)
      : resolveFamily(options.provider || {kind: options.kind}, options.familyOverrides || {});

    // 首尾帧单独分支：这两张图是生成模式本身的输入位，不占参考槽位，也不受族上限约束。
    const firstFrame = byId.get(normalizedShot.frames.first) || null;
    const lastFrame = byId.get(normalizedShot.frames.last) || null;
    const frameIds = [firstFrame?.id, lastFrame?.id].filter(Boolean);

    const ordered = orderedShotAssets(normalizedShot, normalizedAssets, {excludeIds: frameIds});

    // 三类槽位独立计数、1 基编号，再按族上限切成「在限内」与「超限」两批。
    const grouped = {image: [], video: [], audio: []};
    for (const asset of ordered) grouped[mediaTypeOf(asset)].push(asset);

    const references = [];
    const overflow = [];
    for (const media of modelFamily.MEDIA_TYPES) {
      const limit = modelFamily.familyLimit(family, media);
      const split = modelFamily.clampToLimit(grouped[media], family, media);
      split.within.forEach((asset, index) => {
        const n = index + 1;
        references.push({
          index: n,
          // 0 基槽位号：插件协议的 reference_images / 参考图片MAP 用的就是这个键，
          // 与 handler_core._build_ref_images_and_labels 的 0 基 dict 同序（+1 即槽位号）。
          slot: index,
          mediaType: media,
          assetId: asset.id,
          name: asset.name,
          kind: asset.kind,
          path: asset.path,
          label: asset.name || modelFamily.defaultLabel(media, n),
          token: modelFamily.chipToken(family, media, n),
          prefixToken: modelFamily.prefixToken(family, media, n),
        });
      });
      for (const asset of split.overflow) {
        overflow.push({assetId: asset.id, name: asset.name, mediaType: media, limit});
      }
    }

    const mentions = extractMentions(normalizedShot.prompt);
    const referenceByAssetId = new Map(references.map(reference => [reference.assetId, reference]));
    const mentionReference = new Map();
    for (const name of mentions) {
      const asset = findAssetForMention(normalizedAssets, name);
      const reference = asset ? referenceByAssetId.get(asset.id) : null;
      if (reference) mentionReference.set(name, reference);
    }
    const missingMentions = mentions.filter(name => !findAssetForMention(normalizedAssets, name));

    // 族不展开 chip、或素材超限时，@实体名 一律保持原文：超限素材不进 payload，
    // 给它发 token 等于让模型去引用一张不存在的图。
    let prompt = String(normalizedShot.prompt).replace(MENTION_RE, (raw, name) => {
      const reference = mentionReference.get(cleanText(name));
      return reference?.token || raw;
    });

    const prefixSentences = [];
    if (modelFamily.emitPrefixEnabled(family)) {
      const merge = modelFamily.mergeLabelsEnabled(family);
      for (const media of modelFamily.MEDIA_TYPES) {
        const slots = references.filter(reference => reference.mediaType === media);
        if (!slots.length) continue;
        if (!merge) {
          for (const slot of slots) prefixSentences.push(modelFamily.prefixSentence(family, media, slot.index, slot.label));
          continue;
        }
        const groups = new Map();
        for (const slot of slots) {
          if (!groups.has(slot.label)) groups.set(slot.label, []);
          groups.get(slot.label).push(slot.index);
        }
        for (const [label, numbers] of groups) {
          prefixSentences.push(modelFamily.prefixSentence(family, media, numbers.join('、'), label));
        }
      }
    }
    if (prefixSentences.length && options.emitPrefix !== false) {
      prompt = `${prefixSentences.join('；')}。\n${prompt}`;
    }

    const images = references.filter(reference => reference.mediaType === 'image');
    return {
      prompt,
      negativePrompt: normalizedShot.negativePrompt,
      family: {
        id: family.id,
        name: family.name,
        kind: family.kind,
        limits: modelFamily.familyLimits(family),
        expand_chips: family.expand_chips,
        emit_prefix: modelFamily.emitPrefixEnabled(family),
        merge_labels: modelFamily.mergeLabelsEnabled(family),
      },
      references,
      prefixSentences,
      frames: {
        first: firstFrame?.path || '',
        last: lastFrame?.path || '',
        firstAssetId: firstFrame?.id || '',
        lastAssetId: lastFrame?.id || '',
      },
      // 插件协议的 reference_images：0 基整数键的图片字典（见 plugins/image_plugins/example）。
      referenceMap: Object.fromEntries(images.map(reference => [reference.slot, reference.path])),
      // chip token → 路径，供需要按 token 反查素材的渠道使用；族不展开 chip 时为空。
      tokenMap: Object.fromEntries(references.filter(reference => reference.token).map(reference => [reference.token, reference.path])),
      missingMentions,
      overflow,
      boundAssetIds: ordered.map(asset => asset.id),
    };
  }

  function substituteTemplate(value, variables) {
    return String(value || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key) => Object.hasOwn(variables, key) ? String(variables[key]) : token);
  }

  function buildExecutionRequest(provider, shot, compiled, context = {}) {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedShot = normalizeShot(shot);
    const normalizedCompiled = compiled && typeof compiled === 'object' ? compiled : compilePrompt(normalizedShot, []);
    const frames = normalizedCompiled.frames || {};
    const variables = {
      prompt: normalizedCompiled.prompt || normalizedShot.prompt,
      negativePrompt: normalizedCompiled.negativePrompt || normalizedShot.negativePrompt,
      shotId: normalizedShot.id,
      model: normalizedProvider.model,
      outputDir: cleanText(context.outputDir || ''),
      projectPath: cleanText(context.projectPath || ''),
      firstFrame: cleanText(frames.first || ''),
      lastFrame: cleanText(frames.last || ''),
      batchNum: normalizedShot.batchNum,
      referenceImage1: normalizedCompiled.references?.[0]?.path || '',
      referenceImages: (normalizedCompiled.references || []).map(reference => reference.path).join(';'),
    };
    if (normalizedProvider.type === 'cli') {
      return {
        kind: 'cli',
        provider: normalizedProvider,
        command: substituteTemplate(normalizedProvider.command, variables),
        args: normalizedProvider.argsTemplate.map(arg => substituteTemplate(arg, variables)),
        cwd: cleanText(context.cwd || context.projectPath || ''),
        timeoutSeconds: normalizedProvider.timeoutSeconds,
        env: {
          TYPETALE_SHOT_ID: normalizedShot.id,
          TYPETALE_PROMPT: variables.prompt,
          TYPETALE_OUTPUT_DIR: variables.outputDir,
        },
      };
    }
    if (normalizedProvider.type === 'typetale-plugin') {
      // 这一段的字段名必须逐字对齐字字动画插件协议，否则 168 个现成插件一个都跑不起来。
      // 依据：plugins/image_plugins/example/main.py 顶部的接口说明 + 各真源码插件里
      // context.get(...) 的实际取值（video_plugin_zzdhapi / sora2_plugin_comfly 等）。
      const batchNum = normalizedShot.batchNum;
      const outputPosition = Array.isArray(context.outputPosition) && context.outputPosition.length
        ? context.outputPosition.map(value => Number(value) || 0)
        : Array.from({length: batchNum}, (unused, index) => index);
      const selected = (normalizedCompiled.references || []);
      return {
        kind: 'typetale-plugin',
        provider: normalizedProvider,
        pluginPath: normalizedProvider.pluginPath,
        pluginName: normalizedProvider.pluginName,
        context: {
          prompt: normalizedCompiled.prompt,
          negative_prompt: variables.negativePrompt,
          // 扁平的 0 基整数键字典。插件自己会在需要时包成 {"参考图片MAP": ...}，
          // 宿主不要替它包——包错一层会让 reference_images.get("首帧") 永远取不到值。
          reference_images: normalizedCompiled.referenceMap || {},
          first_frame_path: variables.firstFrame,
          end_frame_path: variables.lastFrame,
          scene_duration: normalizedShot.sceneDuration,
          audio_duration: Number(context.audioDuration) || 0,
          audio_path: cleanText(context.audioPath || ''),
          selected_characters: selected.filter(reference => reference.kind === 'characters').map(reference => reference.name),
          selected_locations: selected.filter(reference => reference.kind === 'scenes').map(reference => reference.name),
          is_video: normalizedProvider.kind !== 'image',
          batch_num: batchNum,
          project_path: variables.projectPath,
          output_dir: variables.outputDir,
          unique_name: normalizedShot.id,
          viewer_index: normalizedShot.viewerIndex,
          generation_round: normalizedShot.generationRound,
          output_position: outputPosition,
          // 宿主已按族把参考声明拼进 prompt 了，插件不要再自拼一份；族里带着素材上限，
          // 超限素材宿主既不替换成 token 也不写进前缀（见 example_with_ui 的注释）。
          model_family: normalizedCompiled.family || null,
          // 参数以插件 config.json 为准，通道里缓存的值只在任务发布那一刻覆盖 model。
          plugin_params: {
            ...normalizedProvider.pluginParams,
            ...(normalizedProvider.model ? {model: normalizedProvider.model} : {}),
          },
        },
      };
    }
    return {
      kind: 'generic-video',
      provider: normalizedProvider,
      method: 'POST',
      url: `${normalizedProvider.baseUrl}/v1/videos`,
      headers: {
        'Content-Type': 'application/json',
        ...(normalizedProvider.apiKey ? {Authorization: `Bearer ${normalizedProvider.apiKey}`} : {}),
      },
      body: {
        model: normalizedProvider.model,
        prompt: normalizedCompiled.prompt,
        negative_prompt: variables.negativePrompt,
        duration: Number(normalizedProvider.duration) || normalizedProvider.duration,
        aspect_ratio: normalizedProvider.aspectRatio,
        resolution: normalizedProvider.resolution,
        generation_mode: normalizedProvider.generationMode,
        // 已按族上限截断过：payload 里的图和提示词里的声明必须一一对应。
        reference_images: normalizedCompiled.references || [],
        first_frame: variables.firstFrame,
        last_frame: variables.lastFrame,
        metadata: {
          shot_id: normalizedShot.id,
          source: 'typetale-workbench',
          model_family: normalizedCompiled.family?.id || '',
          missing_mentions: normalizedCompiled.missingMentions || [],
          overflow_assets: (normalizedCompiled.overflow || []).map(item => item.name),
        },
        ...normalizedProvider.extra,
      },
    };
  }

  // 输出文件名约定：{viewer_index:04d}_{unique_name}_{generation_round}_{position}.ext
  // 照抄 plugins/image_plugins/example/main.py 的命名规范，这样工作台下载回来的结果
  // 与插件自己写盘的结果排序一致，重生成也不会覆盖上一轮。
  function outputFileName(shot, position = 0, extension = '.mp4') {
    const normalized = normalizeShot(shot);
    const index = String(normalized.viewerIndex).padStart(4, '0');
    const suffix = extension.startsWith('.') ? extension : `.${extension}`;
    return `${index}_${normalized.id}_${normalized.generationRound}_${Number(position) || 0}${suffix}`;
  }

  return {
    ASSET_KINDS,
    ASSET_KIND_ALIASES,
    PROVIDER_TYPES,
    REFERENCE_MODES,
    normalizeBaseUrl,
    normalizePathKey,
    isAbsolutePath,
    isPathInside,
    assetBelongsToProject,
    scopeAssetsToProject,
    pruneShotAssetBindings,
    inferAssetKind,
    normalizeAsset,
    normalizeProvider,
    normalizeShot,
    normalizeChapter,
    normalizeJob,
    normalizeState,
    normalizeFamilyOverrides,
    defaultState,
    splitShots,
    extractMentions,
    findAssetForMention,
    mediaTypeOf,
    referencePathKey,
    orderedShotAssets,
    resolveFamily,
    compilePrompt,
    substituteTemplate,
    buildExecutionRequest,
    outputFileName,
    modelFamily,
    makeId,
    nowIso,
  };
});
