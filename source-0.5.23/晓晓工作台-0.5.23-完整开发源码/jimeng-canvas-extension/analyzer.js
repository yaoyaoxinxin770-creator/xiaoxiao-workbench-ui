(() => {
  const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]);

  function composePrompt(prefix, prompt) {
    if (!prefix || prompt.startsWith(prefix)) return prompt;
    for (const marker of ["提示词内容：", "提示词内容:"]) {
      if (prefix.includes(marker) && prompt.includes(marker)) {
        const prefixHead = prefix.split(marker, 1)[0].trim();
        const promptHead = prompt.split(marker, 1)[0].trim();
        if (prefixHead && prefixHead === promptHead) return prompt;
      }
    }
    return `${prefix}${prompt}`;
  }

  function normalizeNewlines(value) {
    return String(value || "").replace(/\r\n?/g, "\n");
  }

  function promptLabel(prompt, fallbackIndex) {
    const text = String(prompt || "");
    const match = /【\s*视频编号\s*([^】\n]+)】/.exec(text) ||
      /(?:^|\n)\s*视频编号\s*[：:]\s*([^\n]+)/.exec(text);
    const number = String(match?.[1] || "").trim();
    return number ? `视频${number}` : `提示词${String(fallbackIndex).padStart(2, "0")}`;
  }

  function looksLikePrompt(value) {
    const text = String(value || "").trim();
    return text.length > 0 && (
      text.includes("【项目规格】") ||
      text.includes("【视频编号") ||
      text.includes("【镜头") ||
      /声音与台词\s*[：:]/.test(text)
    );
  }

  function fencedPrompts(source) {
    const lines = normalizeNewlines(source).split("\n");
    const prompts = [];
    const promptLanguages = new Set(["", "plaintext", "plain", "text", "txt", "prompt"]);
    for (let index = 0; index < lines.length; index += 1) {
      const opening = /^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/.exec(lines[index]);
      if (!opening || !promptLanguages.has(String(opening[2] || "").toLowerCase())) continue;
      const fenceChar = opening[1][0];
      const body = [];
      let closed = false;
      let cursor = index + 1;
      for (; cursor < lines.length; cursor += 1) {
        const closing = new RegExp(`^\\s*${fenceChar}{3,}\\s*$`).exec(lines[cursor]);
        if (closing) {
          closed = true;
          break;
        }
        body.push(lines[cursor]);
      }
      const value = body.join("\n").trim();
      if (looksLikePrompt(value)) prompts.push(value);
      // A missing closing fence must not swallow possible later blocks.
      if (closed) index = cursor;
    }
    return prompts;
  }

  function trimTrailingCommentary(value) {
    const lines = String(value || "").split("\n");
    const stop = lines.findIndex((line) =>
      /^\s*---\s*$/.test(line) ||
      /^\s*\*\*\s*(本批进度|下一批)/.test(line) ||
      /^\s*(本批进度|下一批)\s*[：:]/.test(line));
    return (stop < 0 ? lines : lines.slice(0, stop)).join("\n").trim();
  }

  function unfencedPrompts(source) {
    const text = normalizeNewlines(source);
    const starts = [...text.matchAll(/【项目规格】/g)].map((match) => match.index);
    if (!starts.length) return looksLikePrompt(text) ? [trimTrailingCommentary(text)] : [];
    if (starts.length === 1) return [trimTrailingCommentary(text)].filter(looksLikePrompt);
    return starts.map((start, index) => {
      const end = starts[index + 1] ?? text.length;
      return trimTrailingCommentary(text.slice(start, end));
    }).filter(looksLikePrompt);
  }

  function batchTitle(source, prompts) {
    const text = normalizeNewlines(source);
    const heading = /^\s*#{1,6}\s+(.+?)\s*$/m.exec(text);
    if (heading && /提示词|视频编号/.test(heading[1])) return heading[1].trim();
    return prompts.length > 1 ? `批量导入（${prompts.length} 条）` : "";
  }

  function parsePromptBatch(source) {
    const fenced = fencedPrompts(source);
    const candidates = fenced.length ? fenced : unfencedPrompts(source);
    const seen = new Set();
    const prompts = [];
    let duplicateCount = 0;
    for (const value of candidates) {
      const prompt = String(value || "").trim();
      if (!prompt) continue;
      if (seen.has(prompt)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(prompt);
      prompts.push(prompt);
    }
    return {
      title: batchTitle(source, prompts),
      prompts: prompts.map((prompt, index) => ({
        prompt,
        label: promptLabel(prompt, index + 1),
      })),
      duplicateCount,
      mode: fenced.length ? "fenced" : "plain",
    };
  }

  function sectionRange(text, title, lineStart = false) {
    const marker = `【${title}】`;
    const markerStart = text.indexOf(marker);
    if (markerStart < 0) return null;
    const bodyStart = markerStart + marker.length;
    // 行内可能出现“资产【别名】”这类用法，只有行首的【才是下一个小节。
    const next = lineStart
      ? text.slice(bodyStart).search(/\n\s*【/)
      : text.indexOf("【", bodyStart);
    const end = next < 0 ? text.length : (lineStart ? bodyStart + next : next);
    return { markerStart, bodyStart, end, body: text.slice(bodyStart, end) };
  }

  function countOccurrenceAt(text, anchor, endOffset) {
    let count = 0;
    let cursor = 0;
    const limit = Math.max(0, Math.min(text.length, endOffset));
    while (cursor < limit) {
      const found = text.indexOf(anchor, cursor);
      if (found < 0 || found + anchor.length > limit) break;
      count += 1;
      cursor = found + Math.max(1, anchor.length);
    }
    return Math.max(1, count);
  }

  function parseSubjects(text) {
    const section = sectionRange(text, "出场人物", true);
    if (!section) return [];
    const found = [];
    const seen = new Set();
    const pattern = /(?:^|\n)\s*([^\n：:【】]{1,30})\s*[：:]\s*([^\n]*)/g;
    for (const match of section.body.matchAll(pattern)) {
      const name = String(match[1] || "").trim();
      const description = String(match[2] || "").trim();
      if (!name || seen.has(name)) continue;
      const nameWithinMatch = match[0].indexOf(name);
      const offset = section.bodyStart + match.index + nameWithinMatch + name.length;
      seen.add(name);
      found.push({
        kind: "subject",
        name,
        description,
        anchor: name,
        offset,
        occurrence: countOccurrenceAt(text, name, offset),
      });
    }
    return found;
  }

  function standaloneCalibrationScenes(text, absoluteStart, fullText, videoNumber) {
    const section = sectionRange(text, "场景与连续状态");
    if (!section) return [];

    // 新模板把场景写在【场景与连续状态】首句，而不是视频标题中：
    // “白天，妖管局开放式办公区。” / “继续白天妖管局开放式办公区。”
    // 也兼容“场景A｜镜头01：深夜，妖管局大楼外景。”并提取全部分场。
    const explicitScenes = parseSceneEntries(text);
    if (explicitScenes.length) {
      return explicitScenes.map((explicit) => {
      const offset = absoluteStart + explicit.offset;
      return {
        kind: "image",
        name: explicit.name,
        sceneName: explicit.name,
        label: explicit.label,
        shotLabel: explicit.shotLabel,
        anchor: explicit.anchor,
        offset,
        occurrence: countOccurrenceAt(fullText, explicit.anchor, offset),
        videoNumber,
      };
      });
    }

    for (const lineMatch of section.body.matchAll(/[^\n]+/g)) {
      const rawLine = String(lineMatch[0] || "");
      const trimmed = rawLine.trim();
      if (!trimmed || /^`{3,}/.test(trimmed) || /^【/.test(trimmed)) continue;
      const opening = trimmed.split(/[。；;]/, 1)[0].trim();
      const withoutTime = opening
        .replace(/^继续\s*/, "")
        .replace(/^(?:(?:初春|暮春|初夏|盛夏|初秋|深秋|初冬|隆冬)\s*)?(?:白天|夜晚|清晨|早晨|上午|下午|傍晚|黄昏|深夜|正午)\s*[，,、·—-]?\s*/, "")
        .replace(/^场景\s*[：:]\s*/, "")
        .trim();
      const sceneName = cleanSceneAssetName(withoutTime);
      if (!sceneName || sceneName.length > 60) continue;
      const anchorIndex = rawLine.indexOf(sceneName);
      if (anchorIndex < 0) continue;
      const offset = absoluteStart + section.bodyStart + lineMatch.index + anchorIndex + sceneName.length;
      return [{
        kind: "image",
        name: sceneName,
        sceneName,
        anchor: sceneName,
        offset,
        occurrence: countOccurrenceAt(fullText, sceneName, offset),
        videoNumber,
      }];
    }
    return [];
  }

  function parseCalibrationHeaders(text) {
    const value = normalizeNewlines(text);
    const videos = [];
    const subjectPlans = [];
    const scenePlans = [];
    const headerPattern = /^\s*(?:#{1,6}\s*)?视频编号\s*([^\s（(｜|\n]+)\s*(?:[（(]([^）)\n]*)[）)])?\s*[｜|]\s*场景\s*[：:]\s*([^｜|\n]+?)\s*[｜|]\s*人物\s*[：:]\s*(.+?)\s*$/gm;
    for (const match of value.matchAll(headerPattern)) {
      const line = match[0];
      const videoNumber = String(match[1] || "").trim();
      const durationMeta = String(match[2] || "").trim();
      const sceneRaw = String(match[3] || "");
      const sceneName = sceneRaw.trim();
      const peopleRaw = String(match[4] || "");
      if (!videoNumber || !sceneName) continue;

      const sceneWithinLine = line.indexOf(sceneRaw) + sceneRaw.indexOf(sceneName);
      const sceneOffset = match.index + sceneWithinLine + sceneName.length;
      const scenePlan = {
        kind: "image",
        name: sceneName,
        sceneName,
        anchor: sceneName,
        offset: sceneOffset,
        occurrence: countOccurrenceAt(value, sceneName, sceneOffset),
        videoNumber,
      };
      scenePlans.push(scenePlan);

      const characters = [];
      const peopleWithinLine = line.lastIndexOf(peopleRaw);
      for (const personMatch of peopleRaw.matchAll(/[^、，,；;]+/g)) {
        const rawName = String(personMatch[0] || "");
        const name = rawName.trim();
        if (!name) continue;
        const nameStart = match.index + peopleWithinLine + personMatch.index + rawName.indexOf(name);
        const offset = nameStart + name.length;
        characters.push(name);
        subjectPlans.push({
          kind: "subject",
          name,
          description: "",
          anchor: name,
          offset,
          occurrence: countOccurrenceAt(value, name, offset),
          videoNumber,
        });
      }

      videos.push({
        videoNumber,
        duration: (/总时长\s*[：:]\s*([^\s）)]+)/.exec(durationMeta)?.[1] || ""),
        sceneName,
        sceneNames: [sceneName],
        characters,
        header: line.trim(),
        scenePlan,
        scenePlans: [scenePlan],
      });
    }

    // 新模板：每个视频段以【项目规格】开始，视频编号位于段内的【视频编号N】行。
    // 先按项目规格切段，再复用分区解析，避免把两段合并或漏掉视频。
    const projectStarts = [...value.matchAll(/【项目规格】/g)].map((match) => match.index);
    if (projectStarts.length) {
      for (let index = 0; index < projectStarts.length; index += 1) {
        const segmentStart = projectStarts[index];
        const segmentEnd = projectStarts[index + 1] ?? value.length;
        const segment = value.slice(segmentStart, segmentEnd);
        const numberMatch = /【\s*视频编号\s*([^】\n]+)】/.exec(segment);
        const videoNumber = String(numberMatch?.[1] || "").trim();
        if (!videoNumber) continue;
        const videoScenePlans = standaloneCalibrationScenes(segment, segmentStart, value, videoNumber);
        scenePlans.push(...videoScenePlans);
        const localSubjects = parseSubjects(segment);
        const characters = [];
        for (const localPlan of localSubjects) {
          const offset = segmentStart + localPlan.offset;
          characters.push(localPlan.name);
          subjectPlans.push({ ...localPlan, offset, occurrence: countOccurrenceAt(value, localPlan.anchor, offset), videoNumber });
        }
        videos.push({
          videoNumber,
          duration: (/总时长\s*[：:]\s*([^\s｜|]+)/.exec(segment)?.[1] || ""),
          sceneName: videoScenePlans.map((item) => item.sceneName).join("、"),
          sceneNames: videoScenePlans.map((item) => item.sceneName),
          characters, header: numberMatch[0].trim(),
          scenePlan: videoScenePlans[0] || null, scenePlans: videoScenePlans,
        });
      }
    }

    // 兼容“视频编号29”独立成行、场景与人物都写在正文分区中的模板。
    // 标题里的【视频编号29】不会命中这个正则，避免把同一视频切成两段。
    const seenVideoNumbers = new Set(videos.map((video) => video.videoNumber));
    const standalonePattern = /^\s*(?:#{1,6}\s*)?视频编号\s*([^\s（(｜|\n]+)\s*$/gm;
    const standaloneHeaders = [...value.matchAll(standalonePattern)];
    for (let index = 0; index < standaloneHeaders.length; index += 1) {
      const match = standaloneHeaders[index];
      const videoNumber = String(match[1] || "").trim();
      if (!videoNumber || seenVideoNumbers.has(videoNumber)) continue;
      const segmentStart = match.index;
      const segmentEnd = standaloneHeaders[index + 1]?.index ?? value.length;
      const segment = value.slice(segmentStart, segmentEnd);
      const videoScenePlans = standaloneCalibrationScenes(segment, segmentStart, value, videoNumber);
      scenePlans.push(...videoScenePlans);

      const localSubjects = parseSubjects(segment);
      const characters = [];
      for (const localPlan of localSubjects) {
        const offset = segmentStart + localPlan.offset;
        characters.push(localPlan.name);
        subjectPlans.push({
          ...localPlan,
          offset,
          occurrence: countOccurrenceAt(value, localPlan.anchor, offset),
          videoNumber,
        });
      }

      videos.push({
        videoNumber,
        duration: (/总时长\s*[：:]\s*([^\s｜|]+)/.exec(segment)?.[1] || ""),
        sceneName: videoScenePlans.map((item) => item.sceneName).join("、"),
        sceneNames: videoScenePlans.map((item) => item.sceneName),
        characters,
        header: match[0].trim(),
        scenePlan: videoScenePlans[0] || null,
        scenePlans: videoScenePlans,
      });
      seenVideoNumbers.add(videoNumber);
    }
    return { text: value, videos, subjectPlans, scenePlans };
  }

  function extensionOf(name) {
    const dot = String(name || "").lastIndexOf(".");
    return dot < 0 ? "" : name.slice(dot).toLowerCase();
  }

  function stemOf(name) {
    const value = String(name || "");
    const dot = value.lastIndexOf(".");
    return (dot > 0 ? value.slice(0, dot) : value).trim();
  }

  function matchVariants(stem) {
    const variants = new Set([stem]);
    variants.add(stem.replace(/^\s*\d+[\s._-]*/, ""));
    for (const value of [...variants]) {
      variants.add(value.replace(/[\s_-]*(场景图|背景图|场景|背景)\s*$/, ""));
    }
    return [...variants].map((value) => value.trim()).filter((value) => value.length >= 2);
  }

  function isMatchChar(char) {
    return /[\p{L}\p{N}]/u.test(char);
  }

  // 场景标题中的“（闪回）/（回忆）/（现实）”等是叙事或时间修饰，
  // 通常不会出现在素材文件的主体名称中。匹配时去掉括号修饰，
  // 但不改写界面展示的原始场景名，避免丢失提示词语义。
  function sceneMatchCore(value) {
    return String(value || "")
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/[\s_-]*(?:闪回|回忆|现实|现实时空|当前时空|过去时空)[\s_-]*/gi, "")
      .trim();
  }

  function normalizedWithMap(value) {
    let normalized = "";
    const rawIndexes = [];
    [...String(value || "")].forEach((char, index) => {
      if (!isMatchChar(char)) return;
      normalized += char.toLowerCase();
      rawIndexes.push(index);
    });
    return { normalized, rawIndexes };
  }

  function normalizedRange(haystack, needle) {
    const source = normalizedWithMap(haystack);
    const target = normalizedWithMap(needle).normalized;
    if (!target) return null;
    const startNormalized = source.normalized.indexOf(target);
    if (startNormalized < 0) return null;
    const endNormalized = startNormalized + target.length - 1;
    return {
      start: source.rawIndexes[startNormalized],
      end: source.rawIndexes[endNormalized] + 1,
      score: target.length,
    };
  }

  function parseSceneLine(text) {
    const section = sectionRange(text, "场景与连续状态");
    const source = section?.body || text;
    const baseStart = section?.bodyStart || 0;
    const match = /(?:^|\n)\s*场景\s*[：:]\s*([^\n]+)/.exec(source);
    if (!match) return null;
    const value = String(match[1] || "").trim();
    const valueWithinMatch = match[0].lastIndexOf(match[1]);
    const start = baseStart + match.index + valueWithinMatch;
    return { value, start, end: start + match[1].length };
  }

  function cleanSceneAssetName(rawValue) {
    return String(rawValue || "")
      .split(/[｜|]|——|--/, 1)[0]
      .replace(/[（(][^）)]*(?:日|夜|内|外)[^）)]*[）)]/g, "")
      .replace(/^\s*(?:白天|夜晚|清晨|早晨|上午|下午|傍晚|黄昏|深夜|正午)\s*[，,、·-]*/i, "")
      .replace(/(?:白天|夜晚|清晨|早晨|上午|下午|傍晚|黄昏|深夜|正午)\s*$/i, "")
      .replace(/[。；;，,、\s]+$/g, "")
      .trim();
  }

  function parseSceneEntries(text) {
    const value = normalizeNewlines(text);
    const section = sectionRange(value, "场景与连续状态");
    const source = section?.body || value;
    const baseStart = section?.bodyStart || 0;
    const entries = [];
    const pattern = /(?:^|\n)\s*场景\s*([A-Za-zＡ-Ｚａ-ｚ0-9０-９一二三四五六七八九十]*)(?:\s*[｜|]\s*(镜头[^：:\n]*))?\s*[：:]\s*([^\n]+)/g;
    for (const match of source.matchAll(pattern)) {
      const shotLabel = String(match[2] || "").trim();
      const raw = String(match[3] || "").trim();
      const phrase = shotLabel
        ? cleanSceneAssetName(raw).split(/[，,。；;]/, 1)[0].trim()
        : raw.split(/[｜|]|——|--/, 1)[0].trim();
      const name = cleanSceneAssetName(phrase);
      if (!name || name.length > 60) continue;
      const anchor = raw.includes(name) ? name : phrase;
      const rawWithinMatch = match[0].lastIndexOf(match[3]);
      const anchorWithinRaw = raw.indexOf(anchor);
      const offset = baseStart + match.index + rawWithinMatch + anchorWithinRaw + anchor.length;
      entries.push({
        label: String(match[1] || "").trim(),
        shotLabel,
        name,
        raw,
        anchor,
        offset,
        occurrence: countOccurrenceAt(value, anchor, offset),
        inferred: false,
      });
    }
    return entries;
  }

  function parseAssetScenes(text) {
    const value = normalizeNewlines(text);
    const scenes = [];
    const seen = new Set();
    const add = (raw, inferred) => {
      const name = cleanSceneAssetName(raw);
      const key = name.replace(/\s+/g, "").toLowerCase();
      if (!name || name.length > 60 || seen.has(key)) return;
      seen.add(key);
      scenes.push({ name, raw: String(raw || "").trim(), inferred });
    };

    for (const entry of parseSceneEntries(value)) add(entry.name, false);
    if (scenes.length) return scenes;

    // 旧提示词有时没有“场景：”字段；只把构图首句当候选，并明确标记需人工核对。
    for (const match of value.matchAll(/(?:^|\n)\s*(?:构图\s*[（(]开镜静态[）)]|构图|开镜静态)\s*[：:]\s*([^\n]+)/g)) {
      const candidate = String(match[1] || "").split(/[，,；;。]/, 1)[0].trim();
      if (!candidate || candidate.length > 30 || /^(?:画面|镜头|摄影机|人物|角色|特写|中景|近景|全景)/.test(candidate)) continue;
      add(candidate, true);
    }
    return scenes;
  }

  function analyzeAssets(text) {
    return {
      characters: parseSubjects(text).map((item) => item.name),
      scenes: parseAssetScenes(text),
    };
  }

  function isLikelyGroupCharacter(rawName) {
    const name = String(rawName || "").replace(/\s+/g, "");
    return /(?:人群|群众|众人|群演|路人|百姓|官兵|追兵|士兵|侍卫|护卫队|弟子们|员工们|同事们|村民|围观者|群体|队伍)/.test(name);
  }

  function sceneFileMatchScore(sceneName, fileVariant) {
    const sceneValues = [String(sceneName || ""), sceneMatchCore(sceneName)];
    const fileValues = [String(fileVariant || ""), sceneMatchCore(fileVariant)];
    let bestScore = 0;
    for (const sceneValue of sceneValues) {
      const scene = normalizedWithMap(sceneValue).normalized;
      if (!scene) continue;
      for (const fileValue of fileValues) {
        const file = normalizedWithMap(fileValue).normalized;
        if (!file || Math.min(scene.length, file.length) < 2) continue;
        let score = 0;
        if (scene === file) score = 10000 + file.length;
        else if (scene.includes(file)) score = 8000 + file.length * 10 - (scene.length - file.length);
        else if (file.includes(scene)) score = 7000 + scene.length * 10 - (file.length - scene.length);
        else {
          let prefix = 0;
          while (prefix < scene.length && prefix < file.length && scene[prefix] === file[prefix]) prefix += 1;
          const ratio = prefix / Math.max(scene.length, file.length);
          score = prefix >= 3 && ratio >= 0.6 ? 4000 + Math.round(ratio * 100) + prefix : 0;
        }
        bestScore = Math.max(bestScore, score);
      }
    }
    return bestScore;
  }

  function matchSceneFiles(text, files) {
    const scenes = parseSceneEntries(text);
    const imageFiles = (files || []).filter((file) => IMAGE_EXTENSIONS.has(extensionOf(file.name)));
    const matches = [];
    const unmatchedScenes = [];
    for (const scene of scenes) {
      let best = null;
      for (const file of imageFiles) {
        const stem = stemOf(file.name);
        for (const variant of matchVariants(stem)) {
          const score = sceneFileMatchScore(scene.name, variant);
          if (!score) continue;
          const candidate = { file, stem, variant, score };
          if (!best || score > best.score ||
            (score === best.score && variant.length > best.variant.length)) best = candidate;
        }
      }
      if (!best) {
        unmatchedScenes.push(scene);
        continue;
      }
      matches.push({
        kind: "image",
        name: best.stem,
        fileName: best.file.name,
        relativePath: best.file.webkitRelativePath || best.file.name,
        file: best.file,
        sceneName: scene.name,
        anchor: scene.anchor,
        offset: scene.offset,
        occurrence: scene.occurrence,
        score: best.score,
      });
    }
    return { scenes, matches, unmatchedScenes };
  }

  function calibrationSceneKey(sceneName) {
    return normalizedWithMap(sceneName).normalized;
  }

  function calibrationScenePlanKey(scene) {
    return [
      scene.videoNumber || "",
      scene.offset || 0,
      scene.occurrence || 1,
      calibrationSceneKey(scene.sceneName),
    ].join(":");
  }

  function calibrationCandidateId(file) {
    return String(file?.webkitRelativePath || file?.name || "");
  }

  function calibrationSceneCandidates(sceneName, imageFiles) {
    const candidates = [];
    for (const file of imageFiles) {
      const stem = stemOf(file.name);
      let best = null;
      const matchingNames = [...new Set([
        stem,
        ...(Array.isArray(file.jimengSceneAliases) ? file.jimengSceneAliases : []),
      ].map((item) => cleanSceneAssetName(item)).filter(Boolean))];
      for (const matchingName of matchingNames) {
        for (const variant of matchVariants(matchingName)) {
          const score = sceneFileMatchScore(sceneName, variant);
          if (!score) continue;
          const candidate = { file, stem, matchingName, variant, score };
          if (!best || score > best.score ||
            (score === best.score && variant.length > best.variant.length)) best = candidate;
        }
      }
      if (!best) continue;
      candidates.push({
        ...best,
        id: calibrationCandidateId(file),
        fileName: file.name,
        relativePath: file.webkitRelativePath || file.name,
        matchedAlias: best.matchingName === stem ? "" : best.matchingName,
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName, "zh-CN"));
    return candidates;
  }

  function matchCalibrationSceneFiles(text, files, selectedSceneFiles = {}) {
    const parsed = parseCalibrationHeaders(text);
    const imageFiles = (files || []).filter((file) => IMAGE_EXTENSIONS.has(extensionOf(file.name)));
    const scenePlans = parsed.scenePlans.map((scene) => ({
      ...scene,
      sceneKey: calibrationScenePlanKey(scene),
      sharedSceneKey: calibrationSceneKey(scene.sceneName),
    }));
    const scenePlanByOffset = new Map(scenePlans.map((scene) => [scene.offset, scene]));
    const sharedScenePlanCounts = new Map();
    for (const scene of scenePlans) {
      const sharedKey = calibrationSceneKey(scene.sceneName);
      sharedScenePlanCounts.set(sharedKey, (sharedScenePlanCounts.get(sharedKey) || 0) + 1);
    }
    const videos = parsed.videos.map((video) => {
      const mappedScenePlans = (video.scenePlans?.length ? video.scenePlans : [video.scenePlan])
        .filter(Boolean)
        .map((scenePlan) => scenePlanByOffset.get(scenePlan.offset) || scenePlan);
      return {
        ...video,
        scenePlan: mappedScenePlans[0] || null,
        scenePlans: mappedScenePlans,
        sceneNames: mappedScenePlans.map((item) => item.sceneName),
        sceneName: mappedScenePlans.map((item) => item.sceneName).join("、"),
      };
    });
    const matches = [];
    const unmatchedScenes = [];
    const ambiguousScenes = [];
    const sceneChoices = [];
    for (const scene of scenePlans) {
      const { sceneKey, sharedSceneKey } = scene;
      const candidates = calibrationSceneCandidates(scene.sceneName, imageFiles);
      // 旧版曾按共享场景名保存选择。仅在该场景名在整稿中只出现一次时
      // 兼容旧键；同名场景一旦出现在多个视频中，必须逐视频单独选择，
      // 避免把视频02的形态误套给视频03。
      const legacySelectedId = sharedScenePlanCounts.get(sharedSceneKey) === 1
        ? selectedSceneFiles?.[sharedSceneKey]
        : "";
      const selectedId = String(selectedSceneFiles?.[sceneKey] || legacySelectedId || "");
      const selected = candidates.find((item) => item.id === selectedId) || null;
      // 精确同名（含别名）且分数明显高于其余候选时可以安全自动命中；
      // 多张图同样命中或只有模糊近似时仍交给用户逐视频选择。
      const exactWinner = candidates[0]?.score >= 10000 &&
        (!candidates[1] || candidates[0].score > candidates[1].score)
        ? candidates[0]
        : null;
      const chosen = selected || (candidates.length === 1 ? candidates[0] : exactWinner);
      const choice = {
        ...scene,
        sceneKey,
        sharedSceneKey,
        plans: [scene],
        videoNumbers: [scene.videoNumber],
        candidates,
        selectedId: chosen?.id || "",
      };
      sceneChoices.push(choice);
      if (!candidates.length) {
        unmatchedScenes.push({ ...scene, sceneKey, sharedSceneKey });
        continue;
      }
      if (!chosen) {
        ambiguousScenes.push(choice);
        continue;
      }
      matches.push({
        ...scene,
        sceneKey,
        sharedSceneKey,
        name: chosen.stem,
        fileName: chosen.file.name,
        relativePath: chosen.relativePath,
        file: chosen.file,
        score: chosen.score,
        candidateId: chosen.id,
        matchedAlias: chosen.matchedAlias || "",
      });
    }
    return { ...parsed, videos, scenePlans, matches, unmatchedScenes, ambiguousScenes, sceneChoices };
  }

  function matchSceneImages(text, files) {
    const scene = parseSceneLine(text);
    const candidates = [];
    for (const file of files || []) {
      if (!IMAGE_EXTENSIONS.has(extensionOf(file.name))) continue;
      const stem = stemOf(file.name);
      for (const variant of matchVariants(stem)) {
        const searchText = scene?.value || text;
        const range = normalizedRange(searchText, variant);
        if (!range) continue;
        const baseStart = scene?.start || 0;
        const offset = baseStart + range.end;
        const anchor = searchText.slice(range.start, range.end);
        candidates.push({
          kind: "image",
          name: stem,
          fileName: file.name,
          relativePath: file.webkitRelativePath || file.name,
          file,
          anchor,
          offset,
          occurrence: countOccurrenceAt(text, anchor, offset),
          score: range.score,
          inferredFromFullText: !scene,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName, "zh-CN"));
    const best = candidates[0] || null;
    const resolvedScene = scene || (best ? {
      value: best.anchor,
      start: best.offset - best.anchor.length,
      end: best.offset,
      inferredFromFullText: true,
    } : null);
    return { scene: resolvedScene, images: best ? [best] : [] };
  }

  function analyze(text, folderFiles) {
    const subjects = parseSubjects(text);
    const sceneResult = matchSceneImages(text, folderFiles);
    return {
      subjects,
      scene: sceneResult.scene,
      images: sceneResult.images,
    };
  }

  // Pure name matching for desktop assets; manual role assignments take priority at the caller.
  // 素材名常带编号前缀（C02 胡副局、S01 妖管局大门口、SC03-走廊）：比对前先剥掉。
  const ASSET_CODE_PREFIX = /^(?:[A-Za-z]{1,3}\d{1,3}[\s\-_.·、]*|\d{1,3}[\s\-_.·、]+)/u;
  const SEPARATOR = /[-_\s·（(【.、]/u;
  function matchCharacterPrefix(displayName, characterNames) {
    const raw = stemOf(String(displayName || '')).normalize('NFKC');
    const stem = raw.replace(ASSET_CODE_PREFIX, '');
    const names = [...new Set(characterNames || [])].filter(name => typeof name === 'string' && name.trim())
      .map(name => ({ name, key: name.normalize('NFKC') })).sort((a, b) => b.key.length - a.key.length);
    const startsWith = (value, key) => value === key || (value.startsWith(key) && SEPARATOR.test(value[key.length]));
    // 1) 整名或“名字+分隔符”开头；2) 名字作为完整一段出现在素材名中（场景_胡副局_日景）。
    const hit = names.find(({ key }) => startsWith(raw, key) || startsWith(stem, key))
      || names.find(({ key }) => { const at = stem.indexOf(key); return at > 0 && SEPARATOR.test(stem[at - 1]) && (at + key.length === stem.length || SEPARATOR.test(stem[at + key.length])); });
    return hit ? hit.name : '';
  }

  self.JimengLockAnalyzer = {
    matchCharacterPrefix,
    analyze,
    composePrompt,
    parsePromptBatch,
    promptLabel,
    analyzeAssets,
    isLikelyGroupCharacter,
    parseSubjects,
    parseCalibrationHeaders,
    parseSceneLine,
    parseSceneEntries,
    parseAssetScenes,
    matchSceneFiles,
    matchCalibrationSceneFiles,
    matchSceneImages,
    stemOf,
  };
})();
