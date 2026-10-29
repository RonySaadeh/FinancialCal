/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/** The production CSP blocks Vite's dev-time inline scripts and localhost APIs, so drop it in dev only. */
const devCsp = (): Plugin => ({
  name: 'financial-cal-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
});

// GitHub Pages serves the site from /<repository-name>/. Override with
// VITE_BASE_PATH (e.g. "/" for a custom domain or user site).
const base = process.env.VITE_BASE_PATH || '/FinancialCal/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? base : '/',
  plugins: [react(), tailwindcss(), devCsp()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200
  },
  test: {
    include: ['tests/**/*.test.{js,ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
}));
