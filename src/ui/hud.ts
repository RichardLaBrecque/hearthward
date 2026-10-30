import { canAfford, costAt, demolishError, needsText, placeError, prerequisiteMet, residentsFed, upgradeError } from '../sim/actions';
import { DEFS, RESOURCES, type BuildingType, type Cost, type Resource, type Tier } from '../sim/buildings';
import { hearthLevel, levelLabel, lockedText, MAX_LEVEL, settlementName, unlocksAt } from '../sim/progression';
import { tenders } from '../sim/blight';
import { wellCovers } from '../sim/events';
import { dikeProtects, floodable } from '../sim/floods';
import { warriorStats } from '../sim/combat';
import { housingOf, workerSlots } from '../sim/jobs';
import { patrolRadius, warriorsOf } from '../sim/military';
import { depletes, FERTILE_BONUS, gatherBonus, gatherTiles, ironLeft, leftAt, MATERIAL, MATERIAL_OF, stockLeft, type Material } from '../sim/land';
import { mannedTowers } from '../sim/monsters';
import { holdsAt, stockAt, STORED } from '../sim/storage';
import { LAPSE_DAYS } from '../sim/homes';
import { isConnected } from '../sim/network';
import { calendar, DAY_LENGTH, SEASONS, YEAR_LENGTH } from '../sim/seasons';
import { LOT, TRADE_GOODS, tradeError } from '../sim/trade';
import type { Building, TradeGood, World } from '../sim/types';
import { blockedReason, cycleYield } from '../sim/villagers';
import { buildingAt, hearth } from '../sim/world';
import { drawGlyph, type Glyph } from '../render/icons';
import { TERRAIN_NAMES, type Terrain } from '../map';
import { hotkeyFor, type Command } from './keymap';
import { ledgerCells, ledgerTip, Trend, type LedgerKey } from './ledger';
import { SPEEDS, toolKey, type Tool, type UiState } from './state';
import { groupOf, TOOL_GROUPS } from './toolGroups';
import { advanceTutorial, TUTORIAL, tutorialStep, type TutorialWatch } from './tutorial';

const LOG_VISIBLE = 6;
const LOG_FADE = 40; // sim seconds
const ICON_PX = 30;

export interface HudActions {
  selectTool(tool: Tool): void;
  togglePause(): void;
  setSpeed(index: number): void;
  toggleOverlay(): void;
  newGame(): void;
  trade(good: TradeGood, dir: 'buy' | 'sell'): void;
}

export const costText = (cost: Cost): string =>
  RESOURCES.filter((r) => cost[r]).map((r) => `${cost[r]} ${r}`).join(', ') || 'free';

const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);
const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

interface ToolButton {
  tool: Tool;
  glyph: Glyph;
  label: string;
  title: string;
  cost?: Cost;
  hotkey: string | null;
}

export class Hud {
  private top = el('div', 'topbar panel');
  // Separate nodes so the season bar ticking doesn't rebuild the buttons under the cursor.
  private stats = el('div', 'group');
  private calendar = el('div', 'group calendar');
  private controls = el('div', 'group');
  private tools = el('div', 'toolbar panel');
  private inspector = el('div', 'inspector panel');
  private log = el('div', 'log');
  private market = el('div', 'market panel hidden');
  private tip = el('div', 'tip panel hidden');
  private tipKey: LedgerKey | null = null;
  private trend = new Trend();
  private modal = el('div', 'modal hidden');
  private tutorial = el('div', 'tutorial panel hidden');
  private watch: TutorialWatch = { woodLow: Infinity };
  private buttons: { def: ToolButton; node: HTMLButtonElement }[] = [];
  private cache = new Map<HTMLElement, string>();
  private overlayBtn!: HTMLButtonElement;
  private tabs = new Map<string, HTMLButtonElement>();
  private group = TOOL_GROUPS[0].id;
  private lastTool = 'none';

  constructor(root: HTMLElement, private actions: HudActions) {
    root.append(this.top, this.tools, this.inspector, this.tutorial, this.log, this.market, this.tip, this.modal);
    this.top.append(this.stats, this.calendar, this.controls);
    this.buildToolbar();
    // Hover cards for the top bar's numbers.
    this.top.addEventListener('mouseover', (e) => {
      const t = (e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null;
      if (!t) return;
      this.tipKey = t.dataset.tip as LedgerKey;
      const r = t.getBoundingClientRect();
      const bar = this.top.getBoundingClientRect();
      this.tip.style.left = `${Math.max(8, Math.min(window.innerWidth - 300, r.left - 10))}px`;
      this.tip.style.top = `${bar.bottom + 8}px`;
      this.showTip();
    });
    this.top.addEventListener('mouseleave', () => {
      this.tipKey = null;
      this.tip.classList.add('hidden');
    });
    this.market.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-trade]') as HTMLElement | null;
      if (!t) return;
      const [good, dir] = t.dataset.trade!.split(':') as [TradeGood, 'buy' | 'sell'];
      this.actions.trade(good, dir);
    });
    this.tutorial.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if ((act === 'skip' || act === 'finish') && this.lastWorld) {
        this.lastWorld.tutorial = null;
        this.updateTutorial(this.lastWorld);
      }
    });
    this.top.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act!;
      if (act === 'pause') this.actions.togglePause();
      else if (act === 'new') this.confirmNewGame();
      else if (act.startsWith('speed')) this.actions.setSpeed(Number(act.slice(5)));
    });
  }

  // Build tools sit in tabs by group; upgrade, demolish and the road overlay are
  // always on the right.
  private buildToolbar(): void {
    const tabRow = el('div', 'tabs');
    const row = el('div', 'tool-row');
    const groupSet = el('div', 'tool-set');
    const fixedSet = el('div', 'tool-set fixed');
    row.append(groupSet, fixedSet);
    this.tools.append(tabRow, row);

    for (const g of TOOL_GROUPS) {
      const tab = document.createElement('button');
      tab.className = 'tab';
      tab.textContent = g.label;
      tab.addEventListener('click', () => this.showGroup(g.id));
      tabRow.append(tab);
      this.tabs.set(g.id, tab);
    }

    for (const g of TOOL_GROUPS) {
      for (const type of g.types) {
        const def: ToolButton = {
          tool: { kind: 'build', type },
          glyph: type,
          label: DEFS[type].name,
          title: DEFS[type].blurb,
          cost: DEFS[type].tiers[0].cost,
          hotkey: hotkeyFor((c) => c.type === 'tool' && c.tool?.kind === 'build' && c.tool.type === type),
        };
        const node = this.toolButton(groupSet, def.glyph, def.label, def.title, costText(def.cost!), def.hotkey);
        node.dataset.group = g.id;
        node.addEventListener('click', () => this.actions.selectTool(def.tool));
        this.buttons.push({ def, node });
      }
    }

    const fixed: ToolButton[] = [
      { tool: { kind: 'upgrade' }, glyph: 'upgrade', label: 'Upgrade', title: 'Improve a building', hotkey: hotkeyFor(isTool('upgrade')) },
      { tool: { kind: 'demolish' }, glyph: 'demolish', label: 'Demolish', title: 'Tear down for a partial refund', hotkey: hotkeyFor(isTool('demolish')) },
    ];
    for (const def of fixed) {
      const node = this.toolButton(fixedSet, def.glyph, def.label, def.title, '', def.hotkey);
      node.addEventListener('click', () => this.actions.selectTool(def.tool));
      this.buttons.push({ def, node });
    }
    this.overlayBtn = this.toolButton(
      fixedSet,
      'network',
      'Roads',
      'Show which roads and buildings reach the hearth',
      '',
      hotkeyFor((c) => c.type === 'overlay'),
    );
    this.overlayBtn.addEventListener('click', () => this.actions.toggleOverlay());
    this.showGroup(this.group);
  }

  private showGroup(id: string): void {
    this.group = id;
    for (const { node } of this.buttons) {
      if (node.dataset.group) node.classList.toggle('hidden', node.dataset.group !== id);
    }
    for (const [gid, tab] of this.tabs) tab.classList.toggle('on', gid === id);
  }

  // Keep the tabs in step with the game: follow a hotkeyed tool to its tab, mark
  // the tab holding the active tool, and dim tabs whose tools are all locked.
  private updateTabs(ui: UiState, level: number, pointAt?: BuildingType): void {
    const active = toolKey(ui.tool);
    const activeGroup = ui.tool?.kind === 'build' ? groupOf(ui.tool.type) : undefined;
    if (active !== this.lastTool) {
      this.lastTool = active;
      if (activeGroup && activeGroup !== this.group) this.showGroup(activeGroup);
    }
    for (const g of TOOL_GROUPS) {
      const tab = this.tabs.get(g.id)!;
      tab.classList.toggle('holds-active', g.id === activeGroup);
      tab.classList.toggle('hint', !!pointAt && g.id === groupOf(pointAt) && g.id !== this.group);
      tab.classList.toggle('locked', g.types.every((t) => (DEFS[t].level ?? 1) > level));
    }
  }

  private toolButton(
    parent: HTMLElement,
    glyph: Glyph,
    label: string,
    title: string,
    cost: string,
    hotkey: string | null,
  ): HTMLButtonElement {
    const node = document.createElement('button');
    node.className = 'tool';
    node.title = title;
    const icon = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    icon.width = icon.height = ICON_PX * dpr;
    icon.style.width = icon.style.height = `${ICON_PX}px`;
    const ctx = icon.getContext('2d')!;
    ctx.scale(dpr, dpr);
    drawGlyph(ctx, glyph, ICON_PX / 2, ICON_PX / 2, ICON_PX * 0.8);
    node.append(icon);
    node.insertAdjacentHTML(
      'beforeend',
      `<span class="name">${label}</span><span class="cost">${cost || '&nbsp;'}</span>` + (hotkey ? `<kbd>${hotkey}</kbd>` : ''),
    );
    parent.append(node);
    return node;
  }

  private lastWorld: World | null = null;

  private showTip(): void {
    if (!this.tipKey || !this.lastWorld) return;
    this.set(this.tip, ledgerTip(this.lastWorld, this.tipKey, this.trend));
    this.tip.classList.remove('hidden');
  }

  update(w: World, ui: UiState): void {
    this.lastWorld = w;
    this.trend.sample(w);
    this.updateTop(w, ui);
    this.updateTutorial(w);
    this.showTip();
    const active = toolKey(ui.tool);
    const level = hearthLevel(w);
    const pointAt = tutorialStep(w)?.tool;
    this.updateTabs(ui, level, pointAt);
    for (const { def, node } of this.buttons) {
      node.classList.toggle('hint', !!pointAt && toolKey(def.tool) === pointAt && pointAt !== active);
      const need = def.tool?.kind === 'build' ? DEFS[def.tool.type].level ?? 1 : 1;
      const locked = need > level;
      node.classList.toggle('active', toolKey(def.tool) === active);
      node.classList.toggle('locked', locked);
      node.classList.toggle('poor', !locked && !!def.cost && !canAfford(w, def.cost));
      const costNode = node.querySelector('.cost')!;
      const costLabel = locked ? `needs ${levelLabel(need)}` : def.cost ? costText(def.cost) : ' ';
      if (costNode.textContent !== costLabel) costNode.textContent = costLabel;
    }
    this.overlayBtn.classList.toggle('active', ui.overlay);
    const inspector = this.inspectorHtml(w, ui);
    this.set(this.inspector, inspector);
    this.inspector.classList.toggle('hidden', !inspector);
    const market = this.marketHtml(w);
    this.set(this.market, market);
    this.market.classList.toggle('hidden', !market);
    this.set(
      this.log,
      w.log
        .slice(-LOG_VISIBLE)
        .filter((e) => w.time - e.time < LOG_FADE)
        .map((e) => `<div class="msg ${e.tone}" style="opacity:${1 - ((w.time - e.time) / LOG_FADE) * 0.7}">${esc(e.text)}</div>`)
        .join(''),
    );
  }

  private updateTutorial(w: World): void {
    advanceTutorial(w, this.watch);
    const step = tutorialStep(w);
    this.tutorial.classList.toggle('hidden', !step);
    if (!step) return;
    const n = w.tutorial! + 1;
    const last = n === TUTORIAL.length;
    const key = step.tool && hotkeyFor((c) => c.type === 'tool' && c.tool?.kind === 'build' && c.tool.type === step.tool);
    const hint = step.hint?.(w);
    this.set(
      this.tutorial,
      `<div class="dim step">${last ? 'Tutorial complete' : `Step ${n} of ${TUTORIAL.length - 1}`}</div>` +
        `<h3>${step.title}${key ? ` <kbd>${key}</kbd>` : ''}</h3><p>${step.body}</p>` +
        (hint ? `<p class="warn">${hint}</p>` : '') +
        (last
          ? '<div class="buttons"><button class="primary" data-act="finish">Begin</button></div>'
          : '<div class="buttons"><button class="link" data-act="skip">Skip tutorial</button></div>'),
    );
  }

  private updateTop(w: World, ui: UiState): void {
    const cal = calendar(w.time);
    const speedBtns = SPEEDS.map(
      (s, i) => `<button data-act="speed${i}" class="${!ui.paused && ui.speedIndex === i ? 'on' : ''}">${s}×</button>`,
    ).join('');
    this.set(this.stats, settlementStat(w) + ledgerCells(w, this.trend));
    this.calendar.className = `group calendar season-${cal.season}`;
    this.set(
      this.calendar,
      `<span>${SEASONS[cal.season]} · Day ${cal.dayOfSeason + 1} · Year ${cal.year}</span>` +
        `<div class="bar"><div style="width:${(cal.seasonProgress * 100).toFixed(1)}%"></div></div>`,
    );
    this.set(
      this.controls,
      `<button data-act="pause" class="${ui.paused ? 'on' : ''}" title="Pause (Space)">❙❙</button>${speedBtns}` +
        `<button data-act="new" title="Found a new hamlet">New</button>`,
    );
  }

  private inspectorHtml(w: World, ui: UiState): string {
    const k = ui.hover;
    if (!k || !w.terrain.has(k)) return '';
    if (!w.revealed.has(k)) return '<h3>Uncharted</h3><div class="dim">Build roads nearby to survey it.</div>';
    const lines: string[] = [];
    const b = buildingAt(w, k);
    const tool = ui.tool;

    if (tool?.kind === 'build') {
      const def = DEFS[tool.type];
      const err = placeError(w, tool.type, k);
      lines.push(`<h3>${def.name}</h3><div class="dim">${costText(costAt(w, tool.type, k))}</div>`);
      if (MATERIAL[tool.type] && !b) lines.push(gatherLine(w, tool.type, k, 'Would work'));
      lines.push(err ? `<div class="bad">${err}</div>` : '<div class="good">Click to build</div>');
    } else if (tool?.kind === 'upgrade' && b?.order) {
      lines.push(`<h3>→ ${DEFS[b.type].tiers[b.tier + 1].label}</h3><div class="warn">Click to cancel the upgrade (supplies go back to the stores)</div>`);
    } else if (tool?.kind === 'upgrade' && b) {
      const next = DEFS[b.type].tiers[b.tier + 1];
      const err = upgradeError(w, b);
      const reqs = next ? requirements(w, b, next) : { html: '', met: true };
      if (next) lines.push(`<h3>→ ${next.label}</h3><div class="dim">${costText(next.cost)}</div>${reqs.html}`);
      // Unmet requirements are already listed above; otherwise show what's left (cost, fire, max tier).
      if (next?.auto) lines.push(`<div class="dim">${err}</div>`);
      else if (reqs.met) lines.push(err ? `<div class="bad">${err}</div>` : '<div class="good">Click to order the upgrade</div>');
    } else if (tool?.kind === 'demolish' && b) {
      const err = demolishError(b);
      lines.push(err ? `<div class="bad">${err}</div>` : '<div class="warn">Click to demolish (half refunded)</div>');
    }

    if (b) {
      const def = DEFS[b.type];
      const tier = def.tiers[b.tier];
      lines.push(`<h3>${tier.label}</h3>`);
      if (b.type !== 'road' && !w.net.buildings.has(b.id)) lines.push('<div class="bad">No road to the hearth</div>');
      if (b.type === 'road') {
        const joins = b.links?.length ?? 0;
        const cut = w.net.roads.has(k) ? '' : ' · <span class="bad">not linked to hearth</span>';
        lines.push(`<div class="dim">Pace ×${tier.speed} · joined to ${joins} road${joins === 1 ? '' : 's'}${cut}</div>`);
        lines.push('<div class="dim">Drag from one road onto another to join them.</div>');
      }
      const slots = workerSlots(b);
      if (slots) lines.push(`<div>${DEFS[b.type].porters ? 'Porters' : 'Workers'} ${b.workers.length}/${slots}</div>`);
      if (def.produces) {
        const blocked = blockedReason(w, b);
        lines.push(
          blocked
            ? `<div class="warn">Idle: ${blocked}</div>`
            : `<div class="dim">${cycleYield(w, b).toFixed(1)} ${def.produces} per trip</div>`,
        );
      }
      const housing = housingOf(b);
      if (housing) {
        const occ = [...w.villagers.values()].filter((v) => v.home === b.id).length;
        lines.push(`<div>Residents ${occ}/${housing}</div>`);
      }
      if (b.order) lines.push(orderLines(b));
      const nextTier = def.tiers[b.tier + 1];
      if (b.lapsed) lines.push(`<div class="bad">Needs unmet: falls back in ${LAPSE_DAYS - b.lapsed} day${LAPSE_DAYS - b.lapsed === 1 ? '' : 's'}</div>`);
      if (nextTier?.auto && !b.order && !tool) lines.push(`<div class="dim">To become a ${nextTier.label}:</div>${requirements(w, b, nextTier).html}`);
      if (b.fire > 0) {
        lines.push(`<div class="bad">Burning ${Math.round(b.fire * 100)}%${wellCovers(w, b) ? ' · being doused' : ' · no well in reach!'}</div>`);
      }
      if (b.blight > 0) {
        const n = tenders(w, b);
        lines.push(`<div class="bad">Blight ${Math.round(b.blight * 100)}% · ${n ? `${n} tending` : 'untended!'}</div>`);
      }
      if (b.type === 'tower') {
        const manned = mannedTowers(w).some((t) => t.id === b.id);
        lines.push(manned ? '<div class="good">Guard on post</div>' : '<div class="warn">No guard on post</div>');
      }
      if (b.type === 'barracks') {
        const stats = warriorStats(b);
        lines.push(`<div>${stats.label} ${warriorsOf(w, b).length}/${tier.warriors}</div>`);
        lines.push(`<div class="dim">${stats.hp} health · ${stats.attack} damage/s · patrols ${patrolRadius(b)} hexes</div>`);
      }
      // What's in it: a store's stock against its room, or a home's pantry.
      const kept = tier.stores ?? tier.pantry;
      if (kept) {
        const held = Object.keys(kept)
          .map((r) => `${Math.floor(stockAt(b, r as Resource))}/${holdsAt(b, r as Resource)} ${r}`)
          .join(' · ');
        lines.push(`<div>${tier.stores ? 'Holding' : 'Pantry'}: ${held}</div>`);
        if (tier.stores && b.type !== 'hearth' && !isConnected(w, b.id)) {
          lines.push('<div class="bad">Not counted in your stores: no road</div>');
        }
        if (b.type === 'storehouse') lines.push('<div class="dim">Porters move its goods on to dedicated stores.</div>');
        if (DEFS[b.type].accepts) lines.push('<div class="dim">Filled by porters from the hearth and storehouses.</div>');
      }
      if (b.type === 'market') {
        lines.push(
          w.caravan
            ? '<div class="good">A caravan is here</div>'
            : `<div class="dim">Next caravan in about ${Math.max(1, Math.ceil((w.nextCaravan - w.time) / DAY_LENGTH))} days</div>`,
        );
      }
      if (depletes(b)) lines.push(gatherLine(w, b.type, b.at, 'Working'));
      if (b.type === 'cathedral') {
        lines.push(`<div>Stage ${b.tier + 1} of ${def.tiers.length}</div>`);
      }
      const next = def.tiers[b.tier + 1];
      if (!tool && next) {
        lines.push(`<div class="dim">Upgrades to ${next.label}: ${costText(next.cost)}</div>`);
        lines.push(requirements(w, b, next).html);
      }
      if (!tool) lines.push(`<div class="dim blurb">${def.blurb}</div>`);
    } else if (!tool) {
      lines.push(`<h3>${cap(TERRAIN_NAMES[w.terrain.get(k)!])}</h3>`);
      const stock = stockLeft(w, k);
      const material = MATERIAL_OF[w.terrain.get(k)!];
      if (stock && material) lines.push(`<div class="dim">${Math.floor(stock)} ${MATERIAL_WORDS[material].good} left</div>`);
      const trait = TERRAIN_TRAITS[w.terrain.get(k)!];
      if (trait) lines.push(`<div class="dim">${trait}</div>`);
    }
    lines.push(featureLines(w, k));

    if (w.floods.has(k)) lines.push('<div class="warn">Under floodwater</div>');
    else if (floodable(w, k) && b?.type !== 'hearth') {
      lines.push(dikeProtects(w, k) ? '<div class="dim">Protected by a dike</div>' : '<div class="dim">Floods in spring</div>');
    }
    return lines.join('');
  }

  private marketHtml(w: World): string {
    const c = w.caravan;
    if (!c) return '';
    const days = Math.max(0, (c.leaves - w.time) / DAY_LENGTH).toFixed(1);
    const rows = TRADE_GOODS.map((g) => {
      const buyErr = tradeError(w, g, 'buy');
      const sellErr = tradeError(w, g, 'sell');
      return (
        `<tr><td>${cap(g)}</td>` +
        `<td><button data-trade="${g}:buy" ${buyErr ? `disabled title="${buyErr}"` : ''}>Buy ${LOT}</button><small>${c.buy[g]} coin</small></td>` +
        `<td><button data-trade="${g}:sell" ${sellErr ? `disabled title="${sellErr}"` : ''}>Sell ${LOT}</button><small>${c.sell[g]} coin</small></td>` +
        `<td class="dim">${c.stock[g]}</td></tr>`
      );
    }).join('');
    return (
      `<h3>The caravan</h3><div class="dim">Leaves in ${days} days · trader holds ${c.purse} coin</div>` +
      `<table><tr class="dim"><th></th><th>You buy</th><th>You sell</th><th>Stock</th></tr>${rows}</table>`
    );
  }

  showVictory(w: World): void {
    const years = (w.time / YEAR_LENGTH).toFixed(1);
    this.showModal(
      'The Crown grants your charter',
      `<p>After <b>${years} years</b>, your hamlet has become a free and chartered town of <b>${w.villagers.size}</b> souls, with a cathedral to show for it.</p>`,
      [
        { label: 'Found a new hamlet', run: () => this.actions.newGame() },
        { label: 'Keep building', primary: true, run: () => {} },
      ],
    );
  }

  showGameOver(w: World): void {
    const years = (w.time / YEAR_LENGTH).toFixed(1);
    this.showModal(
      'The hearth has gone cold',
      `<p>Your hamlet endured <b>${years} years</b> and grew to <b>${w.peakPop}</b> souls at its peak.</p>`,
      [{ label: 'Found a new hamlet', primary: true, run: () => this.actions.newGame() }],
    );
  }

  private confirmNewGame(): void {
    this.showModal('Begin anew?', '<p>Your current hamlet will be lost to history.</p>', [
      { label: 'Keep playing', run: () => {} },
      { label: 'Found a new hamlet', primary: true, run: () => this.actions.newGame() },
    ]);
  }

  showModal(title: string, body: string, buttons: { label: string; primary?: boolean; run: () => void }[]): void {
    this.modal.innerHTML = `<div class="card panel"><h2>${title}</h2>${body}<div class="buttons"></div></div>`;
    const row = this.modal.querySelector('.buttons')!;
    for (const b of buttons) {
      const node = document.createElement('button');
      node.textContent = b.label;
      if (b.primary) node.className = 'primary';
      node.addEventListener('click', () => {
        this.hideModal();
        b.run();
      });
      row.append(node);
    }
    this.modal.classList.remove('hidden');
  }

  hideModal(): void {
    this.modal.classList.add('hidden');
  }

  get modalOpen(): boolean {
    return !this.modal.classList.contains('hidden');
  }

  private set(node: HTMLElement, html: string): void {
    if (this.cache.get(node) === html) return;
    this.cache.set(node, html);
    node.innerHTML = html;
  }
}

// "Upgrading to Cottage: 6 / 15 wood · 10 / 10 stone"
function orderLines(b: Building): string {
  const next = DEFS[b.type].tiers[b.tier + 1];
  const parts = STORED.filter((r) => next.cost[r]).map((r) => `${Math.floor(b.order!.supplies[r] ?? 0)} / ${next.cost[r]} ${r}`);
  return `<div class="warn">Upgrading to ${next.label}</div><div class="dim">Supplies: ${parts.join(' · ') || 'none'}</div>`;
}

// Checklist for upgrading `b` into `next`: settlement level, population, nearby
// buildings. The hearth also lists what its next level unlocks.
function requirements(w: World, b: Building, next: Tier): { html: string; met: boolean } {
  const checks: [boolean, string][] = [];
  if (next.level) checks.push([hearthLevel(w) >= next.level, lockedText(next.level)]);
  if (next.pop) checks.push([w.villagers.size >= next.pop, `${next.pop} villagers (you have ${w.villagers.size})`]);
  for (const needs of next.needs ?? []) checks.push([prerequisiteMet(w, b, needs), needsText(needs)]);
  if (next.fed) checks.push([residentsFed(w, b), 'Residents fed from the pantry']);
  let html = checks.map(([ok, text]) => `<div class="${ok ? 'good' : 'bad'}">${ok ? '✓' : '✗'} ${text}</div>`).join('');
  if (b.type === 'hearth') html += `<div class="dim">Unlocks: ${unlocksAt(b.tier + 2).join(', ')}</div>`;
  return { html, met: checks.every(([ok]) => ok) };
}

// What sets a terrain apart, for the inspector.
const TERRAIN_TRAITS: Partial<Record<Terrain, string>> = {
  meadow: 'Rich soil: farms yield 25% more. Dry grass: fires start and spread twice as fast in summer.',
  heath: 'Poor soil: farms yield 40% less. Cheap ground: buildings cost 25% less wood and stone.',
  crags: 'Rocky highland: 200 stone to quarry, and ore in the rock. Leaves heath when worked out.',
  wetwood: 'Floods in spring. Leaves marsh when cut down.',
};

const MATERIAL_WORDS: Record<Material, { one: string; many: string; good: string }> = {
  forest: { one: 'forest tile', many: 'forest tiles', good: 'wood' },
  hills: { one: 'hill', many: 'hills', good: 'stone' },
  water: { one: 'water tile', many: 'water tiles', good: 'fish' },
  iron: { one: 'iron vein', many: 'iron veins', good: 'iron' },
};

// "Working 3 forest tiles · +40% · 212 wood left", for a gatherer built or being placed.
function gatherLine(w: World, type: BuildingType, at: string, verb: string): string {
  const material = MATERIAL[type]!;
  const words = MATERIAL_WORDS[material];
  const tiles = gatherTiles(w, type, at);
  if (!tiles.length) return `<div class="bad">No ${words.one} in reach</div>`;
  const left = Math.floor(tiles.reduce((n, k) => n + leftAt(w, k, material), 0));
  const bonus = Math.round((gatherBonus(tiles.length) - 1) * 100);
  const noun = `${tiles.length} ${tiles.length === 1 ? words.one : words.many}`;
  return `<div class="good">${verb} ${noun}${bonus ? ` · +${bonus}%` : ''} · ${left} ${words.good} left</div>`;
}

// What a discovery on this hex is and how to use it.
function featureLines(w: World, k: string): string {
  const f = w.features.get(k);
  if (!f) return '';
  const claimed = w.claimed.has(k);
  switch (f) {
    case 'ruins':
      return claimed
        ? '<div class="dim">Old ruins, already searched</div>'
        : '<div class="warn">Old ruins: bring a road here to search them</div>';
    case 'homestead':
      return claimed
        ? '<div class="dim">An old homestead; its people have joined you</div>'
        : '<div class="warn">Abandoned homestead: bring a road here and survivors will join you</div>';
    case 'iron': {
      const left = ironLeft(w, k);
      return left
        ? `<div class="warn">Iron vein: ${left} iron. Build a Mine on or beside it</div>`
        : '<div class="dim">A worked-out iron vein</div>';
    }
    case 'fertile':
      return `<div class="good">Fertile valley: farms here yield +${FERTILE_BONUS * 100}%</div>`;
  }
}

function settlementStat(w: World): string {
  const level = hearthLevel(w);
  const h = hearth(w);
  const ready = level < MAX_LEVEL && !h.order && upgradeError(w, h) === null;
  const title = ready ? `The hearth can become the ${levelLabel(level + 1)}` : `${levelLabel(level)}`;
  return `<span class="stat settlement ${ready ? 'ready' : ''}" title="${title}">${settlementName(level)}${ready ? ' ↑' : ''}</span>`;
}

const isTool = (kind: 'upgrade' | 'demolish') => (c: Command) => c.type === 'tool' && c.tool?.kind === kind;

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
