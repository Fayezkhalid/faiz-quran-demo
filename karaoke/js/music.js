// المقامات والسلالم والإعدادات الجاهزة لمؤثرات الصوت

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const NOTE_NAMES_AR = ['دو', 'دو#', 'ري', 'مي♭', 'مي', 'فا', 'فا#', 'صول', 'لا♭', 'لا', 'سي♭', 'سي'];

// خطوات السلم بأنصاف التون؛ 3.5 و 10.5 = ربع تون (مقامات عربية)
export const SCALES = {
  major: { name: 'ماجور / عجم', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'مينور', steps: [0, 2, 3, 5, 7, 8, 10] },
  nahawand: { name: 'نهاوند', steps: [0, 2, 3, 5, 7, 8, 11] },
  hijaz: { name: 'حجاز', steps: [0, 1, 4, 5, 7, 8, 10] },
  kurd: { name: 'كرد', steps: [0, 1, 3, 5, 7, 8, 10] },
  rast: { name: 'راست (ربع تون)', steps: [0, 2, 3.5, 5, 7, 9, 10.5] },
  bayati: { name: 'بياتي (ربع تون)', steps: [0, 1.5, 3, 5, 7, 8, 10] },
  saba: { name: 'صبا (ربع تون)', steps: [0, 1.5, 3, 4, 7, 8, 10] },
  pentatonic: { name: 'خماسي', steps: [0, 2, 4, 7, 9] },
  chromatic: { name: 'كل النغمات', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export const HARMONY = ['بدون', 'ثالثة فوق', 'خامسة فوق', 'ثالثة تحت', 'أوكتاف تحت'];
export const ECHO_NOTES = [
  [0.5, '1/8'],
  [0.75, '1/8 منقوطة'],
  [1, '1/4'],
  [2, '1/2'],
];
export const REVERB_TYPES = [
  ['room', 'غرفة'],
  ['plate', 'بليت (ستوديو)'],
  ['hall', 'قاعة كبيرة'],
];
export const GENRES = ['بوب', 'خليجي', 'طرب', 'بالاد', 'غربي', 'R&B', 'راب', 'روك', 'شيلات', 'أخرى'];

export const DEFAULT_VOICE = {
  preset: 'studio',
  tune: { enabled: true, strength: 0.6, speed: 35, key: 0, scale: 'major', transpose: 0, harmony: 0, harmonyMix: 0.45 },
  eq: { hpf: 90, low: 0, presence: 3, air: 3 },
  comp: 0.55,
  doubler: 0.1,
  reverb: 0.25,
  reverbType: 'plate',
  echo: 0.12,
  echoNote: 0.75,
  echoFeedback: 0.3,
  volume: 1,
};

export const PRESETS = {
  natural: {
    name: 'طبيعي',
    tune: { strength: 0.35, speed: 70, harmony: 0 },
    eq: { hpf: 80, low: 0, presence: 1.5, air: 2 },
    comp: 0.4, doubler: 0, reverb: 0.15, reverbType: 'room', echo: 0, echoFeedback: 0.2,
  },
  studio: {
    name: 'ستوديو',
    tune: { strength: 0.6, speed: 35, harmony: 0 },
    eq: { hpf: 90, low: 0, presence: 3, air: 3 },
    comp: 0.55, doubler: 0.1, reverb: 0.25, reverbType: 'plate', echo: 0.12, echoNote: 0.75, echoFeedback: 0.3,
  },
  pop: {
    name: 'بوب حديث',
    tune: { strength: 1, speed: 0, harmony: 0 },
    eq: { hpf: 110, low: -1, presence: 4.5, air: 5 },
    comp: 0.75, doubler: 0.3, reverb: 0.2, reverbType: 'plate', echo: 0.18, echoNote: 0.5, echoFeedback: 0.25,
  },
  tarab: {
    name: 'طرب',
    tune: { strength: 0.4, speed: 90, harmony: 0 },
    eq: { hpf: 80, low: 1.5, presence: 2, air: 2 },
    comp: 0.45, doubler: 0, reverb: 0.45, reverbType: 'hall', echo: 0.2, echoNote: 1, echoFeedback: 0.35,
  },
  stage: {
    name: 'مسرح',
    tune: { strength: 0.65, speed: 25, harmony: 2, harmonyMix: 0.35 },
    eq: { hpf: 100, low: 0, presence: 3.5, air: 4 },
    comp: 0.6, doubler: 0.35, reverb: 0.55, reverbType: 'hall', echo: 0.3, echoNote: 0.75, echoFeedback: 0.4,
  },
  radio: {
    name: 'راديو',
    tune: { strength: 0.5, speed: 40, harmony: 0 },
    eq: { hpf: 320, low: -6, presence: 7, air: -5 },
    comp: 0.85, doubler: 0, reverb: 0.05, reverbType: 'room', echo: 0, echoFeedback: 0.2,
  },
};

export const clone = (o) => JSON.parse(JSON.stringify(o));

// يدمج الإعداد الجاهز مع الحفاظ على المقام والطبقة ومستوى الصوت
export function applyPreset(params, id) {
  const pr = PRESETS[id];
  if (!pr) return params;
  const keep = { key: params.tune.key, scale: params.tune.scale, transpose: params.tune.transpose, enabled: params.tune.enabled };
  const { name, tune, eq, ...rest } = pr;
  Object.assign(params, rest);
  Object.assign(params.tune, DEFAULT_VOICE.tune, tune, keep);
  Object.assign(params.eq, eq);
  params.preset = id;
  return params;
}

// يكمل أي حقول ناقصة (لما نضيف خواص جديدة تبقى التسجيلات القديمة شغالة)
export function normalizeVoice(p) {
  const d = clone(DEFAULT_VOICE);
  if (!p) return d;
  return { ...d, ...p, tune: { ...d.tune, ...(p.tune || {}) }, eq: { ...d.eq, ...(p.eq || {}) } };
}

export function nearestInScale(m, key, steps) {
  let best = m, bd = 1e9;
  const base = Math.floor((m - key) / 12);
  for (let o = base - 1; o <= base + 1; o++) {
    for (const s of steps) {
      const c = key + 12 * o + s;
      const d = Math.abs(c - m);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
  }
  return best;
}

export function midiName(m) {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

export function keyLabel(key, scale) {
  return `${NOTE_NAMES[key] ?? '?'} ${SCALES[scale]?.name ?? ''}`.trim();
}

// ---------- الكلمات (LRC)
export function parseLRC(text) {
  const lines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const txt = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: +m[1] * 60 + +m[2], text: txt });
  }
  return lines.sort((a, b) => a.t - b.t);
}

export function plainLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((s) => s.replace(/\[[^\]]*\]/g, '').trim())
    .filter(Boolean);
}

export function lrcStamp(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
}

export function toLRC(lines) {
  return lines.map((l) => lrcStamp(l.t) + l.text).join('\n');
}
