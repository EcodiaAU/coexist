import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { Database } from '@/types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Durable session store for native (Capacitor). The WKWebView / Android webview
// localStorage that supabase-js defaults to is not a reliable cross-cold-start
// store, and pairing it with a second manual restore path (use-auth.ts) caused
// two concurrent token refreshes to race on the rotating refresh token - the
// second refresh hit "refresh token already used", supabase emitted SIGNED_OUT,
// and the user was logged out on every app reopen. Giving the client ONE
// durable store and letting it own the whole session lifecycle removes the race.
const nativeStorage = {
  getItem: (key: string) => Preferences.get({ key }).then(({ value }) => value),
  setItem: (key: string, value: string) => Preferences.set({ key, value }).then(() => undefined),
  removeItem: (key: string) => Preferences.remove({ key }).then(() => undefined),
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Web keeps the default localStorage adapter; native gets the durable one.
    ...(Capacitor.isNativePlatform() ? { storage: nativeStorage, storageKey: 'coexist-auth' } : {}),
  },
})


/** Escape special PostgREST LIKE/ILIKE characters in user-supplied search input */
export function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`)
}
