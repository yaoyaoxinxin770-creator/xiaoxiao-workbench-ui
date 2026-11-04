import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(root, "file-transfer.js"), "utf8");
const messages = [];
const context = {
  self: {},
  Blob,
  Uint8Array,
  crypto: globalThis.crypto,
  btoa: globalThis.btoa,
  chrome: {
    runtime: {
      async sendMessage(message) {
        messages.push(message);
        return { ok: true };
      },
    },
  },
};
vm.runInNewContext(source, context);

const bytes = new Uint8Array(5 * 1024 * 1024 + 123);
for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
const file = new Blob([bytes], { type: "image/png" });
Object.defineProperties(file, {
  name: { value: "大场景图.png" },
  lastModified: { value: 123456 },
});

const result = await context.self.JimengFileTransfer.stageFiles([file]);
assert.equal(result.descriptors.length, 1);
assert.equal(result.descriptors[0].totalChunks, 3);
assert.equal(result.descriptors[0].base64, undefined);
const chunks = messages.filter((message) => message.type === "STAGE_FILE_CHUNK");
assert.equal(chunks.length, 3);
assert.ok(chunks.every((message) => message.base64.length < 4 * 1024 * 1024));
const reconstructed = Buffer.concat(chunks.map((message) => Buffer.from(message.base64, "base64")));
assert.deepEqual(reconstructed, Buffer.from(bytes));

console.log("[OK] large attachments are staged in sub-64MiB runtime message chunks");
