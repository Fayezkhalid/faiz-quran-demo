// التنبيهات: داخل التطبيق + ملف تقويم يضمن التنبيه حتى لو التطبيق مقفل
import { store } from './store.js';
import { toast, chime, n } from './ui.js';
import { prayerTimes, PRAYER_NAMES, addDays, city } from './time.js';

let timers = [];

export async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('في الآيفون: افتح التطبيق من الشاشة الرئيسية ثم فعّل التنبيهات', 4500);
    return false;
  }
  if (Notification.permission === 'granted') return true;
  const p = await Notification.requestPermission();
  if (p !== 'granted') toast('ما تم السماح بالتنبيهات');
  return p === 'granted';
}

async function show(title, body, tag) {
  if (document.visibilityState === 'visible') {
    toast(`${title} · ${body}`, 6000);
    chime();
  }
  if (!store.get('notify') || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'ar', dir: 'rtl', vibrate: [200, 100, 200] };
    if (reg) reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {}
}

export function testNotification() {
  show('تم تفعيل التنبيهات 🌸', 'بنذكّرك بالأذان والأذكار بإذن الله', 'test');
}

// نجدول تنبيهات اليوم والغد (تشتغل والتطبيق مفتوح أو بالخلفية)
export function scheduleNotifications() {
  timers.forEach(clearTimeout);
  timers = [];
  const now = Date.now();
  const events = [];
  for (const day of [new Date(), addDays(new Date(), 1)]) {
    const t = prayerTimes(day);
    for (const k of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      if (store.get('notifyPrayer')) events.push({ at: t[k], title: `حان وقت صلاة ${PRAYER_NAMES[k]}`, body: `حسب توقيت ${city().name}`, tag: 'p-' + k });
      const before = store.get('notifyBefore');
      if (before) events.push({ at: t[k] - before * 60000, title: `باقي ${n(before)} دقائق على أذان ${PRAYER_NAMES[k]}`, body: 'استعدّ للصلاة 🤍', tag: 'b-' + k });
    }
    if (store.get('notifyAzkar')) {
      events.push({ at: t.fajr + 25 * 60000, title: 'أذكار الصباح ☀️', body: 'صباح الخير، حان وقت أذكار الصباح', tag: 'az-m' });
      events.push({ at: t.asr + 20 * 60000, title: 'أذكار المساء 🌙', body: 'مساء الخير، حان وقت أذكار المساء', tag: 'az-e' });
    }
  }
  for (const e of events) {
    const ms = e.at - now;
    if (ms > 0 && ms < 26 * 3600000) timers.push(setTimeout(() => show(e.title, e.body, e.tag), ms));
  }
}

// ===== ملف التقويم (.ics) =====
function icsDate(ms) {
  const d = new Date(ms);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
export async function exportCalendar() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sakina//Um Fayez//AR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:سكينة - مواقيت الصلاة', 'METHOD:PUBLISH'];
  const stamp = icsDate(Date.now());
  const before = store.get('notifyBefore');
  const add = (uid, start, mins, title, desc, alarm = 0) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@sakina`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(start + mins * 60000)}`, `SUMMARY:${title}`, `DESCRIPTION:${desc}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, `TRIGGER:-PT${alarm}M`, 'END:VALARM', 'END:VEVENT');
  };
  for (let i = 0; i < 30; i++) {
    const day = addDays(new Date(), i);
    const t = prayerTimes(day);
    const id = `${day.getFullYear()}${day.getMonth() + 1}${day.getDate()}`;
    for (const k of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      add(`${id}-${k}`, t[k], 15, `🕌 صلاة ${PRAYER_NAMES[k]}`, `أذان ${PRAYER_NAMES[k]} - ${city().name}`, before || 0);
    }
    if (store.get('notifyAzkar')) {
      add(`${id}-azm`, t.fajr + 25 * 60000, 20, '☀️ أذكار الصباح', 'افتح تطبيق سكينة لأذكار الصباح');
      add(`${id}-aze`, t.asr + 20 * 60000, 20, '🌙 أذكار المساء', 'افتح تطبيق سكينة لأذكار المساء');
    }
  }
  lines.push('END:VCALENDAR');
  const text = lines.join('\r\n');
  const file = new File([text], 'sakina-prayer-times.ics', { type: 'text/calendar' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'مواقيت الصلاة' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  toast('افتح الملف واختر «إضافة الكل» للتقويم', 5000);
}
