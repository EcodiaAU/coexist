/**
 * FixMemberEmailSheet - an admin corrects the address on a member who gets no
 * Co-Exist email (Admin > Email > Delivery > Unreachable).
 *
 * Asked for by Yee Zhao, 2026-10-27, with this list attached: "it would be cool
 * if these typos could be changed ... or us edit it ourselves". The member can't
 * do it in the app, because secure email change wants a click from the OLD
 * address, and the old address is the one that bounces. So the fix lives here.
 *
 * Calls the admin-fix-member-email edge function, which re-checks the caller's
 * manage_email access, refuses any member not on this list right now, and
 * refuses a new address the sender would skip, that still looks like a typo,
 * that is blocked, or that another account holds. The suggested address is
 * prefilled as a starting point; the copy tells the admin to check it with the
 * member first, because they sign in with it from then on.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { useToast } from '@/components/toast'
import { supabase } from '@/lib/supabase'
import { BottomSheet, Button, Input } from '@/components'
import { UNREACHABLE_MEMBERS_KEY, type UnreachableMember } from './shared'

export function FixMemberEmailSheet({
  member,
  onClose,
}: {
  /** The member being fixed; null closes the sheet. */
  member: UnreachableMember | null
  onClose: () => void
}) {
  return (
    <BottomSheet data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#0" data-eos-v="2" open={!!member} onClose={onClose} snapPoints={[0.7]}>
      {/* Keyed on the member so the field starts from their suggestion each time. */}
      {member && <FixMemberEmailForm data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#13" key={member.user_id} member={member} onDone={onClose} />}
    </BottomSheet>
  )
}

function FixMemberEmailForm({
  member,
  onDone,
}: {
  member: UnreachableMember
  onDone: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(member.suggested_email ?? '')
  const [error, setError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  const name = member.display_name?.trim() || 'this member'
  const current = member.judged_email ?? null

  async function save() {
    const next = email.trim()
    if (!next) {
      setError('Enter the address they gave you')
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('admin-fix-member-email', {
        body: { user_id: member.user_id, email: next },
      })
      const result = (data ?? {}) as { email?: string; error?: string }
      if (invokeErr || result.error) {
        let msg = result.error || invokeErr?.message
        const ctx = (invokeErr as { context?: Response } | null)?.context
        if (!result.error && ctx && typeof ctx.clone === 'function') {
          try {
            const bodyJson = await ctx.clone().json() as { error?: string }
            if (bodyJson?.error) msg = bodyJson.error
          } catch { /* not JSON: keep what we have */ }
        }
        throw new Error(msg || 'Could not change the email')
      }
      await queryClient.invalidateQueries({ queryKey: UNREACHABLE_MEMBERS_KEY })
      toast.success(`${name}'s email is now ${result.email ?? next}`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the email')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#1" className="space-y-4 pb-2">
      <div data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#2" className="flex items-center gap-2">
        <MailCheck data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#3" size={18} className="text-primary-500" />
        <h2 data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#4" data-eos-var="name" data-eos-var-label="Name" data-eos-var-scope="prop" className="text-base font-bold text-neutral-900">
          Fix {name}'s email
        </h2>
      </div>

      <p data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#5" data-eos-var="current" data-eos-var-label="Current email" data-eos-var-scope="prop" className="text-sm text-neutral-700 break-all">
        {current ? <>Now: <span data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#6" className="font-medium">{current}</span></> : 'There is no email on this account yet.'}
      </p>

      <Input data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#7"
        type="email"
        label="Correct email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(undefined) }}
        error={error}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        inputMode="email"
        enterKeyHint="done"
      />

      <ul data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#8" className="text-[11px] text-warning-700 leading-relaxed list-disc pl-7 pr-3 py-3 space-y-0.5 rounded-sm border border-warning-200 bg-warning-50">
        <li data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#9">Check the address with the member first. A suggestion is only a guess.</li>
        <li data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#10">They sign in with this address from now on, and all Co-Exist email goes to it.</li>
        <li data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#11">No email is sent to tell them. Let them know yourself.</li>
      </ul>

      <Button data-eos-id="src/pages/admin/email/fix-member-email-sheet.tsx#12"
        variant="primary"
        size="md"
        fullWidth
        loading={saving}
        disabled={!email.trim() || saving}
        onClick={save}
      >
        Save email
      </Button>
    </div>
  )
}
