// Pointy-top hexes in axial coordinates (q, r). Hexes are keyed by "q,r" strings
// so they can live in Maps/Sets and serialize cleanly.

export type Hex = { readonly q: number; readonly r: number };
export type Point = { readonly x: number; readonly y: number };

export const hex = (q: number, r: number): Hex => ({ q, r });

// 0=E, 1=SE, 2=SW, 3=W, 4=NW, 5=NE
export const DIRECTIONS: readonly Hex[] = [hex(1, 0), hex(0, 1), hex(-1, 1), hex(-1, 0), hex(0, -1), hex(1, -1)];

const SQRT3 = Math.sqrt(3);

export const key = (h: Hex): string => `${h.q},${h.r}`;

export function parseKey(k: string): Hex {
  const [q, r] = k.split(',').map(Number);
  return hex(q, r);
}

export const neighbors = (h: Hex): Hex[] => DIRECTIONS.map((d) => hex(h.q + d.q, h.r + d.r));

export const neighborKeys = (k: string): string[] => neighbors(parseKey(k)).map(key);

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const keyDistance = (a: string, b: string): number => distance(parseKey(a), parseKey(b));

// Every hex within `radius` of `center`, including the center.
export function hexesInRange(center: Hex, radius: number): Hex[] {
  const result: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) result.push(hex(center.q + q, center.r + r));
  }
  return result;
}

export function hexToPixel(h: Hex, size: number): Point {
  return { x: size * SQRT3 * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

export function pixelToHex(p: Point, size: number): Hex {
  const q = ((SQRT3 / 3) * p.x - p.y / 3) / size;
  const r = ((2 / 3) * p.y) / size;
  return hexRound(q, r);
}

// Round fractional axial coordinates to the containing hex (via cube rounding).
export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return hex(rq + 0, rr + 0); // + 0 turns -0 into 0
}

// Hexes on the straight line from a to b, both ends included.
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b);
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    // A tiny nudge keeps points on hex edges from rounding inconsistently.
    out.push(hexRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6));
  }
  return out;
}

export function hexCorners(center: Point, size: number): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
  }
  return corners;
}
