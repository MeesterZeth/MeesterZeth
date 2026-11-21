// Tekent het speelveld op een <canvas>.
import { toPixel, fromPixel, key, DIRS } from './hex.js';
import { UNITS, BUILDINGS } from './game.js';

const TERRAIN = {
  grass: '#9fcf6f',
  forest: '#5d9a4c',
  mountain: '#a39a8f',
};
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

function shade(hex, amt) {
  // amt > 0 lichter, < 0 donkerder
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt > 0 ? 255 : 0, p = Math.abs(amt);
  r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
  return `rgb(${r},${g},${b})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 20;
    this.ox = 0;
    this.oy = 0;
  }

  fit(state) {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const t of state.tiles.values()) {
      const p = toPixel(t.q, t.r, 1);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const bw = maxX - minX + Math.sqrt(3), bh = maxY - minY + 2;
    const pad = 8;
    this.size = Math.min((this.w - pad * 2) / bw, (this.h - pad * 2) / bh);
    this.ox = (this.w - bw * this.size) / 2 - (minX - Math.sqrt(3) / 2) * this.size;
    this.oy = (this.h - bh * this.size) / 2 - (minY - 1) * this.size;
  }

  center(t) {
    const p = toPixel(t.q, t.r, this.size);
    return { x: p.x + this.ox, y: p.y + this.oy };
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const h = fromPixel(clientX - rect.left - this.ox, clientY - rect.top - this.oy, this.size);
    return key(h.q, h.r);
  }

  hexPath(cx, cy, s) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  emoji(ch, x, y, px, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.font = `${px}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y + px * 0.05);
    ctx.globalAlpha = 1;
  }

  draw(state, ui = {}) {
    const ctx = this.ctx, s = this.size;
    ctx.clearRect(0, 0, this.w, this.h);
    const colorOf = pid => state.players[pid].color;

    // Vakjes
    for (const t of state.tiles.values()) {
      if (t.terrain === 'water') continue;
      const { x, y } = this.center(t);
      this.hexPath(x, y, s * 0.97);
      let fill = TERRAIN[t.terrain];
      if (t.owner >= 0) fill = shade(colorOf(t.owner), t.terrain === 'forest' ? 0.15 : 0.45);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (t.terrain === 'forest') this.emoji('🌲', x + s * 0.42, y - s * 0.38, s * 0.42, 0.9);
      if (t.terrain === 'mountain') this.emoji('⛰️', x, y, s * 0.9);
    }

    // Grenzen tussen rijken
    ctx.lineCap = 'round';
    for (const t of state.tiles.values()) {
      if (t.owner < 0) continue;
      const { x, y } = this.center(t);
      for (let i = 0; i < 6; i++) {
        const n = state.tiles.get(key(t.q + DIRS[i][0], t.r + DIRS[i][1]));
        if (n && n.owner === t.owner) continue;
        const a1 = Math.PI / 180 * (60 * i - 30), a2 = Math.PI / 180 * (60 * (i + 1) - 30);
        const r = s * 0.9;
        ctx.beginPath();
        ctx.moveTo(x + r * Math.cos(a1), y + r * Math.sin(a1));
        ctx.lineTo(x + r * Math.cos(a2), y + r * Math.sin(a2));
        ctx.strokeStyle = shade(colorOf(t.owner), -0.25);
        ctx.lineWidth = Math.max(2, s * 0.13);
        ctx.stroke();
      }
    }

    // Markeringen
    if (ui.moves) {
      for (const k of ui.moves) {
        const { x, y } = this.center(state.tiles.get(k));
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(x, y, s * 0.18, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (ui.attacks) {
      for (const k of ui.attacks) {
        const { x, y } = this.center(state.tiles.get(k));
        this.hexPath(x, y, s * 0.8);
        ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = Math.max(2, s * 0.12); ctx.stroke();
      }
    }
    if (ui.selected) {
      const { x, y } = this.center(state.tiles.get(ui.selected));
      this.hexPath(x, y, s * 0.86);
      ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = Math.max(2.5, s * 0.14); ctx.stroke();
    }

    // Gebouwen en eenheden
    for (const t of state.tiles.values()) {
      if (!t.building && !t.unit) continue;
      const { x, y } = this.center(t);
      if (t.building) {
        if (t.unit) this.emoji(BUILDINGS[t.building].icon, x - s * 0.45, y - s * 0.42, s * 0.45);
        else this.emoji(BUILDINGS[t.building].icon, x, y, s * 0.85);
      }
      if (t.unit) {
        const tired = t.owner === 0 && state.current === 0 && t.unit.mp <= 0;
        ctx.globalAlpha = tired ? 0.6 : 1;
        ctx.beginPath(); ctx.arc(x, y + s * 0.05, s * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = colorOf(t.owner); ctx.fill();
        ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.globalAlpha = 1;
        this.emoji(UNITS[t.unit.type].icon, x, y + s * 0.05, s * 0.55, tired ? 0.6 : 1);
        if (t.owner === 0 && state.current === 0 && t.unit.mp > 0) {
          ctx.beginPath(); ctx.arc(x + s * 0.4, y - s * 0.32, s * 0.13, 0, Math.PI * 2);
          ctx.fillStyle = '#34c759'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }

    // Korte flits na een verovering
    if (ui.flash) {
      const t = state.tiles.get(ui.flash);
      if (t) {
        const { x, y } = this.center(t);
        this.hexPath(x, y, s);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      }
    }
  }
}
