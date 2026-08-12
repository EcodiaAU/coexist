/// <reference types="vite/client" />

// Compile-time literals injected by vite.config.ts `define`.
declare const __APP_VERSION__: string
declare const __FEATURE_MEMBERSHIPS__: boolean

declare module 'leo-profanity' {
  const filter: {
    loadDictionary(lang: string): void
    check(text: string): boolean
    clean(text: string): string
    add(words: string | string[]): void
    remove(words: string | string[]): void
    list(): string[]
    reset(): void
  }
  export default filter
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string
  readonly VITE_GOOGLE_WEB_CLIENT_ID: string
  readonly VITE_GOOGLE_IOS_CLIENT_ID?: string
  readonly VITE_APPLE_SERVICE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
