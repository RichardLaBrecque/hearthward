import { hexLine, key, parseKey, pixelToHex } from '../hex';
import { screenToWorld, zoomAt, type Camera, type Viewport } from '../render/camera';
import { HEX_SIZE } from '../render/draw';
import { KEYMAP, PAN_KEYS, type Command } from './keymap';
import type { UiState } from './state';

const PAN_SPEED = 600; // screen px per second
const DRAG_THRESHOLD = 4;

export interface InputHandlers {
  // Use the active tool on a hex. `from` is the previous hex of a drag, null on press.
  apply(hexKey: string, from: string | null): void;
  command(c: Command): void;
  blocked(): boolean; // true while a modal is open
}

// Left button uses the active tool (roads and upgrades paint while dragging);
// with no tool it pans. Right/middle drag always pans; right click clears the tool.
export class Input {
  private held = new Set<string>();
  private drag: { button: number; x: number; y: number; moved: boolean; painting: boolean } | null = null;
  private lastPainted: string | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private cam: Camera,
    private view: () => Viewport,
    private ui: UiState,
    private on: InputHandlers,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerleave', () => (this.ui.hover = null));
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.held.clear());
  }

  // Keyboard panning, called every frame with real (unscaled) dt.
  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    for (const k of this.held) {
      const p = PAN_KEYS[k];
      if (p) {
        dx += p[0];
        dy += p[1];
      }
    }
    this.cam.x += (dx * PAN_SPEED * dt) / this.cam.zoom;
    this.cam.y += (dy * PAN_SPEED * dt) / this.cam.zoom;
  }

  private hexAt(e: PointerEvent | WheelEvent): string {
    const rect = this.canvas.getBoundingClientRect();
    return key(pixelToHex(screenToWorld(this.cam, this.view(), e.clientX - rect.left, e.clientY - rect.top), HEX_SIZE));
  }

  private down(e: PointerEvent): void {
    if (this.on.blocked()) return;
    const painting = e.button === 0 && this.ui.tool !== null;
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false, painting };
    if (painting) {
      const k = this.hexAt(e);
      this.lastPainted = k;
      this.on.apply(k, null);
    }
  }

  private move(e: PointerEvent): void {
    if (e.target === this.canvas) this.ui.hover = this.hexAt(e);
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
    if (d.painting) {
      const k = this.hexAt(e);
      if (k !== this.lastPainted && this.lastPainted) {
        // A fast drag can skip hexes; walk the line so roads stay unbroken.
        const line = hexLine(parseKey(this.lastPainted), parseKey(k)).map(key);
        for (const step of line.slice(1)) {
          this.on.apply(step, this.lastPainted);
          this.lastPainted = step;
        }
      }
    } else if (d.moved) {
      this.cam.x -= dx / this.cam.zoom;
      this.cam.y -= dy / this.cam.zoom;
      d.x = e.clientX;
      d.y = e.clientY;
    }
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    this.lastPainted = null;
    if (d && d.button === 2 && !d.moved && e.target === this.canvas) this.on.command({ type: 'cancel' });
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    zoomAt(this.cam, this.view(), e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!down) {
      this.held.delete(k);
      return;
    }
    if (this.on.blocked()) return;
    if (PAN_KEYS[k]) {
      this.held.add(k);
      e.preventDefault();
      return;
    }
    const cmd = KEYMAP[k];
    if (cmd && !e.repeat) {
      e.preventDefault();
      this.on.command(cmd);
    }
  }
}
