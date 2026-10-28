// الإعدادات: الخط، الحجم، الثيم، التنبيهات
import { store } from './store.js';
import { $, icon, n, esc, toast } from './ui.js';
import { enableNotifications, exportCalendar, testNotification } from './notify.js';
import { city } from './time.js';
import { openCityPicker, shareApp } from './city.js';

// عشرة خطوط عربية واضحة. scale يوحّد الحجم الظاهري بينها
export const FONTS = [
  { id: 'naskh', name: 'نسخ', family: 'Noto Naskh Arabic', q: 'Noto+Naskh+Arabic:wght@400;600;700', scale: 1 },
  { id: 'tajawal', name: 'تجوّل', family: 'Tajawal', q: 'Tajawal:wght@400;500;700;800', scale: 1.04 },
  { id: 'almarai', name: 'المراعي', family: 'Almarai', q: 'Almarai:wght@400;700;800', scale: 0.98 },
  { id: 'cairo', name: 'القاهرة', family: 'Cairo', q: 'Cairo:wght@400;600;700', scale: 0.98 },
  { id: 'amiri', name: 'أميري', family: 'Amiri', q: 'Amiri:wght@400;700', scale: 1.1 },
  { id: 'scheherazade', name: 'شهرزاد', family: 'Scheherazade New', q: 'Scheherazade+New:wght@400;700', scale: 1.18 },
  { id: 'messiri', name: 'المسيري', family: 'El Messiri', q: 'El+Messiri:wght@400;600;700', scale: 1 },
  { id: 'readex', name: 'ريدكس', family: 'Readex Pro', q: 'Readex+Pro:wght@400;600;700', scale: 0.94 },
  { id: 'plex', name: 'بلكس', family: 'IBM Plex Sans Arabic', q: 'IBM+Plex+Sans+Arabic:wght@400;600;700', scale: 1 },
  { id: 'markazi', name: 'مركزي', family: 'Markazi Text', q: 'Markazi+Text:wght@400;600;700', scale: 1.16 },
];

export const THEMES = [
  { id: 'rose', name: 'وردي', a: '#a8385f', b: '#f9e3ea' },
  { id: 'lavender', name: 'لافندر', a: '#6a4ca6', b: '#ece5f8' },
  { id: 'emerald', name: 'نعناعي', a: '#2f6b55', b: '#e2efe7' },
  { id: 'pearl', name: 'لؤلؤي', a: '#8a6326', b: '#f4ead6' },
  { id: 'night', name: 'ليلي', a: '#12141f', b: '#eaa2bb' },
];

let nightNow = false;
export function setNightPhase(isNight) { nightNow = isNight; applyLook(); }

export function applyLook() {
  const s = store.all();
  const chosen = THEMES.some((t) => t.id === s.theme) ? s.theme : 'rose';
  const theme = s.autoNight && nightNow ? 'night' : chosen;
  document.documentElement.dataset.theme = theme;
  const f = FONTS.find((x) => x.id === s.font) || FONTS[0];
  const link = $('#userFont');
  const href = f.id === 'naskh' ? '' : `https://fonts.googleapis.com/css2?family=${f.q}&display=swap`;
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  const root = document.documentElement.style;
  root.setProperty('--font', `'${f.family}', 'Noto Naskh Arabic', sans-serif`);
  root.setProperty('--scale', f.scale);
  root.setProperty('--base', s.size + 'px');
  document.body.classList.toggle('bold-text', s.bold);
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', bg);
  });
}

export function initSettings() {
  const root = $('#view-settings');
  const s = store.all();
  // نحمّل الخطوط كاملة للمعاينة. النسخ المصغّرة تكسر وصل الحروف في الآيفون لأنها تُستخدم في كل التطبيق
  const sample = 'بسم الله نبدأ يومنا';
  const pv = document.createElement('link');
  pv.rel = 'stylesheet';
  pv.href = 'https://fonts.googleapis.com/css2?' + FONTS.filter((f) => f.id !== 'naskh').map((f) => 'family=' + f.q).join('&') + '&display=swap';

  root.innerHTML = `
    <h2 class="page-title">الإعدادات</h2>
    <p class="page-sub">خلّ التطبيق على راحتك</p>

    <section class="card">
      <div class="card-title">${icon('compass')} المدينة</div>
      <button class="btn soft block" id="cityPick" type="button">${esc(city().name)} · تغيير</button>
    </section>

    <section class="card">
      <div class="card-title">حجم الخط</div>
      <div class="size-ctl">
        <button type="button" class="a-small" id="sizeDown" aria-label="تصغير الخط">أ-</button>
        <input type="range" id="size" min="16" max="34" step="1" value="${s.size}" aria-label="حجم الخط">
        <button type="button" class="a-big" id="sizeUp" aria-label="تكبير الخط">أ+</button>
      </div>
      <div class="preview" id="sizePreview">سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ</div>
      <div class="set-row"><span class="lbl">خط عريض<span class="desc">يخلي الكلام أوضح وأثقل</span></span>
        <label class="switch"><input type="checkbox" id="bold" ${s.bold ? 'checked' : ''}><span></span></label></div>
    </section>

    <section class="card">
      <div class="card-title">نوع الخط</div>
      <div class="font-list" id="fonts">${FONTS.map((f) => `
        <button type="button" class="font-opt ${s.font === f.id ? 'active' : ''}" data-f="${f.id}">
          <span class="fs" style="font-family:'${f.family}';font-size:${(1.3 * f.scale).toFixed(2)}rem">${sample}</span><small>${f.name}</small></button>`).join('')}</div>
    </section>

    <section class="card">
      <div class="card-title">الألوان</div>
      <p class="muted small" style="margin:-4px 2px 10px">خمسة ألوان هادئة ومريحة للعين</p>
      <div class="themes" id="themes">${THEMES.map((t) => `
        <button type="button" class="theme-opt ${s.theme === t.id ? 'active' : ''}" data-t="${t.id}"><i style="background:${t.a};--sw2:${t.b}"></i>${t.name}</button>`).join('')}</div>
      <div class="set-row"><span class="lbl">وضع ليلي تلقائي<span class="desc">ألوان هادئة للعين بعد المغرب</span></span>
        <label class="switch"><input type="checkbox" id="autoNight" ${s.autoNight ? 'checked' : ''}><span></span></label></div>
    </section>

    <section class="card">
      <div class="card-title">${icon('bell')} التنبيهات</div>
      <div class="set-row"><span class="lbl">تفعيل التنبيهات<span class="desc" id="notifState"></span></span>
        <label class="switch"><input type="checkbox" id="notify" ${s.notify ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><span class="lbl">تنبيه دخول وقت الصلاة</span>
        <label class="switch"><input type="checkbox" id="notifyPrayer" ${s.notifyPrayer ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><label for="notifyBefore">تذكير قبل الأذان</label>
        <select id="notifyBefore" style="width:auto">${[0, 5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${s.notifyBefore === m ? 'selected' : ''}>${m ? `${n(m)} دقائق` : 'بدون'}</option>`).join('')}</select></div>
      <div class="set-row"><span class="lbl">تذكير أذكار الصباح والمساء<span class="desc">بعد الفجر وبعد العصر</span></span>
        <label class="switch"><input type="checkbox" id="notifyAzkar" ${s.notifyAzkar ? 'checked' : ''}><span></span></label></div>
      <button class="btn soft block" id="calBtn" type="button" style="margin-top:10px">${icon('calendar')} أضف التنبيهات للتقويم (٣٠ يوم)</button>
      <p class="muted small" style="margin:8px 2px 0">التنبيهات داخل التطبيق تشتغل والتطبيق مفتوح أو بالخلفية. للتنبيه المضمون حتى لو الجوال مقفل، أضف المواعيد للتقويم مرة كل شهر.</p>
    </section>

    <section class="card">
      <div class="card-title">أخرى</div>
      <div class="set-row"><span class="lbl">أرقام عربية (١٢٣)</span>
        <label class="switch"><input type="checkbox" id="arabicDigits" ${s.arabicDigits ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><span class="lbl">نظام ٢٤ ساعة</span>
        <label class="switch"><input type="checkbox" id="clock24" ${s.clock24 ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><span class="lbl">صوت عند العدّ</span>
        <label class="switch"><input type="checkbox" id="tasbihSound" ${s.tasbihSound ? 'checked' : ''}><span></span></label></div>
      <div class="set-row" ${'vibrate' in navigator ? '' : 'hidden'}><span class="lbl">اهتزاز عند العدّ</span>
        <label class="switch"><input type="checkbox" id="tasbihVibrate" ${s.tasbihVibrate ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><label for="hijriOffset">تعديل التاريخ الهجري</label>
        <select id="hijriOffset" style="width:auto">${[-2, -1, 0, 1, 2].map((d) => `<option value="${d}" ${s.hijriOffset === d ? 'selected' : ''}>${d === 0 ? 'بدون تعديل' : `${d > 0 ? '+' : '−'}${n(Math.abs(d))} يوم`}</option>`).join('')}</select></div>
    </section>

    <section class="card about">
      <h3>صدقة جارية</h3>
      <p>هذا التطبيق صدقة جارية، مجاني وبدون إعلانات. لا تنسونا ووالدينا من صالح دعائكم ${icon('heart')}</p>
      <button class="btn soft block" id="shareApp2" type="button" style="margin:6px 0 12px">${icon('share')} شارك التطبيق</button>
      <div class="credits">
        <b>المصادر:</b><br>
        الأذكار: كتاب «حصن المسلم» للشيخ سعيد القحطاني.<br>
        نص القرآن والتفسير الميسّر: مجمع الملك فهد لطباعة المصحف الشريف، عبر <a href="https://alquran.cloud" target="_blank" rel="noopener">alquran.cloud</a>.<br>
        مواقيت الصلاة: تقويم أم القرى داخل المملكة، ورابطة العالم الإسلامي خارجها (مكتبة adhan).<br>
        البث المباشر للأذكار والتلاوات: <a href="https://mp3quran.net" target="_blank" rel="noopener">mp3quran.net</a>.<br>
        التلاوة عند الاستماع للآية: الشيخ مشاري العفاسي.
      </div>
    </section>
  `;
  let previewLoaded = false;
  const observer = new IntersectionObserver((es) => { if (!previewLoaded && es.some((e) => e.isIntersecting)) { previewLoaded = true; document.head.append(pv); } });
  observer.observe($('#fonts'));

  const bindSwitch = (id) => $('#' + id).addEventListener('change', (e) => { store.set(id, e.target.checked); applyLook(); });
  ['bold', 'autoNight', 'arabicDigits', 'clock24', 'tasbihSound', 'tasbihVibrate', 'notifyPrayer', 'notifyAzkar'].forEach(bindSwitch);
  const setSize = (v) => {
    v = Math.max(16, Math.min(34, v));
    $('#size').value = v;
    store.set('size', v);
    applyLook();
  };
  $('#size').addEventListener('input', (e) => setSize(+e.target.value));
  $('#sizeDown').addEventListener('click', () => setSize(store.get('size') - 1));
  $('#sizeUp').addEventListener('click', () => setSize(store.get('size') + 1));
  $('#fonts').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    store.set('font', b.dataset.f);
    $('#fonts').querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b));
    applyLook();
  }));
  $('#themes').querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
    store.set('theme', b.dataset.t);
    $('#themes').querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    applyLook();
  }));
  $('#hijriOffset').addEventListener('change', (e) => store.set('hijriOffset', +e.target.value));
  $('#notifyBefore').addEventListener('change', (e) => store.set('notifyBefore', +e.target.value));
  $('#notify').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const ok = await enableNotifications();
      e.target.checked = ok;
      store.set('notify', ok);
      if (ok) testNotification();
    } else store.set('notify', false);
    notifState();
  });
  $('#calBtn').addEventListener('click', exportCalendar);
  $('#cityPick').addEventListener('click', openCityPicker);
  $('#shareApp2').addEventListener('click', shareApp);
  store.on((k) => { if (k === 'city') $('#cityPick').textContent = `${city().name} · تغيير`; });
  store.on((k, v) => { if (k === 'size') $('#size').value = v; });
  notifState();
}

function notifState() {
  const el = $('#notifState');
  if (!('Notification' in window)) {
    el.textContent = 'في الآيفون: أضف التطبيق للشاشة الرئيسية أولاً';
    return;
  }
  el.textContent = Notification.permission === 'denied' ? 'التنبيهات مقفلة من إعدادات الجوال' : store.get('notify') ? 'مفعّلة ✓' : 'تنبيه بالأذان والأذكار';
}
