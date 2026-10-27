// الواجهة الرئيسية: مطر الماتريكس + اسم يتفك تشفيره بتأثير جليتش
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ابتثجحخدذرسشصضطظعغفقكلمنهوي♪♫';
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@<>/';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function rain(canvas) {
  const ctx = canvas.getContext('2d');
  const size = 15;
  let cols = [], w = 0, h = 0, running = false, last = 0, raf = 0;
  const touch = { x: -999, y: -999, until: 0 };
  let sparks = [];

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    if (!w) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    cols = Array.from({ length: Math.ceil(w / size) }, () => ({ y: Math.random() * -h, v: 0.6 + Math.random() * 0.9 }));
  }

  function draw(t) {
    raf = running ? requestAnimationFrame(draw) : 0;
    if (t - last < 50) return; // ~20 إطار بالثانية يكفي ويوفر البطارية
    last = t;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${size}px 'Share Tech Mono', monospace`;
    ctx.textAlign = 'center';
    const near = t < touch.until;
    cols.forEach((c, i) => {
      const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      const x = i * size + size / 2;
      // الأعمدة القريبة من إصبعك تسرع وتتوهج
      const boost = near ? Math.max(0, 1 - Math.abs(x - touch.x) / 70) : 0;
      ctx.fillStyle = boost > 0.2 ? '#ffffff' : '#d6ffe2';
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur = 8;
      ctx.fillText(ch, x, c.y);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0, 255, 102, 0.75)';
      ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], x, c.y - size);
      c.y += size * c.v * (1 + boost * 2.5);
      if (c.y > h + size * 4 && Math.random() > 0.96) c.y = Math.random() * -60;
    });
    // شرارات الحروف عند اللمس
    sparks = sparks.filter((s) => s.life > 0);
    for (const s of sparks) {
      s.x += s.vx;
      s.y += s.vy;
      s.life -= 0.05;
      ctx.fillStyle = `rgba(0, 255, 102, ${s.life})`;
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur = 12;
      ctx.fillText(s.ch, s.x, s.y);
    }
    ctx.shadowBlur = 0;
  }

  function poke(x, y, burst) {
    touch.x = x;
    touch.y = y;
    touch.until = performance.now() + 900;
    if (!burst) return;
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, ch: GLYPHS[(Math.random() * GLYPHS.length) | 0] });
    }
    // موجة: الأعمدة القريبة تبدأ من مكان اللمس
    cols.forEach((c, i) => {
      if (Math.abs(i * size - x) < 80) c.y = y;
    });
  }

  resize();
  addEventListener('resize', resize);
  return {
    poke,
    start() {
      if (running || reduced) return;
      running = true;
      raf = requestAnimationFrame(draw);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    once() {
      for (let i = 0; i < 60; i++) draw(i * 60);
    },
    resize,
  };
}

function scramble(el, text) {
  el.dataset.text = text;
  if (reduced) {
    el.textContent = text;
    return;
  }
  const start = performance.now();
  const dur = 1300;
  clearInterval(el._t);
  el._t = setInterval(() => {
    const p = (performance.now() - start) / dur;
    const done = Math.floor(p * text.length);
    el.textContent = [...text]
      .map((c, i) => (i < done || c === ' ' ? c : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]))
      .join('');
    if (p >= 1) {
      clearInterval(el._t);
      el.textContent = text;
    }
  }, 45);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'LATE NIGHT SESSION';
  if (h < 12) return 'GOOD MORNING';
  if (h < 17) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

export function initHero(getName) {
  const hero = document.getElementById('hero');
  const nameEl = document.getElementById('heroName');
  const r = rain(document.getElementById('matrix'));
  document.getElementById('heroGreet').textContent = '> ' + greeting();

  const eq = document.getElementById('heroEq');
  eq.innerHTML = Array.from({ length: 18 }, () => {
    const d = (0.45 + Math.random() * 0.7).toFixed(2);
    const delay = (-Math.random()).toFixed(2);
    return `<i style="animation-duration:${d}s;animation-delay:${delay}s"></i>`;
  }).join('');

  const play = () => scramble(nameEl, getName());
  play();
  hero.addEventListener('click', play);
  const local = (e) => {
    const b = hero.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top, b];
  };
  hero.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    r.poke(x, y, true);
    if (navigator.vibrate) navigator.vibrate(12);
  });
  hero.addEventListener('pointermove', (e) => {
    const [x, y, b] = local(e);
    r.poke(x, y, false);
    // الاسم يميل باتجاه إصبعك
    const rx = ((y / b.height) - 0.5) * -18;
    const ry = ((x / b.width) - 0.5) * 24;
    nameEl.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  });
  const reset = () => (nameEl.style.transform = '');
  hero.addEventListener('pointerleave', reset);
  hero.addEventListener('pointerup', () => setTimeout(reset, 600));
  setInterval(() => !document.hidden && hero.offsetParent && play(), 15000);

  if (reduced) r.once();
  const visible = () => hero.offsetParent && !document.hidden;
  const sync = () => (visible() ? r.start() : r.stop());
  new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? (r.resize(), r.start()) : r.stop())).observe(hero);
  document.addEventListener('visibilitychange', sync);
  return { refresh: play, sync };
}
