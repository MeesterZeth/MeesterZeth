// Tekent het speelveld: zee, 3D-eilandtegels, gebouwen, eenheden en effecten.
import { toPixel, fromPixel, key, DIRS, mulberry32 } from './hex.js';
import { UNITS, defenseOf, isPassable } from './game.js';
import * as S from './sprites.js';

const COL = {
  deep: '#0b3d5e', sea: '#1a7bab', sand: '#efd79c', sandDark: '#d4b46e',
  grass: '#8fcb5c', forest: '#5fa548', mountain: '#a7b08f', earth: '#8a6440', earthDark: '#5e4129',
};
const DEPTH = 0.28; // dikte van een tegel, als deel van de tegelgrootte
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 20;
    this.ox = 0;
    this.oy = 0;
    this.dpr = 1;
    this.layer = document.createElement('canvas');
    this.dirty = true;
    this.sprites = new Map();
    this.anims = new Map(); // doelvakje -> { from:{x,y}, t0, dur }
    this.particles = [];
    this.floaters = [];
    this.waves = [];
  }

  // keepView: bij een formaatwijziging de zoom en het beeldmidden bewaren.
  fit(state, keepView = false) {
    const old = keepView && this.base ? { zoom: this.zoom, w: this.w, h: this.h, panX: this.panX, panY: this.panY } : null;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.layer.width = this.canvas.width;
    this.layer.height = this.canvas.height;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const t of state.tiles.values()) {
      if (t.terrain === 'water') continue;
      const p = toPixel(t.q, t.r, 1);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const bw = maxX - minX + Math.sqrt(3) + 0.5;
    const bh = maxY - minY + 2 + DEPTH + 0.6;
    const pad = 6;
    const size = Math.min((this.w - pad * 2) / bw, (this.h - pad * 2) / bh);
    this.base = {
      size,
      ox: this.w / 2 - ((minX + maxX) / 2) * size,
      oy: this.h / 2 - ((minY + maxY) / 2 + DEPTH / 2) * size,
    };
    this.state = state;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    if (old && old.zoom > 1) {
      this.zoom = old.zoom;
      this.panX = old.panX * (this.w / old.w);
      this.panY = old.panY * (this.h / old.h);
    }
    this.sprites.clear();
    this.applyView();
    const rng = mulberry32(7);
    this.waves = Array.from({ length: 34 }, () => ({
      x: rng() * this.w, y: rng() * this.h, len: 10 + rng() * 22, speed: 4 + rng() * 8, phase: rng() * 6,
    }));
  }

  markDirty() { this.dirty = true; }

  // Is het canvas op het scherm groter of kleiner geworden dan waarmee we rekenen?
  sizeChanged() {
    const r = this.canvas.getBoundingClientRect();
    return Math.abs(r.width - this.w) > 0.5 || Math.abs(r.height - this.h) > 0.5;
  }

  // ---------- zoomen en schuiven ----------

  applyView() {
    const z = this.zoom;
    // Niet verder schuiven dan de rand van het eiland.
    this.panX = Math.min(0, Math.max(this.w - this.w * z, this.panX));
    this.panY = Math.min(0, Math.max(this.h - this.h * z, this.panY));
    this.size = this.base.size * z;
    this.ox = this.base.ox * z + this.panX;
    this.oy = this.base.oy * z + this.panY;
    if (this.sprites.size > 120) this.sprites.clear();
    this.dirty = true;
    if (this.state) this.buildFoam(this.state);
  }

  // Zoom rond een punt op het scherm (bijv. tussen twee vingers).
  zoomAt(newZoom, sx, sy) {
    const z = Math.max(1, Math.min(2.6, newZoom));
    const wx = (sx - this.panX) / this.zoom, wy = (sy - this.panY) / this.zoom;
    this.zoom = z;
    this.panX = sx - wx * z;
    this.panY = sy - wy * z;
    this.applyView();
  }

  panBy(dx, dy) {
    if (this.zoom <= 1) return;
    this.panX += dx;
    this.panY += dy;
    this.applyView();
  }

  // Vingervriendelijk: kies het dichtstbijzijnde vakje uit een lijst, binnen 'reach' tegelgroottes.
  pickNear(clientX, clientY, keys, state, reach = 1) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    let best = null, bestD = reach * this.size;
    for (const k of keys) {
      const t = state.tiles.get(k);
      if (!t) continue;
      const c = this.center(t);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
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

  hexPath(ctx, cx, cy, s, path) {
    const p = path || ctx;
    if (!path) ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      const x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
  }

  buildFoam(state) {
    this.foam = new Path2D();
    this.shore = new Path2D();
    const d = this.size * DEPTH;
    for (const t of state.tiles.values()) {
      if (t.terrain === 'water') continue;
      const { x, y } = this.center(t);
      this.hexPath(null, x, y + d * 0.6, this.size * 1.32, this.foam);
      this.hexPath(null, x, y + d * 0.55, this.size * 1.12, this.shore);
    }
  }

  // Een figuur één keer tekenen en daarna hergebruiken.
  sprite(id, draw, box = 1.8) {
    const k = id + '|' + Math.round(this.size * 10);
    let c = this.sprites.get(k);
    if (!c) {
      const px = Math.ceil(this.size * box * this.dpr);
      c = document.createElement('canvas');
      c.width = c.height = px;
      const ctx = c.getContext('2d');
      ctx.translate(px / 2, px / 2);
      ctx.scale(this.dpr, this.dpr);
      draw(ctx, this.size);
      this.sprites.set(k, c);
    }
    return c;
  }

  blit(ctx, c, x, y, scale = 1, alpha = 1) {
    const w = c.width / this.dpr * scale;
    ctx.globalAlpha = alpha;
    ctx.drawImage(c, x - w / 2, y - w / 2, w, w);
    ctx.globalAlpha = 1;
  }

  renderLayer(state) {
    const ctx = this.layer.getContext('2d');
    const s = this.size, d = s * DEPTH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const colorOf = pid => state.players[pid].color;

    // Strand
    ctx.fillStyle = COL.sandDark;
    ctx.fill(this.shore);
    ctx.save(); ctx.translate(0, -d * 0.25); ctx.fillStyle = COL.sand; ctx.fill(this.shore); ctx.restore();

    const land = [...state.tiles.values()].filter(t => t.terrain !== 'water').sort((a, b) => a.r - b.r || a.q - b.q);
    const rows = new Map();
    for (const t of land) { if (!rows.has(t.r)) rows.set(t.r, []); rows.get(t.r).push(t); }

    const topColor = t => {
      const base = t.terrain === 'forest' ? COL.forest : t.terrain === 'mountain' ? COL.mountain : COL.grass;
      if (t.owner < 0) return [base, base];
      const c = colorOf(t.owner);
      if (t.terrain === 'grass') return [S.shade(c, 0.42), c];
      if (t.terrain === 'forest') return [S.mix(c, '#2f6a35', 0.35), c];
      return [S.mix(base, c, 0.35), c];
    };

    for (const row of rows.values()) {
      // zijkanten
      for (const t of row) {
        const { x, y } = this.center(t);
        const pts = [1, 2, 3].map(i => {
          const a = Math.PI / 180 * (60 * i - 30);
          return [x + s * Math.cos(a), y + s * Math.sin(a)];
        });
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.lineTo(pts[2][0], pts[2][1] + d); ctx.lineTo(pts[1][0], pts[1][1] + d); ctx.lineTo(pts[0][0], pts[0][1] + d);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, y + s * 0.5, 0, y + s + d);
        const earth = t.owner >= 0 ? S.mix(COL.earth, colorOf(t.owner), 0.25) : COL.earth;
        g.addColorStop(0, earth); g.addColorStop(1, COL.earthDark);
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
      }
      // bovenkant
      for (const t of row) {
        const { x, y } = this.center(t);
        const [fill] = topColor(t);
        this.hexPath(ctx, x, y, s * 0.995);
        const g = ctx.createLinearGradient(0, y - s, 0, y + s);
        g.addColorStop(0, S.shade(fill.startsWith('#') ? fill : rgbToHex(fill), 0.16));
        g.addColorStop(1, fill);
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = Math.max(1, s * 0.04); ctx.strokeStyle = 'rgba(30,40,20,0.22)'; ctx.stroke();
        if (t.terrain === 'grass' && !t.building) {
          const rng = mulberry32((t.q * 73856093) ^ (t.r * 19349663));
          ctx.strokeStyle = 'rgba(40,90,30,0.35)'; ctx.lineWidth = Math.max(1, s * 0.035); ctx.lineCap = 'round';
          for (let i = 0; i < 3; i++) {
            const gx = x + (rng() - 0.5) * s * 1.1, gy = y + (rng() - 0.5) * s * 0.9;
            ctx.beginPath(); ctx.moveTo(gx - s * 0.05, gy); ctx.lineTo(gx - s * 0.08, gy - s * 0.09);
            ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - s * 0.12);
            ctx.moveTo(gx + s * 0.05, gy); ctx.lineTo(gx + s * 0.08, gy - s * 0.09); ctx.stroke();
          }
        }
      }
    }

    // Grenzen tussen rijken
    ctx.lineCap = 'round';
    for (const t of land) {
      if (t.owner < 0) continue;
      const { x, y } = this.center(t);
      for (let i = 0; i < 6; i++) {
        const n = state.tiles.get(key(t.q + DIRS[i][0], t.r + DIRS[i][1]));
        if (n && n.owner === t.owner) continue;
        const a1 = Math.PI / 180 * (60 * i - 30), a2 = Math.PI / 180 * (60 * (i + 1) - 30);
        const r = s * 0.88;
        ctx.beginPath();
        ctx.moveTo(x + r * Math.cos(a1), y + r * Math.sin(a1));
        ctx.lineTo(x + r * Math.cos(a2), y + r * Math.sin(a2));
        ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(3, s * 0.2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = S.shade(colorOf(t.owner), -0.2); ctx.lineWidth = Math.max(2, s * 0.11); ctx.stroke();
      }
    }

    // Bomen, bergen en gebouwen (van achter naar voor)
    for (const t of land) {
      const { x, y } = this.center(t);
      if (t.terrain === 'forest') {
        const spots = t.building ? [[0.5, -0.25]] : [[-0.35, 0.05], [0.32, -0.12], [0.02, 0.42], [-0.05, -0.38]];
        const c = this.sprite('tree', (c2, sz) => S.tree(c2, 0, sz * 0.3, sz * 0.55), 1.2);
        for (const [dx, dy] of spots) this.blit(ctx, c, x + dx * s, y + dy * s, 0.85);
      }
      if (t.terrain === 'mountain') this.blit(ctx, this.sprite('mountain', S.mountain), x, y - s * 0.1);
      if (t.building) {
        const color = t.owner >= 0 ? colorOf(t.owner) : '#cfc6b5';
        const id = t.building + color;
        const draw = {
          capital: (c2, sz) => S.castle(c2, sz, color),
          village: (c2, sz) => S.village(c2, sz),
          farm: (c2, sz) => S.farm(c2, sz),
          tower: (c2, sz) => S.tower(c2, sz, color),
        }[t.building];
        const c = this.sprite(id, draw);
        if (t.unit) this.blit(ctx, c, x - s * 0.32, y - s * 0.3, 0.7);
        else this.blit(ctx, c, x, y - s * 0.12, 1);
      }
    }
    this.dirty = false;
  }

  // ---------- effecten ----------

  animateMove(fromKey, toKey, state, dur = 260) {
    const a = state.tiles.get(fromKey), b = state.tiles.get(toKey);
    if (!a || !b) return;
    this.anims.set(toKey, { from: this.center(a), t0: performance.now(), dur });
  }

  burst(t, color, n = 16) {
    const { x, y } = this.center(t);
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t0: now, life: 500 + Math.random() * 300,
        color: i % 3 === 0 ? '#ffd23f' : color, r: 1.5 + Math.random() * 2.5,
      });
    }
  }

  floatText(t, text, color = '#fff') {
    const { x, y } = this.center(t);
    this.floaters.push({ x, y: y - this.size * 0.5, text, color, t0: performance.now(), dur: 1100 });
  }

  // ---------- tekenen per beeldje ----------

  draw(state, ui = {}, now = performance.now()) {
    const ctx = this.ctx, s = this.size, t = now / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Zee
    const g = ctx.createRadialGradient(this.w / 2, this.h * 0.45, s, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    g.addColorStop(0, COL.sea); g.addColorStop(1, COL.deep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (const w of this.waves) {
      const x = (w.x + t * w.speed) % (this.w + 40) - 20, y = w.y + Math.sin(t + w.phase) * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + w.len / 2, y - 4, x + w.len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.16 + 0.07 * Math.sin(t * 1.6);
    ctx.fillStyle = '#fff'; ctx.fill(this.foam);
    ctx.globalAlpha = 1;

    if (this.dirty) this.renderLayer(state);
    ctx.drawImage(this.layer, 0, 0, this.w, this.h);

    // Markeringen
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    if (ui.moves) {
      for (const k of ui.moves) {
        const { x, y } = this.center(state.tiles.get(k));
        ctx.beginPath(); ctx.arc(x, y, s * (0.16 + 0.04 * pulse), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
      }
    }
    if (ui.attacks) {
      for (const k of ui.attacks) {
        const tile = state.tiles.get(k);
        const { x, y } = this.center(tile);
        const neutral = tile.owner < 0;
        this.hexPath(ctx, x, y, s * 0.82);
        ctx.fillStyle = neutral ? `rgba(255,214,10,${0.25 + 0.2 * pulse})` : `rgba(255,59,48,${0.25 + 0.2 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = neutral ? '#ffd60a' : '#ff3b30'; ctx.lineWidth = Math.max(2, s * 0.1); ctx.stroke();
        if (!neutral) {
          ctx.save(); ctx.translate(x, y + s * 0.55); ctx.font = `${Math.round(s * 0.36)}px "Lilita One", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
          ctx.strokeText('AANVAL', 0, 0); ctx.fillStyle = '#fff'; ctx.fillText('AANVAL', 0, 0); ctx.restore();
        }
      }
    }
    if (ui.selected) {
      const { x, y } = this.center(state.tiles.get(ui.selected));
      this.hexPath(ctx, x, y, s * 0.9);
      ctx.setLineDash([s * 0.25, s * 0.15]); ctx.lineDashOffset = -t * 30;
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(3, s * 0.13); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Vakjes die je tijdens de beurt van de tegenstander kwijtraakte
    if (ui.lost) {
      for (const k of ui.lost) {
        const tile = state.tiles.get(k);
        if (!tile) continue;
        const { x, y } = this.center(tile);
        this.hexPath(ctx, x, y, s * 0.86);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(4, s * 0.2); ctx.globalAlpha = 0.5 + 0.5 * pulse; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([s * 0.18, s * 0.12]);
        ctx.strokeStyle = '#e0241b'; ctx.lineWidth = Math.max(2.5, s * 0.11); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Verdedigingskaart: getal op elk vakje
    if (ui.defense) {
      ctx.font = `${Math.round(s * 0.36)}px "Lilita One", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const tile of state.tiles.values()) {
        if (!isPassable(tile)) continue;
        const { x, y } = this.center(tile);
        const d = defenseOf(tile);
        const sx = x - s * 0.5, sy = y + s * 0.42, r = s * 0.22;
        ctx.beginPath();
        ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy - r); ctx.lineTo(sx + r, sy); ctx.quadraticCurveTo(sx + r, sy + r * 0.8, sx, sy + r * 1.3);
        ctx.quadraticCurveTo(sx - r, sy + r * 0.8, sx - r, sy); ctx.closePath();
        ctx.fillStyle = ['#2e7d32', '#f9a825', '#ef6c00', '#c62828'][d]; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(String(d), sx, sy);
      }
    }

    // Tutorial-aanwijzing: gouden ring en stuiterende pijl
    if (ui.hint) {
      for (const k of ui.hint) {
        const tile = state.tiles.get(k);
        if (!tile) continue;
        const { x, y } = this.center(tile);
        this.hexPath(ctx, x, y, s * (0.95 + 0.05 * pulse));
        ctx.lineWidth = Math.max(3, s * 0.14); ctx.strokeStyle = `rgba(255,201,60,${0.6 + 0.4 * pulse})`; ctx.stroke();
      }
      if (ui.hint.length) {
        const { x, y } = this.center(state.tiles.get(ui.hint[0]));
        const by = y - s * 1.25 - Math.abs(Math.sin(t * 4)) * s * 0.3;
        ctx.beginPath(); ctx.moveTo(x - s * 0.28, by); ctx.lineTo(x + s * 0.28, by); ctx.lineTo(x, by + s * 0.38); ctx.closePath();
        ctx.fillStyle = '#ffc93c'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#4a3000'; ctx.stroke();
      }
    }

    // Eenheden (van achter naar voor)
    const units = [...state.tiles.values()].filter(x => x.unit).sort((a, b) => a.r - b.r);
    for (const tile of units) {
      const k = key(tile.q, tile.r);
      let { x, y } = this.center(tile);
      const an = this.anims.get(k);
      if (an) {
        const p = Math.min(1, (now - an.t0) / an.dur), e = ease(p);
        x = an.from.x + (x - an.from.x) * e;
        y = an.from.y + (y - an.from.y) * e - Math.sin(Math.PI * p) * s * 0.35;
        if (p >= 1) this.anims.delete(k);
      }
      const mine = tile.owner === 0 && state.current === 0;
      const ready = mine && tile.unit.mp > 0;
      const tired = mine && tile.unit.mp <= 0;
      if (ready && !an) y += Math.sin(t * 4 + tile.q + tile.r) * s * 0.04;
      const color = state.players[tile.owner].color;
      const u = UNITS[tile.unit.type];
      const c = this.sprite('u' + tile.unit.type + color, (c2, sz) => S.unit(c2, sz, tile.unit.type, color, u.str));
      const ox = tile.building ? s * 0.12 : 0;
      this.blit(ctx, c, x + ox, y - s * 0.05, 1.15, tired ? 0.55 : 1);
      if (ready) {
        ctx.beginPath(); ctx.arc(x + ox + s * 0.36, y - s * 0.4, s * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = '#34d158'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      }
    }

    // Deeltjes
    this.particles = this.particles.filter(p => now - p.t0 < p.life);
    for (const p of this.particles) {
      const dt = (now - p.t0) / 1000;
      const x = p.x + p.vx * dt, y = p.y + p.vy * dt + 160 * dt * dt;
      ctx.globalAlpha = 1 - (now - p.t0) / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Zwevende tekst
    this.floaters = this.floaters.filter(f => now - f.t0 < f.dur);
    for (const f of this.floaters) {
      const p = (now - f.t0) / f.dur;
      ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.font = `${Math.round(s * 0.55)}px "Lilita One", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(f.text, f.x, f.y - p * s * 0.9);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - p * s * 0.9);
    }
    ctx.globalAlpha = 1;
  }
}

function rgbToHex(rgb) {
  const m = rgb.match(/\d+/g).map(Number);
  return '#' + m.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
}
