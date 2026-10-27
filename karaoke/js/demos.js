// موسيقى تجريبية أصلية تُولَّد داخل التطبيق (بدون حقوق نشر) مع كلمات من تأليفنا
import { lrcStamp } from './music.js';

export const DEMOS = {
  ballad: {
    title: 'نسيم الليل',
    artist: 'نغم · عرض تجريبي',
    genre: 'بالاد',
    bpm: 76,
    key: 9,
    scale: 'minor',
    intro: 4,
    body: 16,
    outro: 2,
    // Am F C G
    chords: [
      { pad: [57, 60, 64], bass: 45 },
      { pad: [57, 60, 65], bass: 41 },
      { pad: [55, 60, 64], bass: 36 },
      { pad: [55, 59, 62], bass: 43 },
    ],
    lyrics: [
      'يا نسيم الليل خذني للبعيد',
      'للقمر اللي يضوي كل عيد',
      'كل نجمة في سماك تحكي حكاية',
      'والقلب يمشي معك من البداية',
      'غنّ معي .. خلّ الصوت يطير',
      'نحلم سوا .. والحلم كبير',
      'غنّ معي .. للفجر الجديد',
      'يا نسيم الليل خذني للبعيد',
    ],
  },
  pop: {
    title: 'على الطريق',
    artist: 'نغم · عرض تجريبي',
    genre: 'بوب',
    bpm: 104,
    key: 0,
    scale: 'major',
    intro: 4,
    body: 24,
    outro: 2,
    // C G Am F
    chords: [
      { pad: [55, 60, 64], bass: 36 },
      { pad: [55, 59, 62], bass: 43 },
      { pad: [57, 60, 64], bass: 45 },
      { pad: [57, 60, 65], bass: 41 },
    ],
    lyrics: [
      'على الطريق والشمس فوقي',
      'أمشي وأغني وأطلق شوقي',
      'كل خطوة تقربني أكثر',
      'واليوم أحلى والحلم أكبر',
      'يلا نغني بصوت عالي',
      'ننسى التعب ونعيش اللحظة',
      'يلا نغني الليل غالي',
      'والفرحة بيننا محفوظة',
      'على الطريق .. على الطريق',
      'معك الدنيا تصير أحلى',
      'على الطريق .. على الطريق',
      'وبصوتي أوصل لك أعلى',
    ],
  },
  khaleeji: {
    title: 'ليل الحجاز',
    artist: 'نغم · عرض تجريبي',
    genre: 'خليجي',
    bpm: 92,
    key: 2,
    scale: 'hijaz',
    intro: 4,
    body: 16,
    outro: 2,
    // D  Gm  Cm  D  (مقام حجاز على ري)
    chords: [
      { pad: [54, 57, 62], bass: 38 },
      { pad: [55, 58, 62], bass: 43 },
      { pad: [55, 60, 63], bass: 36 },
      { pad: [54, 57, 62], bass: 38 },
    ],
    riff: [62, 63, 66, 67, 69, 67, 66, 63],
    lyrics: [
      'يا ليل طوّل .. والسهر حلو',
      'والعود يحكي .. والقلب يصفو',
      'على مقام الحجاز أغني',
      'وأقول للنجمة لا تبعدي عني',
      'هلا .. هلا .. يا زين الليالي',
      'يا فرحة الدار .. يا شوق غالي',
      'هلا .. هلا .. والطرب يحلى',
      'والليلة ليلة .. والليلة أحلى',
    ],
  },
};

export function demoLRC(id) {
  const d = DEMOS[id];
  const bar = (4 * 60) / d.bpm;
  const linesPerBody = d.lyrics.length;
  const barsPerLine = d.body / linesPerBody;
  const out = [`${lrcStamp(0.5)}♪ ♪ ♪`];
  d.lyrics.forEach((l, i) => out.push(lrcStamp((d.intro + i * barsPerLine) * bar) + l));
  out.push(`${lrcStamp((d.intro + d.body) * bar)}♪ ♪ ♪`);
  return out.join('\n');
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export async function renderDemo(id) {
  const d = DEMOS[id];
  const sr = 44100;
  const beat = 60 / d.bpm;
  const bar = 4 * beat;
  const bars = d.intro + d.body + d.outro;
  const dur = bars * bar + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);

  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;

  const master = ctx.createGain();
  master.gain.value = 0.75;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  master.connect(comp);
  comp.connect(ctx.destination);

  // ريفيرب خفيف للآلات
  const ir = ctx.createBuffer(2, sr * 2, sr);
  for (let c = 0; c < 2; c++) {
    const x = ir.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3) * 0.12;
  }
  const rev = ctx.createConvolver();
  rev.buffer = ir;
  const revIn = ctx.createGain();
  revIn.gain.value = 0.5;
  revIn.connect(rev);
  rev.connect(master);

  const bus = (pan, vol, wet = 0) => {
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(master);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(revIn);
    }
    return g;
  };
  const drums = bus(0, 0.9, 0.1);
  const hats = bus(0.25, 0.5);
  const padB = bus(-0.15, 0.55, 0.6);
  const bassB = bus(0, 0.8);
  const lead = bus(0.2, 0.5, 0.5);
  const perc = bus(-0.3, 0.6, 0.2);

  const noiseSrc = (t, len, out) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.connect(out);
    s.start(t, Math.random() * 0.5, len);
    return s;
  };
  const decayGain = (t, peak, len) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    return g;
  };
  const filt = (type, f, q = 0.8) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };

  const kick = (t, v = 0.9) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = decayGain(t, v, 0.4);
    o.connect(g);
    g.connect(drums);
    o.start(t);
    o.stop(t + 0.45);
  };
  const snare = (t, v = 0.4) => {
    const f = filt('bandpass', 1800);
    const g = decayGain(t, v, 0.2);
    noiseSrc(t, 0.25, f);
    f.connect(g);
    g.connect(drums);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 185;
    const g2 = decayGain(t, v * 0.5, 0.1);
    o.connect(g2);
    g2.connect(drums);
    o.start(t);
    o.stop(t + 0.12);
  };
  const hat = (t, v = 0.12, open = false) => {
    const f = filt('highpass', 7500);
    const g = decayGain(t, v, open ? 0.25 : 0.045);
    noiseSrc(t, 0.3, f);
    f.connect(g);
    g.connect(hats);
  };
  const clap = (t, v = 0.35) => {
    const f = filt('bandpass', 1400, 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    [0, 0.011, 0.022].forEach((o) => {
      g.gain.setValueAtTime(v, t + o);
      g.gain.exponentialRampToValueAtTime(v * 0.2, t + o + 0.009);
    });
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noiseSrc(t, 0.25, f);
    f.connect(g);
    g.connect(perc);
  };
  const tom = (t, f0, v = 0.7) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0 * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.05);
    const g = decayGain(t, v, 0.3);
    o.connect(g);
    g.connect(perc);
    o.start(t);
    o.stop(t + 0.32);
  };
  const pad = (t, len, notes, v = 0.05) => {
    const lp = filt('lowpass', 1300, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.4, len / 3));
    g.gain.setValueAtTime(v, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.35);
    lp.connect(g);
    g.connect(padB);
    for (const n of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + len + 0.4);
      }
    }
  };
  const bass = (t, len, n, v = 0.45) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(n);
    const sub = ctx.createOscillator();
    sub.frequency.value = mtof(n);
    const lp = filt('lowpass', 700);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.setTargetAtTime(v * 0.7, t + 0.02, 0.2);
    g.gain.setValueAtTime(v * 0.6, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.05);
    o.connect(lp);
    sub.connect(lp);
    lp.connect(g);
    g.connect(bassB);
    [o, sub].forEach((x) => {
      x.start(t);
      x.stop(t + len + 0.06);
    });
  };
  const pluck = (t, n, v = 0.1, type = 'square', len = 0.35) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(n);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(450, t + len * 0.7);
    const g = decayGain(t, v, len);
    o.connect(lp);
    lp.connect(g);
    g.connect(lead);
    o.start(t);
    o.stop(t + len + 0.02);
  };

  const last = bars - 1;
  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const ch = d.chords[b % d.chords.length];
    const intro = b < d.intro;
    const outro = b >= d.intro + d.body;
    const padLen = b === last ? bar * 1.6 : bar;
    const e = beat / 2;

    if (id === 'ballad') {
      pad(t, padLen, ch.pad, intro ? 0.04 : 0.05);
      if (!intro && b !== last) bass(t, bar * 0.95, ch.bass);
      const arp = [ch.pad[0] + 12, ch.pad[1] + 12, ch.pad[2] + 12, ch.pad[0] + 24];
      [0, 1, 2, 3, 2, 1, 0, 1].forEach((k, i) => pluck(t + i * e, arp[k], 0.09, 'triangle', 0.5));
      if (!intro && !outro) {
        kick(t);
        kick(t + 2.5 * beat, 0.7);
        snare(t + beat, 0.25);
        snare(t + 3 * beat, 0.3);
        for (let i = 0; i < 8; i++) hat(t + i * e, i % 2 ? 0.06 : 0.1);
      }
    } else if (id === 'pop') {
      pad(t, padLen, ch.pad, 0.045);
      const arp = [ch.pad[0] + 12, ch.pad[2] + 12, ch.pad[1] + 12];
      [0, 3, 6, 8, 11, 14].forEach((s, i) => pluck(t + s * (beat / 4), arp[i % 3], 0.07, 'square', 0.25));
      for (let i = 0; i < 8; i++) hat(t + i * e, i % 2 ? 0.1 : 0.06, i % 2 === 1 && !intro);
      if (!intro && !outro) {
        for (let i = 0; i < 4; i++) kick(t + i * beat);
        snare(t + beat, 0.35);
        snare(t + 3 * beat, 0.35);
        clap(t + beat, 0.25);
        clap(t + 3 * beat, 0.25);
        for (let i = 0; i < 8; i++) bass(t + i * e, e * 0.85, ch.bass + (i % 2 ? 12 : 0), 0.38);
      }
      if (b === last) bass(t, bar, ch.bass, 0.4);
    } else {
      pad(t, padLen, ch.pad, 0.035);
      d.riff.forEach((n, i) => pluck(t + i * e, n, 0.09, 'sawtooth', 0.3));
      for (let i = 0; i < 8; i++) hat(t + i * e, i % 2 ? 0.05 : 0.09);
      if (!intro && !outro) {
        [0, 0.75, 2].forEach((p) => {
          tom(t + p * beat, 85, 0.75);
          bass(t + p * beat, beat * 0.7, ch.bass, 0.42);
        });
        [1, 2.5, 3].forEach((p) => tom(t + p * beat, 260, 0.35));
        [1, 3, 3.5].forEach((p) => clap(t + p * beat, 0.3));
      }
      if (b === last) bass(t, bar, ch.bass, 0.4);
    }
  }
  return ctx.startRendering();
}
