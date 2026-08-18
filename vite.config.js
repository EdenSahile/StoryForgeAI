import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    open: true,
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})