// Spelregels van Eilandrijk. Geen DOM-code hier: alleen de toestand van het spel.
import { key, neighborKeys, mulberry32 } from './hex.js';

export const UNITS = {
  scout:    { name: 'Verkenner', icon: '🏹', str: 1, cost: 10, upkeep: 1, move: 3 },
  soldier:  { name: 'Soldaat',   icon: '⚔️', str: 2, cost: 20, upkeep: 2, move: 2 },
  knight:   { name: 'Ridder',    icon: '🐎', str: 3, cost: 35, upkeep: 4, move: 2 },
  catapult: { name: 'Katapult',  icon: '💣', str: 4, cost: 50, upkeep: 6, move: 1 },
};

export const BUILDINGS = {
  capital: { name: 'Hoofdstad', icon: '🏰', bonus: 3, def: 2 },
  village: { name: 'Dorp',      icon: '🏠', bonus: 2, def: 1 },
  farm:    { name: 'Boerderij', icon: '🌾', bonus: 2, def: 0 },
  tower:   { name: 'Toren',     icon: '🗼', bonus: 0, def: 2 },
};

export const MAX_DEFENSE = 3;
export const TOWER_COST = 25;
export const START_GOLD = 15;
export const AD_BONUS_GOLD = 15;

export const AI_NAMES = ['Rode Kust', 'Gouden Heuvels', 'Paarse Bergen'];
export const AI_COLORS = ['#e5484d', '#e2a400', '#8e4ec6'];

export const PREMIUM_FROM_LEVEL = 11;

// 30 levels, steeds groter en slimmer.
export const LEVELS = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  const opponents = n <= 4 ? 1 : n <= 16 ? 2 : 3;
  return {
    id: n,
    seed: 1009 + n * 7919,
    rows: Math.min(15, 11 + Math.floor(n / 6)),
    cols: Math.min(9, 8 + Math.floor(n / 12)),
    opponents,
    aiGold: Math.min(14, Math.floor(n / 4) * 2),
    aiIncome: 1 + n * 0.015,
    aiSkill: Math.min(1, 0.45 + n * 0.02),
    par: 10 + opponents * 4 + Math.floor(n / 4),
    premium: n >= PREMIUM_FROM_LEVEL,
  };
});

export function isPassable(t) {
  return t && (t.terrain === 'grass' || t.terrain === 'forest');
}

export function tileNeighbors(state, t) {
  const out = [];
  for (const k of neighborKeys(t.q, t.r)) {
    const n = state.tiles.get(k);
    if (n) out.push(n);
  }
  return out;
}

// ---------- Kaart maken ----------

function generateTerrain(rng, rows, cols) {
  const tiles = new Map();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const q = col - (row - (row & 1)) / 2;
      const r = row;
      const edge = Math.min(row, rows - 1 - row, col, cols - 1 - col);
      const v = rng();
      let terrain = 'grass';
      if (edge === 0 && v < 0.4) terrain = 'water';
      else if (v < 0.06) terrain = 'water';
      else if (v < 0.13) terrain = 'mountain';
      else if (v < 0.33) terrain = 'forest';
      tiles.set(key(q, r), { q, r, row, col, terrain, owner: -1, building: null, unit: null });
    }
  }
  // Bossen klonteren samen.
  const fake = { tiles };
  for (const t of tiles.values()) {
    if (t.terrain !== 'grass') continue;
    const f = tileNeighbors(fake, t).filter(n => n.terrain === 'forest').length;
    if (f >= 3 && rng() < 0.6) t.terrain = 'forest';
  }
  // Alleen het grootste samenhangende eiland blijft land.
  const seen = new Set();
  let best = [];
  for (const t of tiles.values()) {
    if (!isPassable(t) || seen.has(t)) continue;
    const comp = [];
    const stack = [t];
    seen.add(t);
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      for (const n of tileNeighbors(fake, c)) {
        if (isPassable(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  const keep = new Set(best);
  for (const t of tiles.values()) {
    if (isPassable(t) && !keep.has(t)) t.terrain = 'water';
  }
  return { tiles, land: best };
}

function bfsDistances(state, start) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    for (const n of tileNeighbors(state, c)) {
      if (isPassable(n) && !dist.has(n)) { dist.set(n, dist.get(c) + 1); queue.push(n); }
    }
  }
  return dist;
}

export function createGame(level, opts = {}) {
  const rng = mulberry32(level.seed);
  let gen, tries = 0;
  do {
    gen = generateTerrain(rng, level.rows, level.cols);
    tries++;
  } while (gen.land.length < level.rows * level.cols * 0.55 && tries < 50);

  const state = {
    level,
    rows: level.rows,
    cols: level.cols,
    tiles: gen.tiles,
    players: [],
    turn: 1,
    current: 0,
    winner: null,
    stats: { captured: 0, lost: 0 },
  };

  const playerCount = level.opponents + 1;
  state.players.push({
    id: 0, name: 'Jouw rijk', color: opts.color || '#2f7de1', human: true,
    gold: START_GOLD + (opts.bonusGold || 0), alive: true,
  });
  for (let i = 0; i < level.opponents; i++) {
    state.players.push({
      id: i + 1, name: AI_NAMES[i], color: AI_COLORS[i], human: false,
      gold: START_GOLD + level.aiGold, alive: true,
      skill: level.aiSkill, incomeMult: level.aiIncome,
    });
  }

  // Hoofdsteden: speler onderaan, tegenstanders zo ver mogelijk weg.
  const land = gen.land;
  const bottom = land.filter(t => t.row >= level.rows - 4 && tileNeighbors(state, t).filter(isPassable).length >= 4);
  const pool = bottom.length ? bottom : land;
  const capitals = [pool[Math.floor(rng() * pool.length)]];
  const distMaps = [bfsDistances(state, capitals[0])];
  while (capitals.length < playerCount) {
    let bestT = null, bestD = -1;
    for (const t of land) {
      if (tileNeighbors(state, t).filter(isPassable).length < 3) continue;
      const d = Math.min(...distMaps.map(m => m.get(t) ?? 0));
      const score = d + rng() * 1.5;
      if (score > bestD) { bestD = score; bestT = t; }
    }
    capitals.push(bestT);
    distMaps.push(bfsDistances(state, bestT));
  }
  capitals.forEach((c, pid) => {
    c.terrain = 'grass';
    c.owner = pid;
    c.building = 'capital';
    for (const n of tileNeighbors(state, c)) if (isPassable(n) && n.owner < 0) n.owner = pid;
    // Iedereen begint met één soldaat naast de hoofdstad.
    const guard = tileNeighbors(state, c).find(n => n.owner === pid && !n.unit);
    if (guard) guard.unit = { type: 'soldier', mp: 0 };
  });

  // Neutrale dorpen.
  const villageCount = Math.max(3, Math.floor(land.length / 14));
  const villages = [];
  const shuffled = land.slice().sort(() => rng() - 0.5);
  for (const t of shuffled) {
    if (villages.length >= villageCount) break;
    if (t.owner >= 0 || t.building) continue;
    if (distMaps.some(m => (m.get(t) ?? 0) < 3)) continue;
    if (villages.some(v => Math.abs(v.q - t.q) + Math.abs(v.r - t.r) + Math.abs(v.q + v.r - t.q - t.r) < 4)) continue;
    t.building = 'village';
    villages.push(t);
  }

  startTurn(state, 0);
  return state;
}

// ---------- Regels ----------

export function defenseOf(t) {
  let d = 0;
  if (t.unit) d = Math.max(d, UNITS[t.unit.type].str);
  if (t.building) d = Math.max(d, BUILDINGS[t.building].def);
  if (t.terrain === 'forest') d += 1;
  return Math.min(MAX_DEFENSE, d);
}

export function tilesOf(state, pid) {
  const out = [];
  for (const t of state.tiles.values()) if (t.owner === pid) out.push(t);
  return out;
}

export function farmCost(state, pid) {
  const farms = tilesOf(state, pid).filter(t => t.building === 'farm').length;
  return 12 + farms * 4;
}

export function economy(state, pid) {
  const p = state.players[pid];
  let income = 0, upkeep = 0;
  for (const t of state.tiles.values()) {
    if (t.owner !== pid) continue;
    income += 1;
    if (t.building) income += BUILDINGS[t.building].bonus;
    if (t.unit) upkeep += UNITS[t.unit.type].upkeep;
  }
  if (!p.human) income = Math.round(income * (p.incomeMult || 1));
  return { income, upkeep, net: income - upkeep };
}

export function startTurn(state, pid) {
  const p = state.players[pid];
  const events = [];
  for (const t of state.tiles.values()) {
    if (t.owner === pid && t.unit) t.unit.mp = UNITS[t.unit.type].move;
  }
  const { net } = economy(state, pid);
  p.gold += net;
  // Geen geld? Dan lopen de duurste soldaten weg.
  while (p.gold < 0) {
    const units = tilesOf(state, pid).filter(t => t.unit)
      .sort((a, b) => UNITS[b.unit.type].upkeep - UNITS[a.unit.type].upkeep);
    if (!units.length) break;
    p.gold += UNITS[units[0].unit.type].upkeep;
    events.push(`${UNITS[units[0].unit.type].name} is weggelopen: geen geld voor soldij!`);
    units[0].unit = null;
  }
  p.gold = Math.max(0, p.gold);
  return events;
}

export function reachable(state, fromKey) {
  const start = state.tiles.get(fromKey);
  const res = { moves: new Map(), attacks: new Set() };
  if (!start || !start.unit || start.unit.mp <= 0) return res;
  const pid = start.owner;
  const u = start.unit;
  const str = UNITS[u.type].str;
  const dist = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    const d = dist.get(c);
    if (d + 1 > u.mp) continue;
    for (const n of tileNeighbors(state, c)) {
      if (!isPassable(n)) continue;
      if (n.owner === pid) {
        if (!dist.has(n)) {
          dist.set(n, d + 1);
          queue.push(n);
          if (!n.unit) res.moves.set(key(n.q, n.r), d + 1);
        }
      } else if (str > defenseOf(n)) {
        res.attacks.add(key(n.q, n.r));
      }
    }
  }
  return res;
}

function eliminate(state, pid, by) {
  const p = state.players[pid];
  p.alive = false;
  for (const t of state.tiles.values()) {
    if (t.owner !== pid) continue;
    t.owner = -1;
    t.unit = null;
    if (t.building === 'tower') t.building = null;
  }
  return `${p.name} is verslagen door ${state.players[by].name}!`;
}

// Geeft { ok, events } terug.
export function moveUnit(state, fromKey, toKey) {
  const from = state.tiles.get(fromKey);
  const to = state.tiles.get(toKey);
  const r = reachable(state, fromKey);
  const pid = from.owner;
  const events = [];
  if (r.moves.has(toKey)) {
    to.unit = from.unit;
    to.unit.mp -= r.moves.get(toKey);
    from.unit = null;
    return { ok: true, events, captured: false };
  }
  if (r.attacks.has(toKey)) {
    const prev = to.owner;
    const wasCapital = to.building === 'capital';
    if (prev === 0) state.stats.lost++;
    if (pid === 0) state.stats.captured++;
    to.unit = from.unit;
    to.unit.mp = 0;
    from.unit = null;
    if (to.building === 'tower') to.building = null;
    to.owner = pid;
    if (wasCapital && prev >= 0) {
      to.building = 'village';
      events.push(eliminate(state, prev, pid));
    }
    checkWinner(state);
    return { ok: true, events, captured: true, prev };
  }
  return { ok: false, events };
}

export function canRecruit(state, pid, t, type) {
  return t && t.owner === pid && !t.unit && isPassable(t) && state.players[pid].gold >= UNITS[type].cost;
}

export function recruit(state, pid, t, type) {
  if (!canRecruit(state, pid, t, type)) return false;
  state.players[pid].gold -= UNITS[type].cost;
  t.unit = { type, mp: 0 };
  return true;
}

export function buildCost(state, pid, type) {
  return type === 'farm' ? farmCost(state, pid) : TOWER_COST;
}

export function canBuild(state, pid, t, type) {
  if (!t || t.owner !== pid || t.building) return false;
  if (type === 'farm' && t.terrain !== 'grass') return false;
  return state.players[pid].gold >= buildCost(state, pid, type);
}

export function build(state, pid, t, type) {
  if (!canBuild(state, pid, t, type)) return false;
  state.players[pid].gold -= buildCost(state, pid, type);
  t.building = type;
  return true;
}

export function checkWinner(state) {
  if (!state.players[0].alive) state.winner = 'lose';
  else if (state.players.every(p => p.human || !p.alive)) state.winner = 'win';
  return state.winner;
}

// Gaat naar de volgende speler die nog leeft. Geeft gebeurtenissen van diens beurtstart terug.
export function endTurn(state) {
  const n = state.players.length;
  let next = state.current;
  do {
    next = (next + 1) % n;
    if (next === 0) state.turn++;
  } while (!state.players[next].alive);
  state.current = next;
  return startTurn(state, next);
}

export function starsFor(state) {
  const par = state.level.par;
  if (state.turn <= par) return 3;
  if (state.turn <= Math.round(par * 1.5)) return 2;
  return 1;
}
