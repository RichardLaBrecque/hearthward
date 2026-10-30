import { hexToPixel, keyDistance, neighborKeys, parseKey } from '../hex';
import { MAP_RADIUS } from '../map';
import { DEFS, TOWER_RADIUS } from './buildings';
import { isStore, stockAt, STORED, take, takeFrom } from './storage';
import { engagedWith, MONSTER_STATS } from './combat';
import { advance, followRoute, onLand, setRoute } from './move';
import { isConnected } from './network';
import { findPath } from './path';
import { calendar, DAYS_PER_SEASON, WINTER } from './seasons';
import type { Building, Monster, MonsterKind, Villager, World } from './types';
import { hearth, isOn, log, removeVillager } from './world';

// Wolves: winter packs from forest dens that hunt villagers on the roads.
const PACK_CHANCE = 0.35; // per winter day
const DEN_MIN = 4; // dens are forest hexes this far from the hearth...
const DEN_MAX = 10; // ...but no farther
const WOLF_LIFE = 30; // seconds before the pack gives up
const HUNT_RANGE = 8;
const HEARTH_FEAR = 1; // wolves won't come this close to the fire

// Raiders: bands from beyond the map edge that march on stores and homes.
const RAID_START = DAYS_PER_SEASON * 2; // first raids in autumn of year 1
const RAID_CHANCE = 0.12; // per day, outside winter
const RAID_ORIGIN_MIN = 12;
const RAID_MAX = 8;
const RAID_STAGGER = 0.7; // hexes between raiders in a column
const PILLAGE_TIME = 4;
const PLUNDER_SHARE = 0.04; // of each stockpile, per raider
const PLUNDER_CAP = 15;

function createMonster(w: World, kind: MonsterKind, at: string): Monster {
  return {
    id: w.nextId++,
    kind,
    at,
    next: null,
    t: 0,
    route: null,
    idx: 0,
    hp: MONSTER_STATS[kind].hp,
    life: kind === 'wolf' ? WOLF_LIFE : Infinity,
    target: null,
    timer: 0,
    origin: at,
    fleeing: false,
  };
}

export function spawnWolves(w: World, den?: string): void {
  if (den === undefined) {
    if (calendar(w.time).season !== WINTER || Math.random() >= PACK_CHANCE) return;
    const home = hearth(w).at;
    const dens = [...w.terrain]
      .filter(([k, t]) => {
        if (t !== 'forest' || !w.revealed.has(k)) return false;
        const d = keyDistance(k, home);
        return d >= DEN_MIN && d <= DEN_MAX;
      })
      .map(([k]) => k);
    if (!dens.length) return;
    den = dens[Math.floor(Math.random() * dens.length)];
  }
  const size = 1 + Math.floor(w.villagers.size / 12);
  for (let i = 0; i < size; i++) w.monsters.push(createMonster(w, 'wolf', den));
  log(w, size > 1 ? 'A wolf pack howls at the forest edge!' : 'A wolf prowls at the forest edge!', 'bad');
}

// Raids go for the nearest stockpile (the hearth always counts); only when
// there's none do they settle for burning something.
function raidTarget(w: World, from: string): Building | null {
  const nearest = (ok: (b: Building) => boolean): Building | null => {
    let best: Building | null = null;
    for (const b of w.buildings.values()) {
      if (ok(b) && (!best || keyDistance(from, b.at) < keyDistance(from, best.at))) best = b;
    }
    return best;
  };
  return nearest((b) => !!DEFS[b.type].storage || b.type === 'market') ?? nearest((b) => DEFS[b.type].flammable);
}

export function spawnRaid(w: World, origin?: string): void {
  const cal = calendar(w.time);
  if (origin === undefined) {
    if (cal.day < RAID_START || cal.season === WINTER || Math.random() >= RAID_CHANCE) return;
    const home = hearth(w).at;
    const edge = [...w.terrain.keys()].filter((k) => {
      const d = keyDistance(k, home);
      return d >= RAID_ORIGIN_MIN && d <= MAP_RADIUS && onLand(w, k) && !w.byHex.has(k);
    });
    if (!edge.length) return;
    origin = edge[Math.floor(Math.random() * edge.length)];
  }
  const target = raidTarget(w, origin);
  if (!target) return;
  const route = findPath(w, origin, target.at, true);
  if (!route) return;

  const size = Math.min(RAID_MAX, 1 + cal.year + Math.floor(w.villagers.size / 15));
  for (let i = 0; i < size; i++) {
    const m = createMonster(w, 'raider', origin);
    m.target = target.id;
    setRoute(m, route.path);
    m.t = -i * RAID_STAGGER; // stagger the column
    w.monsters.push(m);
  }
  log(w, `Raiders approach from the ${compass(w, origin)}!`, 'bad');
}

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

function compass(w: World, k: string): string {
  const a = hexToPixel(parseKey(hearth(w).at), 1);
  const b = hexToPixel(parseKey(k), 1);
  const octant = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4));
  return COMPASS[(octant + 8) % 8];
}

// A tower only protects while its guard is on post.
export const mannedTowers = (w: World): Building[] =>
  [...w.buildings.values()].filter(
    (b) =>
      b.type === 'tower' &&
      isConnected(w, b.id) &&
      b.workers.some((id) => {
        const v = w.villagers.get(id);
        return v !== undefined && v.state === 'working' && isOn(w, b, v.at);
      }),
  );

export const guarded = (towers: Building[], k: string): boolean => towers.some((t) => keyDistance(t.at, k) <= TOWER_RADIUS);

// Villagers out on the roads are exposed; anyone at a building is safe indoors.
const exposed = (v: Villager): boolean => v.path !== null;

export function updateMonsters(w: World, dt: number): void {
  if (!w.monsters.length) return;
  const towers = mannedTowers(w);
  const gone = new Set<number>();
  let drivenOff = false;

  for (const m of w.monsters) {
    if (engagedWith(w, m).length) continue; // held in melee
    const outcome = m.kind === 'wolf' ? updateWolf(w, m, dt, towers) : updateRaider(w, m, dt);
    if (outcome === 'gone') gone.add(m.id);
    if (outcome === 'drivenOff') {
      gone.add(m.id);
      drivenOff = true;
    }
  }

  if (drivenOff) log(w, 'The watchtower guard drove off the wolves.');
  if (gone.size) w.monsters = w.monsters.filter((x) => !gone.has(x.id));
}

type Outcome = 'stay' | 'gone' | 'drivenOff';

function updateWolf(w: World, m: Monster, dt: number, towers: Building[]): Outcome {
  m.life -= dt;
  if (m.life <= 0) return 'gone';
  if (guarded(towers, m.at)) return 'drivenOff';
  const prey = [...w.villagers.values()].find((v) => exposed(v) && v.at === m.at && !guarded(towers, v.at));
  if (prey) {
    removeVillager(w, prey.id);
    log(w, 'Wolves took a villager on the road!', 'bad');
    return 'gone';
  }
  if (!m.next) m.next = wolfStep(w, m);
  advance(m, dt, MONSTER_STATS.wolf.speed);
  return 'stay';
}

// Close on the nearest exposed villager; with nothing to hunt, roam.
function wolfStep(w: World, m: Monster): string | null {
  const home = hearth(w).at;
  const options = neighborKeys(m.at).filter((k) => onLand(w, k) && keyDistance(k, home) > HEARTH_FEAR);
  if (!options.length) return null;

  let target: string | null = null;
  let best = HUNT_RANGE + 1;
  for (const v of w.villagers.values()) {
    if (!exposed(v)) continue;
    const d = keyDistance(v.at, m.at);
    if (d < best) {
      best = d;
      target = v.at;
    }
  }
  if (!target) return options[Math.floor(Math.random() * options.length)];
  return options.reduce((a, b) => (keyDistance(a, target!) <= keyDistance(b, target!) ? a : b));
}

function updateRaider(w: World, m: Monster, dt: number): Outcome {
  if (m.fleeing) {
    followRoute(m);
    if (!m.next) return 'gone'; // home, or nowhere left to go
    advance(m, dt, MONSTER_STATS.raider.speed);
    return 'stay';
  }

  let target = m.target === null ? undefined : w.buildings.get(m.target);
  if (!target) {
    target = raidTarget(w, m.at) ?? undefined;
    if (!target) return flee(w, m);
    m.target = target.id;
    setRoute(m, findPath(w, m.at, target.at, true)?.path ?? null);
  }

  if (isOn(w, target, m.at)) {
    m.timer -= dt;
    if (m.timer > 0) return 'stay';
    pillage(w, target);
    return flee(w, m);
  }

  followRoute(m);
  // Something was built in the way: re-plan.
  if (m.next && !isOn(w, target, m.next) && w.byHex.has(m.next) && w.buildings.get(w.byHex.get(m.next)!)!.type !== 'road') {
    setRoute(m, findPath(w, m.at, target.at, true)?.path ?? null);
    followRoute(m);
  }
  if (!m.next) {
    setRoute(m, findPath(w, m.at, target.at, true)?.path ?? null);
    followRoute(m);
    if (!m.next) return flee(w, m);
  }
  if (advance(m, dt, MONSTER_STATS.raider.speed) && isOn(w, target, m.at)) m.timer = PILLAGE_TIME;
  return 'stay';
}

function flee(w: World, m: Monster): Outcome {
  m.fleeing = true;
  m.target = null;
  setRoute(m, findPath(w, m.at, m.origin, true)?.path ?? null);
  return m.route ? 'stay' : 'gone';
}

function pillage(w: World, b: Building): void {
  const def = DEFS[b.type];
  if (isStore(b) || b.type === 'market') {
    // Raiders carry off a share of what this building actually holds (the purse, at a trading post).
    let taken = 0;
    for (const r of isStore(b) ? STORED : (['coin'] as const)) {
      const held = r === 'coin' ? w.res.coin : stockAt(b, r);
      const amount = Math.min(PLUNDER_CAP, Math.floor(held * PLUNDER_SHARE));
      taken += r === 'coin' ? take(w, 'coin', amount) : takeFrom(w, b, r, amount);
    }
    log(w, `Raiders plundered ${taken} goods from the ${def.name.toLowerCase()}!`, 'bad');
  } else if (def.flammable) {
    b.fire = Math.max(b.fire, 0.15);
    log(w, `Raiders set the ${def.name.toLowerCase()} ablaze!`, 'bad');
  }
}
