import * as sfx from './audio.js';
import { COLORS, THEMES, LEVELS, endlessParams } from './levels.js';
import { buildSprites, buildSparkle, SPRITE_SIZE, SPRITE_R } from './sprites.js';

// ---------------------------------------------------------------------------
// Save data
// ---------------------------------------------------------------------------
const SAVE_KEY = 'bubble-pop-party.v1';
const save = loadSave();

function loadSave() {
  const def = { unlocked: 1, stars: {}, best: 0, muted: false };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return { ...def, ...s };
  } catch { /* storage blocked: play without saving */ }
  return def;
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function vibrate(ms) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------
const canvas = $('#game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, unit = 1;

const sprites = buildSprites(COLORS);
const sparkleImg = buildSparkle();

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  unit = clamp(Math.min(W, H) / 400, 0.8, 1.8);
  for (const b of bubbles) b.x0 = clamp(b.x0, b.r, Math.max(b.r, W - b.r));
}

// ---------------------------------------------------------------------------
// Background (gradient sky + floating bokeh + twinkles)
// ---------------------------------------------------------------------------
let themeCur = THEMES[0].map(hexToRgb);
let themeTarget = themeCur.map((c) => c.slice());

function setTheme(i) {
  themeTarget = THEMES[i % THEMES.length].map(hexToRgb);
}

const bokeh = Array.from({ length: 12 }, () => ({
  fx: Math.random(), fy: Math.random(),
  r: rand(30, 110), speed: rand(0.008, 0.025), a: rand(0.08, 0.2), drift: rand(0, Math.PI * 2),
}));
const twinkles = Array.from({ length: 26 }, () => ({
  fx: Math.random(), fy: Math.random(), s: rand(6, 16), phase: rand(0, Math.PI * 2), speed: rand(1.2, 3),
}));

function drawBackground(t) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) themeCur[i][j] = lerp(themeCur[i][j], themeTarget[i][j], 0.03);
  }
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(themeCur[0]));
  g.addColorStop(0.55, rgb(themeCur[1]));
  g.addColorStop(1, rgb(themeCur[2]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soft bokeh circles drifting up
  for (const b of bokeh) {
    b.fy -= b.speed * 0.016;
    if (b.fy < -0.2) { b.fy = 1.2; b.fx = Math.random(); }
    const x = b.fx * W + Math.sin(t * 0.3 + b.drift) * 20;
    const y = b.fy * H;
    ctx.globalAlpha = b.a;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, b.r * unit);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, b.r * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  // twinkly stars
  for (const s of twinkles) {
    const a = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
    ctx.globalAlpha = a * 0.8;
    const size = s.s * (0.6 + a * 0.6);
    ctx.drawImage(sparkleImg, s.fx * W - size / 2, s.fy * H - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const MAX_HEARTS = 5;
let bubbles = [];
let particles = [];

const state = {
  mode: 'menu', // 'menu' | 'level' | 'endless'
  levelIndex: 0,
  paused: false,
  over: false,
  intro: 0,
  time: 0,
  score: 0,
  popped: 0,
  goal: 0,
  hearts: MAX_HEARTS,
  heartsLost: 0,
  spawnTimer: 0,
  combo: 0,
  comboTimer: 0,
  slowTimer: 0,
  timeScale: 1,
  target: null,
  params: null,
};

function isPlaying() {
  return (state.mode === 'level' || state.mode === 'endless') && !state.over;
}

function currentParams() {
  if (state.mode === 'endless') return endlessParams(state.time);
  if (state.mode === 'level') return state.params;
  return { rise: 9, spawn: 1.1, size: 1.15, burst: 0, specials: { star: 0.05 } };
}

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------
function baseRadius() { return 38 * unit; }

function chooseKind(specials = {}) {
  let roll = Math.random();
  for (const k of ['rainbow', 'heart', 'snow', 'star', 'big']) {
    const p = specials[k] || 0;
    if (k === 'heart' && state.hearts >= MAX_HEARTS && state.mode !== 'menu') continue;
    if (roll < p) return k;
    roll -= p;
  }
  return 'normal';
}

function chooseColor() {
  if (state.target != null && isPlaying()) {
    if (Math.random() < 0.45) return state.target;
    let c;
    do { c = randInt(0, COLORS.length - 1); } while (c === state.target);
    return c;
  }
  return randInt(0, COLORS.length - 1);
}

function spriteFor(b) {
  if (b.kind === 'normal' || b.kind === 'big' || b.kind === 'small') return sprites.bubbles[b.color];
  return sprites[b.kind];
}

function makeBubble(kind, opts = {}) {
  const p = currentParams();
  let r = baseRadius() * p.size * rand(0.85, 1.15);
  if (kind === 'big') r *= 1.65;
  if (kind === 'small') r *= 0.6;
  if (kind !== 'normal' && kind !== 'big' && kind !== 'small') r *= 1.05;
  r = Math.min(r, W * 0.3);

  let x = opts.x;
  if (x == null) {
    // try to avoid stacking right on top of another freshly spawned bubble
    for (let i = 0; i < 6; i++) {
      x = rand(r, Math.max(r, W - r));
      const close = bubbles.some((o) => o.y > H - o.r * 2 && Math.abs(o.x - x) < (o.r + r) * 0.9);
      if (!close) break;
    }
  }
  const color = opts.color ?? (kind === 'normal' || kind === 'big' ? chooseColor() : randInt(0, COLORS.length - 1));
  const b = {
    kind,
    color,
    x0: x,
    x,
    y: opts.y ?? H + r * 1.3,
    vx: opts.vx || 0,
    r,
    vy: ((H + r * 2.6) / p.rise) * rand(0.88, 1.12) * (kind === 'big' ? 0.8 : 1),
    phase: rand(0, Math.PI * 2),
    swayAmp: rand(6, 18) * unit,
    swaySpeed: rand(0.8, 1.6),
    wobSpeed: rand(3, 5),
    popT: -1,
    boingT: 0,
    chainDelay: -1,
    age: 0,
  };
  b.sprite = spriteFor(b);
  return b;
}

function counts(b) {
  if (state.mode === 'menu') return false;
  if (b.kind === 'star') return true;
  if (b.kind === 'normal' || b.kind === 'big' || b.kind === 'small') {
    return state.target == null || b.color === state.target;
  }
  return false;
}

function spawn() {
  const p = currentParams();
  const n = Math.random() < (p.burst || 0) ? randInt(2, 3) : 1;
  for (let i = 0; i < n; i++) {
    if (bubbles.length >= 40) return;
    const b = makeBubble(chooseKind(p.specials));
    b.y += i * b.r * 1.2;
    bubbles.push(b);
  }
}

// ---------------------------------------------------------------------------
// Particles & floating text
// ---------------------------------------------------------------------------
function addParticle(p) {
  if (particles.length > 350) particles.shift();
  particles.push(p);
}

function burst(x, y, r, hue, big = false) {
  const n = big ? 22 : 12;
  addParticle({ type: 'ring', x, y, r: r * 0.9, vr: r * 5, life: 0.35, max: 0.35, hue });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    const sp = rand(120, 320) * unit * (big ? 1.3 : 1);
    addParticle({
      type: 'drop', x: x + Math.cos(a) * r * 0.8, y: y + Math.sin(a) * r * 0.8,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rand(3, 7) * unit,
      life: rand(0.4, 0.7), max: 0.7, hue: hue == null ? randInt(0, 360) : hue + rand(-15, 15),
    });
  }
  for (let i = 0; i < (big ? 7 : 3); i++) {
    addParticle({
      type: 'spark', x: x + rand(-r, r) * 0.6, y: y + rand(-r, r) * 0.6,
      vx: rand(-60, 60), vy: rand(-120, -20), size: rand(14, 28) * unit,
      rot: rand(0, Math.PI), vrot: rand(-4, 4), life: rand(0.5, 0.9), max: 0.9,
    });
  }
}

function floatText(x, y, text, color = '#fff', size = 30, life = 0.9) {
  addParticle({ type: 'text', x, y, vy: -70, text, color, size: size * unit, life, max: life });
}

function confetti(count = 80) {
  for (let i = 0; i < count; i++) {
    addParticle({
      type: 'confetti', x: rand(0, W), y: rand(-H * 0.3, -10), vx: rand(-60, 60), vy: rand(60, 200),
      size: rand(7, 13) * unit, rot: rand(0, 6), vrot: rand(-8, 8), hue: randInt(0, 360),
      life: rand(2.2, 3.4), max: 3.4,
    });
  }
}

// ---------------------------------------------------------------------------
// Popping
// ---------------------------------------------------------------------------
const PRAISE = ['Great!', 'Awesome!', 'Super!', 'Wow!', 'Amazing!', 'Pop-tastic!', 'Hooray!', 'Bubbly!'];

function hueOf(b) {
  if (b.kind === 'star') return 48;
  if (b.kind === 'heart') return 335;
  if (b.kind === 'snow') return 196;
  if (b.kind === 'rainbow') return null;
  return COLORS[b.color].hue;
}

function popBubble(b, { chain = false } = {}) {
  if (b.popT >= 0) return;
  b.popT = 0;
  b.chainDelay = -1;
  const hue = hueOf(b);
  burst(b.x, b.y, b.r, hue, b.kind !== 'normal' && b.kind !== 'small');

  const playing = isPlaying();
  const sizePitch = clamp(baseRadius() / b.r, 0.6, 1.6);

  if (!chain && playing) {
    state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
    state.comboTimer = 1.1;
  }
  const comboPitch = 1 + Math.min(state.combo, 12) * 0.045;
  sfx.pop(sizePitch * (chain ? rand(0.9, 1.3) : comboPitch));
  if (!chain) vibrate(12);

  if (b.kind === 'big') {
    // split into little bubbles
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.9;
      const s = makeBubble('small', {
        x: b.x, y: b.y, color: b.color, vx: Math.cos(a) * 160 * unit,
      });
      s.x0 = b.x;
      s.vy *= 0.9;
      bubbles.push(s);
    }
  }

  if (!playing) {
    if (b.kind === 'rainbow') { sfx.whoosh(); chainPopAll(b); }
    else if (b.kind !== 'normal') sfx.sparkle();
    return;
  }

  const mult = 1 + Math.min(Math.floor(state.combo / 5), 4);
  let pts = 10;
  if (b.kind === 'big') pts = 20;
  if (b.kind === 'star') pts = 50;
  if (b.kind === 'heart' || b.kind === 'snow' || b.kind === 'rainbow') pts = 25;
  if (!counts(b) && b.kind !== 'heart' && b.kind !== 'snow' && b.kind !== 'rainbow') pts = 0;
  pts *= chain ? 1 : mult;

  if (pts > 0) {
    addScore(pts);
    floatText(b.x, b.y - b.r * 0.2, `+${pts}`, b.kind === 'star' ? '#ffe34d' : '#ffffff', b.kind === 'star' ? 36 : 28);
  }

  if (!chain && state.combo > 0 && state.combo % 5 === 0) {
    floatText(W / 2, H * 0.32, `Combo x${mult}!`, '#ffe86b', 44, 1.2);
    sfx.chime([0, 4, 7, 12], 700 + state.combo * 10, 0.05);
  }

  switch (b.kind) {
    case 'star':
      sfx.sparkle();
      break;
    case 'heart':
      sfx.chime([0, 4, 7, 12, 16], 784, 0.06);
      if (state.hearts < MAX_HEARTS) {
        state.hearts++;
        renderHearts('gain');
        floatText(b.x, b.y + b.r * 0.6, '+1 ❤️', '#ffd0e6', 28);
      }
      break;
    case 'snow':
      sfx.chime([12, 7, 4, 0, 7, 12], 1046, 0.06);
      state.slowTimer = 5;
      floatText(W / 2, H * 0.4, 'Slooow...', '#e4fbff', 44, 1.4);
      break;
    case 'rainbow':
      sfx.whoosh();
      floatText(W / 2, H * 0.4, 'RAINBOW!', '#ffffff', 50, 1.4);
      chainPopAll(b);
      break;
  }

  if (counts(b)) {
    state.popped++;
    updateGoal();
    if (!chain && state.popped % 10 === 0 && state.mode === 'endless') {
      floatText(W / 2, H * 0.25, pick(PRAISE), '#fff', 46, 1.2);
    }
    if (state.mode === 'level' && state.popped >= state.goal) winLevel();
  }
}

function chainPopAll(src) {
  for (const o of bubbles) {
    if (o === src || o.popT >= 0 || o.chainDelay >= 0) continue;
    const d = Math.hypot(o.x - src.x, o.y - src.y);
    o.chainDelay = d / (1400 * unit);
  }
}

function boingBubble(b) {
  b.boingT = 0.4;
  b.y += b.r * 0.15;
  sfx.boing();
  vibrate([8, 30, 8]);
  const chip = $('#hud-target');
  chip.classList.remove('flash');
  void chip.offsetWidth;
  chip.classList.add('flash');
  floatText(b.x, b.y - b.r, 'Not that one!', '#fff', 22, 0.8);
}

function addScore(n) {
  state.score += n;
  $('#hud-score').textContent = state.score;
  const pill = $('.score-pill');
  pill.classList.remove('bump');
  void pill.offsetWidth;
  pill.classList.add('bump');
}

function bubbleEscaped(b) {
  if (!isPlaying() || state.intro > 0) return;
  if (!counts(b) || b.kind === 'star') return;
  state.hearts--;
  state.heartsLost++;
  state.combo = 0;
  sfx.miss();
  vibrate(40);
  renderHearts('shake');
  floatText(clamp(b.x, 60, W - 60), 70 + 40 * unit, 'Oops!', '#ffe0f0', 26, 0.9);
  if (state.hearts <= 0) loseGame();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function onPointerDown(e) {
  e.preventDefault();
  sfx.unlock();
  if (state.paused) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // find the best bubble under the finger (generous hit area for little fingers)
  let best = null;
  let bestScore = Infinity;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (b.popT >= 0) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    const reach = b.r * 1.15 + 10;
    if (d < reach) {
      const s = d / reach;
      if (s < bestScore) { bestScore = s; best = b; }
    }
  }

  if (!best) {
    addParticle({
      type: 'spark', x, y, vx: 0, vy: -30, size: 26 * unit, rot: 0, vrot: 3, life: 0.4, max: 0.4,
    });
    return;
  }

  if (isPlaying() && state.target != null && (best.kind === 'normal' || best.kind === 'big' || best.kind === 'small') && best.color !== state.target) {
    boingBubble(best);
    return;
  }
  popBubble(best);
}

canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });

// ---------------------------------------------------------------------------
// Update & render
// ---------------------------------------------------------------------------
let last = performance.now();
let clock = 0;

function update(dt) {
  clock += dt;
  if (state.paused) return;

  if (isPlaying()) {
    if (state.intro > 0) {
      state.intro -= dt;
    } else {
      state.time += dt;
    }
    if (state.mode === 'endless') {
      const p = endlessParams(state.time);
      if (p.theme !== state.endlessTheme) { state.endlessTheme = p.theme; setTheme(p.theme); }
    }
  }

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 0;
  }
  if (state.slowTimer > 0) state.slowTimer -= dt;
  state.timeScale = lerp(state.timeScale, state.slowTimer > 0 ? 0.4 : 1, Math.min(1, dt * 4));
  const sdt = dt * state.timeScale;

  // spawning
  const spawning = (isPlaying() && state.intro <= 0) || state.mode === 'menu';
  if (spawning) {
    state.spawnTimer -= sdt;
    if (state.spawnTimer <= 0) {
      const p = currentParams();
      state.spawnTimer += p.spawn * rand(0.75, 1.25);
      spawn();
    }
  }

  // bubbles
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (b.popT >= 0) {
      b.popT += dt;
      if (b.popT > 0.12) bubbles.splice(i, 1);
      continue;
    }
    if (b.chainDelay >= 0) {
      b.chainDelay -= dt;
      if (b.chainDelay < 0) { popBubble(b, { chain: true }); continue; }
    }
    b.age += sdt;
    b.y -= b.vy * sdt;
    b.x0 += b.vx * sdt;
    b.vx *= Math.pow(0.04, sdt);
    b.x0 = clamp(b.x0, b.r * 0.6, W - b.r * 0.6);
    b.x = b.x0 + Math.sin(b.age * b.swaySpeed + b.phase) * b.swayAmp;
    if (b.boingT > 0) b.boingT -= dt;
    if (b.y < -b.r * 1.3) {
      bubbles.splice(i, 1);
      bubbleEscaped(b);
    }
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    switch (p.type) {
      case 'ring': p.r += p.vr * dt; p.vr *= 0.9; break;
      case 'drop':
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy = p.vy * 0.92 + 500 * unit * dt;
        break;
      case 'spark': p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt; break;
      case 'text': p.y += p.vy * dt; p.vy *= 0.97; break;
      case 'confetti':
        p.x += p.vx * dt + Math.sin(p.life * 5 + p.hue) * 40 * dt;
        p.y += p.vy * dt; p.rot += p.vrot * dt;
        break;
    }
  }
}

function drawBubble(b) {
  const size = (b.r * SPRITE_SIZE) / SPRITE_R;
  let sx = 1 + Math.sin(b.age * b.wobSpeed + b.phase) * 0.035;
  let sy = 2 - sx;
  let alpha = 1;
  if (b.popT >= 0) {
    const k = b.popT / 0.12;
    sx = sy = 1 + k * 0.35;
    alpha = 1 - k;
  } else if (b.boingT > 0) {
    const k = b.boingT / 0.4;
    const w = Math.sin(k * Math.PI * 4) * 0.18 * k;
    sx = 1 + w; sy = 1 - w;
  }
  if (b.kind === 'rainbow' || b.kind === 'star') {
    // special bubbles gently pulse to catch the eye
    const pulse = 1 + Math.sin(clock * 6 + b.phase) * 0.04;
    sx *= pulse; sy *= pulse;
  }
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.kind === 'rainbow') ctx.rotate(clock * 1.5);
  ctx.scale(sx, sy);
  ctx.drawImage(b.sprite, -size / 2, -size / 2, size, size);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    const k = p.life / p.max;
    switch (p.type) {
      case 'ring':
        ctx.globalAlpha = k * 0.9;
        ctx.strokeStyle = p.hue == null ? '#fff' : `hsl(${p.hue}, 100%, 85%)`;
        ctx.lineWidth = 4 * unit * k + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'drop':
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = `hsl(${p.hue}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.25, p.y - p.size * 0.25, p.size * 0.3 * k, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'spark': {
        ctx.globalAlpha = Math.min(1, k * 1.6);
        const s = p.size * (0.5 + k * 0.5);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(sparkleImg, -s / 2, -s / 2, s, s);
        ctx.restore();
        break;
      }
      case 'text': {
        const appear = Math.min(1, (p.max - p.life) / 0.12);
        ctx.globalAlpha = Math.min(1, k * 2.5);
        const size = p.size * (0.6 + appear * 0.4);
        ctx.font = `700 ${size}px Fredoka, ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(4, size * 0.16);
        ctx.strokeStyle = 'rgba(110, 40, 190, 0.85)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        break;
      }
      case 'confetti':
        ctx.globalAlpha = Math.min(1, k * 3);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 1.7));
        ctx.fillStyle = `hsl(${p.hue}, 100%, 62%)`;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
        break;
    }
  }
  ctx.globalAlpha = 1;
}

function drawFrost() {
  const k = clamp((1 - state.timeScale) / 0.6, 0, 1);
  if (k <= 0.01) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(200, 245, 255, 0)');
  g.addColorStop(1, `rgba(200, 245, 255, ${0.55 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function render() {
  drawBackground(clock);
  for (const b of bubbles) drawBubble(b);
  drawFrost();
  drawParticles();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const HEART_SVG = '<svg class="heart" viewBox="0 0 32 30" aria-hidden="true"><path d="M16 28C5 20 1 14 1 8.8 1 4.4 4.4 1 8.6 1c3 0 5.6 1.7 7.4 4.3C17.8 2.7 20.4 1 23.4 1 27.6 1 31 4.4 31 8.8 31 14 27 20 16 28z" fill="url(#heart-grad)" stroke="#fff" stroke-width="2.2"/><ellipse cx="9" cy="8" rx="3.6" ry="2.4" fill="#fff" opacity=".75" transform="rotate(-30 9 8)"/></svg>';

document.body.insertAdjacentHTML('afterbegin',
  '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="heart-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3d1"/><stop offset=".5" stop-color="#ff3d7f"/><stop offset="1" stop-color="#d1004a"/></linearGradient></defs></svg>');

function renderHearts(anim) {
  const wrap = $('#hud-hearts');
  if (wrap.children.length !== MAX_HEARTS) {
    wrap.innerHTML = HEART_SVG.repeat(MAX_HEARTS);
  }
  [...wrap.children].forEach((h, i) => {
    const alive = i < state.hearts;
    h.classList.toggle('lost', !alive);
    h.classList.remove('shake', 'gain');
  });
  const idx = anim === 'shake' ? state.hearts : state.hearts - 1;
  const el = wrap.children[idx];
  if (anim && el) { void el.offsetWidth; el.classList.add(anim); }
}

function updateGoal() {
  if (state.mode !== 'level') return;
  const n = Math.min(state.popped, state.goal);
  $('#hud-goal-text').textContent = `${n} / ${state.goal}`;
  $('#hud-goal-fill').style.width = `${(n / state.goal) * 100}%`;
}

function setupHud() {
  $('#hud-score').textContent = '0';
  renderHearts();
  const level = state.mode === 'level';
  $('#hud-goal').classList.toggle('hidden', !level);
  $('#hud-best').classList.toggle('hidden', level);
  $('#hud-best-val').textContent = save.best;
  const tgt = $('#hud-target');
  if (state.target != null) {
    const c = COLORS[state.target];
    tgt.classList.remove('hidden');
    $('#hud-target-name').textContent = c.name;
    $('#hud-target-dot').style.background =
      `radial-gradient(circle at 35% 30%, #fff 0 18%, ${c.css} 45%)`;
  } else {
    tgt.classList.add('hidden');
  }
  updateGoal();
}

// ---------------------------------------------------------------------------
// Screens & flow
// ---------------------------------------------------------------------------
function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  $('#hud').classList.toggle('active', id === null || id === 'screen-pause' || id === 'screen-result');
}

function showBanner(title, sub) {
  const el = $('#banner');
  $('#banner-title').textContent = title;
  $('#banner-sub').textContent = sub;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function clearField() {
  for (const b of bubbles) if (b.popT < 0) burst(b.x, b.y, b.r * 0.5, hueOf(b));
  bubbles = [];
}

let resultTimers = [];
function later(fn, ms) { resultTimers.push(setTimeout(fn, ms)); }

function resetRun() {
  resultTimers.forEach(clearTimeout);
  resultTimers = [];
  clearField();
  state.paused = false;
  state.over = false;
  state.time = 0;
  state.score = 0;
  state.popped = 0;
  state.hearts = MAX_HEARTS;
  state.heartsLost = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.slowTimer = 0;
  state.timeScale = 1;
  state.spawnTimer = 0;
  state.intro = 1.6;
  state.endlessTheme = -1;
}

function startLevel(i) {
  sfx.unlock();
  state.mode = 'level';
  state.levelIndex = i;
  state.params = { burst: 0, specials: {}, ...LEVELS[i] };
  state.goal = state.params.goal;
  state.target = state.params.target ?? null;
  resetRun();
  setTheme(state.params.theme);
  setupHud();
  showScreen(null);
  showBanner(`Level ${i + 1}`, state.params.tip);
  sfx.chime([0, 4, 7], 660, 0.1);
}

function startEndless() {
  sfx.unlock();
  state.mode = 'endless';
  state.target = null;
  resetRun();
  setupHud();
  showScreen(null);
  showBanner('Endless!', 'How many can you pop?');
  sfx.chime([0, 4, 7], 660, 0.1);
}

function goHome() {
  resultTimers.forEach(clearTimeout);
  resultTimers = [];
  state.mode = 'menu';
  state.paused = false;
  state.over = false;
  state.target = null;
  state.slowTimer = 0;
  setTheme(0);
  updateTitle();
  showScreen('screen-title');
}

function starsFor(lost) {
  if (lost === 0) return 3;
  if (lost <= 2) return 2;
  return 1;
}

function winLevel() {
  if (state.over) return;
  state.over = true;
  const stars = starsFor(state.heartsLost);
  const key = state.levelIndex + 1;
  save.stars[key] = Math.max(save.stars[key] || 0, stars);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, key + 1));
  persist();

  // celebrate: pop everything left on screen
  for (const b of bubbles) {
    if (b.popT < 0) b.chainDelay = rand(0.05, 0.6);
  }
  confetti(90);
  sfx.win();
  floatText(W / 2, H * 0.4, pick(PRAISE), '#ffe86b', 56, 1.3);

  later(() => {
    const last = state.levelIndex >= LEVELS.length - 1;
    $('#result-title').textContent = last ? 'You did it ALL!' : pick(['Great job!', 'You did it!', 'Awesome!', 'Super popper!']);
    showResult({ stars, next: !last, best: last ? 'Every level complete! 🎉' : '' });
  }, 1300);
}

function loseGame() {
  if (state.over) return;
  state.over = true;
  if (state.mode === 'endless') {
    const isBest = state.score > save.best;
    if (isBest) { save.best = state.score; persist(); }
    sfx.lose();
    if (isBest && state.score > 0) {
      later(() => { confetti(70); sfx.win(); }, 500);
    }
    later(() => {
      $('#result-title').textContent = isBest && state.score > 0 ? 'New Best!' : 'Nice popping!';
      showResult({ stars: null, next: false, best: isBest && state.score > 0 ? '🏆 New best score!' : `Best: ${save.best}`, isBest });
    }, 1100);
  } else {
    sfx.lose();
    later(() => {
      $('#result-title').textContent = 'Oh no! Try again!';
      showResult({ stars: 0, next: false, best: `You popped ${state.popped} of ${state.goal}` });
    }, 1000);
  }
}

function showResult({ stars, next, best, isBest = false }) {
  const starsEl = $('#result-stars');
  starsEl.classList.toggle('hidden', stars == null);
  [...starsEl.children].forEach((s) => s.classList.remove('on'));
  if (stars) {
    [...starsEl.children].forEach((s, i) => {
      if (i < stars) {
        later(() => {
          s.classList.add('on');
          sfx.chime([i * 4], 880, 0);
        }, 350 + i * 300);
      }
    });
  }
  $('#result-score').textContent = state.score;
  const bestEl = $('#result-best');
  bestEl.textContent = best || '';
  bestEl.classList.toggle('new', isBest);
  $('#result-next').classList.toggle('hidden', !next);
  showScreen('screen-result');
}

function pause() {
  if (!isPlaying() || state.paused) return;
  state.paused = true;
  showScreen('screen-pause');
}
function resumeGame() {
  if (!state.paused) return;
  state.paused = false;
  last = performance.now();
  showScreen(null);
}

function buildLevelGrid() {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  let total = 0;
  LEVELS.forEach((lv, i) => {
    const n = i + 1;
    const locked = n > save.unlocked;
    const stars = save.stars[n] || 0;
    total += stars;
    const btn = document.createElement('button');
    btn.className = 'level-btn' + (locked ? ' locked' : '');
    btn.style.setProperty('--h', COLORS[(i * 3) % COLORS.length].hue);
    btn.setAttribute('aria-label', locked ? `Level ${n} (locked)` : `Level ${n}: ${lv.name}`);
    btn.innerHTML = locked
      ? '🔒'
      : `${n}<span class="lv-stars">${[0, 1, 2].map((s) => `<span class="${s < stars ? 'on' : 'off'}">★</span>`).join('')}</span>`;
    btn.addEventListener('click', () => {
      sfx.unlock();
      if (locked) {
        sfx.boing();
        btn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 });
        return;
      }
      startLevel(i);
    });
    grid.appendChild(btn);
  });
  $('#total-stars').textContent = `★ ${total} / ${LEVELS.length * 3}`;
}

function updateTitle() {
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const parts = [];
  if (total > 0) parts.push(`★ ${total} stars`);
  if (save.best > 0) parts.push(`🏆 Best: ${save.best}`);
  $('#title-best').textContent = parts.join('   ');
}

function updateSoundButtons() {
  $$('[data-action="sound"]').forEach((b) => { b.textContent = save.muted ? '🔇' : '🔊'; });
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
let installPrompt = null;

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  sfx.unlock();
  const action = el.dataset.action;
  if (action !== 'sound') sfx.click();
  switch (action) {
    case 'levels': buildLevelGrid(); showScreen('screen-levels'); break;
    case 'endless': startEndless(); break;
    case 'home': goHome(); break;
    case 'pause': pause(); break;
    case 'resume': resumeGame(); break;
    case 'restart':
      if (state.mode === 'endless') startEndless(); else startLevel(state.levelIndex);
      break;
    case 'next':
      if (state.levelIndex < LEVELS.length - 1) startLevel(state.levelIndex + 1); else goHome();
      break;
    case 'sound':
      save.muted = !save.muted;
      sfx.setMuted(save.muted);
      persist();
      updateSoundButtons();
      sfx.click();
      break;
    case 'install':
      if (installPrompt) {
        installPrompt.prompt();
        installPrompt.userChoice.finally(() => {
          installPrompt = null;
          $('#install-btn').classList.add('hidden');
        });
      }
      break;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    sfx.suspend();
  } else {
    sfx.resume();
    last = performance.now();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#install-btn').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('#install-btn').classList.add('hidden');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
window.addEventListener('resize', resize);
resize();
sfx.setMuted(save.muted);
updateSoundButtons();
updateTitle();
renderHearts();
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
  });
}

// expose a tiny hook for automated testing
window.__bubbles = { state, get bubbles() { return bubbles; }, startLevel, startEndless };
