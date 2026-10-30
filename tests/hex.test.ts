import { describe, expect, it } from 'vitest';
import { distance, hex, hexesInRange, hexRound, hexToPixel, key, neighbors, parseKey, pixelToHex } from '../src/hex';

describe('hex', () => {
  it('has six distinct neighbors at distance 1', () => {
    const ns = neighbors(hex(2, -1));
    expect(new Set(ns.map(key)).size).toBe(6);
    for (const n of ns) expect(distance(n, hex(2, -1))).toBe(1);
  });

  it('measures distance along axial axes', () => {
    expect(distance(hex(0, 0), hex(3, -3))).toBe(3);
    expect(distance(hex(-2, 1), hex(2, -1))).toBe(4);
  });

  it('round-trips hex -> pixel -> hex', () => {
    for (const h of hexesInRange(hex(0, 0), 5)) {
      expect(key(pixelToHex(hexToPixel(h, 28), 28))).toBe(key(h));
    }
  });

  it('counts hexes in range', () => {
    expect(hexesInRange(hex(0, 0), 2)).toHaveLength(19);
  });

  it('parses keys and avoids negative zero', () => {
    expect(parseKey('-3,4')).toEqual(hex(-3, 4));
    expect(key(hexRound(-0.1, 0.05))).toBe('0,0');
  });
});
