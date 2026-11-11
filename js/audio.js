// Tiny Web Audio synth: every sound is generated, so there are no files to cache.
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
}
export function isMuted() { return muted; }

// Must be called from a user gesture (first tap) to unlock audio on mobile.
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') {
    if (ctx.resume) ctx.resume();
    // older iOS only unlocks audio after something actually plays inside a tap
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch (err) { /* ignore */ }
  }
}

export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

function ready() { return ctx && ctx.state === 'running' && !muted; }

function tone({ type = 'sine', f0, f1, dur, vol = 0.3, delay = 0, attack = 0.005 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.05, vol = 0.2, freq = 3000, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

// pitch: 1 = normal. Bigger bubbles pop lower, combos climb higher.
let lastPop = 0;
export function pop(pitch = 1) {
  if (!ready()) return;
  // many pops in the same instant (rainbow chains, swipes) sound like one
  // anyway; skipping the extras saves a lot of audio work on slower devices
  if (ctx.currentTime - lastPop < 0.035) return;
  lastPop = ctx.currentTime;
  const p = pitch * (0.92 + Math.random() * 0.16);
  tone({ f0: 280 * p, f1: 1100 * p, dur: 0.09, vol: 0.35 });
  tone({ type: 'triangle', f0: 900 * p, f1: 1500 * p, dur: 0.06, vol: 0.08, delay: 0.01 });
  noise({ dur: 0.04, vol: 0.25, freq: 2500 * p });
}

export function boing() {
  if (!ready()) return;
  tone({ type: 'triangle', f0: 180, f1: 420, dur: 0.12, vol: 0.25 });
  tone({ type: 'triangle', f0: 420, f1: 160, dur: 0.18, vol: 0.18, delay: 0.1 });
}

export function chime(notes = [0, 4, 7, 12], base = 660, step = 0.07) {
  if (!ready()) return;
  notes.forEach((n, i) => {
    const f = base * Math.pow(2, n / 12);
    tone({ type: 'sine', f0: f, dur: 0.35, vol: 0.18, delay: i * step });
    tone({ type: 'triangle', f0: f * 2, dur: 0.2, vol: 0.05, delay: i * step });
  });
}

export function sparkle() { chime([0, 7, 12, 16, 19, 24], 880, 0.045); }

export function whoosh() {
  if (!ready()) return;
  noise({ dur: 0.5, vol: 0.15, freq: 800 });
  tone({ f0: 300, f1: 1400, dur: 0.45, vol: 0.12 });
}

export function miss() {
  if (!ready()) return;
  tone({ type: 'sine', f0: 520, f1: 300, dur: 0.28, vol: 0.16 });
}

export function win() {
  if (!ready()) return;
  chime([0, 4, 7, 12, 16, 19, 24], 523, 0.09);
  tone({ type: 'triangle', f0: 1046, dur: 0.8, vol: 0.1, delay: 0.65 });
}

export function lose() {
  if (!ready()) return;
  [0, -2, -4, -7].forEach((n, i) => {
    const f = 392 * Math.pow(2, n / 12);
    tone({ type: 'triangle', f0: f, f1: f * 0.97, dur: 0.32, vol: 0.18, delay: i * 0.22 });
  });
}

export function click() {
  if (!ready()) return;
  tone({ type: 'sine', f0: 600, f1: 900, dur: 0.06, vol: 0.15 });
}
