import { afterEach, describe, expect, it, vi } from 'vitest';
import { place } from '../src/sim/actions';
import { capacity, store } from '../src/sim/storage';
import { LOT, trade, tradeError, updateTrade } from '../src/sim/trade';
import { tick, TICK } from '../src/sim/tick';
import { blockedReason } from '../src/sim/villagers';
import { hearth } from '../src/sim/world';
import { flatWorld, setGood, setGoods } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storage', () => {
  it('the hearth holds a base amount of each good, more as it is raised', () => {
    const w = flatWorld();
    hearth(w).tier = 0;
    expect(capacity(w, 'food')).toBe(100);
    expect(capacity(w, 'iron')).toBe(40);
    hearth(w).tier = 2;
    expect(capacity(w, 'wood')).toBe(200);
    expect(capacity(w, 'coin')).toBe(Infinity); // coin is a purse
  });

  it('connected stores add room; cut-off ones do not', () => {
    const w = flatWorld();
    const base = capacity(w, 'wood');
    place(w, 'road', '1,0');
    place(w, 'woodshed', '2,0');
    place(w, 'woodshed', '5,0'); // no road
    expect(capacity(w, 'wood')).toBe(base + 150);
    place(w, 'storehouse', '1,1');
    expect(capacity(w, 'wood')).toBe(base + 190);
    expect(capacity(w, 'iron')).toBe(capacity(flatWorld(), 'iron') + 20);
  });

  it('turns away what does not fit', () => {
    const w = flatWorld();
    setGood(w, 'stone', capacity(w, 'stone') - 5);
    expect(store(w, 'stone', 20)).toBe(5);
    expect(w.res.stone).toBe(capacity(w, 'stone'));
  });

  it('idles producers while their good is full', () => {
    const w = flatWorld(8, { '3,1': 'forest' });
    place(w, 'road', '1,0');
    place(w, 'road', '2,0', '1,0');
    const cutter = place(w, 'woodcutter', '3,0')!;
    setGood(w, 'wood', capacity(w, 'wood'));
    expect(blockedReason(w, cutter)).toBe('no room for wood at the hearth or storehouses');
    setGood(w, 'wood', 0);
    expect(blockedReason(w, cutter)).toBeNull();
  });

  it('dedicated stores only take their own good from haulers', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = flatWorld();
    w.terrain.set('3,1', 'forest');
    place(w, 'road', '1,0');
    place(w, 'road', '2,0', '1,0');
    place(w, 'granary', '1,1'); // closer to the woodcutter than the hearth is
    place(w, 'woodcutter', '3,0');
    setGood(w, 'wood', 0);
    for (let t = 0; t < 20; t += TICK) tick(w, TICK);
    expect(w.res.wood).toBeGreaterThan(0); // hauled past the granary to the hearth
  });
});

describe('trade', () => {
  const withCaravan = () => {
    const w = flatWorld();
    setGoods(w, { food: 50, wood: 50, stone: 50, iron: 0, coin: 500 });
    place(w, 'road', '1,0');
    place(w, 'market', '2,0');
    w.time = w.nextCaravan;
    updateTrade(w);
    return w;
  };

  it('needs a connected trading post for caravans to stop', () => {
    const w = flatWorld();
    w.time = w.nextCaravan;
    updateTrade(w);
    expect(w.caravan).toBeNull();
    expect(withCaravan().caravan).not.toBeNull();
  });

  it('buys and sells lots for coin, nudging prices', () => {
    const w = withCaravan();
    const c = w.caravan!;
    const coin = w.res.coin;
    const price = c.buy.stone;
    expect(trade(w, 'stone', 'buy')).toBe(true);
    expect(w.res.coin).toBe(coin - price);
    expect(c.buy.stone).toBeGreaterThan(price);

    const pay = c.sell.wood;
    const wood = w.res.wood;
    expect(trade(w, 'wood', 'sell')).toBe(true);
    expect(w.res.wood).toBe(wood - LOT);
    expect(w.res.coin).toBe(coin - price + pay);
  });

  it('refuses trades you cannot afford or store', () => {
    const w = withCaravan();
    setGood(w, 'coin', 0);
    expect(tradeError(w, 'food', 'buy')).toBe('Not enough coin');
    setGood(w, 'wood', 5);
    expect(tradeError(w, 'wood', 'sell')).toBe('Not enough wood');
    setGood(w, 'coin', 500);
    setGood(w, 'stone', capacity(w, 'stone'));
    expect(tradeError(w, 'stone', 'buy')).toBe('No room in your stores');
  });

  it('moves on after its stay', () => {
    const w = withCaravan();
    w.time = w.caravan!.leaves;
    updateTrade(w);
    expect(w.caravan).toBeNull();
    expect(w.nextCaravan).toBeGreaterThan(w.time);
  });
});
