// ترميز AudioBuffer إلى ملف WAV (16-bit PCM)
export function encodeWav(buffer) {
  const chs = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const data = [];
  for (let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));
  const bytes = 44 + n * chs * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, bytes - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, chs, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * chs * 2, true);
  v.setUint16(32, chs * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * chs * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < chs; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
