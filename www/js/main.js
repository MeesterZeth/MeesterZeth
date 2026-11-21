// Schermen, bediening en het aan elkaar knopen van regels, AI, tekenen en winkel.
import {
  LEVELS, UNITS, BUILDINGS, TOWER_COST, AD_BONUS_GOLD, createGame, reachable, moveUnit,
  recruit, build, canRecruit, canBuild, buildCost, economy, endTurn, defenseOf, starsFor,
} from './game.js';
import { aiTurn } from './ai.js';
import { Renderer } from './render.js';
import * as storage from './storage.js';
import * as store from './store.js';

const $ = sel => document.querySelector(sel);
const AI_DELAY = 260;

let game = null;
let renderer = null;
let ui = { selected: null, moves: null, attacks: null, flash: null };
let busy = false;

// ---------- Schermen ----------

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-menu') refreshMenu();
  if (id === 'screen-levels') renderLevels();
}

function totalStars() {
  return Object.values(storage.load().stars).reduce((a, b) => a + b, 0);
}

function refreshMenu() {
  const s = totalStars();
  $('#menu-stars').textContent = s ? `⭐ ${s} / ${LEVELS.length * 3} sterren verzameld` : '';
}

function isUnlocked(level) {
  if (level.premium && !store.owns('premium')) return false;
  if (level.id === 1) return true;
  return !!storage.load().stars[level.id - 1];
}

function renderLevels() {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const stars = storage.load().stars;
  $('#levels-stars').textContent = `⭐ ${totalStars()}`;
  for (const lv of LEVELS) {
    const b = document.createElement('button');
    const unlocked = isUnlocked(lv);
    const needsPremium = lv.premium && !store.owns('premium');
    b.className = 'level' + (unlocked ? '' : ' locked') + (needsPremium ? ' premium' : '');
    const st = stars[lv.id] || 0;
    b.innerHTML = `${needsPremium ? '👑' : unlocked ? lv.id : '🔒'}<small>${needsPremium ? lv.id : '★'.repeat(st) + '☆'.repeat(3 - st)}</small>`;
    b.onclick = () => {
      if (needsPremium) openShop('Level 11 t/m 30 horen bij Premium.');
      else if (unlocked) openBriefing(lv);
      else toastModal('Nog op slot', `Haal eerst level ${lv.id - 1}.`);
    };
    grid.appendChild(b);
  }
}

// ---------- Vensters ----------

function modal(html, onMount) {
  $('#modal-box').innerHTML = html;
  $('#modal').classList.remove('hidden');
  if (onMount) onMount($('#modal-box'));
}
function closeModal() { $('#modal').classList.add('hidden'); }

function toastModal(title, text) {
  modal(`<h2>${title}</h2><p>${text}</p><button class="btn primary big" data-close>Oké</button>`,
    box => box.querySelector('[data-close]').onclick = closeModal);
}

function helpHtml() {
  const rows = Object.values(UNITS).map(u =>
    `<tr><td>${u.icon} ${u.name}</td><td>${u.str}</td><td>${u.cost}</td><td>${u.upkeep}</td><td>${u.move}</td></tr>`).join('');
  return `
    <h2>Zo speel je</h2>
    <ul class="rules">
      <li>🎯 <b>Doel:</b> verover alle vijandelijke hoofdsteden 🏰. Verlies je eigen hoofdstad niet!</li>
      <li>💰 Elk vakje geeft 1 goud per beurt. Dorpen 🏠 en boerderijen 🌾 geven +2, je hoofdstad +3.</li>
      <li>🪖 Tik op een eigen leeg vakje om een eenheid te kopen. Nieuwe eenheden kunnen pas volgende beurt lopen.</li>
      <li>👣 Tik op een eenheid met een groen stipje, daarna op een witte stip om te lopen of op een rood vakje om aan te vallen.</li>
      <li>🛡️ Je verovert een vakje alleen als jouw kracht <b>groter</b> is dan de verdediging. Bos 🌲 geeft +1, een toren 🗼 verdedigt met 2. Maximaal 3.</li>
      <li>⚠️ Eenheden kosten elke beurt soldij. Heb je te weinig goud, dan lopen ze weg.</li>
    </ul>
    <table class="unit-table"><tr><th>Eenheid</th><th>Kracht</th><th>Prijs</th><th>Soldij</th><th>Stappen</th></tr>${rows}</table>
    <button class="btn primary big" data-close>Begrepen!</button>`;
}

function openHelp(after) {
  modal(helpHtml(), box => box.querySelector('[data-close]').onclick = () => {
    storage.update(s => { s.seenHelp = true; });
    closeModal();
    if (after) after();
  });
}

function openShop(reason) {
  const testmode = store.isNative() ? '' : '<p class="testmode">🧪 Testmodus: aankopen worden alleen gesimuleerd.</p>';
  const items = Object.entries(store.PRODUCTS).map(([k, p]) => {
    const owned = store.owns(k);
    return `<div class="product ${owned ? 'owned' : ''}">
      <span class="ico">${p.icon}</span>
      <div><b>${p.title}</b><p>${p.desc}</p></div>
      ${owned ? '<b>✓</b>' : `<button class="btn gold" data-buy="${k}">${p.price}</button>`}
    </div>`;
  }).join('');
  modal(`<h2>🛒 Winkel</h2>${reason ? `<p>${reason}</p>` : ''}${testmode}${items}
    <button class="btn big" data-restore>Aankopen herstellen</button>
    <button class="btn primary big" data-close>Sluiten</button>`, box => {
    box.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const ok = await store.purchase(b.dataset.buy);
      openShop(ok ? 'Bedankt voor je aankoop! 🎉' : reason);
      if ($('#screen-levels').classList.contains('active')) renderLevels();
    });
    box.querySelector('[data-restore]').onclick = async () => {
      const owned = await store.restore();
      openShop(owned.length ? 'Je aankopen zijn hersteld.' : 'Geen eerdere aankopen gevonden.');
    };
    box.querySelector('[data-close]').onclick = () => {
      closeModal();
      if ($('#screen-levels').classList.contains('active')) renderLevels();
    };
  });
}

function openSettings() {
  const s = storage.load();
  const hasPack = store.owns('colors');
  const swatches = store.COLORS.map(c => {
    const locked = c.pack && !hasPack;
    return `<button class="swatch ${s.color === c.value ? 'sel' : ''} ${locked ? 'locked' : ''}" style="background:${c.value}"
      data-color="${c.value}" data-locked="${locked}" title="${c.name}"></button>`;
  }).join('');
  modal(`<h2>⚙️ Instellingen</h2>
    <p><b>Kleur van jouw rijk</b></p><div class="colors">${swatches}</div>
    ${hasPack ? '' : '<p class="small">🎨 Extra kleuren zitten in het Kleurenpakket.</p>'}
    <button class="btn big" data-reset>Voortgang wissen</button>
    <p class="small">Aankopen blijven bewaard. Eilandrijk verzamelt zelf geen persoonsgegevens.</p>
    <button class="btn primary big" data-close>Klaar</button>`, box => {
    box.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
      if (b.dataset.locked === 'true') return openShop('Ontgrendel 5 extra kleuren met het Kleurenpakket.');
      storage.update(st => { st.color = b.dataset.color; });
      openSettings();
    });
    box.querySelector('[data-reset]').onclick = () => {
      if (window.confirm('Weet je zeker dat je alle sterren wilt wissen?')) { storage.reset(); openSettings(); }
    };
    box.querySelector('[data-close]').onclick = () => { closeModal(); refreshMenu(); };
  });
}

// Gesimuleerde reclame in de browser (in de app komt hier een echte advertentie).
store.setMockAdUI((seconds, rewarded) => new Promise(resolve => {
  let left = seconds;
  modal(`<div class="ad"><h2>Advertentie</h2><p class="testmode">🧪 Testmodus: hier komt in de app een echte advertentie.</p>
    <div class="ad-box">📺 Reclame</div><button class="btn big" disabled data-skip>Nog ${left} s…</button></div>`, box => {
    const btn = box.querySelector('[data-skip]');
    const timer = setInterval(() => {
      left--;
      if (left > 0) { btn.textContent = `Nog ${left} s…`; return; }
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = rewarded ? 'Beloning ophalen 🎁' : 'Sluiten';
      btn.onclick = () => { closeModal(); resolve(true); };
    }, 1000);
  });
}));

function openBriefing(level) {
  const premium = store.owns('premium');
  const opp = level.opponents === 1 ? '1 tegenstander' : `${level.opponents} tegenstanders`;
  modal(`<h2>Level ${level.id}</h2>
    <p>${opp} · eiland van ${level.cols}×${level.rows}</p>
    <p>⭐⭐⭐ als je wint binnen <b>${level.par}</b> beurten.</p>
    ${premium ? `<p>👑 Premium-bonus: <b>+${AD_BONUS_GOLD} startgoud</b></p>` : ''}
    <button class="btn primary big" data-start>Start</button>
    ${premium ? '' : `<button class="btn gold big" data-ad>🎬 Bekijk reclame: +${AD_BONUS_GOLD} startgoud</button>`}
    <button class="btn big" data-close>Terug</button>`, box => {
    box.querySelector('[data-start]').onclick = () => startLevel(level, premium ? AD_BONUS_GOLD : 0);
    box.querySelector('[data-close]').onclick = closeModal;
    const ad = box.querySelector('[data-ad]');
    if (ad) ad.onclick = async () => {
      const ok = await store.showRewardedAd();
      startLevel(level, ok ? AD_BONUS_GOLD : 0);
    };
  });
}

// ---------- Spel ----------

function startLevel(level, bonusGold) {
  closeModal();
  game = createGame(level, { color: storage.load().color, bonusGold });
  ui = { selected: null, moves: null, attacks: null, flash: null };
  busy = false;
  show('screen-game');
  renderer.fit(game);
  refresh();
  if (bonusGold) toast(`+${bonusGold} startgoud!`);
  if (!storage.load().seenHelp) openHelp();
}

function nextPlayableLevel() {
  return LEVELS.find(l => isUnlocked(l) && !storage.load().stars[l.id]) || LEVELS.filter(isUnlocked).pop();
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function refresh() {
  if (!game) return;
  renderer.draw(game, ui);
  const me = game.players[0];
  const eco = economy(game, 0);
  $('#hud-gold').textContent = me.gold;
  const net = $('#hud-net');
  net.textContent = (eco.net >= 0 ? '+' : '') + eco.net;
  net.className = eco.net < 0 ? 'neg' : '';
  $('#hud-turn').textContent = game.turn;
  $('#hud-players').innerHTML = game.players.map(p =>
    `<span class="${p.alive ? '' : 'dead'} ${game.current === p.id ? 'now' : ''}" style="background:${p.color}" title="${p.name}"></span>`).join('');
  $('#btn-end').disabled = busy || game.current !== 0;
  $('#btn-end').textContent = game.current === 0 ? 'Einde beurt ➜' : `${game.players[game.current].name} is aan zet…`;
  renderPanel();
}

function clearSelection() {
  ui.selected = null; ui.moves = null; ui.attacks = null;
}

function renderPanel() {
  const info = $('#panel-info');
  const actions = $('#panel-actions');
  actions.innerHTML = '';
  if (!ui.selected) {
    info.innerHTML = game.current === 0
      ? 'Tik op een eigen vakje om te kopen of bouwen, of op een eenheid om te bewegen.'
      : 'De tegenstanders zijn bezig…';
    return;
  }
  const t = game.tiles.get(ui.selected);
  const ownerName = t.owner >= 0 ? game.players[t.owner].name : 'Niemand';
  const terrain = { grass: 'Gras', forest: 'Bos', mountain: 'Berg' }[t.terrain];
  let text = `<b>${ownerName}</b> · ${terrain}`;
  if (t.building) text += ` · ${BUILDINGS[t.building].icon} ${BUILDINGS[t.building].name}`;
  if (t.unit) text += ` · ${UNITS[t.unit.type].icon} ${UNITS[t.unit.type].name}`;
  text += ` · 🛡️ ${defenseOf(t)}`;
  if (t.owner === 0 && t.unit) {
    text += t.unit.mp > 0 ? ` · nog ${t.unit.mp} stap(pen)` : ' · rust uit deze beurt';
  }
  info.innerHTML = text;
  if (t.owner !== 0 || game.current !== 0 || busy) return;

  const add = (label, icon, cost, enabled, fn) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = `<span>${icon}</span>${label}<br>💰${cost}`;
    b.disabled = !enabled;
    b.onclick = fn;
    actions.appendChild(b);
  };
  if (!t.unit) {
    for (const [type, u] of Object.entries(UNITS)) {
      add(u.name, u.icon, u.cost, canRecruit(game, 0, t, type), () => {
        recruit(game, 0, t, type);
        clearSelection();
        refresh();
      });
    }
  }
  if (!t.building) {
    if (t.terrain === 'grass') {
      add('Boerderij', '🌾', buildCost(game, 0, 'farm'), canBuild(game, 0, t, 'farm'), () => {
        build(game, 0, t, 'farm'); clearSelection(); refresh();
      });
    }
    add('Toren', '🗼', TOWER_COST, canBuild(game, 0, t, 'tower'), () => {
      build(game, 0, t, 'tower'); clearSelection(); refresh();
    });
  }
}

function select(k) {
  const t = game.tiles.get(k);
  ui.selected = k;
  ui.moves = null; ui.attacks = null;
  if (t.owner === 0 && t.unit && t.unit.mp > 0) {
    const r = reachable(game, k);
    ui.moves = [...r.moves.keys()];
    ui.attacks = [...r.attacks];
  }
}

function onTap(ev) {
  if (!game || busy || game.current !== 0 || game.winner) return;
  const k = renderer.pick(ev.clientX, ev.clientY);
  const t = game.tiles.get(k);
  if (!t || t.terrain === 'water') { clearSelection(); refresh(); return; }

  const isMove = ui.moves && ui.moves.includes(k);
  const isAttack = ui.attacks && ui.attacks.includes(k);
  if (ui.selected && (isMove || isAttack)) {
    const res = moveUnit(game, ui.selected, k);
    if (res.ok) {
      res.events.forEach(toast);
      if (isAttack) flash(k);
      const u = game.tiles.get(k).unit;
      if (u && u.mp > 0) select(k); else clearSelection();
      refresh();
      if (game.winner) return finish();
      return;
    }
  }
  if (ui.selected === k) clearSelection(); else select(k);
  refresh();
}

function flash(k) {
  ui.flash = k;
  setTimeout(() => { ui.flash = null; refresh(); }, 180);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function onEndTurn() {
  if (!game || busy || game.current !== 0) return;
  busy = true;
  clearSelection();
  let events = endTurn(game);
  refresh();
  while (game.current !== 0 && !game.winner) {
    const pid = game.current;
    for (const _ of aiTurn(game, pid)) {
      refresh();
      await sleep(AI_DELAY);
      if (game.winner) break;
    }
    if (game.winner) break;
    events = endTurn(game);
    refresh();
  }
  busy = false;
  refresh();
  if (game.winner) return finish();
  events.forEach(toast);
  const idle = [...game.tiles.values()].filter(t => t.owner === 0 && t.unit && t.unit.mp > 0).length;
  if (!events.length) toast(`Beurt ${game.turn} · ${idle} eenhe${idle === 1 ? 'id' : 'den'} klaar`);
}

async function finish() {
  const won = game.winner === 'win';
  const level = game.level;
  const stars = won ? starsFor(game) : 0;
  storage.update(s => {
    s.levelsPlayed++;
    if (won) s.stars[level.id] = Math.max(s.stars[level.id] || 0, stars);
  });
  await sleep(500);
  await store.maybeShowInterstitial();
  const next = LEVELS[level.id];
  const nextLocked = next && next.premium && !store.owns('premium');
  modal(won
    ? `<h2>🎉 Gewonnen!</h2><div class="stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
       <p>Level ${level.id} veroverd in ${game.turn} beurten (⭐⭐⭐ binnen ${level.par}).</p>
       ${next ? `<button class="btn primary big" data-next>${nextLocked ? '👑 Ga verder met Premium' : `Volgende: level ${next.id}`}</button>` : '<p><b>Je hebt alle levels uitgespeeld!</b></p>'}
       <button class="btn big" data-retry>Opnieuw voor meer sterren</button>
       <button class="btn big" data-menu>Menu</button>`
    : `<h2>💥 Verloren</h2><p>Je hoofdstad is gevallen in beurt ${game.turn}.</p>
       <p class="small">Tip: zet een toren of sterke eenheid naast je hoofdstad en bouw boerderijen voor extra goud.</p>
       <button class="btn primary big" data-retry>Probeer opnieuw</button>
       <button class="btn big" data-menu>Menu</button>`,
  box => {
    const nb = box.querySelector('[data-next]');
    if (nb) nb.onclick = () => (nextLocked ? openShop('Speel level 11 t/m 30 met Premium.') : openBriefing(next));
    box.querySelector('[data-retry]').onclick = () => openBriefing(level);
    box.querySelector('[data-menu]').onclick = () => { closeModal(); show('screen-menu'); };
  });
}

function openPause() {
  modal(`<h2>Pauze</h2>
    <button class="btn primary big" data-close>Verder spelen</button>
    <button class="btn big" data-help>❓ Uitleg</button>
    <button class="btn big" data-retry>Level opnieuw</button>
    <button class="btn big" data-menu>Stoppen</button>`, box => {
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelector('[data-help]').onclick = () => openHelp();
    box.querySelector('[data-retry]').onclick = () => openBriefing(game.level);
    box.querySelector('[data-menu]').onclick = () => { closeModal(); game = null; show('screen-menu'); };
  });
}

// ---------- Opstarten ----------

function init() {
  renderer = new Renderer($('#board'));
  $('#board').addEventListener('pointerup', onTap);
  $('#btn-end').onclick = onEndTurn;
  $('#btn-pause').onclick = () => !busy && openPause();
  $('#btn-play').onclick = () => openBriefing(nextPlayableLevel());
  $('#btn-levels').onclick = () => show('screen-levels');
  $('#btn-shop').onclick = () => openShop();
  $('#btn-help').onclick = () => openHelp();
  $('#btn-settings').onclick = openSettings;
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('screen-menu'));
  window.addEventListener('resize', () => { if (game) { renderer.fit(game); refresh(); } });
  store.init().finally(refreshMenu);
  refreshMenu();
}

init();

// Handig bij testen: window.__eilandrijk.game
window.__eilandrijk = { get game() { return game; }, get renderer() { return renderer; }, LEVELS, startLevel, aiTurn, endTurn };
