import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "analyzer.js"), "utf8");
const context = { self: {} };
vm.runInNewContext(source, context);
const analyzer = context.self.JimengLockAnalyzer;

const prompt = `肢体动作流畅，高帧率动态微表情捕捉(脸部清晰/表情有戏)【项目规格】
目标平台：Seedance 2.0
画幅：16:9横屏
视觉类型：二维日本剧场版动漫
制作形态：全动态
【全局视觉】
2020年代高预算日本剧场版动画质感，现代都市妖奇幻，人物面部比例严格继承参考图。阮乔与霍砚均为成年职场男性。
画面无字幕、无水印、无无关文字。禁止生成背景音乐，仅保留对白和必要物理音效。
【视频编号26】
总时长：14.5秒
【承接视频编号25】
胡萝卜条掉在键盘上；阮乔坐在椅子里，正在僵硬地转头；霍砚站在他身后。
【场景与连续状态】
场景：白天，妖管局开放式办公区，阮乔工位。
焦段与透视母状态：40—85mm，突出霍砚从后方形成的身高和距离压迫。
角色站位：阮乔坐在工位椅中；霍砚站在椅背后方偏右，能够看到电脑和键盘。
人物状态：阮乔恐惧到想缩进椅背；霍砚冷淡检查工作情况。
继承状态：霍砚保持人形，黑色衬衫领口解开一颗扣子；不出现蛇尾。
【光线】
办公区冷白光稳定；霍砚站位遮住部分顶灯，在阮乔脸上形成局部阴影。
【出场人物】
阮乔：开镜在场｜白发、蓝色西装，人类伪装。
霍砚：开镜在场｜黑发、黑色开领衬衫和黑色西裤，人类形态。
【镜头01】2.4s｜阮乔主观视角转向霍砚，中近景`;

const prefix = "使用Seedance 2.0生成16:9横屏视频，以下提示词的全部内容你都要一比一全部复制粘贴使用，提示词内容：";
const fullText = analyzer.composePrompt(prefix, prompt);
const matchedFile = {
  name: "妖管局开放式办公区 场景图.png",
  webkitRelativePath: "场景图/妖管局开放式办公区 场景图.png",
};
const result = analyzer.analyze(fullText, [
  { name: "阮乔工位以外.png", webkitRelativePath: "场景图/阮乔工位以外.png" },
  matchedFile,
  { name: "环境音.wav", webkitRelativePath: "场景图/环境音.wav" },
]);

assert.deepEqual(Array.from(result.subjects, (item) => item.name), ["阮乔", "霍砚"]);
assert.match(result.scene.value, /妖管局开放式办公区/);
assert.equal(result.images.length, 1);
assert.equal(result.images[0].fileName, matchedFile.name);
assert.equal(result.images[0].name, "妖管局开放式办公区 场景图");
assert.equal(result.images[0].anchor, "妖管局开放式办公区");

for (const plan of [...result.subjects, ...result.images]) {
  assert.equal(fullText.slice(plan.offset - plan.anchor.length, plan.offset), plan.anchor);
  const occurrences = fullText.slice(0, plan.offset).split(plan.anchor).length - 1;
  assert.equal(plan.occurrence, occurrences);
}

const noMatch = analyzer.analyze(fullText, [{ name: "完全不同的会议室.jpg" }]);
assert.equal(noMatch.images.length, 0);

const promptWithoutSceneField = `【项目规格】
【视频编号03】
【出场人物】
胡离：开镜在场
【镜头10】
构图（开镜静态）：青竹林正午，斑驳碎金；胡离枕着老竹子精。`;
const inferred = analyzer.analyze(promptWithoutSceneField, [{ name: "青竹林 场景图.png" }]);
assert.equal(inferred.images.length, 1);
assert.equal(inferred.images[0].anchor, "青竹林");
assert.equal(inferred.images[0].inferredFromFullText, true);
assert.equal(inferred.scene.inferredFromFullText, true);

const sceneOutsideSection = analyzer.parseSceneLine(`【项目规格】\n场景：无云寺禅房（日/内）\n【镜头01】`);
assert.match(sceneOutsideSection.value, /无云寺禅房/);

console.log("[OK] prompt subject and scene-image lock analysis");
