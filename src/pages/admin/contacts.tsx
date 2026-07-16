import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Phone,
  Plus,
  Pencil,
  Trash2,
  Siren,
  TreePine,
  Waves,
  Bug,
  Shield,
  Users,
  MapPin,
  X,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { CONTACT_CATEGORY_COLORS } from '@/lib/color-schemes'
import {
  useAdminContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  CONTACT_CATEGORIES,
  AUSTRALIAN_STATES,
} from '@/hooks/use-admin-contacts'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import type { Tables } from '@/types/database.types'

type EmergencyContact = Tables<'emergency_contacts'>

/* ------------------------------------------------------------------ */
/*  Category icons                                                     */
/* ------------------------------------------------------------------ */

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  emergency: <Siren data-eos-id="src/pages/admin/contacts.tsx#0" size={16} />,
  wildlife: <TreePine data-eos-id="src/pages/admin/contacts.tsx#1" size={16} />,
  marine: <Waves data-eos-id="src/pages/admin/contacts.tsx#2" size={16} />,
  poison: <Bug data-eos-id="src/pages/admin/contacts.tsx#3" size={16} />,
  ses: <Shield data-eos-id="src/pages/admin/contacts.tsx#4" size={16} />,
  internal: <Users data-eos-id="src/pages/admin/contacts.tsx#5" size={16} />,
}


/* ------------------------------------------------------------------ */
/*  Format phone for display                                           */
/* ------------------------------------------------------------------ */

function formatPhone(raw: string): string {
  if (raw.length <= 3) return raw
  if (raw.startsWith('13') || raw.startsWith('1800')) {
    if (raw.length === 6) return `${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4)}`
    if (raw.length === 7) return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`
    if (raw.length === 10) return `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`
    return raw
  }
  if (raw.startsWith('04')) return `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7)}`
  if (raw.startsWith('0') && raw.length === 10)
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)} ${raw.slice(6)}`
  return raw
}

/* ------------------------------------------------------------------ */
/*  Create / Edit Modal                                                */
/* ------------------------------------------------------------------ */

function ContactFormModal({
  open,
  onClose,
  contact,
}: {
  open: boolean
  onClose: () => void
  contact?: EmergencyContact | null
}) {
  const { toast } = useToast()
  const createMutation = useCreateContact()
  const updateMutation = useUpdateContact()
  const isEdit = !!contact

  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [note, setNote] = useState(contact?.note ?? '')
  const [category, setCategory] = useState<string>(contact?.category ?? 'emergency')
  const [selectedStates, setSelectedStates] = useState<string[]>(contact?.states ?? [])
  const [sortOrder, setSortOrder] = useState(contact?.sort_order ?? 0)
  const [isActive, setIsActive] = useState(contact?.is_active ?? true)

  const toggleState = (state: string) => {
    setSelectedStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state],
    )
  }

  const handleSubmit = async () => {
    const payload = {
      name: name.trim(),
      phone: phone.replace(/\s/g, ''),
      note: note.trim() || null,
      category,
      states: selectedStates,
      sort_order: sortOrder,
      is_active: isActive,
    }

    try {
      if (isEdit && contact) {
        await updateMutation.mutateAsync({ id: contact.id, ...payload })
        toast.success('Contact updated')
      } else {
        await createMutation.mutateAsync(payload)
        toast.success('Contact created')
      }
      onClose()
    } catch {
      toast.error(isEdit ? 'Failed to update contact' : 'Failed to create contact')
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <BottomSheet data-eos-id="src/pages/admin/contacts.tsx#6" open={open} onClose={onClose}>
      {/* Header */}
      <div data-eos-id="src/pages/admin/contacts.tsx#7" className="flex items-center justify-between mb-4">
        <h2 data-eos-id="src/pages/admin/contacts.tsx#8" className="font-heading text-lg font-semibold text-neutral-900">{isEdit ? 'Edit Contact' : 'Add Contact'}</h2>
        <button data-eos-id="src/pages/admin/contacts.tsx#9"
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X data-eos-id="src/pages/admin/contacts.tsx#10" size={20} />
        </button>
      </div>
      <div data-eos-id="src/pages/admin/contacts.tsx#11" className="space-y-4">
        {/* Category */}
        <Dropdown data-eos-id="src/pages/admin/contacts.tsx#12"
          label="Category"
          options={CONTACT_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          value={category}
          onChange={setCategory}
        />

        {/* Name */}
        <Input data-eos-id="src/pages/admin/contacts.tsx#13"
          label="Contact Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. WIRES (NSW)"
        />

        {/* Phone */}
        <Input data-eos-id="src/pages/admin/contacts.tsx#14"
          label="Phone Number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="e.g. 1300094737"
          type="tel"
        />

        {/* Note */}
        <Input data-eos-id="src/pages/admin/contacts.tsx#15"
          label="Note / Role"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Community Manager, 24/7 service"
        />

        {/* States */}
        <div data-eos-id="src/pages/admin/contacts.tsx#16">
          <label data-eos-id="src/pages/admin/contacts.tsx#17" className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Applicable States
          </label>
          <p data-eos-id="src/pages/admin/contacts.tsx#18" className="text-[11px] text-neutral-400 mb-2">
            Leave empty to show in all states. Select specific states to only show this contact for events in those states.
          </p>
          <div data-eos-id="src/pages/admin/contacts.tsx#19" className="flex flex-wrap gap-1.5">
            {AUSTRALIAN_STATES.map((state) => (
              <button data-eos-id="src/pages/admin/contacts.tsx#20"
                key={state}
                type="button"
                onClick={() => toggleState(state)}
                className={cn(
                  'px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors duration-150 min-h-[36px]',
                  selectedStates.includes(state)
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100',
                )}
              >
                {state}
              </button>
            ))}
            {selectedStates.length > 0 && (
              <button data-eos-id="src/pages/admin/contacts.tsx#21"
                type="button"
                onClick={() => setSelectedStates([])}
                className="px-3 py-1.5 rounded-sm text-xs font-semibold text-neutral-400 hover:text-neutral-600 min-h-[36px]"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Sort order */}
        <Input data-eos-id="src/pages/admin/contacts.tsx#22"
          label="Sort Order"
          value={String(sortOrder)}
          onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
          type="number"
          placeholder="0"
        />

        {/* Active toggle */}
        <div data-eos-id="src/pages/admin/contacts.tsx#23" className="flex items-center justify-between py-2">
          <span data-eos-id="src/pages/admin/contacts.tsx#24" className="text-sm font-medium text-neutral-900">Active</span>
          <button data-eos-id="src/pages/admin/contacts.tsx#25"
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors duration-150',
              isActive ? 'bg-success-500' : 'bg-neutral-200',
            )}
          >
            <span data-eos-id="src/pages/admin/contacts.tsx#26"
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-150',
                isActive && 'translate-x-5',
              )}
            />
          </button>
        </div>

        <Button data-eos-id="src/pages/admin/contacts.tsx#27"
          variant="primary"
          fullWidth
          onClick={handleSubmit}
          loading={isPending}
          disabled={!name.trim() || !phone.trim()}
        >
          {isEdit ? 'Save Changes' : 'Add Contact'}
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminContactsPage() {
  const shouldReduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<EmergencyContact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EmergencyContact | null>(null)
  const { toast } = useToast()

  const { data: contacts, isLoading } = useAdminContacts({ search, category: categoryFilter })
  const showLoading = useDelayedLoading(isLoading)
  const deleteMutation = useDeleteContact()

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success('Contact deleted')
    } catch {
      toast.error('Failed to delete contact')
    }
    setDeleteTarget(null)
  }

  // Group contacts by category for display
  const grouped = useMemo(() => {
    if (!contacts) return []
    const map = new Map<string, EmergencyContact[]>()
    for (const c of contacts) {
      const list = map.get(c.category) ?? []
      list.push(c)
      map.set(c.category, list)
    }
    // Preserve the canonical order
    const order = ['emergency', 'wildlife', 'marine', 'poison', 'ses', 'internal']
    return order
      .filter((cat) => map.has(cat))
      .map((cat) => ({
        category: cat,
        meta: CONTACT_CATEGORIES.find((cc) => cc.id === cat)!,
        contacts: map.get(cat)!,
      }))
  }, [contacts])

  // Stats
  const stats = useMemo(() => {
    if (!contacts) return null
    const total = contacts.length
    const categories = new Set(contacts.map((c) => c.category)).size
    const stateSpecific = contacts.filter((c) => c.states.length > 0).length
    return { total, categories, stateSpecific }
  }, [contacts])

  const rm = !!shouldReduceMotion

  const heroActions = useMemo(
    () => (
      <Button data-eos-id="src/pages/admin/contacts.tsx#28"
        variant="primary"
        size="sm"
        icon={<Plus data-eos-id="src/pages/admin/contacts.tsx#29" size={16} />}
        onClick={() => { setEditTarget(null); setShowForm(true) }}
      >
        Add Contact
      </Button>
    ),
    [],
  )

  const heroStats = useMemo(
    () => (
      <AdminHeroStatRow data-eos-id="src/pages/admin/contacts.tsx#30">
        <AdminHeroStat data-eos-id="src/pages/admin/contacts.tsx#31" value={stats?.total ?? 0} label="Total" icon={<Phone data-eos-id="src/pages/admin/contacts.tsx#32" size={18} />} color="primary" delay={0} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/contacts.tsx#33" value={stats?.categories ?? 0} label="Categories" icon={<MapPin data-eos-id="src/pages/admin/contacts.tsx#34" size={18} />} color="moss" delay={1} reducedMotion={rm} />
        <AdminHeroStat data-eos-id="src/pages/admin/contacts.tsx#35" value={stats?.stateSpecific ?? 0} label="State-Specific" icon={<MapPin data-eos-id="src/pages/admin/contacts.tsx#36" size={18} />} color="sprout" delay={2} reducedMotion={rm} />
      </AdminHeroStatRow>
    ),
    [stats, rm],
  )

  useAdminHeader('Emergency Contacts', { actions: heroActions, heroContent: heroStats })

  const { stagger, fadeUp } = adminVariants(rm)

  return (
    <div data-eos-id="src/pages/admin/contacts.tsx#37">
      <motion.div data-eos-id="src/pages/admin/contacts.tsx#38" variants={stagger} initial="hidden" animate="visible">
        {/* Filters */}
        <motion.div data-eos-id="src/pages/admin/contacts.tsx#39" variants={fadeUp} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <SearchBar data-eos-id="src/pages/admin/contacts.tsx#40"
            value={search}
            onChange={setSearch}
            placeholder="Search contacts..."
            compact
            className="flex-1"
          />
          <div data-eos-id="src/pages/admin/contacts.tsx#41" className="flex items-center gap-0.5 rounded-sm shadow-sm bg-white p-0.5 overflow-x-auto">
            <button data-eos-id="src/pages/admin/contacts.tsx#42"
              type="button"
              onClick={() => setCategoryFilter('')}
              className={cn(
                'px-3 min-h-11 rounded-sm text-sm font-semibold whitespace-nowrap',
                'transition-colors duration-150 cursor-pointer select-none',
                !categoryFilter
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-600',
              )}
            >
              All
            </button>
            {CONTACT_CATEGORIES.map((cat) => (
              <button data-eos-id="src/pages/admin/contacts.tsx#43" data-eos-var="cat.label" data-eos-var-label="Label" data-eos-var-scope="item"
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={cn(
                  'px-3 min-h-11 rounded-sm text-sm font-semibold whitespace-nowrap',
                  'transition-colors duration-150 cursor-pointer select-none',
                  categoryFilter === cat.id
                    ? 'bg-neutral-100 text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-700',
                )}
              >
                {cat.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Contact list */}
        <motion.div data-eos-id="src/pages/admin/contacts.tsx#44" variants={fadeUp}>
          {showLoading ? (
            <Skeleton data-eos-id="src/pages/admin/contacts.tsx#45" variant="list-item" count={8} />
          ) : !grouped.length ? (
            <EmptyState data-eos-id="src/pages/admin/contacts.tsx#46"
              illustration="empty"
              title="No contacts found"
              description={search ? 'Try a different search term' : 'Add your first emergency contact'}
              action={
                !search
                  ? { label: 'Add Contact', onClick: () => { setEditTarget(null); setShowForm(true) } }
                  : undefined
              }
            />
          ) : (
            <div data-eos-id="src/pages/admin/contacts.tsx#47" className="space-y-6">
              {grouped.map((group) => {
                const colors = CONTACT_CATEGORY_COLORS[group.category] ?? CONTACT_CATEGORY_COLORS.emergency
                const icon = CATEGORY_ICONS[group.category]

                return (
                  <div data-eos-id="src/pages/admin/contacts.tsx#48" key={group.category}>
                    {/* Category header */}
                    <div data-eos-id="src/pages/admin/contacts.tsx#49" className="flex items-center gap-2.5 mb-3">
                      <span data-eos-id="src/pages/admin/contacts.tsx#50"
                        className={cn(
                          'flex items-center justify-center w-8 h-8 rounded-sm',
                          colors.bg,
                          colors.text,
                        )}
                      >
                        {icon}
                      </span>
                      <h3 data-eos-id="src/pages/admin/contacts.tsx#51" data-eos-var="group.meta.label" data-eos-var-label="Label" data-eos-var-scope="item" className="font-heading text-sm font-bold text-neutral-900">
                        {group.meta.label}
                      </h3>
                      <span data-eos-id="src/pages/admin/contacts.tsx#52" className="text-xs text-neutral-400">
                        {group.contacts.length} contact{group.contacts.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Contact rows */}
                    <div data-eos-id="src/pages/admin/contacts.tsx#53" className="space-y-1.5">
                      {group.contacts.map((contact, i) => (
                        <motion.div data-eos-id="src/pages/admin/contacts.tsx#54"
                          key={contact.id}
                          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: Math.min(i * 0.025, 0.2),
                            duration: 0.2,
                            ease: 'easeOut',
                          }}
                          className={cn(
                            'flex items-center gap-3 p-3.5 rounded-sm bg-white shadow-sm',
                            'transition-colors duration-150',
                            !contact.is_active && 'opacity-50',
                          )}
                        >
                          {/* Phone icon */}
                          <span data-eos-id="src/pages/admin/contacts.tsx#55"
                            className={cn(
                              'flex items-center justify-center w-9 h-9 rounded-full ring-1 shrink-0',
                              colors.bg,
                              colors.ring,
                            )}
                          >
                            <Phone data-eos-id="src/pages/admin/contacts.tsx#56" size={14} className={colors.text} />
                          </span>

                          {/* Info */}
                          <div data-eos-id="src/pages/admin/contacts.tsx#57" className="flex-1 min-w-0">
                            <div data-eos-id="src/pages/admin/contacts.tsx#58" className="flex items-start gap-2 mb-0.5">
                              <p data-eos-id="src/pages/admin/contacts.tsx#59" data-eos-var="contact.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 leading-snug break-words flex-1 min-w-0">
                                {contact.name}
                              </p>
                              {!contact.is_active && (
                                <span data-eos-id="src/pages/admin/contacts.tsx#60" className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 shrink-0 mt-0.5">
                                  Inactive
                                </span>
                              )}
                            </div>
                            <div data-eos-id="src/pages/admin/contacts.tsx#61" className="flex items-center gap-2 text-xs text-neutral-400">
                              <span data-eos-id="src/pages/admin/contacts.tsx#62" data-eos-var="contact.phone" data-eos-var-label="Phone" data-eos-var-scope="item" className="font-medium tabular-nums">
                                {formatPhone(contact.phone)}
                              </span>
                              {contact.note && (
                                <>
                                  <span data-eos-id="src/pages/admin/contacts.tsx#63" className="text-neutral-200">·</span>
                                  <span data-eos-id="src/pages/admin/contacts.tsx#64" data-eos-var="contact.note" data-eos-var-label="Note" data-eos-var-scope="item" className="truncate">{contact.note}</span>
                                </>
                              )}
                            </div>
                            {contact.states.length > 0 && (
                              <div data-eos-id="src/pages/admin/contacts.tsx#65" className="flex flex-wrap gap-1 mt-1.5">
                                {contact.states.map((s) => (
                                  <span data-eos-id="src/pages/admin/contacts.tsx#66"
                                    key={s}
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-50 text-neutral-500"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div data-eos-id="src/pages/admin/contacts.tsx#67" className="flex items-center gap-0.5 shrink-0">
                            <button data-eos-id="src/pages/admin/contacts.tsx#68"
                              type="button"
                              onClick={() => { setEditTarget(contact); setShowForm(true) }}
                              className="flex items-center justify-center min-w-11 min-h-11 rounded-sm text-neutral-400 hover:bg-neutral-50 cursor-pointer active:scale-[0.98] transition-[colors,transform]"
                              aria-label={`Edit ${contact.name}`}
                            >
                              <Pencil data-eos-id="src/pages/admin/contacts.tsx#69" size={15} />
                            </button>
                            <button data-eos-id="src/pages/admin/contacts.tsx#70"
                              type="button"
                              onClick={() => setDeleteTarget(contact)}
                              className="flex items-center justify-center min-w-11 min-h-11 rounded-sm text-neutral-400 hover:bg-red-50 hover:text-red-500 cursor-pointer active:scale-[0.98] transition-[colors,transform]"
                              aria-label={`Delete ${contact.name}`}
                            >
                              <Trash2 data-eos-id="src/pages/admin/contacts.tsx#71" size={15} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Create / Edit modal */}
      {showForm && (
        <ContactFormModal data-eos-id="src/pages/admin/contacts.tsx#72"
          open={showForm}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          contact={editTarget}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/contacts.tsx#73"
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Contact"
        description={`"${deleteTarget?.name}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}
