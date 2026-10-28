// اختيار المدينة لمواقيت الصلاة، ومشاركة التطبيق
import { store } from './store.js';
import { icon, esc, openSheet, closeSheet, toast, shareText } from './ui.js';

export const CITIES = [
  ['الرياض', 24.7136, 46.6753], ['مكة المكرمة', 21.4225, 39.8262], ['المدينة المنورة', 24.4672, 39.6111],
  ['جدة', 21.4858, 39.1925], ['الدمام', 26.4207, 50.0888], ['الخبر', 26.2172, 50.1971],
  ['الأحساء', 25.3833, 49.5865], ['القطيف', 26.5196, 50.0115], ['الجبيل', 27.0112, 49.6583],
  ['بريدة', 26.326, 43.975], ['عنيزة', 26.084, 43.994], ['الرس', 25.8694, 43.4973],
  ['حائل', 27.5114, 41.7208], ['تبوك', 28.3835, 36.5662], ['الطائف', 21.2703, 40.4158],
  ['ينبع', 24.0895, 38.0618], ['أبها', 18.2164, 42.5053], ['خميس مشيط', 18.3, 42.7333],
  ['جازان', 16.8892, 42.5511], ['نجران', 17.4924, 44.1277], ['الباحة', 20.0129, 41.4677],
  ['سكاكا', 29.9697, 40.2064], ['عرعر', 30.9753, 41.0381], ['حفر الباطن', 28.4328, 45.9708],
  ['الخرج', 24.1556, 47.3346], ['المجمعة', 25.9039, 45.3456], ['القريات', 31.3318, 37.3428],
];

function choose(c) {
  store.set('cityChosen', true);
  store.set('city', c);
  closeSheet();
  toast(`مواقيت ${c.name} ✓`);
}

export function openCityPicker() {
  const cur = store.get('city')?.name;
  const body = openSheet(`<h2>اختر مدينتك لمواقيت الصلاة</h2>
    <button class="btn primary block" id="useGps" type="button">${icon('compass')} استخدم موقعي الحالي</button>
    <input type="text" id="citySearch" placeholder="ابحث عن مدينة…" style="margin:12px 0 8px" aria-label="بحث عن مدينة">
    <div class="phrase-list" id="cityList">${CITIES.map(([n], i) => `<button class="phrase-item ${cur === n ? 'active' : ''}" data-i="${i}" type="button"><span>${n}</span>${cur === n ? icon('check') : ''}</button>`).join('')}</div>`,
    { close: () => { if (!store.get('cityChosen')) store.set('cityChosen', true); } });
  body.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
    const [name, lat, lng] = CITIES[+b.dataset.i];
    choose({ name, lat, lng });
  }));
  body.querySelector('#citySearch').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    body.querySelectorAll('[data-i]').forEach((b) => { b.hidden = q && !b.textContent.includes(q); });
  });
  body.querySelector('#useGps').addEventListener('click', (e) => {
    if (!navigator.geolocation) { toast('الموقع غير متاح في هذا الجهاز'); return; }
    e.currentTarget.innerHTML = '<span class="loader"></span>';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(4), lng = +pos.coords.longitude.toFixed(4);
        // نسمّي الموقع بأقرب مدينة لو كان قريب منها
        let best = null, bd = Infinity;
        for (const [n, a, o] of CITIES) { const d = (a - lat) ** 2 + (o - lng) ** 2; if (d < bd) { bd = d; best = n; } }
        choose({ name: bd < 0.15 ? best : 'موقعي', lat, lng });
      },
      () => { toast('ما قدرنا نحدد الموقع، اختر مدينتك من القائمة', 4000); e.target.closest('button').innerHTML = `${icon('compass')} استخدم موقعي الحالي`; },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  });
}

export function shareApp() {
  const url = location.href.split('#')[0];
  shareText(`تطبيق «سكينة» 🌿\nأذكار الصباح والمساء، سبحة، تفسير القرآن، ومواقيت الصلاة. مجاني وبدون إعلانات.\nصدقة جارية، لا تنسونا ووالدينا من دعائكم 🤍\n\n${url}`);
}
