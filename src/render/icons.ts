// Hand-inked pictograms, shared by the map and the toolbar. Each draws centered
// on (x, y) within a radius of roughly `s`.
import type { BuildingType } from '../sim/buildings';
import { INK, PAPER, RESOURCE_WASH, TEAL_INK, VERMILION, WARRIOR_INK } from './palette';

export type Glyph =
  | BuildingType
  | 'upgrade'
  | 'demolish'
  | 'network'
  | 'flame'
  | 'warning'
  | 'wolf'
  | 'raider'
  | 'cart'
  | 'cathedral-foundations'
  | 'cathedral-nave'
  | 'ruins'
  | 'homestead'
  | 'vein';

type Ctx = CanvasRenderingContext2D;

export function drawGlyph(ctx: Ctx, glyph: Glyph, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 0.08;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  GLYPHS[glyph](ctx);
  ctx.restore();
}

const fillStroke = (ctx: Ctx, fill: string): void => {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
};

function flame(ctx: Ctx, scale: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -0.5 * scale);
  ctx.quadraticCurveTo(0.38 * scale, -0.05 * scale, 0.22 * scale, 0.3 * scale);
  ctx.quadraticCurveTo(0, 0.42 * scale, -0.22 * scale, 0.3 * scale);
  ctx.quadraticCurveTo(-0.38 * scale, -0.05 * scale, 0, -0.5 * scale);
  fillStroke(ctx, VERMILION);
}

// A small fish, nose pointing left, centered on (x, y).
export function fish(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 0.3 * s, y);
  ctx.quadraticCurveTo(x, y - 0.2 * s, x + 0.2 * s, y);
  ctx.lineTo(x + 0.35 * s, y - 0.12 * s);
  ctx.lineTo(x + 0.35 * s, y + 0.12 * s);
  ctx.lineTo(x + 0.2 * s, y);
  ctx.quadraticCurveTo(x, y + 0.2 * s, x - 0.3 * s, y);
  fillStroke(ctx, '#8fa6ae');
}

// The cathedral's body: a long nave under a pitched roof, with a rose window.
function nave(ctx: Ctx): void {
  ctx.beginPath();
  ctx.rect(-0.46, -0.08, 0.92, 0.52);
  fillStroke(ctx, PAPER);
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.06);
  ctx.lineTo(-0.36, -0.3);
  ctx.lineTo(0.36, -0.3);
  ctx.lineTo(0.5, -0.06);
  ctx.closePath();
  fillStroke(ctx, '#7a5a3a');
  ctx.beginPath();
  ctx.arc(0, 0.12, 0.11, 0, Math.PI * 2);
  fillStroke(ctx, '#c9b46a');
  ctx.beginPath();
  ctx.moveTo(-0.08, 0.44);
  ctx.lineTo(-0.08, 0.3);
  ctx.quadraticCurveTo(0, 0.22, 0.08, 0.3);
  ctx.lineTo(0.08, 0.44);
  ctx.stroke();
}

function tree(ctx: Ctx, x: number, y: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x - h * 0.45, y);
  ctx.lineTo(x + h * 0.45, y);
  ctx.closePath();
  fillStroke(ctx, '#8f9a62');
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h * 0.25);
  ctx.stroke();
}

const GLYPHS: Record<Glyph, (ctx: Ctx) => void> = {
  hearth(ctx) {
    ctx.beginPath();
    ctx.ellipse(0, 0.32, 0.5, 0.16, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#bfb5a0');
    ctx.translate(0, -0.05);
    flame(ctx, 1.1);
  },
  road(ctx) {
    ctx.lineWidth = 0.28;
    ctx.strokeStyle = '#c9a875';
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.4);
    ctx.quadraticCurveTo(0, 0.1, 0.55, -0.4);
    ctx.stroke();
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = INK;
    ctx.setLineDash([0.12, 0.1]);
    ctx.stroke();
    ctx.setLineDash([]);
  },
  house(ctx) {
    ctx.beginPath();
    ctx.rect(-0.38, -0.05, 0.76, 0.5);
    fillStroke(ctx, PAPER);
    ctx.beginPath();
    ctx.moveTo(-0.52, -0.02);
    ctx.lineTo(0, -0.5);
    ctx.lineTo(0.52, -0.02);
    ctx.closePath();
    fillStroke(ctx, '#a35a32');
    ctx.beginPath();
    ctx.rect(-0.1, 0.17, 0.2, 0.28);
    ctx.stroke();
  },
  farm(ctx) {
    ctx.beginPath();
    ctx.ellipse(0, 0.05, 0.55, 0.42, 0, 0, Math.PI * 2);
    fillStroke(ctx, RESOURCE_WASH.food);
    ctx.save();
    ctx.clip();
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.7, i * 0.15 + 0.25);
      ctx.lineTo(0.7, i * 0.15 - 0.15);
      ctx.stroke();
    }
    ctx.restore();
  },
  woodcutter(ctx) {
    tree(ctx, -0.18, 0.25, 0.6);
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(0.1, 0.45);
    ctx.lineTo(0.48, -0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.36, -0.28);
    ctx.lineTo(0.62, -0.12);
    ctx.lineTo(0.52, 0.02);
    ctx.lineTo(0.42, -0.1);
    ctx.closePath();
    fillStroke(ctx, '#9a968c');
  },
  quarry(ctx) {
    const block = (x: number, y: number) => {
      ctx.beginPath();
      ctx.rect(x, y, 0.42, 0.3);
      fillStroke(ctx, RESOURCE_WASH.stone);
    };
    block(-0.46, 0.12);
    block(0.04, 0.12);
    block(-0.21, -0.2);
  },
  storehouse(ctx) {
    ctx.beginPath();
    ctx.rect(-0.42, -0.36, 0.84, 0.76);
    fillStroke(ctx, '#c69a5c');
    ctx.beginPath();
    ctx.moveTo(-0.42, -0.36);
    ctx.lineTo(0.42, 0.4);
    ctx.moveTo(0.42, -0.36);
    ctx.lineTo(-0.42, 0.4);
    ctx.stroke();
  },
  well(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.36, 0.2);
    ctx.lineTo(-0.36, -0.42);
    ctx.moveTo(0.36, 0.2);
    ctx.lineTo(0.36, -0.42);
    ctx.moveTo(-0.46, -0.42);
    ctx.lineTo(0.46, -0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0.25, 0.42, 0.18, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#6f8fa0');
    ctx.beginPath();
    ctx.moveTo(0, -0.42);
    ctx.lineTo(0, -0.05);
    ctx.stroke();
  },
  tower(ctx) {
    // Tapered timber tower with a peaked lookout.
    ctx.beginPath();
    ctx.moveTo(-0.24, 0.48);
    ctx.lineTo(-0.15, -0.18);
    ctx.lineTo(0.15, -0.18);
    ctx.lineTo(0.24, 0.48);
    ctx.closePath();
    fillStroke(ctx, '#c69a5c');
    ctx.beginPath();
    ctx.moveTo(-0.2, 0.12);
    ctx.lineTo(0.2, 0.12);
    ctx.moveTo(-0.17, 0.12);
    ctx.lineTo(0.22, 0.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-0.28, -0.3, 0.56, 0.14);
    fillStroke(ctx, PAPER);
    ctx.beginPath();
    ctx.moveTo(-0.32, -0.3);
    ctx.lineTo(0, -0.56);
    ctx.lineTo(0.32, -0.3);
    ctx.closePath();
    fillStroke(ctx, '#a35a32');
  },
  dike(ctx) {
    // Banked earth wall holding back water lines.
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.2);
    ctx.lineTo(-0.3, -0.18);
    ctx.lineTo(0.3, -0.18);
    ctx.lineTo(0.55, 0.2);
    ctx.closePath();
    fillStroke(ctx, '#a8946f');
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 0.14, -0.18);
      ctx.lineTo(i * 0.14 - 0.06, 0.2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#4d6f80';
    for (const y of [0.34, 0.48]) {
      ctx.beginPath();
      ctx.moveTo(-0.5, y);
      ctx.quadraticCurveTo(-0.25, y - 0.08, 0, y);
      ctx.quadraticCurveTo(0.25, y + 0.08, 0.5, y);
      ctx.stroke();
    }
  },
  wolf(ctx) {
    // Side-on silhouette: body, raised head, pointed ear, tail.
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.05);
    ctx.quadraticCurveTo(-0.62, 0.1, -0.7, 0.05);
    ctx.lineTo(-0.48, 0.08);
    ctx.lineTo(-0.42, 0.42);
    ctx.lineTo(-0.32, 0.42);
    ctx.lineTo(-0.3, 0.15);
    ctx.lineTo(0.2, 0.15);
    ctx.lineTo(0.24, 0.42);
    ctx.lineTo(0.34, 0.42);
    ctx.lineTo(0.36, 0.05);
    ctx.lineTo(0.62, -0.08);
    ctx.lineTo(0.5, -0.22);
    ctx.lineTo(0.42, -0.42);
    ctx.lineTo(0.34, -0.22);
    ctx.quadraticCurveTo(0, -0.24, -0.5, -0.05);
    ctx.closePath();
    fillStroke(ctx, '#5a5650');
  },
  granary(ctx) {
    // Round silo with a conical thatch roof.
    ctx.beginPath();
    ctx.rect(-0.32, -0.12, 0.64, 0.58);
    fillStroke(ctx, PAPER);
    ctx.beginPath();
    ctx.moveTo(-0.32, 0.17);
    ctx.lineTo(0.32, 0.17);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.44, -0.1);
    ctx.lineTo(0, -0.56);
    ctx.lineTo(0.44, -0.1);
    ctx.closePath();
    fillStroke(ctx, RESOURCE_WASH.food);
    for (const x of [-0.15, 0, 0.15]) {
      ctx.beginPath();
      ctx.moveTo(x * 0.3, -0.48);
      ctx.lineTo(x * 2, -0.12);
      ctx.stroke();
    }
  },
  market(ctx) {
    // Stall with a striped awning over a counter.
    ctx.beginPath();
    ctx.moveTo(-0.38, 0.45);
    ctx.lineTo(-0.38, -0.12);
    ctx.moveTo(0.38, 0.45);
    ctx.lineTo(0.38, -0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.12);
    ctx.lineTo(-0.38, -0.45);
    ctx.lineTo(0.38, -0.45);
    ctx.lineTo(0.5, -0.12);
    ctx.closePath();
    fillStroke(ctx, PAPER);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = VERMILION;
    for (const x of [-0.36, -0.08, 0.2]) ctx.fillRect(x, -0.5, 0.14, 0.4);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.12);
    ctx.lineTo(-0.38, -0.45);
    ctx.lineTo(0.38, -0.45);
    ctx.lineTo(0.5, -0.12);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-0.38, 0.12, 0.76, 0.14);
    fillStroke(ctx, '#c69a5c');
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.08, 0, Math.PI * 2);
    fillStroke(ctx, RESOURCE_WASH.coin);
  },
  barracks(ctx) {
    // Longhouse under a pennant, with crossed spears.
    ctx.beginPath();
    ctx.rect(-0.42, -0.02, 0.84, 0.46);
    fillStroke(ctx, PAPER);
    ctx.beginPath();
    ctx.moveTo(-0.5, 0);
    ctx.lineTo(-0.36, -0.26);
    ctx.lineTo(0.36, -0.26);
    ctx.lineTo(0.5, 0);
    ctx.closePath();
    fillStroke(ctx, '#7a5a3a');
    ctx.beginPath();
    ctx.moveTo(0, -0.26);
    ctx.lineTo(0, -0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.6);
    ctx.lineTo(0.28, -0.52);
    ctx.lineTo(0, -0.44);
    ctx.closePath();
    fillStroke(ctx, WARRIOR_INK);
    ctx.beginPath();
    ctx.moveTo(-0.28, 0.4);
    ctx.lineTo(0.28, 0.04);
    ctx.moveTo(0.28, 0.4);
    ctx.lineTo(-0.28, 0.04);
    ctx.stroke();
  },
  raider(ctx) {
    // Hooded figure with a torch.
    ctx.beginPath();
    ctx.moveTo(-0.3, 0.5);
    ctx.lineTo(-0.18, -0.1);
    ctx.quadraticCurveTo(-0.2, -0.48, 0, -0.5);
    ctx.quadraticCurveTo(0.2, -0.48, 0.18, -0.1);
    ctx.lineTo(0.3, 0.5);
    ctx.closePath();
    fillStroke(ctx, '#4a2a22');
    ctx.beginPath();
    ctx.moveTo(0.22, 0.1);
    ctx.lineTo(0.48, -0.3);
    ctx.stroke();
    ctx.save();
    ctx.translate(0.5, -0.4);
    ctx.scale(0.35, 0.35);
    flame(ctx, 1);
    ctx.restore();
  },
  cart(ctx) {
    // Covered trader's wagon.
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.15);
    ctx.lineTo(-0.42, -0.35);
    ctx.quadraticCurveTo(0, -0.6, 0.42, -0.35);
    ctx.lineTo(0.5, 0.15);
    ctx.closePath();
    fillStroke(ctx, PAPER);
    ctx.beginPath();
    ctx.rect(-0.55, 0.12, 1.1, 0.14);
    fillStroke(ctx, '#7a5a3a');
    for (const x of [-0.3, 0.3]) {
      ctx.beginPath();
      ctx.arc(x, 0.36, 0.13, 0, Math.PI * 2);
      fillStroke(ctx, PAPER);
    }
  },
  woodshed(ctx) {
    // An open lean-to over stacked log ends.
    ctx.beginPath();
    ctx.moveTo(-0.52, -0.12);
    ctx.lineTo(0.52, -0.4);
    ctx.lineTo(0.52, -0.26);
    ctx.lineTo(-0.52, 0.02);
    ctx.closePath();
    fillStroke(ctx, '#a35a32');
    ctx.beginPath();
    ctx.moveTo(-0.44, 0);
    ctx.lineTo(-0.44, 0.45);
    ctx.moveTo(0.44, -0.24);
    ctx.lineTo(0.44, 0.45);
    ctx.stroke();
    for (const [x, y] of [[-0.2, 0.33], [0.04, 0.33], [0.28, 0.33], [-0.08, 0.13], [0.16, 0.13]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.11, 0, Math.PI * 2);
      fillStroke(ctx, '#c9a875');
      ctx.beginPath();
      ctx.arc(x, y, 0.04, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  stoneyard(ctx) {
    // Dressed blocks stacked in a low pyramid, inside a post fence.
    const block = (x: number, y: number) => {
      ctx.beginPath();
      ctx.rect(x, y, 0.3, 0.2);
      fillStroke(ctx, RESOURCE_WASH.stone);
    };
    block(-0.46, 0.22);
    block(-0.15, 0.22);
    block(0.16, 0.22);
    block(-0.3, 0.02);
    block(0.0, 0.02);
    block(-0.15, -0.18);
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.45);
    ctx.lineTo(0.55, 0.45);
    ctx.stroke();
  },
  oreshed(ctx) {
    // A squat stone shed with iron ingots at the door.
    ctx.beginPath();
    ctx.rect(-0.38, -0.12, 0.76, 0.5);
    fillStroke(ctx, '#cbc3b1');
    ctx.beginPath();
    ctx.moveTo(-0.46, -0.1);
    ctx.lineTo(0, -0.42);
    ctx.lineTo(0.46, -0.1);
    ctx.closePath();
    fillStroke(ctx, '#5d6670');
    ctx.beginPath();
    ctx.rect(-0.12, 0.08, 0.24, 0.3);
    fillStroke(ctx, INK);
    for (const x of [-0.5, 0.26]) {
      ctx.beginPath();
      ctx.moveTo(x, 0.46);
      ctx.lineTo(x + 0.06, 0.36);
      ctx.lineTo(x + 0.22, 0.36);
      ctx.lineTo(x + 0.26, 0.46);
      ctx.closePath();
      fillStroke(ctx, RESOURCE_WASH.iron);
    }
  },
  fishery(ctx) {
    // A little boat on the water with a hanging fish.
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.08);
    ctx.lineTo(0.5, 0.08);
    ctx.quadraticCurveTo(0.38, 0.36, 0, 0.36);
    ctx.quadraticCurveTo(-0.38, 0.36, -0.5, 0.08);
    fillStroke(ctx, '#7a5a3a');
    ctx.beginPath();
    ctx.moveTo(-0.05, 0.08);
    ctx.lineTo(-0.05, -0.52);
    ctx.lineTo(0.3, -0.52);
    ctx.lineTo(0.3, -0.3);
    ctx.stroke();
    fish(ctx, 0.3, -0.15, 0.55);
    ctx.strokeStyle = '#4d6f80';
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.48);
    ctx.quadraticCurveTo(-0.27, 0.4, 0, 0.48);
    ctx.quadraticCurveTo(0.27, 0.56, 0.55, 0.48);
    ctx.stroke();
  },
  mine(ctx) {
    // Timbered adit in a hillside, with a pick.
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.42);
    ctx.quadraticCurveTo(0, -0.7, 0.55, 0.42);
    ctx.closePath();
    fillStroke(ctx, '#a8946f');
    ctx.beginPath();
    ctx.moveTo(-0.2, 0.42);
    ctx.lineTo(-0.2, 0.02);
    ctx.lineTo(0.2, 0.02);
    ctx.lineTo(0.2, 0.42);
    fillStroke(ctx, INK);
    ctx.beginPath();
    ctx.moveTo(-0.26, 0.02);
    ctx.lineTo(0.26, 0.02);
    ctx.stroke();
    for (const [x, y] of [[0.36, 0.3], [-0.38, 0.28]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.06, 0, Math.PI * 2);
      fillStroke(ctx, RESOURCE_WASH.iron);
    }
  },
  'cathedral-foundations'(ctx) {
    // Laid stones and a scaffold pole.
    ctx.setLineDash([0.1, 0.07]);
    ctx.beginPath();
    ctx.rect(-0.45, -0.05, 0.9, 0.48);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.rect(-0.45 + i * 0.24, 0.29, 0.18, 0.14);
      fillStroke(ctx, RESOURCE_WASH.stone);
    }
    ctx.beginPath();
    ctx.moveTo(0.3, 0.29);
    ctx.lineTo(0.3, -0.5);
    ctx.moveTo(0.3, -0.5);
    ctx.lineTo(0.05, -0.3);
    ctx.stroke();
  },
  'cathedral-nave'(ctx) {
    nave(ctx);
    ctx.beginPath();
    ctx.moveTo(0.36, -0.1);
    ctx.lineTo(0.36, -0.55);
    ctx.stroke();
  },
  cathedral(ctx) {
    nave(ctx);
    // Spire over the crossing.
    ctx.beginPath();
    ctx.rect(-0.14, -0.38, 0.28, 0.3);
    fillStroke(ctx, PAPER);
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.38);
    ctx.lineTo(0, -0.78);
    ctx.lineTo(0.17, -0.38);
    ctx.closePath();
    fillStroke(ctx, '#5d6670');
    ctx.beginPath();
    ctx.arc(0, -0.82, 0.04, 0, Math.PI * 2);
    fillStroke(ctx, RESOURCE_WASH.coin);
  },
  ruins(ctx) {
    // Broken columns and a fallen lintel.
    for (const [x, h] of [[-0.32, 0.6], [0.02, 0.38], [0.32, 0.5]]) {
      ctx.beginPath();
      ctx.rect(x - 0.08, 0.35 - h, 0.16, h);
      fillStroke(ctx, '#d2c7b0');
    }
    ctx.beginPath();
    ctx.rect(-0.2, 0.35, 0.55, 0.1);
    fillStroke(ctx, '#d2c7b0');
  },
  homestead(ctx) {
    // An empty cottage outline with a thin curl of smoke.
    ctx.beginPath();
    ctx.rect(-0.3, -0.02, 0.6, 0.4);
    fillStroke(ctx, PAPER);
    ctx.beginPath();
    ctx.moveTo(-0.4, 0);
    ctx.lineTo(0, -0.35);
    ctx.lineTo(0.4, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.2, -0.2);
    ctx.quadraticCurveTo(0.35, -0.4, 0.22, -0.52);
    ctx.quadraticCurveTo(0.1, -0.64, 0.25, -0.75);
    ctx.stroke();
  },
  vein(ctx) {
    // Dark ore glinting out of rock.
    ctx.beginPath();
    ctx.moveTo(-0.45, 0.3);
    ctx.lineTo(-0.3, -0.2);
    ctx.lineTo(0.1, -0.35);
    ctx.lineTo(0.45, 0.05);
    ctx.lineTo(0.35, 0.35);
    ctx.closePath();
    fillStroke(ctx, '#b9b0a0');
    ctx.fillStyle = RESOURCE_WASH.iron;
    for (const [x, y, r] of [[-0.12, 0.02, 0.1], [0.15, -0.08, 0.07], [0.12, 0.18, 0.08]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  upgrade(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -0.5);
    ctx.lineTo(0.42, -0.05);
    ctx.lineTo(0.16, -0.05);
    ctx.lineTo(0.16, 0.45);
    ctx.lineTo(-0.16, 0.45);
    ctx.lineTo(-0.16, -0.05);
    ctx.lineTo(-0.42, -0.05);
    ctx.closePath();
    fillStroke(ctx, '#d9b95a');
  },
  demolish(ctx) {
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = VERMILION;
    ctx.beginPath();
    ctx.moveTo(-0.38, -0.38);
    ctx.lineTo(0.38, 0.38);
    ctx.moveTo(0.38, -0.38);
    ctx.lineTo(-0.38, 0.38);
    ctx.stroke();
  },
  network(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -0.42);
    ctx.lineTo(0.12, 0);
    ctx.lineTo(0, 0.42);
    ctx.lineTo(-0.12, 0);
    ctx.closePath();
    fillStroke(ctx, TEAL_INK);
  },
  flame(ctx) {
    flame(ctx, 1);
  },
  warning(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.45, 0, Math.PI * 2);
    fillStroke(ctx, PAPER);
    ctx.strokeStyle = VERMILION;
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(0, -0.25);
    ctx.lineTo(0, 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0.22, 0.04, 0, Math.PI * 2);
    ctx.stroke();
  },
};
