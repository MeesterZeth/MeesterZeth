// Hulpfuncties voor een hexagonaal speelveld (axiale coördinaten, "pointy-top").
export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]; // volgorde = randen van de hexagon

export const key = (q, r) => q + ',' + r;

export function neighborKeys(q, r) {
  return DIRS.map(([dq, dr]) => key(q + dq, r + dr));
}

export function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function toPixel(q, r, size) {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

export function fromPixel(x, y, size) {
  const q = (Math.sqrt(3) / 3 * x - y / 3) / size;
  const r = (2 / 3 * y) / size;
  return roundHex(q, r);
}

function roundHex(q, r) {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

// Voorspelbare toevalsgenerator: hetzelfde level geeft altijd dezelfde kaart.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
