// Geluidseffecten, gemaakt met de Web Audio API (geen geluidsbestanden nodig).
let ctx = null;
let enabled = true;

export function setEnabled(v) { enabled = v; }
export function isEnabled() { return enabled; }

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { dur = 0.12, type = 'sine', vol = 0.12, to = null, delay = 0, attack = 0.005 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.08, delay = 0, freq = 900 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  click: () => tone(660, { dur: 0.06, type: 'triangle', vol: 0.08 }),
  select: () => tone(520, { dur: 0.09, type: 'triangle', vol: 0.1, to: 780 }),
  move: () => noise({ dur: 0.12, vol: 0.06, freq: 600 }),
  capture: () => { tone(440, { dur: 0.1, type: 'square', vol: 0.05 }); tone(660, { dur: 0.16, type: 'square', vol: 0.05, delay: 0.08 }); },
  battle: () => { noise({ dur: 0.22, vol: 0.14, freq: 1800 }); tone(180, { dur: 0.2, type: 'sawtooth', vol: 0.06, to: 90 }); },
  coin: () => { tone(988, { dur: 0.08, type: 'square', vol: 0.05 }); tone(1319, { dur: 0.18, type: 'square', vol: 0.05, delay: 0.07 }); },
  build: () => { noise({ dur: 0.08, vol: 0.1, freq: 300 }); noise({ dur: 0.08, vol: 0.1, freq: 300, delay: 0.12 }); },
  turn: () => { tone(523, { dur: 0.14, type: 'triangle' }); tone(659, { dur: 0.14, type: 'triangle', delay: 0.1 }); tone(784, { dur: 0.25, type: 'triangle', delay: 0.2 }); },
  enemy: () => tone(220, { dur: 0.25, type: 'triangle', vol: 0.08, to: 180 }),
  tick: () => tone(1200, { dur: 0.04, type: 'square', vol: 0.04 }),
  alarm: () => { tone(880, { dur: 0.12, type: 'square', vol: 0.06 }); tone(880, { dur: 0.12, type: 'square', vol: 0.06, delay: 0.18 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.3, type: 'triangle', vol: 0.12, delay: i * 0.13 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, { dur: 0.35, type: 'triangle', vol: 0.1, delay: i * 0.2 })),
};
