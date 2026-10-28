// صفحة الأذكار: تضغط على الذكر فينقص العدد، ويتحفظ التقدّم لليوم
import { store, load, persist, dayKey } from './store.js';
import { $, h, icon, n, esc, sizeButtons, ripple, vibrate, click, chime, bloom, toast, shareText } from './ui.js';
import { AZKAR, BASMALA } from './azkar-data.js';

let root, cat = null, list, prog;

function progKey(c) { return `az.${c}`; }
function getProg(c) {
  const p = load(progKey(c), null);
  if (!p || p.day !== dayKey()) return { day: dayKey(), counts: {} };
  return p;
}

export function azkarProgress(c) {
  const p = getProg(c);
  const items = AZKAR[c].items;
  let doneCount = 0;
  items.forEach((z, i) => { if ((p.counts[i] || 0) >= z.n) doneCount++; });
  return { count: doneCount, total: items.length, pct: Math.round((doneCount / items.length) * 100), done: doneCount === items.length };
}

export function defaultCat() {
  const h = new Date().getHours();
  return h >= 3 && h < 14 ? 'morning' : 'evening';
}

export function initAzkar() {
  root = $('#view-azkar');
  root.innerHTML = `
    <div class="segmented" role="tablist">
      <button type="button" data-cat="morning">${icon('sunmoon')} الصباح</button>
      <button type="button" data-cat="evening">${icon('crescent')} المساء</button>
    </div>
    <div class="chips" id="azMore">
      <button class="chip" type="button" data-cat="prayer">بعد الصلاة</button>
      <button class="chip" type="button" data-cat="sleep">أذكار النوم</button>
      <button class="chip" type="button" data-cat="waking">الاستيقاظ</button>
    </div>
    <div class="az-progress">
      <div class="az-progress-row"><span id="azTitle"></span><span class="az-right">${sizeButtons()}<span id="azCount" class="num"></span></span></div>
      <div class="bar"><i id="azBar"></i></div>
    </div>
    <div id="azList"></div>
    <div class="btn-row" style="margin-top:10px"><button class="btn" id="azReset" type="button">${icon('reset')} إعادة الأذكار من البداية</button></div>
  `;
  list = $('#azList');
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => show(b.dataset.cat)));
  $('#azReset').addEventListener('click', () => {
    if (!confirm('تبغى تبدأ الأذكار من جديد؟')) return;
    prog = { day: dayKey(), counts: {} };
    persist(progKey(cat), prog);
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
  });
}

export function show(c = cat || defaultCat()) {
  cat = c;
  root.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('active', b.dataset.cat === c));
  prog = getProg(c);
  render();
}

function quranBlock(z) {
  if (z.suras) {
    return `<div class="zikr-q">${z.suras.map((s) => `<h4>${s.title}</h4><span class="basmala">${BASMALA}</span>${s.q}`).join('')}</div>`;
  }
  return `<div class="zikr-q">${z.q}</div>`;
}

function render() {
  const data = AZKAR[cat];
  $('#azTitle').textContent = data.title;
  list.innerHTML = '';
  data.items.forEach((z, i) => {
    const done = prog.counts[i] || 0;
    const left = Math.max(0, z.n - done);
    const card = h(`
      <article class="zikr ${left === 0 ? 'done' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="اضغط للعدّ">
        ${z.title ? `<p class="zikr-title">${esc(z.title)}</p>` : ''}
        ${z.pre ? `<p class="zikr-pre">${esc(z.pre)}</p>` : ''}
        ${z.q || z.suras ? quranBlock(z) : `<p class="zikr-text">${esc(z.t)}</p>`}
        ${z.note ? `<p class="zikr-note">${esc(z.note)}</p>` : ''}
        ${z.f ? `<p class="zikr-f"><b>فضله:</b> ${esc(z.f)}</p>` : ''}
        <div class="zikr-foot">
          <div>
            <div class="zikr-src">${esc(z.src || '')}</div>
            <div class="zikr-actions" style="margin-top:6px">
              <button class="mini" data-act="share" type="button" aria-label="مشاركة">${icon('share')}</button>
              ${z.n > 1 ? `<button class="mini" data-act="undo" type="button" aria-label="تراجع">${icon('undo')}</button>` : ''}
            </div>
          </div>
          <div class="counter" aria-live="polite">${left === 0 ? `${icon('check')}` : `<b class="num">${n(left)}</b><span>${z.n > 1 ? `من ${n(z.n)}` : 'مرة'}</span>`}</div>
        </div>
      </article>`);
    card.addEventListener('click', (e) => onTap(e, card, z, i));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(e, card, z, i); } });
    list.append(card);
  });
  updateBar();
}

function onTap(e, card, z, i) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'share') {
    const text = (z.pre ? z.pre + '\n' : '') + (z.t || z.q || z.suras.map((s) => s.q).join('\n')) + (z.n > 1 ? `\n(${z.n} مرات)` : '');
    shareText(text + '\n\n— من تطبيق سكينة');
    return;
  }
  if (act === 'undo') {
    prog.counts[i] = Math.max(0, (prog.counts[i] || 0) - 1);
    save(); updateCard(card, z, i);
    return;
  }
  const done = prog.counts[i] || 0;
  if (done >= z.n) return;
  ripple(card, e);
  prog.counts[i] = done + 1;
  save();
  if (store.get('tasbihSound')) click(prog.counts[i] >= z.n ? 1200 : 760);
  vibrate(prog.counts[i] >= z.n ? [30, 60, 30] : 18);
  updateCard(card, z, i);
  if (prog.counts[i] >= z.n) {
    // ننتقل للذكر التالي تلقائياً
    const next = card.nextElementSibling && [...list.children].slice(i + 1).find((c) => !c.classList.contains('done'));
    if (next) setTimeout(() => next.scrollIntoView({ behavior: 'smooth', block: 'center' }), 450);
    if (azkarProgress(cat).done) finished();
  }
}

function updateCard(card, z, i) {
  const left = Math.max(0, z.n - (prog.counts[i] || 0));
  card.classList.toggle('done', left === 0);
  const c = card.querySelector('.counter');
  c.innerHTML = left === 0 ? icon('check') : `<b class="num">${n(left)}</b><span>${z.n > 1 ? `من ${n(z.n)}` : 'مرة'}</span>`;
  c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  updateBar();
}

function updateBar() {
  const p = azkarProgress(cat);
  $('#azCount').textContent = `${n(p.count)} / ${n(p.total)}`;
  $('#azBar').style.width = p.pct + '%';
  document.dispatchEvent(new Event('azkar-progress'));
}

function save() { persist(progKey(cat), prog); }

function finished() {
  chime();
  bloom(innerWidth / 2, innerHeight / 2, 22);
  const msg = {
    morning: 'أتممت أذكار الصباح، حفظك الله في يومك كله',
    evening: 'أتممت أذكار المساء، حفظك الله في ليلتك',
    sleep: 'نم في حفظ الله ورعايته',
  }[cat] || 'تقبّل الله منك';
  const banner = h(`<section class="card az-done-banner"><svg class="big"><use href="#i-star8"/></svg><h3>تقبّل الله منك</h3><p>${msg}</p></section>`);
  list.prepend(banner);
  scrollTo({ top: 0, behavior: 'smooth' });
  toast('ما شاء الله، تقبّل الله ✨');
}
