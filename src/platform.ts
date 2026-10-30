// The seam between the game and its host. The browser build lives here; a Tauri
// build swaps these for native window and filesystem calls.
import { LocalStorageBackend, type SaveBackend } from './sim/save';

export const createSaveBackend = (): SaveBackend => new LocalStorageBackend();

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}
