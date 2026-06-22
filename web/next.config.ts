import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // The marketing site imports the canonical data layer from ../shared and the
  // generated DB types from ../src/types. Pin the tracing root to the repo root
  // (one level up from web/) so Next compiles and traces those out-of-app files.
  outputFileTracingRoot: path.join(__dirname, '..'),
  // ESLint is wired per-app; the marketing site does not inherit the Vite
  // app's root flat config (its react-refresh rules misfire on Next's
  // metadata/revalidate exports). Web-scoped lint lands in P7. Types are
  // still fully checked during the build below.
  eslint: { ignoreDuringBuilds: true },
  images: {
    // Co-Exist content imagery is served from Supabase Storage + the existing
    // Squarespace asset CDN during the transition. Allow both.
    remotePatterns: [
      { protocol: 'https', hostname: 'tjutlbzekfouwsiaplbr.supabase.co' },
      { protocol: 'https', hostname: 'images.squarespace-cdn.com' },
      { protocol: 'https', hostname: 'static1.squarespace.com' },
    ],
  },
}

export default nextConfig
