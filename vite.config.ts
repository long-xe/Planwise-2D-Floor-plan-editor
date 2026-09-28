/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Geometry and command code is pure TS, so tests need no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
