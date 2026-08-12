/**
 * Build-time feature flags.
 *
 * The flag is a compile-time literal (`__FEATURE_MEMBERSHIPS__`, injected by
 * vite.config.ts `define`), NOT a runtime `import.meta.env` read. That matters:
 * a runtime env check does not tree-shake a guarded `import()` (rolldown still
 * emits the chunk), so only a define'd literal lets `false ? lazy(import()) : null`
 * dead-code-eliminate the whole feature out of the shipped bundle.
 *
 * FEATURE_MEMBERSHIPS: the paid Co-Exist membership (web-first purchase + manage,
 * campout member pricing). Built on trunk but OFF by default so released web and
 * native builds ship without it. Set VITE_FEATURE_MEMBERSHIPS=true only in the
 * branch/preview env (and later in production at go-live). See clients/coexist.md.
 */
export const FEATURE_MEMBERSHIPS: boolean = __FEATURE_MEMBERSHIPS__
