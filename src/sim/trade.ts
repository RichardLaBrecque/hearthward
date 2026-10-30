// Caravans visit any connected trading post every few days and trade goods for coin.
import { isConnected } from './network';
import { room, store, take } from './storage';
import { calendar, DAY_LENGTH } from './seasons';
import type { Building, Caravan, TradeGood, World } from './types';
import { log } from './world';

export const TRADE_GOODS: readonly TradeGood[] = ['food', 'wood', 'stone', 'iron', 'plank'];
export const LOT = 10; // units per trade
const BASE_PRICE: Record<TradeGood, number> = { food: 10, wood: 10, stone: 20, iron: 45, plank: 25 }; // coin per lot
const SELL_RATIO = 0.6; // the trader pays this share of their asking price
const STAY = DAY_LENGTH * 2;
const GAP_MIN = DAY_LENGTH * 4;
const GAP_MAX = DAY_LENGTH * 7;
const BUY_DRIFT = 1.08; // each lot you buy makes the next dearer
const SELL_DRIFT = 0.93; // each lot you sell makes the next cheaper

const between = (a: number, b: number): number => a + Math.random() * (b - a);

export const tradingPost = (w: World): Building | undefined =>
  [...w.buildings.values()].find((b) => b.type === 'market' && isConnected(w, b.id) && b.fire === 0);

export function updateTrade(w: World): void {
  if (w.caravan && (w.time >= w.caravan.leaves || !tradingPost(w))) {
    w.caravan = null;
    w.nextCaravan = w.time + between(GAP_MIN, GAP_MAX);
    log(w, 'The caravan moves on.');
  }
  if (w.caravan || w.time < w.nextCaravan) return;
  if (!tradingPost(w)) {
    w.nextCaravan = w.time + DAY_LENGTH; // check again tomorrow
    return;
  }
  w.caravan = newCaravan(w);
  log(w, 'A caravan has arrived at the trading post!', 'warn');
}

function newCaravan(w: World): Caravan {
  const year = calendar(w.time).year;
  const buy = {} as Record<TradeGood, number>;
  const sell = {} as Record<TradeGood, number>;
  const stock = {} as Record<TradeGood, number>;
  for (const g of TRADE_GOODS) {
    buy[g] = Math.max(1, Math.round(BASE_PRICE[g] * between(0.7, 1.4)));
    sell[g] = Math.max(1, Math.floor(buy[g] * SELL_RATIO));
    stock[g] = LOT * Math.round(g === 'iron' ? between(1, 3) : between(3, 6)); // iron is scarce
  }
  return { leaves: w.time + STAY, buy, sell, stock, purse: 60 + 20 * year };
}

// Null on success, otherwise why the trade can't happen.
export function tradeError(w: World, good: TradeGood, dir: 'buy' | 'sell'): string | null {
  const c = w.caravan;
  if (!c) return 'No caravan';
  if (dir === 'buy') {
    if (c.stock[good] < LOT) return 'Sold out';
    if (w.res.coin < c.buy[good]) return 'Not enough coin';
    if (room(w, good) < LOT) return 'No room in your stores';
  } else {
    if (w.res[good] < LOT) return `Not enough ${good}`;
    if (c.purse < c.sell[good]) return 'Trader is out of coin';
  }
  return null;
}

export function trade(w: World, good: TradeGood, dir: 'buy' | 'sell'): boolean {
  if (tradeError(w, good, dir)) return false;
  const c = w.caravan!;
  const post = tradingPost(w)!.at;
  if (dir === 'buy') {
    w.res.coin -= c.buy[good];
    c.purse += c.buy[good];
    store(w, good, LOT, post);
    c.stock[good] -= LOT;
    c.buy[good] = Math.ceil(c.buy[good] * BUY_DRIFT);
  } else {
    w.res.coin += c.sell[good];
    c.purse -= c.sell[good];
    take(w, good, LOT, post);
    c.stock[good] += LOT;
    c.sell[good] = Math.max(1, Math.floor(c.sell[good] * SELL_DRIFT));
  }
  return true;
}
