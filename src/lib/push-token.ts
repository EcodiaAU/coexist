/**
 * Push-token shape rules, shared by the client bridge and its tests.
 *
 * send-push targets FCM HTTP v1 `messages:send`, which only accepts an FCM
 * registration token. On iOS the @capacitor/push-notifications plugin hands JS
 * the raw APNs DEVICE token (64 lowercase-hex characters), and Firebase mints
 * the corresponding FCM token asynchronously afterwards. Storing the APNs token
 * in `push_tokens` therefore stores something FCM permanently rejects, and it
 * fails SILENTLY: send-push returns `{sent: 0}` with a 200 and the row is purged
 * as invalid, so every dashboard, cron and deploy check stays green while the
 * device receives nothing.
 *
 * Measured on the live project 2026-08-30: 217 of 1,020 surviving iOS rows were
 * APNs-shaped, 182 of the 308 created that month. Probe: a synthetic 64-hex
 * token pushed through the deployed send-push returned {"sent":0,"total":1} and
 * the row was deleted, as opposed to a transient failure which leaves it
 * standing.
 */

/** APNs device tokens are exactly 64 hex characters. FCM registration tokens are
 *  ~140-190 characters and are never pure hex, so the two shapes cannot collide. */
export function isApnsShapedToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && /^[0-9a-fA-F]{64}$/.test(token)
}

/** True when `stored` should be replaced by `fcm` in push_tokens: we hold a real
 *  FCM token and the row we claimed is either APNs-shaped or a different value. */
export function shouldReplaceStoredToken(
  stored: string | null | undefined,
  fcm: string | null | undefined,
): boolean {
  if (!fcm || isApnsShapedToken(fcm)) return false
  if (!stored) return true
  return stored !== fcm
}
