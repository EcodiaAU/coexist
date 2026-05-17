import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/toast'
import { Button } from '@/components/button'
import { supabase } from '@/lib/supabase'

// Single-purpose diagnostic page for FCM/APNs push.
// Surfaces: permission state, native APNs/FCM tokens, push_tokens DB rows,
// and a one-click "send myself a test push via the debug-push function".
// Built deliberately ugly and verbose — this is a diagnostic, not UI.

type LogLine = { ts: string; level: 'info' | 'warn' | 'error'; msg: string }

const DEBUG_PASSPHRASE = 'coexist-debug-2026'

export default function PushDebugPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [logs, setLogs] = useState<LogLine[]>([])
  const [permState, setPermState] = useState<string>('unknown')
  const [registrationToken, setRegistrationToken] = useState<string | null>(null)
  const [fcmTokenFromPrefs, setFcmTokenFromPrefs] = useState<string | null>(null)
  const [dbTokens, setDbTokens] = useState<Array<{ token: string; platform: string; updated_at: string }>>([])
  const [sending, setSending] = useState(false)
  const [lastResponse, setLastResponse] = useState<unknown>(null)
  const [nativeDiag, setNativeDiag] = useState<Record<string, string | null>>({})
  const [tapLog, setTapLog] = useState<Array<{ at: string; source: string; route: string; data: Record<string, string> }>>([])

  const log = useCallback((level: LogLine['level'], msg: string) => {
    const line = { ts: new Date().toISOString().slice(11, 23), level, msg }
    setLogs((prev) => [...prev, line].slice(-200))
    if (level === 'error') console.error('[push-debug]', msg)
    else if (level === 'warn') console.warn('[push-debug]', msg)
    else console.info('[push-debug]', msg)
  }, [])

  const platform = Capacitor.getPlatform()
  const isNative = Capacitor.isNativePlatform()

  /* ---------- Check permission state ---------- */
  const checkPermissions = useCallback(async () => {
    log('info', `platform=${platform} isNative=${isNative}`)
    if (!isNative) {
      setPermState('not-native')
      log('warn', 'Web — push notifications only work on native iOS/Android')
      return
    }
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const result = await PushNotifications.checkPermissions()
      setPermState(result.receive)
      log('info', `Permission state: ${result.receive}`)
    } catch (err) {
      log('error', `checkPermissions failed: ${String(err)}`)
    }
  }, [isNative, log, platform])

  /* ---------- Force register (attach listeners + register) ---------- */
  const forceRegister = useCallback(async () => {
    if (!isNative) {
      log('warn', 'forceRegister: skipped, web platform')
      return
    }
    log('info', 'Loading @capacitor/push-notifications…')
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')

      log('info', 'Attaching registration listener…')
      await PushNotifications.addListener('registration', (token) => {
        log('info', `✅ registration event → token len=${token.value.length} prefix=${token.value.slice(0, 24)}…`)
        setRegistrationToken(token.value)
      })

      await PushNotifications.addListener('registrationError', (err) => {
        log('error', `❌ registrationError: ${JSON.stringify(err)}`)
      })

      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        log('info', `📬 pushNotificationReceived: ${JSON.stringify(notification)}`)
      })

      log('info', 'Checking permissions…')
      let perm = await PushNotifications.checkPermissions()
      log('info', `Current permission: ${perm.receive}`)

      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        log('info', 'Requesting permission (OS prompt should appear)…')
        perm = await PushNotifications.requestPermissions()
        log('info', `After request: ${perm.receive}`)
      }
      setPermState(perm.receive)

      if (perm.receive !== 'granted') {
        log('error', `Cannot register — permission is ${perm.receive}. ${perm.receive === 'denied' ? 'Enable in iOS Settings → Co-Exist → Notifications.' : ''}`)
        return
      }

      log('info', 'Calling PushNotifications.register() — token should arrive via listener within ~5s…')
      await PushNotifications.register()
      log('info', 'register() returned. Waiting for token event…')
    } catch (err) {
      log('error', `forceRegister threw: ${String(err)}`)
    }
  }, [isNative, log])

  /* ---------- Read FCM token from Preferences (iOS bridge) ---------- */
  const readFcmTokenFromPrefs = useCallback(async () => {
    if (!isNative) return
    try {
      const got = await Preferences.get({ key: 'fcmToken' })
      if (got.value) {
        log('info', `Preferences['fcmToken'] → len=${got.value.length} prefix=${got.value.slice(0, 24)}…`)
        setFcmTokenFromPrefs(got.value)
      } else {
        log('warn', `Preferences['fcmToken'] is empty (Firebase hasn't minted FCM token yet, or AppDelegate didn't write it)`)
        setFcmTokenFromPrefs(null)
      }
    } catch (err) {
      log('error', `readFcmTokenFromPrefs failed: ${String(err)}`)
    }
  }, [isNative, log])

  /* ---------- Read native diagnostic flags written by AppDelegate ---------- */
  const readNativeDiag = useCallback(async () => {
    if (!isNative) return
    const keys = [
      'firebaseConfigured', 'firebaseSenderId',
      'didRegisterCalled', 'apnsTokenHex', 'apnsTokenAt',
      'didFailCalled', 'apnsError', 'apnsErrorAt',
      'didSetUNCenterDelegate', 'lastTapResponseAt', 'lastTapUserInfo', 'lastTapBridgeStatus',
    ]
    const out: Record<string, string | null> = {}
    for (const k of keys) {
      const { value } = await Preferences.get({ key: k })
      out[k] = value
    }
    setNativeDiag(out)
    log('info', `Native diag: didRegisterCalled=${out.didRegisterCalled} didFailCalled=${out.didFailCalled} firebaseConfigured=${out.firebaseConfigured}`)
    if (out.apnsTokenHex) log('info', `  APNs hex (from AppDelegate): ${out.apnsTokenHex.slice(0, 24)}… len=${out.apnsTokenHex.length}`)
    if (out.apnsError) log('error', `  APNs error: ${out.apnsError}`)
  }, [isNative, log])

  /* ---------- Read persisted tap-event log (1.8.7(11) diagnostic) ---------- */
  const readTapLog = useCallback(async () => {
    if (!isNative) return
    try {
      const got = await Preferences.get({ key: 'pushTapLog' })
      if (got?.value) {
        const parsed = JSON.parse(got.value) as Array<{ at: string; source: string; route: string; data: Record<string, string> }>
        setTapLog(parsed)
        log('info', `pushTapLog: ${parsed.length} entries`)
      } else {
        setTapLog([])
        log('info', 'pushTapLog: empty (no taps recorded since install)')
      }
    } catch (err) {
      log('error', `readTapLog failed: ${String(err)}`)
    }
  }, [isNative, log])

  const clearTapLog = useCallback(async () => {
    await Preferences.remove({ key: 'pushTapLog' })
    setTapLog([])
    log('info', 'pushTapLog cleared')
  }, [log])

  /* ---------- Read push_tokens rows for this user ---------- */
  const readDbTokens = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('push_tokens')
      .select('token, platform, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (error) {
      log('error', `readDbTokens: ${error.message}`)
      return
    }
    setDbTokens(data ?? [])
    log('info', `push_tokens DB rows for this user: ${data?.length ?? 0}`)
    for (const row of data ?? []) {
      log('info', `  • ${row.platform} ${row.token.slice(0, 24)}… (updated ${row.updated_at})`)
    }
  }, [user, log])

  /* ---------- Send a test push via debug-push function ---------- */
  const sendTestPush = useCallback(async (preferToken: 'fcm' | 'registration' | 'db') => {
    setSending(true)
    setLastResponse(null)
    try {
      let token: string | null = null
      if (preferToken === 'fcm') token = fcmTokenFromPrefs
      else if (preferToken === 'registration') token = registrationToken
      else if (preferToken === 'db' && dbTokens.length > 0) token = dbTokens[0].token

      if (!token) {
        log('error', `No ${preferToken} token available to send to`)
        return
      }

      log('info', `Sending debug push to ${preferToken} token (prefix=${token.slice(0, 24)}…)…`)
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://tjutlbzekfouwsiaplbr.supabase.co'
      const resp = await fetch(`${supabaseUrl}/functions/v1/debug-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-debug-passphrase': DEBUG_PASSPHRASE,
        },
        body: JSON.stringify({
          token,
          title: 'Co-Exist test',
          body: `Sent ${new Date().toLocaleTimeString()}`,
        }),
      })
      const json = await resp.json()
      setLastResponse(json)
      log(resp.ok ? 'info' : 'error', `debug-push response (${resp.status}): ${JSON.stringify(json).slice(0, 500)}`)
      if (resp.ok && json.sent_count > 0) {
        toast.success('Push sent — check notification tray')
      } else {
        toast.error('Push failed — see log')
      }
    } catch (err) {
      log('error', `sendTestPush threw: ${String(err)}`)
    } finally {
      setSending(false)
    }
  }, [fcmTokenFromPrefs, registrationToken, dbTokens, log, toast])

  /* ---------- Force store FCM token in DB (bypasses usePushRegistration listener) ---------- */
  const forceStoreInDb = useCallback(async () => {
    if (!user) {
      log('error', 'No authenticated user; cannot store token.')
      return
    }
    const token = fcmTokenFromPrefs ?? registrationToken
    if (!token) {
      log('error', 'No FCM or registration token available to store.')
      return
    }
    log('info', `Calling supabase.upsert(push_tokens) directly with token prefix=${token.slice(0, 24)}…`)
    const { error, data, status, statusText } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          platform,
          device_info: { platform, ua: navigator.userAgent ?? 'unknown' },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      )
      .select()
    if (error) {
      log('error', `upsert FAILED status=${status} ${statusText}: code=${error.code} msg=${error.message} hint=${error.hint ?? ''} details=${error.details ?? ''}`)
    } else {
      log('info', `upsert OK status=${status}: rows=${(data as unknown[] | null)?.length ?? 0}`)
      await readDbTokens()
    }
  }, [user, fcmTokenFromPrefs, registrationToken, platform, log, readDbTokens])

  /* ---------- Check auth session vs useAuth user.id ---------- */
  const checkAuthSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      log('error', `getSession failed: ${error.message}`)
      return
    }
    const sess = data.session
    if (!sess) {
      log('error', 'No active supabase session (JWT missing). Edits to RLS-protected tables will be denied.')
      return
    }
    const jwtSub = sess.user.id
    const hookId = user?.id ?? '(no useAuth user)'
    const matchTxt = jwtSub === user?.id ? 'MATCH' : 'MISMATCH'
    log('info', `auth session: jwt.sub=${jwtSub} useAuth.user.id=${hookId} → ${matchTxt}`)
    log('info', `  access_token len=${sess.access_token.length}, expires_at=${sess.expires_at}`)
  }, [user, log])

  /* ---------- Copy helpers ---------- */
  const copy = useCallback(async (label: string, value: string | null) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`Copied ${label}`)
    } catch {
      // ignore
    }
  }, [toast])

  /* ---------- Mount: collect initial state ---------- */
  useEffect(() => {
    checkPermissions()
    readDbTokens()
    readFcmTokenFromPrefs()
    readNativeDiag()
    readTapLog()
  }, [checkPermissions, readDbTokens, readFcmTokenFromPrefs, readNativeDiag, readTapLog])

  return (
    <div className="mx-auto max-w-3xl p-4 font-mono text-xs">
      <h1 className="mb-4 font-sans text-2xl font-bold">Push Debug</h1>

      <section className="mb-6 rounded border bg-white p-3">
        <h2 className="mb-2 font-sans text-base font-semibold">Environment</h2>
        <div>platform: <b>{platform}</b></div>
        <div>isNative: <b>{String(isNative)}</b></div>
        <div>user_id: <b>{user?.id ?? '(none)'}</b></div>
        <div>permission: <b>{permState}</b></div>
        <Button onClick={checkPermissions} className="mt-2">Refresh perm state</Button>
      </section>

      <section className="mb-6 rounded border bg-white p-3">
        <h2 className="mb-2 font-sans text-base font-semibold">Step 1 — Register</h2>
        <p className="mb-2 font-sans">Triggers iOS APNs registration + FCM token mint. The token will appear below within ~5s.</p>
        <Button onClick={forceRegister}>Force register</Button>
      </section>

      <section className="mb-6 rounded border bg-amber-50 p-3">
        <h2 className="mb-2 font-sans text-base font-semibold">Native diagnostics (from AppDelegate)</h2>
        <p className="mb-2 font-sans text-[11px]">
          These flags are written by AppDelegate.swift directly into UserDefaults. They reveal what actually
          happened at the iOS native level, independent of the Capacitor plugin and Firebase. If
          <code> didRegisterCalled=true </code> but no JS token event fired, iOS gave us a token but the plugin
          dropped it. If <code> didFailCalled=true </code>, iOS itself refused to register — see the error.
        </p>
        <div>firebaseConfigured: <b>{nativeDiag.firebaseConfigured ?? '(unknown)'}</b></div>
        <div>firebaseSenderId: <b>{nativeDiag.firebaseSenderId ?? '(none)'}</b></div>
        <div>didRegisterCalled: <b className={nativeDiag.didRegisterCalled === 'true' ? 'text-green-700' : 'text-red-700'}>{nativeDiag.didRegisterCalled ?? '(none)'}</b></div>
        <div>didFailCalled: <b className={nativeDiag.didFailCalled === 'true' ? 'text-red-700' : 'text-zinc-600'}>{nativeDiag.didFailCalled ?? '(none)'}</b></div>
        <div>didSetUNCenterDelegate (1.8.7(12)): <b className={nativeDiag.didSetUNCenterDelegate === 'true' ? 'text-green-700' : 'text-red-700'}>{nativeDiag.didSetUNCenterDelegate ?? '(none)'}</b></div>
        <div>lastTapResponseAt (1.8.7(12)): <b className={nativeDiag.lastTapResponseAt ? 'text-green-700' : 'text-zinc-600'}>{nativeDiag.lastTapResponseAt ?? '(none)'}</b></div>
        <div>lastTapBridgeStatus: <b className={nativeDiag.lastTapBridgeStatus === 'bridge-not-ready' ? 'text-amber-700' : 'text-zinc-600'}>{nativeDiag.lastTapBridgeStatus ?? '(bridge-ready or no tap yet)'}</b></div>
        {nativeDiag.lastTapUserInfo && (
          <div className="mt-1">
            <div>lastTapUserInfo:</div>
            <div className="break-all rounded bg-white p-1">{nativeDiag.lastTapUserInfo}</div>
          </div>
        )}
        {nativeDiag.apnsTokenHex && (
          <div className="mt-1">
            <div>apnsTokenHex (at {nativeDiag.apnsTokenAt}):</div>
            <div className="break-all rounded bg-white p-1">{nativeDiag.apnsTokenHex}</div>
            <Button onClick={() => copy('APNs hex', nativeDiag.apnsTokenHex ?? null)} className="mt-1">Copy APNs hex</Button>
          </div>
        )}
        {nativeDiag.apnsError && (
          <div className="mt-1 text-red-700">
            <div>apnsError (at {nativeDiag.apnsErrorAt}):</div>
            <div className="break-all rounded bg-white p-1">{nativeDiag.apnsError}</div>
          </div>
        )}
        <Button onClick={readNativeDiag} className="mt-2">Re-read native diag</Button>
      </section>

      <section className="mb-6 rounded border bg-white p-3">
        <h2 className="mb-2 font-sans text-base font-semibold">Step 2 — Tokens</h2>

        <div className="mb-3">
          <div className="font-sans text-sm font-medium">APNs/registration token (from plugin event)</div>
          <div className="break-all rounded bg-zinc-50 p-2">{registrationToken ?? '(none yet)'}</div>
          <Button onClick={() => copy('registration token', registrationToken)} disabled={!registrationToken} className="mt-1">Copy</Button>
        </div>

        <div className="mb-3">
          <div className="font-sans text-sm font-medium">FCM token (from UserDefaults, iOS only)</div>
          <div className="break-all rounded bg-zinc-50 p-2">{fcmTokenFromPrefs ?? '(none yet)'}</div>
          <div className="flex gap-2">
            <Button onClick={readFcmTokenFromPrefs} className="mt-1">Re-read</Button>
            <Button onClick={() => copy('FCM token', fcmTokenFromPrefs)} disabled={!fcmTokenFromPrefs} className="mt-1">Copy</Button>
          </div>
        </div>

        <div className="mb-3">
          <div className="font-sans text-sm font-medium">push_tokens DB rows ({dbTokens.length})</div>
          {dbTokens.length === 0 && <div className="rounded bg-zinc-50 p-2">(none stored — hook never reached storeToken)</div>}
          {dbTokens.map((t) => (
            <div key={t.token} className="mt-1 rounded bg-zinc-50 p-2">
              <div><b>{t.platform}</b> · updated {t.updated_at}</div>
              <div className="break-all">{t.token}</div>
              <Button onClick={() => copy('db token', t.token)} className="mt-1">Copy</Button>
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={readDbTokens}>Refresh DB</Button>
            <Button onClick={forceStoreInDb} disabled={!user || (!fcmTokenFromPrefs && !registrationToken)}>Force store FCM token in DB</Button>
            <Button onClick={checkAuthSession}>Check auth session</Button>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded border bg-white p-3">
        <h2 className="mb-2 font-sans text-base font-semibold">Step 3 — Send test push</h2>
        <p className="mb-2 font-sans">Each button posts the chosen token to <code>/functions/v1/debug-push</code>. If FCM accepts it, a banner should appear on this device.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => sendTestPush('fcm')} disabled={sending || !fcmTokenFromPrefs}>Send to FCM token</Button>
          <Button onClick={() => sendTestPush('registration')} disabled={sending || !registrationToken}>Send to registration token</Button>
          <Button onClick={() => sendTestPush('db')} disabled={sending || dbTokens.length === 0}>Send to DB token</Button>
        </div>
        {lastResponse !== null && (
          <pre className="mt-3 max-h-80 overflow-auto rounded bg-zinc-900 p-2 text-[10px] text-zinc-100">
{JSON.stringify(lastResponse, null, 2)}
          </pre>
        )}
      </section>

      <section className="mb-6 rounded border bg-emerald-50 p-3">
        <h2 className="mb-2 font-sans text-base font-semibold">Tap event log (persisted)</h2>
        <p className="mb-2 font-sans text-[11px]">
          Every <code>pushNotificationActionPerformed</code> event is appended here from BOTH listeners
          (early + auth-gated). Survives app kill. If you tap a push and this list stays empty, the
          plugin never delivered the tap to JS. If it shows a route, the listener fired and the bug is
          downstream (navigate / router).
        </p>
        <div className="mb-2 flex gap-2">
          <Button onClick={readTapLog}>Refresh tap log</Button>
          <Button onClick={clearTapLog}>Clear tap log</Button>
        </div>
        {tapLog.length === 0 ? (
          <div className="rounded bg-white p-2">(no tap events recorded)</div>
        ) : (
          <div className="max-h-80 overflow-auto rounded bg-white p-2 text-[10px]">
            {tapLog.map((e, i) => (
              <div key={i} className="mb-1 border-b border-zinc-200 pb-1">
                <div><b>{e.at}</b> — source=<b>{e.source}</b></div>
                <div>route: <code className="rounded bg-zinc-100 px-1">{e.route}</code></div>
                <div className="break-all">data: <code>{JSON.stringify(e.data)}</code></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 rounded border bg-white p-3">
        <h2 className="mb-2 font-sans text-base font-semibold">Live log</h2>
        <div className="max-h-96 overflow-auto rounded bg-zinc-900 p-2 text-[10px] text-zinc-100">
          {logs.length === 0 && <div>(empty)</div>}
          {logs.map((l, i) => (
            <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-300' : 'text-zinc-100'}>
              {l.ts} [{l.level}] {l.msg}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
