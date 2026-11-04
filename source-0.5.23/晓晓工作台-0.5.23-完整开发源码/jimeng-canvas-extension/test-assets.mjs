import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "analyzer.js"), "utf8");
const context = { self: {} };
vm.runInNewContext(source, context);
const { analyzeAssets, isLikelyGroupCharacter } = context.self.JimengLockAnalyzer;
assert.equal(isLikelyGroupCharacter("鉴妖司人群"), true);
assert.equal(isLikelyGroupCharacter("玄寂"), false);

const explicit = analyzeAssets(`【项目规格】
【场景与连续状态】
场景：古代城镇街道（日/外）——两侧店铺幌子，街面开阔
【出场人物】
胡离：开镜在场
玄寂：开镜在场
鉴妖司人群：后景在场
【镜头01】`);
assert.deepEqual(Array.from(explicit.characters), ["胡离", "玄寂", "鉴妖司人群"]);
assert.equal(explicit.scenes.length, 1);
assert.equal(explicit.scenes[0].name, "古代城镇街道");
assert.equal(explicit.scenes[0].inferred, false);

const inferred = analyzeAssets(`【项目规格】
【出场人物】
胡离：开镜在场
老竹子精：开镜在场
【镜头10】
构图（开镜静态）：青竹林正午，斑驳碎金；大青石在画面中央。`);
assert.equal(inferred.scenes.length, 1);
assert.equal(inferred.scenes[0].name, "青竹林");
assert.equal(inferred.scenes[0].inferred, true);

const unknown = analyzeAssets(`【项目规格】\n【出场人物】\n胡离：开镜在场\n【镜头01】\n画面开始运动。`);
assert.equal(unknown.scenes.length, 0);

console.log("[OK] queue character and scene asset audit");
