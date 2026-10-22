import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Link2, CheckCircle2, AlertTriangle, Users, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Toggle } from '@/components/toggle'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useToast } from '@/components/toast'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'
import { formatDateTime } from './shared'

/**
 * Admin > Email > Mailchimp.
 *
 * Mailchimp is ADDITIVE: Co-Exist's own email (Quick Send, campaigns, system
 * emails) still goes through Resend. This tab mirrors members into a Mailchimp
 * audience and shows that mirror's health. Every action goes through the
 * mailchimp-sync edge function, which holds the Mailchimp key; the browser never
 * sees it. A Mailchimp unsubscribe flows back via the mailchimp-webhook function.
 */

const STATUS_KEY = ['admin-mailchimp-status']

interface RunRow {
  id: string
  started_at: string
  finished_at: string | null
  trigger: 'manual' | 'cron'
  mode: 'full' | 'queue'
  scope: string | null
  processed: number
  created: number
  updated: number
  unchanged: number
  archived: number
  skipped: number
  failed: number
  has_more: boolean
  errors: { email: string; error: string }[]
}

interface MailchimpStatus {
  ok: boolean
  configured: boolean
  problems: string[]
  config: {
    auto_sync: boolean
    scope: 'allowlist' | 'all'
    allowlist: string[]
    webhook_connected: boolean
    webhook_connected_at: string | null
  }
  queue: { pending: number; failing: number }
  runs: RunRow[]
  mailchimp?: {
    reachable: boolean
    server?: string
    error?: string
    audience?: { id: string; name: string; member_count: number; unsubscribe_count: number; cleaned_count: number } | null
    audiences?: { id: string; name: string }[]
    account?: { name: string; plan: string; total_contacts: number } | null
  }
}

const PLAN_LABEL: Record<string, string> = {
  forever_free: 'Free plan',
  monthly: 'Monthly plan',
  pay_as_you_go: 'Pay-as-you-go',
}

async function callSync<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mailchimp-sync', { body })
  if (error) {
    // functions.invoke resolves non-2xx as `error`; the JSON body carries the reason.
    let reason = error.message
    try {
      const ctx = (error as unknown as { context?: Response }).context
      if (ctx) reason = ((await ctx.json()) as { error?: string }).error ?? reason
    } catch { /* keep the generic message */ }
    throw new Error(reason)
  }
  return data as T
}

function useMailchimpStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => callSync<MailchimpStatus>({ action: 'status' }),
    staleTime: 15 * 1000,
    // Several admins can drive this screen, and a native build fires no
    // window-focus refetch, so poll while it is mounted.
    refetchInterval: 30 * 1000,
  })
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#0" className={cn('p-4 mb-3 rounded-sm bg-white shadow-sm', className)}>{children}</div>
}

function runSummary(r: RunRow): string {
  const parts = [
    r.created && `${r.created} added`,
    r.updated && `${r.updated} updated`,
    r.unchanged && `${r.unchanged} unchanged`,
    r.archived && `${r.archived} archived`,
    r.failed && `${r.failed} failed`,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'nothing to do'
}

export function MailchimpTab() {
  const { data, isLoading, error } = useMailchimpStatus()
  const showLoading = useDelayedLoading(isLoading)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY })

  async function syncNow() {
    setSyncing(true)
    setProgress('Starting…')
    let cursor: string | null = null
    const total = { created: 0, updated: 0, unchanged: 0, archived: 0, failed: 0 }
    try {
      // The function does one bounded pass per call; loop until it says done.
      for (let i = 0; i < 60; i++) {
        const r: { has_more: boolean; next_cursor: string | null } & typeof total = await callSync({ action: 'sync', mode: 'full', cursor })
        for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k] ?? 0
        setProgress(`${total.created + total.updated + total.unchanged + total.archived + total.failed} checked…`)
        if (!r.has_more) break
        cursor = r.next_cursor
      }
      const msg = `Mailchimp synced: ${total.created} added, ${total.updated} updated, ${total.unchanged} unchanged${total.archived ? `, ${total.archived} archived` : ''}`
      if (total.failed) toast.warning(`${msg}, ${total.failed} failed (see below)`)
      else toast.success(msg)
    } catch (e) {
      toast.error(`Sync failed: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
      setProgress(null)
      refresh()
    }
  }

  async function configure(patch: Record<string, unknown>, okMsg: string) {
    setBusy('configure')
    try {
      await callSync({ action: 'configure', ...patch })
      toast.success(okMsg)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
      refresh()
    }
  }

  async function connectWebhook() {
    setBusy('webhook')
    try {
      const r = await callSync<{ signed: boolean }>({ action: 'connect_webhook' })
      toast.success(r.signed ? 'Unsubscribe webhook connected (signed)' : 'Unsubscribe webhook connected')
    } catch (e) {
      toast.error(`Could not connect the webhook: ${(e as Error).message}`)
    } finally {
      setBusy(null)
      refresh()
    }
  }

  if (isLoading) return showLoading ? <Skeleton data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#1" variant="list-item" count={4} /> : null
  if (error || !data) {
    return <EmptyState data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#2" illustration="error" title="Couldn't load Mailchimp" description={(error as Error)?.message ?? 'Try again in a minute. If it keeps failing, let Ecodia know.'} />
  }

  const { config, queue, runs, mailchimp } = data
  const audience = mailchimp?.audience
  const connected = data.configured && mailchimp?.reachable && !!audience
  const testScope = config.scope === 'allowlist'

  return (
    <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#3">
      <Card>
        <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#4" className="flex items-start gap-3">
          <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#5" className={cn('flex items-center justify-center w-9 h-9 rounded-full shrink-0', connected ? 'bg-success-100' : 'bg-warning-100')}>
            {connected
              ? <CheckCircle2 data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#6" size={18} className="text-success-600" />
              : <AlertTriangle data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#7" size={18} className="text-warning-600" />}
          </div>
          <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#8" className="flex-1 min-w-0">
            <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#9" className="text-sm font-semibold text-neutral-900">
              {connected ? `Connected to ${audience!.name}` : 'Mailchimp is not connected'}
            </p>
            {connected ? (
              <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#10" className="text-xs text-neutral-500 mt-0.5">
                {audience!.member_count} subscribed &middot; {audience!.unsubscribe_count} unsubscribed &middot; {audience!.cleaned_count} bounced &middot; server {mailchimp!.server}
              </p>
            ) : null}
            {connected && mailchimp?.account ? (
              <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#46" className="text-xs text-neutral-500 mt-0.5">
                {mailchimp.account.name} &middot; {PLAN_LABEL[mailchimp.account.plan] ?? mailchimp.account.plan} &middot; {mailchimp.account.total_contacts} contacts across the account
              </p>
            ) : null}
            {connected ? null : (
              <ul data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#11" className="text-xs text-neutral-500 mt-1 space-y-0.5">
                {[...data.problems, ...(mailchimp?.error ? [mailchimp.error] : [])].map((p) => (
                  <li data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#12" key={p}>{p}</li>
                ))}
                {mailchimp?.audiences?.length ? (
                  <li data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#13">Audiences on this key: {mailchimp.audiences.map((a) => `${a.name} (${a.id})`).join(', ')}</li>
                ) : null}
              </ul>
            )}
          </div>
        </div>

        <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#14" className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-neutral-100">
          <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#15" className="min-w-0">
            <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#16" className="text-sm font-medium text-neutral-900">Unsubscribes from Mailchimp</p>
            <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#17" className="text-xs text-neutral-500 mt-0.5">
              {config.webhook_connected
                ? `Connected${config.webhook_connected_at ? ` ${formatDateTime(config.webhook_connected_at)}` : ''}. Someone who unsubscribes in Mailchimp is unsubscribed here too.`
                : 'Not connected yet. Until it is, an unsubscribe in Mailchimp is not seen by Co-Exist.'}
            </p>
          </div>
          <Button data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#18" variant="secondary" size="sm" icon={<Link2 data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#19" size={14} />} loading={busy === 'webhook'} disabled={!connected || !!busy} onClick={connectWebhook}>
            {config.webhook_connected ? 'Reconnect' : 'Connect'}
          </Button>
        </div>
      </Card>

      <Card>
        <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#20" className="flex items-start justify-between gap-3">
          <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#21" className="min-w-0">
            <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#22" className="text-sm font-semibold text-neutral-900">Member sync</p>
            <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#23" className="text-xs text-neutral-500 mt-0.5">
              Email, first and last name, subscribe status and tags. A member who opted out of marketing is never added, and is marked unsubscribed if Mailchimp already has them. Someone who unsubscribes in Mailchimp is opted out here too.
            </p>
          </div>
          <Button data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#24" variant="primary" size="sm" icon={<RefreshCw data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#25" size={14} />} loading={syncing} disabled={!connected || syncing} onClick={syncNow}>
            Sync now
          </Button>
        </div>
        {progress && <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#26" className="text-xs text-primary-700 mt-2">{progress}</p>}

        <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#27" className={cn('flex items-start gap-2 mt-3 p-3 rounded-sm', testScope ? 'bg-warning-50' : 'bg-success-50')}>
          {testScope
            ? <ShieldCheck data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#28" size={16} className="text-warning-600 mt-0.5 shrink-0" />
            : <Users data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#29" size={16} className="text-success-600 mt-0.5 shrink-0" />}
          <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#30" className="flex-1 min-w-0">
            <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#31" className="text-sm font-medium text-neutral-900">
              {testScope ? `Test list only (${config.allowlist.length} ${config.allowlist.length === 1 ? 'address' : 'addresses'})` : 'All members'}
            </p>
            <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#32" className="text-xs text-neutral-500 mt-0.5 break-all">
              {testScope ? config.allowlist.join(', ') || 'No addresses yet' : 'Every member and confirmed newsletter signup is mirrored to Mailchimp.'}
            </p>
          </div>
          <Button data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#33" variant="ghost" size="sm" disabled={!!busy} onClick={() => (testScope ? setConfirmAll(true) : configure({ scope: 'allowlist' }, 'Back to the test list only'))}>
            {testScope ? 'Sync everyone' : 'Test list only'}
          </Button>
        </div>

        <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#34" className="mt-3">
          <Toggle data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#35"
            checked={config.auto_sync}
            disabled={!!busy}
            onChange={(v) => configure({ auto_sync: v }, v ? 'Changes now sync automatically' : 'Automatic sync paused')}
            label="Keep Mailchimp up to date automatically"
            description={`Profile, consent and tag changes are sent within about 5 minutes.${queue.pending ? ` ${queue.pending} waiting${queue.failing ? `, ${queue.failing} retrying` : ''}.` : ''}`}
          />
        </div>
      </Card>

      <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#36" className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mt-5 mb-2">Recent syncs</p>
      {!runs.length ? (
        <EmptyState data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#37" illustration="empty" title="No syncs yet" description="Press Sync now to send members to Mailchimp" />
      ) : (
        <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#38" className="space-y-1">
          {runs.map((r) => (
            <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#39" key={r.id} className="p-3 rounded-sm bg-white shadow-sm">
              <div data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#40" className="flex items-center justify-between gap-2">
                <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#41" className="text-sm text-neutral-900">{runSummary(r)}</p>
                <span data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#42" className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0', r.failed ? 'bg-error-100 text-error-700' : 'bg-neutral-100 text-neutral-600')}>
                  {r.trigger === 'cron' ? 'Automatic' : 'Manual'}
                </span>
              </div>
              <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#43" className="text-xs text-neutral-400 mt-0.5">
                {formatDateTime(r.started_at)} &middot; {r.mode === 'full' ? 'full check' : 'changes'}{r.scope === 'allowlist' ? ' · test list' : ''}{r.finished_at ? '' : ' · running'}
              </p>
              {r.errors?.slice(0, 3).map((e, i) => (
                <p data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#44" key={i} className="text-xs text-error-700 mt-1 break-all">{e.email ? `${e.email}: ` : ''}{e.error}</p>
              ))}
            </div>
          ))}
        </div>
      )}

      <ConfirmationSheet data-eos-id="src/pages/admin/email/mailchimp-tab.tsx#45"
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => { setConfirmAll(false); configure({ scope: 'all' }, 'Now syncing every member. Press Sync now to send them.') }}
        title="Sync every member to Mailchimp?"
        description={`This sends every member's email, name, subscribe status and tags to ${audience?.name ?? 'the connected audience'}. Mailchimp plans are priced by contact count${mailchimp?.account ? ` (this account: ${PLAN_LABEL[mailchimp.account.plan] ?? mailchimp.account.plan}, ${mailchimp.account.total_contacts} contacts now)` : ''}, so check the plan has room first.`}
        confirmLabel="Sync everyone"
        variant="warning"
      />
    </div>
  )
}
