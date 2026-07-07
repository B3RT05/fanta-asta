/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: './', // deploy statico su GitHub Pages
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    setupFiles: ['tests/setup.ts'],
  },
})
