// الواجهة الرئيسية: الترحيب، الساعة، الهجري، مواقيت الصلاة، رمضان
import { store } from './store.js';
import { $, h, icon, n, pad, esc } from './ui.js';
import { city, PRAYER_NAMES, PRAYER_KEYS, hijri, HIJRI_MONTHS, WEEKDAYS, G_MONTHS, prayerTimes, nextPrayer, ramadanInfo, dayReminders } from './time.js';
import { SALUTES, FRIDAY_DUAS, partOfDay, rand, nextDua, DAILY_AYAT } from './content.js';
import { azkarProgress } from './azkar.js';
import { loadQuran, ayahIndex, openAyah } from './tafsir.js';
import { shareApp, openCityPicker } from './city.js';

let root, els = {}, sky, raf, lastSec = -1, duaTimer;

export function fmtTime(ms, withSuffix = true) {
  const d = new Date(ms);
  let hh = d.getHours();
  const mm = pad(d.getMinutes());
  if (store.get('clock24')) return n(`${pad(hh)}:${mm}`);
  const suf = hh < 12 ? 'ص' : 'م';
  hh = hh % 12 || 12;
  return n(`${hh}:${mm}`) + (withSuffix ? ` ${suf}` : '');
}

export function hijriString(d = new Date()) {
  const x = hijri(d);
  return `${n(x.day)} ${HIJRI_MONTHS[x.month - 1]} ${n(x.year)} هـ`;
}
export function gregString(d = new Date()) {
  return `${WEEKDAYS[d.getDay()]} ${n(d.getDate())} ${G_MONTHS[d.getMonth()]} ${n(d.getFullYear())}`;
}

function clockSVG() {
  const nums = [];
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = 100 + Math.sin(a) * 73;
    const y = 100 - Math.cos(a) * 73 + 7;
    nums.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" class="cnum">${n(i)}</text>`);
  }
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    const r1 = big ? 86 : 89, r2 = 93;
    ticks.push(`<line x1="${(100 + Math.sin(a) * r1).toFixed(1)}" y1="${(100 - Math.cos(a) * r1).toFixed(1)}" x2="${(100 + Math.sin(a) * r2).toFixed(1)}" y2="${(100 - Math.cos(a) * r2).toFixed(1)}" stroke="#fff" stroke-opacity="${big ? 0.9 : 0.45}" stroke-width="${big ? 2.4 : 1}" stroke-linecap="round"/>`);
  }
  return `<svg viewBox="0 0 200 200" role="img" aria-label="الساعة">
    <defs>
      <radialGradient id="faceG" cx="50%" cy="40%"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></radialGradient>
      <linearGradient id="goldG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#d9a441"/></linearGradient>
      <filter id="hs" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".35"/></filter>
    </defs>
    <circle cx="100" cy="100" r="98" fill="none" stroke="url(#goldG)" stroke-width="2" opacity=".85"/>
    <circle cx="100" cy="100" r="95" fill="url(#faceG)" stroke="#fff" stroke-opacity=".35"/>
    <g opacity=".16" fill="none" stroke="#fff" stroke-width="1">
      <rect x="62" y="62" width="76" height="76" rx="4"/><rect x="62" y="62" width="76" height="76" rx="4" transform="rotate(45 100 100)"/>
      <circle cx="100" cy="100" r="40"/>
    </g>
    ${ticks.join('')}
    <g class="cnums" fill="#fff" font-size="15" font-weight="700" style="font-family:'Noto Naskh Arabic',serif">${nums.join('')}</g>
    <g filter="url(#hs)">
      <line id="hHand" x1="100" y1="108" x2="100" y2="56" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
      <line id="mHand" x1="100" y1="112" x2="100" y2="34" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <g id="sHand"><line x1="100" y1="118" x2="100" y2="24" stroke="url(#goldG)" stroke-width="1.8" stroke-linecap="round"/><circle cx="100" cy="24" r="3.2" fill="#ffe08a"/></g>
      <circle cx="100" cy="100" r="6" fill="url(#goldG)"/><circle cx="100" cy="100" r="2.2" fill="#fff"/>
    </g>
  </svg>`;
}

function skyFor(phase) {
  return {
    night: 'linear-gradient(170deg,#0d1233 0%,#252063 50%,#4b2e70 100%)',
    fajr: 'linear-gradient(175deg,#25285f 0%,#7b4f92 55%,#e89a96 100%)',
    morning: 'linear-gradient(175deg,#2f6db0 0%,#5c98cf 55%,#d9a48f 100%)',
    noon: 'linear-gradient(175deg,#1f63a6 0%,#3f8cc8 60%,#7fb4d8 100%)',
    evening: 'linear-gradient(175deg,#3b2a6b 0%,#a34f7a 55%,#ee9a62 100%)',
  }[phase];
}

export function initHome() {
  root = $('#view-home');
  root.innerHTML = `
    <div id="installTip"></div>
    <div class="hero" id="hero">
      <canvas id="sky" aria-hidden="true"></canvas>
      <h1 class="hero-name" id="hGreet"></h1>
      <p class="hero-dua" id="hDua"></p>
      <div id="clockBox"></div>
      <div class="hero-dates">
        <span class="pill">${icon('crescent')}<span id="hHijri"></span></span>
        <span class="pill"><span id="hGreg"></span></span>
      </div>
      <div class="hero-hint">المس الساعة لتغيير شكلها</div>
    </div>

    <section class="card" aria-label="الصلاة القادمة">
      <div class="next-prayer">
        <div class="ring">
          <svg viewBox="0 0 120 120"><defs><linearGradient id="ringGrad" x1="0" x2="1"><stop offset="0" stop-color="var(--primary-2)"/><stop offset="1" stop-color="var(--primary)"/></linearGradient></defs>
            <circle class="track" cx="60" cy="60" r="52" fill="none" stroke-width="10"/>
            <circle class="bar" id="npRing" cx="60" cy="60" r="52" fill="none" stroke-width="10" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg>
          <div class="ring-center"><div><b id="npPct"></b><br><span>من الوقت</span></div></div>
        </div>
        <div>
          <p class="np-label" id="npLabel">الصلاة القادمة</p>
          <p class="np-name" id="npName"></p>
          <div class="np-count num" id="npCount" aria-live="off"></div>
          <div class="np-at" id="npAt"></div>
        </div>
      </div>
      <div class="prayers" id="prayers"></div>
      <div class="city-line"><button class="city-btn" id="cityBtn" type="button"></button><span id="npDate"></span></div>
    </section>

    <section class="card ramadan" id="ramadanCard" aria-label="رمضان"></section>

    <div class="quick">
      <button class="quick-btn morning" data-go="morning" type="button">
        <svg class="big"><use href="#i-sunmoon"/></svg>
        <b>أذكار الصباح</b><span class="qp" id="qpM"></span><span class="qbar"><i id="qbM"></i></span>
      </button>
      <button class="quick-btn evening" data-go="evening" type="button">
        <svg class="big"><use href="#i-crescent"/></svg>
        <b>أذكار المساء</b><span class="qp" id="qpE"></span><span class="qbar"><i id="qbE"></i></span>
      </button>
    </div>

    <div id="reminders"></div>

    <section class="card ayah-card" id="ayahCard" aria-label="آية اليوم">
      <div class="card-title" style="justify-content:center">${icon('book')} آية اليوم</div>
      <div class="ayah-text" id="dailyAyah"><span class="loader"></span></div>
      <div class="ayah-ref" id="dailyRef"></div>
      <button class="btn soft" id="dailyTafsir" type="button" style="margin-top:10px" hidden>${icon('book')} اقرأ تفسيرها</button>
    </section>

    <section class="card share-card">
      <div class="card-title" style="justify-content:center">${icon('heart')} صدقة جارية</div>
      <p>هذا التطبيق صدقة جارية، لا تنسونا ووالدينا من صالح دعائكم. «الدال على الخير كفاعله»</p>
      <button class="btn primary block" id="shareApp" type="button">${icon('share')} شارك التطبيق وانشر الأجر</button>
    </section>
  `;
  els = {
    greet: $('#hGreet'), dua: $('#hDua'), clockBox: $('#clockBox'), hijri: $('#hHijri'), greg: $('#hGreg'),
    ring: $('#npRing'), pct: $('#npPct'), npName: $('#npName'), npCount: $('#npCount'), npAt: $('#npAt'), npLabel: $('#npLabel'),
    prayers: $('#prayers'), npDate: $('#npDate'), ramadan: $('#ramadanCard'), hero: $('#hero'),
  };

  els.clockBox.addEventListener('click', () => {
    store.set('clockStyle', store.get('clockStyle') === 'analog' ? 'digital' : 'analog');
    renderClock();
  });
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('go', { detail: { view: 'azkar', cat: b.dataset.go } }));
  }));
  els.dua.addEventListener('click', () => swapDua());

  sky = new Sky($('#sky'));
  $('#shareApp').addEventListener('click', shareApp);
  $('#cityBtn').addEventListener('click', openCityPicker);
  installTip();
  renderClock();
  refresh();
  dailyAyah();
  duaTimer = setInterval(swapDua, 20000);
  tick();
  store.on((k) => {
    if (['arabicDigits', 'clock24', 'hijriOffset', 'city'].includes(k)) { currentPhase = null; renderClock(); refresh(); }
  });
}

function renderClock() {
  if (store.get('clockStyle') === 'analog') {
    els.clockBox.innerHTML = `<div class="clock-wrap">${clockSVG()}</div><p class="hero-time-sm num" id="hTimeSm"></p>`;
  } else {
    els.clockBox.innerHTML = `<div class="digital num" id="hDigital"></div>`;
  }
  els.h = $('#hHand'); els.m = $('#mHand'); els.s = $('#sHand'); els.dig = $('#hDigital'); els.sm = $('#hTimeSm');
  lastSec = -1;
}

let currentPhase;
function refresh(now = new Date()) {
  const t = prayerTimes(now);
  const phase = partOfDay(now, t);
  if (phase !== currentPhase) {
    currentPhase = phase;
    els.hero.style.setProperty('--sky', skyFor(phase === 'evening' && now.getTime() > t.maghrib ? 'night' : phase));
    sky.setMode(phase === 'night' || (phase === 'evening' && now.getTime() > t.maghrib) || phase === 'fajr' ? 'stars' : phase === 'evening' ? 'glow' : 'light');
    const isFri = now.getDay() === 5;
    els.greet.textContent = rand(SALUTES[phase]);
    els.dua.textContent = isFri && Math.random() < 0.5 ? rand(FRIDAY_DUAS) : nextDua();
    document.dispatchEvent(new CustomEvent('phase', { detail: phase }));
  }
  els.hijri.textContent = hijriString(now);
  els.greg.textContent = gregString(now);
  els.npDate.textContent = '';
  $('#cityBtn').innerHTML = `${icon('compass')} مواقيت ${esc(city().name)} · تغيير`;

  // قائمة المواقيت
  const np = nextPrayer(now);
  els.prayers.innerHTML = PRAYER_KEYS.map((k) => {
    const cls = k === np.key && !np.tomorrow ? 'next' : t[k] < now.getTime() ? 'past' : '';
    return `<div class="prayer ${cls}"><span class="pn">${PRAYER_NAMES[k]}</span><span class="pt num">${fmtTime(t[k])}</span></div>`;
  }).join('');
  if (np.tomorrow) els.prayers.firstElementChild.classList.add('next');
  els.npName.textContent = np.key === 'sunrise' ? 'الشروق' : `صلاة ${PRAYER_NAMES[np.key]}`;
  els.npLabel.textContent = np.key === 'sunrise' ? 'يتبقى على' : 'يتبقى على أذان';
  els.npAt.textContent = `${np.tomorrow ? 'غداً ' : ''}الساعة ${fmtTime(np.time)}`;
  els.np = np;

  renderRamadan(now);
  renderQuick();
  renderReminders(now);
}

function swapDua() {
  els.dua.style.opacity = 0;
  setTimeout(() => {
    els.dua.textContent = nextDua();
    els.dua.style.opacity = 1;
  }, 600);
}

function renderQuick() {
  const m = azkarProgress('morning'), e = azkarProgress('evening');
  $('#qpM').textContent = m.done ? 'تقبّل الله ✓' : `${n(m.count)} من ${n(m.total)}`;
  $('#qpE').textContent = e.done ? 'تقبّل الله ✓' : `${n(e.count)} من ${n(e.total)}`;
  $('#qbM').style.width = `${m.pct}%`;
  $('#qbE').style.width = `${e.pct}%`;
}
export function refreshQuick() { if (root) renderQuick(); }

function renderReminders(now) {
  const list = dayReminders(now);
  $('#reminders').innerHTML = list.map((r) => `
    <section class="card reminder"><div class="ico">${icon(r.icon)}</div><div><b>${esc(r.title)}</b><p class="muted">${esc(r.text)}</p></div></section>`).join('');
}

let ramadanState;
function renderRamadan(now) {
  const info = ramadanInfo(now);
  ramadanState = info;
  if (!info) { els.ramadan.hidden = true; return; }
  const lantern = `<svg class="lantern" viewBox="0 0 40 80" aria-hidden="true"><line x1="20" y1="0" x2="20" y2="14" stroke="#f6d98b" stroke-width="1.5"/><path d="M12 18h16l4 8v26l-4 8H12l-4-8V26z" fill="rgba(246,217,139,.25)" stroke="#f6d98b" stroke-width="1.5"/><path d="M14 14h12l2 4H12z" fill="#f6d98b"/><path d="M14 60h12l-2 6h-8z" fill="#f6d98b"/><ellipse cx="20" cy="39" rx="5" ry="9" fill="#ffe7a6" opacity=".85"/></svg>`;
  if (info.inRamadan) {
    const t = prayerTimes(now);
    const toIftar = now.getTime() < t.maghrib && now.getTime() > t.fajr;
    els.ramadan.innerHTML = `<svg class="ramadan-moon"><use href="#i-crescent"/></svg>${lantern}
      <div class="card-title">${icon('crescent')} رمضان كريم، تقبّل الله صيامكم</div>
      <div style="font-size:1.4rem;font-weight:800">اليوم ${n(info.day)} من رمضان</div>
      <p>${toIftar ? 'يتبقى على الإفطار (أذان المغرب)' : 'يتبقى على الإمساك (أذان الفجر)'}</p>
      <div class="countdown num" id="rmCount"></div>`;
    els.rTarget = toIftar ? t.maghrib : nextPrayer(now).key === 'fajr' ? nextPrayer(now).time : t.fajr;
  } else {
    els.ramadan.innerHTML = `<svg class="ramadan-moon"><use href="#i-crescent"/></svg>${lantern}
      <div class="card-title">${icon('crescent')} يتبقى على رمضان</div>
      <div class="countdown num" id="rmCount"></div>
      <p class="small">غرة رمضان ${n(info.year)} هـ توافق ${gregString(info.start)} بإذن الله (تقويم أم القرى). اللهم بلّغنا رمضان.</p>`;
    els.rTarget = info.start.getTime();
  }
}

function countdownCells(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const cells = ramadanState?.inRamadan
    ? [[hh, 'ساعة'], [mm, 'دقيقة'], [ss, 'ثانية']]
    : [[d, 'يوم'], [hh, 'ساعة'], [mm, 'دقيقة'], [ss, 'ثانية']];
  return cells.map(([v, l]) => `<div><b>${n(v)}</b><span>${l}</span></div>`).join('');
}

function tick() {
  const now = new Date();
  const ms = now.getMilliseconds();
  const sec = now.getSeconds() + ms / 1000;
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  if (els.h) {
    els.h.setAttribute('transform', `rotate(${hr * 30} 100 100)`);
    els.m.setAttribute('transform', `rotate(${min * 6} 100 100)`);
    els.s.setAttribute('transform', `rotate(${sec * 6} 100 100)`);
  }
  const whole = now.getSeconds();
  if (whole !== lastSec) {
    lastSec = whole;
    const hh = now.getHours();
    if (els.dig) {
      const suf = store.get('clock24') ? '' : `<small>${hh < 12 ? 'صباحاً' : 'مساءً'}</small>`;
      els.dig.innerHTML = `${fmtTime(now, false)}<small>:${n(pad(whole))}</small>${suf}`;
    }
    if (els.sm) els.sm.textContent = fmtTime(now);
    if (whole === 0) refresh(now);
    // العد التنازلي للصلاة
    const np = els.np;
    if (np) {
      if (now.getTime() >= np.time) { refresh(now); }
      const left = Math.max(0, np.time - now.getTime());
      const s = Math.floor(left / 1000);
      els.npCount.textContent = n(`${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`);
      const frac = 1 - left / (np.time - np.prevTime);
      els.ring.style.strokeDashoffset = 326.7 * (1 - Math.min(1, Math.max(0, frac)));
      els.pct.textContent = n(Math.round(frac * 100)) + '٪';
    }
    const rc = $('#rmCount');
    if (rc && els.rTarget) {
      if (now.getTime() > els.rTarget) renderRamadan(now);
      rc.innerHTML = countdownCells(els.rTarget - now.getTime());
    }
    // يتغير اليوم
    if (hh === 0 && whole === 1 && now.getMinutes() === 0) { currentPhase = null; refresh(now); }
  }
  raf = requestAnimationFrame(tick);
}

// في الآيفون: نوضّح طريقة إضافة التطبيق للشاشة الرئيسية (مرة وحدة، وتختفي بعد التثبيت)
function installTip() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone) return;
  const box = $('#installTip');
  box.innerHTML = `<section class="card reminder"><div class="ico">${icon('share')}</div><div>
    <b>ثبّت التطبيق على الشاشة الرئيسية</b>
    <p class="muted">اضغط زر المشاركة ${icon('share')} أسفل Safari، ثم «إضافة إلى الشاشة الرئيسية». بعدها يفتح مثل أي تطبيق وتشتغل التنبيهات.</p></div></section>`;
  box.querySelectorAll('p svg').forEach((s) => { s.style.display = 'inline'; s.style.verticalAlign = 'middle'; });
}

async function dailyAyah() {
  try {
    const q = await loadQuran();
    const start = new Date(2024, 0, 1);
    const day = Math.floor((Date.now() - start) / 86400000);
    const [s, a] = DAILY_AYAT[day % DAILY_AYAT.length];
    const idx = ayahIndex(s, a);
    $('#dailyAyah').textContent = q.a[idx][0];
    $('#dailyRef').textContent = `سورة ${q.s[s - 1][0]} · الآية ${n(a)}`;
    const b = $('#dailyTafsir');
    b.hidden = false;
    b.onclick = () => openAyah(idx);
  } catch {
    $('#ayahCard').hidden = true;
  }
}

// خلفية حيّة: نجوم ليلاً، وأضواء ناعمة نهاراً
class Sky {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'stars';
    this.parts = [];
    this.resize();
    addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    canvas.parentElement.addEventListener('pointerdown', (e) => this.burst(e));
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = r.width; this.hgt = r.height;
    this.c.width = r.width * this.dpr; this.c.height = r.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seed();
  }
  setMode(m) { if (m !== this.mode) { this.mode = m; this.seed(); } }
  seed() {
    const count = this.mode === 'stars' ? 70 : 18;
    this.parts = Array.from({ length: count }, () => this.make());
  }
  make(x, y) {
    const stars = this.mode === 'stars';
    return {
      x: x ?? Math.random() * this.w,
      y: y ?? Math.random() * this.hgt * (stars ? 0.75 : 1),
      r: stars ? Math.random() * 1.6 + 0.3 : Math.random() * 26 + 8,
      p: Math.random() * Math.PI * 2,
      sp: Math.random() * 0.02 + 0.005,
      vx: stars ? 0 : (Math.random() - 0.5) * 0.15,
      vy: stars ? 0 : -Math.random() * 0.2 - 0.05,
      life: 1, burst: x != null,
    };
  }
  burst(e) {
    const r = this.c.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const p = this.make(e.clientX - r.left, e.clientY - r.top);
      const a = Math.random() * Math.PI * 2, v = Math.random() * 2 + 0.6;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.r = Math.random() * 2.5 + 1; p.burst = true;
      this.parts.push(p);
    }
  }
  loop() {
    const { ctx } = this;
    if (!document.hidden && this.c.offsetParent) {
      ctx.clearRect(0, 0, this.w, this.hgt);
      if (this.mode === 'stars') {
        // هلال
        ctx.save();
        ctx.fillStyle = 'rgba(255,240,200,.9)';
        ctx.shadowColor = 'rgba(255,230,170,.8)'; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.arc(46, 46, 18, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(55, 40, 16, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (this.mode === 'light') {
        const g = ctx.createRadialGradient(this.w - 40, 30, 4, this.w - 40, 30, 120);
        g.addColorStop(0, 'rgba(255,248,220,.75)'); g.addColorStop(1, 'rgba(255,248,220,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.hgt);
      }
      this.parts = this.parts.filter((p) => p.life > 0);
      for (const p of this.parts) {
        p.p += p.sp; p.x += p.vx; p.y += p.vy;
        if (p.burst) { p.life -= 0.02; p.vx *= 0.97; p.vy *= 0.97; }
        else if (this.mode !== 'stars' && p.y < -40) { Object.assign(p, this.make(), { y: this.hgt + 30 }); }
        const tw = 0.5 + Math.sin(p.p) * 0.5;
        ctx.beginPath();
        if (this.mode === 'stars' || p.burst) {
          ctx.fillStyle = `rgba(255,255,255,${(0.3 + tw * 0.7) * p.life})`;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        } else {
          const color = this.mode === 'glow' ? '255,200,150' : '255,255,255';
          ctx.fillStyle = `rgba(${color},${0.05 + tw * 0.07})`;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
    requestAnimationFrame(this.loop);
  }
}
