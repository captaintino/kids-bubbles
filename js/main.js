import * as sfx from './audio.js';
import { COLORS, THEMES, LEVELS, endlessParams, immortalParams } from './levels.js';
import { buildSprites, buildSparkle, SPRITE_SIZE, SPRITE_R } from './sprites.js';
import { SCENES, paintScene, createAnimator } from './scenes.js';

// ---------------------------------------------------------------------------
// Save data
// ---------------------------------------------------------------------------
const SAVE_KEY = 'bubble-pop-party.v1';
const save = loadSave();

function loadSave() {
  const def = { unlocked: 1, stars: {}, best: 0, bestImmortal: 0, muted: false, scene: 'party' };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return { ...def, ...s };
  } catch (err) { /* storage blocked: play without saving */ }
  return def;
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (err) { /* ignore */ }
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

let lastVibrate = 0;
function vibrate(ms) {
  const now = performance.now();
  if (now - lastVibrate < 60) return;
  lastVibrate = now;
  try { navigator.vibrate && navigator.vibrate(ms); } catch (err) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------
const canvas = $('#game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, unit = 1;

const sprites = buildSprites(COLORS);
const sparkleImg = buildSparkle();

// Big tablets have huge screens: cap the number of canvas pixels so drawing
// stays fast. Bubbles are smooth sprites, so a slightly lower resolution
// on a large screen is not noticeable.
// If the device can't keep up (e.g. older iPads) quality steps down by itself:
// fewer canvas pixels and fewer particles.
const QUALITY = [
  { pixels: 2.4e6, particles: 240 },
  { pixels: 1.3e6, particles: 150 },
  { pixels: 0.75e6, particles: 90 },
];
let quality = 0;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(QUALITY[quality].pixels / (W * H)));
  DPR = Math.max(1, DPR);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  unit = clamp(Math.min(W, H) / 400, 0.8, 1.8);
  for (const b of bubbles) b.x0 = clamp(b.x0, b.r, Math.max(b.r, W - b.r));
  textCache.clear();
  rebuildBackground(false);
}

// ---------------------------------------------------------------------------
// Background: the scene picture is painted once into a cached canvas and
// copied to the screen each frame; only small moving bits are drawn live.
// ---------------------------------------------------------------------------
let bgCur = document.createElement('canvas');
let bgPrev = document.createElement('canvas');
let bgFade = 1;
let palette = 0;
let animator = createAnimator(save.scene);

function rebuildBackground(fade) {
  if (fade && bgCur.width === canvas.width && bgCur.height === canvas.height) {
    [bgPrev, bgCur] = [bgCur, bgPrev];
    bgFade = 0;
  } else {
    bgFade = 1;
  }
  bgCur.width = canvas.width;
  bgCur.height = canvas.height;
  const c = bgCur.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  paintScene(c, W, H, save.scene, palette);
}

// Level colors only change the backdrop in the "Bubble Party" world.
function setTheme(i) {
  if (palette === i % THEMES.length) return;
  palette = i % THEMES.length;
  if (save.scene === 'party') rebuildBackground(true);
}

function setScene(id) {
  if (save.scene === id) return;
  save.scene = id;
  persist();
  animator = createAnimator(id);
  rebuildBackground(true);
}

function drawBackground(t, dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bgFade < 1) {
    bgFade = Math.min(1, bgFade + dt * 1.6);
    ctx.drawImage(bgPrev, 0, 0);
    ctx.globalAlpha = bgFade;
  }
  ctx.drawImage(bgCur, 0, 0);
  ctx.globalAlpha = 1;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  animator.draw(ctx, W, H, t, dt);
  ctx.globalAlpha = 1;
}

// Icy edge glow for the snowflake slow-down, pre-rendered at low resolution.
const frostImg = (() => {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 30, 64, 64, 92);
  g.addColorStop(0, 'rgba(200, 245, 255, 0)');
  g.addColorStop(1, 'rgba(200, 245, 255, 0.6)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return cv;
})();

// Little colored droplet sprites, one per hue bucket (made on first use).
const dropCache = new Map();
function dropSprite(hue) {
  const key = ((Math.round(hue / 15) * 15) % 360 + 360) % 360;
  let cv = dropCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    c.fillStyle = `hsl(${key}, 100%, 70%)`;
    c.beginPath(); c.arc(16, 16, 15, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.arc(11, 11, 5, 0, Math.PI * 2); c.fill();
    dropCache.set(key, cv);
  }
  return cv;
}

// Floating "+10" style text, rendered once per distinct text/color/size.
const textCache = new Map();
function textSprite(text, color, size) {
  const key = `${text}|${color}|${size | 0}`;
  let cv = textCache.get(key);
  if (cv) return cv;
  if (textCache.size > 80) textCache.clear();
  const scale = DPR;
  const font = `700 ${size}px Fredoka, ui-rounded, system-ui, sans-serif`;
  const m = ctx.measureText ? (ctx.font = font, ctx.measureText(text).width) : size * text.length * 0.6;
  const lw = Math.max(4, size * 0.16);
  const wpx = m + lw * 2 + 4;
  const hpx = size * 1.3 + lw * 2;
  cv = document.createElement('canvas');
  cv.width = Math.ceil(wpx * scale);
  cv.height = Math.ceil(hpx * scale);
  const c = cv.getContext('2d');
  c.scale(scale, scale);
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = lw;
  c.strokeStyle = 'rgba(110, 40, 190, 0.85)';
  c.strokeText(text, wpx / 2, hpx / 2);
  c.fillStyle = color;
  c.fillText(text, wpx / 2, hpx / 2);
  cv.cssW = wpx;
  cv.cssH = hpx;
  textCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const MAX_HEARTS = 5;
let bubbles = [];
let particles = [];

const state = {
  mode: 'menu', // 'menu' | 'level' | 'endless' | 'immortal'
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
  return (state.mode === 'level' || state.mode === 'endless' || state.mode === 'immortal') && !state.over;
}

function currentParams() {
  if (state.mode === 'endless') return endlessParams(state.time);
  if (state.mode === 'immortal') return immortalParams(state.time);
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
  const color = opts.color != null ? opts.color : (kind === 'normal' || kind === 'big' ? chooseColor() : randInt(0, COLORS.length - 1));
  const b = {
    kind,
    color,
    x0: x,
    x,
    y: opts.y != null ? opts.y : H + r * 1.3,
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
function maxParticles() { return QUALITY[quality].particles; }
function addParticle(p) {
  if (particles.length >= maxParticles()) return;
  particles.push(p);
}

function burst(x, y, r, hue, big = false, light = false) {
  const n = (big ? 14 : 8) >> (light ? 1 : 0);
  addParticle({
    type: 'ring', x, y, r: r * 0.9, vr: r * 5, life: 0.35, max: 0.35,
    color: hue == null ? '#ffffff' : `hsl(${hue}, 100%, 85%)`,
  });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    const sp = rand(120, 320) * unit * (big ? 1.3 : 1);
    addParticle({
      type: 'drop', x: x + Math.cos(a) * r * 0.8, y: y + Math.sin(a) * r * 0.8,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rand(3.5, 7.5) * unit,
      life: rand(0.4, 0.7), max: 0.7, img: dropSprite(hue == null ? randInt(0, 360) : hue + rand(-15, 15)),
    });
  }
  const sparks = light ? 1 : big ? 4 : 2;
  for (let i = 0; i < sparks; i++) {
    addParticle({
      type: 'spark', x: x + rand(-r, r) * 0.6, y: y + rand(-r, r) * 0.6,
      vx: rand(-60, 60), vy: rand(-120, -20), size: rand(14, 28) * unit,
      rot: rand(0, Math.PI), vrot: rand(-4, 4), life: rand(0.5, 0.9), max: 0.9,
    });
  }
}

function floatText(x, y, text, color = '#fff', size = 30, life = 0.9) {
  // text is important feedback: make room for it even when particles are maxed out
  if (particles.length >= maxParticles()) particles.shift();
  addParticle({ type: 'text', x, y, vy: -70, img: textSprite(text, color, size * unit), life, max: life });
}

function confetti(count = 80) {
  for (let i = 0; i < count; i++) {
    addParticle({
      type: 'confetti', x: rand(0, W), y: rand(-H * 0.3, -10), vx: rand(-60, 60), vy: rand(60, 200),
      size: rand(7, 13) * unit, rot: rand(0, 6), vrot: rand(-8, 8), hue: randInt(0, 360),
      color: `hsl(${randInt(0, 360)}, 100%, 62%)`, life: rand(2.2, 3.4), max: 3.4,
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
  burst(b.x, b.y, b.r, hue, b.kind !== 'normal' && b.kind !== 'small', chain || swipeBurst > 2);
  swipeBurst++;

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
    if (!chain && state.popped % (state.mode === 'immortal' ? 25 : 10) === 0 && (state.mode === 'endless' || state.mode === 'immortal')) {
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

// The HUD is updated at most once per frame (in flushHud), not once per pop,
// so a big chain of pops doesn't make the browser redo layout over and over.
let hudDirty = false;
let lastBump = 0;
const scoreEl = $('#hud-score');
const scorePill = $('.score-pill');

function addScore(n) {
  state.score += n;
  if (state.mode === 'immortal' && state.score > save.bestImmortal) save.bestImmortal = state.score;
  hudDirty = true;
}

function flushHud() {
  if (!hudDirty) return;
  hudDirty = false;
  scoreEl.textContent = state.score;
  if (state.mode === 'immortal') $('#hud-best-val').textContent = save.bestImmortal;
  if (state.mode === 'level') {
    const n = Math.min(state.popped, state.goal);
    $('#hud-goal-text').textContent = `${n} / ${state.goal}`;
    $('#hud-goal-fill').style.width = `${(n / state.goal) * 100}%`;
  }
  const now = performance.now();
  if (now - lastBump > 200 && scorePill.animate) {
    lastBump = now;
    scorePill.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
  }
}

function bubbleEscaped(b) {
  if (!isPlaying() || state.intro > 0 || state.mode === 'immortal') return;
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
function canvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// Fingers currently held down in Immortal mode (pointerId -> last position),
// so dragging pops everything the finger passes over.
const swipes = new Map();

// id: which finger (pointerId or touch identifier); clientX/Y: page position
function fingerDown(id, clientX, clientY) {
  sfx.unlock();
  if (state.paused) return;
  const { x, y } = canvasPoint(clientX, clientY);

  if (state.mode === 'immortal' && isPlaying()) {
    swipes.set(id, { x, y, trail: 0 });
    if (!swipeThrough(x, y, x, y)) {
      addParticle({ type: 'spark', x, y, vx: 0, vy: -30, size: 26 * unit, rot: 0, vrot: 3, life: 0.4, max: 0.4 });
    }
    return;
  }

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

// Pops every bubble within reach of the segment (x0,y0)->(x1,y1).
// Using the whole segment means a fast swipe can't skip over a bubble.
function swipeThrough(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let popped = 0;
  for (const b of bubbles.slice()) {
    if (b.popT >= 0 || b.chainDelay >= 0) continue;
    let t = len2 > 0 ? ((b.x - x0) * dx + (b.y - y0) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const d = Math.hypot(b.x - (x0 + dx * t), b.y - (y0 + dy * t));
    if (d < b.r + 8) {
      popBubble(b);
      popped++;
    }
  }
  return popped;
}

function fingerMove(id, clientX, clientY) {
  const prev = swipes.get(id);
  if (!prev) return;
  if (state.paused || state.mode !== 'immortal' || !isPlaying()) return;
  const { x, y } = canvasPoint(clientX, clientY);
  swipeThrough(prev.x, prev.y, x, y);

  // sparkly trail behind the finger
  prev.trail += Math.hypot(x - prev.x, y - prev.y);
  const step = 16 * unit;
  while (prev.trail > step) {
    prev.trail -= step;
    const k = Math.random();
    addParticle({
      type: 'trail', x: lerp(prev.x, x, k), y: lerp(prev.y, y, k), size: rand(10, 20) * unit,
      img: dropSprite(clock * 120 + Math.random() * 40), life: 0.45, max: 0.45,
    });
  }
  prev.x = x;
  prev.y = y;
}

function fingerUp(id) {
  swipes.delete(id);
}

const noScroll = { passive: false };
if (window.PointerEvent) {
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    fingerDown(e.pointerId, e.clientX, e.clientY);
  }, noScroll);
  canvas.addEventListener('pointermove', (e) => {
    if (!swipes.has(e.pointerId)) return;
    e.preventDefault();
    fingerMove(e.pointerId, e.clientX, e.clientY);
  }, noScroll);
  const up = (e) => fingerUp(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
} else {
  // Older browsers (e.g. iPads on iOS 12) have touch events but no pointer events.
  const each = (e, fn) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      fn(t.identifier, t.clientX, t.clientY);
    }
  };
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); each(e, fingerDown); }, noScroll);
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); each(e, fingerMove); }, noScroll);
  const end = (e) => { sfx.unlock(); each(e, fingerUp); };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
  let mouseDown = false;
  canvas.addEventListener('mousedown', (e) => { mouseDown = true; fingerDown('mouse', e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => { if (mouseDown) fingerMove('mouse', e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { mouseDown = false; fingerUp('mouse'); });
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// unlock sound on the very first touch anywhere (iOS needs it inside a tap)
for (const type of ['pointerdown', 'touchstart', 'touchend', 'mousedown']) {
  window.addEventListener(type, () => sfx.unlock(), { capture: true, passive: true });
}
// stop pinch-zoom on older iOS, which ignores user-scalable=no
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Update & render
// ---------------------------------------------------------------------------
let last = performance.now();
let clock = 0;
let swipeBurst = 0; // pops so far this frame: extra ones get lighter effects

function update(dt) {
  clock += dt;
  if (state.paused) return;

  if (isPlaying()) {
    if (state.intro > 0) {
      state.intro -= dt;
    } else {
      state.time += dt;
    }
    if (state.mode === 'endless' || state.mode === 'immortal') {
      const p = currentParams();
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
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
      continue;
    }
    switch (p.type) {
      case 'ring': p.r += p.vr * dt; p.vr *= 0.9; break;
      case 'drop':
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy = p.vy * 0.92 + 500 * unit * dt;
        break;
      case 'spark': p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt; break;
      case 'text': p.y += p.vy * dt; p.vy *= 0.97; break;
      case 'trail': p.y -= 20 * dt; break;
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
  if (b.kind === 'rainbow') {
    const c = Math.cos(clock * 1.5);
    const s = Math.sin(clock * 1.5);
    ctx.setTransform(DPR * sx * c, DPR * sx * s, -DPR * sy * s, DPR * sy * c, DPR * b.x, DPR * b.y);
  } else {
    ctx.setTransform(DPR * sx, 0, 0, DPR * sy, DPR * b.x, DPR * b.y);
  }
  ctx.drawImage(b.sprite, -size / 2, -size / 2, size, size);
}

function drawParticles() {
  for (const p of particles) {
    const k = p.life / p.max;
    switch (p.type) {
      case 'ring':
        ctx.globalAlpha = k * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * unit * k + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'drop': {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        const s = p.size * (0.4 + k * 0.6) * 2;
        ctx.drawImage(p.img, p.x - s / 2, p.y - s / 2, s, s);
        break;
      }
      case 'spark': {
        ctx.globalAlpha = Math.min(1, k * 1.6);
        const s = p.size * (0.5 + k * 0.5);
        const c = Math.cos(p.rot);
        const n = Math.sin(p.rot);
        ctx.setTransform(DPR * c, DPR * n, -DPR * n, DPR * c, DPR * p.x, DPR * p.y);
        ctx.drawImage(sparkleImg, -s / 2, -s / 2, s, s);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        break;
      }
      case 'trail': {
        ctx.globalAlpha = k * 0.85;
        const s = p.size * (0.4 + k * 0.6);
        ctx.drawImage(p.img, p.x - s * 0.35, p.y - s * 0.35, s * 0.7, s * 0.7);
        ctx.drawImage(sparkleImg, p.x - s / 2, p.y - s / 2, s, s);
        break;
      }
      case 'text': {
        const appear = Math.min(1, (p.max - p.life) / 0.12);
        ctx.globalAlpha = Math.min(1, k * 2.5);
        const sc = 0.6 + appear * 0.4;
        const w = p.img.cssW * sc;
        const h = p.img.cssH * sc;
        ctx.drawImage(p.img, p.x - w / 2, p.y - h / 2, w, h);
        break;
      }
      case 'confetti': {
        ctx.globalAlpha = Math.min(1, k * 3);
        const c = Math.cos(p.rot);
        const n = Math.sin(p.rot);
        const sy = Math.cos(p.rot * 1.7);
        ctx.setTransform(DPR * c, DPR * n, -DPR * n * sy, DPR * c * sy, DPR * p.x, DPR * p.y);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawFrost() {
  const k = clamp((1 - state.timeScale) / 0.6, 0, 1);
  if (k <= 0.01) return;
  ctx.globalAlpha = k;
  ctx.drawImage(frostImg, 0, 0, W, H);
  ctx.globalAlpha = 1;
}

let lastDt = 0.016;
function render() {
  drawBackground(clock, lastDt);
  for (const b of bubbles) drawBubble(b);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1;
  drawFrost();
  drawParticles();
  flushHud();
}

// Watch how long frames take; if they are consistently slow, lower the quality.
const perf = { frames: 0, time: 0, slow: 0, hold: 3 };
function watchPerformance(rawDt) {
  if (document.hidden || state.paused || rawDt > 0.5) return;
  if (perf.hold > 0) { perf.hold -= rawDt; return; }
  perf.frames++;
  perf.time += rawDt;
  if (perf.time < 1.5) return; // judge in 1.5 second windows
  const avg = perf.time / perf.frames;
  perf.frames = 0;
  perf.time = 0;
  if (avg > 0.024 && quality < QUALITY.length - 1) {
    perf.slow++;
    if (perf.slow >= 2) {
      quality++;
      perf.slow = 0;
      perf.hold = 2;
      resize();
    }
  } else {
    perf.slow = 0;
  }
}

function frame(now) {
  const rawDt = (now - last) / 1000;
  watchPerformance(rawDt);
  const dt = Math.min(0.05, rawDt);
  last = now;
  lastDt = dt;
  swipeBurst = 0;
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
  hudDirty = true;
}

function setupHud() {
  $('#hud-score').textContent = '0';
  if (state.mode === 'level') {
    $('#hud-goal-text').textContent = `0 / ${state.goal}`;
    $('#hud-goal-fill').style.width = '0%';
  }
  renderHearts();
  const level = state.mode === 'level';
  const immortal = state.mode === 'immortal';
  $('#hud-hearts').classList.toggle('invisible', immortal);
  $('#hud-goal').classList.toggle('hidden', !level);
  $('#hud-best').classList.toggle('hidden', level);
  $('#hud-best-val').textContent = immortal ? save.bestImmortal : save.best;
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

// In a browser tab, go fullscreen when a game starts (Android, iPad). On Android
// this means a swipe from the screen edge first just shows the system bars,
// instead of jumping straight to another app mid-game. Installed apps already
// run fullscreen, and iPhones don't allow it, so then this does nothing.
function goFullscreen() {
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  if (navigator.standalone || mq('(display-mode: fullscreen)') || mq('(display-mode: standalone)')) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.catch) p.catch(() => { /* not allowed here: keep playing normally */ });
  } catch (err) { /* ignore */ }
}

function startLevel(i) {
  sfx.unlock();
  goFullscreen();
  state.mode = 'level';
  state.levelIndex = i;
  state.params = { burst: 0, specials: {}, ...LEVELS[i] };
  state.goal = state.params.goal;
  state.target = state.params.target != null ? state.params.target : null;
  resetRun();
  setTheme(state.params.theme);
  setupHud();
  showScreen(null);
  showBanner(`Level ${i + 1}`, state.params.tip);
  sfx.chime([0, 4, 7], 660, 0.1);
}

function startEndless() {
  sfx.unlock();
  goFullscreen();
  state.mode = 'endless';
  state.target = null;
  resetRun();
  setupHud();
  showScreen(null);
  showBanner('Endless!', 'How many can you pop?');
  sfx.chime([0, 4, 7], 660, 0.1);
}

function startImmortal() {
  sfx.unlock();
  goFullscreen();
  state.mode = 'immortal';
  state.target = null;
  resetRun();
  state.intro = 1.2;
  swipes.clear();
  setupHud();
  showScreen(null);
  showBanner('Endless Immortal!', 'Swipe your finger to pop! 💫');
  sfx.chime([0, 4, 7, 12], 660, 0.08);
}

function goHome() {
  persist();
  swipes.clear();
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
  swipes.clear();
  persist();
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
        if (btn.animate) btn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 250 });
        return;
      }
      startLevel(i);
    });
    grid.appendChild(btn);
  });
  $('#total-stars').textContent = `★ ${total} / ${LEVELS.length * 3}`;
}

function buildThemeGrid() {
  const grid = $('#theme-grid');
  grid.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; });
  grid.innerHTML = '';
  for (const sc of SCENES) {
    const btn = document.createElement('button');
    btn.className = 'theme-card' + (sc.id === save.scene ? ' selected' : '');
    btn.setAttribute('aria-label', sc.name);
    btn.setAttribute('aria-pressed', String(sc.id === save.scene));
    const cv = document.createElement('canvas');
    btn.append(cv);
    btn.insertAdjacentHTML('beforeend', `<span class="check">✓</span><span class="theme-name">${sc.icon} ${sc.name}</span>`);
    btn.addEventListener('click', () => {
      sfx.unlock();
      sfx.chime([0, 4, 7], 784, 0.05);
      setScene(sc.id);
      grid.querySelectorAll('.theme-card').forEach((c) => {
        const on = c === btn;
        c.classList.toggle('selected', on);
        c.setAttribute('aria-pressed', String(on));
      });
    });
    grid.append(btn);
  }
  // paint the little previews once the cards have a size
  requestAnimationFrame(() => {
    grid.querySelectorAll('canvas').forEach((cv, i) => {
      const r = cv.getBoundingClientRect();
      const w = Math.max(60, r.width);
      const h = Math.max(75, r.height);
      const s = Math.min(2, window.devicePixelRatio || 1);
      // draw the scene as if on a phone-sized screen, then shrink it into the card
      const vw = 360;
      const vh = (360 * h) / w;
      cv.width = Math.round(w * s);
      cv.height = Math.round(h * s);
      const c = cv.getContext('2d');
      c.scale((w * s) / vw, (h * s) / vh);
      paintScene(c, vw, vh, SCENES[i].id, 0);
      const anim = createAnimator(SCENES[i].id);
      for (let k = 0; k < 3; k++) anim.draw(c, vw, vh, 2 + k, k === 0 ? 0 : 1.2);
    });
  });
}

function updateTitle() {
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const parts = [];
  if (total > 0) parts.push(`★ ${total} stars`);
  if (save.best > 0) parts.push(`🏆 Best: ${save.best}`);
  if (save.bestImmortal > 0) parts.push(`💫 ${save.bestImmortal}`);
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
    case 'themes': buildThemeGrid(); showScreen('screen-themes'); break;
    case 'immortal': startImmortal(); break;
    case 'home': goHome(); break;
    case 'pause': pause(); break;
    case 'resume': resumeGame(); break;
    case 'restart':
      if (state.mode === 'endless') startEndless();
      else if (state.mode === 'immortal') startImmortal();
      else startLevel(state.levelIndex);
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
window.addEventListener('resize', () => { perf.hold = 1.5; resize(); });
resize();
// the Wild West sign uses the game font: repaint once it has loaded
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rebuildBackground(false));
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
window.__bubbles = { get quality() { return quality; }, state, get bubbles() { return bubbles; }, startLevel, startEndless, startImmortal };
