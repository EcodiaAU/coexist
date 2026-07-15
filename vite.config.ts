import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Absolute root base for BOTH web (Vercel) and Capacitor (iOS WKWebView via
// capacitor://localhost/ + Android WebView via https://localhost/, see
// capacitor.config.ts androidScheme: 'https'). Both Capacitor schemes have a
// host that serves bundle assets at /assets/*, so absolute paths resolve
// correctly regardless of the SPA's current route.
//
// History: the prior `./` Capacitor base meant relative `<script>` tags in
// index.html resolved against `document.baseURI`. On a deep SPA route like
// /admin/users this turned `./assets/index-X.js` into
// `/admin/assets/index-X.js` (404 in the bundle), surfacing as a Capacitor
// error overlay whose URL ends in `/admin/assets`. Absolute paths sidestep
// the document-baseURI dependence. Vercel deep routes already require this
// for the same reason - symmetric config is intentional.

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
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
    // Browser-compatibility floor. Vite 8's implicit default target is a modern
    // baseline (roughly Chrome 107 / Safari 16), which leaves Chrome 85-106-era
    // JS *syntax* (logical assignment ??=/||=, class static blocks, private
    // methods) untranspiled in the emitted bundle. Co-Exist ships to
    // minSdkVersion = 24 (Android 7) devices whose System WebView, on older or
    // update-starved phones, sits well below that. Such a WebView boots the app
    // (the entry chunk only needs optional chaining) but then hard-crashes the
    // moment it parses/executes a newer-syntax chunk - exactly what a member on
    // an old Android hit when the mandatory phone-number gate (the one screen
    // 780 of 1321 members are funnelled through) mounted. An ES2019 floor
    // transpiles that syntax down so the whole bundle parses and runs on those
    // WebViews. Runtime *APIs* that ES2019 lacks (Object.hasOwn,
    // structuredClone, replaceAll, Array.at, findLast - pulled in by
    // framer-motion and other deps) are polyfilled separately in
    // src/lib/polyfills.ts, imported first in main.tsx; build.target only lowers
    // syntax, not missing built-in methods. Do NOT remove without re-verifying
    // on an old Android WebView (Chrome < 100). Origin: 2026-07-05 phone-gate
    // old-Android crash incident.
    target: 'es2019',
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
          if (id.includes('html2canvas')) return 'html2canvas'
        },
      },
    },
  },
})
