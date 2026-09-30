/**
 * جاهزية الجودة الشهرية · فرع S192
 * Google Apps Script backend: serves the page and stores answers in the bound Google Sheet.
 */

// غيّر هذا الرقم السري قبل النشر. لا يظهر لأي أحد يفتح الرابط.
const ADMIN_PIN = 'CHANGE-ME';

const QUESTION_COUNT = {
  deli: 23, bakery: 18, produce: 17, brickoven: 15, meat: 18, seafood: 20
};
const SHEET_NAME = 'Checks';
const HEADER = ['month', 'dept', 'owner', 'answers', 'notes', 'submitted', 'submittedAt', 'updatedAt', 'answered', 'yes', 'no'];
const MAX_PIN_FAILS = 8;

function doGet(e) {
  const p = (e && e.parameter) || {};
  const boot = {
    dept: QUESTION_COUNT[p.dept] ? p.dept : null,
    admin: Object.prototype.hasOwnProperty.call(p, 'admin'),
    url: ScriptApp.getService().getUrl()
  };
  const html = HtmlService.createHtmlOutputFromFile('Index').getContent()
    .replace('/*BOOT*/', 'window.BOOT=' + JSON.stringify(boot) + ';');
  return HtmlService.createHtmlOutput(html)
    .setTitle('جاهزية الجودة الشهرية فرع S192')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- public calls (department heads) ---------- */

function getMonth(month) {
  checkMonth_(month);
  const out = {};
  readRows_().forEach(function (r) {
    if (r.doc.month === month) {
      const d = r.doc;
      out[d.dept] = { dept: d.dept, month: d.month, owner: d.owner, answers: d.answers, notes: {}, submitted: d.submitted, submittedAt: d.submittedAt, updatedAt: d.updatedAt };
    }
  });
  return out;
}

function getDept(month, dept) {
  checkMonth_(month); checkDept_(dept);
  const r = findRow_(month, dept);
  return r ? r.doc : null;
}

function saveDept(month, dept, data) {
  return write_(month, dept, data, false);
}

function submitDept(month, dept, data) {
  return write_(month, dept, data, true);
}

/* ---------- admin calls (PIN checked on the server) ---------- */

function adminCheck(pin) {
  checkPin_(pin);
  return true;
}

function adminMonth(month, pin) {
  checkPin_(pin); checkMonth_(month);
  const out = {};
  readRows_().forEach(function (r) { if (r.doc.month === month) out[r.doc.dept] = r.doc; });
  return out;
}

function adminReopen(month, dept, pin) {
  checkPin_(pin); checkMonth_(month); checkDept_(dept);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = findRow_(month, dept);
    if (!r) return true;
    const sh = sheet_();
    sh.getRange(r.row, 6, 1, 3).setValues([[false, '', Date.now()]]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- internals ---------- */

function write_(month, dept, data, submit) {
  checkMonth_(month); checkDept_(dept);
  const clean = clean_(dept, data || {});
  const n = QUESTION_COUNT[dept];
  let answered = 0, yes = 0, no = 0;
  Object.keys(clean.answers).forEach(function (k) {
    answered++;
    if (clean.answers[k] === 'y') yes++; else no++;
  });
  if (submit) {
    const missingNote = Object.keys(clean.answers).some(function (k) {
      return clean.answers[k] === 'n' && !String(clean.notes[k] || '').trim();
    });
    if (answered !== n || missingNote || !clean.owner) throw new Error('incomplete');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = Date.now();
    const existing = findRow_(month, dept);
    if (existing && existing.doc.submitted) throw new Error('locked');
    const values = [month, dept, clean.owner, JSON.stringify(clean.answers), JSON.stringify(clean.notes),
      !!submit, submit ? now : '', now, answered, yes, no];
    const sh = sheet_();
    if (existing) sh.getRange(existing.row, 1, 1, HEADER.length).setValues([values]);
    else sh.appendRow(values);
    return { updatedAt: now, submitted: !!submit, submittedAt: submit ? now : null };
  } finally {
    lock.releaseLock();
  }
}

function clean_(dept, data) {
  const n = QUESTION_COUNT[dept];
  const answers = {}, notes = {};
  const a = data.answers || {}, t = data.notes || {};
  for (let i = 0; i < n; i++) {
    if (a[i] === 'y' || a[i] === 'n') answers[i] = a[i];
    if (typeof t[i] === 'string' && t[i].trim()) notes[i] = t[i].slice(0, 600);
  }
  return { owner: String(data.owner || '').trim().slice(0, 80), answers: answers, notes: notes };
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
  }
  return sh;
}

function readRows_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const range = sh.getRange(2, 1, last - 1, HEADER.length);
  const vals = range.getValues(), disp = range.getDisplayValues();
  const rows = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const dept = disp[i][1];
    if (!QUESTION_COUNT[dept]) continue;
    rows.push({
      row: i + 2,
      doc: {
        month: disp[i][0], dept: dept, owner: String(v[2] || ''),
        answers: parse_(v[3]), notes: parse_(v[4]),
        submitted: v[5] === true || v[5] === 'TRUE',
        submittedAt: Number(v[6]) || null, updatedAt: Number(v[7]) || null
      }
    });
  }
  return rows;
}

function findRow_(month, dept) {
  const rows = readRows_();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].doc.month === month && rows[i].doc.dept === dept) return rows[i];
  }
  return null;
}

function parse_(s) {
  try { const o = JSON.parse(s || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}

function checkMonth_(m) {
  if (!/^\d{4}-\d{2}$/.test(String(m))) throw new Error('bad month');
}

function checkDept_(d) {
  if (!QUESTION_COUNT[d]) throw new Error('bad dept');
}

function checkPin_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pinFails') || 0);
  if (fails >= MAX_PIN_FAILS) throw new Error('blocked');
  if (ADMIN_PIN === 'CHANGE-ME' || String(pin) !== ADMIN_PIN) {
    cache.put('pinFails', String(fails + 1), 900);
    throw new Error('pin');
  }
}
