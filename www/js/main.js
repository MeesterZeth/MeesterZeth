// Schermen, bediening, timer, tussenstand en het aan elkaar knopen van regels, AI, tekenen en winkel.
import { key } from './hex.js';
import {
  LEVELS, UNITS, BUILDINGS, TOWER_COST, AD_BONUS_GOLD, createGame, reachable, moveUnit,
  recruit, build, canRecruit, canBuild, buildCost, economy, endTurn, defenseOf, starsFor, standings, whyNot,
} from './game.js';
import { aiTurn } from './ai.js';
import { Renderer } from './render.js';
import { iconURL } from './sprites.js';
import { sfx, setEnabled as setSound, isEnabled as soundOn } from './sfx.js';
import * as storage from './storage.js';
import * as store from './store.js';

const $ = sel => document.querySelector(sel);
const AI_DELAY = 340;

let game = null;
let renderer = null;
let menuRenderer = null;
let menuGame = null;
let ui = { selected: null, moves: null, attacks: null };
let busy = false;
let speed = 1;
const clock = { left: 0, max: 0, lastTick: 0, opp: null, oppElapsed: 0, played: 0 };

// ---------- Hulpjes ----------

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = sec => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const coin = '<i class="coin"></i>';
const modalOpen = () => !$('#modal').classList.contains('hidden');

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
  $('#menu-stars').textContent = s ? `★ ${s} / ${LEVELS.length * 3} sterren` : '';
  const next = nextPlayableLevel();
  $('#play-sub').textContent = `Level ${next.id}`;
  if (menuRenderer) requestAnimationFrame(() => menuRenderer.fit(menuGame));
}

function isUnlocked(level) {
  if (level.premium && !store.owns('premium')) return false;
  if (level.id === 1) return true;
  return !!storage.load().stars[level.id - 1];
}

function nextPlayableLevel() {
  return LEVELS.find(l => isUnlocked(l) && !storage.load().stars[l.id]) || LEVELS.filter(isUnlocked).pop() || LEVELS[0];
}

function starsRow(n) {
  return `<span class="stars-row">${[0, 1, 2].map(i => `<span class="${i < n ? 'on' : ''}">★</span>`).join('')}</span>`;
}

function renderLevels() {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const stars = storage.load().stars;
  $('#levels-stars').textContent = `★ ${totalStars()}`;
  for (const lv of LEVELS) {
    const b = document.createElement('button');
    const unlocked = isUnlocked(lv);
    const needsPremium = lv.premium && !store.owns('premium');
    const st = stars[lv.id] || 0;
    b.className = 'level' + (needsPremium ? ' premium' : !unlocked ? ' locked' : st ? ' done' : '');
    b.innerHTML = needsPremium ? `${lv.id}<span class="stars-row">PREMIUM</span>`
      : unlocked ? `${lv.id}${starsRow(st)}` : `<span class="lock"></span>`;
    b.setAttribute('aria-label', `Level ${lv.id}`);
    b.onclick = () => {
      sfx.click();
      if (needsPremium) openShop('Level 11 t/m 30 horen bij Premium.');
      else if (unlocked) openBriefing(lv);
      else infoModal('Nog op slot', `Haal eerst level ${lv.id - 1}.`);
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

function infoModal(title, text) {
  modal(`<h2>${title}</h2><p>${text}</p><button class="btn primary big" data-close>Oké</button>`,
    box => box.querySelector('[data-close]').onclick = closeModal);
}

function helpHtml() {
  const color = storage.load().color;
  const rows = Object.entries(UNITS).map(([t, u]) =>
    `<tr><td><img src="${iconURL('unit', t, color)}" alt=""> ${u.name}</td><td>${u.str}</td><td>${u.cost}</td><td>${u.upkeep}</td><td>${u.move}</td></tr>`).join('');
  return `
    <h2>Zo speel je</h2>
    <ul class="rules">
      <li><b>Doel:</b> verover alle vijandelijke kastelen. Verlies je eigen kasteel niet!</li>
      <li><b>Goud:</b> elk vakje geeft 1 goud per beurt. Dorpen en boerderijen +2, je kasteel +3.</li>
      <li><b>Kopen:</b> tik op een eigen vakje zonder eenheid. Nieuwe eenheden lopen pas volgende beurt.</li>
      <li><b>Lopen:</b> tik op een eenheid met een groen stipje en daarna op een gemarkeerd vakje. Wit = lopen in je eigen land. Geel = lopen in neutraal land: elk vakje onderweg wordt van jou (1 stap per vakje). Rood = vijand aanvallen (kost al je stappen). Nieuwe eenheden lopen pas de beurt na het kopen.</li>
      <li><b>Winnen van een vakje:</b> je kracht (gele puntjes) moet <b>groter</b> zijn dan de verdediging. Bos +1, toren 2, kasteel 2. Nooit meer dan 3.</li>
      <li><b>Soldij:</b> eenheden kosten elke beurt goud. Is het op, dan lopen ze weg.</li>
      <li><b>Tijd:</b> je hebt per beurt beperkt de tijd (instelbaar). Bij 0 gaat je beurt automatisch voorbij.</li>
      <li><b>Tussenstand:</b> tik op de gekleurde balk bovenin.</li>
    </ul>
    <div class="table-wrap"><table class="data-table"><tr><th>Eenheid</th><th>Kracht</th><th>Prijs</th><th>Soldij</th><th>Stappen</th></tr>${rows}</table></div>
    <button class="btn primary big" data-close>Begrepen!</button>`;
}

function openHelp(after) {
  modal(helpHtml(), box => box.querySelector('[data-close]').onclick = () => {
    storage.update(s => { s.seenHelp = true; });
    closeModal();
    if (after) after();
  });
}

const PRODUCT_ICON = {
  premium: () => iconURL('building', 'capital', '#ffc93c', 96),
  colors: () => iconURL('unit', 'knight', '#e0569b', 96),
};

function openShop(reason) {
  const testmode = store.isNative() ? '' : '<p class="testmode">Testmodus: aankopen worden alleen nagespeeld, je betaalt niets.</p>';
  const items = Object.entries(store.PRODUCTS).map(([k, p]) => {
    const owned = store.owns(k);
    return `<div class="product ${owned ? 'owned' : ''}">
      <img src="${PRODUCT_ICON[k]()}" alt="">
      <div><span class="display">${p.title}</span><p>${p.desc}</p></div>
      ${owned ? '<span class="check">Gekocht</span>' : `<button class="btn gold" data-buy="${k}">${p.price}</button>`}
    </div>`;
  }).join('');
  modal(`<h2>Winkel</h2>${reason ? `<p>${reason}</p>` : ''}${testmode}${items}
    <button class="btn big" data-restore>Aankopen herstellen</button>
    <button class="btn primary big" data-close>Sluiten</button>`, box => {
    box.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const ok = await store.purchase(b.dataset.buy);
      if (ok) sfx.win();
      openShop(ok ? 'Bedankt voor je aankoop!' : reason);
      if ($('#screen-levels').classList.contains('active')) renderLevels();
    });
    box.querySelector('[data-restore]').onclick = async () => {
      const owned = await store.restore();
      openShop(owned.length ? 'Je aankopen zijn hersteld.' : 'Geen eerdere aankopen gevonden.');
    };
    box.querySelector('[data-close]').onclick = () => {
      closeModal();
      if ($('#screen-levels').classList.contains('active')) renderLevels();
      refreshMenu();
    };
  });
}

function openSettings(fromGame = false) {
  const s = storage.load();
  const hasPack = store.owns('colors');
  const swatches = store.COLORS.map(c => {
    const locked = c.pack && !hasPack;
    return `<button class="swatch ${s.color === c.value ? 'sel' : ''} ${locked ? 'locked' : ''}" style="background:${c.value}"
      data-color="${c.value}" data-locked="${locked}" aria-label="${c.name}"></button>`;
  }).join('');
  const times = [[0, 'Uit'], [30, '30s'], [60, '60s'], [90, '90s']];
  modal(`<h2>Instellingen</h2>
    <span class="setting-label">Tijd per beurt</span>
    <div class="seg">${times.map(([v, l]) => `<button data-time="${v}" class="${s.turnTime === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <span class="setting-label">Geluid</span>
    <div class="seg"><button data-sound="1" class="${s.sound ? 'on' : ''}">Aan</button><button data-sound="0" class="${s.sound ? '' : 'on'}">Uit</button></div>
    ${fromGame ? '' : `<span class="setting-label">Kleur van jouw rijk</span><div class="colors">${swatches}</div>
    ${hasPack ? '' : '<p class="small">Extra kleuren zitten in het Kleurenpakket.</p>'}
    <button class="btn" data-reset>Voortgang wissen</button>`}
    <p class="small">Aankopen blijven bewaard. Eilandrijk verzamelt zelf geen persoonsgegevens.</p>
    <button class="btn primary big" data-close>Klaar</button>`, box => {
    box.querySelectorAll('[data-time]').forEach(b => b.onclick = () => {
      storage.update(st => { st.turnTime = Number(b.dataset.time); });
      if (game && game.current === 0) resetClock();
      sfx.click(); openSettings(fromGame);
    });
    box.querySelectorAll('[data-sound]').forEach(b => b.onclick = () => {
      storage.update(st => { st.sound = b.dataset.sound === '1'; });
      setSound(storage.load().sound); updateSoundBtn(); sfx.click(); openSettings(fromGame);
    });
    box.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
      if (b.dataset.locked === 'true') return openShop('Ontgrendel 5 extra kleuren met het Kleurenpakket.');
      storage.update(st => { st.color = b.dataset.color; });
      sfx.select(); openSettings(fromGame);
    });
    const reset = box.querySelector('[data-reset]');
    if (reset) reset.onclick = () => {
      if (reset.dataset.armed) { storage.reset(); openSettings(fromGame); return; }
      reset.dataset.armed = '1';
      reset.textContent = 'Tik nog een keer om alle sterren te wissen';
    };
    box.querySelector('[data-close]').onclick = () => { closeModal(); refreshMenu(); };
  });
}

// Nagespeelde reclame in de browser (in de app komt hier een echte advertentie).
store.setMockAdUI((seconds, rewarded) => new Promise(resolve => {
  let left = seconds;
  modal(`<h2>Advertentie</h2><p class="testmode">Testmodus: hier komt in de app een echte advertentie.</p>
    <div class="ad-box">RECLAME</div><button class="btn big" disabled data-skip>Nog ${left} s…</button>`, box => {
    const btn = box.querySelector('[data-skip]');
    const timer = setInterval(() => {
      left--;
      if (left > 0) { btn.textContent = `Nog ${left} s…`; return; }
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = rewarded ? 'Beloning ophalen' : 'Sluiten';
      btn.className = 'btn gold big';
      btn.onclick = () => { closeModal(); resolve(true); };
    }, 1000);
  });
}));

function openBriefing(level) {
  const premium = store.owns('premium');
  const tt = storage.load().turnTime;
  modal(`<h2>Level ${level.id}</h2>
    <div class="statline"><span><b>${level.opponents}</b> ${level.opponents === 1 ? 'tegenstander' : 'tegenstanders'}</span><span><b>${tt ? tt + 's' : '∞'}</b> per beurt</span></div>
    <p style="text-align:center">Win binnen <b>${level.par}</b> beurten voor 3 sterren.${level.id <= 3 ? ' Dit is een oefenlevel.' : ''}</p>
    ${premium ? `<p class="testmode">Premium-bonus: +${AD_BONUS_GOLD} startgoud</p>` : ''}
    <button class="btn primary big" data-start>Start</button>
    ${premium ? '' : `<button class="btn gold big" data-ad>Bekijk reclame: +${AD_BONUS_GOLD} startgoud</button>`}
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

function openStandings() {
  if (!game) return;
  const rows = standings(game).map((p, i) => `
    <tr class="${p.human ? 'me' : ''} ${p.alive ? '' : 'dead'}">
      <td class="rank">${p.alive ? i + 1 : '–'}</td>
      <td><span class="swatch-dot" style="background:${p.color}"></span>${p.human ? 'Jij' : p.name}</td>
      <td>${p.tiles} <small class="small">(${p.pct}%)</small></td>
      <td>${p.units} <small class="small">/ ${p.strength}</small></td>
      <td>${p.income >= 0 ? '+' : ''}${p.income}</td>
    </tr>`).join('');
  const me = standings(game).findIndex(p => p.human) + 1;
  modal(`<h2>Tussenstand</h2>
    <p style="text-align:center">Beurt ${game.turn} · jij staat op plaats <b>${me}</b> van ${game.players.length}</p>
    <div class="table-wrap"><table class="data-table">
      <tr><th>#</th><th>Rijk</th><th>Vakjes</th><th>Leger / kracht</th><th>Goud/beurt</th></tr>${rows}
    </table></div>
    <button class="btn primary big" data-close>Verder spelen</button>`,
  box => box.querySelector('[data-close]').onclick = closeModal);
}

// ---------- Spel starten ----------

function attachEvents(g) {
  g.onEvent = ev => {
    if (!renderer) return;
    renderer.markDirty();
    const to = g.tiles.get(ev.to);
    const color = g.players[ev.pid].color;
    if (ev.type === 'move') {
      renderer.animateMove(ev.from, ev.to, g, 240 / speed);
      sfx.move();
    } else if (ev.type === 'capture') {
      renderer.animateMove(ev.from, ev.to, g, 260 / speed);
      setTimeout(() => {
        renderer.burst(to, color, ev.prev >= 0 ? 22 : 10);
        const text = ev.capital ? 'VEROVERD!' : ev.building === 'village' ? '+3' : ev.building === 'farm' ? '+3' : '+1';
        renderer.floatText(to, text, ev.capital ? '#ffd23f' : '#fff');
        if (ev.prev >= 0 || ev.killed) sfx.battle(); else sfx.capture();
        if (ev.prev === 0 && navigator.vibrate) navigator.vibrate(30);
      }, 220 / speed);
    } else if (ev.type === 'claim') {
      setTimeout(() => {
        renderer.burst(to, color, 8);
        renderer.floatText(to, ev.building === 'village' ? '+3' : '+1', '#fff');
        sfx.capture();
      }, 120 / speed);
    } else if (ev.type === 'recruit') {
      renderer.burst(to, color, 8);
      sfx.coin();
    } else if (ev.type === 'build') {
      renderer.burst(to, '#d9c39a', 12);
      sfx.build();
    }
  };
}

function startLevel(level, bonusGold) {
  closeModal();
  sfx.click();
  game = createGame(level, { color: storage.load().color, bonusGold });
  attachEvents(game);
  ui = { selected: null, moves: null, attacks: null };
  busy = false;
  speed = 1;
  clock.played = 0;
  clock.opp = game.players[1];
  clock.oppElapsed = 0;
  show('screen-game');
  renderer.fit(game);
  resetClock();
  refresh();
  const go = () => { showBanner('Jouw beurt', game.players[0].color); sfx.turn(); };
  if (!storage.load().seenHelp) openHelp(go); else go();
  if (bonusGold) toast(`+${bonusGold} startgoud!`);
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function showBanner(text, color) {
  const b = $('#banner');
  $('#banner-text').textContent = text;
  b.style.setProperty('--banner', color);
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

function resetClock() {
  clock.max = storage.load().turnTime;
  clock.left = clock.max;
  clock.lastTick = 99;
}

function updateSoundBtn() {
  $('#btn-sound').className = 'btn icon ' + (soundOn() ? 'sound-on' : 'sound-off');
}

// ---------- HUD en paneel ----------

function refresh() {
  if (!game) return;
  const me = game.players[0];
  const eco = economy(game, 0);
  $('#hud-gold').textContent = me.gold;
  const net = $('#hud-net');
  net.textContent = (eco.net >= 0 ? '+' : '') + eco.net;
  net.className = eco.net < 0 ? 'neg' : '';
  $('#hud-turn').textContent = game.turn;

  // Tussenstand-balk
  const st = standings(game);
  const byId = [...st].sort((a, b) => a.id - b.id);
  $('#share-bar').innerHTML = byId.filter(p => p.alive).map(p =>
    `<span style="width:${p.pct}%;background:${p.color}"></span>`).join('');
  const rank = st.findIndex(p => p.human) + 1;
  const mine = st.find(p => p.human);
  $('#standings-label').innerHTML = `<span>Tussenstand · jij <b>#${rank}</b> met <b>${mine.pct}%</b> van het eiland</span><span>Bekijk ›</span>`;

  $('#clock-me-dot').style.background = me.color;
  const endBtn = $('#btn-end');
  if (game.current === 0) {
    endBtn.textContent = 'Einde beurt';
    endBtn.className = 'btn primary end';
    endBtn.disabled = busy;
  } else {
    endBtn.textContent = speed > 1 ? 'Snel ⏩  (tik voor normaal)' : 'Versnellen ⏩';
    endBtn.className = 'btn end fast';
    endBtn.disabled = false;
  }
  renderPanel();
}

function updateClocks() {
  if (!game) return;
  const mineActive = game.current === 0 && !game.winner;
  const me = $('#clock-me');
  me.classList.toggle('active', mineActive);
  const warn = mineActive && clock.max && clock.left <= 10;
  me.classList.toggle('warn', !!warn);
  $('#clock-me-time').textContent = clock.max ? fmt(clock.left) : '∞';
  $('#clock-me-bar').style.width = clock.max ? `${(clock.left / clock.max) * 100}%` : '100%';
  const opp = $('#clock-opp');
  opp.classList.toggle('active', !mineActive && !game.winner);
  if (clock.opp) {
    $('#clock-opp-dot').style.background = clock.opp.color;
    $('#clock-opp-name').textContent = clock.opp.name;
  }
  $('#clock-opp-time').textContent = fmt(clock.oppElapsed);
}

function clearSelection() {
  ui.selected = null; ui.moves = null; ui.attacks = null;
}

function card(html, enabled, fn, extra = '') {
  const b = document.createElement('button');
  b.className = 'card ' + extra;
  b.innerHTML = html;
  b.disabled = !enabled;
  b.onclick = fn;
  $('#panel-actions').appendChild(b);
  return b;
}

function renderPanel() {
  const info = $('#panel-info');
  $('#panel-actions').innerHTML = '';
  if (game.current !== 0) {
    info.innerHTML = `<b>${game.players[game.current].name}</b> is aan zet…`;
    return;
  }
  if (!ui.selected) {
    const ready = readyUnits();
    info.innerHTML = ready.length
      ? `Je hebt <b>${ready.length}</b> eenhe${ready.length === 1 ? 'id' : 'den'} die nog kan lopen.`
      : 'Tik op een eigen vakje om een eenheid te kopen of iets te bouwen.';
    if (!busy && ready.length) card('👣 Volgende eenheid', true, selectNextUnit, 'wide');
    return;
  }
  const t = game.tiles.get(ui.selected);
  if (t.owner === 0 && t.unit && ui.moves && (ui.moves.length || ui.attacks.length)) {
    info.innerHTML = `<b>${UNITS[t.unit.type].name}</b> · nog ${t.unit.mp} stap${t.unit.mp === 1 ? '' : 'pen'}<br>
      <span class="legend"><i style="background:#fff"></i>lopen</span>
      <span class="legend"><i style="background:#ffd60a"></i>innemen</span>
      <span class="legend"><i style="background:#ff3b30"></i>aanvallen</span>`;
    card('👣 Volgende eenheid', true, selectNextUnit, 'wide');
    return;
  }
  const ownerName = t.owner >= 0 ? (t.owner === 0 ? 'Jouw rijk' : game.players[t.owner].name) : 'Niemand';
  const terrain = { grass: 'gras', forest: 'bos', mountain: 'berg' }[t.terrain];
  let text = `<b>${ownerName}</b> · ${terrain}`;
  if (t.building) text += ` · ${BUILDINGS[t.building].name.toLowerCase()}`;
  if (t.unit) text += ` · ${UNITS[t.unit.type].name.toLowerCase()}`;
  text += ` · verdediging <b>${defenseOf(t)}</b>`;
  if (t.owner === 0 && t.unit && t.unit.mp <= 0) text += ' · rust uit';
  info.innerHTML = text;
  if (t.owner !== 0 || busy) return;

  const color = game.players[0].color;
  if (!t.unit) {
    for (const [type, u] of Object.entries(UNITS)) {
      card(`<img src="${iconURL('unit', type, color)}" alt="">${u.name}<span class="cost">${coin}${u.cost}</span>`,
        canRecruit(game, 0, t, type), () => { recruit(game, 0, t, type); clearSelection(); refresh(); });
    }
  }
  if (!t.building) {
    if (t.terrain === 'grass') {
      card(`<img src="${iconURL('building', 'farm', color)}" alt="">Boerderij<span class="cost">${coin}${buildCost(game, 0, 'farm')}</span>`,
        canBuild(game, 0, t, 'farm'), () => { build(game, 0, t, 'farm'); clearSelection(); refresh(); });
    }
    card(`<img src="${iconURL('building', 'tower', color)}" alt="">Toren<span class="cost">${coin}${TOWER_COST}</span>`,
      canBuild(game, 0, t, 'tower'), () => { build(game, 0, t, 'tower'); clearSelection(); refresh(); });
  }
}

function readyUnits() {
  return [...game.tiles.values()].filter(t => t.owner === 0 && t.unit && t.unit.mp > 0)
    .filter(t => { const r = reachable(game, key(t.q, t.r)); return r.moves.size || r.attacks.size; });
}

function selectNextUnit() {
  const ready = readyUnits();
  if (!ready.length) { clearSelection(); refresh(); return; }
  const i = ready.findIndex(t => key(t.q, t.r) === ui.selected);
  const t = ready[(i + 1) % ready.length];
  select(key(t.q, t.r));
  sfx.select();
  refresh();
}

function capitalThreatened() {
  const cap = [...game.tiles.values()].find(t => t.owner === 0 && t.building === 'capital');
  if (!cap) return false;
  for (const t of game.tiles.values()) {
    if (!t.unit || t.owner <= 0) continue;
    const d = (Math.abs(t.q - cap.q) + Math.abs(t.r - cap.r) + Math.abs(t.q + t.r - cap.q - cap.r)) / 2;
    if (d <= 2 && UNITS[t.unit.type].str > defenseOf(cap)) return true;
  }
  return false;
}

function select(k) {
  const t = game.tiles.get(k);
  ui.selected = k;
  ui.moves = null; ui.attacks = null;
  if (t.owner === 0 && t.unit && t.unit.mp > 0) {
    const r = reachable(game, k);
    ui.moves = [...r.moves.keys()];
    ui.attacks = [...r.attacks.keys()];
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
      const u = game.tiles.get(k).unit;
      if (u && u.mp > 0) select(k); else clearSelection();
      refresh();
      if (game.winner) finish();
      return;
    }
  }
  // Een eigen eenheid is geselecteerd en je tikt op een ander vakje: leg uit waarom het niet kan.
  const sel = ui.selected && game.tiles.get(ui.selected);
  if (sel && sel.owner === 0 && sel.unit && sel.unit.mp > 0 && t.owner !== 0) {
    const why = whyNot(game, ui.selected, k);
    if (why) { toast(why); sfx.enemy(); return; }
  }
  if (t.owner === 0 && t.unit && t.unit.mp <= 0 && ui.selected !== k) {
    toast('Deze eenheid kan deze beurt niet meer lopen. Nieuwe eenheden lopen pas volgende beurt.');
  }
  if (ui.selected === k) clearSelection(); else { select(k); sfx.select(); }
  refresh();
}

// ---------- Beurten ----------

async function onEndTurn(auto = false) {
  if (!game) return;
  if (game.current !== 0) { // tijdens de beurt van de computer: versnellen
    speed = speed > 1 ? 1 : 3;
    refresh();
    return;
  }
  if (busy) return;
  busy = true;
  if (!auto) sfx.click();
  clearSelection();
  let events = endTurn(game);
  renderer.markDirty();
  refresh();
  while (game.current !== 0 && !game.winner) {
    const p = game.players[game.current];
    clock.opp = p;
    clock.oppElapsed = 0;
    showBanner(p.name, p.color);
    sfx.enemy();
    refresh();
    await sleep(700 / speed);
    for (const _ of aiTurn(game, game.current)) {
      refresh();
      await sleep(AI_DELAY / speed);
      if (game.winner) break;
    }
    if (game.winner) break;
    await sleep(250 / speed);
    events = endTurn(game);
    renderer.markDirty();
    refresh();
  }
  busy = false;
  speed = 1;
  resetClock();
  refresh();
  if (game.winner) return finish();
  showBanner('Jouw beurt', game.players[0].color);
  sfx.turn();
  events.forEach(toast);
  if (capitalThreatened()) {
    toast('Let op: je kasteel is in gevaar! Zet er een ridder op of naast.');
    sfx.alarm();
  }
}

async function finish() {
  const won = game.winner === 'win';
  const level = game.level;
  const stars = won ? starsFor(game) : 0;
  storage.update(s => {
    s.levelsPlayed++;
    if (won) s.stars[level.id] = Math.max(s.stars[level.id] || 0, stars);
  });
  if (won) {
    sfx.win();
    const mine = [...game.tiles.values()].filter(t => t.owner === 0);
    for (let i = 0; i < 8; i++) setTimeout(() => renderer.burst(mine[Math.floor(Math.random() * mine.length)], game.players[0].color, 24), i * 150);
  } else sfx.lose();
  await sleep(1300);
  await store.maybeShowInterstitial();
  const next = LEVELS[level.id];
  const nextLocked = next && next.premium && !store.owns('premium');
  const starHtml = `<div class="stars">${[0, 1, 2].map(i => `<span class="star ${i < stars ? 'on' : ''}"></span>`).join('')}</div>`;
  const stats = `<div class="statline"><span><b>${game.turn}</b> beurten</span><span><b>${fmt(clock.played)}</b> speeltijd</span><span><b>${game.stats.captured}</b> veroverd</span></div>`;
  modal(won
    ? `<h2>Gewonnen!</h2>${starHtml}${stats}
       <p style="text-align:center" class="small">3 sterren als je wint binnen ${level.par} beurten.</p>
       ${next ? `<button class="btn green big" data-next>${nextLocked ? 'Verder met Premium' : `Volgende: level ${next.id}`}</button>` : '<p><b>Je hebt alle levels uitgespeeld!</b></p>'}
       <button class="btn big" data-retry>Opnieuw voor meer sterren</button>
       <button class="btn big" data-menu>Menu</button>`
    : `<h2>Verloren</h2>${starHtml}${stats}
       <p class="small">Tip: zet een ridder op of naast je kasteel, en bouw boerderijen voor extra goud.</p>
       <button class="btn primary big" data-retry>Probeer opnieuw</button>
       <button class="btn big" data-menu>Menu</button>`,
  box => {
    const nb = box.querySelector('[data-next]');
    if (nb) nb.onclick = () => (nextLocked ? openShop('Speel level 11 t/m 30 met Premium.') : openBriefing(next));
    box.querySelector('[data-retry]').onclick = () => openBriefing(level);
    box.querySelector('[data-menu]').onclick = () => { closeModal(); game = null; show('screen-menu'); };
  });
}

function openPause() {
  sfx.click();
  modal(`<h2>Pauze</h2>
    <button class="btn primary big" data-close>Verder spelen</button>
    <button class="btn big" data-standings>Tussenstand</button>
    <button class="btn big" data-help>Uitleg</button>
    <button class="btn big" data-settings>Tijd en geluid</button>
    <button class="btn big" data-retry>Level opnieuw</button>
    <button class="btn big" data-menu>Stoppen</button>`, box => {
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelector('[data-standings]').onclick = openStandings;
    box.querySelector('[data-help]').onclick = () => openHelp();
    box.querySelector('[data-settings]').onclick = () => openSettings(true);
    box.querySelector('[data-retry]').onclick = () => openBriefing(game.level);
    box.querySelector('[data-menu]').onclick = () => { closeModal(); game = null; show('screen-menu'); };
  });
}

// ---------- Hoofdlus: tekenen en klok ----------

let last = performance.now();
let lastClockUi = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const inGame = game && $('#screen-game').classList.contains('active');
  if (inGame) {
    const running = !game.winner && !modalOpen() && !document.hidden;
    if (running) clock.played += dt;
    if (running && game.current === 0 && !busy && clock.max) {
      clock.left -= dt;
      const sec = Math.ceil(clock.left);
      if (sec <= 10 && sec < clock.lastTick && sec > 0) { clock.lastTick = sec; sfx.tick(); }
      if (clock.left <= 0) {
        clock.left = 0;
        toast('De tijd is om! Je beurt is voorbij.');
        onEndTurn(true);
      }
    }
    if (running && game.current !== 0) clock.oppElapsed += dt;
    renderer.draw(game, ui, now);
    if (now - lastClockUi > 100) { updateClocks(); lastClockUi = now; }
  } else if ($('#screen-menu').classList.contains('active') && menuRenderer) {
    menuRenderer.draw(menuGame, {}, now);
  }
  requestAnimationFrame(loop);
}

// ---------- Opstarten ----------

function init() {
  setSound(storage.load().sound);
  renderer = new Renderer($('#board'));
  menuRenderer = new Renderer($('#menu-bg'));
  menuGame = createGame(LEVELS[17]);
  menuGame.current = -1;
  $('#board').addEventListener('pointerup', onTap);
  $('#btn-end').onclick = () => onEndTurn(false);
  $('#btn-pause').onclick = () => !busy && openPause();
  $('#btn-standings').onclick = () => { sfx.click(); openStandings(); };
  $('#btn-sound').onclick = () => {
    storage.update(s => { s.sound = !s.sound; });
    setSound(storage.load().sound); updateSoundBtn(); sfx.click();
  };
  $('#btn-play').onclick = () => { sfx.click(); openBriefing(nextPlayableLevel()); };
  $('#btn-levels').onclick = () => { sfx.click(); show('screen-levels'); };
  $('#btn-shop').onclick = () => { sfx.click(); openShop(); };
  $('#btn-help').onclick = () => { sfx.click(); openHelp(); };
  $('#btn-settings').onclick = () => { sfx.click(); openSettings(); };
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { sfx.click(); show('screen-menu'); });
  window.addEventListener('resize', () => {
    if (game) { renderer.fit(game); refresh(); }
    menuRenderer.fit(menuGame);
  });
  updateSoundBtn();
  store.init().finally(refreshMenu);
  refreshMenu();
  menuRenderer.fit(menuGame);
  if (document.fonts) document.fonts.ready.then(() => { renderer.markDirty(); });
  requestAnimationFrame(loop);
}

init();

// Handig bij testen: window.__eilandrijk.game
window.__eilandrijk = { get game() { return game; }, get renderer() { return renderer; }, LEVELS, startLevel, aiTurn, endTurn };
