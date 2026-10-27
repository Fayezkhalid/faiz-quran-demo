// تحليل الموسيقى المستوردة: فك الترميز، كشف المقام والسرعة، وإزالة صوت المغني

export async function decodeAudio(arrayBuffer) {
  const ctx = new OfflineAudioContext(2, 1, 44100);
  return ctx.decodeAudioData(arrayBuffer);
}

function mono(buffer) {
  const n = buffer.length;
  const out = new Float32Array(n);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / chs;
  }
  return out;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// ملفات Krumhansl-Kessler للمقام الكبير والصغير
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

export function detectKey(buffer) {
  const x = mono(buffer);
  const sr = buffer.sampleRate;
  const N = 8192;
  const frames = Math.min(200, Math.floor(x.length / N));
  const chroma = new Float64Array(12);
  if (frames < 1) return { key: 0, scale: 'major', confidence: 0 };
  const step = Math.floor((x.length - N) / frames);
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const kMin = Math.ceil((80 * N) / sr), kMax = Math.floor((2000 * N) / sr);
  const pcOf = new Int8Array(kMax + 1);
  for (let k = kMin; k <= kMax; k++) {
    const midi = 69 + 12 * Math.log2((k * sr) / N / 440);
    pcOf[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const o = f * step;
    for (let i = 0; i < N; i++) {
      re[i] = x[o + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = kMin; k <= kMax; k++) chroma[pcOf[k]] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
  }
  const scores = [];
  for (let t = 0; t < 12; t++) {
    const rot = Array.from({ length: 12 }, (_, i) => chroma[(i + t) % 12]);
    scores.push({ key: t, scale: 'major', r: corr(rot, MAJOR) });
    scores.push({ key: t, scale: 'minor', r: corr(rot, MINOR) });
  }
  scores.sort((a, b) => b.r - a.r);
  return { key: scores[0].key, scale: scores[0].scale, confidence: scores[0].r - scores[1].r };
}

export function detectBPM(buffer) {
  const sr = buffer.sampleRate;
  const all = mono(buffer);
  const startS = Math.floor(all.length * 0.15);
  const x = all.subarray(startS, Math.min(all.length, startS + sr * 60));
  const hop = 512;
  const n = Math.floor(x.length / hop);
  if (n < 200) return 100;
  const env = new Float32Array(n);
  let prevE = 0;
  for (let f = 0; f < n; f++) {
    let e = 0;
    for (let i = f * hop + 1; i < (f + 1) * hop; i++) {
      const d = x[i] - x[i - 1];
      e += d * d;
    }
    env[f] = Math.max(0, e - prevE);
    prevE = e;
  }
  const mean = env.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) env[i] -= mean;
  const fps = sr / hop;
  let best = 100, bestScore = -Infinity;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = (60 * fps) / bpm;
    const l0 = Math.floor(lag), fr = lag - l0;
    let s = 0;
    for (let i = 0; i + l0 + 1 < n; i++) s += env[i] * (env[i + l0] * (1 - fr) + env[i + l0 + 1] * fr);
    // ميل خفيف للسرعات الشائعة
    const w = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.6) ** 2);
    s *= 0.7 + 0.3 * w;
    if (s > bestScore) {
      bestScore = s;
      best = bpm;
    }
  }
  return Math.round(best);
}

// إزالة تقريبية لصوت المغني: الصوت عادة في المنتصف، فنطرح القناتين
// ونرجّع الترددات المنخفضة (البيس والطبل) من المنتصف.
export async function removeVocals(buffer) {
  if (buffer.numberOfChannels < 2) return buffer;
  const ctx = new OfflineAudioContext(2, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const gL = ctx.createGain();
  const gR = ctx.createGain();
  gR.gain.value = -1;
  const side = ctx.createGain();
  side.gain.value = 0.9;
  const mid = ctx.createGain();
  mid.gain.value = 0.5;
  const lp1 = ctx.createBiquadFilter();
  const lp2 = ctx.createBiquadFilter();
  lp1.type = lp2.type = 'lowpass';
  lp1.frequency.value = lp2.frequency.value = 170;
  src.connect(split);
  split.connect(gL, 0);
  split.connect(gR, 1);
  gL.connect(side);
  gR.connect(side);
  split.connect(mid, 0);
  split.connect(mid, 1);
  mid.connect(lp1);
  lp1.connect(lp2);
  for (const n of [side, lp2]) {
    n.connect(merge, 0, 0);
    n.connect(merge, 0, 1);
  }
  merge.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}
