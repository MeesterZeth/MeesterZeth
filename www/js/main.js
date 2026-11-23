// Schermen, bediening, timer, tussenstand, tutorial, opslaan en het aan elkaar knopen van alles.
import { key } from './hex.js';
import {
  LEVELS, UNITS, TOWER_COST, AD_BONUS_GOLD, DIFFICULTIES, createGame, reachable, moveUnit,
  recruit, build, canRecruit, canBuild, buildCost, economy, endTurn, defenseOf, starsFor, standings, whyNot,
  serialize, deserialize,
} from './game.js';
import { aiTurn } from './ai.js';
import { Renderer } from './render.js';
import { iconURL } from './sprites.js';
import { sfx, setEnabled as setSound, isEnabled as soundOn, setMusic, startMusic, stopMusic } from './sfx.js';
import * as ach from './achievements.js';
import { t, lang, setLang, applyStatic } from './i18n.js';
import * as storage from './storage.js';
import * as store from './store.js';

const $ = sel => document.querySelector(sel);
const AI_DELAY = 340;
const APP_VERSION = '1.0.1';

let game = null;
let renderer = null;
let menuRenderer = null;
let menuGame = null;
let ui = { selected: null, moves: null, attacks: null, defense: false, hint: null };
let busy = false;
let speed = 1;
let undoStack = [];
let tut = null; // { step } tijdens de tutorial
let lostThisRound = [];
const clock = { left: 0, max: 0, lastTick: 0, opp: null, oppElapsed: 0, played: 0 };

// ---------- Hulpjes ----------

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = sec => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const coin = '<i class="coin"></i>';
const modalOpen = () => !$('#modal').classList.contains('hidden');
const unitName = type => t('unit.' + type);
const playerName = p => (p.human ? t('p.you') : t(p.nameKey || 'ai.0'));
const settings = () => storage.load();
const difficulty = () => (settings().difficulty in DIFFICULTIES ? settings().difficulty : 'normal');

// Trillen: via de Capacitor-plugin op iPhone, anders via de browser.
function buzz(heavy = false) {
  store.haptic(heavy);
}

function award(id) {
  if (!ach.unlock(id)) return;
  const el = $('#achv');
  $('#achv-text').textContent = t('ach.unlocked', { name: t(`ach.${id}.name`) });
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  setTimeout(() => sfx.coin(), 200);
}

function openAchievements() {
  const items = ach.ACHIEVEMENTS.map(id => {
    const got = ach.has(id);
    return `<div class="ach ${got ? 'got' : ''}"><span class="ach-icon">${got ? '★' : '?'}</span>
      <div><b>${t(`ach.${id}.name`)}</b><p>${t(`ach.${id}.desc`)}</p></div></div>`;
  }).join('');
  modal(`<h2>${t('ach.title')}</h2><p style="text-align:center" class="small">${ach.count()} / ${ach.ACHIEVEMENTS.length}</p>${items}
    <button class="btn primary big" data-close>${t('common.close')}</button>`,
  box => box.querySelector('[data-close]').onclick = closeModal);
}

// Melding uit de spelregels ({ key, params }) omzetten naar tekst.
function msg(ev) {
  if (!ev) return '';
  if (typeof ev === 'string') return ev;
  const p = { ...(ev.params || {}) };
  if (ev.key === 'ev.eliminated' && game.players[p.winner].human) ev = { key: 'ev.youDefeated' };
  if (p.unit) p.unit = unitName(p.unit).toLowerCase();
  if (p.loser !== undefined) p.loser = playerName(game.players[p.loser]);
  if (p.winner !== undefined) p.winner = playerName(game.players[p.winner]);
  return t(ev.key, p);
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-menu') refreshMenu();
  if (id === 'screen-levels') renderLevels();
}

function totalStars() {
  return Object.values(settings().stars).reduce((a, b) => a + b, 0);
}

function refreshMenu() {
  applyStatic();
  const s = totalStars();
  $('#menu-stars').textContent = s ? t('menu.stars', { n: s, max: LEVELS.length * 3 }) : '';
  $('#play-sub').textContent = t('menu.level', { n: nextPlayableLevel().id }) + ' · ' + t('diff.' + difficulty());
  const save = loadSave();
  $('#btn-continue').hidden = !save;
  if (save) $('#continue-sub').textContent = t('menu.resume', { level: save.levelId, turn: save.turn });
  $('#btn-lang').innerHTML = lang() === 'nl' ? '<b>NL</b> · EN' : 'NL · <b>EN</b>';
  if (menuRenderer) requestAnimationFrame(() => menuRenderer.fit(menuGame));
}

function isUnlocked(level) {
  if (level.premium && !store.owns('premium')) return false;
  if (level.id === 1) return true;
  return !!settings().stars[level.id - 1];
}

function nextPlayableLevel() {
  return LEVELS.find(l => isUnlocked(l) && !settings().stars[l.id]) || LEVELS.filter(isUnlocked).pop() || LEVELS[0];
}

function starsRow(n) {
  return `<span class="stars-row">${[0, 1, 2].map(i => `<span class="${i < n ? 'on' : ''}">★</span>`).join('')}</span>`;
}

function renderLevels() {
  applyStatic();
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const st = settings();
  $('#levels-stars').textContent = `★ ${totalStars()}`;
  $('#btn-achv').innerHTML = `<span class="trophy"></span>${ach.count()}/${ach.ACHIEVEMENTS.length}`;
  for (const lv of LEVELS) {
    const b = document.createElement('button');
    const unlocked = isUnlocked(lv);
    const needsPremium = lv.premium && !store.owns('premium');
    const stars = st.stars[lv.id] || 0;
    const crown = st.crowns && st.crowns[lv.id];
    b.className = 'level' + (needsPremium ? ' premium' : !unlocked ? ' locked' : stars ? ' done' : '');
    b.innerHTML = needsPremium ? `${lv.id}<span class="stars-row">${t('levels.premium')}</span>`
      : unlocked ? `${lv.id}${starsRow(stars)}${crown ? '<span class="badge-crown">♛</span>' : ''}` : '<span class="lock"></span>';
    b.setAttribute('aria-label', t('menu.level', { n: lv.id }));
    b.onclick = () => {
      sfx.click();
      if (needsPremium) openShop(t('shop.premiumLevels'));
      else if (unlocked) openBriefing(lv);
      else infoModal(t('levels.locked'), t('levels.lockedText', { n: lv.id - 1 }));
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
  modal(`<h2>${title}</h2><p>${text}</p><button class="btn primary big" data-close>${t('common.ok')}</button>`,
    box => box.querySelector('[data-close]').onclick = closeModal);
}

function helpHtml() {
  const color = settings().color;
  const head = t('help.table').split('|').map(h => `<th>${h}</th>`).join('');
  const rows = Object.entries(UNITS).map(([ty, u]) =>
    `<tr><td><img src="${iconURL('unit', ty, color)}" alt=""> ${unitName(ty)}</td><td>${u.str}</td><td>${u.cost}</td><td>${u.upkeep}</td><td>${u.move}</td></tr>`).join('');
  const items = ['goal', 'gold', 'buy', 'walk', 'combat', 'upkeep', 'time', 'tools'].map(k => `<li>${t('help.' + k)}</li>`).join('');
  return `<h2>${t('help.title')}</h2><ul class="rules">${items}</ul>
    <div class="table-wrap"><table class="data-table"><tr>${head}</tr>${rows}</table></div>
    <button class="btn primary big" data-close>${t('help.ok')}</button>`;
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
  const testmode = store.isNative() ? '' : `<p class="testmode">${t('shop.testmode')}</p>`;
  const items = Object.entries(store.PRODUCTS).map(([k, p]) => {
    const owned = store.owns(k);
    return `<div class="product ${owned ? 'owned' : ''}">
      <img src="${PRODUCT_ICON[k]()}" alt="">
      <div><span class="display">${t(`prod.${k}.title`)}</span><p>${t(`prod.${k}.desc`)}</p></div>
      ${owned ? `<span class="check">${t('shop.owned')}</span>` : `<button class="btn gold" data-buy="${k}">${p.price}</button>`}
    </div>`;
  }).join('');
  modal(`<h2>${t('shop.title')}</h2>${reason ? `<p>${reason}</p>` : ''}${testmode}${items}
    <button class="btn big" data-restore>${t('shop.restore')}</button>
    <button class="btn primary big" data-close>${t('common.close')}</button>`, box => {
    box.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const ok = await store.purchase(b.dataset.buy);
      if (ok) sfx.win();
      openShop(ok ? t('shop.thanks') : reason);
      if ($('#screen-levels').classList.contains('active')) renderLevels();
    });
    box.querySelector('[data-restore]').onclick = async () => {
      const owned = await store.restore();
      openShop(owned.length ? t('shop.restored') : t('shop.nothing'));
    };
    box.querySelector('[data-close]').onclick = () => {
      closeModal();
      if ($('#screen-levels').classList.contains('active')) renderLevels();
      refreshMenu();
    };
  });
}

function seg(name, options, current) {
  return `<div class="seg">${options.map(([v, l]) => `<button data-${name}="${v}" class="${String(current) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

function openSettings(fromGame = false) {
  const s = settings();
  const hasPack = store.owns('colors');
  const swatches = store.COLORS.map(c => {
    const locked = c.pack && !hasPack;
    return `<button class="swatch ${s.color === c.value ? 'sel' : ''} ${locked ? 'locked' : ''}" style="background:${c.value}"
      data-color="${c.value}" data-locked="${locked}" aria-label="${c.name}"></button>`;
  }).join('');
  modal(`<h2>${t('set.title')}</h2>
    <span class="setting-label">${t('set.language')}</span>
    ${seg('lang', [['nl', 'Nederlands'], ['en', 'English']], lang())}
    ${fromGame ? '' : `<span class="setting-label">${t('set.difficulty')}</span>
    ${seg('diff', Object.keys(DIFFICULTIES).map(d => [d, t('diff.' + d)]), difficulty())}
    <p class="small">${t('diff.' + difficulty() + 'Desc')}</p>`}
    <span class="setting-label">${t('set.time')}</span>
    ${seg('time', [[0, t('set.off')], [30, '30s'], [60, '60s'], [90, '90s']], s.turnTime)}
    <span class="setting-label">${t('set.sound')}</span>
    ${seg('sound', [['1', t('set.on')], ['0', t('set.off')]], s.sound ? '1' : '0')}
    <span class="setting-label">${t('set.music')}</span>
    ${seg('music', [['1', t('set.on')], ['0', t('set.off')]], s.music !== false ? '1' : '0')}
    ${fromGame ? '' : `<span class="setting-label">${t('set.color')}</span><div class="colors">${swatches}</div>
    ${hasPack ? '' : `<p class="small">${t('set.colorsHint')}</p>`}
    ${store.privacyOptionsAvailable() ? `<button class="btn" data-adprivacy>${t('set.adPrivacy')}</button>` : ''}
    <button class="btn" data-reset>${t('set.reset')}</button>`}
    <p class="small">${t('set.privacy')} ${t('set.version', { v: APP_VERSION })}</p>
    <button class="btn primary big" data-close>${t('common.done')}</button>`, box => {
    box.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
      setLang(b.dataset.lang); sfx.click(); applyStatic(); if (game) refresh(); openSettings(fromGame);
    });
    box.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => {
      storage.update(st => { st.difficulty = b.dataset.diff; }); sfx.click(); openSettings(fromGame);
    });
    box.querySelectorAll('[data-music]').forEach(b => b.onclick = () => {
      storage.update(st => { st.music = b.dataset.music === '1'; });
      setMusic(settings().music); sfx.click(); openSettings(fromGame);
    });
    box.querySelectorAll('[data-time]').forEach(b => b.onclick = () => {
      storage.update(st => { st.turnTime = Number(b.dataset.time); });
      if (game && game.current === 0) resetClock();
      sfx.click(); openSettings(fromGame);
    });
    box.querySelectorAll('[data-sound]').forEach(b => b.onclick = () => {
      storage.update(st => { st.sound = b.dataset.sound === '1'; });
      setSound(settings().sound); updateSoundBtn(); sfx.click(); openSettings(fromGame);
    });
    box.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
      if (b.dataset.locked === 'true') return openShop(t('shop.colorsReason'));
      storage.update(st => { st.color = b.dataset.color; });
      sfx.select(); openSettings(fromGame);
    });
    const adp = box.querySelector('[data-adprivacy]');
    if (adp) adp.onclick = () => { sfx.click(); store.showPrivacyOptions(); };
    const reset = box.querySelector('[data-reset]');
    if (reset) reset.onclick = () => {
      if (reset.dataset.armed) { storage.reset(); openSettings(fromGame); return; }
      reset.dataset.armed = '1';
      reset.textContent = t('set.resetConfirm');
    };
    box.querySelector('[data-close]').onclick = () => { closeModal(); refreshMenu(); };
  });
}

// Nagespeelde reclame in de browser (in de app komt hier een echte advertentie).
store.setMockAdUI((seconds, rewarded) => new Promise(resolve => {
  let left = seconds;
  modal(`<h2>${t('ad.title')}</h2><p class="testmode">${t('ad.testmode')}</p>
    <div class="ad-box">AD</div><button class="btn big" disabled data-skip>${t('ad.wait', { n: left })}</button>`, box => {
    const btn = box.querySelector('[data-skip]');
    const timer = setInterval(() => {
      left--;
      if (left > 0) { btn.textContent = t('ad.wait', { n: left }); return; }
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = rewarded ? t('ad.reward') : t('common.close');
      btn.className = 'btn gold big';
      btn.onclick = () => { closeModal(); resolve(true); };
    }, 1000);
  });
}));

function openBriefing(level) {
  const premium = store.owns('premium');
  const tt = settings().turnTime;
  const d = difficulty();
  modal(`<h2>${t('menu.level', { n: level.id })}</h2>
    <div class="statline"><span><b>${level.opponents}</b> ${level.opponents === 1 ? t('brief.opp1') : t('brief.oppN')}</span><span><b>${tt ? tt + 's' : '∞'}</b> ${t('brief.perTurn')}</span></div>
    ${seg('diff', Object.keys(DIFFICULTIES).map(x => [x, t('diff.' + x)]), d)}
    <p class="small" style="text-align:center">${t('diff.' + d + 'Desc')}</p>
    <p style="text-align:center">${t('brief.par', { par: level.par })} ${level.id <= 3 ? t('brief.practice') : ''}
      ${d === 'master' ? '' : `<br><span class="small">${t('brief.masterWin')}</span>`}</p>
    ${premium ? `<p class="testmode">${t('brief.premiumBonus', { n: AD_BONUS_GOLD })}</p>` : ''}
    <button class="btn primary big" data-start>${t('common.start')}</button>
    ${premium ? '' : `<button class="btn gold big" data-ad>${t('brief.ad', { n: AD_BONUS_GOLD })}</button>`}
    <button class="btn big" data-close>${t('common.back')}</button>`, box => {
    box.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => {
      storage.update(st => { st.difficulty = b.dataset.diff; }); sfx.click(); openBriefing(level);
    });
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
  const st = standings(game);
  const head = t('stand.cols').split('|').map(h => `<th>${h}</th>`).join('');
  const rows = st.map((p, i) => `
    <tr class="${p.human ? 'me' : ''} ${p.alive ? '' : 'dead'}">
      <td class="rank">${p.alive ? i + 1 : '–'}</td>
      <td><span class="swatch-dot" style="background:${p.color}"></span>${playerName(game.players[p.id])}</td>
      <td>${p.tiles} <small class="small">(${p.pct}%)</small></td>
      <td>${p.units} <small class="small">/ ${p.strength}</small></td>
      <td>${p.income >= 0 ? '+' : ''}${p.income}</td>
    </tr>`).join('');
  const me = st.findIndex(p => p.human) + 1;
  modal(`<h2>${t('stand.title')}</h2>
    <p style="text-align:center">${t('stand.sub', { turn: game.turn, rank: me, n: game.players.length })}</p>
    <div class="table-wrap"><table class="data-table"><tr>${head}</tr>${rows}</table></div>
    <button class="btn primary big" data-close>${t('stand.continue')}</button>`,
  box => box.querySelector('[data-close]').onclick = closeModal);
}

// ---------- Opslaan ----------

function saveGame() {
  if (!game || game.winner || tut) return;
  storage.update(s => { s.save = { data: serialize(game), played: clock.played, left: clock.left }; });
}
function loadSave() {
  const sv = settings().save;
  if (!sv) return null;
  try { const d = JSON.parse(sv.data); return { levelId: d.levelId, turn: d.turn }; } catch { return null; }
}
function clearSave() { storage.update(s => { delete s.save; }); }

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
      if (ev.prev === 0 && ev.pid !== 0) lostThisRound.push(ev.to);
      if (ev.pid === 0 && ev.capital && to.unit && to.unit.type === 'catapult') award('siege');
      setTimeout(() => {
        renderer.burst(to, color, ev.prev >= 0 ? 22 : 10);
        const text = ev.capital ? '!!!' : ev.building === 'village' || ev.building === 'farm' ? '+3' : '+1';
        renderer.floatText(to, text, ev.capital ? '#ffd23f' : '#fff');
        if (ev.prev >= 0 || ev.killed) sfx.battle(); else sfx.capture();
        if (ev.prev === 0 || (ev.pid === 0 && ev.prev > 0)) buzz(ev.prev === 0 || ev.capital);
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
      if (ev.pid === 0 && [...g.tiles.values()].filter(x => x.owner === 0 && x.building === 'farm').length >= 5) award('economist');
    }
    if (tut && ev.pid === 0) tutOnEvent(ev);
  };
}

function enterGame(g) {
  game = g;
  attachEvents(game);
  ui = { selected: null, moves: null, attacks: null, defense: ui.defense, hint: null };
  busy = false;
  speed = 1;
  undoStack = [];
  clock.opp = game.players.find(p => !p.human) || null;
  clock.oppElapsed = 0;
  show('screen-game');
  applyStatic();
  renderer.fit(game);
  updateDefenseBtn();
}

function startLevel(level, bonusGold, withTutorial = false) {
  closeModal();
  sfx.click();
  tut = null;
  const g = createGame(level, { color: settings().color, bonusGold, difficulty: withTutorial ? 'normal' : difficulty() });
  enterGame(g);
  clock.played = 0;
  resetClock();
  refresh();
  if (withTutorial) { tutStart(); return; }
  saveGame();
  const go = () => { showBanner(t('banner.yourTurn'), game.players[0].color); sfx.turn(); };
  if (!settings().seenHelp) openHelp(go); else go();
  if (bonusGold) toast(t('toast.bonus', { n: bonusGold }));
  else if (!settings().seenZoom) {
    setTimeout(() => toast(t('toast.zoomTip')), 1800);
    storage.update(s => { s.seenZoom = true; });
  }
}

function resumeGame() {
  const sv = settings().save;
  const g = sv && deserialize(sv.data);
  if (!g) { clearSave(); refreshMenu(); return; }
  closeModal();
  tut = null;
  enterGame(g);
  clock.played = sv.played || 0;
  resetClock();
  if (sv.left && game.current === 0) clock.left = Math.min(clock.max, sv.left);
  refresh();
  if (game.current !== 0) runOpponents([]);
  else { showBanner(t('banner.yourTurn'), game.players[0].color); sfx.turn(); }
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
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
  clock.max = tut ? 0 : settings().turnTime;
  clock.left = clock.max;
  clock.lastTick = 99;
}

function updateSoundBtn() {
  $('#btn-sound').className = 'btn icon ' + (soundOn() ? 'sound-on' : 'sound-off');
}
function updateDefenseBtn() {
  $('#btn-defense').classList.toggle('on', !!ui.defense);
}

// ---------- Tutorial ----------

const TUT_MAX = 7;

function tutStart() {
  tut = { step: 0 };
  tutSet(1);
}

function tutSet(step) {
  if (!tut) return;
  tut.step = step;
  const box = $('#coach');
  box.hidden = false;
  $('#coach-text').innerHTML = t('tut.' + step);
  $('#coach-step').textContent = t('tut.step', { n: step, max: TUT_MAX });
  const next = $('#coach-next');
  next.hidden = !(step === 1 || step === 7);
  next.textContent = step === 7 ? t('common.done') : t('common.next');
  $('#coach-skip').hidden = step === 7;
  refresh();
}

function tutEnd() {
  tut = null;
  $('#coach').hidden = true;
  ui.hint = null;
  storage.update(s => { s.seenTutorial = true; s.seenHelp = true; });
  resetClock();
  saveGame();
  refresh();
}

function tutHints() {
  if (!tut || game.current !== 0) return null;
  const tiles = [...game.tiles.values()];
  switch (tut.step) {
    case 1: return tiles.filter(x => x.owner === 0 && x.building === 'capital').map(x => key(x.q, x.r));
    case 2: return tiles.filter(x => x.owner === 0 && x.unit && x.unit.mp > 0).map(x => key(x.q, x.r));
    case 3: return (ui.attacks || []).filter(k => game.tiles.get(k).owner < 0);
    case 4: return tiles.filter(x => x.owner === 0 && !x.unit && !x.building).slice(0, 3).map(x => key(x.q, x.r));
    default: return null;
  }
}

function tutOnEvent(ev) {
  if (tut.step === 3 && (ev.type === 'capture' || ev.type === 'claim' || ev.type === 'move')) setTimeout(() => tutSet(4), 400);
  if (tut.step === 5 && ev.type === 'recruit') setTimeout(() => tutSet(6), 300);
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

  const st = standings(game);
  const byId = [...st].sort((a, b) => a.id - b.id);
  $('#share-bar').innerHTML = byId.filter(p => p.alive).map(p =>
    `<span style="width:${p.pct}%;background:${p.color}"></span>`).join('');
  const rank = st.findIndex(p => p.human) + 1;
  const mine = st.find(p => p.human);
  $('#standings-label').innerHTML = `<span>${t('hud.standings', { rank, pct: mine.pct })}</span><span>${t('hud.view')}</span>`;

  $('#clock-me-dot').style.background = me.color;
  const endBtn = $('#btn-end');
  if (game.current === 0) {
    endBtn.textContent = t('btn.endTurn');
    endBtn.className = 'btn primary end' + (tut && tut.step === 6 ? ' pulse-target' : '');
    endBtn.disabled = busy || !!(tut && tut.step < 6);
  } else {
    endBtn.textContent = speed > 1 ? t('btn.fast') : t('btn.speedUp');
    endBtn.className = 'btn end fast';
    endBtn.disabled = false;
  }
  const undo = $('#btn-undo');
  undo.hidden = !DIFFICULTIES[game.difficulty].undo || !!tut;
  undo.disabled = busy || game.current !== 0 || !undoStack.length;
  ui.hint = tutHints();
  renderPanel();
}

function updateClocks() {
  if (!game) return;
  const mineActive = game.current === 0 && !game.winner;
  const me = $('#clock-me');
  me.classList.toggle('active', mineActive);
  me.classList.toggle('warn', !!(mineActive && clock.max && clock.left <= 10));
  $('#clock-me-time').textContent = clock.max ? fmt(clock.left) : '∞';
  $('#clock-me-bar').style.width = clock.max ? `${(clock.left / clock.max) * 100}%` : '100%';
  const opp = $('#clock-opp');
  opp.classList.toggle('active', !mineActive && !game.winner);
  if (clock.opp) {
    $('#clock-opp-dot').style.background = clock.opp.color;
    $('#clock-opp-name').textContent = playerName(clock.opp);
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

function legend() {
  return `<span class="legend"><i style="background:#fff"></i>${t('panel.legendWalk')}</span>
    <span class="legend"><i style="background:#ffd60a"></i>${t('panel.legendClaim')}</span>
    <span class="legend"><i style="background:#ff3b30"></i>${t('panel.legendAttack')}</span>`;
}

function renderPanel() {
  const info = $('#panel-info');
  $('#panel-actions').innerHTML = '';
  if (game.current !== 0) {
    info.innerHTML = t('panel.opponent', { name: playerName(game.players[game.current]) });
    return;
  }
  if (!ui.selected) {
    const ready = readyUnits();
    info.innerHTML = ready.length === 1 ? t('panel.ready1') : ready.length ? t('panel.readyN', { n: ready.length }) : t('panel.idle');
    if (!busy && ready.length && !(tut && tut.step < 6)) card('👣 ' + t('btn.nextUnit'), true, selectNextUnit, 'wide');
    return;
  }
  const tile = game.tiles.get(ui.selected);
  if (tile.owner === 0 && tile.unit && ui.moves && (ui.moves.length || ui.attacks.length)) {
    info.innerHTML = `<b>${unitName(tile.unit.type)}</b> · ${t('panel.steps', { n: tile.unit.mp })}<br>${legend()}`;
    if (!tut) card('👣 ' + t('btn.nextUnit'), true, selectNextUnit, 'wide');
    return;
  }
  const ownerName = tile.owner >= 0 ? (tile.owner === 0 ? t('p.yourEmpire') : playerName(game.players[tile.owner])) : t('p.nobody');
  let text = `<b>${ownerName}</b> · ${t('ter.' + tile.terrain)}`;
  if (tile.building) text += ` · ${t('bld.' + tile.building).toLowerCase()}`;
  if (tile.unit) text += ` · ${unitName(tile.unit.type).toLowerCase()}`;
  text += ` · ${t('panel.defense')} <b>${defenseOf(tile)}</b>`;
  if (tile.owner === 0 && tile.unit && tile.unit.mp <= 0) text += ` · ${t('panel.resting')}`;
  info.innerHTML = text;
  if (tile.owner !== 0 || busy) return;
  if (tut && tut.step === 4 && !tile.unit) setTimeout(() => tutSet(5), 0);

  const color = game.players[0].color;
  if (!tile.unit) {
    for (const [type, u] of Object.entries(UNITS)) {
      const c = card(`<img src="${iconURL('unit', type, color)}" alt="">${unitName(type)}<span class="cost">${coin}${u.cost}</span>`,
        canRecruit(game, 0, tile, type), () => act(() => recruit(game, 0, tile, type)));
      if (tut && tut.step === 5 && type === 'scout') c.classList.add('pulse-target');
    }
  }
  if (!tile.building && !tut) {
    if (tile.terrain === 'grass') {
      card(`<img src="${iconURL('building', 'farm', color)}" alt="">${t('bld.farm')}<span class="cost">${coin}${buildCost(game, 0, 'farm')}</span>`,
        canBuild(game, 0, tile, 'farm'), () => act(() => build(game, 0, tile, 'farm')));
    }
    card(`<img src="${iconURL('building', 'tower', color)}" alt="">${t('bld.tower')}<span class="cost">${coin}${TOWER_COST}</span>`,
      canBuild(game, 0, tile, 'tower'), () => act(() => build(game, 0, tile, 'tower')));
  }
}

// Een actie van de speler: eerst een momentopname voor "zet terug", daarna uitvoeren en opslaan.
function act(fn) {
  const snap = serialize(game);
  const ok = fn();
  if (ok === false) return false;
  undoStack.push(snap);
  if (undoStack.length > 30) undoStack.shift();
  clearSelection();
  refresh();
  saveGame();
  return ok;
}

function undo() {
  if (!undoStack.length || busy || game.current !== 0) return;
  if (!DIFFICULTIES[game.difficulty].undo) { toast(t('toast.noUndoMaster')); return; }
  const g = deserialize(undoStack.pop());
  if (!g) return;
  g.players[0].color = game.players[0].color;
  game = g;
  attachEvents(game);
  renderer.state = game;
  renderer.markDirty();
  clearSelection();
  sfx.select();
  toast(t('toast.undone'));
  refresh();
  saveGame();
}

function readyUnits() {
  return [...game.tiles.values()].filter(x => x.owner === 0 && x.unit && x.unit.mp > 0)
    .filter(x => { const r = reachable(game, key(x.q, x.r)); return r.moves.size || r.attacks.size; });
}

function selectNextUnit() {
  const ready = readyUnits();
  if (!ready.length) { clearSelection(); refresh(); return; }
  const i = ready.findIndex(x => key(x.q, x.r) === ui.selected);
  const u = ready[(i + 1) % ready.length];
  select(key(u.q, u.r));
  if (renderer.zoom > 1) {
    const c = renderer.center(u);
    renderer.panBy(renderer.w / 2 - c.x, renderer.h / 2 - c.y);
  }
  sfx.select();
  refresh();
}

function capitalThreatened() {
  const cap = [...game.tiles.values()].find(x => x.owner === 0 && x.building === 'capital');
  if (!cap) return false;
  for (const x of game.tiles.values()) {
    if (!x.unit || x.owner <= 0) continue;
    const d = (Math.abs(x.q - cap.q) + Math.abs(x.r - cap.r) + Math.abs(x.q + x.r - cap.q - cap.r)) / 2;
    if (d <= 2 && UNITS[x.unit.type].str > defenseOf(cap)) return true;
  }
  return false;
}

function select(k) {
  const tile = game.tiles.get(k);
  ui.selected = k;
  ui.moves = null; ui.attacks = null;
  if (tile.owner === 0 && tile.unit && tile.unit.mp > 0) {
    const r = reachable(game, k);
    ui.moves = [...r.moves.keys()];
    ui.attacks = [...r.attacks.keys()];
    if (tut && tut.step === 2) setTimeout(() => tutSet(3), 0);
  }
}

// Welk vakje bedoelde de speler? Niet exact raken is ook goed.
function smartPick(x, y) {
  const exact = renderer.pick(x, y);
  if (ui.selected && (ui.moves || ui.attacks)) {
    const targets = [...(ui.moves || []), ...(ui.attacks || []), ui.selected];
    if (targets.includes(exact)) return exact;
    const near = renderer.pickNear(x, y, targets, game, 1.05);
    if (near) return near;
  }
  const ready = readyUnits().map(u => key(u.q, u.r));
  if (ready.includes(exact)) return exact;
  const near = renderer.pickNear(x, y, ready, game, 0.85);
  if (near) return near;
  return exact;
}

function onTap(ev) {
  if (!game || busy || game.current !== 0 || game.winner) return;
  if (tut && tut.step === 1) return;
  const k = smartPick(ev.clientX, ev.clientY);
  const tile = game.tiles.get(k);
  if (!tile || tile.terrain === 'water') { clearSelection(); refresh(); return; }

  const isMove = ui.moves && ui.moves.includes(k);
  const isAttack = ui.attacks && ui.attacks.includes(k);
  if (ui.selected && (isMove || isAttack)) {
    const from = ui.selected;
    let res = null;
    act(() => { res = moveUnit(game, from, k); return res.ok; });
    if (res && res.ok) {
      res.events.forEach(e => toast(msg(e)));
      const u = game.tiles.get(k).unit;
      if (u && u.mp > 0) select(k); else clearSelection();
      refresh();
      if (game.winner) finish();
      return;
    }
  }
  const sel = ui.selected && game.tiles.get(ui.selected);
  if (sel && sel.owner === 0 && sel.unit && sel.unit.mp > 0 && tile.owner !== 0) {
    const why = whyNot(game, ui.selected, k);
    if (why) { toast(msg(why)); sfx.enemy(); return; }
  }
  if (tile.owner === 0 && tile.unit && tile.unit.mp <= 0 && ui.selected !== k) toast(t('why.tired'));
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
  if (!auto) sfx.click();
  clearSelection();
  undoStack = [];
  ui.lost = null;
  if (tut && tut.step === 6) $('#coach').hidden = true;
  const events = endTurn(game);
  renderer.markDirty();
  saveGame();
  await runOpponents(events);
}

async function runOpponents(events) {
  busy = true;
  lostThisRound = [];
  ui.lost = null;
  refresh();
  while (game.current !== 0 && !game.winner) {
    const p = game.players[game.current];
    clock.opp = p;
    clock.oppElapsed = 0;
    showBanner(playerName(p), p.color);
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
    saveGame();
    refresh();
  }
  busy = false;
  speed = 1;
  resetClock();
  refresh();
  if (game.winner) return finish();
  showBanner(t('banner.yourTurn'), game.players[0].color);
  sfx.turn();
  saveGame();
  if (tut && tut.step === 6) { tutSet(7); return; }
  events.forEach(e => toast(msg(e)));
  const lost = [...new Set(lostThisRound)].filter(k => game.tiles.get(k).owner !== 0);
  if (lost.length) {
    ui.lost = lost;
    toast(lost.length === 1 ? t('recap.lost1') : t('recap.lostN', { n: lost.length }));
  }
  if (capitalThreatened()) { toast(t('toast.threat')); sfx.alarm(); }
}

async function finish() {
  const won = game.winner === 'win';
  const level = game.level;
  const stars = won ? starsFor(game) : 0;
  const master = won && game.difficulty === 'master';
  clearSave();
  if (tut) { tut = null; $('#coach').hidden = true; storage.update(s => { s.seenTutorial = true; }); }
  storage.update(s => {
    s.levelsPlayed++;
    if (won) s.stars[level.id] = Math.max(s.stars[level.id] || 0, stars);
    if (master) { s.crowns = s.crowns || {}; s.crowns[level.id] = true; }
  });
  if (won) {
    award('first_win');
    if (stars === 3) award('three_stars');
    if (game.turn <= 10) award('blitz');
    if (game.stats.lost === 0) award('untouchable');
    if (master) award('master');
    if (LEVELS.slice(0, 10).every(l => settings().stars[l.id])) award('ruler');
    sfx.win();
    const mine = [...game.tiles.values()].filter(x => x.owner === 0);
    for (let i = 0; i < 8; i++) setTimeout(() => renderer.burst(mine[Math.floor(Math.random() * mine.length)], game.players[0].color, 24), i * 150);
  } else sfx.lose();
  await sleep(1300);
  await store.maybeShowInterstitial();
  const next = LEVELS[level.id];
  const nextLocked = next && next.premium && !store.owns('premium');
  const starHtml = `<div class="stars">${[0, 1, 2].map(i => `<span class="star ${i < stars ? 'on' : ''}"></span>`).join('')}</div>`;
  const stats = `<div class="statline"><span><b>${game.turn}</b> ${t('end.turns')}</span><span><b>${fmt(clock.played)}</b> ${t('end.time')}</span><span><b>${game.stats.captured}</b> ${t('end.captured')}</span></div>`;
  modal(won
    ? `<h2>${t('end.won')}</h2>${starHtml}${stats}
       ${master ? `<p class="testmode" style="text-align:center">♛ ${t('end.masterCrown')}</p>` : ''}
       <p style="text-align:center" class="small">${t('end.parHint', { par: level.par })}</p>
       ${next ? `<button class="btn green big" data-next>${nextLocked ? t('end.nextPremium') : t('end.next', { n: next.id })}</button>` : `<p><b>${t('end.allDone')}</b></p>`}
       <button class="btn big" data-retry>${t('end.retryStars')}</button>
       <button class="btn big" data-menu>${t('end.menu')}</button>`
    : `<h2>${t('end.lost')}</h2>${starHtml}${stats}
       <p class="small">${t('end.tip')}</p>
       <button class="btn primary big" data-retry>${t('end.retry')}</button>
       <button class="btn big" data-menu>${t('end.menu')}</button>`,
  box => {
    const nb = box.querySelector('[data-next]');
    if (nb) nb.onclick = () => (nextLocked ? openShop(t('end.premiumNext')) : openBriefing(next));
    box.querySelector('[data-retry]').onclick = () => openBriefing(level);
    box.querySelector('[data-menu]').onclick = () => { closeModal(); game = null; show('screen-menu'); };
  });
}

function openPause() {
  sfx.click();
  modal(`<h2>${t('pause.title')}</h2>
    <button class="btn primary big" data-close>${t('pause.resume')}</button>
    <button class="btn big" data-standings>${t('pause.standings')}</button>
    <button class="btn big" data-help>${t('pause.help')}</button>
    <button class="btn big" data-settings>${t('pause.settings')}</button>
    <button class="btn big" data-retry>${t('pause.restart')}</button>
    <button class="btn big" data-menu>${t('pause.quit')}</button>`, box => {
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelector('[data-standings]').onclick = openStandings;
    box.querySelector('[data-help]').onclick = () => openHelp();
    box.querySelector('[data-settings]').onclick = () => openSettings(true);
    box.querySelector('[data-retry]').onclick = () => openBriefing(game.level);
    box.querySelector('[data-menu]').onclick = () => {
      saveGame(); closeModal();
      if (tut) { tut = null; $('#coach').hidden = true; }
      game = null; show('screen-menu');
    };
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
        toast(t('toast.timeUp'));
        onEndTurn(true);
      }
    }
    if (running && game.current !== 0) clock.oppElapsed += dt;
    if (renderer.sizeChanged()) renderer.fit(game, true);
    renderer.draw(game, ui, now);
    if (now - lastClockUi > 100) { updateClocks(); lastClockUi = now; }
  } else if ($('#screen-menu').classList.contains('active') && menuRenderer) {
    if (menuRenderer.sizeChanged()) menuRenderer.fit(menuGame);
    menuRenderer.draw(menuGame, {}, now);
  }
  requestAnimationFrame(loop);
}

// ---------- Vingers: tikken, slepen en knijpen ----------

function setupGestures(canvas) {
  const pts = new Map();
  let start = null;
  let moved = false;
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* niet erg */ }
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { moved = false; start = { ...local(e), last: local(e) }; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      start = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: renderer.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      moved = true;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !start) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size >= 2 && start.dist) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      renderer.zoomAt(start.zoom * dist / start.dist, start.mid.x, start.mid.y);
      renderer.panBy(mid.x - start.mid.x, mid.y - start.mid.y);
      start.mid = mid;
      start.zoom = renderer.zoom; start.dist = dist;
    } else if (pts.size === 1 && start.last) {
      if (Math.hypot(p.x - start.x, p.y - start.y) > 12) moved = true;
      if (moved) renderer.panBy(p.x - start.last.x, p.y - start.last.y);
      start.last = p;
    }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (!moved && e.type === 'pointerup') onTap(e);
      start = null;
    } else if (pts.size === 1) {
      const p = [...pts.values()][0];
      start = { x: p.x, y: p.y, last: p };
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const p = local(e);
    renderer.zoomAt(renderer.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y);
  }, { passive: false });
}

// ---------- Opstarten ----------

function init() {
  setSound(settings().sound);
  setMusic(false);
  const firstTouch = () => { setMusic(settings().music !== false); };
  window.addEventListener('pointerdown', firstTouch, { once: true });
  applyStatic();
  renderer = new Renderer($('#board'));
  menuRenderer = new Renderer($('#menu-bg'));
  menuGame = createGame(LEVELS[17]);
  menuGame.current = -1;
  setupGestures($('#board'));
  $('#zoom-in').onclick = () => {
    const focus = (ui.selected && game.tiles.get(ui.selected))
      || [...game.tiles.values()].find(x => x.owner === 0 && x.building === 'capital');
    const c = focus ? renderer.center(focus) : { x: renderer.w / 2, y: renderer.h / 2 };
    renderer.zoomAt(renderer.zoom * 1.4, c.x, c.y);
    renderer.panBy(renderer.w / 2 - c.x, renderer.h / 2 - c.y);
    sfx.click();
  };
  $('#zoom-out').onclick = () => { renderer.zoomAt(renderer.zoom / 1.4, renderer.w / 2, renderer.h / 2); sfx.click(); };
  $('#btn-defense').onclick = () => {
    ui.defense = !ui.defense; updateDefenseBtn(); sfx.click();
    toast(ui.defense ? t('toast.defOn') : t('toast.defOff'));
  };
  $('#btn-undo').onclick = undo;
  $('#coach-next').onclick = () => { sfx.click(); if (tut.step === 7) tutEnd(); else tutSet(tut.step + 1); };
  $('#coach-skip').onclick = () => { sfx.click(); tutEnd(); };
  $('#btn-end').onclick = () => onEndTurn(false);
  $('#btn-pause').onclick = () => !busy && openPause();
  $('#btn-standings').onclick = () => { sfx.click(); openStandings(); };
  $('#btn-sound').onclick = () => {
    storage.update(s => { s.sound = !s.sound; });
    setSound(settings().sound); updateSoundBtn(); sfx.click();
  };
  $('#btn-lang').onclick = () => { setLang(lang() === 'nl' ? 'en' : 'nl'); sfx.click(); refreshMenu(); };
  $('#btn-continue').onclick = () => { sfx.click(); resumeGame(); };
  $('#btn-play').onclick = () => {
    sfx.click();
    const lv = nextPlayableLevel();
    if (lv.id === 1 && !settings().seenTutorial) startLevel(LEVELS[0], 0, true);
    else openBriefing(lv);
  };
  $('#btn-achv').onclick = () => { sfx.click(); openAchievements(); };
  $('#btn-tutorial').onclick = () => startLevel(LEVELS[0], 0, true);
  $('#btn-levels').onclick = () => { sfx.click(); show('screen-levels'); };
  $('#btn-shop').onclick = () => { sfx.click(); openShop(); };
  $('#btn-help').onclick = () => { sfx.click(); openHelp(); };
  $('#btn-settings').onclick = () => { sfx.click(); openSettings(); };
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { sfx.click(); show('screen-menu'); });
  window.addEventListener('resize', () => {
    if (game) { renderer.fit(game); refresh(); }
    menuRenderer.fit(menuGame);
  });
  // App naar de achtergrond (telefoon gaat, andere app): opslaan en pauzeren.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMusic(); else if (settings().music !== false) startMusic();
    if (!document.hidden || !game) return;
    saveGame();
    if (game.current === 0 && !busy && !game.winner && !modalOpen() && !tut) openPause();
  });
  window.addEventListener('pagehide', saveGame);
  updateSoundBtn();
  store.init().finally(refreshMenu);
  refreshMenu();
  menuRenderer.fit(menuGame);
  if (document.fonts) document.fonts.ready.then(() => { renderer.markDirty(); });
  requestAnimationFrame(loop);
}

init();

// Handig bij testen: window.__eilandrijk.game
window.__eilandrijk = { get game() { return game; }, get renderer() { return renderer; }, get tut() { return tut; }, get ui() { return ui; }, LEVELS, startLevel, aiTurn, endTurn };
