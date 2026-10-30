// The top bar's numbers and their hover cards: what you have, where it's going,
// and how much of it you can keep.
import { DEFS, type Resource } from '../sim/buildings';
import { capacity, storageSources, type Stored } from '../sim/storage';
import { housingCapacity, jobTotals } from '../sim/jobs';
import { RECRUIT_FOOD } from '../sim/military';
import { calendar, DAY_LENGTH, DAYS_PER_SEASON, WINTER } from '../sim/seasons';
import { GROWTH_FOOD_BASE, GROWTH_FOOD_PER_HEAD, HEAT_PER_HOME } from '../sim/tick';
import { idleSummary } from '../sim/idle';
import { ironLeft } from '../sim/land';
import { charterTerms } from '../sim/progression';
import { tradingPost } from '../sim/trade';
import type { World } from '../sim/types';

export type LedgerKey = Resource | 'folk' | 'work' | 'idle' | 'arms' | 'charter';

const WINDOW = DAY_LENGTH; // sim seconds of history behind each trend
const MIN_WINDOW = DAY_LENGTH / 3;

// Rolling samples of the stockpiles, so the bar can show which way each is heading.
export class Trend {
  private samples: { t: number; res: Record<Resource, number> }[] = [];

  sample(w: World): void {
    const last = this.samples[this.samples.length - 1];
    if (last && w.time < last.t) this.samples = []; // a new game or a load
    else if (last && w.time === last.t) return; // paused
    this.samples.push({ t: w.time, res: { ...w.res } });
    while (this.samples.length > 2 && w.time - this.samples[1].t >= WINDOW) this.samples.shift();
  }

  // Net change per day over the window, or null until there's enough history.
  perDay(r: Resource): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || last.t - first.t < MIN_WINDOW) return null;
    return ((last.res[r] - first.res[r]) / (last.t - first.t)) * DAY_LENGTH;
  }
}

// Everything the bar and its cards need, computed once per refresh.
function forecast(w: World) {
  const cal = calendar(w.time);
  const pop = w.villagers.size;
  const homes = new Set([...w.villagers.values()].map((v) => v.home).filter((h) => h !== null)).size;
  const homeless = [...w.villagers.values()].filter((v) => v.home === null).length;
  const winter = cal.season === WINTER;
  const daysToWinter = winter ? 0 : (WINTER - cal.season) * DAYS_PER_SEASON - cal.dayOfSeason;
  const barracks = [...w.buildings.values()].filter((b) => b.type === 'barracks');
  return {
    cal,
    pop,
    winter,
    daysToWinter,
    homes,
    homeless,
    housing: housingCapacity(w),
    eat: pop + w.warriors.length,
    heatPerDay: homes * HEAT_PER_HOME,
    arms: barracks.reduce((n, b) => n + (DEFS.barracks.tiers[b.tier].warriors ?? 0), 0),
    jobs: jobTotals(w),
  };
}

const fmt = (n: number): string => String(Math.floor(n));
const signed = (n: number): string => (n >= 0.5 ? `+${Math.round(n)}` : n <= -0.5 ? `−${Math.round(-n)}` : '±0');
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

function trendSpan(trend: Trend, r: Resource): string {
  const d = trend.perDay(r);
  if (d === null) return '<span class="flat">…</span>';
  const cls = d >= 0.5 ? 'up' : d <= -0.5 ? 'down' : 'flat';
  return `<span class="${cls}">${signed(d)}/day</span>`;
}

function cell(key: LedgerKey, label: string, value: string, sub: string, tone = '', extra = ''): string {
  return (
    `<span class="stat ${tone}" data-tip="${key}">` +
    `<span class="main"><i>${label}</i> ${value}</span>${extra}<span class="sub">${sub}</span></span>`
  );
}

// "Wood 140/250" with a fill meter; it warns when the store is full, since
// workers making that good then stop.
function storedCell(w: World, trend: Trend, r: Stored, label: string, extraSub = '', low = false): string {
  const amount = w.res[r];
  const cap = capacity(w, r);
  const full = amount >= cap;
  const fill = Math.min(1, amount / cap) * 100;
  const sub = trendSpan(trend, r) + extraSub + (full ? ' <span class="down">· full</span>' : '');
  return cell(
    r,
    label,
    `${fmt(amount)}<small class="cap">/${cap}</small>`,
    sub,
    low ? 'low' : full ? 'over' : '',
    `<span class="meter ${fill >= 90 ? 'full' : ''}"><b style="width:${fill.toFixed(0)}%"></b></span>`,
  );
}

const STORE_HINT: Record<Stored, string> = {
  food: 'Build a storehouse (Village) or a granary (Town) for more room.',
  wood: 'Build a woodshed or storehouse (Village) for more room.',
  stone: 'Build a stone yard or storehouse (Village) for more room.',
  iron: 'Build an ore shed or storehouse (Village) for more room.',
};

// How much of a good you hold, how much you can, and where the room comes from.
function storageRows(w: World, r: Stored): string {
  const cap = capacity(w, r);
  const amount = w.res[r];
  const full = amount >= cap;
  const sources = storageSources(w, r)
    .map((s) => `${s.label}${s.count > 1 ? ` ×${s.count}` : ''} ${fmt(s.held)}/${s.cap}`)
    .join(' · ');
  return (
    row('In store', `${fmt(amount)} of ${cap}`, full ? 'warn' : '') +
    note(sources) +
    (full
      ? note(`Full: workers making ${r} stand idle until there's room. ${STORE_HINT[r]}`, 'warn')
      : row('Room left', fmt(cap - amount)))
  );
}

// The resource and people cells of the top bar.
export function ledgerCells(w: World, trend: Trend): string {
  const f = forecast(w);
  const woodSub = f.winter && f.heatPerDay ? ` <span class="down">· burns ${f.heatPerDay}</span>` : '';
  const woodLow = f.winter ? w.res.wood < f.heatPerDay * 2 : w.res.wood < f.heatPerDay * DAYS_PER_SEASON && f.daysToWinter <= 2;
  const cells = [
    storedCell(w, trend, 'food', 'Food', '', w.res.food < f.eat * 2),
    storedCell(w, trend, 'wood', 'Wood', woodSub, woodLow),
    storedCell(w, trend, 'stone', 'Stone'),
    ...(ironKnown(w) ? [storedCell(w, trend, 'iron', 'Iron')] : []),
    cell('coin', 'Coin', fmt(w.res.coin), trendSpan(trend, 'coin')),
  ];

  const growth = growthBlocker(w, f);
  cells.push(cell('folk', 'Folk', `${f.pop}/${f.housing}`, growth ? `<span class="flat">${growth}</span>` : '<span class="up">growing</span>'));
  const idle = f.pop - f.jobs.filled;
  cells.push(cell('work', 'Work', `${f.jobs.filled}/${f.jobs.slots}`, `<span class="flat">${idle > 0 ? `${idle} idle` : 'all busy'}</span>`));
  const stuck = idleSummary(w).reduce((n, g) => n + g.ids.length, 0);
  cells.push(
    cell('idle', 'Idle', String(stuck), `<span class="flat">${stuck ? 'click to visit' : 'all working'}</span>`, stuck ? 'stuck' : ''),
  );
  if (f.arms) {
    const short = f.arms - w.warriors.length;
    cells.push(cell('arms', 'Arms', `${w.warriors.length}/${f.arms}`, `<span class="flat">${short > 0 ? 'recruiting' : 'full'}</span>`));
  }
  const terms = charterTerms(w);
  const done = terms.filter((t) => t.done).length;
  const next = terms.find((t) => !t.done);
  cells.push(
    cell('charter', 'Charter', `${done}/${terms.length}`, w.won ? '<span class="up">granted</span>' : `<span class="flat">${next?.label.toLowerCase() ?? ''}</span>`, w.won ? 'won' : ''),
  );
  return cells.join('');
}

// Why the population isn't growing right now, or null if it is.
function growthBlocker(w: World, f: ReturnType<typeof forecast>): string | null {
  if (f.winter) return 'no arrivals in winter';
  if (f.pop >= f.housing) return 'no free beds';
  if (w.res.food < f.pop * GROWTH_FOOD_PER_HEAD + GROWTH_FOOD_BASE) return 'needs more food';
  return null;
}

const row = (label: string, value: string, tone = ''): string =>
  `<div class="row ${tone}"><span>${label}</span><b>${value}</b></div>`;
const note = (text: string, tone = 'dim'): string => `<div class="note ${tone}">${text}</div>`;

// The hover card for one cell of the bar.
export function ledgerTip(w: World, key: LedgerKey, trend: Trend): string {
  const f = forecast(w);
  const d = (r: Resource) => trend.perDay(r);
  const trendRow = (r: Resource) => {
    const v = d(r);
    return row('Change over the last day', v === null ? 'measuring…' : `${signed(v)}/day`, v === null ? '' : v < -0.5 ? 'bad' : v > 0.5 ? 'good' : '');
  };

  switch (key) {
    case 'food': {
      const days = f.eat ? Math.floor(w.res.food / f.eat) : Infinity;
      return (
        `<h4>Food</h4>` +
        storageRows(w, 'food') +
        row(`Eaten each day`, String(f.eat)) +
        note(`${plural(f.pop, 'villager')}${w.warriors.length ? `, ${plural(w.warriors.length, 'warrior')}` : ''}`) +
        trendRow('food') +
        row('Lasts without new harvests', days === Infinity ? '—' : plural(days, 'day'), days < DAYS_PER_SEASON ? 'bad' : '') +
        (f.winter ? note('Winter: the fields lie fallow.', 'warn') : note(`Winter in ${plural(f.daysToWinter, 'day')}; fields stop then.`))
      );
    }
    case 'wood': {
      const winterNeed = f.heatPerDay * DAYS_PER_SEASON;
      return (
        `<h4>Wood</h4>` +
        storageRows(w, 'wood') +
        (f.winter
          ? row('Burned for heat each day', String(f.heatPerDay), 'warn') + note(`${plural(f.homes, 'occupied home')} × ${HEAT_PER_HOME}`)
          : row(`Next winter needs`, String(winterNeed), w.res.wood >= winterNeed ? 'good' : 'bad') +
            note(`${plural(f.homes, 'home')} × ${HEAT_PER_HOME} a day × ${DAYS_PER_SEASON} days · winter in ${plural(f.daysToWinter, 'day')}`)) +
        trendRow('wood')
      );
    }
    case 'iron': {
      const veins = [...w.features].filter(([k, f]) => f === 'iron' && w.revealed.has(k) && ironLeft(w, k) > 0).length;
      const mines = [...w.buildings.values()].filter((b) => b.type === 'mine').length;
      return (
        `<h4>Iron</h4>` +
        storageRows(w, 'iron') +
        trendRow('iron') +
        row('Veins found', String(veins)) +
        row('Mines', String(mines)) +
        note('Needed for the Garrison and the Cathedral. Mines (Village) dig it from veins found in the wilds; caravans sometimes sell a little.')
      );
    }
    case 'charter': {
      const checks = charterTerms(w)
        .map((t) => `<div class="note ${t.done ? 'good' : 'bad'}">${t.done ? '✓' : '✗'} ${t.label}</div>`)
        .join('');
      return (
        `<h4>The Town Charter</h4>` +
        note(w.won ? 'Granted! Your town is free and chartered. Build on as you like.' : 'Meet every term and the Crown grants your town its charter: you win.', w.won ? 'good' : '') +
        checks
      );
    }
    case 'stone':
      return `<h4>Stone</h4>` + storageRows(w, 'stone') + trendRow('stone') + note('Used for upgrades, wells, dikes and barracks.');
    case 'coin': {
      const post = tradingPost(w);
      const caravan = w.caravan
        ? row('Caravan', `here ${Math.max(0, (w.caravan.leaves - w.time) / DAY_LENGTH).toFixed(1)} more days`, 'good')
        : post
          ? row('Next caravan', `about ${plural(Math.max(1, Math.ceil((w.nextCaravan - w.time) / DAY_LENGTH)), 'day')}`)
          : note('Build a Trading Post (Longhouse) for caravans to visit.');
      return `<h4>Coin</h4>` + row('In purse', fmt(w.res.coin)) + row('Storage', 'no limit') + trendRow('coin') + caravan + note('Earned by selling to caravans.');
    }
    case 'folk': {
      const needFood = f.pop * GROWTH_FOOD_PER_HEAD + GROWTH_FOOD_BASE;
      const check = (ok: boolean, text: string) => `<div class="note ${ok ? 'good' : 'bad'}">${ok ? '✓' : '✗'} ${text}</div>`;
      return (
        `<h4>Folk</h4>` +
        row('Villagers', String(f.pop)) +
        row('Beds', String(f.housing)) +
        (f.homeless ? row('Without a home', String(f.homeless), 'bad') : '') +
        `<div class="note">A newcomer arrives each day when:</div>` +
        check(f.pop < f.housing, 'a bed is free') +
        check(w.res.food >= needFood, `food is at least ${needFood} (have ${fmt(w.res.food)})`) +
        check(!f.winter, 'it is not winter')
      );
    }
    case 'work': {
      const idle = f.pop - f.jobs.filled;
      return (
        `<h4>Work</h4>` +
        row('Villagers working', String(f.jobs.filled)) +
        row('Jobs available', String(f.jobs.slots)) +
        row('Idle villagers', String(Math.max(0, idle)), idle > 0 ? 'warn' : '') +
        row('Unfilled jobs', String(Math.max(0, f.jobs.slots - f.jobs.filled)), f.jobs.slots > f.jobs.filled ? 'warn' : '') +
        note('Only buildings connected to the hearth by road offer jobs.')
      );
    }
    case 'idle': {
      const groups = idleSummary(w);
      if (!groups.length) return `<h4>Idle buildings</h4>` + note('Every building that can work is working.');
      return (
        `<h4>Idle buildings</h4>` +
        groups.map((g) => row(cap(g.reason), plural(g.ids.length, 'building'), 'warn')).join('') +
        note('Click to visit them in turn.')
      );
    }
    case 'arms':
      return (
        `<h4>Arms</h4>` +
        row('Warriors', String(w.warriors.length)) +
        row('Barracks places', String(f.arms)) +
        row('Food eaten each day', String(w.warriors.length)) +
        note(`Each recruit costs ${RECRUIT_FOOD} food to equip.`)
      );
  }
}


// Iron joins the bar once it matters: some in store, a vein found, or a mine built.
const ironKnown = (w: World): boolean =>
  w.res.iron > 0 ||
  [...w.buildings.values()].some((b) => b.type === 'mine') ||
  [...w.features].some(([k, f]) => f === 'iron' && w.revealed.has(k));
