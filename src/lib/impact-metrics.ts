/**
 * Re-export shim. The canonical impact-metrics module now lives in the
 * framework-agnostic shared/ data layer so the Next.js marketing site (web/)
 * can import the exact same pure helpers the app uses, with zero drift.
 *
 * App code continues to import from '@/lib/impact-metrics' unchanged.
 */
export * from '../../shared/impact-metrics'
