// Computertegenstanders. aiTurn is een generator: na elke actie "yield" zodat de UI kan tekenen.
import { key } from './hex.js';
import {
  UNITS, isPassable, tileNeighbors, reachable, moveUnit, recruit, build,
  economy, tilesOf, defenseOf, buildCost, TOWER_COST,
} from './game.js';

function k(t) { return key(t.q, t.r); }

function targetScore(state, pid, t) {
  let s = t.owner < 0 ? 4 : 7;
  if (t.building === 'capital') s += 100;
  if (t.building === 'village') s += 12;
  if (t.building === 'farm') s += 8;
  if (t.building === 'tower') s += 5;
  if (t.unit) s += 4 * UNITS[t.unit.type].str;
  return s;
}

// Afstandsveld: hoe ver is elk vakje van iets interessants (vijandelijke hoofdstad weegt het zwaarst).
function goalField(state, pid) {
  const cost = new Map();
  const queue = [];
  for (const t of state.tiles.values()) {
    if (!isPassable(t) || t.owner === pid) continue;
    let c = t.owner < 0 ? 4 : 3;
    if (t.building === 'capital') c = 0;
    else if (t.building === 'village') c = 2;
    cost.set(t, c);
    queue.push(t);
  }
  // Eenvoudige Dijkstra (kaart is klein).
  while (queue.length) {
    queue.sort((a, b) => cost.get(a) - cost.get(b));
    const c = queue.shift();
    for (const n of tileNeighbors(state, c)) {
      if (!isPassable(n)) continue;
      const nc = cost.get(c) + 1;
      if (!cost.has(n) || nc < cost.get(n)) { cost.set(n, nc); queue.push(n); }
    }
  }
  return cost;
}

function enemyThreat(state, pid, t, radius) {
  // Sterkste vijandelijke eenheid binnen 'radius' stappen.
  let best = 0;
  const seen = new Set([t]);
  let frontier = [t];
  for (let d = 0; d < radius; d++) {
    const next = [];
    for (const c of frontier) {
      for (const n of tileNeighbors(state, c)) {
        if (seen.has(n) || !isPassable(n)) continue;
        seen.add(n);
        next.push(n);
        if (n.unit && n.owner !== pid && n.owner >= 0) best = Math.max(best, UNITS[n.unit.type].str);
      }
    }
    frontier = next;
  }
  return best;
}

function isFrontier(state, pid, t) {
  return tileNeighbors(state, t).some(n => isPassable(n) && n.owner !== pid);
}

export function* aiTurn(state, pid, rng = Math.random) {
  const P = state.players[pid];
  const skill = P.skill ?? 0.7;
  const capital = tilesOf(state, pid).find(t => t.building === 'capital');

  // 1. Eenheden bewegen en aanvallen (meerdere rondes, want na een stap kan een aanval mogelijk zijn).
  for (let pass = 0; pass < 3; pass++) {
    const field = goalField(state, pid);
    const units = tilesOf(state, pid).filter(t => t.unit && t.unit.mp > 0)
      .sort((a, b) => UNITS[b.unit.type].str - UNITS[a.unit.type].str);
    let acted = false;
    for (const t of units) {
      if (state.winner || t.owner !== pid || !t.unit || t.unit.mp <= 0) continue;
      // Hoofdstad bewaken als er gevaar dreigt.
      if (t === capital && enemyThreat(state, pid, t, 3) >= 2 && rng() < 0.4 + skill * 0.5) continue;
      const r = reachable(state, k(t));
      let best = null, bestS = -1;
      for (const ak of r.attacks) {
        const s = targetScore(state, pid, state.tiles.get(ak)) + rng() * 3 * (1 - skill);
        if (s > bestS) { bestS = s; best = ak; }
      }
      if (best && rng() < 0.6 + 0.4 * skill) {
        moveUnit(state, k(t), best);
        acted = true;
        yield;
        continue;
      }
      // Anders: opschuiven richting het front.
      let goal = null, goalV = field.get(t) ?? 99;
      for (const mk of r.moves.keys()) {
        const v = field.get(state.tiles.get(mk)) ?? 99;
        if (v < goalV) { goalV = v; goal = mk; }
      }
      if (goal) {
        moveUnit(state, k(t), goal);
        acted = true;
        yield;
      }
    }
    if (!acted) break;
  }
  if (state.winner || !P.alive) return;

  // 2. Rekruteren aan het front.
  let { net, income } = economy(state, pid);
  const reserve = Math.floor(income * 0.25); // houd altijd wat inkomen over
  const field = goalField(state, pid);
  const threatAtHome = capital ? enemyThreat(state, pid, capital, 3) : 0;
  // Hoe sterk moeten we zijn om de dichtstbijzijnde vijandelijke hoofdstad te nemen?
  const enemyCapDef = Math.min(...[...state.tiles.values()]
    .filter(t => t.building === 'capital' && t.owner !== pid && t.owner >= 0).map(defenseOf), 9);
  for (let i = 0; i < 4; i++) {
    const own = tilesOf(state, pid).filter(t => !t.unit && isPassable(t));
    const front = own.filter(t => isFrontier(state, pid, t));
    const spots = (front.length ? front : own).sort((a, b) => (field.get(a) ?? 99) - (field.get(b) ?? 99));
    if (!spots.length) break;
    let spot = spots[Math.min(spots.length - 1, Math.floor(rng() * 2 * (1 - skill)))];
    if (threatAtHome >= 2 && capital) {
      const near = spots.filter(s => tileNeighbors(state, capital).includes(s));
      if (near.length) spot = near[0];
    }
    const g = P.gold;
    const rich = g >= 60 && net >= 8;
    const army = tilesOf(state, pid).filter(t => t.unit);
    const strong = army.filter(t => UNITS[t.unit.type].str > enemyCapDef).length;
    // Genoeg kleine eenheden? Dan sparen voor iets dat de hoofdstad kan innemen.
    const saving = army.length >= 4 + Math.floor(tilesOf(state, pid).length / 10) && strong < 2 && threatAtHome < 2;
    let type = null;
    if (g >= 50 && net >= 7 && (enemyCapDef >= 3 || threatAtHome >= 3) && (saving || rng() < 0.4 + skill * 0.4)) type = 'catapult';
    else if (g >= 35 && net >= 5 && (rich || saving || rng() < 0.4)) type = 'knight';
    else if (saving) type = null;
    else if (g >= 20 && net - 2 >= reserve) type = 'soldier';
    else if (g >= 10 && net - 1 >= reserve && rng() < 0.6) type = 'scout';
    if (!type) break;
    if (recruit(state, pid, spot, type)) {
      net -= UNITS[type].upkeep;
      yield;
    }
  }

  // 3. Bouwen: boerderijen achter het front, torens bij gevaar.
  if (threatAtHome >= 2 && capital && P.gold >= TOWER_COST) {
    const spot = tileNeighbors(state, capital).find(n => n.owner === pid && !n.building && isPassable(n));
    if (spot && build(state, pid, spot, 'tower')) yield;
  }
  for (let i = 0; i < 2; i++) {
    const cost = buildCost(state, pid, 'farm');
    if (P.gold < cost + 8 || rng() > 0.4 + skill * 0.4) break;
    const spot = tilesOf(state, pid).find(t => t.terrain === 'grass' && !t.building && !isFrontier(state, pid, t));
    if (!spot || !build(state, pid, spot, 'farm')) break;
    yield;
  }
}

