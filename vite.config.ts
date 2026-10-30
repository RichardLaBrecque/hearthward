import { defineConfig } from 'vite';

// Relative asset paths so the build runs from file:// or a Tauri webview, not just a web root.
export default defineConfig({
  base: './',
});
