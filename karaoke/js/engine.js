// محرك الصوت: سلسلة المؤثرات، التشغيل، التسجيل، والميكساج النهائي.
// نفس سلسلة المؤثرات تُستخدم للمايك المباشر، ولإعادة سماع التسجيل، وللتصدير
// حتى يكون اللي تسمعه هو نفس اللي يطلع في الملف.
import { SCALES } from './music.js';
import { encodeWav } from './wav.js';

const WORKLET_URL = new URL('./worklets.js', import.meta.url).href;

const setParam = (ctx, param, v) => {
  if (ctx instanceof OfflineAudioContext) param.value = v;
  else param.setTargetAtTime(v, ctx.currentTime, 0.02);
};

const irCache = new WeakMap();
function makeIR(ctx, type) {
  let byType = irCache.get(ctx);
  if (!byType) irCache.set(ctx, (byType = {}));
  if (byType[type]) return byType[type];
  const spec = {
    room: { dur: 1.1, decay: 3.4, damp: 0.35 },
    plate: { dur: 1.9, decay: 2.6, damp: 0.12 },
    hall: { dur: 3.2, decay: 2.1, damp: 0.55 },
  }[type] || { dur: 1.9, decay: 2.6, damp: 0.12 };
  const sr = ctx.sampleRate;
  const len = Math.floor(spec.dur * sr);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, energy = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const n = Math.random() * 2 - 1;
      lp += (1 - spec.damp * t * 0.95) * (n - lp);
      const fadeIn = Math.min(1, i / (sr * 0.003));
      d[i] = lp * Math.pow(1 - t, spec.decay) * fadeIn;
      energy += d[i] * d[i];
    }
    const g = 0.8 / Math.sqrt(energy);
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  byType[type] = buf;
  return buf;
}

export function buildMaster(ctx) {
  const input = ctx.createGain();
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.08;
  input.connect(lim);
  lim.connect(ctx.destination);
  return input;
}

export function buildVoiceChain(ctx, params, bpm = 100) {
  const input = ctx.createGain();
  const tuner = new AudioWorkletNode(ctx, 'vocal-tuner', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const biquad = (type, freq, q) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  };
  const hpf = biquad('highpass', 90, 0.7);
  const low = biquad('lowshelf', 200);
  const pres = biquad('peaking', 3200, 0.9);
  const air = biquad('highshelf', 10000);
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 10;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  const makeup = ctx.createGain();
  const out = ctx.createGain();

  input.connect(tuner);
  tuner.connect(hpf);
  hpf.connect(low);
  low.connect(pres);
  pres.connect(air);
  air.connect(comp);
  comp.connect(makeup);
  makeup.connect(out);

  // دبل (Doubler): نسختين متأخرتين ومتذبذبتين يمين ويسار تعطي عرض وفخامة
  const dbl = ctx.createGain();
  const lfos = [
    [0.018, 0.7, -0.85],
    [0.027, 0.93, 0.85],
  ].map(([delay, rate, pan]) => {
    const d = ctx.createDelay(0.1);
    d.delayTime.value = delay;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.value = 0.0025;
    lfo.connect(depth);
    depth.connect(d.delayTime);
    lfo.start();
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    makeup.connect(d);
    d.connect(pn);
    pn.connect(dbl);
    return lfo;
  });
  dbl.connect(out);

  // ريفيرب
  const revSend = ctx.createGain();
  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = 0.025;
  const revOut = ctx.createGain();
  makeup.connect(revSend);
  revSend.connect(pre);
  revOut.connect(out);
  let conv = null, convType = null;
  const setConv = (type) => {
    if (type === convType) return;
    if (conv) {
      pre.disconnect(conv);
      conv.disconnect();
    }
    conv = ctx.createConvolver();
    conv.buffer = makeIR(ctx, type);
    pre.connect(conv);
    conv.connect(revOut);
    convType = type;
  };

  // صدى (Echo) متزامن مع سرعة الأغنية
  const echoSend = ctx.createGain();
  const ed = ctx.createDelay(2.5);
  const fb = ctx.createGain();
  const elp = biquad('lowpass', 3800);
  const ehp = biquad('highpass', 250);
  makeup.connect(echoSend);
  echoSend.connect(ehp);
  ehp.connect(ed);
  ed.connect(elp);
  elp.connect(fb);
  fb.connect(ed);
  elp.connect(out);

  let tempo = bpm;
  function update(p, newBpm) {
    if (newBpm) tempo = newBpm;
    tuner.port.postMessage({
      enabled: p.tune.enabled,
      strength: p.tune.strength,
      speed: p.tune.speed,
      key: p.tune.key,
      scale: (SCALES[p.tune.scale] || SCALES.major).steps,
      transpose: p.tune.transpose,
      harmony: p.tune.harmony,
      harmonyMix: p.tune.harmonyMix,
    });
    setParam(ctx, hpf.frequency, p.eq.hpf);
    setParam(ctx, low.gain, p.eq.low);
    setParam(ctx, pres.gain, p.eq.presence);
    setParam(ctx, air.gain, p.eq.air);
    setParam(ctx, comp.threshold, -8 - 28 * p.comp);
    setParam(ctx, comp.ratio, 1.5 + 8 * p.comp);
    setParam(ctx, makeup.gain, 1 + 1.2 * p.comp);
    setParam(ctx, dbl.gain, p.doubler * 0.6);
    setParam(ctx, revSend.gain, p.reverb * 1.1);
    setConv(p.reverbType);
    setParam(ctx, echoSend.gain, p.echo * 0.8);
    setParam(ctx, ed.delayTime, Math.min(2.4, (60 / tempo) * p.echoNote));
    setParam(ctx, fb.gain, p.echoFeedback);
    setParam(ctx, out.gain, p.volume);
  }
  update(params);

  return {
    input,
    output: out,
    tuner,
    update,
    dispose() {
      lfos.forEach((o) => o.stop());
      tuner.port.onmessage = null;
      input.disconnect();
      out.disconnect();
    },
  };
}

export function buildMusicChain(ctx, m) {
  const shifter = new AudioWorkletNode(ctx, 'key-shifter', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit',
  });
  const g = ctx.createGain();
  shifter.connect(g);
  const update = (mm) => {
    shifter.port.postMessage({ semis: mm.semis || 0 });
    setParam(ctx, g.gain, mm.vol);
  };
  update(m);
  return { input: shifter, output: g, update, dispose: () => g.disconnect() };
}

export class Engine {
  constructor() {
    this.ctx = null;
  }

  // لازم تُستدعى من ضغطة المستخدم (متطلبات iPhone)
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.ready = this.ctx.audioWorklet.addModule(WORKLET_URL);
      this.master = buildMaster(this.ctx);
    }
    const resumed = this.ctx.state !== 'running' ? this.ctx.resume() : Promise.resolve();
    return Promise.all([this.ready, resumed]).then(() => this.ctx);
  }

  latency(settings) {
    if (settings.latencyMs != null) return settings.latencyMs / 1000;
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0) + 0.012;
  }
}

async function openMic(headphones) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: !headphones,
      noiseSuppression: !headphones,
      autoGainControl: false,
      channelCount: 1,
    },
  });
}

function makeRecorder(ctx) {
  const rec = new AudioWorkletNode(ctx, 'pcm-recorder', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const sink = ctx.createGain();
  sink.gain.value = 0;
  rec.connect(sink);
  sink.connect(ctx.destination);
  return rec;
}

function assemble(chunks) {
  const first = chunks[0].frame;
  const last = chunks[chunks.length - 1];
  const pcm = new Float32Array(last.frame + last.data.length - first);
  for (const c of chunks) pcm.set(c.data, c.frame - first);
  return { first, pcm };
}

export class StudioSession {
  constructor(engine) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.buffer = null;
    this.src = null;
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.bpm = 100;
    this.voiceParams = null;
    this.musicParams = { vol: 0.85, semis: 0 };
    this.music = buildMusicChain(this.ctx, this.musicParams);
    this.music.output.connect(engine.master);
    this.monitor = this.ctx.createGain();
    this.monitor.gain.value = 0;
    this.monitor.connect(engine.master);
    this.mic = null;
    this.onPitch = null;
    this.onEnded = null;
  }

  setBuffer(buf, bpm) {
    this.stop();
    this.buffer = buf;
    this.bpm = bpm || 100;
    if (this.voice && this.voiceParams) this.voice.update(this.voiceParams, this.bpm);
  }

  get duration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  get position() {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, this.offset + Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  play(pos = this.offset, when = this.ctx.currentTime + 0.03) {
    if (!this.buffer) return;
    this._stopSrc();
    if (pos >= this.duration - 0.05) pos = 0;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.connect(this.music.input);
    s.start(when, pos);
    this.src = s;
    this.offset = pos;
    this.startedAt = when;
    this.playing = true;
    s.onended = () => {
      if (this.src !== s) return;
      this.src = null;
      this.playing = false;
      this.offset = this.duration;
      this.onEnded && this.onEnded();
    };
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.position;
    this._stopSrc();
    this.playing = false;
  }

  seek(pos) {
    const was = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(pos, this.duration));
    if (was) this.play(this.offset);
  }

  stop() {
    this.pause();
    this.offset = 0;
  }

  _stopSrc() {
    if (!this.src) return;
    const s = this.src;
    this.src = null;
    s.onended = null;
    try {
      s.stop();
    } catch (e) {}
    s.disconnect();
  }

  setVoice(p) {
    this.voiceParams = p;
    if (this.voice) this.voice.update(p, this.bpm);
  }

  setMusic(m) {
    this.musicParams = m;
    this.music.update(m);
  }

  setMonitor(on) {
    setParam(this.ctx, this.monitor.gain, on ? 1 : 0);
  }

  get micReady() {
    return !!this.mic;
  }

  async enableMic(headphones) {
    if (this.mic && this.micHeadphones === headphones) return;
    this.disableMic();
    const stream = await openMic(headphones);
    this.stream = stream;
    this.micHeadphones = headphones;
    this.mic = this.ctx.createMediaStreamSource(stream);
    this.voice = buildVoiceChain(this.ctx, this.voiceParams, this.bpm);
    this.voice.tuner.port.onmessage = (e) => this.onPitch && this.onPitch(e.data);
    this.mic.connect(this.voice.input);
    this.voice.output.connect(this.monitor);
    this.recorder = makeRecorder(this.ctx);
    this.mic.connect(this.recorder);
  }

  disableMic() {
    if (!this.mic) return;
    this.stream.getTracks().forEach((t) => t.stop());
    this.mic.disconnect();
    this.voice.dispose();
    this.recorder.disconnect();
    this.mic = this.voice = this.recorder = this.stream = null;
  }

  startRecording(latency) {
    this.chunks = [];
    let resolve;
    const done = new Promise((r) => (resolve = r));
    this.recorder.port.onmessage = (e) => {
      if (e.data.done) resolve();
      else this.chunks.push(e.data);
    };
    this.recorder.port.postMessage('start');
    const pos = this.position >= this.duration - 1 ? 0 : this.position;
    const when = this.ctx.currentTime + 0.12;
    this.play(pos, when);
    this.rec = { when, pos, latency, done };
  }

  get recording() {
    return !!this.rec;
  }

  async stopRecording() {
    const r = this.rec;
    if (!r) return null;
    this.rec = null;
    this.recorder.port.postMessage('stop');
    await r.done;
    this.pause();
    if (!this.chunks.length) return null;
    const { first, pcm } = assemble(this.chunks);
    this.chunks = [];
    const sr = this.ctx.sampleRate;
    return {
      pcm,
      sr,
      // موضع بداية الصوت داخل الموسيقى بعد تعويض تأخير الجهاز
      vocalStartPos: first / sr - r.when + r.pos - r.latency,
      musicStartPos: r.pos,
    };
  }

  dispose() {
    this.stop();
    this.disableMic();
    this.music.dispose();
    this.monitor.disconnect();
  }
}

export const floatToInt16 = (f) => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

const int16ToFloat = (i16) => {
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 0x8000;
  return out;
};

function vocalBuffer(ctx, take) {
  const data = int16ToFloat(new Int16Array(take.pcm));
  const buf = ctx.createBuffer(1, data.length, take.sr);
  buf.copyToChannel(data, 0);
  return buf;
}

function takeRange(take, musicBuffer) {
  const start = Math.max(0, take.musicStartPos);
  const end = Math.min(musicBuffer.duration, take.vocalStartPos + take.length / take.sr + 1);
  return { start, end: Math.max(end, start + 0.5) };
}

// يشغّل مصدر الصوت بحيث يتطابق مع موضع الموسيقى pos
function startVocal(src, t0, pos, vocalPos) {
  const vo = pos - vocalPos;
  if (vo >= 0) {
    if (vo < src.buffer.duration) src.start(t0, vo);
  } else src.start(t0 - vo);
}

export class TakePlayer {
  constructor(engine, take, musicBuffer) {
    const ctx = (this.ctx = engine.ctx);
    this.take = take;
    this.musicBuffer = musicBuffer;
    this.vbuf = vocalBuffer(ctx, take);
    this.voice = buildVoiceChain(ctx, take.params, take.bpm);
    this.voice.output.connect(engine.master);
    this.musicChain = buildMusicChain(ctx, take.music);
    this.musicChain.output.connect(engine.master);
    Object.assign(this, takeRange(take, musicBuffer));
    this.offset = this.start;
    this.playing = false;
    this.srcs = [];
    this.onEnded = null;
  }

  get position() {
    if (!this.playing) return this.offset;
    return Math.min(this.end, this.offset + Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  play(pos = this.offset) {
    this._stop();
    if (pos >= this.end - 0.05) pos = this.start;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.06;
    const ms = ctx.createBufferSource();
    ms.buffer = this.musicBuffer;
    ms.connect(this.musicChain.input);
    ms.start(t0, pos);
    ms.stop(t0 + (this.end - pos));
    const vs = ctx.createBufferSource();
    vs.buffer = this.vbuf;
    vs.connect(this.voice.input);
    startVocal(vs, t0, pos, this.take.vocalStartPos + (this.take.nudge || 0));
    this.srcs = [ms, vs];
    this.offset = pos;
    this.startedAt = t0;
    this.playing = true;
    ms.onended = () => {
      if (this.srcs[0] !== ms) return;
      this._stop();
      this.playing = false;
      this.offset = this.start;
      this.onEnded && this.onEnded();
    };
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.position;
    this._stop();
    this.playing = false;
  }

  seek(pos) {
    const was = this.playing;
    this.pause();
    this.offset = Math.max(this.start, Math.min(pos, this.end));
    if (was) this.play(this.offset);
  }

  update() {
    this.voice.update(this.take.params, this.take.bpm);
    this.musicChain.update(this.take.music);
  }

  _stop() {
    for (const s of this.srcs) {
      s.onended = null;
      try {
        s.stop();
      } catch (e) {}
      s.disconnect();
    }
    this.srcs = [];
  }

  dispose() {
    this._stop();
    this.voice.dispose();
    this.musicChain.dispose();
  }
}

// الميكساج النهائي بدون اتصال (أسرع من الوقت الحقيقي) ثم تصدير WAV
export async function renderMix(take, musicBuffer) {
  const { start, end } = takeRange(take, musicBuffer);
  const sr = take.sr;
  const len = end - start + 0.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  await ctx.audioWorklet.addModule(WORKLET_URL);
  const master = buildMaster(ctx);
  const fade = ctx.createGain();
  fade.connect(master);
  fade.gain.setValueAtTime(1, Math.max(0, len - 2));
  fade.gain.linearRampToValueAtTime(0, len);
  const voice = buildVoiceChain(ctx, take.params, take.bpm);
  voice.output.connect(fade);
  const music = buildMusicChain(ctx, take.music);
  music.output.connect(fade);
  const ms = ctx.createBufferSource();
  ms.buffer = musicBuffer;
  ms.connect(music.input);
  ms.start(0, start);
  const vs = ctx.createBufferSource();
  vs.buffer = vocalBuffer(ctx, take);
  vs.connect(voice.input);
  startVocal(vs, 0, start, take.vocalStartPos + (take.nudge || 0));
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

// معايرة التأخير: نشغّل نقرات من السماعة ونقيس متى يسمعها المايك
export async function calibrateLatency(engine) {
  const ctx = await engine.ensure();
  const stream = await openMic(true);
  const src = ctx.createMediaStreamSource(stream);
  const rec = makeRecorder(ctx);
  src.connect(rec);
  const chunks = [];
  let resolve;
  const done = new Promise((r) => (resolve = r));
  rec.port.onmessage = (e) => (e.data.done ? resolve() : chunks.push(e.data));
  rec.port.postMessage('start');
  const t0 = ctx.currentTime + 0.5;
  const clicks = [];
  for (let k = 0; k < 6; k++) {
    const t = t0 + k * 0.5;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.02);
    clicks.push(t);
  }
  await new Promise((r) => setTimeout(r, 3800));
  rec.port.postMessage('stop');
  await done;
  stream.getTracks().forEach((t) => t.stop());
  src.disconnect();
  rec.disconnect();
  if (!chunks.length) throw new Error('no-audio');
  const { first, pcm } = assemble(chunks);
  const sr = ctx.sampleRate;
  const delays = [];
  for (const t of clicks) {
    const s0 = Math.round(t * sr) - first;
    const s1 = Math.min(pcm.length, s0 + Math.round(0.45 * sr));
    if (s0 < 0 || s1 <= s0) continue;
    let max = 0;
    for (let i = s0; i < s1; i++) max = Math.max(max, Math.abs(pcm[i]));
    if (max < 0.02) continue;
    for (let i = s0; i < s1; i++) {
      if (Math.abs(pcm[i]) > max * 0.5) {
        delays.push((i - s0) / sr);
        break;
      }
    }
  }
  if (delays.length < 3) throw new Error('not-heard');
  delays.sort((a, b) => a - b);
  return delays[delays.length >> 1];
}
