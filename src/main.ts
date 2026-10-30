import { hexToPixel, parseKey } from './hex';
import { createSaveBackend, toggleFullscreen } from './platform';
import type { Camera, Viewport } from './render/camera';
import { HEX_SIZE, render } from './render/draw';
import { demolish, joinRoads, place, upgrade } from './sim/actions';
import { deserialize, serialize } from './sim/save';
import { TICK, tick } from './sim/tick';
import { trade } from './sim/trade';
import type { World } from './sim/types';
import { buildingAt, createWorld } from './sim/world';
import { Hud } from './ui/hud';
import { Input } from './ui/input';
import type { Command } from './ui/keymap';
import { createUiState, SPEEDS, type Tool } from './ui/state';

const SAVE_SLOT = 'autosave';
const AUTOSAVE_INTERVAL = 20_000; // ms
const HUD_INTERVAL = 100; // ms
const MAX_FRAME = 0.25; // s; avoids a spiral of catch-up ticks after a stall

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const backend = createSaveBackend();
  const saved = await backend.load(SAVE_SLOT);
  let world: World = (saved && deserialize(saved)) || createWorld(newSeed());

  const ui = createUiState();
  const cam: Camera = { x: 0, y: 0, zoom: 1.3 };
  const view: Viewport = { width: 0, height: 0, dpr: 1 };
  let gameOverShown = false;
  let victoryShown = world.won; // a save that already won doesn't celebrate again

  const resize = (): void => {
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    view.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  const centerOnHearth = (): void => {
    const hearth = world.buildings.get(world.hearthId)!;
    const p = hexToPixel(parseKey(hearth.at), HEX_SIZE);
    cam.x = p.x;
    cam.y = p.y;
  };
  centerOnHearth();

  const save = (): void => void backend.save(SAVE_SLOT, serialize(world));

  const selectTool = (tool: Tool): void => {
    ui.tool = ui.tool && tool && JSON.stringify(ui.tool) === JSON.stringify(tool) ? null : tool;
  };

  const hud = new Hud(document.getElementById('hud')!, {
    selectTool,
    togglePause: () => (ui.paused = !ui.paused),
    setSpeed: (i) => {
      ui.speedIndex = i;
      ui.paused = false;
    },
    toggleOverlay: () => (ui.overlay = !ui.overlay),
    trade: (good, dir) => {
      trade(world, good, dir);
      hud.update(world, ui);
    },
    newGame: () => {
      world = createWorld(newSeed());
      gameOverShown = false;
      victoryShown = false;
      ui.tool = null;
      centerOnHearth();
      save();
    },
  });

  const command = (c: Command): void => {
    switch (c.type) {
      case 'tool':
        return selectTool(c.tool);
      case 'cancel':
        ui.tool = null;
        return;
      case 'overlay':
        ui.overlay = !ui.overlay;
        return;
      case 'pause':
        ui.paused = !ui.paused;
        return;
      case 'speed':
        ui.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, ui.speedIndex + c.delta));
        ui.paused = false;
        return;
      case 'fullscreen':
        return toggleFullscreen();
    }
  };

  const input = new Input(canvas, cam, () => view, ui, {
    apply(k, from) {
      const tool = ui.tool;
      if (!tool || world.over) return;
      const b = buildingAt(world, k);
      if (tool.kind === 'build') {
        // Roads paint along a drag, joining each hex to the one before (or, over
        // existing road, joining the two). Other buildings place on click only.
        if (tool.type === 'road') {
          if (b?.type === 'road') {
            if (from) joinRoads(world, from, k);
          } else {
            place(world, 'road', k, from ?? undefined);
          }
        } else if (!from) {
          place(world, tool.type, k);
        }
      } else if (tool.kind === 'upgrade') {
        if (b) upgrade(world, b);
      } else if (!from && b) {
        demolish(world, b);
      }
    },
    command,
    blocked: () => hud.modalOpen,
  });

  let last = performance.now();
  let acc = 0;
  let lastHud = -Infinity; // draw the HUD on the very first frame
  const frame = (now: number): void => {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    input.update(dt);
    if (!ui.paused && !hud.modalOpen) {
      acc += dt * SPEEDS[ui.speedIndex];
      while (acc >= TICK) {
        tick(world, TICK);
        acc -= TICK;
      }
    }
    render(ctx, world, cam, view, ui, now);
    if (now - lastHud > HUD_INTERVAL) {
      lastHud = now;
      hud.update(world, ui);
    }
    if (world.won && !victoryShown) {
      victoryShown = true;
      hud.showVictory(world);
      save();
    }
    if (world.over && !gameOverShown) {
      gameOverShown = true;
      hud.showGameOver(world);
      save();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  setInterval(save, AUTOSAVE_INTERVAL);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}

const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

void main();
