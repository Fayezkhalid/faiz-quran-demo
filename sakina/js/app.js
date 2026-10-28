// سكينة — أذكار وتفسير ومواقيت · صدقة جارية
import { store } from './store.js';
import { $, $$, icon, n, initSheet, openSheet, audioCtx, toast } from './ui.js';
import { SALUTES, partOfDay, rand, nextDua } from './content.js';
import { prayerTimes, qiblaBearing, city } from './time.js';
import { initHome, refreshQuick } from './home.js';
import { initAzkar, show as showAzkar } from './azkar.js';
import { initTasbih, tasbihActive } from './tasbih.js';
import { initTafsir, prepareTafsir } from './tafsir.js';
import { initSettings, applyLook, setNightPhase } from './settings.js';
import { openSoundSheet, onSound, play, stop, currentSound } from './sounds.js';
import { scheduleNotifications } from './notify.js';
import { openCityPicker } from './city.js';

applyLook();
initSheet();

// ===== شاشة الترحيب =====
function welcome() {
  const now = new Date();
  let phase = 'morning';
  try { phase = partOfDay(now, prayerTimes(now)); } catch {}
  const first = !store.get('firstOpen');
  $('#wSalute').textContent = rand(SALUTES[phase]);
  $('#wDua').textContent = first ? 'أذكارك وسبحتك وتفسير القرآن ومواقيت الصلاة، كلها في مكان واحد' : nextDua();
  $('#wGift').textContent = 'صدقة جارية، لا تنسونا ووالدينا من صالح دعائكم';
  if (first) store.set('firstOpen', Date.now());
  store.set('opens', store.get('opens') + 1);
  const petals = $('#petals');
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.style.cssText = `left:${Math.random() * 100}%;animation-duration:${7 + Math.random() * 7}s;animation-delay:${Math.random() * 6}s;transform:scale(${0.6 + Math.random() * 0.8})`;
    petals.append(s);
  }
  const enter = () => {
    $('#welcome').classList.add('hide');
    audioCtx();
    const sid = store.get('soundId');
    if (store.get('soundAuto') && sid && !currentSound()) play(sid);
    setTimeout(() => { $('#welcome').remove(); if (!store.get('cityChosen')) openCityPicker(); }, 900);
  };
  $('#wEnter').addEventListener('click', enter, { once: true });
  // ما نخليها تطوّل: تختفي لحالها بعد ثوانٍ في الزيارات العادية
  if (!first) setTimeout(() => { if ($('#welcome') && !$('#welcome').classList.contains('hide')) enter(); }, 7000);
}
welcome();

// ===== التنقل =====
const titles = { home: 'سكينة', azkar: 'الأذكار', tasbih: 'السبحة', tafsir: 'التفسير', settings: 'الإعدادات' };
const inited = {};
function go(view, opts = {}) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $('#topTitle').textContent = titles[view];
  if (!inited[view]) {
    inited[view] = true;
    ({ azkar: initAzkar, tasbih: initTasbih, tafsir: initTafsir, settings: initSettings })[view]?.();
  }
  if (view === 'azkar') showAzkar(opts.cat);
  if (view === 'tafsir') prepareTafsir();
  if (view === 'home') refreshQuick();
  tasbihActive(view === 'tasbih');
  scrollTo({ top: 0 });
  try { history.replaceState(null, '', '#' + view); } catch {}
}
$$('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));
document.addEventListener('go', (e) => go(e.detail.view, e.detail));
document.addEventListener('azkar-progress', refreshQuick);

initHome();
inited.home = true;
const startView = location.hash.slice(1);
if (titles[startView] && startView !== 'home') go(startView);

// أزرار أ+ و أ- في صفحات القراءة
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  e.stopPropagation();
  const v = Math.max(16, Math.min(34, store.get('size') + +b.dataset.size));
  store.set('size', v);
  applyLook();
  toast(`حجم الخط ${n(v)}`, 1200);
}, true);

// الوضع الليلي التلقائي
document.addEventListener('phase', (e) => setNightPhase(e.detail === 'night' || (e.detail === 'evening' && Date.now() > prayerTimes().maghrib)));

// ===== الأصوات =====
$('#btnSound').addEventListener('click', () => { audioCtx(); openSoundSheet(); });
onSound((s) => {
  $('#btnSound').classList.toggle('playing', !!s);
  $('#nowPlaying').hidden = !s;
  if (s) $('#npTitle').textContent = `${s.emoji} ${s.title}`;
});
$('#npStop').addEventListener('click', () => stop());
// إذا اختارت التشغيل التلقائي ودخلت بدون ضغطة، نبدأ عند أول لمسة
document.addEventListener('pointerdown', () => {
  const sid = store.get('soundId');
  if (store.get('soundAuto') && sid && !currentSound() && !$('#welcome')) play(sid);
}, { once: true });

// ===== القبلة =====
$('#btnQibla').addEventListener('click', openQibla);
function openQibla() {
  const bearing = qiblaBearing(city().lat, city().lng);
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i * 5 * Math.PI) / 180, big = i % 6 === 0;
    const r1 = big ? 82 : 87;
    return `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * 92}" y2="${100 - Math.cos(a) * 92}" stroke="currentColor" stroke-opacity="${big ? 0.8 : 0.35}" stroke-width="${big ? 2 : 1}"/>`;
  }).join('');
  const qa = (bearing * Math.PI) / 180;
  const body = openSheet(`<div class="qibla" id="qibla">
    <h2 style="padding:0">اتجاه القبلة</h2>
    <p class="muted">من ${city().name}: <b class="qibla-deg num">${n(Math.round(bearing))}°</b> من الشمال</p>
    <div class="compass"><svg viewBox="0 0 200 200" style="color:var(--text)">
      <g class="dial" id="dial">
        <circle cx="100" cy="100" r="96" fill="var(--soft)" stroke="var(--line)" stroke-width="2"/>
        ${ticks}
        <text x="100" y="34" text-anchor="middle" font-size="16" font-weight="800" fill="var(--primary)">ش</text>
        <text x="172" y="106" text-anchor="middle" font-size="14" fill="currentColor">ق</text>
        <text x="100" y="180" text-anchor="middle" font-size="14" fill="currentColor">ج</text>
        <text x="28" y="106" text-anchor="middle" font-size="14" fill="currentColor">غ</text>
        <g transform="translate(${100 + Math.sin(qa) * 66} ${100 - Math.cos(qa) * 66})"><rect x="-11" y="-11" width="22" height="22" rx="3" fill="#1d1d1f"/><rect x="-11" y="-5" width="22" height="3" fill="#d9a441"/></g>
        <line x1="100" y1="100" x2="${100 + Math.sin(qa) * 52}" y2="${100 - Math.cos(qa) * 52}" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>
      </g>
      <path d="M100 2 l7 12 h-14z" fill="var(--primary)"/>
      <circle cx="100" cy="100" r="7" fill="var(--accent)"/>
    </svg></div>
    <p id="qHint" class="muted small">ضع الجوال على سطح مستوٍ ثم اضغط «تشغيل البوصلة»، ولفّ حتى يصير رمز الكعبة فوق</p>
    <button class="btn primary block" id="qStart" type="button">${icon('compass')} تشغيل البوصلة</button>
  </div>`, { close: () => { removeEventListener('deviceorientation', onOri, true); removeEventListener('deviceorientationabsolute', onOri, true); } });
  const dial = body.querySelector('#dial');
  function onOri(e) {
    let heading = e.webkitCompassHeading;
    if (heading == null && e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) heading = 360 - e.alpha;
    if (heading == null) return;
    dial.style.transform = `rotate(${-heading}deg)`;
    const diff = Math.abs(((heading - bearing + 540) % 360) - 180);
    body.querySelector('#qibla').classList.toggle('aligned', diff < 5);
    body.querySelector('#qHint').textContent = diff < 5 ? 'أنت الحين باتجاه القبلة ✓' : 'لفّ حتى يصير رمز الكعبة فوق السهم';
  }
  body.querySelector('#qStart').addEventListener('click', async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') { toast('ما تم السماح بالبوصلة'); return; }
      }
      if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', onOri, true);
      else addEventListener('deviceorientation', onOri, true);
      body.querySelector('#qStart').hidden = true;
    } catch { toast('البوصلة غير متاحة في هذا الجهاز'); }
  });
}

// ===== التنبيهات =====
scheduleNotifications();
store.on((k) => { if (k.startsWith('notify')) scheduleNotifications(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleNotifications(); });
setInterval(scheduleNotifications, 6 * 3600000);

// ===== العمل بدون إنترنت =====
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
