// تفسير القرآن: ابحث بالكتابة أو اللصق أو بصوتك، ويطلع التفسير الميسّر
import { store, load, persist } from './store.js';
import { $, h, icon, n, esc, sizeButtons, toast, openSheet, copyText, shareText } from './ui.js';

let quranP, tafsirP, Q, T, index, vocab, cum;
let root, els = {}, rec = null, ayahAudio = null;

export function loadQuran() {
  if (!quranP) {
    quranP = fetch('data/quran.json').then((r) => r.json()).then((q) => {
      Q = q;
      cum = [0];
      q.s.forEach((s) => cum.push(cum[cum.length - 1] + s[1]));
      return q;
    });
    quranP.catch(() => { quranP = null; });
  }
  return quranP;
}
function loadTafsir() {
  if (!tafsirP) {
    tafsirP = fetch('data/tafsir-muyassar.json').then((r) => r.json()).then((t) => (T = t));
    tafsirP.catch(() => { tafsirP = null; });
  }
  return tafsirP;
}

export function ayahIndex(s, a) { return cum[s - 1] + a - 1; }
function refOf(idx) {
  let s = 1;
  while (cum[s] <= idx) s++;
  return { s, a: idx - cum[s - 1] + 1 };
}

// ===== تطبيع النص العربي للبحث =====
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g;
export function norm(s) {
  return s
    .replace(MARKS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// جذر تقريبي: نشيل الواو والفاء وأل التعريف
function key(w) {
  if (w.length > 3 && (w[0] === 'و' || w[0] === 'ف')) w = w.slice(1);
  if (w.length > 4 && /^(بال|كال|فال|وال)/.test(w)) w = w.slice(3);
  else if (w.length > 3 && /^(ال|لل)/.test(w)) w = w.slice(2);
  return w;
}

function buildIndex() {
  if (index) return;
  index = new Map();
  Q.normed = Q.a.map((x) => norm(x[1]));
  Q.keys = Q.normed.map((t) => t.split(' ').map(key));
  Q.keys.forEach((ks, i) => {
    for (const k of new Set(ks)) {
      let arr = index.get(k);
      if (!arr) index.set(k, (arr = []));
      arr.push(i);
    }
  });
  vocab = [...index.keys()];
}

// مسافة تعديل صغيرة (لأخطاء التعرّف على الصوت)
function within1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

export function search(query) {
  buildIndex();
  const qn = norm(query);
  if (!qn) return [];
  const qk = qn.split(' ').map(key).filter((k) => k.length >= 2);
  if (!qk.length) return [];
  const N = Q.a.length;
  const scores = new Map();
  const expanded = qk.map((k) => {
    if (index.has(k)) return [k];
    if (k.length < 4) return [];
    return vocab.filter((v) => within1(v, k)).slice(0, 6);
  });
  expanded.forEach((alts) => {
    const seen = new Set();
    alts.forEach((k, ai) => {
      const post = index.get(k) || [];
      const idf = Math.log(N / post.length) * (ai === 0 && alts.length === 1 ? 1 : 0.7);
      post.forEach((i) => { if (!seen.has(i)) { seen.add(i); scores.set(i, (scores.get(i) || 0) + idf); } });
    });
  });
  const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  const flat = expanded.map((a) => new Set(a));
  const out = top.map(([i, sc]) => {
    // مكافأة للكلمات المتتالية بنفس الترتيب
    const ks = Q.keys[i];
    let best = 0;
    for (let s = 0; s < ks.length; s++) {
      let run = 0;
      for (let q = 0; q < flat.length && s + run < ks.length; q++) {
        if (flat[q].has(ks[s + run])) run++;
        else if (run) break;
      }
      best = Math.max(best, run);
    }
    let bonus = best * 2.2;
    if (Q.normed[i].includes(qn)) bonus += 12;
    const matched = flat.filter((set) => ks.some((k) => set.has(k))).length;
    return { i, score: sc + bonus, pct: Math.round((matched / flat.length) * 100) };
  });
  out.sort((a, b) => b.score - a.score);
  const max = out[0]?.score || 0;
  return out.filter((r) => r.score >= max * 0.45).slice(0, 12);
}

// ===== الواجهة =====
export function initTafsir() {
  root = $('#view-tafsir');
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between"><h2 class="page-title">تفسير القرآن</h2>${sizeButtons()}</div>
    <p class="page-sub">التفسير الميسّر · مجمع الملك فهد لطباعة المصحف الشريف</p>
    <div class="search-box">
      <textarea id="tq" placeholder="اكتب أو الصق جزءاً من الآية هنا…" aria-label="نص الآية"></textarea>
    </div>
    <div class="tafsir-actions">
      <button class="btn primary mic" id="tMic" type="button">${icon('mic')} سجّل الآية بصوتك</button>
      <button class="btn soft" id="tPaste" type="button">${icon('paste')} لصق الآية</button>
      <button class="btn" id="tGo" type="button">${icon('search')} ابحث</button>
    </div>
    <div id="tStatus"></div>
    <div id="tResults"></div>
    <section class="card">
      <div class="card-title">${icon('book')} تصفّح بالسورة والآية</div>
      <div class="browse">
        <div class="field"><label for="tSura">السورة</label><select id="tSura"><option>…</option></select></div>
        <div class="field"><label for="tAyah">الآية</label><input type="number" id="tAyah" min="1" value="1" inputmode="numeric"></div>
      </div>
      <button class="btn soft block" id="tOpen" type="button" style="margin-top:10px">${icon('book')} اعرض التفسير</button>
    </section>
    <section class="card" id="tRecentCard" hidden>
      <div class="card-title">آخر ما قرأت</div>
      <div id="tRecent" class="chips" style="flex-wrap:wrap"></div>
    </section>
  `;
  els = { q: $('#tq'), status: $('#tStatus'), results: $('#tResults') };
  $('#tGo').addEventListener('click', () => runSearch(els.q.value));
  els.q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch(els.q.value); } });
  $('#tPaste').addEventListener('click', paste);
  $('#tMic').addEventListener('click', listen);
  $('#tOpen').addEventListener('click', () => {
    const s = +$('#tSura').value, a = +$('#tAyah').value;
    if (!Q || !s) return;
    const max = Q.s[s - 1][1];
    if (a < 1 || a > max) { toast(`سورة ${Q.s[s - 1][0]} عدد آياتها ${n(max)}`); return; }
    openAyah(ayahIndex(s, a));
  });
}

export async function prepareTafsir() {
  if (Q && $('#tSura').options.length > 2) return;
  els.status.innerHTML = Q ? '' : `<p class="empty"><span class="loader"></span> نجهّز المصحف…</p>`;
  try {
    await loadQuran();
    els.status.innerHTML = '';
    $('#tSura').innerHTML = Q.s.map((s, i) => `<option value="${i + 1}">${n(i + 1)}. ${s[0]}</option>`).join('');
    $('#tSura').addEventListener('change', () => { $('#tAyah').max = Q.s[$('#tSura').value - 1][1]; $('#tAyah').value = 1; });
    renderRecent();
    loadTafsir();
  } catch {
    els.status.innerHTML = `<p class="empty">تعذّر تحميل المصحف، تأكد من الاتصال بالإنترنت أول مرة.</p>`;
  }
}

async function paste() {
  try {
    const t = await navigator.clipboard.readText();
    if (!t.trim()) { toast('ما فيه نص منسوخ'); return; }
    els.q.value = t.trim();
    runSearch(t);
  } catch {
    els.q.focus();
    toast('اضغط مطوّلاً داخل المربع واختر «لصق»', 3500);
  }
}

async function runSearch(text) {
  if (!text.trim()) { toast('اكتب جزءاً من الآية أولاً'); return; }
  els.results.innerHTML = `<p class="empty"><span class="loader"></span></p>`;
  await loadQuran();
  // نتيجة البحث تظهر بعد إطار حتى ما تعلق الواجهة
  await new Promise((r) => setTimeout(r, 20));
  const res = search(text);
  if (!res.length) {
    els.results.innerHTML = `<p class="empty">ما لقيت آية مطابقة، جرّب كلمات أكثر من الآية 🌿</p>`;
    return;
  }
  if (res.length === 1 || (res[0].pct === 100 && res[0].score > (res[1]?.score || 0) * 1.5)) openAyah(res[0].i);
  els.results.innerHTML = `<p class="muted small" style="margin:6px 4px">${res.length > 1 ? 'اختر الآية المقصودة:' : ''}</p>`;
  res.forEach((r) => {
    const { s, a } = refOf(r.i);
    const b = h(`<button class="result" type="button"><div class="ayah-text">${esc(Q.a[r.i][0])}</div>
      <div class="meta"><span>سورة ${Q.s[s - 1][0]} · آية ${n(a)}</span><span class="match">تطابق ${n(r.pct)}٪</span></div></button>`);
    b.addEventListener('click', () => openAyah(r.i));
    els.results.append(b);
  });
}

// الآيباد: التعرّف على الكلام ما يشتغل في التطبيق المثبّت على الشاشة الرئيسية (الآيفون يشتغل عادي)
const IPAD = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
// أي جهاز ثاني فشل فيه التسجيل مرة، نتذكّره ونروح للكيبورد مباشرة
const srBroken = () => load('srBroken', false);

// البديل: مايك الكيبورد. نفتح الكيبورد ونوضّح لها وين تضغط، والبحث يبدأ لحاله لما توقف عن الكلام
let dictTimer = null;
function dictate(focusNow = true) {
  let tip = $('#dictTip');
  if (!tip) {
    tip = h(`<div class="dict-tip" id="dictTip">${icon('mic')}<span>اضغط زر المايك 🎙 في الكيبورد واقرأ الآية، وبعدها يطلع التفسير لحاله</span></div>`);
    els.q.parentElement.before(tip);
  }
  tip.hidden = false;
  els.q.value = '';
  if (focusNow) els.q.focus();
  else toast('اضغط على مربع الكتابة ثم زر المايك في الكيبورد', 4500);
  els.q.oninput = () => {
    clearTimeout(dictTimer);
    const t = els.q.value.trim();
    if (t.split(/\s+/).length < 2) return;
    dictTimer = setTimeout(() => { tip.hidden = true; els.q.blur(); runSearch(t); }, 2500);
  };
}

function listen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || (IPAD && STANDALONE) || srBroken()) { dictate(); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = 'ar-SA';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  const body = openSheet(`<div class="listening"><h2 style="padding:0">أسمعك… اقرأ الآية</h2>
    <div class="mic-pulse">${icon('mic')}</div><p class="live-text" id="liveText"></p>
    <button class="btn primary block" id="micDone" type="button">${icon('check')} انتهيت</button></div>`, { close: () => rec && rec.abort() });
  const live = body.querySelector('#liveText');
  body.querySelector('#micDone').addEventListener('click', () => rec && rec.stop());
  // إذا ما وصل أي كلام خلال ٧ ثواني، نحوّلها لمايك الكيبورد
  let heard = false;
  const watchdog = setTimeout(() => {
    if (heard || !rec) return;
    try { rec.abort(); } catch {}
    rec = null;
    persist('srBroken', true);
    document.getElementById('sheet').hidden = true;
    document.getElementById('sheetBackdrop').hidden = true;
    dictate(false);
  }, 7000);
  rec.onresult = (e) => {
    heard = true;
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    live.textContent = finalText + interim;
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      rec = null;
      openSheet(`<h2>التسجيل بالصوت</h2>
        <p>لو ما اشتغل المايك هنا، فيه طريقة سهلة:</p>
        <ol style="line-height:2.2"><li>اضغط على مربع الكتابة</li><li>اضغط زر المايك 🎙 في لوحة المفاتيح (تحت يسار)</li><li>اقرأ الآية، وبعدين اضغط «ابحث»</li></ol>
        <p class="muted small">وللسماح بالمايك: الإعدادات ← Safari ← الميكروفون ← سماح</p>`);
      return;
    }
    else if (e.error === 'no-speech') toast('ما وصلني صوت، جرّب مرة ثانية');
    else if (e.error === 'network') toast('التسجيل بالصوت يحتاج إنترنت');
  };
  rec.onend = () => {
    clearTimeout(watchdog);
    rec = null;
    const text = (finalText || live.textContent).trim();
    if (text) {
      els.q.value = text;
      document.getElementById('sheet').hidden = true;
      document.getElementById('sheetBackdrop').hidden = true;
      runSearch(text);
    }
  };
  try { rec.start(); } catch { rec = null; }
}

function renderRecent() {
  const recent = load('recentAyat', []);
  $('#tRecentCard').hidden = !recent.length;
  $('#tRecent').innerHTML = recent.map((i) => {
    const { s, a } = refOf(i);
    return `<button class="chip" type="button" data-i="${i}">${Q.s[s - 1][0]} ${n(a)}</button>`;
  }).join('');
  $('#tRecent').querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => openAyah(+b.dataset.i)));
}

// نافذة الآية مع تفسيرها
export async function openAyah(idx) {
  await loadQuran();
  const { s, a } = refOf(idx);
  const recent = load('recentAyat', []).filter((x) => x !== idx);
  recent.unshift(idx);
  persist('recentAyat', recent.slice(0, 6));
  if (root && $('#tRecent')) renderRecent();

  const body = openSheet(`
    <h2 style="display:flex;align-items:center;gap:10px">سورة ${Q.s[s - 1][0]} ${sizeButtons()}</h2>
    <div class="ayah-text">${esc(Q.a[idx][0])} <span style="color:var(--primary)">﴿${n(a)}﴾</span></div>
    <div class="ref">سورة ${Q.s[s - 1][0]} · الآية ${n(a)} · ${Q.s[s - 1][2] === 'm' ? 'مكية' : 'مدنية'}</div>
    <div class="tool-row">
      <button class="btn soft" id="aPlay" type="button">${icon('play')} استماع</button>
      <button class="btn" id="aCopy" type="button">${icon('copy')} نسخ</button>
      <button class="btn" id="aShare" type="button">${icon('share')} مشاركة</button>
    </div>
    <div class="tafsir-body"><h3>${icon('book')} التفسير الميسّر</h3><div id="tfText"><span class="loader"></span></div></div>
    <div class="tafsir-nav">
      <button class="btn" id="aPrev" type="button" ${idx === 0 ? 'disabled' : ''}>${icon('chev-r')} الآية السابقة</button>
      <button class="btn" id="aNext" type="button" ${idx === Q.a.length - 1 ? 'disabled' : ''}>الآية التالية ${icon('chev-l')}</button>
    </div>`, { className: 'tafsir-sheet', close: stopAyahAudio });

  const fullText = () => `﴿${Q.a[idx][0]}﴾ [${Q.s[s - 1][0]}: ${a}]\n\nالتفسير الميسّر:\n${T ? T[idx] : ''}`;
  body.querySelector('#aCopy').onclick = () => copyText(fullText());
  body.querySelector('#aShare').onclick = () => shareText(fullText());
  body.querySelector('#aPrev').onclick = () => { stopAyahAudio(); openAyah(idx - 1); };
  body.querySelector('#aNext').onclick = () => { stopAyahAudio(); openAyah(idx + 1); };
  const playBtn = body.querySelector('#aPlay');
  playBtn.onclick = () => {
    if (ayahAudio && !ayahAudio.paused) { stopAyahAudio(); playBtn.innerHTML = `${icon('play')} استماع`; return; }
    stopAyahAudio();
    document.dispatchEvent(new Event('duck'));
    ayahAudio = new Audio(`https://cdn.islamic.network/quran/audio/128/ar.alafasy/${idx + 1}.mp3`);
    playBtn.innerHTML = `<span class="loader"></span>`;
    ayahAudio.play().then(() => { playBtn.innerHTML = `${icon('pause')} إيقاف`; }).catch(() => { playBtn.innerHTML = `${icon('play')} استماع`; toast('الاستماع يحتاج إنترنت'); });
    ayahAudio.onended = () => { playBtn.innerHTML = `${icon('play')} استماع`; document.dispatchEvent(new Event('unduck')); };
  };
  try {
    await loadTafsir();
    const el = body.querySelector('#tfText');
    if (el) el.textContent = T[idx];
  } catch {
    const el = body.querySelector('#tfText');
    if (el) el.textContent = 'تعذّر تحميل التفسير، تأكد من الاتصال بالإنترنت.';
  }
}

function stopAyahAudio() {
  if (ayahAudio) { ayahAudio.pause(); ayahAudio = null; document.dispatchEvent(new Event('unduck')); }
}
