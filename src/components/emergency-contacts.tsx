import { useState, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Phone,
    ChevronDown,
    Siren,
    Shield,
    Waves,
    Bug,
    TreePine,
    Users,
    Loader2,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { SearchBar } from '@/components/search-bar'
import { useEmergencyContacts } from '@/hooks/use-admin-contacts'
import type { Tables } from '@/types/database.types'

type EmergencyContact = Tables<'emergency_contacts'>

/* ------------------------------------------------------------------ */
/*  Category visual config                                              */
/* ------------------------------------------------------------------ */

interface CategoryVisual {
  title: string
  icon: React.ReactNode
  gradient: string
  ringColor: string
  phoneColor: string
}

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  emergency: {
    title: 'Emergency Services',
    icon: <Siren data-eos-id="src/components/emergency-contacts.tsx#0" size={18} />,
    gradient: 'from-error-500 to-error-600',
    ringColor: 'ring-error-200',
    phoneColor: 'text-error-500',
  },
  wildlife: {
    title: 'Wildlife Rescue',
    icon: <TreePine data-eos-id="src/components/emergency-contacts.tsx#1" size={18} />,
    gradient: 'from-moss-500 to-moss-600',
    ringColor: 'ring-moss-200',
    phoneColor: 'text-moss-500',
  },
  marine: {
    title: 'Marine Wildlife',
    icon: <Waves data-eos-id="src/components/emergency-contacts.tsx#2" size={18} />,
    gradient: 'from-primary-600 to-moss-700',
    ringColor: 'ring-primary-200',
    phoneColor: 'text-primary-600',
  },
  poison: {
    title: 'Poisoning & Snakebite',
    icon: <Bug data-eos-id="src/components/emergency-contacts.tsx#3" size={18} />,
    gradient: 'from-bark-500 to-bark-600',
    ringColor: 'ring-bark-200',
    phoneColor: 'text-bark-500',
  },
  ses: {
    title: 'SES & National Parks',
    icon: <Shield data-eos-id="src/components/emergency-contacts.tsx#4" size={18} />,
    gradient: 'from-primary-500 to-primary-600',
    ringColor: 'ring-primary-200',
    phoneColor: 'text-primary-500',
  },
  internal: {
    title: 'Co-Exist Internal',
    icon: <Users data-eos-id="src/components/emergency-contacts.tsx#5" size={18} />,
    gradient: 'from-plum-500 to-plum-600',
    ringColor: 'ring-plum-200',
    phoneColor: 'text-plum-500',
  },
}

const CATEGORY_ORDER = ['emergency', 'wildlife', 'marine', 'poison', 'ses', 'internal']

/* ------------------------------------------------------------------ */
/*  Format phone number for display                                     */
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
/*  Accordion section                                                   */
/* ------------------------------------------------------------------ */

interface GroupedSection {
  category: string
  visual: CategoryVisual
  contacts: EmergencyContact[]
}

function ContactAccordion({
  section,
  isOpen,
  onToggle,
  searchQuery,
}: {
  section: GroupedSection
  isOpen: boolean
  onToggle: () => void
  searchQuery: string
}) {
  const rm = useReducedMotion()

  const filteredContacts = searchQuery.trim()
    ? section.contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          formatPhone(c.phone).includes(searchQuery),
      )
    : section.contacts

  if (searchQuery.trim() && filteredContacts.length === 0) return null

  const matchCount = searchQuery.trim() ? filteredContacts.length : null
  const visual = section.visual

  return (
    <div data-eos-id="src/components/emergency-contacts.tsx#6" className="rounded-md bg-white shadow-sm border border-neutral-100 overflow-hidden">
      {/* Accordion header */}
      <button data-eos-id="src/components/emergency-contacts.tsx#7"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3.5',
          'active:bg-neutral-50 transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-inset',
        )}
        aria-expanded={isOpen}
      >
        <span data-eos-id="src/components/emergency-contacts.tsx#8" data-eos-var="visual.icon" data-eos-var-label="Icon" data-eos-var-scope="prop"
          className={cn(
            'flex items-center justify-center w-9 h-9 rounded-sm text-white shadow-sm',
            `bg-gradient-to-br ${visual.gradient}`,
          )}
        >
          {visual.icon}
        </span>
        <span data-eos-id="src/components/emergency-contacts.tsx#9" className="flex-1 text-left">
          <span data-eos-id="src/components/emergency-contacts.tsx#10" data-eos-var="visual.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900">{visual.title}</span>
          {matchCount !== null && (
            <span data-eos-id="src/components/emergency-contacts.tsx#11" className="ml-2 text-xs text-neutral-500">
              {matchCount} result{matchCount !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <motion.span data-eos-id="src/components/emergency-contacts.tsx#12"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={rm ? { duration: 0 } : { duration: 0.2 }}
          className="text-neutral-300"
        >
          <ChevronDown data-eos-id="src/components/emergency-contacts.tsx#13" size={18} />
        </motion.span>
      </button>

      {/* Accordion body */}
      <AnimatePresence data-eos-id="src/components/emergency-contacts.tsx#14" initial={false}>
        {isOpen && (
          <motion.div data-eos-id="src/components/emergency-contacts.tsx#15"
            initial={rm ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={rm ? { duration: 0 } : { duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div data-eos-id="src/components/emergency-contacts.tsx#16" className="px-3 pb-3 space-y-1.5">
              {filteredContacts.map((contact) => (
                <a data-eos-href="dynamic" data-eos-href-label="Phone" data-eos-href-scope="item" data-eos-id="src/components/emergency-contacts.tsx#17"
                  key={contact.id}
                  href={`tel:${contact.phone}`}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-sm',
                    'bg-neutral-50 active:bg-neutral-100',
                    'transition-colors duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                    'min-h-[52px]',
                  )}
                >
                  <span data-eos-id="src/components/emergency-contacts.tsx#18"
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-full',
                      'bg-white ring-1',
                      visual.ringColor,
                      'shadow-sm shrink-0',
                    )}
                  >
                    <Phone data-eos-id="src/components/emergency-contacts.tsx#19" size={16} className={visual.phoneColor} />
                  </span>
                  <div data-eos-id="src/components/emergency-contacts.tsx#20" className="flex-1 min-w-0">
                    <p data-eos-id="src/components/emergency-contacts.tsx#21" data-eos-var="contact.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 leading-snug truncate">
                      {contact.name}
                    </p>
                    {contact.note && (
                      <p data-eos-id="src/components/emergency-contacts.tsx#22" data-eos-var="contact.note" data-eos-var-label="Note" data-eos-var-scope="item" className="text-[11px] text-neutral-500 leading-snug mt-0.5 truncate">
                        {contact.note}
                      </p>
                    )}
                  </div>
                  <span data-eos-id="src/components/emergency-contacts.tsx#23" data-eos-var="contact.phone" data-eos-var-label="Phone" data-eos-var-scope="item" className="text-sm font-semibold text-primary-600 tabular-nums whitespace-nowrap shrink-0">
                    {formatPhone(contact.phone)}
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

interface EmergencyContactsProps {
  /** Australian state code for the event (from the collective). Filters contacts to relevant state. */
  eventState?: string | null
}

export function EmergencyContacts({ eventState }: EmergencyContactsProps) {
  const { data: contacts, isLoading } = useEmergencyContacts(eventState)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['emergency', 'internal']))
  const [searchQuery, setSearchQuery] = useState('')

  // Group fetched contacts by category
  const sections = useMemo(() => {
    if (!contacts) return []
    const map = new Map<string, EmergencyContact[]>()
    for (const c of contacts) {
      const list = map.get(c.category) ?? []
      list.push(c)
      map.set(c.category, list)
    }
    return CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat): GroupedSection => ({
        category: cat,
        visual: CATEGORY_VISUALS[cat] ?? CATEGORY_VISUALS.emergency,
        contacts: map.get(cat)!,
      }))
  }, [contacts])

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // When searching, auto-open sections with matches
  const effectiveOpen = searchQuery.trim()
    ? new Set(
        sections
          .filter((s) =>
            s.contacts.some(
              (c) =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                formatPhone(c.phone).includes(searchQuery),
            ),
          )
          .map((s) => s.category),
      )
    : openSections

  const hasResults = searchQuery.trim()
    ? sections.some((s) =>
        s.contacts.some(
          (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            formatPhone(c.phone).includes(searchQuery),
        ),
      )
    : true

  return (
    <div data-eos-id="src/components/emergency-contacts.tsx#24" className="space-y-4">
      {/* Section header */}
      <div data-eos-id="src/components/emergency-contacts.tsx#25" className="flex items-center gap-3">
        <span data-eos-id="src/components/emergency-contacts.tsx#26" className="flex items-center justify-center w-8 h-8 rounded-sm bg-error-100 text-error-600">
          <Phone data-eos-id="src/components/emergency-contacts.tsx#27" size={16} />
        </span>
        <div data-eos-id="src/components/emergency-contacts.tsx#28">
          <h3 data-eos-id="src/components/emergency-contacts.tsx#29" className="font-heading text-base font-bold text-neutral-900">
            Emergency Contacts
          </h3>
          <p data-eos-id="src/components/emergency-contacts.tsx#30" className="text-[11px] text-neutral-500">
            {eventState
              ? `Showing contacts for ${eventState}  tap any number to call`
              : 'Tap any number to call instantly'}
          </p>
        </div>
      </div>

      {/* Search */}
      <SearchBar data-eos-id="src/components/emergency-contacts.tsx#31" value={searchQuery} onChange={setSearchQuery} placeholder="Search contacts..." compact />

      {/* Emergency banner  always visible, quick access to 000 */}
      <a data-eos-href="static" data-eos-id="src/components/emergency-contacts.tsx#32"
        href="tel:000"
        className={cn(
          'flex items-center gap-3 px-4 py-3.5 rounded-md',
          'bg-error-600',
          'shadow-sm',
          'active:scale-[0.98] transition-transform duration-150',
          'min-h-[56px]',
        )}
      >
        <span data-eos-id="src/components/emergency-contacts.tsx#33" className="flex items-center justify-center w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm">
          <Siren data-eos-id="src/components/emergency-contacts.tsx#34" size={22} className="text-white" />
        </span>
        <div data-eos-id="src/components/emergency-contacts.tsx#35" className="flex-1">
          <p data-eos-id="src/components/emergency-contacts.tsx#36" className="text-sm font-bold text-white">Triple Zero (000)</p>
          <p data-eos-id="src/components/emergency-contacts.tsx#37" className="text-[11px] text-white/70">Police, Fire, Ambulance</p>
        </div>
        <span data-eos-id="src/components/emergency-contacts.tsx#38" className="text-xl font-bold text-white tracking-wider">000</span>
      </a>

      {/* Loading */}
      {isLoading && (
        <div data-eos-id="src/components/emergency-contacts.tsx#39" className="flex items-center justify-center py-8">
          <Loader2 data-eos-id="src/components/emergency-contacts.tsx#40" size={24} className="text-neutral-400 animate-spin" />
        </div>
      )}

      {/* Accordion sections */}
      {!isLoading && (
        <div data-eos-id="src/components/emergency-contacts.tsx#41" className="space-y-2.5">
          {sections.map((section) => (
            <ContactAccordion data-eos-id="src/components/emergency-contacts.tsx#42"
              key={section.category}
              section={section}
              isOpen={effectiveOpen.has(section.category)}
              onToggle={() => toggleSection(section.category)}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}

      {/* No results */}
      {!isLoading && !hasResults && (
        <div data-eos-id="src/components/emergency-contacts.tsx#43" className="text-center py-6">
          <p data-eos-id="src/components/emergency-contacts.tsx#44" className="text-sm text-neutral-500">No contacts matching &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}
    </div>
  )
}
