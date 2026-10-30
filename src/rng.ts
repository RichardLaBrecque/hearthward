// Seeded randomness for map generation. Runtime events use Math.random — they don't
// need to be reproducible and that keeps RNG state out of save files.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable hash of (seed, x, y) into [0, 1).
export function hash2(seed: number, x: number, y: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(x, 0x27d4eb2d), 0xc2b2ae35);
  h = Math.imul(h ^ Math.imul(y, 0x165667b1), 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
