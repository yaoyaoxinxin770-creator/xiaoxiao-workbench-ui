const path = require('path');

const SCHEMA_VERSION = 1;

function nowIso() { return new Date().toISOString(); }

function relativePath(root, target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function defaultProject(rootPath, name = path.basename(rootPath)) {
  const now = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    workspace: null,
    mode: null,
    modeLocked: false,
    folders: {
      characters: null, scenes: null, audio: null, props: null, videoOutput: null,
      documents: [],
    },
    folderRecognitionOverrides: {
      characters: null, scenes: null, audio: null, props: null, videoOutput: null,
    },
    characterGroups: {},
    characterBindings: {},
    sceneAliases: {},
    audioBindings: {},
    assetOverrides: {},
    segmentAssetBindings: {},
    segmentCharacterBindings: {},
    segmentAudioBindings: {},
    prompt: { hasDraft: false, draftUpdatedAt: null, lastParsedAt: null, videoCount: 0, videoNumbers: [] },
  };
}

function normalizeProject(input, rootPath) {
  const base = defaultProject(rootPath, input?.name || path.basename(rootPath));
  const value = input && typeof input === 'object' ? input : {};
  const merged = {
    ...base,
    ...value,
    schemaVersion: SCHEMA_VERSION,
    workspace: value.workspace === 'typetale' ? 'typetale' : value.workspace === 'jimeng' ? 'jimeng' : null,
    folders: { ...base.folders, ...(value.folders || {}) },
    folderRecognitionOverrides: { ...base.folderRecognitionOverrides, ...(value.folderRecognitionOverrides || {}) },
    characterGroups: value.characterGroups && typeof value.characterGroups === 'object' ? value.characterGroups : {},
    characterBindings: value.characterBindings && typeof value.characterBindings === 'object' ? value.characterBindings : {},
    segmentCharacterBindings: value.segmentCharacterBindings && typeof value.segmentCharacterBindings === 'object' ? value.segmentCharacterBindings : {},
    segmentAudioBindings: value.segmentAudioBindings && typeof value.segmentAudioBindings === 'object' ? value.segmentAudioBindings : {},
    sceneAliases: value.sceneAliases && typeof value.sceneAliases === 'object' ? value.sceneAliases : {},
    audioBindings: value.audioBindings && typeof value.audioBindings === 'object' ? value.audioBindings : {},
    prompt: { ...base.prompt, ...(value.prompt || {}) },
  };
  delete merged.projectId;
  delete merged.rootPathHint;
  delete merged.health;
  delete merged.prompt.rawText;
  return merged;
}

function safeParseProject(text, rootPath) {
  try {
    return { ok: true, project: normalizeProject(JSON.parse(text), rootPath), error: null };
  } catch (error) {
    return { ok: false, project: defaultProject(rootPath), error: String(error.message || error) };
  }
}

module.exports = { SCHEMA_VERSION, defaultProject, normalizeProject, safeParseProject, relativePath, nowIso };
