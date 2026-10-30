// Barracks invite warriors to the hearth; warriors walk to their post, patrol its
// radius, and fight monsters that come within reach.
import { keyDistance } from '../hex';
import { engagedWith, ENGAGE_RANGE, MONSTER_STATS, warriorStats } from './combat';
import { advance, followRoute, greedyStep, onLand, setRoute } from './move';
import { isConnected } from './network';
import { take, takeFrom } from './storage';
import { findPath } from './path';
import type { Building, Monster, Warrior, World } from './types';
import { hearth, log, tierOf } from './world';

export const RECRUIT_INTERVAL = 15; // seconds between recruits per barracks
export const RECRUIT_FOOD = 10; // food to equip a newcomer
const WARRIOR_SPEED = 1.3;
const HEAL_RATE = 0.5; // hp per second while on post

export const warriorsOf = (w: World, b: Building): Warrior[] => w.warriors.filter((x) => x.barracks === b.id);

export function patrolRadius(b: Building): number {
  return tierOf(b).radius ?? 0;
}

export function updateMilitary(w: World, dt: number): void {
  if (Math.floor((w.time - dt) / RECRUIT_INTERVAL) !== Math.floor(w.time / RECRUIT_INTERVAL)) recruit(w);
  if (!w.warriors.length) return;

  for (const x of w.warriors) updateWarrior(w, x, dt);

  // Melee: each engaged monster strikes back at one of its attackers.
  for (const m of w.monsters) {
    const foes = engagedWith(w, m);
    if (foes.length) foes[0].hp -= MONSTER_STATS[m.kind].attack * dt;
  }

  const slain = w.monsters.filter((m) => m.hp <= 0);
  if (slain.length) {
    w.monsters = w.monsters.filter((m) => m.hp > 0);
    for (const m of slain) log(w, `Warriors slew a ${MONSTER_STATS[m.kind].name}.`);
    for (const x of w.warriors) if (slain.some((m) => m.id === x.target)) x.target = null;
  }
  const fallen = w.warriors.filter((x) => x.hp <= 0);
  if (fallen.length) {
    w.warriors = w.warriors.filter((x) => x.hp > 0);
    log(w, fallen.length > 1 ? `${fallen.length} warriors fell in battle.` : 'A warrior fell in battle.', 'bad');
  }
}

// One newcomer per under-strength barracks per interval, if there's food to spare.
function recruit(w: World): void {
  const home = hearth(w).at;
  for (const b of w.buildings.values()) {
    if (b.type !== 'barracks' || !isConnected(w, b.id) || b.fire > 0) continue;
    if (warriorsOf(w, b).length >= (tierOf(b).warriors ?? 0) || w.res.food < RECRUIT_FOOD) continue;
    take(w, 'food', RECRUIT_FOOD, b.at);
    const x: Warrior = {
      id: w.nextId++,
      barracks: b.id,
      at: home,
      next: null,
      t: 0,
      route: null,
      idx: 0,
      hp: warriorStats(b).hp,
      state: 'toPost',
      target: null,
    };
    setRoute(x, findPath(w, home, b.at)?.path ?? null);
    w.warriors.push(x);
    log(w, 'A warrior answers the call to arms.');
  }
}

// Nearest monster inside the patrol radius.
function threat(w: World, b: Building): Monster | null {
  const radius = patrolRadius(b);
  let best: Monster | null = null;
  for (const m of w.monsters) {
    const d = keyDistance(m.at, b.at);
    if (d > radius) continue;
    if (!best || d < keyDistance(best.at, b.at)) best = m;
  }
  return best;
}

function updateWarrior(w: World, x: Warrior, dt: number): void {
  const b = w.buildings.get(x.barracks);
  if (!b) return;
  const stats = warriorStats(b);

  if (x.state === 'toPost') {
    if (!x.route && !x.next) {
      if (x.at === b.at) {
        x.state = 'guard';
        return;
      }
      setRoute(x, findPath(w, x.at, b.at)?.path ?? findPath(w, x.at, b.at, true)?.path ?? null);
    }
    followRoute(x);
    advance(x, dt, WARRIOR_SPEED);
    return;
  }

  if (x.state === 'guard' || x.state === 'return') {
    const m = threat(w, b);
    if (m) {
      x.state = 'fight';
      x.target = m.id;
      setRoute(x, null);
    }
  }

  if (x.state === 'guard') {
    x.hp = Math.min(stats.hp, x.hp + HEAL_RATE * dt);
    return;
  }

  if (x.state === 'fight') {
    const m = w.monsters.find((o) => o.id === x.target);
    if (!m || keyDistance(m.at, b.at) > patrolRadius(b) + 1) {
      x.state = 'return';
      x.target = null;
      setRoute(x, null);
    } else if (keyDistance(x.at, m.at) <= ENGAGE_RANGE) {
      m.hp -= stats.attack * dt;
      return;
    } else {
      if (!x.next) x.next = greedyStep(x.at, m.at, (k) => onLand(w, k));
      advance(x, dt, WARRIOR_SPEED);
      return;
    }
  }

  // Returning to post.
  if (x.at === b.at && !x.next) {
    x.state = 'guard';
    return;
  }
  if (!x.route && !x.next) setRoute(x, findPath(w, x.at, b.at, true)?.path ?? null);
  followRoute(x);
  if (!x.next) x.next = greedyStep(x.at, b.at, (k) => onLand(w, k));
  advance(x, dt, WARRIOR_SPEED);
}

// Each warrior eats like a villager. Short rations make one desert per day.
// Warriors eat from their barracks' pantry. Short rations make one desert per
// barracks per day.
export function feedWarriors(w: World): void {
  for (const b of w.buildings.values()) {
    if (b.type !== 'barracks') continue;
    const garrison = warriorsOf(w, b);
    if (!garrison.length) continue;
    const eaten = takeFrom(w, b, 'food', garrison.length);
    if (eaten < garrison.length - 1e-9) {
      w.warriors = w.warriors.filter((x) => x !== garrison[garrison.length - 1]);
      log(w, 'A hungry warrior deserted the barracks.', 'warn');
    }
  }
}
