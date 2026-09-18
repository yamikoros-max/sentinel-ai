// Deterministic PRNG (mulberry32) — demo logs must replay identically every load.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick an integer in [min, max] inclusive. */
export function randInt(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

export function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

export function jitter(rnd: () => number, amount: number): number {
  return (rnd() * 2 - 1) * amount;
}
