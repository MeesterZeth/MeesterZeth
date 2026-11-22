// Getekende spelfiguren. Elke functie tekent rond (0,0) met s = grootte van een vakje.
const OUT = '#3d2f25';

export function shade(hex, amt) {
  // amt > 0 lichter, < 0 donkerder
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt > 0 ? 255 : 0, p = Math.abs(amt);
  r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
  return `rgb(${r},${g},${b})`;
}

export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, sh) => (p >> sh) & 255;
  const m = sh => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

function outlined(ctx, fill, lw) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

function rect(ctx, x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); }

function crenels(ctx, x, y, w, n, h, fill, lw) {
  const step = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) {
    rect(ctx, x + i * step * 2, y - h, step, h);
    outlined(ctx, fill, lw);
  }
}

function flag(ctx, x, y, h, color, lw, s) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h);
  ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + s * 0.16, y - h - s * 0.05, x + s * 0.32, y - h + s * 0.04);
  ctx.lineTo(x + s * 0.3, y - h + s * 0.2);
  ctx.quadraticCurveTo(x + s * 0.15, y - h + s * 0.13, x, y - h + s * 0.17);
  ctx.closePath();
  outlined(ctx, color, lw * 0.8);
}

export function castle(ctx, s, color) {
  const lw = s * 0.045, stone = '#f1e7d0', dark = '#d2c3a2';
  ctx.lineJoin = 'round';
  // muur
  rect(ctx, -s * 0.4, -s * 0.12, s * 0.8, s * 0.5); outlined(ctx, stone, lw);
  crenels(ctx, -s * 0.4, -s * 0.12, s * 0.8, 4, s * 0.09, stone, lw);
  // torens
  for (const x of [-s * 0.56, s * 0.3]) {
    rect(ctx, x, -s * 0.38, s * 0.26, s * 0.76); outlined(ctx, dark, lw);
    crenels(ctx, x, -s * 0.38, s * 0.26, 2, s * 0.1, dark, lw);
    rect(ctx, x + s * 0.1, -s * 0.2, s * 0.06, s * 0.12); ctx.fillStyle = OUT; ctx.fill();
  }
  // poort
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, s * 0.38); ctx.lineTo(-s * 0.12, s * 0.14);
  ctx.arc(0, s * 0.14, s * 0.12, Math.PI, 0); ctx.lineTo(s * 0.12, s * 0.38); ctx.closePath();
  outlined(ctx, '#6b4a2e', lw);
  flag(ctx, 0, -s * 0.2, s * 0.5, color, lw, s);
}

function house(ctx, x, y, w, roof, lw) {
  const h = w * 0.7;
  rect(ctx, x - w / 2, y - h, w, h); outlined(ctx, '#f7ecd2', lw);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, y - h); ctx.lineTo(x, y - h - w * 0.55); ctx.lineTo(x + w * 0.62, y - h); ctx.closePath();
  outlined(ctx, roof, lw);
  rect(ctx, x - w * 0.12, y - h * 0.55, w * 0.24, h * 0.55); ctx.fillStyle = '#7a4f2c'; ctx.fill();
}

export function village(ctx, s) {
  const lw = s * 0.04;
  ctx.lineJoin = 'round';
  house(ctx, -s * 0.2, s * 0.12, s * 0.42, '#c8553d', lw);
  house(ctx, s * 0.24, s * 0.3, s * 0.36, '#d9783f', lw);
}

export function farm(ctx, s) {
  const lw = s * 0.04;
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.16, s * 0.5, s * 0.26, -0.15, 0, Math.PI * 2);
  outlined(ctx, '#f0c64a', lw);
  ctx.clip();
  ctx.strokeStyle = '#c99a24'; ctx.lineWidth = s * 0.05;
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath(); ctx.moveTo(i * s * 0.12 - s * 0.3, s * 0.5); ctx.lineTo(i * s * 0.12 + s * 0.2, -s * 0.2); ctx.stroke();
  }
  ctx.restore();
  house(ctx, s * 0.3, -s * 0.02, s * 0.3, '#a8382a', lw);
}

export function tower(ctx, s, color) {
  const lw = s * 0.045, stone = '#d9ccb0';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, s * 0.38); ctx.lineTo(-s * 0.16, -s * 0.36); ctx.lineTo(s * 0.16, -s * 0.36); ctx.lineTo(s * 0.2, s * 0.38); ctx.closePath();
  outlined(ctx, stone, lw);
  rect(ctx, -s * 0.24, -s * 0.46, s * 0.48, s * 0.12); outlined(ctx, stone, lw);
  crenels(ctx, -s * 0.24, -s * 0.46, s * 0.48, 3, s * 0.08, stone, lw);
  rect(ctx, -s * 0.04, -s * 0.2, s * 0.08, s * 0.16); ctx.fillStyle = OUT; ctx.fill();
  flag(ctx, 0, -s * 0.54, s * 0.3, color, lw, s * 0.8);
}

export function tree(ctx, x, y, h) {
  ctx.lineJoin = 'round';
  rect(ctx, x - h * 0.07, y - h * 0.2, h * 0.14, h * 0.22); ctx.fillStyle = '#6b4526'; ctx.fill();
  const layers = [[0.95, 0.5], [0.72, 0.42], [0.5, 0.34]];
  for (const [top, w] of layers) {
    ctx.beginPath();
    ctx.moveTo(x - h * w, y - h * (top - 0.55));
    ctx.lineTo(x, y - h * top - h * 0.12);
    ctx.lineTo(x + h * w, y - h * (top - 0.55));
    ctx.closePath();
    ctx.fillStyle = '#2f7a3c'; ctx.fill();
    ctx.lineWidth = h * 0.06; ctx.strokeStyle = '#1d5229'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - h * top - h * 0.1); ctx.lineTo(x - h * w * 0.9, y - h * (top - 0.52)); ctx.lineTo(x - h * w * 0.2, y - h * (top - 0.52));
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
  }
}

export function mountain(ctx, s) {
  ctx.lineJoin = 'round';
  const peak = (x, base, w, h, c1, c2) => {
    ctx.beginPath(); ctx.moveTo(x - w, base); ctx.lineTo(x, base - h); ctx.lineTo(x + w, base); ctx.closePath();
    ctx.fillStyle = c1; ctx.fill(); ctx.lineWidth = s * 0.04; ctx.strokeStyle = '#4e4843'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + w, base); ctx.lineTo(x + w * 0.1, base); ctx.closePath();
    ctx.fillStyle = c2; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - w * 0.3, base - h * 0.7); ctx.lineTo(x, base - h); ctx.lineTo(x + w * 0.3, base - h * 0.7);
    ctx.lineTo(x + w * 0.1, base - h * 0.62); ctx.lineTo(x - w * 0.05, base - h * 0.74); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
  };
  peak(s * 0.25, s * 0.38, s * 0.38, s * 0.62, '#a59d94', '#857e77');
  peak(-s * 0.12, s * 0.42, s * 0.48, s * 0.9, '#b3aba2', '#8f8880');
}

function glyph(ctx, type, r) {
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (type === 'scout') {
    ctx.lineWidth = r * 0.13;
    ctx.beginPath(); ctx.arc(-r * 0.25, 0, r * 0.58, -1.15, 1.15); ctx.stroke();
    ctx.lineWidth = r * 0.06;
    ctx.beginPath(); ctx.moveTo(-r * 0.25 + r * 0.58 * Math.cos(1.15), -r * 0.58 * Math.sin(1.15));
    ctx.lineTo(-r * 0.25 + r * 0.58 * Math.cos(1.15), r * 0.58 * Math.sin(1.15)); ctx.stroke();
    ctx.lineWidth = r * 0.1;
    ctx.beginPath(); ctx.moveTo(-r * 0.45, 0); ctx.lineTo(r * 0.5, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.68, 0); ctx.lineTo(r * 0.38, -r * 0.18); ctx.lineTo(r * 0.38, r * 0.18); ctx.closePath(); ctx.fill();
  } else if (type === 'soldier') {
    ctx.save(); ctx.rotate(Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.75); ctx.lineTo(r * 0.11, -r * 0.55); ctx.lineTo(r * 0.11, r * 0.2); ctx.lineTo(-r * 0.11, r * 0.2); ctx.lineTo(-r * 0.11, -r * 0.55); ctx.closePath(); ctx.fill();
    rect(ctx, -r * 0.36, r * 0.2, r * 0.72, r * 0.13); ctx.fill();
    rect(ctx, -r * 0.06, r * 0.33, r * 0.12, r * 0.28); ctx.fill();
    ctx.beginPath(); ctx.arc(0, r * 0.66, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (type === 'knight') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, r * 0.5); ctx.lineTo(-r * 0.42, -r * 0.05);
    ctx.arc(0, -r * 0.05, r * 0.42, Math.PI, 0); ctx.lineTo(r * 0.42, r * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rect(ctx, -r * 0.3, r * 0.02, r * 0.6, r * 0.1); ctx.fill();
    rect(ctx, -r * 0.04, r * 0.12, r * 0.08, r * 0.28); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -r * 0.45); ctx.quadraticCurveTo(r * 0.2, -r * 0.95, r * 0.65, -r * 0.7);
    ctx.quadraticCurveTo(r * 0.3, -r * 0.6, r * 0.12, -r * 0.4); ctx.closePath(); ctx.fill();
  } else if (type === 'catapult') {
    ctx.lineWidth = r * 0.13;
    ctx.beginPath(); ctx.moveTo(-r * 0.55, r * 0.3); ctx.lineTo(r * 0.55, r * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.3); ctx.lineTo(r * 0.12, -r * 0.1); ctx.lineTo(r * 0.34, r * 0.3); ctx.stroke();
    ctx.lineWidth = r * 0.11;
    ctx.beginPath(); ctx.moveTo(r * 0.45, r * 0.12); ctx.lineTo(-r * 0.42, -r * 0.42); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r * 0.5, -r * 0.5, r * 0.15, 0, Math.PI * 2); ctx.fill();
    for (const x of [-r * 0.38, r * 0.38]) {
      ctx.beginPath(); ctx.arc(x, r * 0.42, r * 0.17, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function unit(ctx, s, type, color, str) {
  const r = s * 0.44;
  ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, shade(color, 0.35)); g.addColorStop(1, shade(color, -0.15));
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = s * 0.07; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.lineWidth = s * 0.03; ctx.strokeStyle = shade(color, -0.5);
  ctx.beginPath(); ctx.arc(0, 0, r + s * 0.05, 0, Math.PI * 2); ctx.stroke();
  glyph(ctx, type, r * 0.85);
  // krachtpuntjes
  const pw = str * s * 0.13 + s * 0.08;
  ctx.beginPath(); ctx.roundRect(-pw / 2, r * 0.78, pw, s * 0.17, s * 0.085);
  ctx.fillStyle = '#1b2433'; ctx.fill();
  ctx.fillStyle = '#ffd23f';
  for (let i = 0; i < str; i++) {
    ctx.beginPath(); ctx.arc(-pw / 2 + s * 0.105 + i * s * 0.13, r * 0.78 + s * 0.085, s * 0.04, 0, Math.PI * 2); ctx.fill();
  }
}

// Kleine plaatjes voor knoppen (als data-URL).
const iconCache = new Map();
export function iconURL(kind, type, color = '#2f7de1', px = 64) {
  const k = [kind, type, color, px].join('|');
  if (iconCache.has(k)) return iconCache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.translate(px / 2, px / 2);
  const s = px * 0.62;
  if (kind === 'unit') { ctx.translate(0, -px * 0.06); unit(ctx, s, type, color, STR[type]); }
  else if (type === 'farm') farm(ctx, s);
  else if (type === 'tower') { ctx.translate(0, px * 0.05); tower(ctx, s, color); }
  else if (type === 'village') village(ctx, s);
  else if (type === 'capital') { ctx.translate(0, px * 0.05); castle(ctx, s, color); }
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}
const STR = { scout: 1, soldier: 2, knight: 3, catapult: 4 };
