// Background "worlds". Each scene has:
//   paint(ctx, w, h, palette)  - the still picture, drawn ONCE into a cached canvas
//   animator                    - a few cheap moving bits drawn every frame (fish, clouds, flags...)
// Keeping the big picture cached means a whole scene costs one image copy per frame.
import { THEMES } from './levels.js';
import { starPath } from './sprites.js';

export const SCENES = [
  { id: 'party', name: 'Bubble Party', icon: '🎉' },
  { id: 'underwater', name: 'Under the Sea', icon: '🐠' },
  { id: 'west', name: 'Wild West', icon: '🤠' },
  { id: 'knights', name: 'Knights & Castles', icon: '🏰' },
  { id: 'space', name: 'Outer Space', icon: '🚀' },
];

const TAU = Math.PI * 2;
const FONT = 'Fredoka, ui-rounded, system-ui, sans-serif';

// Seeded random so a scene looks the same every time it is redrawn (e.g. on rotate).
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (a, b) => a + Math.random() * (b - a);

function vgrad(c, y0, y1, stops) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

// Small sprite canvases drawn at 2x for crispness.
function sprite(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * 2);
  cv.height = Math.ceil(h * 2);
  const c = cv.getContext('2d');
  c.scale(2, 2);
  draw(c, w, h);
  return { img: cv, w, h };
}

function blit(ctx, s, x, y, scale = 1, flip = false, alpha = 1) {
  const w = s.w * scale;
  const h = s.h * scale;
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(s.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(s.img, x - w / 2, y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Shared sprites (built lazily, once)
// ---------------------------------------------------------------------------
let shared = null;
function sharedSprites() {
  if (shared) return shared;
  const soft = sprite(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const sparkle = sprite(32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    c.fillStyle = '#fff';
    starPath(c, 16, 16, 15, 2.2, 4, 0);
    c.fill();
  });
  const cloud = sprite(170, 80, (c) => {
    const puffs = [[40, 52, 26], [70, 38, 32], [104, 36, 28], [130, 52, 24], [86, 58, 26], [55, 60, 20], [118, 62, 18]];
    c.fillStyle = 'rgba(120, 140, 220, 0.18)';
    for (const [x, y, r] of puffs) { c.beginPath(); c.arc(x, y + 6, r, 0, TAU); c.fill(); }
    c.fillStyle = '#ffffff';
    for (const [x, y, r] of puffs) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.ellipse(66, 28, 14, 6, -0.3, 0, TAU); c.fill();
  });
  const ringBubble = sprite(24, 24, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 1.8;
    c.beginPath(); c.arc(12, 12, 9, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(9, 9, 2.2, 0, TAU); c.fill();
  });
  shared = { soft, sparkle, cloud, ringBubble };
  return shared;
}

// Clouds drifting slowly across the sky (used by a few scenes).
function makeClouds(n, yMin, yMax, alpha = 1) {
  const S = sharedSprites();
  let clouds = null;
  return {
    draw(ctx, w, h, t, dt) {
      if (!clouds) {
        clouds = Array.from({ length: n }, (_, i) => ({
          x: (i + Math.random() * 0.5) * (w / n), y: rand(yMin, yMax), s: rand(0.6, 1.1), v: rand(6, 14),
        }));
      }
      const u = Math.min(w, h) / 400;
      for (const cl of clouds) {
        cl.x += cl.v * dt;
        const half = S.cloud.w * cl.s * u * 0.5;
        if (cl.x - half > w) { cl.x = -half; cl.y = rand(yMin, yMax); }
        blit(ctx, S.cloud, cl.x, cl.y * h, cl.s * u, false, alpha);
      }
    },
  };
}

// Twinkling sparkles at random spots.
function makeTwinkles(n, yMax = 1) {
  const S = sharedSprites();
  const tw = Array.from({ length: n }, () => ({
    fx: Math.random(), fy: Math.random() * yMax, s: rand(6, 16), phase: rand(0, TAU), speed: rand(1.2, 3),
  }));
  return {
    draw(ctx, w, h, t) {
      for (const s of tw) {
        const a = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        const size = s.s * (0.6 + a * 0.6);
        ctx.globalAlpha = a * 0.85;
        ctx.drawImage(S.sparkle.img, s.fx * w - size / 2, s.fy * h - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// ---------------------------------------------------------------------------
// Bubble Party (the original look: colors change per level)
// ---------------------------------------------------------------------------
function paintParty(c, w, h, palette) {
  const [a, b, d] = THEMES[palette % THEMES.length];
  c.fillStyle = vgrad(c, 0, h, [[0, a], [0.55, b], [1, d]]);
  c.fillRect(0, 0, w, h);
}

function partyAnimator() {
  const S = sharedSprites();
  const bokeh = Array.from({ length: 12 }, () => ({
    fx: Math.random(), fy: Math.random(), r: rand(30, 110), v: rand(0.008, 0.025), a: rand(0.08, 0.2), drift: rand(0, TAU),
  }));
  const tw = makeTwinkles(26);
  return {
    draw(ctx, w, h, t, dt) {
      const u = Math.min(w, h) / 400;
      for (const b of bokeh) {
        b.fy -= b.v * dt;
        if (b.fy < -0.2) { b.fy = 1.2; b.fx = Math.random(); }
        const r = b.r * u;
        ctx.globalAlpha = b.a;
        ctx.drawImage(S.soft.img, b.fx * w + Math.sin(t * 0.3 + b.drift) * 20 - r, b.fy * h - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      tw.draw(ctx, w, h, t, dt);
    },
  };
}

// ---------------------------------------------------------------------------
// Under the Sea
// ---------------------------------------------------------------------------
const seaFloor = (w, h) => h - Math.max(70, h * 0.13);

function coral(c, R, x, y, len, ang, width, depth, color, tip) {
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
  if (depth > 0) {
    coral(c, R, x2, y2, len * 0.72, ang - 0.5 + R() * 0.2, width * 0.72, depth - 1, color, tip);
    coral(c, R, x2, y2, len * 0.72, ang + 0.5 - R() * 0.2, width * 0.72, depth - 1, color, tip);
  } else {
    c.fillStyle = tip;
    c.beginPath(); c.arc(x2, y2, width * 0.55, 0, TAU); c.fill();
  }
}

function paintUnderwater(c, w, h) {
  const R = rng(11);
  const u = Math.min(w, h) / 400;
  const floor = seaFloor(w, h);
  c.fillStyle = vgrad(c, 0, h, [[0, '#7aeaf4'], [0.25, '#2bb4e4'], [0.7, '#1474c6'], [1, '#0b4a9a']]);
  c.fillRect(0, 0, w, h);

  // sunbeams from the surface
  for (let i = 0; i < 6; i++) {
    const x = w * (0.04 + i * 0.19 + R() * 0.06);
    const top = (14 + R() * 26) * u;
    const bot = (110 + R() * 120) * u;
    const len = h * (0.55 + R() * 0.3);
    const skew = w * 0.1;
    c.fillStyle = vgrad(c, 0, len, [[0, 'rgba(255,255,255,0.24)'], [1, 'rgba(255,255,255,0)']]);
    c.beginPath();
    c.moveTo(x - top, 0); c.lineTo(x + top, 0);
    c.lineTo(x + bot + skew, len); c.lineTo(x - bot + skew, len);
    c.closePath(); c.fill();
  }
  // ripples at the surface
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 3 * u;
  c.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    for (let x = 0; x <= w; x += 10) {
      const y = (10 + k * 16) * u + Math.sin(x * 0.04 + k * 2) * 4 * u;
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  // far-away rocks
  c.fillStyle = 'rgba(8, 50, 125, 0.45)';
  for (let i = 0; i < 7; i++) {
    c.beginPath();
    c.ellipse(w * (i / 6) + R() * 30, floor + 12, w * 0.12 + R() * 40, (40 + R() * 70) * u, 0, 0, TAU);
    c.fill();
  }
  // coral
  c.lineCap = 'round';
  coral(c, R, w * 0.1, floor + 14, 46 * u, -Math.PI / 2, 13 * u, 3, '#ff6fa8', '#ffc1dc');
  coral(c, R, w * 0.9, floor + 14, 54 * u, -Math.PI / 2 - 0.1, 14 * u, 3, '#b36bff', '#e2c2ff');
  coral(c, R, w * 0.52, floor + 16, 30 * u, -Math.PI / 2 + 0.15, 10 * u, 2, '#ff9a4d', '#ffd2a6');
  // brain coral
  const bx = w * 0.72;
  const by = floor + 8;
  c.fillStyle = vgrad(c, by - 34 * u, by + 10 * u, [[0, '#ffd27a'], [1, '#ff9f4a']]);
  c.beginPath(); c.ellipse(bx, by, 40 * u, 30 * u, 0, Math.PI, 0); c.fill();
  c.strokeStyle = 'rgba(200, 100, 30, 0.45)';
  c.lineWidth = 3 * u;
  for (let k = 1; k < 4; k++) {
    c.beginPath(); c.ellipse(bx, by, 40 * u * k / 4, 30 * u * k / 4, 0, Math.PI, 0); c.stroke();
  }

  // sand
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w + 20; x += 20) c.lineTo(x, floor + Math.sin(x * 0.015) * 8 * u + Math.sin(x * 0.043) * 3 * u);
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = vgrad(c, floor - 10, h, [[0, '#ffe9ad'], [1, '#efbd68']]);
  c.fill();
  c.fillStyle = 'rgba(190, 130, 50, 0.35)';
  for (let i = 0; i < 70; i++) {
    c.beginPath(); c.arc(R() * w, floor + 12 + R() * (h - floor - 14), (1 + R() * 2) * u, 0, TAU); c.fill();
  }

  // starfish
  const sx = w * 0.3;
  const sy = floor + (h - floor) * 0.5;
  c.save();
  c.translate(sx, sy);
  c.rotate(0.3);
  starPath(c, 0, 0, 24 * u, 11 * u);
  c.fillStyle = '#ff8357';
  c.strokeStyle = '#ff8357';
  c.lineJoin = 'round';
  c.lineWidth = 6 * u;
  c.stroke(); c.fill();
  c.fillStyle = '#ffd0b5';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5;
    c.beginPath(); c.arc(Math.cos(a) * 12 * u, Math.sin(a) * 12 * u, 2.2 * u, 0, TAU); c.fill();
  }
  c.restore();

  // seashell
  const shx = w * 0.58;
  const shy = floor + (h - floor) * 0.6;
  c.fillStyle = '#ffd3e4';
  c.strokeStyle = '#f39abf';
  c.lineWidth = 2 * u;
  c.beginPath(); c.moveTo(shx, shy + 10 * u); c.arc(shx, shy + 10 * u, 22 * u, Math.PI * 1.1, Math.PI * 1.9); c.closePath();
  c.fill(); c.stroke();
  for (let i = 1; i < 5; i++) {
    const a = Math.PI * (1.1 + i * 0.16);
    c.beginPath(); c.moveTo(shx, shy + 10 * u); c.lineTo(shx + Math.cos(a) * 21 * u, shy + 10 * u + Math.sin(a) * 21 * u); c.stroke();
  }

  // treasure chest
  const cx = w * 0.84;
  const cy = floor + (h - floor) * 0.45;
  const cw = 54 * u;
  const ch = 32 * u;
  c.fillStyle = '#ffd34d';
  for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(cx - cw * 0.3 + i * cw * 0.15, cy - ch * 0.55 - (i % 2) * 4 * u, 6 * u, 0, TAU); c.fill(); }
  c.fillStyle = '#a5642f';
  c.strokeStyle = '#6e3d17';
  c.lineWidth = 2.5 * u;
  c.beginPath(); c.rect(cx - cw / 2, cy - ch / 2, cw, ch); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(cx, cy - ch / 2, cw / 2, ch * 0.45, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffcf3d';
  c.fillRect(cx - 4 * u, cy - ch * 0.9, 8 * u, ch * 1.4);
  c.fillRect(cx - cw / 2, cy - ch * 0.12, cw, 5 * u);
  c.fillStyle = '#6e3d17';
  c.beginPath(); c.arc(cx, cy, 3 * u, 0, TAU); c.fill();
}

function fishSprite(body, belly, fin, stripe) {
  return sprite(90, 60, (c) => {
    c.fillStyle = fin;
    c.beginPath(); c.moveTo(24, 30); c.lineTo(4, 12); c.quadraticCurveTo(12, 30, 4, 48); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(36, 14); c.quadraticCurveTo(48, -2, 64, 14); c.closePath(); c.fill();
    c.fillStyle = vgrad(c, 11, 49, [[0, body], [1, belly]]);
    c.beginPath(); c.ellipse(50, 30, 32, 19, 0, 0, TAU); c.fill();
    if (stripe) {
      c.save();
      c.beginPath(); c.ellipse(50, 30, 32, 19, 0, 0, TAU); c.clip();
      c.fillStyle = stripe;
      c.fillRect(38, 0, 8, 60);
      c.fillRect(58, 0, 7, 60);
      c.restore();
    }
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 2;
    c.beginPath(); c.ellipse(50, 30, 32, 19, 0, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(46, 20, 13, 4, -0.1, 0, TAU); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(67, 25, 7.5, 0, TAU); c.fill();
    c.fillStyle = '#1d1d3a';
    c.beginPath(); c.arc(69, 25, 4.2, 0, TAU); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(70.5, 23.3, 1.6, 0, TAU); c.fill();
    c.strokeStyle = '#1d1d3a';
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath(); c.arc(72, 33, 5, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
  });
}

let fishSprites = null;
function underwaterAnimator() {
  const S = sharedSprites();
  if (!fishSprites) {
    fishSprites = [
      fishSprite('#ffa43a', '#ff7a1a', '#ff8a2a', 'rgba(255,255,255,0.95)'),
      fishSprite('#ffe14a', '#ffbf1f', '#ffcd3a', null),
      fishSprite('#ff8ad0', '#ff4fae', '#ff6fc0', 'rgba(255,255,255,0.55)'),
      fishSprite('#6fd8ff', '#3a8cff', '#59b2ff', 'rgba(255,240,120,0.9)'),
    ];
  }
  let fish = null;
  let weeds = null;
  const bubbles = Array.from({ length: 16 }, () => ({ fx: Math.random(), fy: Math.random(), s: rand(0.5, 1.2), v: rand(0.04, 0.09), ph: rand(0, TAU) }));
  const newFish = (f, w, h, first) => {
    f.dir = Math.random() < 0.5 ? 1 : -1;
    f.y = rand(0.25, 0.72) * h;
    f.v = rand(28, 60) * f.dir;
    f.x = first ? rand(0, w) : f.dir > 0 ? -80 - rand(0, 300) : w + 80 + rand(0, 300);
  };
  return {
    draw(ctx, w, h, t, dt) {
      const u = Math.min(w, h) / 400;
      const floor = seaFloor(w, h);
      if (!fish || fish.w !== w) {
        fish = fishSprites.map((s) => { const f = { s, sc: rand(0.6, 0.95) }; newFish(f, w, h, true); return f; });
        fish.w = w;
        weeds = [0.04, 0.2, 0.42, 0.64, 0.78, 0.96].map((fx, i) => ({
          x: fx * w, hgt: rand(90, 170) * u, ph: rand(0, TAU), col: i % 2 ? '#2fbf6a' : '#46d67e',
        }));
      }
      // rising little bubbles
      for (const b of bubbles) {
        b.fy -= b.v * dt;
        if (b.fy < -0.05) { b.fy = 1.05; b.fx = Math.random(); }
        const x = b.fx * w + Math.sin(t * 2 + b.ph) * 6;
        blit(ctx, S.ringBubble, x, b.fy * floor, b.s * u, false, 0.8);
      }
      // fish
      for (const f of fish) {
        f.x += f.v * dt;
        if ((f.v > 0 && f.x > w + 100) || (f.v < 0 && f.x < -100)) newFish(f, w, h, false);
        blit(ctx, f.s, f.x, f.y + Math.sin(t * 1.6 + f.sc * 10) * 6 * u, f.sc * u, f.v < 0);
      }
      // swaying seaweed
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const wd of weeds) {
        const segs = 6;
        const step = wd.hgt / segs;
        for (const [col, lw] of [['#1b8f4c', 13 * u], [wd.col, 8 * u]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(wd.x, floor + 14 * u);
          for (let i = 1; i <= segs; i++) {
            const sway = Math.sin(t * 1.4 + wd.ph + i * 0.55) * i * 2.6 * u;
            ctx.lineTo(wd.x + sway, floor + 14 * u - i * step);
          }
          ctx.stroke();
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Wild West
// ---------------------------------------------------------------------------
const westHorizon = (h) => h * 0.6;

function cactus(c, x, base, hh) {
  const tw = hh * 0.2;
  const parts = (lw) => {
    c.lineWidth = lw;
    c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - hh); c.stroke();
    c.lineWidth = lw * 0.75;
    c.beginPath(); c.moveTo(x, base - hh * 0.42); c.lineTo(x - hh * 0.28, base - hh * 0.42); c.lineTo(x - hh * 0.28, base - hh * 0.74); c.stroke();
    c.beginPath(); c.moveTo(x, base - hh * 0.58); c.lineTo(x + hh * 0.26, base - hh * 0.58); c.lineTo(x + hh * 0.26, base - hh * 0.9); c.stroke();
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(150, 80, 30, 0.25)';
  c.beginPath(); c.ellipse(x + hh * 0.05, base + 2, hh * 0.35, hh * 0.05, 0, 0, TAU); c.fill();
  c.strokeStyle = '#257a35'; parts(tw + 6);
  c.strokeStyle = '#46ad55'; parts(tw);
  c.save(); c.translate(-tw * 0.2, 0);
  c.strokeStyle = 'rgba(160, 240, 140, 0.6)'; parts(tw * 0.2);
  c.restore();
  c.fillStyle = '#ff6fa8';
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5;
    c.beginPath(); c.arc(x + Math.cos(a) * tw * 0.22, base - hh - tw * 0.35 + Math.sin(a) * tw * 0.22, tw * 0.18, 0, TAU); c.fill();
  }
  c.fillStyle = '#ffe14a';
  c.beginPath(); c.arc(x, base - hh - tw * 0.35, tw * 0.12, 0, TAU); c.fill();
}

function paintWest(c, w, h) {
  const R = rng(7);
  const u = Math.min(w, h) / 400;
  const hz = westHorizon(h);
  c.fillStyle = vgrad(c, 0, hz, [[0, '#ff8d5c'], [0.45, '#ffb56c'], [1, '#ffe4a3']]);
  c.fillRect(0, 0, w, hz + 2);

  // sun
  const sx = w * 0.78;
  const sy = h * 0.17;
  const sr = 42 * u;
  const glow = c.createRadialGradient(sx, sy, sr, sx, sy, sr * 3);
  glow.addColorStop(0, 'rgba(255, 245, 170, 0.65)');
  glow.addColorStop(1, 'rgba(255, 245, 170, 0)');
  c.fillStyle = glow;
  c.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
  c.fillStyle = 'rgba(255, 250, 200, 0.45)';
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    c.beginPath();
    c.moveTo(sx + Math.cos(a - 0.1) * sr * 1.2, sy + Math.sin(a - 0.1) * sr * 1.2);
    c.lineTo(sx + Math.cos(a) * sr * 1.95, sy + Math.sin(a) * sr * 1.95);
    c.lineTo(sx + Math.cos(a + 0.1) * sr * 1.2, sy + Math.sin(a + 0.1) * sr * 1.2);
    c.fill();
  }
  const sun = c.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 0, sx, sy, sr);
  sun.addColorStop(0, '#fffbe2');
  sun.addColorStop(0.5, '#ffe250');
  sun.addColorStop(1, '#ffb52e');
  c.fillStyle = sun;
  c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();

  // mesas (flat-topped hills)
  const mesas = (list, color, stripe) => {
    for (const [x0, x1, top] of list) {
      const s = (x1 - x0) * 0.12;
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x0, hz + 2); c.lineTo(x0 + s, hz - top); c.lineTo(x1 - s, hz - top); c.lineTo(x1, hz + 2);
      c.closePath(); c.fill();
      if (stripe) {
        c.strokeStyle = stripe;
        c.lineWidth = 3 * u;
        for (let k = 1; k < 3; k++) {
          const y = hz - top + (top * k) / 3;
          const inset = s * (1 - k / 3);
          c.beginPath(); c.moveTo(x0 + inset + 4, y); c.lineTo(x1 - inset - 4, y); c.stroke();
        }
      }
    }
  };
  mesas([[w * -0.05, w * 0.3, h * 0.09], [w * 0.42, w * 0.7, h * 0.13], [w * 0.75, w * 1.1, h * 0.07]], '#efa070');
  mesas([[w * 0.12, w * 0.5, h * 0.16], [w * 0.68, w * 0.92, h * 0.1]], '#d4693f', '#e88758');

  // desert ground
  c.fillStyle = vgrad(c, hz, h, [[0, '#f8cc84'], [1, '#e8a059']]);
  c.fillRect(0, hz, w, h - hz);
  c.strokeStyle = 'rgba(255, 240, 200, 0.55)';
  c.lineWidth = 3 * u;
  for (let k = 0; k < 4; k++) {
    const y0 = hz + (h - hz) * (0.18 + k * 0.22);
    c.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = y0 + Math.sin(x * 0.012 + k * 1.7) * 8 * u;
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  c.fillStyle = 'rgba(160, 90, 40, 0.35)';
  for (let i = 0; i < 60; i++) {
    c.beginPath(); c.arc(R() * w, hz + 8 + R() * (h - hz - 10), (1 + R() * 2.2) * u, 0, TAU); c.fill();
  }
  // rocks
  for (const [fx, fy, s] of [[0.36, 0.86, 1], [0.7, 0.95, 1.3], [0.05, 0.97, 0.9]]) {
    const x = w * fx;
    const y = h * fy;
    c.fillStyle = '#b98060';
    c.beginPath(); c.ellipse(x, y, 22 * s * u, 13 * s * u, 0, Math.PI, 0); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath(); c.ellipse(x - 6 * s * u, y - 7 * s * u, 7 * s * u, 3 * s * u, -0.3, 0, TAU); c.fill();
  }

  cactus(c, w * 0.62, hz + (h - hz) * 0.18, 70 * u);
  cactus(c, w * 0.13, h * 0.84, 120 * u);
  cactus(c, w * 0.88, h * 0.92, 140 * u);

  // signpost
  const px = w * 0.42;
  const pb = h * 0.9;
  const ph = 100 * u;
  c.fillStyle = '#8a5a34';
  c.fillRect(px - 5 * u, pb - ph, 10 * u, ph);
  const bw = 112 * u;
  const bh = 32 * u;
  const by = pb - ph + 6 * u;
  c.fillStyle = '#d0904e';
  c.strokeStyle = '#7a4a24';
  c.lineWidth = 3 * u;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(px - bw * 0.42, by); c.lineTo(px + bw * 0.42, by); c.lineTo(px + bw * 0.55, by + bh / 2);
  c.lineTo(px + bw * 0.42, by + bh); c.lineTo(px - bw * 0.42, by + bh); c.closePath();
  c.fill(); c.stroke();
  c.fillStyle = '#5a3418';
  c.font = `700 ${17 * u}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('POP TOWN', px + bw * 0.02, by + bh / 2 + 1);
}

function westAnimator() {
  const clouds = makeClouds(3, 0.05, 0.3, 0.9);
  let tumble = null;
  let wait = 2;
  const tumbleSprite = sprite(56, 56, (c) => {
    const R = rng(3);
    c.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      c.strokeStyle = i % 3 ? '#a7743f' : '#cf9c5e';
      c.lineWidth = 2.2;
      const r = 8 + R() * 18;
      const a = R() * TAU;
      c.beginPath(); c.arc(28 + Math.cos(a) * (24 - r) * 0.5, 28 + Math.sin(a) * (24 - r) * 0.5, r, a, a + 2 + R() * 2); c.stroke();
    }
  });
  return {
    draw(ctx, w, h, t, dt) {
      clouds.draw(ctx, w, h, t, dt);
      const u = Math.min(w, h) / 400;
      if (!tumble) {
        wait -= dt;
        if (wait <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          tumble = { dir, x: dir > 0 ? -40 : w + 40, gy: rand(westHorizon(h) + (h - westHorizon(h)) * 0.35, h * 0.93), rot: 0, ph: 0, s: rand(0.8, 1.2) };
        }
        return;
      }
      tumble.x += tumble.dir * 110 * u * dt;
      tumble.ph += dt * 5;
      tumble.rot += tumble.dir * dt * 6;
      const r = 28 * u * tumble.s;
      const y = tumble.gy - r - Math.abs(Math.sin(tumble.ph)) * 26 * u;
      ctx.save();
      ctx.translate(tumble.x, y);
      ctx.rotate(tumble.rot);
      ctx.drawImage(tumbleSprite.img, -r, -r, r * 2, r * 2);
      ctx.restore();
      if (tumble.x < -60 || tumble.x > w + 60) { tumble = null; wait = rand(3, 8); }
    },
  };
}

// ---------------------------------------------------------------------------
// Knights & Castles
// ---------------------------------------------------------------------------
function castleLayout(w, h) {
  const S = Math.min(w * 0.78, h * 0.42);
  const cx = w * 0.5;
  const base = h * 0.66;
  const tw = S * 0.2;
  const towerH = S * 0.52;
  const roofH = S * 0.24;
  const keepH = S * 0.6;
  const poles = [
    { x: cx - S * 0.4, y: base - towerH - roofH - S * 0.1, color: '#ff4f8f' },
    { x: cx + S * 0.4, y: base - towerH - roofH - S * 0.1, color: '#7a5cff' },
    { x: cx, y: base - keepH - S * 0.16, color: '#ffcf2e' },
  ];
  return { S, cx, base, tw, towerH, roofH, keepH, poles };
}

function crenels(c, x, y, wdt, size) {
  const n = Math.max(3, Math.round(wdt / (size * 1.6)));
  const step = wdt / n;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) c.fillRect(x + i * step, y - size, step + 0.5, size + 0.5);
  }
}

function lollipopTree(c, x, y, s) {
  c.fillStyle = '#8a5a34';
  c.fillRect(x - 3 * s, y - 22 * s, 6 * s, 22 * s);
  c.fillStyle = '#3fae3f';
  c.beginPath(); c.arc(x, y - 32 * s, 16 * s, 0, TAU); c.fill();
  c.fillStyle = '#62cc55';
  c.beginPath(); c.arc(x - 4 * s, y - 36 * s, 10 * s, 0, TAU); c.fill();
}

function paintKnights(c, w, h) {
  const R = rng(5);
  const u = Math.min(w, h) / 400;
  const L = castleLayout(w, h);
  c.fillStyle = vgrad(c, 0, h * 0.7, [[0, '#5cb6ff'], [0.6, '#a9e1ff'], [1, '#e9f9ff']]);
  c.fillRect(0, 0, w, h);

  // soft rainbow behind the castle
  const rr = Math.max(w, h * 0.7) * 0.55;
  const bands = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'];
  c.globalAlpha = 0.32;
  c.lineWidth = 12 * u;
  bands.forEach((col, i) => {
    c.strokeStyle = col;
    c.beginPath(); c.arc(w * 0.5, h * 0.66, rr - i * 12 * u, Math.PI, 0); c.stroke();
  });
  c.globalAlpha = 1;

  // hills
  c.fillStyle = '#a8e07f';
  c.beginPath(); c.ellipse(w * 0.15, h * 0.68, w * 0.5, h * 0.12, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(w * 0.9, h * 0.67, w * 0.45, h * 0.11, 0, 0, TAU); c.fill();
  c.fillStyle = '#80d05c';
  c.beginPath(); c.ellipse(w * 0.5, h * 0.72, w * 0.75, h * 0.1, 0, 0, TAU); c.fill();

  // castle
  const { S, cx, base, tw, towerH, roofH, keepH } = L;
  const stone = '#d4cff0';
  const shade = '#b2abdb';
  const line = '#8077b8';
  const crn = S * 0.045;
  // keep
  c.fillStyle = shade;
  c.fillRect(cx - S * 0.15, base - keepH, S * 0.3, keepH);
  c.fillStyle = stone;
  c.fillRect(cx - S * 0.15, base - keepH, S * 0.22, keepH);
  c.fillStyle = shade;
  crenels(c, cx - S * 0.15, base - keepH, S * 0.3, crn);
  // main wall
  c.fillStyle = stone;
  c.fillRect(cx - S * 0.38, base - S * 0.3, S * 0.76, S * 0.3);
  crenels(c, cx - S * 0.38, base - S * 0.3, S * 0.76, crn);
  // towers + pointy roofs
  for (const [dx, roof, roofShade] of [[-0.4, '#ff5f8f', '#e03a72'], [0.4, '#8a6bff', '#6a4ee0']]) {
    const tx = cx + S * dx;
    c.fillStyle = stone;
    c.fillRect(tx - tw / 2, base - towerH, tw, towerH);
    c.fillStyle = shade;
    c.fillRect(tx + tw * 0.15, base - towerH, tw * 0.35, towerH);
    c.fillStyle = roof;
    c.beginPath(); c.moveTo(tx - tw * 0.65, base - towerH); c.lineTo(tx, base - towerH - roofH); c.lineTo(tx + tw * 0.65, base - towerH); c.closePath(); c.fill();
    c.fillStyle = roofShade;
    c.beginPath(); c.moveTo(tx, base - towerH - roofH); c.lineTo(tx + tw * 0.65, base - towerH); c.lineTo(tx + tw * 0.15, base - towerH); c.closePath(); c.fill();
    // window
    c.fillStyle = '#ffe27a';
    c.beginPath(); c.arc(tx, base - towerH * 0.6, tw * 0.16, Math.PI, 0); c.rect(tx - tw * 0.16, base - towerH * 0.6, tw * 0.32, tw * 0.3); c.fill();
  }
  // stone texture
  c.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = 0; i < 26; i++) {
    const bx = cx - S * 0.4 + R() * S * 0.8;
    const by = base - R() * S * 0.5;
    c.fillRect(bx, by, S * 0.05, S * 0.022);
  }
  // keep windows
  c.fillStyle = '#5a4e9a';
  for (const dy of [0.42, 0.62]) {
    c.beginPath(); c.arc(cx, base - keepH * dy - 6 * u, S * 0.03, Math.PI, 0); c.rect(cx - S * 0.03, base - keepH * dy - 6 * u, S * 0.06, S * 0.05); c.fill();
  }
  // banners on the wall
  for (const [dx, col, emblem] of [[-0.24, '#4dabf7', 'star'], [0.24, '#ff6b6b', 'heart']]) {
    const bx = cx + S * dx;
    const by = base - S * 0.26;
    const bw = S * 0.08;
    const bh = S * 0.15;
    c.fillStyle = col;
    c.beginPath(); c.moveTo(bx - bw / 2, by); c.lineTo(bx + bw / 2, by); c.lineTo(bx + bw / 2, by + bh); c.lineTo(bx, by + bh * 0.8); c.lineTo(bx - bw / 2, by + bh); c.closePath(); c.fill();
    c.fillStyle = '#ffe066';
    if (emblem === 'star') { starPath(c, bx, by + bh * 0.4, bw * 0.3, bw * 0.13); c.fill(); }
    else { c.beginPath(); c.arc(bx - bw * 0.12, by + bh * 0.36, bw * 0.15, 0, TAU); c.arc(bx + bw * 0.12, by + bh * 0.36, bw * 0.15, 0, TAU); c.fill(); c.beginPath(); c.moveTo(bx - bw * 0.26, by + bh * 0.4); c.lineTo(bx, by + bh * 0.62); c.lineTo(bx + bw * 0.26, by + bh * 0.4); c.fill(); }
  }
  // gate
  const gw = S * 0.16;
  const gh = S * 0.2;
  c.fillStyle = '#8a5a3c';
  c.beginPath(); c.moveTo(cx - gw / 2, base); c.lineTo(cx - gw / 2, base - gh + gw / 2); c.arc(cx, base - gh + gw / 2, gw / 2, Math.PI, 0); c.lineTo(cx + gw / 2, base); c.closePath(); c.fill();
  c.strokeStyle = '#5e3a22';
  c.lineWidth = 2 * u;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(cx - gw / 2 + (gw * i) / 4, base); c.lineTo(cx - gw / 2 + (gw * i) / 4, base - gh + 4 * u); c.stroke(); }
  // outlines
  c.strokeStyle = line;
  c.lineWidth = 2 * u;
  c.strokeRect(cx - S * 0.38, base - S * 0.3, S * 0.76, S * 0.3);
  // flag poles
  c.strokeStyle = '#6e5a4a';
  c.lineWidth = 3 * u;
  for (const p of L.poles) {
    const bottom = p.x === cx ? base - keepH - crn : base - towerH - roofH + 2;
    c.beginPath(); c.moveTo(p.x, bottom); c.lineTo(p.x, p.y); c.stroke();
  }

  // front hills, path and trees
  c.fillStyle = '#5ec247';
  c.beginPath(); c.ellipse(w * 0.2, h * 1.02, w * 0.75, h * 0.3, 0, 0, TAU); c.fill();
  c.fillStyle = '#4caf3c';
  c.beginPath(); c.ellipse(w * 0.95, h * 1.05, w * 0.6, h * 0.3, 0, 0, TAU); c.fill();
  c.fillStyle = '#f3dca0';
  c.beginPath();
  c.moveTo(cx - gw * 0.45, base);
  c.quadraticCurveTo(cx - S * 0.3, h * 0.82, cx - w * 0.05, h);
  c.lineTo(cx + w * 0.18, h);
  c.quadraticCurveTo(cx + S * 0.05, h * 0.8, cx + gw * 0.45, base);
  c.closePath(); c.fill();
  lollipopTree(c, w * 0.1, h * 0.74, 1.3 * u);
  lollipopTree(c, w * 0.88, h * 0.76, 1.5 * u);
  lollipopTree(c, w * 0.8, h * 0.9, 2 * u);
  // flowers
  const fl = ['#ff6b9a', '#ffe066', '#ffffff', '#9775fa'];
  for (let i = 0; i < 40; i++) {
    const x = R() * w;
    const y = h * 0.8 + R() * h * 0.2;
    if (Math.abs(x - (cx + w * 0.05)) < w * 0.12) continue;
    c.fillStyle = fl[i % fl.length];
    c.beginPath(); c.arc(x, y, (2.5 + R() * 2) * u, 0, TAU); c.fill();
  }
}

function knightsAnimator() {
  const clouds = makeClouds(3, 0.08, 0.3);
  return {
    draw(ctx, w, h, t, dt) {
      clouds.draw(ctx, w, h, t, dt);
      const { S, poles } = castleLayout(w, h);
      const fl = S * 0.16;
      const fh = S * 0.09;
      for (const p of poles) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const y = p.y + Math.sin(t * 6 - k * 4) * fh * 0.25 * k;
          i === 0 ? ctx.moveTo(p.x, y) : ctx.lineTo(p.x + fl * k, y + fh * 0.5 * k * 0.2);
        }
        for (let i = n; i >= 0; i--) {
          const k = i / n;
          const y = p.y + fh + Math.sin(t * 6 - k * 4) * fh * 0.25 * k - fh * k * 0.35;
          ctx.lineTo(p.x + fl * k, y);
        }
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Outer Space
// ---------------------------------------------------------------------------
function paintSpace(c, w, h) {
  const R = rng(9);
  const u = Math.min(w, h) / 400;
  c.fillStyle = vgrad(c, 0, h, [[0, '#130a38'], [0.5, '#28156a'], [1, '#55208a']]);
  c.fillRect(0, 0, w, h);
  // nebula clouds
  for (const [fx, fy, r, col] of [[0.2, 0.3, 0.5, '255, 90, 200'], [0.8, 0.6, 0.55, '70, 200, 255'], [0.4, 0.85, 0.45, '170, 90, 255']]) {
    const x = w * fx;
    const y = h * fy;
    const rad = Math.max(w, h) * r;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${col}, 0.28)`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  // stars
  for (let i = 0; i < 160; i++) {
    c.globalAlpha = 0.4 + R() * 0.6;
    c.fillStyle = R() < 0.2 ? '#ffe9a8' : '#ffffff';
    c.beginPath(); c.arc(R() * w, R() * h, (0.6 + R() * 1.6) * u, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;

  // ringed planet
  const px = w * 0.76;
  const py = h * 0.24;
  const pr = 52 * u;
  const ring = (front) => {
    c.save();
    c.translate(px, py);
    c.rotate(-0.35);
    c.strokeStyle = '#ffe7a8';
    c.lineWidth = 8 * u;
    c.beginPath(); c.ellipse(0, 0, pr * 1.85, pr * 0.48, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); c.stroke();
    c.strokeStyle = 'rgba(255, 170, 110, 0.8)';
    c.lineWidth = 3 * u;
    c.beginPath(); c.ellipse(0, 0, pr * 2.1, pr * 0.58, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); c.stroke();
    c.restore();
  };
  ring(false);
  const pg = c.createRadialGradient(px - pr * 0.35, py - pr * 0.35, 0, px, py, pr);
  pg.addColorStop(0, '#ffe0a0');
  pg.addColorStop(0.5, '#ff9a6a');
  pg.addColorStop(1, '#d9456a');
  c.fillStyle = pg;
  c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
  c.save();
  c.beginPath(); c.arc(px, py, pr, 0, TAU); c.clip();
  c.fillStyle = 'rgba(255, 255, 255, 0.18)';
  for (let k = -2; k <= 2; k++) c.fillRect(px - pr, py + k * pr * 0.32, pr * 2, pr * 0.1);
  c.restore();
  ring(true);

  // little teal planet
  const qx = w * 0.16;
  const qy = h * 0.42;
  const qr = 24 * u;
  const qg = c.createRadialGradient(qx - qr * 0.3, qy - qr * 0.3, 0, qx, qy, qr);
  qg.addColorStop(0, '#b5fff4');
  qg.addColorStop(1, '#1fb5b0');
  c.fillStyle = qg;
  c.beginPath(); c.arc(qx, qy, qr, 0, TAU); c.fill();
  c.fillStyle = 'rgba(0, 90, 100, 0.3)';
  c.beginPath(); c.arc(qx + qr * 0.3, qy + qr * 0.2, qr * 0.25, 0, TAU); c.fill();

  // moon surface along the bottom
  const mr = Math.max(w, h) * 0.75;
  const mx = w * 0.4;
  const my = h + mr - Math.max(80, h * 0.15);
  const mg = c.createRadialGradient(mx, my - mr, 0, mx, my, mr);
  mg.addColorStop(0, '#e6e0ff');
  mg.addColorStop(1, '#a79ce0');
  c.fillStyle = mg;
  c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
  const surface = (x) => my - Math.sqrt(Math.max(0, mr * mr - (x - mx) * (x - mx)));
  for (let i = 0; i < 9; i++) {
    const x = R() * w;
    const y = surface(x) + (16 + R() * 60) * u;
    const r = (8 + R() * 16) * u;
    c.fillStyle = 'rgba(120, 105, 190, 0.45)';
    c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.beginPath(); c.ellipse(x, y + r * 0.12, r * 0.8, r * 0.3, 0, 0, Math.PI); c.fill();
  }
  // flag on the moon
  const fx = w * 0.78;
  const fy = surface(fx) + 6 * u;
  c.strokeStyle = '#ffffff';
  c.lineWidth = 3 * u;
  c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 56 * u); c.stroke();
  c.fillStyle = '#ff5fa8';
  c.fillRect(fx, fy - 56 * u, 34 * u, 22 * u);
  c.fillStyle = '#ffe066';
  starPath(c, fx + 17 * u, fy - 45 * u, 8 * u, 3.5 * u);
  c.fill();
}

function spaceAnimator() {
  const tw = makeTwinkles(30, 0.8);
  const S = sharedSprites();
  let shoot = null;
  let shootWait = 2;
  let rocket = null;
  let rocketWait = 3;
  const rocketSprite = sprite(100, 44, (c) => {
    c.fillStyle = '#ff5f6d';
    c.beginPath(); c.moveTo(22, 8); c.lineTo(36, 18); c.lineTo(36, 26); c.lineTo(22, 36); c.closePath(); c.fill();
    c.fillStyle = vgrad(c, 8, 36, [[0, '#ffffff'], [1, '#c9c6ee']]);
    c.beginPath(); c.moveTo(24, 12); c.lineTo(70, 12); c.quadraticCurveTo(96, 22, 70, 32); c.lineTo(24, 32); c.closePath(); c.fill();
    c.fillStyle = '#ff5f6d';
    c.beginPath(); c.moveTo(74, 12.6); c.quadraticCurveTo(96, 22, 74, 31.4); c.closePath(); c.fill();
    c.fillStyle = '#4dc3ff';
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(56, 22, 6.5, 0, TAU); c.fill(); c.stroke();
  });
  return {
    draw(ctx, w, h, t, dt) {
      tw.draw(ctx, w, h, t, dt);
      const u = Math.min(w, h) / 400;
      // shooting star
      if (!shoot) {
        shootWait -= dt;
        if (shootWait <= 0) shoot = { x: rand(0.2, 1) * w, y: rand(0, 0.35) * h, life: 0.9 };
      } else {
        shoot.life -= dt;
        shoot.x -= 520 * u * dt;
        shoot.y += 260 * u * dt;
        const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x + 90 * u, shoot.y - 45 * u);
        g.addColorStop(0, `rgba(255,255,255,${Math.min(1, shoot.life * 2)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 3 * u;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x + 90 * u, shoot.y - 45 * u); ctx.stroke();
        ctx.drawImage(S.sparkle.img, shoot.x - 10 * u, shoot.y - 10 * u, 20 * u, 20 * u);
        if (shoot.life <= 0) { shoot = null; shootWait = rand(2.5, 6); }
      }
      // rocket cruising by
      if (!rocket) {
        rocketWait -= dt;
        if (rocketWait <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          rocket = { dir, x: dir > 0 ? -80 : w + 80, y: rand(0.4, 0.68) * h, ph: rand(0, TAU) };
        }
      } else {
        rocket.x += rocket.dir * 70 * u * dt;
        const y = rocket.y + Math.sin(t * 1.5 + rocket.ph) * 10 * u;
        const s = 0.9 * u;
        ctx.save();
        ctx.translate(rocket.x, y);
        ctx.scale(rocket.dir * s, s);
        const flick = 0.7 + Math.random() * 0.5;
        ctx.fillStyle = '#ffb02e';
        ctx.beginPath(); ctx.moveTo(-26, -6); ctx.lineTo(-26 - 26 * flick, 0); ctx.lineTo(-26, 6); ctx.fill();
        ctx.fillStyle = '#fff3a0';
        ctx.beginPath(); ctx.moveTo(-26, -3); ctx.lineTo(-26 - 14 * flick, 0); ctx.lineTo(-26, 3); ctx.fill();
        ctx.drawImage(rocketSprite.img, -50 + 22, -22, 100, 44);
        ctx.restore();
        if (rocket.x < -120 || rocket.x > w + 120) { rocket = null; rocketWait = rand(6, 12); }
      }
    },
  };
}

// ---------------------------------------------------------------------------
const PAINT = { party: paintParty, underwater: paintUnderwater, west: paintWest, knights: paintKnights, space: paintSpace };
const ANIM = { party: partyAnimator, underwater: underwaterAnimator, west: westAnimator, knights: knightsAnimator, space: spaceAnimator };

export function paintScene(ctx, w, h, id, palette = 0) {
  (PAINT[id] || paintParty)(ctx, w, h, palette);
}

export function createAnimator(id) {
  return (ANIM[id] || partyAnimator)();
}
