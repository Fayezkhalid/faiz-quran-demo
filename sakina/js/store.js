// حفظ الإعدادات والتقدّم على الجهاز
const KEY = 'sakinaPub.v1';

const DEFAULTS = {
  theme: 'emerald',
  city: null,
  cityChosen: false,
  autoNight: false,
  font: 'naskh',
  size: 20,
  bold: false,
  arabicDigits: true,
  clock24: false,
  clockStyle: 'analog',
  hijriOffset: 0,
  tasbihSound: true,
  tasbihVibrate: true,
  tasbihPhrase: 0,
  tasbihTarget: 100,
  customPhrase: '',
  soundId: null,
  soundAuto: false,
  volume: 0.7,
  notify: false,
  notifyPrayer: true,
  notifyBefore: 10,
  notifyAzkar: true,
  opens: 0,
  firstOpen: null,
};

let state;
try {
  state = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
} catch {
  state = { ...DEFAULTS };
}

const listeners = new Set();

export const store = {
  get: (k) => state[k],
  all: () => state,
  set(k, v) {
    state[k] = v;
    save();
    listeners.forEach((fn) => fn(k, v));
  },
  on: (fn) => listeners.add(fn),
};

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

// بيانات منفصلة (تقدّم الأذكار، السبحة) بمفاتيح خاصة
export function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem('sakinaPub.' + key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
export function persist(key, value) {
  try {
    localStorage.setItem('sakinaPub.' + key, JSON.stringify(value));
  } catch {}
}

// مفتاح اليوم حسب التوقيت المحلي
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
