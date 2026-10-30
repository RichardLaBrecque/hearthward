import { hexCorners, hexesInRange, hexToPixel, neighborKeys, parseKey, type Point } from '../hex';
import type { Terrain } from '../map';
import { hash2, mulberry32 } from '../rng';
import { demolishError, placeError, upgradeError } from '../sim/actions';
import { CHAPEL_RADIUS, DEFS, DIKE_RADIUS, TOWER_RADIUS, WELL_RADIUS, type BuildingType } from '../sim/buildings';
import { MONSTER_STATS, warriorStats } from '../sim/combat';
import { patrolRadius } from '../sim/military';
import { linked } from '../sim/network';
import { accepts, holdsAt, isStore, stockAt, STORED } from '../sim/storage';
import { FISH_STOCK, FOREST_STOCK, gatherTiles, HILLS_STOCK, ironLeft, MATERIAL, stockLeft } from '../sim/land';
import { calendar, WINTER } from '../sim/seasons';
import { tradingPost } from '../sim/trade';
import type { Building, Mover, World } from '../sim/types';
import { villagerHexes } from '../sim/villagers';
import { buildingAt } from '../sim/world';
import type { UiState } from '../ui/state';
import { applyCamera, screenToWorld, type Camera, type Viewport } from './camera';
import { drawGlyph, fish, type Glyph } from './icons';
import {
  BLIGHT_INK,
  BUILDING_WASH,
  FLOOD_WASH,
  INK,
  INK_FAINT,
  INK_SOFT,
  PAPER,
  PAPER_DARK,
  RESOURCE_WASH,
  ROAD_WASH,
  TEAL_INK,
  TERRAIN_WASH,
  VERMILION,
  WARRIOR_INK,
} from './palette';

export const HEX_SIZE = 28;

const center = (k: string): Point => hexToPixel(parseKey(k), HEX_SIZE);

function hexPath(ctx: CanvasRenderingContext2D, c: Point, size: number): void {
  const pts = hexCorners(c, size);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// A tileable sheet of speckled, fibrous paper, generated once.
let paperPattern: CanvasPattern | null = null;
function paper(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  if (paperPattern) return paperPattern;
  const size = 256;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const t = tile.getContext('2d')!;
  t.fillStyle = PAPER;
  t.fillRect(0, 0, size, size);
  const rand = mulberry32(1234);
  for (let i = 0; i < 2200; i++) {
    const shade = rand() < 0.5 ? '120,90,50' : '255,250,235';
    t.fillStyle = `rgba(${shade},${rand() * 0.08})`;
    t.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  t.lineWidth = 0.6;
  for (let i = 0; i < 70; i++) {
    t.strokeStyle = `rgba(110,80,40,${0.04 + rand() * 0.05})`;
    const x = rand() * size;
    const y = rand() * size;
    t.beginPath();
    t.moveTo(x, y);
    t.quadraticCurveTo(x + rand() * 20 - 10, y + rand() * 20 - 10, x + rand() * 30 - 15, y + rand() * 30 - 15);
    t.stroke();
  }
  paperPattern = ctx.createPattern(tile, 'repeat');
  return paperPattern ?? PAPER;
}

export function render(ctx: CanvasRenderingContext2D, w: World, cam: Camera, view: Viewport, ui: UiState, now: number): void {
  const pw = view.width * view.dpr;
  const ph = view.height * view.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = paper(ctx);
  ctx.fillRect(0, 0, pw, ph);

  applyCamera(ctx, cam, view);
  const tl = screenToWorld(cam, view, 0, 0);
  const br = screenToWorld(cam, view, view.width, view.height);
  const m = HEX_SIZE * 2;
  const visible = (p: Point): boolean => p.x > tl.x - m && p.x < br.x + m && p.y > tl.y - m && p.y < br.y + m;

  const winter = calendar(w.time).season === WINTER;
  drawTerrain(ctx, w, visible, winter);
  drawFeatures(ctx, w, visible);
  drawRoads(ctx, w, visible, ui.overlay);
  for (const b of w.buildings.values()) {
    if (b.type !== 'road' && visible(center(b.at))) drawBuilding(ctx, w, b, ui.overlay, now);
  }
  drawFloods(ctx, w, visible, now);
  const post = w.caravan ? tradingPost(w) : undefined;
  if (post) {
    const c = center(post.at);
    drawGlyph(ctx, 'cart', c.x + HEX_SIZE * 0.75, c.y + HEX_SIZE * 0.2, HEX_SIZE * 0.42);
  }
  drawVillagers(ctx, w);
  drawWarriors(ctx, w);
  drawMonsters(ctx, w);
  drawHover(ctx, w, ui);

  // Aged edges.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(pw / 2, ph / 2, Math.min(pw, ph) * 0.35, pw / 2, ph / 2, Math.max(pw, ph) * 0.75);
  g.addColorStop(0, 'rgba(120,80,30,0)');
  g.addColorStop(1, 'rgba(120,80,30,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, pw, ph);
}

function drawTerrain(ctx: CanvasRenderingContext2D, w: World, visible: (p: Point) => boolean, winter: boolean): void {
  for (const [k, t] of w.terrain) {
    const c = center(k);
    if (!visible(c)) continue;
    if (!w.revealed.has(k)) {
      // Uncharted: bare paper with a faint dotted grid, like an unfinished survey.
      hexPath(ctx, c, HEX_SIZE);
      ctx.strokeStyle = 'rgba(80,55,25,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    hexPath(ctx, c, HEX_SIZE);
    ctx.fillStyle = TERRAIN_WASH[t];
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (winter && t !== 'water') {
      ctx.fillStyle = 'rgba(246,244,236,0.55)';
      ctx.fill();
    }
    ctx.strokeStyle = INK_FAINT;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (!w.byHex.has(k)) drawTerrainInk(ctx, w, k, t, c);
  }
}

function drawTerrainInk(ctx: CanvasRenderingContext2D, w: World, k: string, t: Terrain, c: Point): void {
  const h = parseKey(k);
  const jitter = (i: number): Point => ({
    x: c.x + (hash2(7, h.q * 5 + i, h.r) - 0.5) * HEX_SIZE * 1.0,
    y: c.y + (hash2(11, h.q, h.r * 5 + i) - 0.5) * HEX_SIZE * 0.9,
  });
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  if (t === 'forest') {
    // The stand thins as it's cut: felled trees leave stumps.
    const standing = Math.ceil((3 * stockLeft(w, k)) / FOREST_STOCK);
    for (let i = 0; i < 3; i++) {
      const p = jitter(i);
      if (i >= standing) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 3, 3, 1.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#c9a875';
        ctx.fill();
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 9);
      ctx.lineTo(p.x - 5, p.y + 3);
      ctx.lineTo(p.x + 5, p.y + 3);
      ctx.closePath();
      ctx.fillStyle = '#9aa56b';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 3);
      ctx.lineTo(p.x, p.y + 6);
      ctx.stroke();
    }
  } else if (t === 'hills') {
    const humps = Math.ceil((2 * stockLeft(w, k)) / HILLS_STOCK); // quarrying wears them down
    for (let i = 0; i < humps; i++) {
      const p = jitter(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y + 5, 8, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      // hatching on the shaded flank
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.moveTo(p.x + 1 + j * 2.2, p.y - 1 + j * 1.2);
        ctx.lineTo(p.x + j * 2.2, p.y + 4);
        ctx.stroke();
      }
    }
  } else if (t === 'water') {
    for (let i = 0; i < 2; i++) {
      const p = jitter(i);
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y);
      ctx.quadraticCurveTo(p.x - 3.5, p.y - 3, p.x, p.y);
      ctx.quadraticCurveTo(p.x + 3.5, p.y + 3, p.x + 7, p.y);
      ctx.stroke();
    }
    // Fish show while the water holds them, and vanish when it's fished out.
    const fishLeft = Math.round((2 * stockLeft(w, k)) / FISH_STOCK);
    for (let i = 0; i < fishLeft; i++) {
      const p = jitter(i + 5);
      fish(ctx, p.x, p.y + 6, 13);
    }
  } else if (t === 'marsh') {
    for (let i = 0; i < 3; i++) {
      const p = jitter(i);
      ctx.beginPath();
      ctx.moveTo(p.x - 3, p.y - 3);
      ctx.lineTo(p.x, p.y + 3);
      ctx.lineTo(p.x + 3, p.y - 3);
      ctx.moveTo(p.x, p.y + 3);
      ctx.lineTo(p.x, p.y - 5);
      ctx.stroke();
    }
    const p = jitter(4);
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y);
    ctx.lineTo(p.x + 6, p.y);
    ctx.stroke();
  } else if (hash2(3, h.q, h.r) < 0.5) {
    // grass: a few pen ticks
    for (let i = 0; i < 2; i++) {
      const p = jitter(i);
      ctx.beginPath();
      ctx.moveTo(p.x - 2, p.y);
      ctx.lineTo(p.x - 1, p.y - 3);
      ctx.moveTo(p.x + 1, p.y);
      ctx.lineTo(p.x + 2, p.y - 3);
      ctx.stroke();
    }
  }
}

export const PLAZA_MIN_BUILDINGS = 3;

// Road tiles that serve several buildings at once are drawn as paved squares.
export function plazaTiles(w: World): Set<string> {
  const tiles = new Set<string>();
  for (const b of w.buildings.values()) {
    if (b.type !== 'road') continue;
    const served = neighborKeys(b.at).filter((n) => {
      const o = buildingAt(w, n);
      return o !== undefined && o.type !== 'road';
    }).length;
    if (served >= PLAZA_MIN_BUILDINGS) tiles.add(b.at);
  }
  return tiles;
}

function drawRoads(ctx: CanvasRenderingContext2D, w: World, visible: (p: Point) => boolean, overlay: boolean): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const roads = [...w.buildings.values()].filter((b) => b.type === 'road' && visible(center(b.at)));
  const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // Plazas: three roads all joined to each other pave the triangle between them.
  const plazas: [string, string, string][] = [];
  const paved = new Set<string>(); // joins inside a plaza get no rut line
  for (const r of roads) {
    const links = r.links ?? [];
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        const [b, c] = [links[i], links[j]];
        if (r.at < b && r.at < c && linked(w, b, c)) {
          plazas.push([r.at, b, c]);
          for (const e of [edgeKey(r.at, b), edgeKey(r.at, c), edgeKey(b, c)]) paved.add(e);
        }
      }
    }
  }

  // Each building gets one driveway, preferring a road that reaches the hearth, so a
  // house beside a street draws a single stub rather than a V. The hearth is the hub
  // and connects to every road around it.
  // Buildings beside a plaza tile open onto the plaza.
  const squares = plazaTiles(w);
  const driveway = new Map<number, string>();
  for (const b of w.buildings.values()) {
    if (b.type === 'road' || b.type === 'hearth') continue;
    const touching = neighborKeys(b.at).filter((n) => buildingAt(w, n)?.type === 'road');
    const pick =
      touching.find((n) => squares.has(n) && w.net.roads.has(n)) ??
      touching.find((n) => w.net.roads.has(n)) ??
      touching.find((n) => squares.has(n)) ??
      touching[0];
    if (pick) driveway.set(b.id, pick);
  }
  const squareHex = (b: Building): void => hexPath(ctx, center(b.at), HEX_SIZE * 0.62);

  // Half-segments from each road toward the roads it's joined to and the building it serves.
  const segments = (b: Building, fn: (c: Point, mid: Point, n: string) => void): void => {
    const c = center(b.at);
    let any = false;
    for (const n of neighborKeys(b.at)) {
      const other = buildingAt(w, n);
      if (!other) continue;
      if (other.type === 'road' ? !b.links?.includes(n) : other.type !== 'hearth' && driveway.get(other.id) !== b.at) continue;
      const nc = center(n);
      fn(c, { x: (c.x + nc.x) / 2, y: (c.y + nc.y) / 2 }, n);
      any = true;
    }
    if (!any) fn(c, c, b.at);
  };
  const stroke = (c: Point, mid: Point): void => {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(mid.x, mid.y);
    ctx.stroke();
  };
  const triangle = ([a, b, c]: [string, string, string]): void => {
    const [pa, pb, pc] = [center(a), center(b), center(c)];
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.closePath();
  };
  const washFor = (b: Building): string => {
    if (!overlay) return ROAD_WASH[b.tier];
    return w.net.roads.has(b.at) ? '#a9cfc6' : '#e3a08f';
  };

  // Two passes: ink edges first, then the wash on top, so joins read as one road.
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = HEX_SIZE * 0.42;
  for (const p of plazas) {
    triangle(p);
    ctx.fill();
    ctx.stroke();
  }
  for (const b of roads) {
    if (!squares.has(b.at)) continue;
    squareHex(b);
    ctx.fill();
    ctx.stroke();
  }
  for (const b of roads) segments(b, stroke);
  ctx.lineWidth = HEX_SIZE * 0.32;
  for (const p of plazas) {
    const first = buildingAt(w, p[0])!;
    ctx.strokeStyle = ctx.fillStyle = washFor(first);
    triangle(p);
    ctx.fill();
    ctx.stroke();
  }
  for (const b of roads) {
    if (!squares.has(b.at)) continue;
    ctx.strokeStyle = ctx.fillStyle = washFor(b);
    squareHex(b);
    ctx.fill();
    ctx.stroke();
  }
  for (const b of roads) {
    ctx.strokeStyle = washFor(b);
    segments(b, stroke);
  }
  // Dirt roads get a dashed rut (not across plazas); cobble gets stones.
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK_SOFT;
  for (const b of roads) {
    if (b.tier === 0) {
      if (squares.has(b.at)) continue; // paved: no rut
      ctx.setLineDash([3, 4]);
      segments(b, (c, mid, n) => {
        if (!paved.has(edgeKey(b.at, n))) stroke(c, mid);
      });
      ctx.setLineDash([]);
    } else {
      const c = center(b.at);
      const h = parseKey(b.at);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(c.x + (hash2(5, h.q + i, h.r) - 0.5) * 8, c.y + (hash2(9, h.q, h.r + i) - 0.5) * 8, 1.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, w: World, b: Building, overlay: boolean, now: number): void {
  const c = center(b.at);
  hexPath(ctx, c, HEX_SIZE * 0.82);
  ctx.fillStyle = BUILDING_WASH[b.type];
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Upgraded buildings get a double-ruled border.
  if (b.tier > 0) {
    hexPath(ctx, c, HEX_SIZE * 0.74);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  drawGlyph(ctx, glyphFor(b), c.x, c.y - 1, HEX_SIZE * 0.62);

  // Tier marks: small inked diamonds along the bottom edge.
  for (let i = 0; i < b.tier; i++) {
    const x = c.x - (b.tier - 1) * 4 + i * 8;
    const y = c.y + HEX_SIZE * 0.58;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x, y + 3);
    ctx.lineTo(x - 3, y);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
  }

  const connected = w.net.buildings.has(b.id);
  if (!connected) {
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 250);
    drawGlyph(ctx, 'warning', c.x + HEX_SIZE * 0.5, c.y - HEX_SIZE * 0.5, HEX_SIZE * 0.36);
    ctx.globalAlpha = 1;
  }
  if (overlay) {
    hexPath(ctx, c, HEX_SIZE * 0.92);
    ctx.strokeStyle = connected ? TEAL_INK : VERMILION;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Stores show how full they are; dedicated stores in the colour of their good.
  if (isStore(b) && b.type !== 'hearth') {
    const goods = STORED.filter((r) => accepts(b, r));
    const held = goods.reduce((n, r) => n + stockAt(b, r), 0);
    const room = goods.reduce((n, r) => n + holdsAt(b, r), 0);
    meter(ctx, c, room ? held / room : 0, goods.length === 1 ? RESOURCE_WASH[goods[0]] : INK_SOFT, 0.9);
  }

  // An upgrade under way: a gold arrow, and a meter of supplies delivered.
  if (b.order) {
    const next = DEFS[b.type].tiers[b.tier + 1]?.cost ?? {};
    const goods = STORED.filter((r) => next[r]);
    const need = goods.reduce((n, r) => n + next[r]!, 0);
    const got = goods.reduce((n, r) => n + (b.order!.supplies[r] ?? 0), 0);
    drawGlyph(ctx, 'upgrade', c.x - HEX_SIZE * 0.5, c.y - HEX_SIZE * 0.5, HEX_SIZE * 0.32);
    meter(ctx, c, need ? got / need : 1, '#d9b95a', isStore(b) ? 0.78 : 0.9);
  }

  if (b.blight > 0) {
    // Ink blots of rot creeping across the field.
    const h = parseKey(b.at);
    ctx.fillStyle = BLIGHT_INK;
    ctx.globalAlpha = 0.35 + 0.4 * b.blight;
    const blots = 2 + Math.ceil(b.blight * 5);
    for (let i = 0; i < blots; i++) {
      const x = c.x + (hash2(21, h.q + i, h.r) - 0.5) * HEX_SIZE * 1.0;
      const y = c.y + (hash2(23, h.q, h.r + i) - 0.5) * HEX_SIZE * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 2 + hash2(29, h.q + i, h.r + i) * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    meter(ctx, c, b.blight, BLIGHT_INK, 0.92);
  }

  if (b.fire > 0) {
    const flicker = 0.5 + 0.5 * Math.sin(now / 90 + b.id);
    hexPath(ctx, c, HEX_SIZE * 0.82);
    ctx.fillStyle = `rgba(181,69,42,${0.25 + 0.25 * flicker})`;
    ctx.fill();
    drawGlyph(ctx, 'flame', c.x - HEX_SIZE * 0.42, c.y - HEX_SIZE * 0.42, HEX_SIZE * (0.4 + 0.06 * flicker));
    meter(ctx, c, b.fire, VERMILION, 0.78);
  }
}

// A small inked progress bar beneath a building.
function meter(ctx: CanvasRenderingContext2D, c: Point, value: number, color: string, offset: number): void {
  const barW = HEX_SIZE * 1.1;
  const y = c.y + HEX_SIZE * offset;
  ctx.fillStyle = PAPER_DARK;
  ctx.fillRect(c.x - barW / 2, y, barW, 4);
  ctx.fillStyle = color;
  ctx.fillRect(c.x - barW / 2, y, barW * value, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(c.x - barW / 2, y, barW, 4);
}

// Floodwater: a grey-blue wash over everything on the hex, with drifting ripples.
function drawFloods(ctx: CanvasRenderingContext2D, w: World, visible: (p: Point) => boolean, now: number): void {
  if (!w.floods.size) return;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(40,70,90,0.45)';
  for (const k of w.floods.keys()) {
    const c = center(k);
    if (!visible(c)) continue;
    hexPath(ctx, c, HEX_SIZE);
    ctx.fillStyle = FLOOD_WASH;
    ctx.fill();
    const drift = Math.sin(now / 600 + c.x * 0.05) * 3;
    for (const dy of [-8, 2, 12]) {
      ctx.beginPath();
      ctx.moveTo(c.x - 10 + drift, c.y + dy);
      ctx.quadraticCurveTo(c.x - 5 + drift, c.y + dy - 3, c.x + drift, c.y + dy);
      ctx.quadraticCurveTo(c.x + 5 + drift, c.y + dy + 3, c.x + 10 + drift, c.y + dy);
      ctx.stroke();
    }
  }
}

// Interpolated position of a mover, nudged by id so groups don't stack.
function moverPos(m: Mover, id: number, spread: number): Point & { leftward: boolean } {
  const a = center(m.at);
  const b = m.next ? center(m.next) : a;
  const t = Math.max(0, Math.min(1, m.t)); // raiders start with negative t to stagger their column
  return {
    x: a.x + (b.x - a.x) * t + Math.cos(id * 2.399) * spread,
    y: a.y + (b.y - a.y) * t + Math.sin(id * 2.399) * spread,
    leftward: b.x < a.x,
  };
}

function healthBar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, color: string): void {
  if (frac >= 1) return;
  ctx.fillStyle = PAPER_DARK;
  ctx.fillRect(x - 7, y, 14, 2.5);
  ctx.fillStyle = color;
  ctx.fillRect(x - 7, y, 14 * Math.max(0, frac), 2.5);
}

function drawMonsters(ctx: CanvasRenderingContext2D, w: World): void {
  for (const m of w.monsters) {
    if (m.t < 0) continue; // still waiting its turn in the column
    const p = moverPos(m, m.id, 6);
    ctx.save();
    if (m.kind === 'wolf' && p.leftward) {
      // face the direction of travel
      ctx.translate(p.x, p.y);
      ctx.scale(-1, 1);
      ctx.translate(-p.x, -p.y);
    }
    drawGlyph(ctx, m.kind, p.x, p.y, HEX_SIZE * (m.kind === 'wolf' ? 0.42 : 0.4));
    ctx.restore();
    healthBar(ctx, p.x, p.y - HEX_SIZE * 0.5, m.hp / MONSTER_STATS[m.kind].hp, VERMILION);
  }
}

// Soldiers: indigo figures with a spear and round shield.
function drawWarriors(ctx: CanvasRenderingContext2D, w: World): void {
  for (const x of w.warriors) {
    const b = w.buildings.get(x.barracks);
    if (!b) continue;
    const p = moverPos(x, x.id, x.state === 'guard' ? 11 : 4);
    ctx.fillStyle = WARRIOR_INK;
    ctx.beginPath();
    ctx.moveTo(p.x - 3.5, p.y + 5);
    ctx.lineTo(p.x, p.y - 1);
    ctx.lineTo(p.x + 3.5, p.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y - 3.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x + 5, p.y + 6);
    ctx.lineTo(p.x + 5, p.y - 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x - 4, p.y + 2, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = b.tier > 0 ? '#9a968c' : '#c69a5c';
    ctx.fill();
    ctx.stroke();
    healthBar(ctx, p.x, p.y - 12, x.hp / warriorStats(b).hp, WARRIOR_INK);
  }
}

function coverageFor(type: BuildingType | undefined, b: Building | undefined): { radius: number; color: string } | null {
  switch (type) {
    case 'well':
      return { radius: WELL_RADIUS, color: 'rgba(70,110,130,0.16)' };
    case 'tower':
      return { radius: TOWER_RADIUS, color: 'rgba(168,116,26,0.14)' };
    case 'chapel':
      return { radius: CHAPEL_RADIUS, color: 'rgba(122,90,58,0.13)' };
    case 'dike':
      return { radius: DIKE_RADIUS, color: 'rgba(77,111,128,0.18)' };
    case 'barracks':
      return { radius: b ? patrolRadius(b) : DEFS.barracks.tiers[0].radius!, color: 'rgba(36,64,90,0.12)' };
    default:
      return null;
  }
}

function drawVillagers(ctx: CanvasRenderingContext2D, w: World): void {
  for (const v of w.villagers.values()) {
    const { from, to, t } = villagerHexes(v);
    const a = center(from);
    const b = center(to);
    // Spread villagers sharing a hex so they don't stack into one mark.
    const angle = v.id * 2.399;
    const spread = v.path ? 4 : 10;
    const x = a.x + (b.x - a.x) * t + Math.cos(angle) * spread;
    const y = a.y + (b.y - a.y) * t + Math.sin(angle) * spread;
    // A tiny inked figure: head over a cloak.
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 4);
    ctx.lineTo(x, y - 1);
    ctx.lineTo(x + 3, y + 4);
    ctx.closePath();
    ctx.fillStyle = v.hunger || v.cold ? VERMILION : INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 3, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (v.carry) {
      ctx.fillStyle = RESOURCE_WASH[v.carry.res];
      ctx.fillRect(x + 2.5, y - 6, 4, 4);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x + 2.5, y - 6, 4, 4);
    }
  }
}

function drawHover(ctx: CanvasRenderingContext2D, w: World, ui: UiState): void {
  const k = ui.hover;
  if (!k || !w.terrain.has(k)) return;
  const c = center(k);
  const tool = ui.tool;
  const hovered = buildingAt(w, k);

  // Show the reach of wells, towers and dikes when placing or inspecting one.
  const covering = tool?.kind === 'build' ? tool.type : !tool ? hovered?.type : undefined;
  const coverage = coverageFor(covering, tool ? undefined : hovered);
  if (coverage) {
    for (const h of hexesInRange(parseKey(k), coverage.radius)) {
      hexPath(ctx, hexToPixel(h, HEX_SIZE), HEX_SIZE);
      ctx.fillStyle = coverage.color;
      ctx.fill();
    }
  }

  // Placing (or inspecting) a gatherer: ring the tiles it would work.
  const gatherType = tool?.kind === 'build' ? tool.type : !tool ? hovered?.type : undefined;
  if (gatherType && MATERIAL[gatherType]) {
    ctx.strokeStyle = TEAL_INK;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    for (const t of gatherTiles(w, gatherType, k)) {
      hexPath(ctx, center(t), HEX_SIZE * 0.86);
      ctx.fillStyle = 'rgba(47,106,102,0.12)';
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Upgrading something with prerequisites: show where qualifying buildings reach.
  const needs = tool?.kind === 'upgrade' && hovered ? DEFS[hovered.type].tiers[hovered.tier + 1]?.needs ?? [] : [];
  for (const need of needs) {
    const types: readonly BuildingType[] = typeof need.type === 'string' ? [need.type] : need.type;
    const color = coverageFor(types[0], undefined)?.color ?? 'rgba(43,29,14,0.1)';
    for (const o of w.buildings.values()) {
      if (!types.includes(o.type) || !w.net.buildings.has(o.id)) continue;
      for (const h of hexesInRange(parseKey(o.at), need.within)) {
        hexPath(ctx, hexToPixel(h, HEX_SIZE), HEX_SIZE);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }

  let ok: boolean | null = null;
  if (tool?.kind === 'build') ok = placeError(w, tool.type, k) === null;
  else if (tool?.kind === 'upgrade') ok = upgradeError(w, hovered) === null;
  else if (tool?.kind === 'demolish') ok = demolishError(hovered) === null;

  hexPath(ctx, c, HEX_SIZE);
  if (ok !== null) {
    ctx.fillStyle = ok ? 'rgba(90,120,60,0.25)' : 'rgba(181,69,42,0.25)';
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (tool?.kind === 'build' && !hovered && tool.type !== 'road') {
    ctx.globalAlpha = 0.5;
    drawGlyph(ctx, tool.type, c.x, c.y - 1, HEX_SIZE * 0.62);
    ctx.globalAlpha = 1;
  }
}

// Upgraded buildings get their own drawing so higher tiers read at a glance.
const TIER_GLYPHS: Partial<Record<BuildingType, readonly Glyph[]>> = {
  hearth: ['hearth', 'longhouse', 'moot-hall'],
  house: ['house', 'cottage', 'townhouse'],
  farm: ['farm', 'irrigated-field'],
  woodcutter: ['woodcutter', 'lumber-camp'],
  quarry: ['quarry', 'deep-quarry'],
  granary: ['granary', 'stone-granary'],
  woodshed: ['woodshed', 'lumber-yard'],
  stoneyard: ['stoneyard', 'stone-depot'],
  barracks: ['barracks', 'garrison'],
  fishery: ['fishery', 'fishing-fleet'],
  cathedral: ['cathedral-foundations', 'cathedral-nave', 'cathedral'],
};

const glyphFor = (b: Building): Glyph => TIER_GLYPHS[b.type]?.[b.tier] ?? b.type;

// Discoveries on revealed land: fertile valleys get a golden wash; ruins,
// homesteads and iron veins get a mark until they're claimed or built on.
function drawFeatures(ctx: CanvasRenderingContext2D, w: World, visible: (p: Point) => boolean): void {
  for (const [k, kind] of w.features) {
    if (!w.revealed.has(k)) continue;
    const c = center(k);
    if (!visible(c)) continue;
    if (kind === 'fertile') {
      hexPath(ctx, c, HEX_SIZE);
      ctx.fillStyle = 'rgba(217,168,58,0.22)';
      ctx.fill();
      if (w.byHex.has(k)) continue;
      ctx.strokeStyle = '#a8741a';
      ctx.lineWidth = 1;
      const h = parseKey(k);
      for (let i = 0; i < 3; i++) {
        const x = c.x + (hash2(31, h.q + i, h.r) - 0.5) * HEX_SIZE;
        const y = c.y + (hash2(37, h.q, h.r + i) - 0.5) * HEX_SIZE * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x, y - 4);
        ctx.moveTo(x, y - 1);
        ctx.lineTo(x - 2.5, y - 4);
        ctx.moveTo(x, y - 1);
        ctx.lineTo(x + 2.5, y - 4);
        ctx.stroke();
      }
      continue;
    }
    if (w.byHex.has(k)) continue;
    if (kind === 'iron' && ironLeft(w, k) <= 0) continue;
    if (kind === 'homestead' && w.claimed.has(k)) continue;
    ctx.globalAlpha = kind === 'ruins' && w.claimed.has(k) ? 0.35 : 1; // searched ruins fade
    drawGlyph(ctx, kind === 'iron' ? 'vein' : kind, c.x, c.y, HEX_SIZE * 0.55);
    ctx.globalAlpha = 1;
  }
}
