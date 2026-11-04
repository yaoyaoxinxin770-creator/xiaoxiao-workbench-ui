const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const library = require('./project-library');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git', '.next', 'dist']);

function categoryFor(file, kind) {
  if (kind !== 'image') return kind === 'audio' ? '音频' : '视频';
  for (const part of file.split(/[\\/]/).reverse()) {
    if (/人物|角色|女主|男主|配角|character/i.test(part)) return '人物';
    if (/场景|地点|环境|location|scene/i.test(part)) return '场景';
    if (/道具|物品|props?/i.test(part)) return '道具';
  }
  return '未分类';
}

function isDriveRoot(dir) {
  const resolved = path.resolve(dir);
  return path.dirname(resolved) === resolved;
}

function isRecycleBin(filePath) {
  return /[\\/]\$Recycle\.Bin([\\/]|$)/i.test(filePath);
}

function normKey(text) {
  return String(text || '').normalize('NFKC').trim().toLowerCase();
}

function computeFingerprint(filePath, size) {
  if (size <= 0) return '0:empty';
  const hash = crypto.createHash('sha1');
  hash.update(String(size) + ':');
  if (size <= 262144) {
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const chunk = 65536;
    const buf = Buffer.allocUnsafe(chunk);
    for (const pos of [0, Math.max(0, Math.floor(size / 2) - 32768), Math.max(0, size - chunk)]) {
      const bytesRead = fs.readSync(fd, buf, 0, chunk, pos);
      if (bytesRead > 0) hash.update(buf.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function inspectFile(filePath, prev) {
  const realPath = fs.realpathSync(filePath);
  if (isRecycleBin(realPath)) throw Error('文件位于回收站');
  const mimeType = MIME[path.extname(realPath).toLowerCase()];
  if (!mimeType) throw Error('只支持本地图片、音频和视频');
  const stat = fs.statSync(realPath, { bigint: true });
  if (!stat.isFile()) throw Error('只支持本地图片、音频和视频');
  const size = Number(stat.size);
  const mtimeMs = Number(stat.mtimeMs);
  const dev = String(stat.dev);
  const ino = String(stat.ino);
  const kind = mimeType.split('/')[0];
  const reuseHash = prev && prev.realPath === realPath && prev.size === size && prev.mtimeMs === mtimeMs && prev.hash;
  const hash = reuseHash ? prev.hash : computeFingerprint(realPath, size);
  return { path: path.resolve(filePath), realPath, kind, mimeType, size, mtimeMs, dev, ino, hash };
}

function decodeFsutilPath(buf) {
  for (const enc of ['utf-8', 'gb18030']) {
    try {
      const text = new TextDecoder(enc, { fatal: enc === 'utf-8' }).decode(buf);
      const match = /\\\\\?\\([A-Za-z]:\\[^\r\n]+)/.exec(text) || /([A-Za-z]:\\[^\r\n]+)/.exec(text);
      if (match && match[1] && !isRecycleBin(match[1]) && fs.existsSync(match[1])) {
        return match[1].trim();
      }
    } catch {}
  }
  return null;
}

function nearestExistingDir(targetPath) {
  let cur = path.dirname(path.resolve(targetPath || '.'));
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cur;
}

class LocalAssetLinks {
  constructor(file, origin) {
    this.file = file;
    this.origin = origin;
    this.entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    this.prefixRewrites = new Map();
    this.inoMissCache = new Map();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.entries));
    fs.renameSync(temp, this.file);
  }

  expectedKind(entry) {
    if (entry.kind) return entry.kind;
    const mime = MIME[path.extname(entry.path || '').toLowerCase()];
    return mime ? mime.split('/')[0] : '';
  }

  sameTempScope(oldPath, candidatePath) {
    const tmp = normKey(path.resolve(os.tmpdir()));
    const oldInTmp = normKey(path.resolve(oldPath || '')).startsWith(tmp + path.sep);
    const newInTmp = normKey(path.resolve(candidatePath || '')).startsWith(tmp + path.sep);
    return oldInTmp === newInTmp;
  }

  acceptCandidate(candidatePath, entry, { requireIno = false, enforceScope = true } = {}) {
    try {
      if (enforceScope && entry.path && !this.sameTempScope(entry.path, candidatePath)) return null;
      const info = inspectFile(candidatePath, null);
      const expected = this.expectedKind(entry);
      if (expected && info.kind !== expected) return null;
      if (requireIno && String(entry.ino) !== info.ino) return null;
      return info;
    } catch {
      return null;
    }
  }

  learnPrefixRewrite(oldPath, newPath) {
    if (!oldPath || !newPath) return;
    const oldResolved = path.resolve(oldPath);
    const newResolved = path.resolve(newPath);
    if (normKey(oldResolved) === normKey(newResolved)) return;
    const oldSegs = oldResolved.split(/[\\/]/).filter(Boolean);
    const newSegs = newResolved.split(/[\\/]/).filter(Boolean);
    let k = 0;
    while (
      k < oldSegs.length - 1 &&
      k < newSegs.length - 1 &&
      normKey(oldSegs[oldSegs.length - 1 - k]) === normKey(newSegs[newSegs.length - 1 - k])
    ) {
      k++;
      const oldLeft = oldSegs.slice(0, oldSegs.length - k);
      const newLeft = newSegs.slice(0, newSegs.length - k);
      if (oldLeft.length >= 2 && newLeft.length >= 2) {
        const oldDir = oldLeft[0] + path.sep + oldLeft.slice(1).join(path.sep);
        const newDir = newLeft[0] + path.sep + newLeft.slice(1).join(path.sep);
        if (normKey(oldDir) !== normKey(newDir)) {
          this.prefixRewrites.set(normKey(oldDir), { oldDir, newDir });
        }
      }
    }
    const oldParent = path.dirname(oldResolved);
    const newParent = path.dirname(newResolved);
    if (!isDriveRoot(oldParent) && !isDriveRoot(newParent) && normKey(oldParent) !== normKey(newParent)) {
      this.prefixRewrites.set(normKey(oldParent), { oldDir: oldParent, newDir: newParent });
    }
  }

  tryPrefixRewrites(entry) {
    if (!entry.path || !this.prefixRewrites.size) return null;
    const resolvedOld = path.resolve(entry.path);
    const oldLower = normKey(resolvedOld);
    const rules = [...this.prefixRewrites.values()].sort((a, b) => b.oldDir.length - a.oldDir.length);
    for (const { oldDir, newDir } of rules) {
      const prefix = normKey(oldDir) + path.sep;
      if (oldLower.startsWith(prefix)) {
        const suffix = resolvedOld.slice(oldDir.length + 1);
        const candidate = path.join(newDir, suffix);
        if (fs.existsSync(candidate)) {
          const info = this.acceptCandidate(candidate, entry);
          if (info) return info;
        }
      }
    }
    return null;
  }

  tryNtfsFileId(entry) {
    if (process.platform !== 'win32' || !entry.ino || entry.ino === '0') return null;
    const missKey = (entry.dev || '') + ':' + entry.ino;
    const lastMiss = this.inoMissCache.get(missKey);
    if (lastMiss && Date.now() - lastMiss < 3000) return null;

    const drives = new Set();
    if (entry.path) {
      const root = path.parse(path.resolve(entry.path)).root;
      if (root) drives.add(root);
    }
    for (const item of Object.values(this.entries)) {
      if (item && item.path) {
        const root = path.parse(path.resolve(item.path)).root;
        if (root) drives.add(root);
      }
    }

    let hexId;
    try {
      hexId = '0x' + BigInt(entry.ino).toString(16);
    } catch {
      return null;
    }

    for (const drive of drives) {
      try {
        const out = execFileSync('fsutil', ['file', 'queryfilenamebyid', drive, hexId], {
          windowsHide: true,
          timeout: 1200,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const found = decodeFsutilPath(out);
        if (found) {
          const info = this.acceptCandidate(found, entry, { requireIno: true });
          if (info) return info;
        }
      } catch {}
    }
    this.inoMissCache.set(missKey, Date.now());
    return null;
  }

  trySameDirectoryRename(entry) {
    if (!entry.path || (!entry.ino && !entry.hash)) return null;
    const dir = path.dirname(path.resolve(entry.path));
    if (!fs.existsSync(dir)) return null;
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const d of items) {
      if (!d.isFile() || !MIME[path.extname(d.name).toLowerCase()]) continue;
      const full = path.join(dir, d.name);
      try {
        const st = fs.statSync(full, { bigint: true });
        if (entry.ino && String(st.ino) === String(entry.ino) && (!entry.dev || String(st.dev) === String(entry.dev))) {
          const info = this.acceptCandidate(full, entry);
          if (info) return info;
        }
        if (entry.hash && typeof entry.size === 'number' && Number(st.size) === entry.size) {
          if (computeFingerprint(full, entry.size) === entry.hash) {
            const info = this.acceptCandidate(full, entry);
            if (info) return info;
          }
        }
      } catch {}
    }
    return null;
  }

  tryAncestorSiblingRename(entry) {
    if (!entry.path) return null;
    const resolved = path.resolve(entry.path);
    const ancestor = nearestExistingDir(resolved);
    if (!fs.existsSync(ancestor)) return null;
    const relParts = path.relative(ancestor, resolved).split(/[\\/]/).filter(Boolean);
    if (relParts.length < 2) return null;
    const [missingDir, ...tail] = relParts;
    let subdirs;
    try {
      subdirs = fs
        .readdirSync(ancestor, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.isSymbolicLink() && !SKIP_DIRS.has(d.name.toLowerCase()));
    } catch {
      return null;
    }

    const verifySiblingCandidate = candidate => {
      if (!fs.existsSync(candidate)) return null;
      const info = this.acceptCandidate(candidate, entry);
      if (!info) return null;
      if (entry.ino && info.ino === String(entry.ino)) return info;
      if (entry.hash && info.hash === entry.hash) return info;
      if (tail.length >= 2) return info;
      if (typeof entry.size === 'number' && info.size === entry.size) return info;
      if (!entry.ino && !entry.hash) return info;
      return null;
    };

    for (const d of subdirs) {
      const hit = verifySiblingCandidate(path.join(ancestor, d.name, ...tail));
      if (hit) return hit;
    }

    let checked = 0;
    for (const d of subdirs) {
      if (checked > 80) break;
      const nestedHit = verifySiblingCandidate(path.join(ancestor, d.name, missingDir, ...tail));
      if (nestedHit) return nestedHit;
      try {
        for (const d2 of fs.readdirSync(path.join(ancestor, d.name), { withFileTypes: true })) {
          if (!d2.isDirectory() || d2.isSymbolicLink() || SKIP_DIRS.has(d2.name.toLowerCase())) continue;
          checked++;
          if (checked > 80) break;
          const deepHit = verifySiblingCandidate(path.join(ancestor, d.name, d2.name, ...tail));
          if (deepHit) return deepHit;
        }
      } catch {}
    }
    return null;
  }

  tryNearbyIdentityScan(entry) {
    if (!entry.path || (!entry.ino && !entry.hash)) return null;
    const ancestor = nearestExistingDir(entry.path);
    const searchRoot = !isDriveRoot(ancestor) && !isDriveRoot(path.dirname(ancestor)) ? path.dirname(ancestor) : ancestor;
    if (isDriveRoot(searchRoot) || !fs.existsSync(searchRoot)) return null;

    const queue = [{ dir: searchRoot, depth: 0 }];
    let scanned = 0;
    while (queue.length > 0 && scanned < 800) {
      const { dir, depth } = queue.shift();
      let list;
      try {
        list = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const item of list) {
        if (item.isSymbolicLink()) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (depth < 3 && !SKIP_DIRS.has(item.name.toLowerCase())) queue.push({ dir: full, depth: depth + 1 });
        } else if (item.isFile() && MIME[path.extname(item.name).toLowerCase()]) {
          scanned++;
          if (scanned > 800) break;
          try {
            const st = fs.statSync(full, { bigint: true });
            if (entry.ino && String(st.ino) === String(entry.ino) && (!entry.dev || String(st.dev) === String(entry.dev))) {
              const info = this.acceptCandidate(full, entry);
              if (info) return info;
            }
            if (entry.hash && typeof entry.size === 'number' && Number(st.size) === entry.size) {
              if (computeFingerprint(full, entry.size) === entry.hash) {
                const info = this.acceptCandidate(full, entry);
                if (info) return info;
              }
            }
          } catch {}
        }
      }
    }
    return null;
  }

  applyEntryInfo(id, info, shouldSave = true) {
    const prev = this.entries[id];
    const oldPath = prev?.path;
    this.entries[id] = {
      path: info.path,
      realPath: info.realPath,
      kind: info.kind,
      size: info.size,
      mtimeMs: info.mtimeMs,
      dev: info.dev,
      ino: info.ino,
      hash: info.hash,
    };
    if (oldPath && normKey(oldPath) !== normKey(info.path)) {
      this.learnPrefixRewrite(oldPath, info.path);
    }
    if (shouldSave && (fs.existsSync(this.file) || (oldPath && normKey(oldPath) !== normKey(info.path)))) {
      this.save();
    }
  }

  trackMissing(id, entry) {
    const info =
      this.tryPrefixRewrites(entry) ||
      this.tryNtfsFileId(entry) ||
      this.trySameDirectoryRename(entry) ||
      this.tryAncestorSiblingRename(entry) ||
      this.tryNearbyIdentityScan(entry);
    if (!info) return null;
    this.applyEntryInfo(id, info, true);
    return info;
  }

  formatDescriptor(id, info) {
    return {
      id,
      path: info.path,
      title: path.basename(info.path, path.extname(info.path)),
      kind: info.kind,
      mimeType: info.mimeType,
      bytes: info.size,
      revision: info.mtimeMs + ':' + info.size,
      category: categoryFor(info.path, info.kind),
      url: this.origin() + '/workbench/local-media/' + id,
    };
  }

  describe(id) {
    const entry = this.entries[id];
    if (!entry) throw Error('素材引用不存在');
    let info = null;
    try {
      info = inspectFile(entry.path, entry);
    } catch {
      info = this.trackMissing(id, entry);
      if (!info) throw Error('原文件已移动或删除，请重新定位：' + entry.path);
    }
    const needsBackfill = !entry.ino || !entry.hash || entry.size !== info.size || entry.realPath !== info.realPath;
    if (needsBackfill) {
      this.applyEntryInfo(id, info, fs.existsSync(this.file));
    }
    return this.formatDescriptor(id, info);
  }

  register(paths) {
    if (!Array.isArray(paths) || paths.length > 100) throw Error('每次最多引用100个素材');
    const result = paths.map(file => {
      if (typeof file !== 'string' || !path.isAbsolute(file)) throw Error('请拖入本地文件');
      const info = inspectFile(file, null);
      let id = Object.keys(this.entries).find(
        key =>
          this.entries[key].realPath === info.realPath ||
          (info.ino !== '0' && this.entries[key].ino === info.ino && this.entries[key].dev === info.dev),
      );
      if (!id) {
        id = crypto.randomBytes(24).toString('hex');
      }
      this.applyEntryInfo(id, info, false);
      return this.formatDescriptor(id, info);
    });
    this.save();
    return result;
  }

  registerSelection(paths) {
    if (!Array.isArray(paths) || paths.length > 100) throw Error('每次最多选择100个文件或文件夹');
    const files = new Set();
    const walk = folder => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name.toLowerCase())) walk(file);
        } else if (entry.isFile() && MIME[path.extname(file).toLowerCase()]) {
          files.add(file);
          if (files.size > 5000) throw Error('文件夹超过5000个素材，请分批导入');
        }
      }
    };
    for (const file of paths) {
      if (typeof file !== 'string' || !path.isAbsolute(file)) throw Error('请选择本地文件或文件夹');
      const actual = fs.realpathSync(file);
      if (fs.statSync(actual).isDirectory()) walk(actual);
      else files.add(actual);
      if (files.size > 5000) throw Error('每次最多导入5000个素材');
    }
    const list = [...files], result = [];
    for (let i = 0; i < list.length; i += 100) result.push(...this.register(list.slice(i, i + 100)));
    return result;
  }

  sync(ids) {
    const list = Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && this.entries[id]).slice(0, 5000) : Object.keys(this.entries);
    const resolved = {};
    const missing = {};
    for (const id of list) {
      try {
        resolved[id] = this.describe(id);
      } catch {
        missing[id] = this.entries[id]?.path || '';
      }
    }
    return { resolved, missing };
  }

  defaultRelinkDir(ids) {
    const list = Array.isArray(ids) && ids.length ? ids : Object.keys(this.entries);
    for (const id of list) {
      const p = this.entries[id]?.path;
      if (p && !fs.existsSync(p)) {
        const dir = nearestExistingDir(p);
        if (fs.existsSync(dir)) return dir;
      }
    }
    for (const id of list) {
      const p = this.entries[id]?.path;
      if (p) {
        const dir = nearestExistingDir(p);
        if (fs.existsSync(dir)) return dir;
      }
    }
    return undefined;
  }

  relinkSingle(id, filePath, otherIds = []) {
    const entry = this.entries[id];
    if (!entry) throw Error('素材引用不存在');
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw Error('请选择有效的本地原文件');
    const info = inspectFile(filePath, null);
    const expected = this.expectedKind(entry);
    if (expected && info.kind !== expected) throw Error('请选择相同类型的原文件');
    this.applyEntryInfo(id, info, true);
    const synced = this.sync([id, ...otherIds.filter(x => x !== id)]);
    return { item: synced.resolved[id], ...synced };
  }

  relinkFolder(folders, targetIds = []) {
    if (!Array.isArray(folders) || !folders.length) return { healedCount: 0, ...this.sync(targetIds) };
    const resolvedFolders = folders
      .filter(f => typeof f === 'string' && path.isAbsolute(f) && fs.existsSync(f))
      .map(f => fs.realpathSync(f));
    if (!resolvedFolders.length) throw Error('请选择有效的本地文件夹');

    const indexFiles = (roots, maxFiles = 10000) => {
      const candidates = [];
      const seen = new Set();
      const walk = (dir, depth = 0) => {
        if (candidates.length >= maxFiles || depth > 8) return;
        let items;
        try {
          items = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const item of items) {
          if (item.isSymbolicLink()) continue;
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            if (!SKIP_DIRS.has(item.name.toLowerCase())) walk(full, depth + 1);
          } else if (item.isFile()) {
            const mime = MIME[path.extname(item.name).toLowerCase()];
            if (!mime || seen.has(normKey(full))) continue;
            seen.add(normKey(full));
            const segs = full.split(/[\\/]/).filter(Boolean).map(normKey);
            candidates.push({
              file: full,
              kind: mime.split('/')[0],
              baseKey: normKey(item.name),
              stemKey: normKey(path.basename(item.name, path.extname(item.name))),
              parentKey: segs.length >= 2 ? segs[segs.length - 2] : '',
              segs,
              stat: null,
              hash: null,
            });
            if (candidates.length >= maxFiles) return;
          }
        }
      };
      for (const root of roots) {
        if (fs.statSync(root).isDirectory()) walk(root, 0);
      }
      return candidates;
    };

    const getStat = c => {
      if (!c.stat) {
        try {
          c.stat = fs.statSync(c.file, { bigint: true });
        } catch {
          c.stat = false;
        }
      }
      return c.stat || null;
    };
    const getHash = c => {
      if (c.hash === null) {
        const st = getStat(c);
        try {
          c.hash = st ? computeFingerprint(c.file, Number(st.size)) : '';
        } catch {
          c.hash = '';
        }
      }
      return c.hash;
    };

    const matchEntryInPool = (entry, pool) => {
      const viaPrefix = this.tryPrefixRewrites(entry);
      if (viaPrefix) return viaPrefix;

      const expected = this.expectedKind(entry);
      const kindPool = expected ? pool.filter(c => c.kind === expected) : pool;
      if (!kindPool.length) return null;

      if (entry.ino && entry.ino !== '0') {
        const byIno = kindPool.find(c => {
          const st = getStat(c);
          return st && String(st.ino) === String(entry.ino) && (!entry.dev || String(st.dev) === String(entry.dev));
        });
        if (byIno) {
          const info = this.acceptCandidate(byIno.file, entry, { enforceScope: false });
          if (info) return info;
        }
      }

      if (entry.hash && typeof entry.size === 'number') {
        const byHash = kindPool.find(c => {
          const st = getStat(c);
          return st && Number(st.size) === entry.size && getHash(c) === entry.hash;
        });
        if (byHash) {
          const info = this.acceptCandidate(byHash.file, entry, { enforceScope: false });
          if (info) return info;
        }
      }

      const oldSegs = path.resolve(entry.path || '').split(/[\\/]/).filter(Boolean).map(normKey);
      const oldBase = normKey(path.basename(entry.path || ''));
      const oldStem = normKey(path.basename(entry.path || '', path.extname(entry.path || '')));
      const oldParent = oldSegs.length >= 2 ? oldSegs[oldSegs.length - 2] : '';

      const sameBase = kindPool.filter(c => c.baseKey === oldBase);
      if (sameBase.length >= 1) {
        const scored = sameBase
          .map(c => {
            let suffixMatch = 0;
            while (
              suffixMatch < oldSegs.length &&
              suffixMatch < c.segs.length &&
              oldSegs[oldSegs.length - 1 - suffixMatch] === c.segs[c.segs.length - 1 - suffixMatch]
            ) {
              suffixMatch++;
            }
            const st = getStat(c);
            const sizeBonus = typeof entry.size === 'number' && st && Number(st.size) === entry.size ? 100 : 0;
            const parentBonus = oldParent && c.parentKey === oldParent ? 10 : 0;
            return { c, score: sizeBonus + suffixMatch * 15 + parentBonus };
          })
          .sort((a, b) => b.score - a.score);
        const info = this.acceptCandidate(scored[0].c.file, entry, { enforceScope: false });
        if (info) return info;
      }

      if (oldStem) {
        const sameStem = kindPool.filter(c => c.stemKey === oldStem);
        if (sameStem.length === 1) {
          const info = this.acceptCandidate(sameStem[0].file, entry, { enforceScope: false });
          if (info) return info;
        }
      }
      return null;
    };

    const allCandidateIds = [
      ...new Set([
        ...(Array.isArray(targetIds) ? targetIds.filter(id => this.entries[id]) : []),
        ...Object.keys(this.entries).filter(id => !fs.existsSync(this.entries[id]?.path || '')),
      ]),
    ];
    const missingIds = allCandidateIds.filter(id => !fs.existsSync(this.entries[id]?.path || ''));

    let healedCount = 0;
    const primaryPool = indexFiles(resolvedFolders, 10000);
    const remainingIds = [];

    for (const id of missingIds) {
      const info = matchEntryInPool(this.entries[id], primaryPool);
      if (info) {
        this.applyEntryInfo(id, info, false);
        healedCount++;
      } else {
        remainingIds.push(id);
      }
    }

    if (remainingIds.length > 0) {
      const parentRoots = resolvedFolders
        .map(f => path.dirname(f))
        .filter(p => !isDriveRoot(p) && fs.existsSync(p));
      const parentPool = parentRoots.length ? indexFiles(parentRoots, 3000) : [];
      for (const id of remainingIds) {
        const entry = this.entries[id];
        const info = matchEntryInPool(entry, parentPool) || this.trackMissing(id, entry);
        if (info) {
          this.applyEntryInfo(id, info, false);
          healedCount++;
        }
      }
    }

    if (healedCount > 0) this.save();
    const syncList = Array.isArray(targetIds) && targetIds.length ? targetIds : missingIds;
    return { healedCount, ...this.sync(syncList) };
  }

  serve(req, res, id) {
    id = id.split('?')[0];
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const item = this.describe(id);
      const { preview } = library.preview(path.dirname(item.path), path.basename(item.path), this.origin());
      library.serveMedia(req, res, preview.split('/').pop());
    } catch {
      if (!res.headersSent) {
        res.writeHead(404);
        res.end('原文件不存在或引用已失效');
      } else {
        res.destroy();
      }
    }
  }
}

module.exports = { LocalAssetLinks, categoryFor };
