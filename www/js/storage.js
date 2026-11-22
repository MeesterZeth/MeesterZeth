// Voortgang lokaal bewaren. Werkt ook als opslag geblokkeerd is (dan alleen in het geheugen).
const KEY = 'eilandrijk.v1';
const DEFAULTS = { stars: {}, color: '#2f7de1', owned: [], levelsPlayed: 0, seenHelp: false, sound: true, turnTime: 60 };
let cache = null;

export function load() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* opslag niet beschikbaar */ }
}

export function update(fn) {
  fn(load());
  save();
}

export function reset() {
  const owned = load().owned; // aankopen blijven bewaard
  cache = { ...DEFAULTS, owned };
  save();
}
