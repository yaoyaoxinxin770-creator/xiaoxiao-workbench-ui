// 16-bit PCM WAV encoder. Pure so it is unit-testable in Node.
export function encodeWavPcm16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
    const channelCount = channels.length, frames = channels[0]?.length ?? 0, blockAlign = channelCount * 2, dataBytes = frames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataBytes), view = new DataView(buffer);
    const ascii = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    ascii(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, dataBytes, true);
    let offset = 44;
    for (let i = 0; i < frames; i++) for (const channel of channels) { const s = Math.max(-1, Math.min(1, channel[i])); view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true); offset += 2; }
    return buffer;
}

// 小云雀 rejects MP3 reference audio ("音频素材信息缺失"); decode in the browser and resend as PCM WAV.
export async function transcodeAudioToWav(blob: Blob): Promise<Blob> {
    if (blob.type === "audio/wav" || blob.type === "audio/x-wav" || blob.type === "audio/wave") return blob;
    const context = new AudioContext();
    try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer()).catch(() => { throw new Error("音频无法解码，请改用 MP3 或 WAV 文件"); });
        const channels = Array.from({ length: Math.min(decoded.numberOfChannels, 2) }, (_, i) => decoded.getChannelData(i));
        return new Blob([encodeWavPcm16(channels, decoded.sampleRate)], { type: "audio/wav" });
    } finally { void context.close(); }
}
