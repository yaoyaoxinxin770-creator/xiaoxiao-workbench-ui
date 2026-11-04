const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FOLDER_ALIASES = {
  characters: ['人物', '角色', '人物图', '角色图', 'characters'],
  scenes: ['场景', '背景', '场景图', '背景图', 'scenes'],
  audio: ['音频', 'BGM', '配音', '声音', 'audio', '音色', '角色音频', '人物音频', '音频素材', '配音素材', '声音素材', 'voice', 'voices'],
  props: ['道具', '物件', '道具图', 'props'],
  videoOutput: ['视频素材', '视频', '成片', 'output'],
};
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.opus', '.wma', '.aif', '.aiff', '.oga']);
const DOCUMENT_EXT = new Set(['.txt', '.md', '.doc', '.docx', '.pdf']);

function loadAnalyzer(analyzerPath) {
  const source = fs.readFileSync(analyzerPath, 'utf8');
  const self = {};
  vm.runInNewContext(source, { self, console, Set, Map, Array, Object, String, Number, Math, RegExp });
  return self.JimengLockAnalyzer;
}

function listEntries(root) {
  return fs.readdirSync(root, { withFileTypes: true });
}

function findFolder(entries, kind, override) {
  if (override) {
    const exact = entries.find(entry => entry.isDirectory() && entry.name === override);
    if (exact) return { name: exact.name, source: 'manual' };
  }
  const aliases = FOLDER_ALIASES[kind].map(name => name.toLocaleLowerCase());
  const found = entries.find(entry => entry.isDirectory() && aliases.includes(entry.name.toLocaleLowerCase()));
  return found ? { name: found.name, source: 'auto' } : null;
}

function walkFiles(root) {
  const result = [];
  if (!fs.existsSync(root)) return result;
  for (const entry of listEntries(root)) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(full));
    else result.push(full);
  }
  return result;
}

function listProjectAssets(rootPath, folders) {
  const result = [];
  const kinds = ['characters', 'scenes', 'props', 'audio'];
  for (const kind of kinds) {
    const folder = folders?.[kind];
    if (!folder?.relativePath) continue;
    const folderRoot = path.join(rootPath, folder.relativePath);
    for (const file of walkFiles(folderRoot)) {
      const ext = path.extname(file).toLocaleLowerCase();
      const isAudio = kind === 'audio';
      if (!(isAudio ? AUDIO_EXT : IMAGE_EXT).has(ext)) continue;
      const relativePath = path.relative(rootPath, file).split(path.sep).join('/');
      result.push({
        kind,
        relativePath,
        displayName: path.basename(file, ext),
        extension: ext.slice(1),
        size: fs.statSync(file).size,
      });
    }
  }
  return result;
}

function recognizeProject(rootPath, overrides = {}, analyzer = null) {
  const entries = listEntries(rootPath);
  const folders = {};
  for (const kind of Object.keys(FOLDER_ALIASES)) {
    const hit = findFolder(entries, kind, overrides[kind]);
    folders[kind] = hit ? { relativePath: hit.name, source: hit.source, status: 'available' } : null;
  }
  const documents = entries.filter(entry => entry.isFile() && DOCUMENT_EXT.has(path.extname(entry.name).toLocaleLowerCase()))
    .map(entry => ({ relativePath: entry.name, kind: /分镜|storyboard/i.test(entry.name) ? 'storyboard' : 'script', status: 'detected' }));
  const counts = { characters: 0, scenes: 0, audio: 0, props: 0 };
  for (const kind of Object.keys(counts)) {
    const folder = folders[kind];
    if (!folder) continue;
    const files = walkFiles(path.join(rootPath, folder.relativePath));
    counts[kind] = files.filter(file => kind === 'audio' ? AUDIO_EXT.has(path.extname(file).toLocaleLowerCase()) : IMAGE_EXT.has(path.extname(file).toLocaleLowerCase())).length;
  }
  return { folders: { ...folders, documents }, documents, counts, analyzerAvailable: Boolean(analyzer) };
}

function groupCharacterFiles(rootPath, relativeFolder, characterNames, analyzer) {
  const files = walkFiles(path.join(rootPath, relativeFolder || ''))
    .filter(file => IMAGE_EXT.has(path.extname(file).toLocaleLowerCase()));
  const names = [...new Set((characterNames || []).map(name => String(name).trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  const groups = {};
  for (const file of files) {
    const displayName = path.basename(file, path.extname(file));
    const matched = names.find(name => displayName === name || displayName.startsWith(`${name}-`) || displayName.startsWith(`${name}_`) || displayName.startsWith(`${name} `));
    if (!matched) continue;
    const relative = path.relative(rootPath, file).split(path.sep).join('/');
    const stem = analyzer?.stemOf ? analyzer.stemOf(displayName) : displayName;
    (groups[matched] ||= []).push({ relativePath: relative, displayName, versionLabel: stem.slice(matched.length).replace(/^[-_ ]+/, '') || '默认' });
  }
  return groups;
}

function characterNamesFromPrompt(prompt, analyzer) {
  if (!analyzer || typeof analyzer.parseCalibrationHeaders !== 'function') return [];
  const parsed = analyzer.parseCalibrationHeaders(String(prompt || '')) || {};
  const names = [];
  for (const video of parsed.videos || []) names.push(...(video.characters || []));
  for (const subject of parsed.subjectPlans || []) names.push(subject.name);
  return [...new Set(names.map(name => String(name).trim()).filter(Boolean))];
}

module.exports = { FOLDER_ALIASES, IMAGE_EXT, AUDIO_EXT, DOCUMENT_EXT, loadAnalyzer, recognizeProject, groupCharacterFiles, characterNamesFromPrompt, walkFiles, listProjectAssets };
