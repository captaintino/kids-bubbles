// Pre-renders glossy bubble sprites to offscreen canvases once, so each frame
// is just a cheap drawImage per bubble (important on phones).
export const SPRITE_SIZE = 256;
export const SPRITE_R = 100; // bubble radius inside the sprite (the rest is glow)

const C = SPRITE_SIZE / 2;
const hasConic = typeof CanvasRenderingContext2D !== 'undefined' &&
  'createConicGradient' in CanvasRenderingContext2D.prototype;

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE_SIZE;
  return c;
}

function rainbowFill(ctx, alpha) {
  if (hasConic) {
    const g = ctx.createConicGradient(-Math.PI / 2, C, C);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsla(${i * 60}, 100%, 62%, ${alpha})`);
    return g;
  }
  const g = ctx.createLinearGradient(C - SPRITE_R, C - SPRITE_R, C + SPRITE_R, C + SPRITE_R);
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsla(${i * 60}, 100%, 62%, ${alpha})`);
  return g;
}

function drawBody(ctx, hue, rainbow) {
  const R = SPRITE_R;

  // outer glow
  const glow = ctx.createRadialGradient(C, C, R * 0.85, C, C, C);
  glow.addColorStop(0, rainbow ? 'hsla(300, 100%, 85%, 0.55)' : `hsla(${hue}, 100%, 75%, 0.5)`);
  glow.addColorStop(1, `hsla(${hue}, 100%, 75%, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(C, C, C, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(C, C, R, 0, Math.PI * 2);
  ctx.clip();

  if (rainbow) {
    ctx.fillStyle = rainbowFill(ctx, 0.85);
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    const w = ctx.createRadialGradient(C - R * 0.15, C - R * 0.2, 0, C, C, R);
    w.addColorStop(0, 'rgba(255,255,255,0.75)');
    w.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    w.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = w;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  } else {
    // candy-glass body: lighter in the middle, rich color toward the rim
    const body = ctx.createRadialGradient(C - R * 0.18, C - R * 0.22, 0, C, C, R * 1.08);
    body.addColorStop(0, `hsla(${hue}, 100%, 94%, 0.6)`);
    body.addColorStop(0.45, `hsla(${hue}, 95%, 70%, 0.62)`);
    body.addColorStop(0.8, `hsla(${hue}, 95%, 56%, 0.88)`);
    body.addColorStop(1, `hsla(${hue}, 100%, 40%, 0.98)`);
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }

  // bounce light at the bottom for a 3D look
  const bounce = ctx.createRadialGradient(C, C + R * 0.95, 0, C, C + R * 0.95, R * 0.75);
  bounce.addColorStop(0, rainbow ? 'rgba(255,255,255,0.6)' : `hsla(${hue}, 100%, 88%, 0.75)`);
  bounce.addColorStop(1, `hsla(${hue}, 100%, 88%, 0)`);
  ctx.fillStyle = bounce;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  // iridescent soap-film ring
  ctx.globalAlpha = rainbow ? 0.25 : 0.4;
  ctx.lineWidth = R * 0.16;
  ctx.strokeStyle = rainbowFill(ctx, 0.9);
  ctx.beginPath();
  ctx.arc(C, C, R * 0.93, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // crisp rim
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(C, C, R - 1.75, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHighlights(ctx) {
  const R = SPRITE_R;
  // big soft window highlight
  ctx.save();
  ctx.translate(C - R * 0.36, C - R * 0.42);
  ctx.rotate(-0.65);
  ctx.scale(1, 0.58);
  const hl = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
  hl.addColorStop(0, 'rgba(255,255,255,0.98)');
  hl.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.lineCap = 'round';
  // curved shine along top-left edge
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = R * 0.075;
  ctx.beginPath();
  ctx.arc(C, C, R * 0.8, Math.PI * 1.08, Math.PI * 1.32);
  ctx.stroke();
  // little shine bottom-right
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = R * 0.055;
  ctx.beginPath();
  ctx.arc(C, C, R * 0.8, Math.PI * 0.12, Math.PI * 0.32);
  ctx.stroke();
  // sparkle dot
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(C - R * 0.62, C - R * 0.05, R * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

export function starPath(ctx, x, y, outer, inner, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.85);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.95, y - s * 0.95, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 0.95, x + s * 1.25, y + s * 0.05, x, y + s * 0.85);
  ctx.closePath();
}

function drawIcon(ctx, kind) {
  const R = SPRITE_R;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (kind === 'star') {
    starPath(ctx, C, C + R * 0.05, R * 0.58, R * 0.26);
    const g = ctx.createLinearGradient(C, C - R * 0.6, C, C + R * 0.6);
    g.addColorStop(0, '#fffbd0');
    g.addColorStop(0.45, '#ffe14a');
    g.addColorStop(1, '#ff9d1a');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(160, 80, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  } else if (kind === 'heart') {
    heartPath(ctx, C, C, R * 0.5);
    const g = ctx.createLinearGradient(C, C - R * 0.5, C, C + R * 0.5);
    g.addColorStop(0, '#ffc2dc');
    g.addColorStop(0.4, '#ff4f8f');
    g.addColorStop(1, '#e0004f');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(120, 0, 40, 0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  } else if (kind === 'snow') {
    ctx.translate(C, C);
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 80, 160, 0.55)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = R * 0.085;
    const L = R * 0.55;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -L);
      ctx.moveTo(0, -L * 0.55);
      ctx.lineTo(-L * 0.25, -L * 0.8);
      ctx.moveTo(0, -L * 0.55);
      ctx.lineTo(L * 0.25, -L * 0.8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Returns { bubbles: [canvas per color], star, heart, snow, rainbow } */
export function buildSprites(colors) {
  const bubbles = colors.map((c) => {
    const cv = makeCanvas();
    const ctx = cv.getContext('2d');
    drawBody(ctx, c.hue, false);
    drawHighlights(ctx);
    return cv;
  });
  const special = (kind, hue, rainbow = false) => {
    const cv = makeCanvas();
    const ctx = cv.getContext('2d');
    drawBody(ctx, hue, rainbow);
    if (kind) drawIcon(ctx, kind);
    drawHighlights(ctx);
    return cv;
  };
  return {
    bubbles,
    star: special('star', 46),
    heart: special('heart', 330),
    snow: special('snow', 196),
    rainbow: special(null, 0, true),
  };
}

/** Small sparkle sprite for particles. */
export function buildSparkle() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#fff';
  starPath(ctx, s / 2, s / 2, s * 0.48, s * 0.07, 4, 0);
  ctx.fill();
  return cv;
}
