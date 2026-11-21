import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    // MapLibre alone is about 1 MB minified.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
})
