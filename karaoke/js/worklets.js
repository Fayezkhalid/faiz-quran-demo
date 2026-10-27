// معالجات الصوت التي تعمل على خيط الصوت (AudioWorklet).
// vocal-tuner: كشف النغمة + تصحيحها للمقام + هارموني
// key-shifter: تغيير طبقة الموسيقى
// pcm-recorder: تسجيل الصوت الخام بتوقيت دقيق

// كشف النغمة بخوارزمية YIN على إشارة مخفّضة إلى ~16kHz
class PitchDetector {
  constructor(sr) {
    this.decim = Math.max(1, Math.round(sr / 16000));
    this.rate = sr / this.decim;
    this.N = 512;
    this.half = 256;
    this.ring = new Float32Array(this.N);
    this.ri = 0;
    this.acc = 0;
    this.accN = 0;
    this.frame = new Float32Array(this.N);
    this.d = new Float32Array(this.half);
    this.maxTau = Math.min(this.half - 2, Math.floor(this.rate / 70));
    this.minTau = Math.max(2, Math.floor(this.rate / 1000));
  }

  push(x) {
    this.acc += x;
    if (++this.accN === this.decim) {
      this.ring[this.ri] = this.acc / this.decim;
      this.ri = (this.ri + 1) % this.N;
      this.acc = 0;
      this.accN = 0;
    }
  }

  // يرجع التردد بالهرتز أو 0 إذا الصوت غير نغمي/صامت
  detect() {
    const N = this.N, f = this.frame;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = this.ring[(this.ri + i) % N];
      f[i] = v;
      e += v * v;
    }
    if (Math.sqrt(e / N) < 0.004) return 0;

    const half = this.half, d = this.d, maxTau = this.maxTau;
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let i = 0; i < half; i++) {
        const q = f[i] - f[i + tau];
        s += q * q;
      }
      run += s;
      d[tau] = run > 0 ? (s * tau) / run : 1;
    }

    let tau = -1;
    for (let t = this.minTau; t <= maxTau; t++) {
      if (d[t] < 0.15) {
        while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return 0;

    let better = tau;
    if (tau > 1 && tau < maxTau) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const den = s0 - 2 * s1 + s2;
      if (den !== 0) better = tau + (0.5 * (s0 - s2)) / den;
    }
    return this.rate / better;
  }
}

// مغيّر طبقة بخط تأخير ونافذتين متقاطعتين.
// النافذة تتزامن مع دورة الصوت (pitch-synchronous) لتقليل التشويه.
class Shifter {
  constructor(sr, winMs) {
    this.size = 16384;
    this.mask = this.size - 1;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.win = (sr * winMs) / 1000;
    this.w1 = this.win;
    this.w2 = this.win;
    this.ph = 0.5;
    this.g1 = 1;
    this.g2 = 0;
    this.minWin = sr * 0.01;
    this.maxWin = sr * 0.05;
    this.halfTarget = sr * 0.011;
  }

  setPeriod(P) {
    const n = Math.max(1, Math.round(this.halfTarget / P));
    this.win = Math.min(this.maxWin, Math.max(this.minWin, 2 * n * P));
  }

  read(d) {
    const p = this.w - d;
    const i = Math.floor(p);
    const fr = p - i;
    const a = this.buf[i & this.mask];
    const b = this.buf[(i + 1) & this.mask];
    return a + (b - a) * fr;
  }

  process(x, ratio) {
    this.buf[this.w] = x;
    const eff = this.w1 * this.g1 + this.w2 * this.g2;
    let ph = this.ph + (1 - ratio) / eff;
    // بدون تغيير طبقة: ننزلق ببطء لنقرأ من نافذة واحدة فقط (يمنع تلوين الصوت)
    if (ratio > 0.9995 && ratio < 1.0005) ph += (0.5 - ph) * 0.00001;
    if (ph >= 1) {
      ph -= 1;
      this.w1 = this.win;
    } else if (ph < 0) {
      ph += 1;
      this.w1 = this.win;
    } else if (this.ph < 0.5 !== ph < 0.5) {
      this.w2 = this.win;
    }
    this.ph = ph;
    let ph2 = ph + 0.5;
    if (ph2 >= 1) ph2 -= 1;
    const s = Math.sin(Math.PI * ph);
    const g1 = s * s;
    const g2 = 1 - g1;
    this.g1 = g1;
    this.g2 = g2;
    const y = this.read(3 + ph * this.w1) * g1 + this.read(3 + ph2 * this.w2) * g2;
    this.w = (this.w + 1) & this.mask;
    return y;
  }
}

class VocalTuner extends AudioWorkletProcessor {
  constructor() {
    super();
    this.det = new PitchDetector(sampleRate);
    this.main = new Shifter(sampleRate, 22);
    this.harm = new Shifter(sampleRate, 22);
    this.p = {
      enabled: true,
      strength: 0.6,
      speed: 35,
      key: 0,
      scale: [0, 2, 4, 5, 7, 9, 11],
      transpose: 0,
      harmony: 0,
      harmonyMix: 0.45,
    };
    this.m = 0;
    this.target = 0;
    this.lastTarget = 0;
    this.corr = 0;
    this.goal = 0;
    this.hGoal = 0;
    this.hCorr = 0;
    this.hEnv = 0;
    this.voiced = false;
    this.miss = 0;
    this.hop = 0;
    this.rep = 0;
    this.sq = 0;
    this.port.onmessage = (e) => Object.assign(this.p, e.data);
  }

  snap(m) {
    const { key, scale } = this.p;
    let best = m, bd = 1e9;
    const base = Math.floor((m - key) / 12);
    for (let o = base - 1; o <= base + 1; o++) {
      for (let k = 0; k < scale.length; k++) {
        const c = key + 12 * o + scale[k];
        const d = Math.abs(c - m);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    }
    // تثبيت: لا نقفز لنغمة جديدة إلا إذا كانت أقرب بوضوح
    if (this.lastTarget && Math.abs(m - this.lastTarget) < bd + 0.18) best = this.lastTarget;
    this.lastTarget = best;
    return best;
  }

  harmonyNote(t) {
    const h = this.p.harmony;
    if (h === 4) return t - 12;
    const steps = h === 1 ? 2 : h === 2 ? 4 : -2;
    const { key, scale } = this.p;
    const base = Math.floor((t - key) / 12);
    const notes = [];
    for (let o = base - 2; o <= base + 2; o++) for (let k = 0; k < scale.length; k++) notes.push(key + 12 * o + scale[k]);
    notes.sort((a, b) => a - b);
    let idx = 0, bd = 1e9;
    for (let i = 0; i < notes.length; i++) {
      const d = Math.abs(notes[i] - t);
      if (d < bd) {
        bd = d;
        idx = i;
      }
    }
    return notes[Math.max(0, Math.min(notes.length - 1, idx + steps))];
  }

  analyse() {
    const f = this.det.detect();
    const p = this.p;
    if (f > 0) {
      const m = 69 + 12 * Math.log2(f / 440) + p.transpose;
      this.m = m;
      this.voiced = true;
      this.miss = 0;
      const period = sampleRate / f;
      this.main.setPeriod(period);
      this.harm.setPeriod(period);
      const t = this.snap(m);
      this.target = t;
      this.goal = p.enabled ? (t - m) * p.strength : 0;
      if (p.harmony) this.hGoal = this.harmonyNote(t) - m;
    } else if (++this.miss > 4) {
      this.voiced = false;
      this.goal = 0;
      this.lastTarget = 0;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    const x = inputs[0] && inputs[0][0];
    if (!x) {
      out.fill(0);
      return true;
    }
    const p = this.p;
    const a = p.speed <= 1 ? 1 : 1 - Math.exp(-1000 / (p.speed * sampleRate));
    const ha = 1 - Math.exp(-1000 / (25 * sampleRate));
    const envA = 1 - Math.exp(-1000 / (30 * sampleRate));
    for (let i = 0; i < x.length; i++) {
      const s = x[i];
      this.det.push(s);
      this.sq += s * s;
      if (++this.hop >= 256) {
        this.hop = 0;
        this.analyse();
      }
      this.corr += (this.goal - this.corr) * a;
      let y = this.main.process(s, Math.pow(2, (this.corr + p.transpose) / 12));
      if (p.harmony) {
        this.hCorr += (this.hGoal - this.hCorr) * ha;
        this.hEnv += ((this.voiced ? 1 : 0) - this.hEnv) * envA;
        y += this.harm.process(s, Math.pow(2, (this.hCorr + p.transpose) / 12)) * this.hEnv * p.harmonyMix;
      }
      out[i] = y;
    }
    this.rep += x.length;
    if (this.rep >= 1536) {
      this.port.postMessage({
        m: this.voiced ? this.m : 0,
        t: this.voiced && p.enabled ? this.target : 0,
        l: Math.sqrt(this.sq / this.rep),
      });
      this.rep = 0;
      this.sq = 0;
    }
    return true;
  }
}

class KeyShifter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.semis = 0;
    this.sh = [new Shifter(sampleRate, 70), new Shifter(sampleRate, 70)];
    this.port.onmessage = (e) => {
      if ('semis' in e.data) this.semis = e.data.semis;
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const inp = inputs[0] || [];
    const r = Math.pow(2, this.semis / 12);
    for (let c = 0; c < out.length; c++) {
      const x = inp[c] || inp[0];
      const y = out[c];
      if (!x) {
        y.fill(0);
        continue;
      }
      if (this.semis === 0) {
        y.set(x);
        continue;
      }
      const s = this.sh[c] || this.sh[0];
      for (let i = 0; i < x.length; i++) y[i] = s.process(x[i], r);
    }
    return true;
  }
}

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.chunk = new Float32Array(4096);
    this.n = 0;
    this.start = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'start') {
        this.on = true;
        this.n = 0;
      } else if (e.data === 'stop') {
        this.flush();
        this.on = false;
        this.port.postMessage({ done: true });
      }
    };
  }

  flush() {
    if (!this.n) return;
    this.port.postMessage({ frame: this.start, data: this.chunk.slice(0, this.n) });
    this.n = 0;
  }

  process(inputs) {
    const x = inputs[0] && inputs[0][0];
    if (this.on && x) {
      for (let i = 0; i < x.length; i++) {
        if (this.n === 0) this.start = currentFrame + i;
        this.chunk[this.n++] = x[i];
        if (this.n === this.chunk.length) this.flush();
      }
    }
    return true;
  }
}

registerProcessor('vocal-tuner', VocalTuner);
registerProcessor('key-shifter', KeyShifter);
registerProcessor('pcm-recorder', PcmRecorder);
