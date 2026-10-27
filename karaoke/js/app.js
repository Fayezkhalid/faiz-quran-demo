import { db } from './db.js';
import { Engine, StudioSession, TakePlayer, renderMix, calibrateLatency, floatToInt16 } from './engine.js';
import {
  SCALES, NOTE_NAMES, NOTE_NAMES_AR, PRESETS, HARMONY, ECHO_NOTES, REVERB_TYPES, GENRES,
  clone, applyPreset, normalizeVoice, nearestInScale, midiName, keyLabel,
  parseLRC, plainLines, toLRC,
} from './music.js';
import { DEMOS, renderDemo, demoLRC } from './demos.js';
import { decodeAudio, detectKey, detectBPM, removeVocals } from './analysis.js';
import { encodeWav } from './wav.js';
import { initHero } from './hero.js';

// ---------------------------------------------------------------- أدوات
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hue = (str) => 95 + ([...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7) % 70);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

const ICONS = {
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  rec: '<circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  back: '<path d="M6 5v14"/><path d="M19 5 9 12l10 7z"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  library: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8"/>',
  wave: '<path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h0"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 11a4 4 0 0 1-1.5 8z"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const paintIcons = (root = document) => $$('[data-icon]', root).forEach((e) => (e.innerHTML = icon(e.dataset.icon)));

const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem('nagham.' + k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('nagham.' + k, JSON.stringify(v));
    } catch (e) {}
  },
};

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function busy(text) {
  $('#busyText').textContent = text || '';
  $('#busy').hidden = !text;
}

// ---------------------------------------------------------------- الحالة
const state = {
  tracks: [],
  takes: [],
  filter: 'all',
  query: '',
  current: null,
  settings: { displayName: 'FAYEX', headphones: true, monitor: false, latencyMs: null, catalogUrl: './catalog.json', welcomed: false, seeded: false, ...LS.get('settings', {}) },
  voice: normalizeVoice(LS.get('voice', null)),
};
const saveSettings = () => LS.set('settings', state.settings);
let voiceSaveTimer;
const saveVoice = () => {
  clearTimeout(voiceSaveTimer);
  voiceSaveTimer = setTimeout(() => LS.set('voice', state.voice), 400);
};

const engine = new Engine();
let session = null;
const bufferCache = new Map();

async function getBuffer(track) {
  if (bufferCache.has(track.id)) return bufferCache.get(track.id);
  let buf;
  if (track.demo) buf = await renderDemo(track.demo);
  else buf = await decodeAudio(await track.blob.arrayBuffer());
  bufferCache.set(track.id, buf);
  // نخلي آخر 4 أغاني فقط في الذاكرة
  if (bufferCache.size > 4) bufferCache.delete(bufferCache.keys().next().value);
  return buf;
}

// ---------------------------------------------------------------- التنقل
function go(tab) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  state.tab = tab;
  hero && hero.sync();
  if (tab === 'studio') requestAnimationFrame(sizeCanvas);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- الورقة السفلية
let sheetClose = null;
function openSheet(content, { full = false, onClose } = {}) {
  closeSheet();
  const body = $('#sheetBody');
  body.innerHTML = '';
  if (typeof content === 'string') body.innerHTML = content;
  else body.append(content);
  paintIcons(body);
  $('#sheet').classList.toggle('full', full);
  $('#sheet').hidden = false;
  sheetClose = onClose || null;
  return body;
}
function closeSheet() {
  if ($('#sheet').hidden) return;
  $('#sheet').hidden = true;
  const fn = sheetClose;
  sheetClose = null;
  if (fn) fn();
}

// ---------------------------------------------------------------- المكتبة
function coverHTML(t, cls = 'cover') {
  return `<div class="${cls}" style="--h:${hue(t.title)}">${esc((t.title || '♪').trim()[0] || '♪')}</div>`;
}

function renderGenres() {
  const present = new Set(state.tracks.map((t) => t.genre).filter(Boolean));
  const chips = [['all', 'الكل'], ['fav', '★ المفضلة'], ...GENRES.filter((g) => present.has(g)).map((g) => [g, g])];
  $('#genreChips').innerHTML = chips
    .map(([id, label]) => `<button class="chip ${state.filter === id ? 'active' : ''}" data-filter="${esc(id)}">${esc(label)}</button>`)
    .join('');
}

function renderLibrary() {
  renderGenres();
  const q = state.query.trim().toLowerCase();
  const list = state.tracks
    .filter((t) => state.filter === 'all' || (state.filter === 'fav' ? t.fav : t.genre === state.filter))
    .filter((t) => !q || [t.title, t.artist, t.genre].some((s) => String(s || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.fav - a.fav) || (b.createdAt - a.createdAt));
  const box = $('#trackList');
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="empty-ico">${icon('library')}</div><h3>${state.tracks.length ? 'ما فيه نتائج' : 'مكتبتك فاضية'}</h3><p>أضف ملف موسيقى من جوالك أو نزّل من الكتالوج.</p></div>`;
    return;
  }
  box.innerHTML = list
    .map(
      (t) => `<article class="track" data-id="${t.id}">
      ${coverHTML(t)}
      <div class="meta">
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.artist || 'فنان غير معروف')}${t.genre ? ' · ' + esc(t.genre) : ''}</p>
        <div class="tags">
          <span class="hl">${esc(keyLabel(t.key, t.scale))}</span>
          <span dir="ltr">${t.bpm || '—'} BPM</span>
          <span dir="ltr">${fmt(t.duration)}</span>
          ${t.lrc ? '<span>كلمات</span>' : ''}
          ${t.demo ? '<span>تجريبي</span>' : ''}
        </div>
      </div>
      <button class="icon-btn ${t.fav ? 'on' : ''}" data-act="fav" aria-label="مفضلة">${icon('star')}</button>
      <button class="icon-btn" data-act="menu" aria-label="خيارات">${icon('more')}</button>
    </article>`,
    )
    .join('');
}

async function saveTrack(t) {
  await db.put('tracks', t);
  const i = state.tracks.findIndex((x) => x.id === t.id);
  if (i >= 0) state.tracks[i] = t;
  else state.tracks.push(t);
  renderLibrary();
}

function trackMenu(t) {
  const body = openSheet(`
    <div class="sheet-head">${coverHTML(t, 'cover sm')}<div class="meta"><h3>${esc(t.title)}</h3><p>${esc(t.artist || '')}</p></div></div>
    <div class="menu-list">
      <button data-a="open">${icon('mic')}غنِّ الآن</button>
      <button data-a="edit">${icon('pen')}تعديل البيانات والكلمات</button>
      <button data-a="sync">${icon('wave')}مزامنة الكلمات بالنقر</button>
      <button data-a="del" class="danger">${icon('trash')}حذف من المكتبة</button>
    </div>`);
  body.onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    closeSheet();
    if (a === 'open') openTrack(t);
    if (a === 'edit') editTrack(t);
    if (a === 'sync') {
      await openTrack(t);
      lyricsSheet();
    }
    if (a === 'del') {
      if (!confirm(`حذف «${t.title}» من المكتبة؟`)) return;
      await db.del('tracks', t.id);
      state.tracks = state.tracks.filter((x) => x.id !== t.id);
      bufferCache.delete(t.id);
      if (state.current?.id === t.id) closeStudio();
      renderLibrary();
      toast('تم الحذف');
    }
  };
}

function trackForm(t = {}, withFile = false) {
  const keyOpts = NOTE_NAMES.map((n, i) => `<option value="${i}" ${t.key === i ? 'selected' : ''}>${n} · ${NOTE_NAMES_AR[i]}</option>`).join('');
  const scaleOpts = Object.entries(SCALES).map(([k, s]) => `<option value="${k}" ${t.scale === k ? 'selected' : ''}>${s.name}</option>`).join('');
  const genreOpts = GENRES.map((g) => `<option ${t.genre === g ? 'selected' : ''}>${g}</option>`).join('');
  return `<form class="form" id="trackForm">
    ${withFile ? `<label class="file-drop"><span data-icon="library"></span><b id="fileName">اختر ملف الموسيقى</b><span>MP3 · M4A · WAV · AAC · OGG · FLAC</span>
      <input id="fFile" type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"></label>` : ''}
    <label class="f">اسم الأغنية<input class="field" name="title" required value="${esc(t.title || '')}"></label>
    <div class="grid2">
      <label class="f">الفنان<input class="field" name="artist" value="${esc(t.artist || '')}"></label>
      <label class="f">النوع<select class="field" name="genre">${genreOpts}</select></label>
    </div>
    ${withFile ? `<label class="check"><input type="checkbox" name="removeVocals"><span><b>إزالة صوت المغني (تقريبية)</b><br>لو الملف فيه صوت مغني. تشتغل أفضل مع الأغاني اللي صوت المغني فيها بالمنتصف. للجودة الأعلى استخدم ملف «Instrumental» أصلي.</span></label>` : `
    <div class="grid2">
      <label class="f">المقام<select class="field" name="key">${keyOpts}</select></label>
      <label class="f">السلم<select class="field" name="scale">${scaleOpts}</select></label>
    </div>
    <label class="f">السرعة (BPM)<input class="field" name="bpm" type="number" min="40" max="240" value="${t.bpm || 100}"></label>`}
    <label class="f">الكلمات (اختياري) — نص عادي أو بصيغة LRC بالتوقيت
      <textarea class="field" name="lrc" placeholder="[00:12.50]السطر الأول&#10;[00:16.00]السطر الثاني&#10;… أو اكتب الكلمات بدون توقيت وزامنها بالنقر لاحقاً">${esc(t.lrc || '')}</textarea></label>
    <button class="btn primary block" type="submit">${withFile ? 'حلّل وأضف للمكتبة' : 'حفظ'}</button>
  </form>`;
}

function importSheet(prefill = {}) {
  const body = openSheet(`<h3>أضف موسيقى</h3>${trackForm({ genre: 'بوب', ...prefill }, true)}`);
  const form = $('#trackForm', body);
  let file = null;
  $('#fFile', body).onchange = (e) => {
    file = e.target.files[0];
    if (!file) return;
    $('#fileName', body).textContent = file.name;
    if (!form.title.value) form.title.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!file) return toast('اختر ملف الموسيقى أولاً');
    const meta = { title: form.title.value.trim(), artist: form.artist.value.trim(), genre: form.genre.value, lrc: form.lrc.value.trim() };
    closeSheet();
    await importAudio(file, meta, form.removeVocals.checked);
  };
}

async function importAudio(blob, meta, strip) {
  try {
    busy('جاري قراءة الملف…');
    let buf = await decodeAudio(await blob.arrayBuffer());
    if (strip) {
      busy('جاري إزالة صوت المغني…');
      buf = await removeVocals(buf);
      blob = encodeWav(buf);
    }
    busy('نحلل المقام والسرعة…');
    await new Promise((r) => setTimeout(r, 30));
    const k = detectKey(buf);
    const bpm = detectBPM(buf);
    const t = {
      id: uid(), createdAt: Date.now(), fav: false, ...meta,
      key: meta.key ?? k.key, scale: meta.scale ?? k.scale, bpm: meta.bpm ?? bpm,
      duration: buf.duration, blob,
    };
    bufferCache.set(t.id, buf);
    await saveTrack(t);
    busy('');
    toast(`أُضيفت «${t.title}» · ${keyLabel(t.key, t.scale)} · ${t.bpm} BPM`, 3600);
    return t;
  } catch (err) {
    busy('');
    console.error(err);
    toast('ما قدرنا نقرأ الملف. جرّب MP3 أو WAV.');
  }
}

function editTrack(t) {
  const body = openSheet(`<h3>تعديل الأغنية</h3>${trackForm(t)}`);
  const form = $('#trackForm', body);
  form.onsubmit = async (e) => {
    e.preventDefault();
    Object.assign(t, {
      title: form.title.value.trim() || t.title,
      artist: form.artist.value.trim(),
      genre: form.genre.value,
      key: +form.key.value,
      scale: form.scale.value,
      bpm: Math.max(40, Math.min(240, +form.bpm.value || 100)),
      lrc: form.lrc.value.trim(),
    });
    await saveTrack(t);
    closeSheet();
    if (state.current?.id === t.id) loadStudioTrack(t);
    toast('تم الحفظ');
  };
}

// ---------------------------------------------------------------- الكتالوج
async function catalogSheet() {
  const body = openSheet(`<h3>كتالوج الموسيقى</h3><div id="catBody" class="muted">جاري التحميل…</div>`);
  const box = $('#catBody', body);
  let data;
  try {
    const res = await fetch(state.settings.catalogUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    box.innerHTML = `ما قدرنا نوصل للكتالوج. تأكد من الرابط في الإعدادات والاتصال بالإنترنت.`;
    return;
  }
  const items = data.tracks || [];
  if (!items.length) {
    box.innerHTML = `<p>الكتالوج فاضي حالياً.</p><p>أضف موسيقى للملف <b dir="ltr">catalog.json</b> (رابط الملف الصوتي + الاسم + الكلمات) وراح تظهر هنا لكل اللي يستخدمون التطبيق. ${data.updated ? `آخر تحديث: ${esc(data.updated)}` : ''}</p>`;
    return;
  }
  const have = new Set(state.tracks.map((t) => t.catalogId).filter(Boolean));
  box.className = '';
  box.innerHTML = items
    .map(
      (it, i) => `<div class="cat-item">${coverHTML(it, 'cover sm')}<div class="meta"><h3>${esc(it.title)}</h3><p>${esc(it.artist || '')} ${it.genre ? '· ' + esc(it.genre) : ''}</p></div>
      <button class="btn sm ${have.has(it.id) ? 'ghost' : 'primary'}" data-i="${i}" ${have.has(it.id) ? 'disabled' : ''}>${have.has(it.id) ? 'موجودة' : 'إضافة'}</button></div>`,
    )
    .join('');
  box.onclick = async (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeSheet();
    try {
      busy('جاري التنزيل…');
      const url = new URL(it.url, new URL(state.settings.catalogUrl, location.href)).href;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      let lrc = it.lrc || '';
      if (it.lrcUrl) lrc = await fetch(new URL(it.lrcUrl, url)).then((r) => r.text()).catch(() => '');
      await importAudio(blob, {
        title: it.title, artist: it.artist, genre: it.genre, lrc, catalogId: it.id,
        key: it.key != null ? (typeof it.key === 'number' ? it.key : NOTE_NAMES.indexOf(it.key)) : undefined,
        scale: it.scale, bpm: it.bpm,
      }, !!it.removeVocals);
    } catch (err) {
      busy('');
      toast('فشل التنزيل. تأكد أن الرابط يسمح بالتحميل (CORS).');
    }
  };
}

// ---------------------------------------------------------------- لوحة التحكم بالصوت
function slider(label, value, { min, max, step = 1, show = (v) => v, onInput }) {
  const w = el('label', 'ctl');
  w.innerHTML = `<div class="ctl-top"><span>${label}</span><output></output></div><input type="range" min="${min}" max="${max}" step="${step}">`;
  const inp = $('input', w), out = $('output', w);
  inp.value = value;
  out.textContent = show(+value);
  inp.oninput = () => {
    out.textContent = show(+inp.value);
    onInput(+inp.value);
  };
  return w;
}
function select(label, value, options, onChange) {
  const w = el('label', 'ctl-sel');
  w.innerHTML = `<span>${label}</span><select>${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
  const s = $('select', w);
  s.value = String(value);
  s.onchange = () => onChange(s.value);
  return w;
}
function toggle(label, value, onChange) {
  const w = el('label', 'ctl-sel');
  w.innerHTML = `<span>${label}</span><input type="checkbox" class="switch">`;
  const i = $('input', w);
  i.checked = !!value;
  i.onchange = () => onChange(i.checked);
  return w;
}
function group(title, ...kids) {
  const g = el('div', 'ctl-group');
  if (title) g.append(el('h4', '', title));
  g.append(...kids);
  return g;
}
const pct = (v) => Math.round(v) + '%';
const dB = (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
const semis = (v) => (v > 0 ? '+' : '') + v;

// يبني لوحة المؤثرات؛ نفس اللوحة للاستوديو وللميكسر
function voicePanel(p, onChange, music, onMusic, { onKey } = {}) {
  const root = el('div');
  const ch = () => onChange(p);
  function build() {
    root.innerHTML = '';
    const chips = el('div', 'chips scroll');
    for (const [id, pr] of Object.entries(PRESETS)) {
      const b = el('button', 'chip' + (p.preset === id ? ' active' : ''), esc(pr.name));
      b.onclick = () => {
        applyPreset(p, id);
        ch();
        build();
      };
      chips.append(b);
    }
    root.append(chips);
    const custom = () => {
      if (p.preset !== 'custom') {
        p.preset = 'custom';
        $$('.chip', chips).forEach((c) => c.classList.remove('active'));
      }
    };
    const set = (fn) => (v) => {
      fn(v);
      custom();
      ch();
    };

    root.append(
      group(
        '',
        slider('تصحيح النغمة', p.tune.strength * 100, { min: 0, max: 100, show: pct, onInput: set((v) => (p.tune.strength = v / 100)) }),
        slider('سرعة التصحيح', p.tune.speed, { min: 0, max: 200, show: (v) => (v <= 1 ? 'فوري (أوتوتيون)' : v + ' ms'), onInput: set((v) => (p.tune.speed = v)) }),
        slider('الريفيرب (الفخامة)', p.reverb * 100, { min: 0, max: 100, show: pct, onInput: set((v) => (p.reverb = v / 100)) }),
        slider('مستوى صوتي', p.volume * 100, { min: 0, max: 200, show: pct, onInput: (v) => ((p.volume = v / 100), ch()) }),
        slider('مستوى الموسيقى', music.vol * 100, { min: 0, max: 150, show: pct, onInput: (v) => ((music.vol = v / 100), onMusic(music)) }),
      ),
    );

    const adv = el('details', 'adv');
    adv.innerHTML = '<summary>تحكم احترافي</summary>';
    const keyOpts = NOTE_NAMES.map((n, i) => [i, `${n} · ${NOTE_NAMES_AR[i]}`]);
    const scaleOpts = Object.entries(SCALES).map(([k, s]) => [k, s.name]);
    const onKeyChange = () => {
      ch();
      onKey && onKey(p.tune.key, p.tune.scale);
    };
    adv.append(
      group(
        'النغمة والمقام',
        toggle('تفعيل تصحيح النغمة', p.tune.enabled, (v) => ((p.tune.enabled = v), ch())),
        select('المقام', p.tune.key, keyOpts, (v) => ((p.tune.key = +v), onKeyChange())),
        select('السلم', p.tune.scale, scaleOpts, (v) => ((p.tune.scale = v), onKeyChange())),
        slider('رفع/خفض صوتي', p.tune.transpose, { min: -12, max: 12, show: semis, onInput: (v) => ((p.tune.transpose = v), ch()) }),
        select('هارموني (صوت ثاني)', p.tune.harmony, HARMONY.map((h, i) => [i, h]), set((v) => (p.tune.harmony = +v))),
        slider('مستوى الهارموني', p.tune.harmonyMix * 100, { min: 0, max: 100, show: pct, onInput: set((v) => (p.tune.harmonyMix = v / 100)) }),
      ),
      group(
        'المعادل (EQ)',
        slider('قص الترددات المنخفضة', p.eq.hpf, { min: 40, max: 400, step: 5, show: (v) => v + ' Hz', onInput: set((v) => (p.eq.hpf = v)) }),
        slider('الدفء', p.eq.low, { min: -8, max: 8, step: 0.5, show: dB, onInput: set((v) => (p.eq.low = v)) }),
        slider('الحضور والوضوح', p.eq.presence, { min: -6, max: 9, step: 0.5, show: dB, onInput: set((v) => (p.eq.presence = v)) }),
        slider('اللمعان', p.eq.air, { min: -6, max: 9, step: 0.5, show: dB, onInput: set((v) => (p.eq.air = v)) }),
      ),
      group(
        'القوة والعرض',
        slider('الضغط (كومبرسر)', p.comp * 100, { min: 0, max: 100, show: pct, onInput: set((v) => (p.comp = v / 100)) }),
        slider('دبل (عرض ستيريو)', p.doubler * 100, { min: 0, max: 100, show: pct, onInput: set((v) => (p.doubler = v / 100)) }),
      ),
      group(
        'المكان والصدى',
        select('نوع المكان', p.reverbType, REVERB_TYPES, set((v) => (p.reverbType = v))),
        slider('الصدى (إيكو)', p.echo * 100, { min: 0, max: 100, show: pct, onInput: set((v) => (p.echo = v / 100)) }),
        select('توقيت الصدى', p.echoNote, ECHO_NOTES, set((v) => (p.echoNote = +v))),
        slider('تكرار الصدى', p.echoFeedback * 100, { min: 0, max: 85, show: pct, onInput: set((v) => (p.echoFeedback = v / 100)) }),
      ),
      group(
        'الموسيقى',
        slider('طبقة الموسيقى (تجريبي)', music.semis || 0, { min: -6, max: 6, show: semis, onInput: (v) => ((music.semis = v), onMusic(music)) }),
      ),
    );
    root.append(adv);
  }
  build();
  root.rebuild = build;
  return root;
}

// ---------------------------------------------------------------- الاستوديو
const pitch = { hist: [], voiced: 0, inTune: 0, center: 60, level: 0 };
let lyricLines = [];
let lyricIdx = -2;
let panel = null;
let syncState = null;

async function ensureSession() {
  await engine.ensure();
  if (!session) {
    session = new StudioSession(engine);
    session.onPitch = onPitch;
    session.onEnded = () => {
      if (session.recording) finishRecording();
      if (syncState) finishSync();
      updatePlayBtn();
    };
  }
  return session;
}

async function openTrack(t) {
  const ready = engine.ensure(); // ضمن ضغطة المستخدم
  go('studio');
  try {
    if (session?.recording) await finishRecording();
    busy(t.demo ? 'نجهّز الموسيقى…' : 'نحمّل الموسيقى…');
    await ready;
    const s = await ensureSession();
    const buf = await getBuffer(t);
    state.current = t;
    s.setBuffer(buf, t.bpm);
    loadStudioTrack(t);
    busy('');
  } catch (err) {
    busy('');
    console.error(err);
    toast('صار خطأ في تحميل الموسيقى');
  }
}

function loadStudioTrack(t) {
  $('#studioEmpty').hidden = true;
  $('#studioMain').hidden = false;
  $('#stCover').outerHTML = coverHTML(t, 'cover sm').replace('class=', 'id="stCover" class=');
  $('#stTitle').textContent = t.title;
  $('#stArtist').textContent = [t.artist, t.genre].filter(Boolean).join(' · ');
  state.voice.tune.key = t.key;
  state.voice.tune.scale = t.scale;
  state.music = { vol: t.musicVol ?? 0.85, semis: t.semis || 0 };
  session.setVoice(state.voice);
  session.setMusic(state.music);
  session.bpm = t.bpm;
  updateKeyPill();
  lyricLines = parseLRC(t.lrc);
  if (!lyricLines.length && t.lrc) {
    // كلمات بدون توقيت: نوزعها مبدئياً على طول الأغنية
    const lines = plainLines(t.lrc);
    const span = (t.duration || 60) - 10;
    lyricLines = lines.map((text, i) => ({ t: 5 + (i * span) / lines.length, text }));
  }
  lyricIdx = -2;
  $('#tDur').textContent = fmt(session.duration);
  requestAnimationFrame(sizeCanvas);
  renderPanel();
  resetScore();
}

function renderPanel() {
  panel = voicePanel(
    state.voice,
    (p) => {
      session && session.setVoice(p);
      saveVoice();
    },
    state.music,
    async (m) => {
      session && session.setMusic(m);
      const t = state.current;
      if (t) {
        t.musicVol = m.vol;
        t.semis = m.semis;
        clearTimeout(renderPanel.timer);
        renderPanel.timer = setTimeout(() => db.put('tracks', t), 500);
      }
    },
    {
      onKey: (key, scale) => {
        const t = state.current;
        if (!t) return;
        t.key = key;
        t.scale = scale;
        db.put('tracks', t);
        updateKeyPill();
        renderLibrary();
      },
    },
  );
  $('#studioControls').replaceChildren(panel);
}

function updateKeyPill() {
  $('#stKey').textContent = keyLabel(state.voice.tune.key, state.voice.tune.scale);
}

function closeStudio() {
  if (session) session.stop();
  state.current = null;
  $('#studioEmpty').hidden = false;
  $('#studioMain').hidden = true;
}

function updatePlayBtn() {
  const b = $('#btnPlay');
  const playing = session?.playing;
  b.innerHTML = icon(playing ? 'pause' : 'play');
  b.title = playing ? 'إيقاف مؤقت' : 'تشغيل';
}

async function togglePlay() {
  if (!state.current) return;
  await engine.ensure();
  if (session.recording) return finishRecording();
  if (syncState) return cancelSync();
  session.playing ? session.pause() : session.play();
  updatePlayBtn();
}

async function enableMic() {
  try {
    await session.enableMic(state.settings.headphones);
    $('#micHint').hidden = true;
    return true;
  } catch (err) {
    console.error(err);
    toast('نحتاج إذن المايك. فعّله من إعدادات المتصفح.', 4000);
    return false;
  }
}

async function toggleMonitor() {
  if (!state.current) return;
  await engine.ensure();
  const on = !state.settings.monitor;
  if (on && !(await enableMic())) return;
  if (on && !state.settings.headphones) toast('المايك شغال لتحليل نغمتك. عشان تسمع صوتك بالمؤثرات فعّل «أستخدم سماعات» من الإعدادات.', 4500);
  state.settings.monitor = on;
  saveSettings();
  session.setMonitor(on && state.settings.headphones);
  $('#btnMon').classList.toggle('on', on);
}

function resetScore() {
  pitch.voiced = 0;
  pitch.inTune = 0;
  pitch.hist = [];
  $('#scoreNow').textContent = '';
}

function onPitch(d) {
  const now = performance.now();
  pitch.level = d.l;
  if (d.m) {
    pitch.center += (d.m - pitch.center) * 0.05;
    pitch.hist.push({ t: now, m: d.m, tg: d.t });
    $('#noteNow').textContent = midiName(d.t || d.m);
    if (session.recording) {
      pitch.voiced++;
      const steps = (SCALES[state.voice.tune.scale] || SCALES.major).steps;
      if (Math.abs(d.m - nearestInScale(d.m, state.voice.tune.key, steps)) < 0.3) pitch.inTune++;
      if (pitch.voiced > 10) $('#scoreNow').textContent = `دقة النغمة ${Math.round((100 * pitch.inTune) / pitch.voiced)}%`;
    }
  } else {
    pitch.hist.push({ t: now, m: 0 });
  }
  while (pitch.hist.length && now - pitch.hist[0].t > 7000) pitch.hist.shift();
}

async function toggleRecord() {
  if (!state.current) return;
  await engine.ensure();
  if (session.recording) return finishRecording();
  if (syncState) cancelSync();
  if (!(await enableMic())) return;
  if (!state.settings.headphones) session.setMonitor(false);
  resetScore();
  session.startRecording(engine.latency(state.settings));
  $('#btnRec').classList.add('on');
  $('#btnRec').innerHTML = icon('stop');
  $('#recBadge').hidden = false;
  $('#seek').disabled = true;
  updatePlayBtn();
}

let finishing = false;
async function finishRecording() {
  if (finishing || !session?.recording) return;
  finishing = true;
  try {
    const data = await session.stopRecording();
    $('#btnRec').classList.remove('on');
    $('#btnRec').innerHTML = icon('rec');
    $('#recBadge').hidden = true;
    $('#seek').disabled = false;
    updatePlayBtn();
    if (!data || data.pcm.length < data.sr * 2) {
      toast('التسجيل قصير جداً');
      return;
    }
    const t = state.current;
    const score = pitch.voiced > 20 ? Math.round((100 * pitch.inTune) / pitch.voiced) : null;
    const take = {
      id: uid(),
      trackId: t.id,
      trackTitle: t.title,
      artist: t.artist,
      createdAt: Date.now(),
      sr: data.sr,
      pcm: floatToInt16(data.pcm).buffer,
      length: data.pcm.length,
      vocalStartPos: data.vocalStartPos,
      musicStartPos: data.musicStartPos,
      bpm: t.bpm,
      params: clone(state.voice),
      music: clone(state.music),
      nudge: 0,
      score,
    };
    await db.put('takes', take);
    state.takes.unshift(take);
    renderTakes();
    resultSheet(take);
  } finally {
    finishing = false;
  }
}

function scoreWord(s) {
  if (s == null) return 'سجّلنا صوتك';
  if (s >= 90) return 'أداء نجم! 🌟';
  if (s >= 75) return 'ممتاز جداً 👏';
  if (s >= 60) return 'حلو! شوي تمرين وتوصل';
  return 'بداية حلوة، كرر وراح تتحسن';
}

function resultSheet(take) {
  const body = openSheet(`<div class="result">
    <div class="big-score">${take.score != null ? take.score + '%' : '✓'}</div>
    <h3>${scoreWord(take.score)}</h3>
    <p>${take.score != null ? 'دقة النغمة قبل التصحيح. ' : ''}تقدر الحين تسمع التسجيل وتعدّل المؤثرات وتصدّره.</p>
    <div class="btn-row"><button class="btn" data-a="again">تسجيل جديد</button><button class="btn primary" data-a="mix">اسمع وعدّل</button></div>
  </div>`);
  body.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    closeSheet();
    if (a === 'mix') openMixer(take);
    if (a === 'again') {
      session.seek(take.musicStartPos);
    }
  };
}

// ---------- الكلمات والمزامنة
function lyricsSheet() {
  const t = state.current;
  if (!t) return;
  const lines = lyricLines.length ? lyricLines.map((l) => l.text).filter((x) => !/^♪/.test(x)) : plainLines(t.lrc);
  const body = openSheet(`<h3>كلمات الأغنية</h3>
    <p class="muted">اكتب كل سطر في سطر مستقل، بعدين اضغط «زامن بالنقر»: نشغّل الموسيقى وأنت تضغط عند بداية كل سطر.</p>
    <textarea id="lyText" class="field" placeholder="السطر الأول&#10;السطر الثاني">${esc(lines.join('\n'))}</textarea>
    <div class="btn-row"><button class="btn" data-a="save">حفظ بدون توقيت</button><button class="btn primary" data-a="sync">زامن بالنقر</button></div>`);
  body.onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const ls = plainLines($('#lyText', body).value);
    if (!ls.length) return toast('اكتب الكلمات أولاً');
    closeSheet();
    if (a === 'save') {
      t.lrc = ls.join('\n');
      await saveTrack(t);
      loadStudioTrack(t);
      toast('حُفظت الكلمات');
    } else startSync(ls);
  };
}

async function startSync(lines) {
  await engine.ensure();
  syncState = { lines, times: [], idx: 0 };
  $('#lyrics').classList.add('syncing');
  $('#syncTap').hidden = false;
  session.play(0);
  updatePlayBtn();
  renderSyncLine();
}

function renderSyncLine() {
  const s = syncState;
  $('.l-prev').textContent = s.idx > 0 ? s.lines[s.idx - 1] : 'المزامنة: اضغط الزر لما يبدأ كل سطر';
  $('.l-cur span').textContent = s.lines[s.idx] || '';
  $('.l-cur span').style.setProperty('--p', '0%');
  $('.l-next').textContent = s.lines[s.idx + 1] || '';
  $('#syncTap').textContent = `ابدأ السطر ${s.idx + 1} من ${s.lines.length}`;
}

function syncTap() {
  const s = syncState;
  if (!s) return;
  s.times[s.idx] = Math.max(0, session.position - 0.15);
  s.idx++;
  if (s.idx >= s.lines.length) return finishSync();
  renderSyncLine();
}

async function finishSync() {
  const s = syncState;
  syncState = null;
  $('#lyrics').classList.remove('syncing');
  $('#syncTap').hidden = true;
  session.pause();
  updatePlayBtn();
  if (!s.times.length) return;
  const t = state.current;
  const timed = s.lines.map((text, i) => ({ t: s.times[i] ?? s.times[s.times.length - 1] + 3 * (i - s.times.length + 1), text }));
  t.lrc = toLRC(timed);
  await saveTrack(t);
  loadStudioTrack(t);
  toast('تمت مزامنة الكلمات ✓');
}

function cancelSync() {
  syncState.lines = syncState.lines.slice(0, syncState.times.length);
  finishSync();
}

function updateLyrics(pos) {
  if (syncState) return;
  if (!lyricLines.length) {
    if (lyricIdx !== -3) {
      lyricIdx = -3;
      $('.l-prev').textContent = '';
      $('.l-cur span').textContent = '♪';
      $('.l-next').textContent = 'ما فيه كلمات. اضغط ✍ لإضافتها';
    }
    return;
  }
  let i = -1;
  for (let k = 0; k < lyricLines.length; k++) if (lyricLines[k].t <= pos + 0.05) i = k;
  if (i !== lyricIdx) {
    lyricIdx = i;
    $('.l-prev').textContent = i > 0 ? lyricLines[i - 1].text : '';
    $('.l-cur span').textContent = i >= 0 ? lyricLines[i].text : '…';
    $('.l-next').textContent = lyricLines[i + 1]?.text || '';
  }
  if (i >= 0) {
    const a = lyricLines[i].t;
    const b = lyricLines[i + 1]?.t ?? a + 4;
    const p = Math.max(0, Math.min(1, (pos - a) / Math.max(0.5, (b - a) * 0.85)));
    $('.l-cur span').style.setProperty('--p', (p * 100).toFixed(1) + '%');
  }
}

// ---------- رسم النغمة
let cvs, cx, cw = 0, chh = 0;
function sizeCanvas() {
  cvs = $('#pitchCanvas');
  const r = cvs.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cvs.width = r.width * dpr;
  cvs.height = r.height * dpr;
  cw = r.width;
  chh = r.height;
  cx = cvs.getContext('2d');
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawPitch() {
  if (!cx || !cw) sizeCanvas();
  if (!cx || !cw) return;
  const now = performance.now();
  const span = 6000;
  const range = 16;
  const lo = pitch.center - range / 2;
  const y = (m) => chh - ((m - lo) / range) * chh;
  cx.clearRect(0, 0, cw, chh);
  const steps = (SCALES[state.voice.tune.scale] || SCALES.major).steps;
  const key = state.voice.tune.key;
  cx.font = '10px system-ui';
  cx.textAlign = 'left';
  for (let o = Math.floor((lo - key) / 12) - 1; o <= Math.ceil((lo + range - key) / 12); o++) {
    steps.forEach((s, i) => {
      const m = key + 12 * o + s;
      if (m < lo || m > lo + range) return;
      const yy = y(m);
      cx.fillStyle = i === 0 ? 'rgba(0,255,102,0.13)' : 'rgba(0,255,102,0.035)';
      cx.fillRect(0, yy - 5, cw, 10);
      cx.fillStyle = 'rgba(0,255,102,0.4)';
      cx.fillText(midiName(m), 6, yy + 3);
    });
  }
  // الخط من اليمين لليسار يناسب الواجهة العربية: الأحدث يمين
  const xOf = (t) => cw - 12 - ((now - t) / span) * (cw - 40);
  const line = (key2, color, width) => {
    cx.strokeStyle = color;
    cx.lineWidth = width;
    cx.lineJoin = 'round';
    cx.beginPath();
    let pen = false;
    for (const p of pitch.hist) {
      const m = p[key2];
      if (!m) {
        pen = false;
        continue;
      }
      const X = xOf(p.t), Y = y(m);
      if (!pen) cx.moveTo(X, Y);
      else cx.lineTo(X, Y);
      pen = true;
    }
    cx.stroke();
  };
  line('m', 'rgba(227,255,233,0.35)', 2);
  cx.shadowColor = '#00ff66';
  cx.shadowBlur = 10;
  if (state.voice.tune.enabled) line('tg', '#00ff66', 3.5);
  cx.shadowBlur = 0;
}

function frame() {
  requestAnimationFrame(frame);
  if (state.tab !== 'studio' || !session || !state.current) return;
  const pos = session.position;
  $('#tCur').textContent = fmt(pos);
  if (!seeking && session.duration) $('#seek').value = Math.round((pos / session.duration) * 1000);
  if (session.recording) $('#recTime').textContent = fmt(pos - (session.rec?.pos || 0));
  updateLyrics(pos);
  drawPitch();
  const lvl = pitch.level > 0 ? Math.max(0, (20 * Math.log10(pitch.level) + 54) / 54) : 0;
  $('#meterFill').style.width = Math.min(100, lvl * 100) + '%';
}
let seeking = false;

// ---------------------------------------------------------------- التسجيلات والميكسر
function renderTakes() {
  const box = $('#takeList');
  if (!state.takes.length) {
    box.innerHTML = `<div class="empty"><div class="empty-ico">${icon('wave')}</div><h3>ما عندك تسجيلات للحين</h3><p>افتح الاستوديو واضغط زر التسجيل الأحمر.</p></div>`;
    return;
  }
  box.innerHTML = state.takes
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((k) => {
      const d = new Date(k.createdAt);
      return `<article class="take" data-id="${k.id}">
        <div class="score" style="--s:${k.score ?? 0}"><b>${k.score != null ? k.score : '♪'}</b></div>
        <div class="meta"><h3>${esc(k.trackTitle)}</h3>
        <p>${d.toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })} · ${fmt(k.length / k.sr)}</p>
        <div class="tags"><span class="hl">${esc(PRESETS[k.params.preset]?.name || 'مخصص')}</span></div></div>
        <button class="icon-btn" data-act="menu" aria-label="خيارات">${icon('more')}</button>
      </article>`;
    })
    .join('');
}

let player = null;
async function openMixer(take) {
  const ready = engine.ensure();
  const track = state.tracks.find((t) => t.id === take.trackId);
  if (!track) return toast('الموسيقى الأصلية لهذا التسجيل انحذفت من المكتبة');
  try {
    busy('نجهّز الميكسر…');
    await ready;
    if (session) {
      if (session.recording) await finishRecording();
      session.pause();
      updatePlayBtn();
    }
    const buf = await getBuffer(track);
    take.params = normalizeVoice(take.params);
    player = new TakePlayer(engine, take, buf);
    busy('');
  } catch (err) {
    busy('');
    console.error(err);
    return toast('ما قدرنا نفتح التسجيل');
  }
  const lines = parseLRC(track.lrc);
  const wrap = el('div');
  wrap.innerHTML = `<div class="sheet-head"><div class="meta"><h3>${esc(take.trackTitle)}</h3><p class="muted">عدّل الصوت براحتك — التغيير مباشر</p></div>
    <button class="icon-btn" data-a="close" aria-label="إغلاق">${icon('close')}</button></div>
    <div class="mix-transport"><button class="round big" data-a="play">${icon('play')}</button>
    <div class="seek"><span data-r="cur">0:00</span><input type="range" min="0" max="1000" value="0" data-r="seek"><span data-r="dur"></span></div></div>
    <div class="mix-lyric" data-r="lyric"></div>`;
  const sync = group(
    'التزامن',
    slider('تقديم/تأخير صوتي', (take.nudge || 0) * 1000, { min: -300, max: 300, step: 5, show: (v) => (v > 0 ? '+' : '') + v + ' ms', onInput: (v) => ((take.nudge = v / 1000), player.playing && player.seek(player.position)) }),
  );
  const pnl = voicePanel(take.params, () => player.update(), take.music, () => player.update());
  const actions = el('div', 'btn-row');
  actions.innerHTML = `<button class="btn" data-a="del">${icon('trash')}</button><button class="btn" data-a="share">${icon('share')}مشاركة</button><button class="btn primary" data-a="export">${icon('download')}تصدير</button>`;
  wrap.append(sync, pnl, actions);

  const save = () => db.put('takes', take).then(renderTakes);
  let raf;
  const body = openSheet(wrap, {
    full: true,
    onClose: () => {
      cancelAnimationFrame(raf);
      player.dispose();
      player = null;
      save();
    },
  });
  const r = (n) => $(`[data-r="${n}"]`, body);
  const playBtn = $('[data-a="play"]', body);
  r('dur').textContent = fmt(player.end - player.start);
  const seekEl = r('seek');
  let dragging = false;
  seekEl.oninput = () => (dragging = true);
  seekEl.onchange = () => {
    dragging = false;
    player.seek(player.start + (seekEl.value / 1000) * (player.end - player.start));
  };
  player.onEnded = () => (playBtn.innerHTML = icon('play'));
  let li = -2;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!player) return;
    const pos = player.position;
    r('cur').textContent = fmt(pos - player.start);
    if (!dragging) seekEl.value = Math.round(((pos - player.start) / (player.end - player.start)) * 1000);
    let i = -1;
    for (let k = 0; k < lines.length; k++) if (lines[k].t <= pos) i = k;
    if (i !== li) {
      li = i;
      r('lyric').textContent = i >= 0 ? lines[i].text : '';
    }
  };
  tick();

  body.onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'close') closeSheet();
    if (a === 'play') {
      await engine.ensure();
      player.playing ? player.pause() : player.play();
      playBtn.innerHTML = icon(player.playing ? 'pause' : 'play');
    }
    if (a === 'del') {
      if (!confirm('حذف هذا التسجيل نهائياً؟')) return;
      closeSheet();
      await db.del('takes', take.id);
      state.takes = state.takes.filter((x) => x.id !== take.id);
      renderTakes();
      toast('تم الحذف');
    }
    if (a === 'export' || a === 'share') {
      player.pause();
      playBtn.innerHTML = icon('play');
      await save();
      await exportTake(take, track, a === 'share');
    }
  };
}

async function exportTake(take, track, share) {
  try {
    busy('ميكساج احترافي… لحظات');
    const buf = await getBuffer(track);
    const blob = await renderMix(take, buf);
    busy('');
    const name = `${take.trackTitle} - FAYEX.wav`.replace(/[\\/:*?"<>|]/g, '');
    const file = new File([blob], name, { type: 'audio/wav' });
    if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: take.trackTitle, text: 'سجلتها في FAYEX Studio 🎤' });
      } catch (e) {}
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast(share ? 'المشاركة غير مدعومة هنا، نزّلنا الملف بدلها' : 'تم التصدير ✓');
  } catch (err) {
    busy('');
    console.error(err);
    toast('صار خطأ أثناء التصدير');
  }
}

function takeMenu(take) {
  const body = openSheet(`<h3>${esc(take.trackTitle)}</h3><div class="menu-list">
    <button data-a="open">${icon('sliders')}افتح الميكسر</button>
    <button data-a="export">${icon('download')}تصدير WAV</button>
    <button data-a="del" class="danger">${icon('trash')}حذف</button></div>`);
  body.onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    closeSheet();
    const track = state.tracks.find((t) => t.id === take.trackId);
    if (a === 'open') openMixer(take);
    if (a === 'export') {
      if (!track) return toast('الموسيقى الأصلية انحذفت');
      take.params = normalizeVoice(take.params);
      exportTake(take, track, false);
    }
    if (a === 'del' && confirm('حذف هذا التسجيل نهائياً؟')) {
      await db.del('takes', take.id);
      state.takes = state.takes.filter((x) => x.id !== take.id);
      renderTakes();
    }
  };
}

// ---------------------------------------------------------------- الإعدادات
function renderSettings() {
  const s = state.settings;
  $('#setHeadphones').checked = s.headphones;
  $('#setCatalog').value = s.catalogUrl;
  $('#setName').value = s.displayName;
  $('#brandName').textContent = s.displayName;
  $('#setLatency').value = s.latencyMs ?? 40;
  $('#latencyOut').textContent = s.latencyMs == null ? 'تلقائي' : s.latencyMs + ' ms';
  if (navigator.storage?.estimate) {
    navigator.storage.estimate().then((e) => {
      $('#storageOut').textContent = `${(e.usage / 1048576).toFixed(0)} MB مستخدم`;
    });
  }
}

function bindSettings() {
  $('#setHeadphones').onchange = (e) => {
    state.settings.headphones = e.target.checked;
    saveSettings();
    if (session?.micReady) session.disableMic();
    $('#micHint').hidden = false;
    state.settings.monitor = false;
    $('#btnMon').classList.remove('on');
  };
  $('#setLatency').oninput = (e) => {
    state.settings.latencyMs = +e.target.value;
    $('#latencyOut').textContent = e.target.value + ' ms';
    saveSettings();
  };
  $('#btnLatencyAuto').onclick = () => {
    state.settings.latencyMs = null;
    saveSettings();
    renderSettings();
  };
  $('#btnCalibrate').onclick = async () => {
    if (session?.micReady) session.disableMic();
    busy('نقيس التأخير… خلّك هادي');
    try {
      const lat = await calibrateLatency(engine);
      state.settings.latencyMs = Math.round(lat * 1000);
      saveSettings();
      renderSettings();
      busy('');
      toast(`تأخير جهازك ${state.settings.latencyMs} ms ✓`);
    } catch (err) {
      busy('');
      toast(err.message === 'not-heard' ? 'ما سمعنا النقرات. ارفع الصوت وشيل السماعات وجرب مرة ثانية.' : 'تعذر القياس، تأكد من إذن المايك.', 4500);
    }
    $('#micHint').hidden = false;
  };
  $('#setName').onchange = (e) => {
    state.settings.displayName = e.target.value.trim().toUpperCase().slice(0, 14) || 'FAYEX';
    saveSettings();
    renderSettings();
    hero && hero.refresh();
  };
  $('#setCatalog').onchange = (e) => {
    state.settings.catalogUrl = e.target.value.trim() || './catalog.json';
    saveSettings();
  };
  $('#btnPersist').onclick = async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'بياناتك محمية ✓' : 'المتصفح ما سمح. ثبّت التطبيق على الشاشة الرئيسية وجرب.');
  };
  $('#btnReset').onclick = async () => {
    if (!confirm('مسح كل الموسيقى والتسجيلات والإعدادات؟ ما تقدر ترجعها.')) return;
    await db.clear('tracks');
    await db.clear('takes');
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('nagham.')).forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    location.reload();
  };
}

// ---------------------------------------------------------------- البداية
async function seedDemos() {
  let i = 0;
  for (const [id, d] of Object.entries(DEMOS)) {
    const bars = d.intro + d.body + d.outro;
    await db.put('tracks', {
      id: 'demo-' + id,
      demo: id,
      title: d.title,
      artist: d.artist,
      genre: d.genre,
      key: d.key,
      scale: d.scale,
      bpm: d.bpm,
      duration: (bars * 240) / d.bpm + 3,
      lrc: demoLRC(id),
      fav: false,
      createdAt: 1 + i++,
    });
  }
  state.settings.seeded = true;
  saveSettings();
}

function bind() {
  paintIcons();
  $$('.tabbar button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  $$('[data-goto]').forEach((b) => (b.onclick = () => go(b.dataset.goto)));
  $('#sheet').addEventListener('click', (e) => e.target.matches('[data-close]') && closeSheet());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());

  $('#search').oninput = (e) => {
    state.query = e.target.value;
    renderLibrary();
  };
  $('#genreChips').onclick = (e) => {
    const f = e.target.closest('[data-filter]')?.dataset.filter;
    if (!f) return;
    state.filter = f;
    renderLibrary();
  };
  $('#trackList').onclick = async (e) => {
    const card = e.target.closest('.track');
    if (!card) return;
    const t = state.tracks.find((x) => x.id === card.dataset.id);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'fav') {
      t.fav = !t.fav;
      await saveTrack(t);
    } else if (act === 'menu') trackMenu(t);
    else openTrack(t);
  };
  $('#btnImport').onclick = () => importSheet();
  $('#btnCatalog').onclick = catalogSheet;

  $('#btnPlay').onclick = togglePlay;
  $('#btnRec').onclick = toggleRecord;
  $('#btnMon').onclick = toggleMonitor;
  $('#btnBack').onclick = () => {
    if (session?.recording) return;
    session?.seek(0);
  };
  $('#btnSync').onclick = lyricsSheet;
  $('#syncTap').onclick = syncTap;
  $('#stKey').onclick = () => {
    const adv = $('#studioControls details.adv');
    if (adv) {
      adv.open = true;
      adv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const seek = $('#seek');
  seek.oninput = () => {
    seeking = true;
    $('#tCur').textContent = fmt((seek.value / 1000) * (session?.duration || 0));
  };
  seek.onchange = () => {
    seeking = false;
    session?.seek((seek.value / 1000) * session.duration);
  };

  $('#takeList').onclick = (e) => {
    const card = e.target.closest('.take');
    if (!card) return;
    const k = state.takes.find((x) => x.id === card.dataset.id);
    if (e.target.closest('[data-act="menu"]')) takeMenu(k);
    else openMixer(k);
  };

  $('#btnWelcome').onclick = () => {
    engine.ensure();
    state.settings.welcomed = true;
    saveSettings();
    $('#welcome').hidden = true;
  };
  $('#btnMon').classList.toggle('on', false);
  state.settings.monitor = false;
  bindSettings();
  window.addEventListener('resize', sizeCanvas);
}

let hero = null;
async function init() {
  bind();
  hero = initHero(() => state.settings.displayName);
  try {
    if (!state.settings.seeded) await seedDemos();
    state.tracks = await db.all('tracks');
    state.takes = await db.all('takes');
  } catch (err) {
    console.error(err);
    toast('التخزين غير متاح في هذا الوضع (تصفح خفي؟)', 5000);
  }
  renderLibrary();
  renderTakes();
  renderSettings();
  if (!state.settings.welcomed) $('#welcome').hidden = false;
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
