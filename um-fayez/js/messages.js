// رسائل فايز الصوتية: بطاقة في الرئيسية تفتح ظرفاً ويشتغل صوته
import { load, persist } from './store.js';
import { $, h, icon, n, esc, openSheet, bloom } from './ui.js';

let messages = [];
let player = null;

export async function initMessages(container) {
  try {
    const r = await fetch('media/messages.json', { cache: 'no-cache' });
    messages = (await r.json()).messages || [];
  } catch {
    messages = [];
  }
  if (!messages.length) return;
  // الأحدث أولاً
  messages.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const heard = load('heardMsgs', []);
  const fresh = messages.filter((m) => !heard.includes(m.file)).length;
  const card = h(`
    <button class="msg-card" type="button" aria-label="رسالة صوتية من فايز">
      <span class="envelope" aria-hidden="true"><span class="flap"></span><span class="seal">${icon('heart')}</span></span>
      <span class="msg-txt"><b>رسالة من فايز</b><small>${fresh ? (fresh > 1 ? `${n(fresh)} رسائل جديدة` : 'رسالة جديدة لكِ، اضغطي واسمعيها') : 'اضغطي لتسمعي صوته'}</small></span>
      ${fresh ? '<span class="msg-new">جديدة</span>' : ''}
    </button>`);
  card.addEventListener('click', () => open(messages[0], card));
  container.append(card);
}

function open(msg, card) {
  stopMessage();
  const others = messages.filter((m) => m !== msg);
  const body = openSheet(`
    <div class="msg-sheet">
      <div class="envelope big open" aria-hidden="true"><span class="flap"></span><span class="letter">${icon('heart')}</span></div>
      <h2 style="padding:0;text-align:center">${esc(msg.title || 'رسالة لأمي الغالية')}</h2>
      <p class="muted" style="text-align:center;margin:0">${msg.note ? esc(msg.note) : 'من ابنكِ فايز'}</p>
      <div class="voice-bars" id="vBars" aria-hidden="true">${'<i></i>'.repeat(24)}</div>
      <div class="bar" style="margin:6px 0 4px"><i id="vProg"></i></div>
      <div class="msg-time num" id="vTime"></div>
      <button class="btn primary block" id="vPlay" type="button">${icon('play')} تشغيل الرسالة</button>
      ${others.length ? `<div class="sound-sec">رسائل سابقة</div><div class="phrase-list">${others.map((m, i) => `<button class="phrase-item" data-i="${i}" type="button"><span>${esc(m.title || 'رسالة')}</span>${icon('play')}</button>`).join('')}</div>` : ''}
    </div>`, { close: stopMessage });
  body.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => open(others[+b.dataset.i], card)));
  const btn = body.querySelector('#vPlay');
  const bars = body.querySelector('#vBars');
  const fmt = (s) => n(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
  const toggle = () => {
    if (player && !player.paused) { player.pause(); return; }
    if (!player) {
      player = new Audio(msg.file);
      player.addEventListener('timeupdate', () => {
        if (!player) return;
        body.querySelector('#vProg').style.width = `${(player.currentTime / (player.duration || 1)) * 100}%`;
        body.querySelector('#vTime').textContent = player.duration ? `${fmt(player.currentTime)} / ${fmt(player.duration)}` : '';
      });
      player.addEventListener('play', () => { bars.classList.add('on'); btn.innerHTML = `${icon('pause')} إيقاف مؤقت`; });
      player.addEventListener('pause', () => { bars.classList.remove('on'); btn.innerHTML = `${icon('play')} تكملة الرسالة`; });
      player.addEventListener('ended', () => {
        bars.classList.remove('on');
        btn.innerHTML = `${icon('play')} اسمعيها مرة ثانية`;
        player = null;
        document.dispatchEvent(new Event('unduck'));
        const r = btn.getBoundingClientRect();
        bloom(r.left + r.width / 2, r.top, 18);
      });
      player.addEventListener('error', () => { btn.innerHTML = `${icon('play')} تعذّر التشغيل، تأكدي من الإنترنت`; player = null; });
    }
    document.dispatchEvent(new Event('duck'));
    player.play().catch(() => {});
    const heard = load('heardMsgs', []);
    if (!heard.includes(msg.file)) {
      heard.push(msg.file);
      persist('heardMsgs', heard);
      card.querySelector('.msg-new')?.remove();
      card.querySelector('small').textContent = 'اضغطي لتسمعي صوته';
    }
  };
  btn.addEventListener('click', toggle);
  // تبدأ الرسالة لحالها مع فتح الظرف
  setTimeout(toggle, 700);
}

function stopMessage() {
  if (player) { player.pause(); player = null; document.dispatchEvent(new Event('unduck')); }
}
