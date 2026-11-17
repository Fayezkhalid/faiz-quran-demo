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

/* ---------------- master's program (academic advisor) ---------------- */
const MS_FILE = path.join(DATA, 'masters.json');
function loadMasters() {
  try { const m = JSON.parse(fs.readFileSync(MS_FILE, 'utf8')); if (m && Array.isArray(m.courses)) return m; } catch (_) {}
  return {
    program: 'الماجستير', start: new Date().toISOString().slice(0, 10), pacePerWeek: 2,
    courses: Array.from({ length: 7 }, (_, i) => ({ name: `المادة ${i + 1}`, hours: 2, done: false, doneAt: null, link: '' })),
    exam: { type: 'MCQ', hours: 2, date: null },
    reminder: { time: process.env.MASTERS_REMINDER_TIME || '20:00', last: null },
  };
}
let masters = loadMasters();
function saveMasters() { fs.writeFileSync(MS_FILE, JSON.stringify(masters, null, 2)); push('masters', masters); }
function msState() {
  const c = masters.courses, done = c.filter(x => x.done).length, ni = c.findIndex(x => !x.done);
  const weeks = Math.max(0, (Date.now() - new Date(masters.start).getTime()) / 6048e5);
  return { done, total: c.length, remaining: c.length - done, hoursLeft: c.filter(x => !x.done).reduce((a, x) => a + x.hours, 0),
    next: c[ni < 0 ? c.length - 1 : ni], finished: ni < 0, behind: Math.max(0, Math.floor(weeks * masters.pacePerWeek) - done) };
}
function msSummary() {
  const m = msState();
  if (m.finished) return `خلصت المواد السبع كلها 🎉 باقي اختبار الاختيارات المتعددة (ساعتين).`;
  return `خلصت ${m.done} من ${m.total}. باقي ${m.remaining} مواد (${m.hoursLeft} ساعة). الجاية: ${m.next.name}${m.next.link ? ' ' + m.next.link : ''}.` +
    (m.behind > 0 ? ` متأخر ${m.behind} عن الخطة (${masters.pacePerWeek} بالأسبوع).` : ' ماشي على الخطة ✓');
}
// daily WhatsApp reminder at MASTERS_REMINDER_TIME (local time of this PC)
setInterval(() => {
  const now = new Date(), hhmm = now.toTimeString().slice(0, 5), today = now.toISOString().slice(0, 10);
  if (hhmm === masters.reminder.time && masters.reminder.last !== today && !msState().finished) {
    masters.reminder.last = today; saveMasters();
    whatsapp('📚 تذكير الماجستير من المرشد الأكاديمي: ' + msSummary());
  }
}, 30000);

/* ---------------- WhatsApp (CallMeBot) ---------------- */
const waReady = () => !!(CFG.waPhone && CFG.waKey);
async function whatsapp(text) {
  if (!waReady()) { log('whatsapp skipped (CALLMEBOT_PHONE / CALLMEBOT_APIKEY not set):', text); return false; }
  const url = `https://api.callmebot.com/whatsapp.php?phone=${CFG.waPhone}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(CFG.waKey)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    const ok = r.ok && !/error|invalid|wrong/i.test(body.slice(0, 400));
    log(ok ? 'whatsapp sent:' : 'whatsapp FAILED:', text, ok ? '' : body.slice(0, 200).replace(/\s+/g, ' '));
    return ok;
  } catch (e) { log('whatsapp error:', e.message); return false; }
}

/* ---------------- printer ---------------- */
const printer = { connected: false, state: null, pct: 0, layer: 0, total: 0, nozzle: null, bed: null, remaining: null, name: '', error: 0, tray: null };
let lastState = null;
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
  } else if (next === 'FAILED' || (next === 'PAUSE' && printer.error)) {
    whatsapp(`⚠️ الطابعة ${CFG.model} وقفت أثناء طباعة ${name}${printer.error ? ' (خطأ ' + printer.error + ')' : ''}`)
      .then(ok => push('event', { type: 'print_failed', name, error: printer.error || null, whatsapp: ok }));
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
  if (p.ams && p.ams.tray_now != null) printer.tray = +p.ams.tray_now;
  onPrinterState();
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
  mqttClient.on('message', (_t, buf) => { try { mergeReport(JSON.parse(buf.toString()).print); } catch (_) {} });
  mqttClient.on('close', () => { if (printer.connected) log('printer disconnected'); printer.connected = false; push('printer', printer); });
  mqttClient.on('error', e => log('printer error:', e.message));
  printer.command = cmd => new Promise((res, rej) => {
    if (!printer.connected) return rej(new Error('printer offline'));
    mqttClient.publish(request, JSON.stringify({ print: { sequence_id: '0', command: cmd, param: '' } }), e => e ? rej(e) : res());
  });
}
function demoPrinter() {
  log('DEMO printer: a fake 90-second print starts every 3 minutes');
  printer.connected = true;
  let t = null;
  const set = p => mergeReport(p);
  set({ gcode_state: 'IDLE', mc_percent: 0, nozzle_temper: 27, bed_temper: 26 });
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
      return json(res, 200, { bridge: true, config: { printer: printerReady(), whatsapp: waReady(), model: CFG.model, demo: CFG.demo }, printer, finance, masters });
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
      const b = await readBody(req), c = masters.courses, i = Number(b.index);
      if (b.action === 'done' || b.action === 'undo') {
        if (!Number.isInteger(i) || i < 0 || i >= c.length) return json(res, 400, { error: 'bad index' });
        c[i].done = b.action === 'done'; c[i].doneAt = c[i].done ? new Date().toISOString() : null;
      } else if (b.action === 'set') {
        if (!Array.isArray(b.courses) || !b.courses.length || b.courses.length > 20) return json(res, 400, { error: 'courses array required' });
        masters.courses = b.courses.map((x, k) => ({ name: String(x.name || `المادة ${k + 1}`).slice(0, 80), hours: Number(x.hours) || 2,
          done: !!x.done, doneAt: x.done ? (x.doneAt || new Date().toISOString()) : null, link: /^https?:\/\//.test(x.link || '') ? String(x.link).slice(0, 300) : '' }));
        if (b.start && /^\d{4}-\d{2}-\d{2}$/.test(b.start)) masters.start = b.start;
        if (Number(b.pacePerWeek) > 0) masters.pacePerWeek = Number(b.pacePerWeek);
        if (b.reminderTime && /^\d{2}:\d{2}$/.test(b.reminderTime)) masters.reminder.time = b.reminderTime;
      } else return json(res, 400, { error: 'action must be done, undo or set' });
      saveMasters();
      return json(res, 200, masters);
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
  log(`printer: ${CFG.demo ? 'DEMO' : printerReady() ? CFG.model + ' @ ' + CFG.ip : 'not configured'} · whatsapp: ${waReady() ? 'ready' : 'not configured'}`);
  connectPrinter();
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
