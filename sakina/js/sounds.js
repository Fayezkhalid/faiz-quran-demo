// الأصوات: طبيعة مولّدة داخل التطبيق (تشتغل بدون إنترنت) + أذكار وتلاوات مباشرة
import { store } from './store.js';
import { $, h, icon, audioCtx, openSheet, toast } from './ui.js';

const R = 'https://backup.qurango.net/radio/';
export const SOUNDS = [
  { id: 'birds', group: 'nature', emoji: '🐦', title: 'عصافير الصباح', sub: 'تغريد هادئ' },
  { id: 'garden', group: 'nature', emoji: '🌳', title: 'حديقة وجدول', sub: 'عصافير مع خرير الماء' },
  { id: 'river', group: 'nature', emoji: '🏞️', title: 'خرير النهر', sub: 'ماء جارٍ' },
  { id: 'rain', group: 'nature', emoji: '🌧️', title: 'مطر هادئ', sub: 'قطرات ناعمة' },
  { id: 'waves', group: 'nature', emoji: '🌊', title: 'أمواج البحر', sub: 'موج على الشاطئ' },
  { id: 'night', group: 'nature', emoji: '🌙', title: 'ليل هادئ', sub: 'صراصير الليل ونسيم' },
  { id: 'athkar_sabah', group: 'voice', emoji: '☀️', title: 'أذكار الصباح', sub: 'بأصوات المشايخ', url: R + 'athkar_sabah' },
  { id: 'athkar_masa', group: 'voice', emoji: '🌆', title: 'أذكار المساء', sub: 'بأصوات المشايخ', url: R + 'athkar_masa' },
  { id: 'makkah', group: 'voice', emoji: '🕋', title: 'إذاعة القرآن الكريم', sub: 'من المملكة', url: 'https://stream.radiojar.com/0tpy1h0kxtzuv' },
  { id: 'sakeenah', group: 'voice', emoji: '🤍', title: 'آيات السكينة', sub: 'تلاوات مختارة', url: R + 'sakeenah' },
  { id: 'roqiah', group: 'voice', emoji: '🛡️', title: 'الرقية الشرعية', sub: 'آيات وأدعية', url: R + 'roqiah' },
  { id: 'baqarah', group: 'voice', emoji: '📖', title: 'سورة البقرة', sub: 'لعدد من القرّاء', url: R + 'albaqarah' },
  { id: 'mulk', group: 'voice', emoji: '✨', title: 'سورة الملك', sub: 'المنجية من عذاب القبر', url: R + 'Surah_Al-Mulk' },
  { id: 'salma', group: 'voice', emoji: '🌿', title: 'تلاوات خاشعة', sub: 'متنوعة', url: R + 'salma' },
  { id: 'afasy', group: 'reciter', emoji: '🎙️', title: 'مشاري العفاسي', sub: 'تلاوة', url: R + 'mishary_alafasi' },
  { id: 'maher', group: 'reciter', emoji: '🎙️', title: 'ماهر المعيقلي', sub: 'تلاوة', url: R + 'maher' },
  { id: 'sudais', group: 'reciter', emoji: '🎙️', title: 'عبدالرحمن السديس', sub: 'تلاوة', url: R + 'abdulrahman_alsudaes' },
  { id: 'shuraim', group: 'reciter', emoji: '🎙️', title: 'سعود الشريم', sub: 'تلاوة', url: R + 'saud_alshuraim' },
  { id: 'dosari', group: 'reciter', emoji: '🎙️', title: 'ياسر الدوسري', sub: 'تلاوة', url: R + 'yasser_aldosari' },
  { id: 'qatami', group: 'reciter', emoji: '🎙️', title: 'ناصر القطامي', sub: 'تلاوة', url: R + 'nasser_alqatami' },
  { id: 'ghamdi', group: 'reciter', emoji: '🎙️', title: 'سعد الغامدي', sub: 'تلاوة', url: R + 'saad_alghamdi' },
  { id: 'basit', group: 'reciter', emoji: '🎙️', title: 'عبدالباسط عبدالصمد', sub: 'مجوّد', url: R + 'abdulbasit_abdulsamad_mojawwad' },
  { id: 'minshawi', group: 'reciter', emoji: '🎙️', title: 'محمد صديق المنشاوي', sub: 'مرتّل', url: R + 'mohammed_siddiq_alminshawi' },
  { id: 'ajmy', group: 'reciter', emoji: '🎙️', title: 'أحمد العجمي', sub: 'تلاوة', url: R + 'ahmad_alajmy' },
];

let current = null, audioEl = null, nature = null, ducked = false;

const listeners = new Set();
export const onSound = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(current));
export const currentSound = () => current;

export function play(id) {
  const s = SOUNDS.find((x) => x.id === id);
  if (!s) return;
  stop(false);
  current = s;
  store.set('soundId', id);
  if (s.url) {
    audioEl = new Audio();
    audioEl.src = s.url;
    audioEl.volume = store.get('volume');
    audioEl.preload = 'none';
    audioEl.play().catch(() => {
      toast('تعذّر التشغيل، تأكد من الإنترنت');
      stop();
    });
    audioEl.addEventListener('error', () => { if (current === s) { toast('البث غير متاح الحين، جرّب صوتاً آخر'); stop(); } });
    audioEl.addEventListener('playing', emit);
  } else {
    nature = new Nature(s.id);
  }
  mediaSession(s);
  emit();
}

export function stop(clear = true) {
  if (audioEl) { audioEl.pause(); audioEl.src = ''; audioEl = null; }
  if (nature) { nature.stop(); nature = null; }
  current = null;
  if (clear) emit();
}

export function setVolume(v) {
  store.set('volume', v);
  if (audioEl) audioEl.volume = ducked ? v * 0.2 : v;
  if (nature) nature.setVolume(ducked ? v * 0.2 : v);
}
document.addEventListener('duck', () => { ducked = true; setVolume(store.get('volume')); });
document.addEventListener('unduck', () => { ducked = false; setVolume(store.get('volume')); });

function mediaSession(s) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: 'سكينة', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    navigator.mediaSession.setActionHandler('pause', () => stop());
    navigator.mediaSession.setActionHandler('stop', () => stop());
  } catch {}
}

export function openSoundSheet() {
  const sec = (g, title) => `<div class="sound-sec">${title}</div><div class="sound-grid">${SOUNDS.filter((s) => s.group === g).map((s) => `
    <button class="sound ${current?.id === s.id ? 'active' : ''}" data-id="${s.id}" type="button"><span class="emoji">${s.emoji}</span><b>${s.title}</b><small>${s.sub}</small></button>`).join('')}</div>`;
  const body = openSheet(`<h2>اختر الصوت المريح</h2>
    <div class="vol-row">${icon('volume')}<input type="range" id="vol" min="0" max="1" step="0.05" value="${store.get('volume')}" aria-label="مستوى الصوت">${icon('speaker')}</div>
    ${sec('nature', 'أصوات الطبيعة · بدون إنترنت')}
    ${sec('voice', 'أذكار وتلاوات · بث مباشر')}
    ${sec('reciter', 'القرّاء المشهورون')}
    <button class="btn block" id="sStop" type="button" style="margin-top:14px">${icon('stop')} إيقاف الصوت</button>
    <div class="set-row" style="margin-top:6px"><span class="lbl">شغّل صوتي المفضّل عند فتح التطبيق<span class="desc">يبدأ بعد ضغطة «بسم الله» في شاشة الترحيب</span></span>
      <label class="switch"><input type="checkbox" id="sAuto" ${store.get('soundAuto') ? 'checked' : ''}><span></span></label></div>`);
  body.querySelector('#vol').addEventListener('input', (e) => setVolume(+e.target.value));
  body.querySelector('#sStop').addEventListener('click', () => { stop(); refreshTiles(body); });
  body.querySelector('#sAuto').addEventListener('change', (e) => store.set('soundAuto', e.target.checked));
  body.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
    if (current?.id === b.dataset.id) stop();
    else {
      play(b.dataset.id);
      const s = SOUNDS.find((x) => x.id === b.dataset.id);
      if (s.url) { b.classList.add('loading'); audioEl?.addEventListener('playing', () => b.classList.remove('loading'), { once: true }); }
    }
    refreshTiles(body);
  }));
}
function refreshTiles(body) {
  body.querySelectorAll('[data-id]').forEach((b) => {
    b.classList.toggle('active', current?.id === b.dataset.id);
    if (current?.id !== b.dataset.id) b.classList.remove('loading');
  });
}

// ===== مولّد أصوات الطبيعة =====
class Nature {
  constructor(kind) {
    const ctx = (this.ctx = audioCtx());
    this.timers = [];
    this.nodes = [];
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(store.get('volume'), ctx.currentTime + 2.5);
    // صدى خفيف يعطي إحساس المكان
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.verb.connect(wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.master.connect(ctx.destination);
    ({
      birds: () => { this.breeze(0.05); this.birds(1); },
      garden: () => { this.river(0.5); this.birds(0.8); },
      river: () => this.river(1),
      rain: () => this.rain(),
      waves: () => this.waves(),
      night: () => { this.breeze(0.08); this.crickets(); },
    })[kind]();
  }
  setVolume(v) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }
  stop() {
    const ctx = this.ctx;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.stopped = true;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => { this.nodes.forEach((n) => { try { n.stop(); } catch {} }); this.master.disconnect(); }, 1500);
  }
  later(fn, ms) { const t = setTimeout(() => { if (!this.stopped) fn(); }, ms); this.timers.push(t); }

  impulse(sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }
  noise(color = 'pink', sec = 6) {
    const ctx = this.ctx, len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (color === 'white') d[i] = w * 0.5;
        else {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        }
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = b; src.loop = true; src.start();
    this.nodes.push(src);
    return src;
  }
  filter(type, f, q = 0.7) { const x = this.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
  gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  lfo(target, rate, depth, base) {
    const o = this.ctx.createOscillator(), g = this.gain(depth);
    o.frequency.value = rate; o.connect(g).connect(target); target.value = base; o.start();
    this.nodes.push(o);
  }

  breeze(v) {
    const n = this.noise('pink'), bp = this.filter('bandpass', 500, 0.5), g = this.gain(v);
    n.connect(bp).connect(g).connect(this.dry);
    this.lfo(g.gain, 0.07, v * 0.6, v);
    this.lfo(bp.frequency, 0.05, 250, 550);
  }
  river(v) {
    const ctx = this.ctx;
    const n = this.noise('brown'), lp = this.filter('lowpass', 900), g = this.gain(0.55 * v);
    n.connect(lp).connect(g).connect(this.dry);
    const n2 = this.noise('pink'), bp = this.filter('bandpass', 1800, 0.8), g2 = this.gain(0.12 * v);
    n2.connect(bp).connect(g2).connect(this.dry);
    this.lfo(bp.frequency, 0.13, 600, 1800);
    // فقاعات الماء
    const bubble = () => {
      const t = ctx.currentTime, o = ctx.createOscillator(), e = ctx.createGain(), p = ctx.createStereoPanner?.();
      const f = 300 + Math.random() * 900;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.6 + Math.random()), t + 0.06);
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      if (p) { p.pan.value = Math.random() * 1.6 - 0.8; o.connect(e).connect(p).connect(this.verb); } else o.connect(e).connect(this.verb);
      o.start(t); o.stop(t + 0.1);
      this.later(bubble, 30 + Math.random() * 160);
    };
    bubble();
  }
  rain() {
    const ctx = this.ctx;
    const n = this.noise('pink'), hp = this.filter('highpass', 500), lp = this.filter('lowpass', 7000), g = this.gain(0.5);
    n.connect(hp).connect(lp).connect(g).connect(this.dry);
    const rumble = this.noise('brown'), rl = this.filter('lowpass', 300), rg = this.gain(0.25);
    rumble.connect(rl).connect(rg).connect(this.dry);
    this.lfo(g.gain, 0.04, 0.12, 0.5);
    const white = this.ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const d = white.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    const drop = () => {
      const t = ctx.currentTime, s = ctx.createBufferSource(), f = this.filter('bandpass', 2000 + Math.random() * 4000, 3), e = this.gain(0.15 + Math.random() * 0.25);
      const p = ctx.createStereoPanner?.();
      s.buffer = white;
      if (p) { p.pan.value = Math.random() * 2 - 1; s.connect(f).connect(e).connect(p).connect(this.verb); } else s.connect(f).connect(e).connect(this.verb);
      s.start(t);
      this.later(drop, 15 + Math.random() * 90);
    };
    drop();
  }
  waves() {
    const ctx = this.ctx;
    const wave = (pan, delay) => {
      const n = this.noise('pink', 8), lp = this.filter('lowpass', 400), g = this.gain(0), p = ctx.createStereoPanner?.();
      if (p) { p.pan.value = pan; n.connect(lp).connect(g).connect(p).connect(this.dry); } else n.connect(lp).connect(g).connect(this.dry);
      const cycle = () => {
        const t = ctx.currentTime, len = 7 + Math.random() * 4;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(0.05, t);
        g.gain.linearRampToValueAtTime(0.9, t + len * 0.4);
        g.gain.linearRampToValueAtTime(0.05, t + len);
        lp.frequency.cancelScheduledValues(t);
        lp.frequency.setValueAtTime(300, t);
        lp.frequency.exponentialRampToValueAtTime(2600, t + len * 0.42);
        lp.frequency.exponentialRampToValueAtTime(300, t + len);
        this.later(cycle, len * 1000);
      };
      this.later(cycle, delay);
    };
    wave(-0.4, 0); wave(0.4, 3800);
    const n = this.noise('brown'), g = this.gain(0.18); n.connect(this.filter('lowpass', 200)).connect(g).connect(this.dry);
  }
  crickets() {
    const ctx = this.ctx;
    const cricket = (pan, f) => {
      const chirp = () => {
        const t0 = ctx.currentTime, p = ctx.createStereoPanner?.(), out = this.gain(0.035);
        if (p) { p.pan.value = pan; out.connect(p).connect(this.verb); } else out.connect(this.verb);
        const pulses = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < pulses; i++) {
          const t = t0 + i * 0.045, o = ctx.createOscillator(), e = ctx.createGain();
          o.frequency.value = f; e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
          o.connect(e).connect(out); o.start(t); o.stop(t + 0.04);
        }
        this.later(chirp, 500 + Math.random() * 900);
      };
      chirp();
    };
    cricket(-0.6, 4300); this.later(() => cricket(0.5, 4700), 300); this.later(() => cricket(0.1, 3900), 900);
  }
  birds(v) {
    const ctx = this.ctx;
    const note = (out, t, f1, f2, dur, vol) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // رجفة خفيفة تعطي طابع الطائر
      const am = ctx.createOscillator(), amg = ctx.createGain();
      am.frequency.value = 30 + Math.random() * 40; amg.gain.value = f1 * 0.03;
      am.connect(amg).connect(o.frequency); am.start(t); am.stop(t + dur + 0.02);
      o.connect(e).connect(out); o.start(t); o.stop(t + dur + 0.02);
    };
    const songs = [
      // تغريدة نازلة متكررة
      (out, t) => { const n = 3 + Math.floor(Math.random() * 4), base = 3200 + Math.random() * 1500; for (let i = 0; i < n; i++) note(out, t + i * 0.13, base, base * 0.55, 0.1, 0.25); },
      // ترتيل سريع
      (out, t) => { const base = 4200 + Math.random() * 1200; for (let i = 0; i < 10; i++) note(out, t + i * 0.05, base, base * 1.15, 0.04, 0.12); },
      // صفير صاعد ثم نازل
      (out, t) => { const b = 2200 + Math.random() * 800; note(out, t, b, b * 1.5, 0.25, 0.22); note(out, t + 0.3, b * 1.5, b * 0.9, 0.35, 0.2); },
      // نقرات قصيرة
      (out, t) => { const b = 5000 + Math.random() * 1500; for (let i = 0; i < 4; i++) note(out, t + i * 0.09 + Math.random() * 0.03, b, b * 0.8, 0.03, 0.15); },
      // نغمتان مثل البلبل
      (out, t) => { const b = 1800 + Math.random() * 500; note(out, t, b, b * 1.25, 0.18, 0.2); note(out, t + 0.22, b * 1.25, b * 1.6, 0.12, 0.18); note(out, t + 0.4, b * 1.6, b, 0.3, 0.2); },
    ];
    const bird = (pan, delay) => {
      const p = ctx.createStereoPanner?.(), out = this.gain(0.22 * v);
      if (p) { p.pan.value = pan; out.connect(p); p.connect(this.verb); p.connect(this.dry); } else { out.connect(this.verb); out.connect(this.dry); }
      const species = Math.floor(Math.random() * songs.length);
      const sing = () => {
        songs[Math.random() < 0.75 ? species : Math.floor(Math.random() * songs.length)](out, ctx.currentTime + 0.05);
        this.later(sing, 1800 + Math.random() * 5200);
      };
      this.later(sing, delay);
    };
    bird(-0.7, 300); bird(0.6, 1500); bird(-0.2, 2800); bird(0.3, 4300);
  }
}
