(function () {
  const RAW_CHUNK_BYTES = 2 * 1024 * 1024;

  async function stageFiles(files, onProgress = () => {}) {
    const descriptors = [];
    const transferIds = [];
    try {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const transferId = crypto.randomUUID();
        const totalChunks = Math.ceil(file.size / RAW_CHUNK_BYTES);
        const descriptor = {
          name: file.name,
          type: file.type || "application/octet-stream",
          lastModified: file.lastModified || Date.now(),
          size: file.size,
          transferId,
          totalChunks,
          roleBindings: Array.isArray(file?.jimengRoleBindings) ? [...file.jimengRoleBindings] : [],
          originalName: file?.jimengOriginalName || file.name,
        };
        const begin = await chrome.runtime.sendMessage({
          type: "STAGE_FILE_BEGIN",
          file: descriptor,
        });
        if (!begin?.ok) throw new Error(begin?.error || `无法准备附件“${file.name}”`);
        transferIds.push(transferId);
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
          const start = chunkIndex * RAW_CHUNK_BYTES;
          const blob = file.slice(start, Math.min(file.size, start + RAW_CHUNK_BYTES));
          const base64 = await blobToBase64(blob);
          const response = await chrome.runtime.sendMessage({
            type: "STAGE_FILE_CHUNK",
            transferId,
            chunkIndex,
            base64,
          });
          if (!response?.ok) throw new Error(response?.error || `附件“${file.name}”分块传输失败`);
          onProgress({ file, fileIndex, fileCount: files.length, chunkIndex, totalChunks });
        }
        const finish = await chrome.runtime.sendMessage({ type: "STAGE_FILE_FINISH", transferId });
        if (!finish?.ok) throw new Error(finish?.error || `附件“${file.name}”分块校验失败`);
        descriptors.push(descriptor);
      }
      return { descriptors, transferIds };
    } catch (error) {
      await releaseTransfers(transferIds);
      throw new Error(`附件分块传输失败：${String(error?.message || error)}`);
    }
  }

  async function releaseTransfers(transferIds) {
    if (!transferIds?.length) return;
    await chrome.runtime.sendMessage({ type: "RELEASE_STAGED_FILES", transferIds }).catch(() => {});
  }

  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const step = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += step) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
    }
    return btoa(binary);
  }

  self.JimengFileTransfer = { stageFiles, releaseTransfers, RAW_CHUNK_BYTES };
})();
