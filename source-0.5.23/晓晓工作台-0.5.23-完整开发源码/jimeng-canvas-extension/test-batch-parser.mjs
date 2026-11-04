import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "analyzer.js"), "utf8");
const context = { self: {} };
vm.runInNewContext(source, context);
const { parsePromptBatch } = context.self.JimengLockAnalyzer;

function prompt(number, ending) {
  return `【项目规格】
目标平台：Seedance 2.0
【视频编号${number}】
【场景与连续状态】
场景：青竹林
【出场人物】
胡离：开镜在场
声音与台词：${ending}`;
}

const pastedReply = [
  "````yaml",
  "---",
  "",
  "## 第三部分：纯视频生成提示词（视频编号01—03）",
  "",
  "```plaintext",
  prompt("01", "内心OS"),
  "````",
  "```plaintext",
  prompt("02", "无台词"),
  "```",
  "```plaintext",
  prompt("03", "竹叶沙沙；无台词"),
  "```",
  "",
  "---",
  "**本批进度**：已交付 01—03。",
  "**下一批**：编号 04—07。回复「继续」即可输出。",
].join("\n");

const batch = parsePromptBatch(pastedReply);
assert.equal(batch.mode, "fenced");
assert.equal(batch.title, "第三部分：纯视频生成提示词（视频编号01—03）");
assert.deepEqual(Array.from(batch.prompts, (item) => item.label), ["视频01", "视频02", "视频03"]);
assert.equal(batch.prompts.length, 3);
assert.ok(batch.prompts.every((item) => !item.prompt.includes("本批进度")));
assert.ok(batch.prompts.every((item) => !item.prompt.includes("```")));

const withDuplicate = parsePromptBatch(`${pastedReply}\n\n\`\`\`plaintext\n${prompt("03", "竹叶沙沙；无台词")}\n\`\`\``);
assert.equal(withDuplicate.prompts.length, 3);
assert.equal(withDuplicate.duplicateCount, 1);

const singlePlain = parsePromptBatch(`肢体动作流畅\n${prompt("26", "无台词")}\n---\n**本批进度**：完成`);
assert.equal(singlePlain.mode, "plain");
assert.equal(singlePlain.prompts.length, 1);
assert.ok(singlePlain.prompts[0].prompt.startsWith("肢体动作流畅"));
assert.ok(!singlePlain.prompts[0].prompt.includes("本批进度"));

console.log("[OK] mixed-fence bulk prompt recognition and grouping");
