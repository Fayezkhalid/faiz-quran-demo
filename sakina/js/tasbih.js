// سبحة الاستغفار: اضغط في أي مكان بالدائرة الكبيرة
import { store, load, persist, dayKey } from './store.js';
import { $, h, icon, n, esc, vibrate, click, chime, bloom, toast, openSheet, closeSheet } from './ui.js';
import { TASBIH_PHRASES } from './content.js';

const BEADS = 33;
let root, count = 0, stats, wakeLock = null, els = {};

function phrases() {
  const c = store.get('customPhrase');
  return c ? [...TASBIH_PHRASES, c] : TASBIH_PHRASES;
}
function phrase() {
  const list = phrases();
  return list[Math.min(store.get('tasbihPhrase'), list.length - 1)];
}

function loadStats() {
  stats = load('tasbih', { total: 0, days: {}, session: 0, sessionDay: null });
  if (stats.sessionDay !== dayKey()) { stats.session = 0; stats.sessionDay = dayKey(); }
  count = stats.session;
}
function saveStats() {
  stats.session = count;
  stats.sessionDay = dayKey();
  // نحتفظ بآخر ٦٠ يوم فقط
  const keys = Object.keys(stats.days).sort();
  while (keys.length > 60) delete stats.days[keys.shift()];
  persist('tasbih', stats);
}

// الخرز في طبقة HTML مستقلة تدور بـ CSS، لأن Safari في الآيفون ما يدوّر عناصر SVG الداخلية
function beadsSVG() {
  let s = '';
  for (let i = 0; i < BEADS; i++) {
    const a = (i / BEADS) * Math.PI * 2 - Math.PI / 2;
    const x = 100 + Math.cos(a) * 86, y = 100 + Math.sin(a) * 86;
    s += `<circle class="bead" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7.2"/>`;
  }
  const grad = (id, a, b, c) => `<radialGradient id="${id}" cx="35%" cy="30%"><stop offset="0" style="stop-color:${a}"/><stop offset=".4" style="stop-color:${b}"/><stop offset="1" style="stop-color:${c}"/></radialGradient>`;
  return `
    <div class="ring-rot" id="beads">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          ${grad('beadGrad', '#fff', 'var(--primary-2)', 'var(--primary)')}
          ${grad('beadDone', '#fff', '#ffe7a3', 'var(--accent)')}
        </defs>
        <circle cx="100" cy="100" r="86" fill="none" style="stroke:var(--line)" stroke-width="1.5"/>
        ${s}
      </svg>
    </div>
    <svg class="ring-static" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="98" fill="none" style="stroke:var(--soft)" stroke-width="3"/>
      <circle id="tArc" cx="100" cy="100" r="98" fill="none" style="stroke:var(--accent)" stroke-width="3.5" stroke-linecap="round"
        stroke-dasharray="615.75" stroke-dashoffset="615.75" transform="rotate(-90 100 100)"/>
      <circle class="bead-now" cx="100" cy="14" r="10.5" fill="none" style="stroke:var(--accent)" stroke-width="2"/>
      <path d="M100 -1 l6 9 h-12z" style="fill:var(--accent)"/>
    </svg>`;
}

export function initTasbih() {
  root = $('#view-tasbih');
  loadStats();
  root.innerHTML = `
    <div class="tasbih">
      <div class="tasbih-top">
        <button class="phrase-btn" id="tPhraseBtn" type="button"><span id="tPhraseLbl"></span><small>تغيير ▾</small></button>
        <button class="icon-btn" id="tUndo" type="button" aria-label="تراجع واحد">${icon('undo')}</button>
        <button class="icon-btn" id="tReset" type="button" aria-label="تصفير العدّاد">${icon('reset')}</button>
      </div>
      <div class="targets chips" id="tTargets" style="margin-top:8px"></div>
      <div class="tap-zone" id="tapZone" role="button" aria-label="اضغط للتسبيح" tabindex="0">
        <div class="misbaha">
          ${beadsSVG()}
          <div class="misbaha-center">
            <div>
              <div class="tcount num" id="tCount">٠</div>
              <div class="ttarget num" id="tTarget"></div>
              <div class="tleft num" id="tLeft"></div>
              <div class="tphrase" id="tPhrase"></div>
            </div>
          </div>
        </div>
      </div>
      <p class="tasbih-hint">اضغط في أي مكان على السبحة 🤍</p>
      <div class="tasbih-stats" style="margin-top:12px">
        <div class="stat"><b class="num" id="sToday"></b><span>اليوم</span></div>
        <div class="stat"><b class="num" id="sRounds"></b><span>دورات اليوم</span></div>
        <div class="stat"><b class="num" id="sTotal"></b><span>المجموع</span></div>
      </div>
      <section class="card">
        <div class="card-title">${icon('beads')} آخر ٧ أيام</div>
        <div class="week" id="week"></div>
      </section>
    </div>`;
  els = { count: $('#tCount'), target: $('#tTarget'), phrase: $('#tPhrase'), beads: $('#beads'), zone: $('#tapZone') };

  els.zone.addEventListener('pointerdown', onTap);
  els.zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(e); } });
  $('#tUndo').addEventListener('click', () => { if (count > 0) { count--; addToday(-1); saveStats(); render(); } });
  $('#tReset').addEventListener('click', () => {
    if (count === 0) return;
    if (!confirm('تصفير العدّاد؟ (مجموع اليوم يبقى محفوظ)')) return;
    count = 0; saveStats(); render();
  });
  $('#tPhraseBtn').addEventListener('click', pickPhrase);
  renderTargets();
  render();
  store.on((k) => { if (k === 'arabicDigits') { renderTargets(); render(); } });
}

function renderTargets() {
  const t = store.get('tasbihTarget');
  $('#tTargets').innerHTML = [33, 100, 1000, 0].map((v) =>
    `<button class="chip ${t === v ? 'active' : ''}" data-t="${v}" type="button">${v ? n(v) : 'مفتوح ∞'}</button>`).join('');
  $('#tTargets').querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
    store.set('tasbihTarget', +b.dataset.t);
    renderTargets(); render();
  }));
}

function addToday(k) {
  const d = dayKey();
  stats.days[d] = Math.max(0, (stats.days[d] || 0) + k);
  stats.total = Math.max(0, stats.total + k);
}

function onTap(e) {
  if (e.button > 0) return;
  count++;
  addToday(1);
  saveStats();
  const target = store.get('tasbihTarget');
  const hit = target && count % target === 0;
  if (store.get('tasbihSound')) hit ? chime() : click(820 + (count % BEADS === 0 ? 300 : 0));
  vibrate(hit ? [40, 80, 40, 80, 40] : count % BEADS === 0 ? [25, 40, 25] : 15);
  if (hit) {
    const r = els.zone.getBoundingClientRect();
    bloom(r.left + r.width / 2, r.top + r.height / 2, 24);
    toast(`ما شاء الله! أتممت ${n(target)} 🌸`);
  }
  els.count.classList.remove('bump'); void els.count.offsetWidth; els.count.classList.add('bump');
  render();
}

function render() {
  const target = store.get('tasbihTarget');
  els.count.textContent = n(target ? count % target || (count ? target : 0) : count);
  const inRound = target ? count % target || (count ? target : 0) : count;
  els.target.textContent = target ? `من ${n(target)}` : '';
  const left = target ? target - inRound : 0;
  $('#tLeft').textContent = !target ? '' : left ? `باقي ${n(left)}` : 'اكتملت ✓';
  // القوس الخارجي يمتلئ حتى الهدف
  $('#tArc').style.strokeDashoffset = target ? 615.75 * (1 - inRound / target) : 615.75;
  els.phrase.textContent = phrase();
  $('#tPhraseLbl').textContent = phrase();
  // دوران الخرز: كل ضغطة تحرّك حبة، والحبات المنتهية في هذه الدورة يتغير لونها للذهبي
  const step = count % BEADS;
  const done = count && !step ? BEADS : step;
  els.beads.style.transform = `rotate(${-count * (360 / BEADS)}deg)`;
  els.beads.querySelectorAll('.bead').forEach((b, i) => b.classList.toggle('done', i < done));
  const today = stats.days[dayKey()] || 0;
  $('#sToday').textContent = n(today);
  $('#sRounds').textContent = n(target ? Math.floor(count / target) : Math.floor(count / 100));
  $('#sTotal').textContent = n(stats.total);
  renderWeek();
}

function renderWeek() {
  const days = [];
  const names = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ v: stats.days[dayKey(d)] || 0, l: i === 0 ? 'اليوم' : names[d.getDay()] });
  }
  const max = Math.max(1, ...days.map((d) => d.v));
  $('#week').innerHTML = days.map((d) => `<div><em class="num">${d.v ? n(d.v) : ''}</em><i style="height:${Math.max(4, (d.v / max) * 70)}px"></i><span>${d.l}</span></div>`).join('');
}

function pickPhrase() {
  const cur = store.get('tasbihPhrase');
  const body = openSheet(`<h2>اختر الذكر</h2>
    <div class="phrase-list">${phrases().map((p, i) => `<button class="phrase-item ${i === cur ? 'active' : ''}" data-i="${i}" type="button"><span>${esc(p)}</span>${i === cur ? icon('check') : ''}</button>`).join('')}</div>
    <div class="field" style="margin-top:14px"><label for="customP">أو اكتب ذكراً خاصاً</label>
    <input type="text" id="customP" placeholder="مثال: يا حي يا قيوم" value="${esc(store.get('customPhrase'))}"></div>
    <button class="btn primary block" id="saveCustom" type="button" style="margin-top:10px">حفظ الذكر الخاص</button>`);
  body.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
    store.set('tasbihPhrase', +b.dataset.i);
    count = 0; saveStats(); render(); closeSheet();
  }));
  body.querySelector('#saveCustom').addEventListener('click', () => {
    const v = body.querySelector('#customP').value.trim();
    store.set('customPhrase', v);
    if (v) store.set('tasbihPhrase', phrases().length - 1);
    count = 0; saveStats(); render(); closeSheet();
  });
}

// إبقاء الشاشة مضاءة أثناء التسبيح
export async function tasbihActive(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}
