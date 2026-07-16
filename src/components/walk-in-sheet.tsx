/**
 * WalkInSheet  -  Ad-hoc walk-in form for leaders on event day.
 *
 * Two modes inside one sheet (Tate spec 2026-05-18):
 *   1. Search for an existing app user and add them as a walk-in (registers
 *      them + checks them in via handleAddAndCheckIn fed from the parent).
 *   2. If no existing user, fill out the manual form below the search box -
 *      same 12-field profile shape as before. Inserts into event_walk_ins
 *      with created_via='leader_adhoc'.
 *
 * Required (manual mode): first_name + (email OR phone). Everything else
 * optional.
 */
import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { BottomSheet, Button, Skeleton } from '@/components'
import { Avatar } from '@/components/avatar'
import { UserPlus, AlertTriangle, Search as SearchIcon, UserCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useImeSafeOnChange } from '@/hooks/use-ime-safe-on-change'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WalkInSheetProps {
  eventId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** Add an existing app user as a walk-in - registers them + checks them in.
   *  Provided by the parent event-day page so this sheet doesn't have to
   *  duplicate the registration mutation. Called with the user_id. */
  onAddExistingUser: (userId: string, displayName: string | null) => Promise<void>
}

interface SearchResult {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
}

/* ------------------------------------------------------------------ */
/*  Field component                                                   */
/* ------------------------------------------------------------------ */

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div data-eos-id="src/components/walk-in-sheet.tsx#0" data-eos-v="2" className="space-y-1">
      <label data-eos-id="src/components/walk-in-sheet.tsx#1" className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider">
        {label}
        {required && <span data-eos-id="src/components/walk-in-sheet.tsx#2" className="ml-1 text-error-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = cn(
  'w-full rounded-sm border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900',
  'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40',
  'focus:border-primary-400 transition-colors duration-150',
)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WalkInSheet({ eventId, open, onClose, onSuccess, onAddExistingUser }: WalkInSheetProps) {
  const { profile } = useAuth()
  const { toast } = useToast()

  /* ------------------------------ search ------------------------------ */
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (searchQuery.trim().length < 2 || !eventId) {
      setSearchResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const { data, error } = await supabase.rpc('search_app_users_for_event', {
          p_event_id: eventId,
          p_query: searchQuery.trim(),
          p_max_results: 10,
        })
        if (!error && data) setSearchResults(data as SearchResult[])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, eventId])

  async function handleAddExisting(user: SearchResult) {
    setAddingId(user.id)
    try {
      await onAddExistingUser(user.id, user.display_name)
      setSearchQuery('')
      setSearchResults([])
      onClose()
    } catch {
      // parent surfaces its own toast on failure
    } finally {
      setAddingId(null)
    }
  }

  /* ------------------------------ manual form ------------------------------ */
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [postcode, setPostcode] = useState('')
  const [gender, setGender] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [collectiveDiscovery, setCollectiveDiscovery] = useState('')
  const [accessibilityRequirements, setAccessibilityRequirements] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')

  const [submitting, setSubmitting] = useState(false)

  // IME-safe handlers - Samsung Keyboard / GBoard predictive text reversal
  // guard. Without these, controlled inputs on Android can drop characters
  // or appear to type backwards. See src/hooks/use-ime-safe-on-change.ts
  // and the 2026-06-01 Brandon Marlow Samsung screenshot.
  const searchQueryProps = useImeSafeOnChange<HTMLInputElement>(setSearchQuery)
  const firstNameProps = useImeSafeOnChange<HTMLInputElement>(setFirstName)
  const lastNameProps = useImeSafeOnChange<HTMLInputElement>(setLastName)
  const emailProps = useImeSafeOnChange<HTMLInputElement>(setEmail)
  const phoneProps = useImeSafeOnChange<HTMLInputElement>(setPhone)
  const ageProps = useImeSafeOnChange<HTMLInputElement>(setAge)
  const postcodeProps = useImeSafeOnChange<HTMLInputElement>(setPostcode)
  const genderProps = useImeSafeOnChange<HTMLInputElement>(setGender)
  const pronounsProps = useImeSafeOnChange<HTMLInputElement>(setPronouns)
  const discoveryProps = useImeSafeOnChange<HTMLInputElement>(setCollectiveDiscovery)
  const accessibilityProps = useImeSafeOnChange<HTMLInputElement>(setAccessibilityRequirements)
  const emergencyNameProps = useImeSafeOnChange<HTMLInputElement>(setEmergencyContactName)
  const emergencyPhoneProps = useImeSafeOnChange<HTMLInputElement>(setEmergencyContactPhone)
  const emergencyRelProps = useImeSafeOnChange<HTMLInputElement>(setEmergencyContactRelationship)

  function resetForm() {
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setAge('')
    setPostcode('')
    setGender('')
    setPronouns('')
    setCollectiveDiscovery('')
    setAccessibilityRequirements('')
    setEmergencyContactName('')
    setEmergencyContactPhone('')
    setEmergencyContactRelationship('')
    setSearchQuery('')
    setSearchResults([])
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!firstName.trim()) {
      toast.error('Name is required')
      return
    }
    if (!email.trim() && !phone.trim()) {
      toast.error('Name + email or phone required')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('event_walk_ins').insert({
        event_id: eventId,
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        age: age ? parseInt(age, 10) : null,
        postcode: postcode.trim() || null,
        gender: gender.trim() || null,
        pronouns: pronouns.trim() || null,
        collective_discovery: collectiveDiscovery.trim() || null,
        accessibility_requirements: accessibilityRequirements.trim() || null,
        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
        emergency_contact_relationship: emergencyContactRelationship.trim() || null,
        status: 'attended',
        created_via: 'leader_adhoc',
        created_by_user_id: profile?.id ?? null,
      })

      if (error) {
        toast.error(error.message || 'Failed to record walk-in')
        return
      }

      toast.success('Walk-in recorded.')
      resetForm()
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record walk-in')
    } finally {
      setSubmitting(false)
    }
  }

  const showResultsArea = searchQuery.trim().length >= 2

  return (
    <BottomSheet data-eos-id="src/components/walk-in-sheet.tsx#3" open={open} onClose={handleClose} snapPoints={[0.92]}>
      <div data-eos-id="src/components/walk-in-sheet.tsx#4" className="px-5 pb-6 space-y-4">
        {/* Header */}
        <div data-eos-id="src/components/walk-in-sheet.tsx#5" className="flex items-center gap-2 pt-1 pb-1">
          <div data-eos-id="src/components/walk-in-sheet.tsx#6" className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100">
            <UserPlus data-eos-id="src/components/walk-in-sheet.tsx#7" size={18} className="text-primary-600" />
          </div>
          <div data-eos-id="src/components/walk-in-sheet.tsx#8">
            <p data-eos-id="src/components/walk-in-sheet.tsx#9" className="font-heading text-base font-bold text-neutral-900">Add Walk-In</p>
            <p data-eos-id="src/components/walk-in-sheet.tsx#10" className="text-xs text-neutral-500">Search by name or email - or fill out the form below.</p>
          </div>
        </div>

        {/* === Existing-user search === */}
        <div data-eos-id="src/components/walk-in-sheet.tsx#11" className="space-y-2">
          <div data-eos-id="src/components/walk-in-sheet.tsx#12" className="relative">
            <SearchIcon data-eos-id="src/components/walk-in-sheet.tsx#13" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <input data-eos-id="src/components/walk-in-sheet.tsx#14"
              type="text"
              className={cn(inputCls, 'pl-9')}
              placeholder="Search existing app users (name or email)..."
              value={searchQuery}
              {...searchQueryProps}
              autoComplete="off"
            />
          </div>

          {showResultsArea && (
            <div data-eos-id="src/components/walk-in-sheet.tsx#15">
              {searchLoading ? (
                <div data-eos-id="src/components/walk-in-sheet.tsx#16" className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton data-eos-id="src/components/walk-in-sheet.tsx#17" key={i} variant="list-item" />
                  ))}
                </div>
              ) : searchResults.length === 0 ? (
                <p data-eos-id="src/components/walk-in-sheet.tsx#18" className="text-xs text-neutral-500 px-1 py-2">
                  No app users matched - fill out the form below to record them as a new walk-in.
                </p>
              ) : (
                <div data-eos-id="src/components/walk-in-sheet.tsx#19" className="space-y-2">
                  {searchResults.map((u) => (
                    <div data-eos-id="src/components/walk-in-sheet.tsx#20"
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2 bg-white rounded-sm ring-1 ring-neutral-200/60"
                    >
                      <Avatar data-eos-id="src/components/walk-in-sheet.tsx#21" src={u.avatar_url ?? undefined} name={u.display_name ?? 'User'} size="sm" />
                      <div data-eos-id="src/components/walk-in-sheet.tsx#22" className="flex-1 min-w-0">
                        <p data-eos-id="src/components/walk-in-sheet.tsx#23" data-eos-var="u.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 truncate">
                          {u.display_name ?? 'Unknown'}
                        </p>
                        {u.email && (
                          <p data-eos-id="src/components/walk-in-sheet.tsx#24" data-eos-var="u.email" data-eos-var-label="Email" data-eos-var-scope="item" className="text-[11px] text-neutral-500 truncate">{u.email}</p>
                        )}
                      </div>
                      <Button data-eos-id="src/components/walk-in-sheet.tsx#25"
                        variant="secondary"
                        size="sm"
                        icon={<UserCheck data-eos-id="src/components/walk-in-sheet.tsx#26" size={13} />}
                        loading={addingId === u.id}
                        onClick={() => handleAddExisting(u)}
                      >
                        Check In
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider between modes */}
        <div data-eos-id="src/components/walk-in-sheet.tsx#27" className="flex items-center gap-3 py-1">
          <div data-eos-id="src/components/walk-in-sheet.tsx#28" className="flex-1 h-px bg-neutral-200" />
          <p data-eos-id="src/components/walk-in-sheet.tsx#29" className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest">Or new walk-in</p>
          <div data-eos-id="src/components/walk-in-sheet.tsx#30" className="flex-1 h-px bg-neutral-200" />
        </div>

        {/* === Manual form === */}
        <form data-eos-id="src/components/walk-in-sheet.tsx#31" onSubmit={handleSubmit} noValidate className="space-y-4">
          <div data-eos-id="src/components/walk-in-sheet.tsx#32" className="grid grid-cols-2 gap-3">
            <Field data-eos-id="src/components/walk-in-sheet.tsx#33" label="First name" required>
              <input data-eos-id="src/components/walk-in-sheet.tsx#34"
                className={inputCls}
                type="text"
                placeholder="Jane"
                value={firstName}
                {...firstNameProps}
                autoComplete="given-name"
              />
            </Field>
            <Field data-eos-id="src/components/walk-in-sheet.tsx#35" label="Last name">
              <input data-eos-id="src/components/walk-in-sheet.tsx#36"
                className={inputCls}
                type="text"
                placeholder="Smith"
                value={lastName}
                {...lastNameProps}
                autoComplete="family-name"
              />
            </Field>
          </div>

          <Field data-eos-id="src/components/walk-in-sheet.tsx#37" label="Email" required={!phone}>
            <input data-eos-id="src/components/walk-in-sheet.tsx#38"
              className={inputCls}
              type="email"
              placeholder="jane@example.com"
              value={email}
              {...emailProps}
              autoComplete="email"
              inputMode="email"
            />
          </Field>

          <Field data-eos-id="src/components/walk-in-sheet.tsx#39" label="Phone" required={!email}>
            <input data-eos-id="src/components/walk-in-sheet.tsx#40"
              className={inputCls}
              type="tel"
              placeholder="0412 345 678"
              value={phone}
              {...phoneProps}
              autoComplete="tel"
              inputMode="tel"
            />
          </Field>

          <div data-eos-id="src/components/walk-in-sheet.tsx#41" className="grid grid-cols-2 gap-3">
            <Field data-eos-id="src/components/walk-in-sheet.tsx#42" label="Age">
              <input data-eos-id="src/components/walk-in-sheet.tsx#43"
                className={inputCls}
                type="number"
                placeholder="e.g. 28"
                min={0}
                max={120}
                value={age}
                {...ageProps}
                inputMode="numeric"
              />
            </Field>
            <Field data-eos-id="src/components/walk-in-sheet.tsx#44" label="Postcode">
              <input data-eos-id="src/components/walk-in-sheet.tsx#45"
                className={inputCls}
                type="text"
                placeholder="4000"
                value={postcode}
                {...postcodeProps}
                inputMode="numeric"
                maxLength={10}
              />
            </Field>
          </div>

          <div data-eos-id="src/components/walk-in-sheet.tsx#46" className="grid grid-cols-2 gap-3">
            <Field data-eos-id="src/components/walk-in-sheet.tsx#47" label="Gender">
              <input data-eos-id="src/components/walk-in-sheet.tsx#48"
                className={inputCls}
                type="text"
                placeholder="e.g. Female"
                value={gender}
                {...genderProps}
              />
            </Field>
            <Field data-eos-id="src/components/walk-in-sheet.tsx#49" label="Pronouns">
              <input data-eos-id="src/components/walk-in-sheet.tsx#50"
                className={inputCls}
                type="text"
                placeholder="e.g. she/her"
                value={pronouns}
                {...pronounsProps}
              />
            </Field>
          </div>

          <Field data-eos-id="src/components/walk-in-sheet.tsx#51" label="How did you hear about us?">
            <input data-eos-id="src/components/walk-in-sheet.tsx#52"
              className={inputCls}
              type="text"
              placeholder="e.g. Instagram, friend, Facebook"
              value={collectiveDiscovery}
              {...discoveryProps}
            />
          </Field>

          <Field data-eos-id="src/components/walk-in-sheet.tsx#53" label="Accessibility needs">
            <input data-eos-id="src/components/walk-in-sheet.tsx#54"
              className={inputCls}
              type="text"
              placeholder="Any requirements we should know about?"
              value={accessibilityRequirements}
              {...accessibilityProps}
            />
          </Field>

          <div data-eos-id="src/components/walk-in-sheet.tsx#55" className="rounded-sm border border-warning-200 bg-warning-50 p-3 space-y-3">
            <div data-eos-id="src/components/walk-in-sheet.tsx#56" className="flex items-center gap-2">
              <AlertTriangle data-eos-id="src/components/walk-in-sheet.tsx#57" size={14} className="text-warning-600 shrink-0" />
              <p data-eos-id="src/components/walk-in-sheet.tsx#58" className="text-xs font-semibold text-warning-700 uppercase tracking-wider">
                Emergency Contact
              </p>
            </div>
            <Field data-eos-id="src/components/walk-in-sheet.tsx#59" label="Name">
              <input data-eos-id="src/components/walk-in-sheet.tsx#60"
                className={inputCls}
                type="text"
                placeholder="Contact name"
                value={emergencyContactName}
                {...emergencyNameProps}
              />
            </Field>
            <Field data-eos-id="src/components/walk-in-sheet.tsx#61" label="Phone">
              <input data-eos-id="src/components/walk-in-sheet.tsx#62"
                className={inputCls}
                type="tel"
                placeholder="0400 000 000"
                value={emergencyContactPhone}
                {...emergencyPhoneProps}
                inputMode="tel"
              />
            </Field>
            <Field data-eos-id="src/components/walk-in-sheet.tsx#63" label="Relationship">
              <input data-eos-id="src/components/walk-in-sheet.tsx#64"
                className={inputCls}
                type="text"
                placeholder="e.g. Parent, Partner"
                value={emergencyContactRelationship}
                {...emergencyRelProps}
              />
            </Field>
          </div>

          <Button data-eos-id="src/components/walk-in-sheet.tsx#65"
            type="submit"
            variant="primary"
            fullWidth
            loading={submitting}
            icon={<UserPlus data-eos-id="src/components/walk-in-sheet.tsx#66" size={16} />}
          >
            Record Walk-In
          </Button>
        </form>
      </div>
    </BottomSheet>
  )
}
