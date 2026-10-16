import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { exclude: ['**/node_modules/**', '**/.vercel/**', '**/scripts/**', '**/dist/**'], environment: 'jsdom', setupFiles: './src/test-setup.ts', clearMocks: true },
})
