// مواقيت الصلاة (تقويم أم القرى) والتاريخ الهجري وعدّاد رمضان
import { store } from './store.js';

// المدينة المختارة (الافتراضي الرياض حتى يختار المستخدم)
const DEFAULT_CITY = { name: 'الرياض', lat: 24.7136, lng: 46.6753 };
export const city = () => store.get('city') || DEFAULT_CITY;
// داخل المملكة تقويم أم القرى، وخارجها رابطة العالم الإسلامي
export function inSaudi({ lat, lng } = city()) {
  return lat > 16 && lat < 32.3 && lng > 34.5 && lng < 55.7;
}
const KAABA = { lat: 21.4225, lng: 39.8262 };

export const PRAYER_NAMES = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};
export const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d, k) {
  const x = new Date(d);
  x.setDate(x.getDate() + k);
  return x;
}

// ===== الهجري =====
let hijriFmt;
try {
  hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
  if (!/AH|\d{4}/.test(hijriFmt.format(new Date()))) throw 0;
} catch {
  hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic', { day: 'numeric', month: 'numeric', year: 'numeric' });
}
export const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const G_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function hijri(d = new Date()) {
  const x = addDays(d, store.get('hijriOffset') || 0);
  const parts = hijriFmt.formatToParts(x);
  const get = (t) => +parts.find((p) => p.type === t).value;
  return { day: get('day'), month: get('month'), year: get('year') };
}

// ===== مواقيت الصلاة =====
const cache = new Map();
export function prayerTimes(date = new Date()) {
  const day = startOfDay(date);
  const c = city();
  const key = `${day.getTime()}|${c.lat}|${c.lng}`;
  if (cache.has(key)) return cache.get(key);
  const A = window.adhan;
  const saudi = inSaudi(c);
  const params = saudi ? A.CalculationMethod.UmmAlQura() : A.CalculationMethod.MuslimWorldLeague();
  params.madhab = A.Madhab.Shafi;
  const pt = new A.PrayerTimes(new A.Coordinates(c.lat, c.lng), day, params);
  const t = {};
  for (const k of PRAYER_KEYS) t[k] = pt[k].getTime();
  // في رمضان: العشاء بعد المغرب بساعتين حسب تقويم أم القرى
  if (saudi && hijri(day).month === 9) t.isha = t.maghrib + 120 * 60000;
  cache.set(key, t);
  return t;
}

// الصلاة القادمة والسابقة (الشروق ليس صلاة لكن يُعرض)
export function nextPrayer(now = new Date()) {
  const today = prayerTimes(now);
  const ms = now.getTime();
  const order = PRAYER_KEYS;
  for (let i = 0; i < order.length; i++) {
    if (today[order[i]] > ms) {
      const prevKey = i === 0 ? 'isha' : order[i - 1];
      const prevTime = i === 0 ? prayerTimes(addDays(now, -1)).isha : today[prevKey];
      return { key: order[i], time: today[order[i]], prevKey, prevTime, today };
    }
  }
  const tomorrow = prayerTimes(addDays(now, 1));
  return { key: 'fajr', time: tomorrow.fajr, prevKey: 'isha', prevTime: today.isha, today, tomorrow: true };
}

// ===== رمضان =====
export function ramadanInfo(now = new Date()) {
  const h = hijri(now);
  if (h.month === 9) {
    // نهاية رمضان: أول يوم من شوال
    let d = startOfDay(now);
    for (let i = 0; i < 32; i++) {
      d = addDays(d, 1);
      if (hijri(d).month === 10) break;
    }
    return { inRamadan: true, day: h.day, eid: d };
  }
  let d = startOfDay(now);
  for (let i = 0; i < 400; i++) {
    d = addDays(d, 1);
    const x = hijri(d);
    if (x.month === 9 && x.day === 1) return { inRamadan: false, start: d, year: x.year };
  }
  return null;
}

// تذكيرات حسب اليوم: الجمعة، الاثنين والخميس، الأيام البيض، عرفة، عاشوراء
export function dayReminders(now = new Date()) {
  const out = [];
  const wd = now.getDay();
  const h = hijri(now);
  const tmr = hijri(addDays(now, 1));
  const tw = addDays(now, 1).getDay();
  if (wd === 5) out.push({ icon: 'book', title: 'يوم الجمعة', text: 'سورة الكهف نورٌ ما بين الجمعتين، وأكثر من الصلاة على النبي ﷺ. وآخر ساعة بعد العصر ساعة إجابة.' });
  if (wd === 4 && now.getHours() >= 15) out.push({ icon: 'book', title: 'ليلة الجمعة', text: 'أكثر الليلة من الصلاة على النبي ﷺ، وتذكّر قراءة سورة الكهف غداً.' });
  if ((tw === 1 || tw === 4) && h.month !== 9) out.push({ icon: 'crescent', title: tw === 1 ? 'غداً الاثنين' : 'غداً الخميس', text: 'يُستحب صيامه، «تُعرض الأعمال يوم الاثنين والخميس، فأحب أن يُعرض عملي وأنا صائم».' });
  if ([13, 14, 15].includes(tmr.day) && tmr.month !== 9 && !(tmr.month === 12 && tmr.day === 13)) out.push({ icon: 'crescent', title: 'الأيام البيض', text: `غداً ${tmr.day} ${HIJRI_MONTHS[tmr.month - 1]}، من الأيام البيض التي يُستحب صيامها.` });
  if (tmr.month === 12 && tmr.day === 9) out.push({ icon: 'heart', title: 'غداً يوم عرفة', text: 'صيامه يكفّر السنة الماضية والباقية، وخير الدعاء دعاء يوم عرفة.' });
  if (h.month === 12 && h.day === 9) out.push({ icon: 'heart', title: 'اليوم يوم عرفة', text: 'خير الدعاء دعاء يوم عرفة: لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.' });
  if (h.month === 12 && h.day <= 10 && h.day !== 9) out.push({ icon: 'heart', title: 'عشر ذي الحجة', text: 'أفضل أيام الدنيا، أكثر فيها من التهليل والتكبير والتحميد.' });
  if (tmr.month === 1 && (tmr.day === 9 || tmr.day === 10)) out.push({ icon: 'crescent', title: 'صيام عاشوراء', text: 'صيام يوم عاشوراء يكفّر السنة التي قبله، ويُستحب صيام التاسع معه.' });
  return out;
}

// ===== القبلة =====
export function qiblaBearing(lat = city().lat, lng = city().lng) {
  const r = Math.PI / 180;
  const p1 = lat * r, p2 = KAABA.lat * r, dl = (KAABA.lng - lng) * r;
  const y = Math.sin(dl);
  const x = Math.cos(p1) * Math.tan(p2) - Math.sin(p1) * Math.cos(dl);
  return (Math.atan2(y, x) / r + 360) % 360;
}
