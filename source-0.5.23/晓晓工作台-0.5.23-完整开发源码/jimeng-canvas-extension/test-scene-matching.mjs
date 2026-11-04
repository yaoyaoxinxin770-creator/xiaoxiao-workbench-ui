import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "analyzer.js"), "utf8");
const context = { self: {} };
vm.runInNewContext(source, context);
const { matchSceneFiles, parseAssetScenes } = context.self.JimengLockAnalyzer;

const files = ["禅房.png", "古代城镇街道.jpg", "青竹林.webp", "无云寺.png"]
  .map((name) => ({ name, webkitRelativePath: `场景/${name}` }));

const video01 = `【场景与连续状态】
场景A：无云寺墙头（夜·外）｜镜头01——古寺外墙黛瓦，夜黑风高
场景B：禅房（夜·内）｜镜头02—05——竹床、木桌烛火、窗纸
场景C：无云寺外墙（黎明·外）｜镜头06——灰蓝晨光
焦段与透视母状态：A/C场景28—35mm
【光线】`;
const result01 = matchSceneFiles(video01, files);
assert.deepEqual(Array.from(result01.scenes, (scene) => scene.name), ["无云寺墙头", "禅房", "无云寺外墙"]);
assert.deepEqual(Array.from(result01.matches, (match) => match.fileName), ["无云寺.png", "禅房.png", "无云寺.png"]);
assert.equal(new Set(result01.matches.map((match) => match.fileName)).size, 2);
assert.deepEqual(Array.from(result01.matches, (match) => match.name), ["无云寺", "禅房", "无云寺"]);
assert.equal(result01.unmatchedScenes.length, 0);
assert.deepEqual(Array.from(parseAssetScenes(video01), (scene) => scene.name), ["无云寺墙头", "禅房", "无云寺外墙"]);

const video02 = `【场景与连续状态】
场景：古代城镇街道（日·外）——两侧店铺幌子，街面开阔
【光线】`;
assert.equal(matchSceneFiles(video02, files).matches[0].fileName, "古代城镇街道.jpg");

const video03 = `【场景与连续状态】
场景A：禅房（夜·内）｜镜头01—07——闪回
场景B：无云寺外墙（黎明·外）｜镜头08—09——灰蓝晨光
场景C：青竹林（日·外）｜镜头10——大青石
【光线】`;
const result03 = matchSceneFiles(video03, files);
assert.deepEqual(Array.from(result03.matches, (match) => match.fileName), ["禅房.png", "无云寺.png", "青竹林.webp"]);

for (const result of [result01, result03]) {
  for (const plan of result.matches) {
    assert.equal(plan.kind, "image");
    assert.equal(plan.anchor, plan.sceneName);
    assert.equal(result === result01 ? video01.slice(plan.offset - plan.anchor.length, plan.offset) : video03.slice(plan.offset - plan.anchor.length, plan.offset), plan.anchor);
  }
}

const missing = matchSceneFiles(`【场景与连续状态】\n场景：雪山洞穴（夜·内）\n【光线】`, files);
assert.equal(missing.matches.length, 0);
assert.equal(missing.unmatchedScenes[0].name, "雪山洞穴");

console.log("[OK] multi-scene folder matching and fuzzy temple reuse");
