// أدوات واجهة مشتركة
import { store } from './store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const AR = '٠١٢٣٤٥٦٧٨٩';
export function n(v) {
  const s = String(v);
  return store.get('arabicDigits') ? s.replace(/\d/g, (d) => AR[d]) : s;
}
export const pad = (x) => String(x).padStart(2, '0');

// أزرار تكبير وتصغير الخط داخل صفحات القراءة
export const sizeButtons = () => `<span class="size-quick" role="group" aria-label="حجم الخط"><button type="button" data-size="-1" aria-label="تصغير الخط">أ-</button><button type="button" data-size="1" aria-label="تكبير الخط">أ+</button></span>`;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let toastTimer;
export function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let onClose = null;
export function openSheet(content, { className = '', close } = {}) {
  const sheet = $('#sheet');
  const body = $('#sheetBody');
  body.innerHTML = '';
  body.className = 'sheet-body ' + className;
  if (typeof content === 'string') body.innerHTML = content;
  else body.append(content);
  if (onClose) onClose();
  onClose = close || null;
  sheet.hidden = false;
  $('#sheetBackdrop').hidden = false;
  sheet.scrollTop = 0;
  return body;
}
export function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  if (onClose) {
    const fn = onClose;
    onClose = null;
    fn();
  }
}
export function initSheet() {
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', closeSheet);
  // سحب للأسفل للإغلاق
  let y0 = null;
  const sheet = $('#sheet');
  sheet.addEventListener('touchstart', (e) => { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    sheet.style.transform = '';
    if (dy > 120) closeSheet();
    y0 = null;
  });
}

export function ripple(el, e) {
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 0.5;
  const x = (e.clientX ?? r.left + r.width / 2) - r.left - size / 2;
  const y = (e.clientY ?? r.top + r.height / 2) - r.top - size / 2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
  el.append(s);
  setTimeout(() => s.remove(), 650);
}

export function vibrate(p) {
  if (store.get('tasbihVibrate') && navigator.vibrate) {
    try { navigator.vibrate(p); } catch {}
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('تم النسخ ✓');
}

export async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copyText(text);
}

// زهور صغيرة تتطاير عند الإنجاز
export function bloom(x = innerWidth / 2, y = innerHeight / 2, count = 14) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'bloom';
    s.textContent = ['✿', '❀', '✦', '❁'][i % 4];
    const a = (i / count) * Math.PI * 2;
    const d = 90 + Math.random() * 90;
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;font-size:${16 + Math.random() * 14}px`;
    document.body.append(s);
    setTimeout(() => s.remove(), 1700);
  }
}

// صوت نقرة خفيف للسبحة
let actx;
export function audioCtx() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) actx = new AC();
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
export function click(freq = 900, dur = 0.05, vol = 0.15) {
  const ctx = audioCtx();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur + 0.05);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur + 0.06);
}
// جرس هادئ (للتنبيهات وإتمام العدد)
export function chime() {
  const ctx = audioCtx();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const t = ctx.currentTime + i * 0.12;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 1.7);
  });
}
