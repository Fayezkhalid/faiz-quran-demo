'use strict';
/*
  Fayez Home HQ bridge
  - Serves ../index.html (the 3D tower page) on http://HOST:PORT
  - Reads the Bambu Lab printer live over LAN MQTT (mqtts://IP:8883, user "bblp", password = access code)
  - Sends WhatsApp notifications to the owner via CallMeBot
  - Keeps a small monthly home-finance ledger in data/finance.json
  - Pushes everything to the page with Server-Sent Events (/events)

  node server.js                 real printer from .env
  node server.js --demo-printer  fake printer, to test the page and WhatsApp without the printer
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '.env'));
const CFG = {
  host: process.env.HOST || '127.0.0.1',
  port: +(process.env.PORT || 8787),
  ip: (process.env.PRINTER_IP || '').trim(),
  serial: (process.env.PRINTER_SERIAL || '').trim(),
  code: (process.env.PRINTER_ACCESS_CODE || '').trim(),
  model: process.env.PRINTER_MODEL || 'A2L Combo',
  waPhone: (process.env.CALLMEBOT_PHONE || '').replace(/[^\d]/g, ''),
  waKey: (process.env.CALLMEBOT_APIKEY || '').trim(),
  tgToken: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  tgChat: (process.env.TELEGRAM_CHAT_ID || '').trim(),
  gmailUser: (process.env.GMAIL_USER || '').trim(),
  gmailPass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
  budget: +(process.env.MONTHLY_BUDGET || 9000),
  demo: process.argv.includes('--demo-printer') || process.env.DEMO_PRINTER === '1',
};
const PAGE = path.join(__dirname, '..', 'index.html');
const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });

/* ---------------- SSE ---------------- */
const clients = new Set();
function push(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

/* ---------------- finance ledger ---------------- */
const FIN_FILE = path.join(DATA, 'finance.json');
const monthKey = () => new Date().toISOString().slice(0, 7);
function loadFinance() {
  let f = null;
  try { f = JSON.parse(fs.readFileSync(FIN_FILE, 'utf8')); } catch (_) {}
  if (!f || f.month !== monthKey()) f = { month: monthKey(), budget: CFG.budget, spent: 0, bills: [] };
  f.budget = CFG.budget;
  return f;
}
let finance = loadFinance();
function saveFinance() { fs.writeFileSync(FIN_FILE, JSON.stringify(finance, null, 2)); }
function addBill(name, amount) {
  if (finance.month !== monthKey()) finance = loadFinance();
  finance.bills.push({ name, amount, at: new Date().toISOString() });
  finance.spent = Math.round((finance.spent + amount) * 100) / 100;
  saveFinance(); push('finance', finance);
  return finance;
}

/* ---------------- MBA program (academic advisor) ----------------
   IBA London · MBA Standard – Intake 26: 8 modules, 7 lectures each (Research has 8),
   then a final MCQ exam (60 questions, 120 min) and a take-home assignment (15 days). */
const MS_FILE = path.join(DATA, 'mba.json');
const MBA_MODULES = [['Strategic Planning', 'التخطيط الاستراتيجي', 7], ['Strategic Human Resource Management', 'إدارة الموارد البشرية', 7],
  ['Finance for Strategic Managers', 'الإدارة المالية', 7], ['Strategic Marketing', 'التسويق الاستراتيجي', 7],
  ['Personal Development for Leadership', 'التطوير الشخصي للقيادة', 7], ['Organizational Behaviour', 'السلوك التنظيمي', 7],
  ['Continuous Improvement', 'التحسين المستمر', 7], ['Research for Strategic Managers', 'البحث للمديرين الاستراتيجيين', 8]];
function loadMasters() {
  try { const m = JSON.parse(fs.readFileSync(MS_FILE, 'utf8')); if (m && Array.isArray(m.modules)) return m; } catch (_) {}
  return {
    program: 'MBA Standard – Intake 26', school: 'IBA London', start: new Date().toISOString().slice(0, 10),
    pacePerWeek: +(process.env.MASTERS_PACE_PER_WEEK || 2), lectureHours: 2, baseline: 1,
    modules: MBA_MODULES.map(([en, ar, n], i) => ({ en, ar, lectures: n, done: i === 0 ? 1 : 0, exam: false, assignment: false })),
    reminder: { time: process.env.MASTERS_REMINDER_TIME || '20:00', last: null },
  };
}
let masters = loadMasters();
function saveMasters() { fs.writeFileSync(MS_FILE, JSON.stringify(masters, null, 2)); push('masters', masters); }
function msCur() { const i = masters.modules.findIndex(x => x.done < x.lectures || !x.exam); return i < 0 ? masters.modules.length : i; }
function msState() {
  const m = masters.modules, ci = msCur(), total = m.reduce((a, x) => a + x.lectures, 0), done = m.reduce((a, x) => a + x.done, 0);
  const weeks = Math.max(0, (Date.now() - new Date(masters.start).getTime()) / 6048e5);
  const mod = m[Math.min(ci, m.length - 1)];
  return { ci, mod, finished: ci >= m.length, total, done, remaining: total - done, hoursLeft: (total - done) * masters.lectureHours,
    behind: Math.max(0, Math.floor(weeks * masters.pacePerWeek) - (done - (masters.baseline || 0))), examDue: mod.done >= mod.lectures && !mod.exam };
}
function msSummary() {
  const s = msState(); if (s.finished) return 'خلصت المحاور الثمانية كلها 🎓 مبروك!';
  const m = s.mod;
  return `المحور ${s.ci + 1}/8: ${m.ar}. ` + (s.examDue ? 'المحاضرات خلصت ✓ الجاي: الاختبار النهائي (60 سؤال، ساعتين). ' : `خلصت ${m.done} من ${m.lectures}. الجاية: Lech ${m.done + 1}. `) +
    `الإجمالي ${s.done}/${s.total} محاضرة، باقي ~${s.hoursLeft} ساعة.` + (s.behind > 0 ? ` متأخر ${s.behind} عن الخطة.` : ' ماشي على الخطة ✓');
}
function msApply(action) {
  const s = msState();
  if (action === 'assignment') { const m = masters.modules.find(x => !x.assignment); if (!m) return null; m.assignment = true; return { kind: 'assignment', m }; }
  if (s.finished) return null;
  if (action === 'exam') { s.mod.exam = true; return { kind: 'exam', m: s.mod }; }
  if (s.mod.done < s.mod.lectures) { s.mod.done++; return { kind: 'lecture', m: s.mod, n: s.mod.done }; }
  return { kind: 'examDue', m: s.mod };
}
// daily WhatsApp reminder at MASTERS_REMINDER_TIME (local time of this PC)
setInterval(() => {
  const now = new Date(), hhmm = now.toTimeString().slice(0, 5), today = now.toISOString().slice(0, 10);
  if (hhmm === masters.reminder.time && masters.reminder.last !== today && !msState().finished) {
    masters.reminder.last = today; saveMasters();
    whatsapp('📚 المرشد الأكاديمي: ' + msSummary());
  }
}, 30000);

/* ---------------- notifications: Telegram bot and/or WhatsApp (CallMeBot) ---------------- */
// Every agent alert goes through whatsapp(text); it now fans out to every configured channel.
const tgReady = () => !!CFG.tgToken;
const cmbReady = () => !!(CFG.waPhone && CFG.waKey);
const waReady = () => (tgReady() && !!tgChat()) || cmbReady();
const TG_FILE = path.join(DATA, 'telegram.json');
let tgChatId = CFG.tgChat;
try { if (!tgChatId) tgChatId = JSON.parse(fs.readFileSync(TG_FILE, 'utf8')).chat_id || ''; } catch (_) {}
function tgChat() { return tgChatId; }
async function tgApi(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${CFG.tgToken}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(35000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || ('telegram ' + r.status));
  return j.result;
}
// Pair automatically: the first person who sends /start to the bot becomes the owner (saved in data/telegram.json).
async function tgPairLoop() {
  if (!tgReady()) return;
  let offset = 0;
  log(tgChatId ? 'telegram ready (chat ' + tgChatId + ')' : 'telegram: send /start to your bot to pair it');
  for (;;) {
    try {
      const ups = await tgApi('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      for (const u of ups) {
        offset = u.update_id + 1;
        const m = u.message; if (!m || !m.chat) continue;
        if (!tgChatId && m.chat.type === 'private') {
          tgChatId = String(m.chat.id);
          fs.writeFileSync(TG_FILE, JSON.stringify({ chat_id: tgChatId, paired_at: new Date().toISOString() }));
          log('telegram paired with chat', tgChatId);
          await tgApi('sendMessage', { chat_id: tgChatId, text: '✅ تم الربط مع بيت فايز HQ. من الحين توصلك التنبيهات هنا.' });
          push('config', { whatsapp: waReady() });
        } else if (String(m.chat.id) === tgChatId && /^\/(status|حالة)/.test(m.text || '')) {
          await tgApi('sendMessage', { chat_id: tgChatId, text: `🏠 بيت فايز HQ\n🖨️ الطابعة: ${printer.state || '—'} ${printer.pct ? printer.pct + '%' : ''}\n💰 المصروف: ${finance.spent} / ${finance.budget}\n📚 ${msSummary()}` });
        }
      }
    } catch (e) { log('telegram error:', e.message); await new Promise(r => setTimeout(r, 10000)); }
  }
}
async function sendTelegram(text) {
  if (!tgReady() || !tgChatId) return false;
  try { await tgApi('sendMessage', { chat_id: tgChatId, text }); log('telegram sent:', text); return true; }
  catch (e) { log('telegram FAILED:', e.message); return false; }
}
async function sendCallMeBot(text) {
  if (!cmbReady()) return false;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${CFG.waPhone}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(CFG.waKey)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    const ok = r.ok && !/error|invalid|wrong/i.test(body.slice(0, 400));
    log(ok ? 'whatsapp sent:' : 'whatsapp FAILED:', text, ok ? '' : body.slice(0, 200).replace(/\s+/g, ' '));
    return ok;
  } catch (e) { log('whatsapp error:', e.message); return false; }
}
async function whatsapp(text) {
  if (!waReady()) { log('notification skipped (no Telegram or WhatsApp configured):', text); return false; }
  const res = await Promise.all([sendTelegram(text), sendCallMeBot(text)]);
  return res.some(Boolean);
}

/* ---------------- Gmail (read-only) for the email manager ----------------
   Uses an App Password over IMAP. The mailbox is opened read-only and messages are fetched with
   BODY.PEEK, so nothing is marked as read, moved, sent or deleted. Checks every 3 minutes. */
const MAIL_FILE = path.join(DATA, 'mail.json');
let mail = { lastUid: 0, unread: 0, recent: [], seenIds: [] };
try { Object.assign(mail, JSON.parse(fs.readFileSync(MAIL_FILE, 'utf8'))); } catch (_) {}
const saveMail = () => fs.writeFileSync(MAIL_FILE, JSON.stringify(mail, null, 1));
const gmailReady = () => !!(CFG.gmailUser && CFG.gmailPass);
// bills only (not shop receipts or bank statements, which would double-count spending)
const BILL_WORDS = /فاتور|invoice|\bbill\b|مستحق|سداد|كهرباء|SEC\b|المياه|NWC|STC|mobily|موبايلي|zain|زين|الاتصالات/i;
const IBA_WORDS = /ibalondon|iba london|IBA\b|MBA|ماجستير|assignment|lecture|محاضر/i;
function parseAmount(text) {
  const t = String(text || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.');
  const m = t.match(/(?:SAR|SR|ر\.?\s?س|ريال|﷼)\s*([\d,]+(?:\.\d{1,2})?)/i) || t.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:SAR|SR|ر\.?\s?س|ريال|﷼)/i);
  if (!m) return null; const v = Number(m[1].replace(/,/g, '')); return v > 0 && v < 100000 ? v : null;
}
function billName(from, subject) {
  const t = (from + ' ' + subject).toLowerCase();
  if (/sec|كهرباء|electric/.test(t)) return 'الكهرباء';
  if (/nwc|المياه|water/.test(t)) return 'المياه';
  if (/stc|mobily|موبايلي|zain|زين|اتصالات|internet|انترنت|fiber/.test(t)) return 'الاتصالات والإنترنت';
  return (subject || 'فاتورة').slice(0, 40);
}
async function checkGmail() {
  const { ImapFlow } = require('imapflow'); const { simpleParser } = require('mailparser');
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: CFG.gmailUser, pass: CFG.gmailPass }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  try {
    const st = await client.status('INBOX', { unseen: true, uidNext: true });
    mail.unread = st.unseen || 0;
    const first = !mail.lastUid;
    const from = first ? Math.max(1, st.uidNext - 15) : mail.lastUid + 1;   // first run: just look at the last 15
    const found = [];
    if (from < st.uidNext) {
      for await (const m of client.fetch(`${from}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
        if (m.uid < from) continue;
        mail.lastUid = Math.max(mail.lastUid, m.uid);
        const env = m.envelope || {}, sender = (env.from && env.from[0]) ? `${env.from[0].name || ''} <${env.from[0].address || ''}>` : '';
        const subject = env.subject || '';
        let text = '';
        try { const parsed = await simpleParser(m.source); text = (parsed.text || '').slice(0, 4000); } catch (_) {}
        const id = env.messageId || String(m.uid);
        if (mail.seenIds.includes(id)) continue;
        mail.seenIds.push(id); mail.seenIds = mail.seenIds.slice(-300);
        const item = { uid: m.uid, from: sender, subject, at: (env.date || new Date()).toISOString?.() || String(env.date) };
        if (BILL_WORDS.test(subject + ' ' + sender)) { item.kind = 'bill'; item.amount = parseAmount(subject + '\n' + text); item.name = billName(sender, subject); }
        else if (IBA_WORDS.test(subject + ' ' + sender)) item.kind = 'iba';
        else item.kind = 'mail';
        found.push(item);
      }
    }
    mail.lastUid = Math.max(mail.lastUid, st.uidNext - 1);
    mail.recent = found.concat(mail.recent).slice(0, 20);
    saveMail();
    push('mail', { unread: mail.unread, recent: mail.recent.slice(0, 6) });
    if (!first) for (const it of found) {
      if (it.kind === 'bill') {
        let note = '';
        if (it.amount) { addBill(it.name, it.amount); note = ` وسجلت ${it.amount} ريال في المالية`; }
        whatsapp(`💳 فاتورة جديدة: ${it.name}${it.amount ? ' · ' + it.amount + ' ريال' : ''}${note ? '.' + note : ' (ما لقيت المبلغ، سجله بنفسك)'}`);
        push('event', { type: 'mail_bill', name: it.name, amount: it.amount || 0 });
      } else if (it.kind === 'iba') {
        whatsapp(`🎓 إيميل من الماجستير: ${it.subject}`);
        push('event', { type: 'mail_iba', subject: it.subject });
      } else push('event', { type: 'mail_new', subject: it.subject, from: it.from });
    }
    log(`gmail checked: ${found.length} new, ${mail.unread} unread`);
  } finally { lock.release(); await client.logout().catch(() => {}); }
}
function startGmail() {
  if (!gmailReady()) { log('gmail: off (GMAIL_USER / GMAIL_APP_PASSWORD not set)'); return; }
  const run = () => checkGmail().catch(e => log('gmail error:', e.message));
  run(); setInterval(run, 3 * 60 * 1000);
}

/* ---------------- home manager: reminders (Telegram + phone call + calendar feed) ----------------
   Stored in data/home.json. Times are this PC's local time. A reminder fires `lead` minutes before `at`;
   repeating ones then move to the next date. With call=true the PC rings Fayez's phone through the
   call-me skill (Linphone) and reads the reminder out loud. */
const HOME_FILE = path.join(DATA, 'home.json');
let home = { items: [] };
try { home = JSON.parse(fs.readFileSync(HOME_FILE, 'utf8')); if (!Array.isArray(home.items)) home.items = []; } catch (_) {}
const saveHome = () => { fs.writeFileSync(HOME_FILE, JSON.stringify(home, null, 1)); push('home', publicHome()); };
const CAT = { home: '🏠 البيت', family: '👨‍👩‍👧 الأهل', maint: '🔧 صيانة' };
const pad = n => String(n).padStart(2, '0');
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function nextDate(d, rep) { const n = new Date(d); if (rep === 'daily') n.setDate(n.getDate() + 1); else if (rep === 'weekly') n.setDate(n.getDate() + 7); else if (rep === 'monthly') n.setMonth(n.getMonth() + 1); else if (rep === 'yearly') n.setFullYear(n.getFullYear() + 1); return n; }
function publicHome() { return { items: home.items.slice().sort((a, b) => new Date(a.at) - new Date(b.at)), call: callReady() }; }
const CALL_SCRIPT = process.env.CALLME_SCRIPT || path.join(require('os').homedir(), '.claude', 'skills', 'call-me', 'call_me.py');
const callReady = () => { try { return fs.existsSync(CALL_SCRIPT) && fs.existsSync(path.join(path.dirname(CALL_SCRIPT), 'sip-password.txt')); } catch (_) { return false; } };
let callQueue = Promise.resolve();
function phoneCall(text) {
  if (!callReady()) { log('call skipped (call-me skill not installed at', CALL_SCRIPT + ')'); return Promise.resolve(false); }
  callQueue = callQueue.then(() => new Promise(resolve => {
    const { spawn } = require('child_process');
    log('calling phone:', text);
    const py = process.platform === 'win32' ? 'python' : 'python3';
    const ch = spawn(py, [CALL_SCRIPT, text], { cwd: path.dirname(CALL_SCRIPT), windowsHide: true });
    const t = setTimeout(() => ch.kill(), 150000);
    ch.on('close', code => { clearTimeout(t); log('call finished, answered =', code === 0); resolve(code === 0); });
    ch.on('error', e => { clearTimeout(t); log('call error:', e.message); resolve(false); });
  }));
  return callQueue;
}
async function fireReminder(r) {
  const when = new Date(r.at), t = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const soon = r.lead ? ` (بعد ${r.lead >= 1440 ? Math.round(r.lead / 1440) + ' يوم' : r.lead >= 60 ? Math.round(r.lead / 60) + ' ساعة' : r.lead + ' دقيقة'})` : '';
  const msg = `⏰ تذكير ${CAT[r.cat] || ''}: ${r.title}${soon} · الساعة ${t}`;
  whatsapp(msg);
  push('event', { type: 'reminder', id: r.id, title: r.title, cat: r.cat, call: !!r.call });
  if (r.call) phoneCall(`هلا أبو خالد، معك مدير البيت. تذكير: ${r.title}${r.lead ? '' : '، الحين'}.`);
}
setInterval(() => {
  const now = Date.now(); let changed = false;
  for (const r of home.items) {
    if (r.done) continue;
    const fireAt = new Date(r.at).getTime() - (r.lead || 0) * 60000;
    if (now >= fireAt && r.firedFor !== r.at) {
      r.firedFor = r.at; changed = true;
      if (now - fireAt < 6 * 3600000) fireReminder(r);   // don't spam very old ones after the PC was off
      if (r.repeat && r.repeat !== 'none') { let n = new Date(r.at); while (n.getTime() - (r.lead || 0) * 60000 <= now) n = nextDate(n, r.repeat); r.at = localIso(n); }
    }
  }
  const before = home.items.length;
  home.items = home.items.filter(r => r.repeat !== 'none' || r.firedFor !== r.at || now - new Date(r.at).getTime() < 2 * 86400000);
  if (changed || home.items.length !== before) saveHome();
}, 20000);
function icsEscape(s) { return String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n'); }
function homeIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const fmt = iso => iso.replace(/[-:]/g, '') + '00';
  const RR = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
  const ev = home.items.filter(r => !r.done).map(r => {
    const end = localIso(new Date(new Date(r.at).getTime() + 30 * 60000));
    return ['BEGIN:VEVENT', `UID:${r.id}@fayez-home-hq`, `DTSTAMP:${stamp}`, `DTSTART:${fmt(r.at)}`, `DTEND:${fmt(end)}`,
      `SUMMARY:${icsEscape((CAT[r.cat] || '') + ' ' + r.title)}`, RR[r.repeat] ? `RRULE:FREQ=${RR[r.repeat]}` : null,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(r.title)}`, `TRIGGER:-PT${r.lead || 0}M`, 'END:VALARM', 'END:VEVENT'].filter(Boolean).join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fayez Home HQ//AR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:بيت فايز', 'X-WR-TIMEZONE:Asia/Riyadh', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

/* ---------------- printer ---------------- */
const printer = { connected: false, state: null, pct: 0, layer: 0, total: 0, nozzle: null, bed: null, remaining: null, name: '', error: 0, tray: null, trays: [null, null, null, null] };
let lastState = null;
// phone call when a print finishes and/or fails (PRINT_CALL=done,fail · set PRINT_CALL=off to disable)
const PRINT_CALL = (process.env.PRINT_CALL || 'done,fail').toLowerCase();
function onPrinterState() {
  push('printer', printer);
  const prev = lastState, next = printer.state;
  if (!next || prev === next) return;
  lastState = next;
  if (prev === null) return; // first report after start-up: no notifications
  const name = printer.name || 'القطعة';
  if (next === 'RUNNING' && prev !== 'PAUSE') {
    push('event', { type: 'print_start', name });
    whatsapp(`🖨️ بدأت طباعة ${name} على ${CFG.model}`);
  } else if (next === 'FINISH') {
    whatsapp(`✅ خلصت طباعة ${name} على ${CFG.model}`).then(ok => push('event', { type: 'print_done', name, whatsapp: ok }));
    if (PRINT_CALL.includes('done')) phoneCall(`هلا أبو خالد، معك مدير الطابعات. خلصت طباعة ${name}، تقدر تشيلها من الطابعة.`);
  } else if (next === 'FAILED' || (next === 'PAUSE' && printer.error)) {
    whatsapp(`⚠️ الطابعة ${CFG.model} وقفت أثناء طباعة ${name}${printer.error ? ' (خطأ ' + printer.error + ')' : ''}`)
      .then(ok => push('event', { type: 'print_failed', name, error: printer.error || null, whatsapp: ok }));
    if (PRINT_CALL.includes('fail')) phoneCall(`هلا أبو خالد، معك مدير الطابعات. الطابعة وقفت أثناء طباعة ${name}، تحتاج تشوفها.`);
  }
}
function mergeReport(p) {
  if (!p || typeof p !== 'object') return;
  if (p.gcode_state != null) printer.state = String(p.gcode_state);
  if (p.mc_percent != null) printer.pct = +p.mc_percent;
  if (p.layer_num != null) printer.layer = +p.layer_num;
  if (p.total_layer_num != null) printer.total = +p.total_layer_num;
  if (p.nozzle_temper != null) printer.nozzle = +p.nozzle_temper;
  if (p.bed_temper != null) printer.bed = +p.bed_temper;
  if (p.mc_remaining_time != null) printer.remaining = +p.mc_remaining_time;
  if (p.subtask_name != null) printer.name = String(p.subtask_name).replace(/\.(gcode\.)?3mf$/i, '');
  if (p.print_error != null) printer.error = +p.print_error;
  // active AMS slot. Classic firmware: print.ams.tray_now ("0".."3", "254" = external, "255" = none).
  // Newer firmware: print.device.extruder.info[0].snow = (ams_id << 8) | slot, 0xFF00 = none.
  // tray_now is a global index (ams_id * 4 + slot); the A2L's AMS lite reports ams id 16, so 16*4+slot = 64..67
  if (p.ams && p.ams.tray_now != null) { const t = +p.ams.tray_now; printer.tray = t >= 0 && t < 254 ? (t & 3) : null; printer.traySrc = 'tray_now'; }
  const ex = p.device && p.device.extruder && Array.isArray(p.device.extruder.info) ? p.device.extruder.info[0] : null;
  if (ex && ex.snow != null) { const v = +ex.snow, amsId = v >> 8, slot = v & 0xff; printer.tray = amsId !== 255 && slot < 4 ? slot : null; printer.traySrc = 'snow'; }
  // AMS lite slot colours/materials: print.ams.ams[0].tray[i] = { id, tray_color: 'RRGGBBAA', tray_type, remain }
  const unit = p.ams && Array.isArray(p.ams.ams) ? p.ams.ams[0] : null;
  if (unit && Array.isArray(unit.tray)) for (const t of unit.tray) {
    const i = +t.id; if (!(i >= 0 && i < 4)) continue;
    const cur = printer.trays[i] || {};
    if (typeof t.tray_color === 'string' && /^[0-9a-f]{6}/i.test(t.tray_color)) { cur.color = '#' + t.tray_color.slice(0, 6); cur.empty = false; }
    if (typeof t.tray_type === 'string') { cur.type = t.tray_type; if (!t.tray_type) cur.empty = true; }
    if (t.remain != null && +t.remain >= 0) cur.remain = +t.remain;
    printer.trays[i] = cur;
  }
  onPrinterState();
}
// keep the latest raw report sections for diagnosis (no secrets in them)
const RAW_FILE = path.join(DATA, 'last-report.json');
const rawKeep = {};
function keepRaw(p) {
  if (!p || typeof p !== 'object') return;
  for (const k of ['ams', 'device', 'vt_tray', 'gcode_state', 'mc_percent', 'layer_num']) if (p[k] !== undefined) rawKeep[k] = p[k];
  rawKeep.keys = Object.keys(p).slice(0, 200); rawKeep.at = new Date().toISOString();
  try { fs.writeFileSync(RAW_FILE, JSON.stringify(rawKeep, null, 1)); } catch (_) {}
}
let mqttClient = null;
const printerReady = () => CFG.demo || !!(CFG.ip && CFG.serial && CFG.code);
function connectPrinter() {
  if (CFG.demo) return demoPrinter();
  if (!printerReady()) { log('printer skipped (PRINTER_IP / PRINTER_SERIAL / PRINTER_ACCESS_CODE not set)'); return; }
  const mqtt = require('mqtt');
  const report = `device/${CFG.serial}/report`, request = `device/${CFG.serial}/request`;
  mqttClient = mqtt.connect(`mqtts://${CFG.ip}:8883`, {
    username: 'bblp', password: CFG.code,
    rejectUnauthorized: false, // the printer uses a self-signed certificate on the local network
    reconnectPeriod: 5000, connectTimeout: 10000, clientId: 'fayez-hq-' + Math.random().toString(16).slice(2, 8),
  });
  mqttClient.on('connect', () => {
    printer.connected = true; log('printer connected', CFG.ip);
    mqttClient.subscribe(report, err => {
      if (err) return log('subscribe error:', err.message);
      mqttClient.publish(request, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
    });
    push('printer', printer);
  });
  mqttClient.on('message', (_t, buf) => { try {
    const p = JSON.parse(buf.toString()).print; keepRaw(p);
    if (p && ['pause', 'resume', 'stop'].includes(p.command)) {  // the printer's answer to a control command
      log('printer command reply:', p.command, p.result || '', p.reason || '', p.err_code || '');
      push('event', { type: 'cmd_result', cmd: p.command, result: p.result || '', reason: p.reason || '', code: p.err_code || null });
    }
    mergeReport(p);
  } catch (_) {} });
  mqttClient.on('close', () => { if (printer.connected) log('printer disconnected'); printer.connected = false; push('printer', printer); });
  mqttClient.on('error', e => log('printer error:', e.message));
  printer.command = cmd => new Promise((res, rej) => {
    if (!printer.connected) return rej(new Error('printer offline'));
    log('printer command sent:', cmd);
    mqttClient.publish(request, JSON.stringify({ print: { sequence_id: String(Date.now() % 100000), command: cmd, param: '' } }), e => e ? rej(e) : res());
  });
}
function demoPrinter() {
  log('DEMO printer: a fake 90-second print starts every 3 minutes');
  printer.connected = true;
  let t = null;
  const set = p => mergeReport(p);
  set({ gcode_state: 'IDLE', mc_percent: 0, nozzle_temper: 27, bed_temper: 26, ams: { tray_now: '0', ams: [{ id: '0', tray: [
    { id: '0', tray_color: '161616FF', tray_type: 'PLA', remain: 80 }, { id: '1', tray_color: 'F2F2F2FF', tray_type: 'PLA', remain: 55 },
    { id: '2', tray_color: 'FF6A13FF', tray_type: 'PLA', remain: 30 }, { id: '3', tray_color: 'FEC600FF', tray_type: 'PETG', remain: 90 }] }] } });
  function run() {
    const total = 120;
    set({ gcode_state: 'RUNNING', mc_percent: 0, layer_num: 0, total_layer_num: total, subtask_name: 'حامل جوال.3mf', nozzle_temper: 220, bed_temper: 65, mc_remaining_time: 2 });
    let pct = 0;
    clearInterval(t);
    t = setInterval(() => {
      if (printer.state === 'PAUSE') return;
      pct = Math.min(100, pct + 2);
      set({ mc_percent: pct, layer_num: Math.round(total * pct / 100), mc_remaining_time: Math.max(0, Math.round((100 - pct) / 2 * 1.8 / 60)) });
      if (pct >= 100) { clearInterval(t); set({ gcode_state: 'FINISH', nozzle_temper: 40 }); setTimeout(() => set({ gcode_state: 'IDLE', mc_percent: 0, layer_num: 0 }), 20000); }
    }, 1800);
  }
  setTimeout(run, 8000); setInterval(run, 180000);
  printer.command = async cmd => {
    if (cmd === 'pause' && printer.state === 'RUNNING') set({ gcode_state: 'PAUSE' });
    else if (cmd === 'resume' && printer.state === 'PAUSE') set({ gcode_state: 'RUNNING' });
  };
}

/* ---------------- HTTP ---------------- */
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => { size += c.length; if (size > 10000) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (_) { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return fs.createReadStream(PAGE).pipe(res);
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, { bridge: true, config: { printer: printerReady(), whatsapp: waReady(), telegram: tgReady() && !!tgChatId, callmebot: cmbReady(), gmail: gmailReady(), call: callReady(), model: CFG.model, demo: CFG.demo }, printer, finance, masters, home: publicHome(), mail: { unread: mail.unread, recent: mail.recent.slice(0, 6) } });
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res); req.on('close', () => clients.delete(res));
      res.write(`event: printer\ndata: ${JSON.stringify(printer)}\n\n`);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/whatsapp') {
      const b = await readBody(req);
      const text = String(b.text || '').trim().slice(0, 500);
      if (!text) return json(res, 400, { error: 'text required' });
      return json(res, 200, { ok: await whatsapp(text) });
    }
    if (req.method === 'POST' && url.pathname === '/api/finance') {
      const b = await readBody(req);
      const name = String(b.name || '').trim().slice(0, 60), amount = Number(b.amount);
      if (!name || !isFinite(amount) || amount <= 0 || amount > 1e6) return json(res, 400, { error: 'name and a positive amount required' });
      return json(res, 200, addBill(name, Math.round(amount * 100) / 100));
    }
    if (req.method === 'POST' && url.pathname === '/api/masters') {
      const b = await readBody(req);
      if (['lecture', 'exam', 'assignment'].includes(b.action)) {
        const result = msApply(b.action); saveMasters();
        return json(res, 200, { masters, result });
      }
      if (b.action === 'set') {
        const mods = Array.isArray(b.modules) ? b.modules : null;
        if (mods && mods.length === masters.modules.length) mods.forEach((x, i) => {
          const m = masters.modules[i]; m.done = Math.max(0, Math.min(m.lectures, Number(x.done) || 0)); m.exam = !!x.exam; m.assignment = !!x.assignment; });
        if (b.start && /^\d{4}-\d{2}-\d{2}$/.test(b.start)) masters.start = b.start;
        if (Number(b.pacePerWeek) > 0) masters.pacePerWeek = Number(b.pacePerWeek);
        if (Number.isInteger(b.baseline) && b.baseline >= 0) masters.baseline = b.baseline;
        if (b.reminderTime && /^\d{2}:\d{2}$/.test(b.reminderTime)) masters.reminder.time = b.reminderTime;
        saveMasters(); return json(res, 200, { masters });
      }
      return json(res, 400, { error: 'action must be lecture, exam, assignment or set' });
    }
    if (req.method === 'GET' && url.pathname === '/home.ics') {
      res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' }); return res.end(homeIcs());
    }
    if (req.method === 'POST' && url.pathname === '/api/home') {
      const b = await readBody(req);
      if (b.action === 'add') {
        const title = String(b.title || '').trim().slice(0, 120), at = String(b.at || '');
        if (!title || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) || isNaN(new Date(at))) return json(res, 400, { error: 'title and at (YYYY-MM-DDTHH:MM) required' });
        const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, at, cat: CAT[b.cat] ? b.cat : 'home',
          repeat: ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(b.repeat) ? b.repeat : 'none', lead: Math.max(0, Math.min(10080, Number(b.lead) || 0)), call: !!b.call, created: new Date().toISOString() };
        home.items.push(r); saveHome();
        whatsapp(`📅 انحفظ موعد ${CAT[r.cat]}: ${r.title} · ${r.at.replace('T', ' ')}${r.repeat !== 'none' ? ' (يتكرر)' : ''}${r.call ? ' · 📞 مع اتصال' : ''}`);
        return json(res, 200, publicHome());
      }
      if (b.action === 'delete') { home.items = home.items.filter(r => r.id !== b.id); saveHome(); return json(res, 200, publicHome()); }
      if (b.action === 'testcall') { const ok = await phoneCall('هلا أبو خالد، معك مدير البيت. هذا اتصال تجريبي من بيت فايز.'); return json(res, 200, { ok }); }
      return json(res, 400, { error: 'action must be add, delete or testcall' });
    }
    if (req.method === 'POST' && url.pathname === '/api/printer') {
      const b = await readBody(req);
      if (!['pause', 'resume'].includes(b.cmd)) return json(res, 400, { error: 'cmd must be pause or resume' });
      if (!printer.command) return json(res, 409, { error: 'printer not configured' });
      await printer.command(b.cmd);
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: e.message }); }
});

server.listen(CFG.port, CFG.host, () => {
  log(`Fayez Home HQ → http://${CFG.host === '0.0.0.0' ? 'localhost' : CFG.host}:${CFG.port}`);
  log(`printer: ${CFG.demo ? 'DEMO' : printerReady() ? CFG.model + ' @ ' + CFG.ip : 'not configured'} · telegram: ${tgReady() ? (tgChatId ? 'ready' : 'waiting for /start') : 'off'} · whatsapp: ${cmbReady() ? 'ready' : 'off'}`);
  connectPrinter();
  tgPairLoop();
  startGmail();
});

/* ---------------- utils ---------------- */
function log(...a) { console.log(new Date().toLocaleTimeString('en-GB'), ...a); }
function loadEnv(file) {
  let txt; try { txt = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
