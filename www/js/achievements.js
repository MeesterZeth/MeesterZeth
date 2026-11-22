// Prestaties: extra uitdagingen voor strategiefans.
import * as storage from './storage.js';

export const ACHIEVEMENTS = ['first_win', 'three_stars', 'blitz', 'untouchable', 'economist', 'siege', 'master', 'ruler'];

export function has(id) {
  const a = storage.load().achievements;
  return !!(a && a[id]);
}

// Geeft true terug als de prestatie nieuw is.
export function unlock(id) {
  if (has(id)) return false;
  storage.update(s => { s.achievements = { ...(s.achievements || {}), [id]: Date.now() }; });
  return true;
}

export function count() {
  return ACHIEVEMENTS.filter(has).length;
}
