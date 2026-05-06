import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Capacitor (iOS/Android WKWebView/Android WebView) needs relative asset paths
// because there is no HTTP host; the bundle is loaded from the app container.
// Web (Vercel) needs absolute root paths so SPA deep routes like /events/new
// and /admin/* resolve assets from /assets/* rather than /events/assets/*
// (which 404s and produces a blank root). Toggle via CAPACITOR_BUILD=true
// in the Capacitor build scripts below.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: isCapacitorBuild ? './' : '/',
  server: {
    allowedHosts: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['posthog-js'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      external: ['@capacitor-mlkit/barcode-scanning', 'posthog-js'],
      output: {
        manualChunks(id) {
          // Admin pages - only downloaded by staff, not participants
          if (id.includes('/pages/admin/')) return 'admin'
          if (id.includes('react-dom') || id.includes('react-router')) return 'vendor'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('leaflet')) return 'leaflet'
          if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('dompurify')) return 'markdown'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
          if (id.includes('i18next')) return 'i18n'
          if (id.includes('html2canvas')) return 'html2canvas'
        },
      },
    },
  },
})
