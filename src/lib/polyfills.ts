/* ------------------------------------------------------------------ */
/*  Runtime built-in polyfills for old Android System WebViews.        */
/*                                                                     */
/*  build.target (vite.config.ts) lowers modern JS *syntax*, but NOT   */
/*  missing built-in *methods*. The emitted bundle and its deps        */
/*  (framer-motion, tanstack, markdown, etc.) call runtime APIs that   */
/*  a Chrome 85-97 Android WebView boots without:                      */
/*                                                                     */
/*    Object.hasOwn ............ Chrome 93                             */
/*    structuredClone .......... Chrome 98                            */
/*    String.replaceAll ........ Chrome 85                            */
/*    Array.at / String.at ..... Chrome 92                            */
/*    Array.findLast/Index ..... Chrome 97                            */
/*                                                                     */
/*  On those WebViews the app parses and starts (the entry chunk only  */
/*  needs optional chaining), then throws a TypeError the moment one   */
/*  of these is called - which for a member is the instant a screen    */
/*  mounts. This module MUST be imported first in main.tsx (before any */
/*  app/vendor code runs). Each polyfill installs only when the native */
/*  method is absent, so modern engines are untouched. Origin:         */
/*  2026-07-05 phone-gate old-Android crash (Co-Exist), ported to the  */
/*  Co-Exist Insights surface 2026-07-06 (app-test-gate Phase 3).      */
/* ------------------------------------------------------------------ */

// Object.hasOwn (Chrome 93)
if (typeof (Object as { hasOwn?: unknown }).hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: function hasOwn(obj: object, prop: PropertyKey): boolean {
      if (obj == null) throw new TypeError('Cannot convert undefined or null to object')
      return Object.prototype.hasOwnProperty.call(Object(obj), prop)
    },
    configurable: true,
    writable: true,
  })
}

// structuredClone (Chrome 98). JSON round-trip fallback covers the
// plain-data uses in this app's dependency graph (query cache dehydrate,
// framer state). It does not clone Dates/Maps/Sets/typed arrays, but the
// callers that reach this fallback path pass JSON-safe data.
if (typeof (globalThis as { structuredClone?: unknown }).structuredClone !== 'function') {
  ;(globalThis as { structuredClone?: unknown }).structuredClone = function structuredClone<T>(value: T): T {
    return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
  }
}

// String.prototype.replaceAll (Chrome 85)
if (typeof (String.prototype as { replaceAll?: unknown }).replaceAll !== 'function') {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function replaceAll(
      this: string,
      search: string | RegExp,
      replacement: string | ((substring: string, ...args: unknown[]) => string),
    ): string {
      if (search instanceof RegExp) {
        if (!search.global) {
          throw new TypeError('replaceAll must be called with a global RegExp')
        }
        return this.replace(search, replacement as string)
      }
      // Escape the literal search string for a global regex.
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return this.replace(new RegExp(escaped, 'g'), replacement as string)
    },
    configurable: true,
    writable: true,
  })
}

// Array.prototype.at + String.prototype.at (Chrome 92)
function at(this: { length: number; [i: number]: unknown }, n: number): unknown {
  const len = this.length
  let i = Math.trunc(n) || 0
  if (i < 0) i += len
  if (i < 0 || i >= len) return undefined
  return this[i]
}
if (typeof (Array.prototype as { at?: unknown }).at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', { value: at, configurable: true, writable: true })
}
if (typeof (String.prototype as { at?: unknown }).at !== 'function') {
  Object.defineProperty(String.prototype, 'at', { value: at, configurable: true, writable: true })
}

// Array.prototype.findLast + findLastIndex (Chrome 97)
if (typeof (Array.prototype as { findLast?: unknown }).findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    value: function findLast(this: unknown[], predicate: (v: unknown, i: number, a: unknown[]) => boolean, thisArg?: unknown) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate.call(thisArg, this[i], i, this)) return this[i]
      }
      return undefined
    },
    configurable: true,
    writable: true,
  })
}
if (typeof (Array.prototype as { findLastIndex?: unknown }).findLastIndex !== 'function') {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function findLastIndex(this: unknown[], predicate: (v: unknown, i: number, a: unknown[]) => boolean, thisArg?: unknown) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate.call(thisArg, this[i], i, this)) return i
      }
      return -1
    },
    configurable: true,
    writable: true,
  })
}

export {}
