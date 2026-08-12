import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // Compile-time literals normally injected by vite.config.ts `define` are not
  // applied under vitest, so provide them here (feature ON in tests).
  define: {
    __APP_VERSION__: '"test"',
    __FEATURE_MEMBERSHIPS__: 'true',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    env: {
      NODE_ENV: 'test',
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/types/**', '**/*.d.ts'],
    },
  },
})
