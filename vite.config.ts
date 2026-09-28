/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // `icon.svg?react` imports a component whose design stroke colours
    // become currentColor, so one SVG serves muted, accent and layer tints.
    // Plain `icon.svg` imports stay URLs (fixed-colour icons).
    svgr({
      svgrOptions: {
        replaceAttrValues: { '#75706A': 'currentColor', '#2F5DA8': 'currentColor', '#1B2A41': 'currentColor' },
      },
    }),
  ],
  test: {
    // Geometry and command code is pure TS, so tests need no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
