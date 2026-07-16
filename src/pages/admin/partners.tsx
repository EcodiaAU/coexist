import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Handshake,
  Plus,
  Globe,
  Trash2,
  Tag,
  Building2,
  Receipt,
  Gift,
  Trophy,
  X,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { BottomSheet } from '@/components/bottom-sheet'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { TabBar } from '@/components/tab-bar'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'

/* ------------------------------------------------------------------ */
/*  Data hooks                                                         */
/* ------------------------------------------------------------------ */

function useOrganisations() {
  return useQuery({
    queryKey: ['admin-organisations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organisations')
        .select('*')
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}

function usePartnerOffers() {
  return useQuery({
    queryKey: ['admin-partner-offers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_offers')
        .select('*, organisations(name, logo_url)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const orgTypeOptions = [
  { value: 'corporate', label: 'Corporate' },
  { value: 'ngo', label: 'NGO' },
  { value: 'government', label: 'Government' },
  { value: 'community', label: 'Community' },
]

const tabs = [
  { id: 'organisations', label: 'Organisations', icon: <Building2 data-eos-id="src/pages/admin/partners.tsx#0" data-eos-v="2" size={14} /> },
  { id: 'offers', label: 'Partner Offers', icon: <Gift data-eos-id="src/pages/admin/partners.tsx#1" size={14} /> },
  { id: 'corporate', label: 'Corporate Programs', icon: <Handshake data-eos-id="src/pages/admin/partners.tsx#2" size={14} /> },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminPartnersPage() {
  const [activeTab, setActiveTab] = useState('organisations')
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [showCreateOffer, setShowCreateOffer] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: string } | null>(null)
  const [orgForm, setOrgForm] = useState({
    name: '',
    type: 'corporate',
    website: '',
    contact_name: '',
    contact_email: '',
    description: '',
  })
  const [offerForm, setOfferForm] = useState({
    title: '',
    description: '',
    organisation_id: '',
    category: '',
    terms: '',
  })

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: organisations, isLoading: orgsLoading } = useOrganisations()
  const showOrgsLoading = useDelayedLoading(orgsLoading)
  const { data: offers, isLoading: offersLoading } = usePartnerOffers()
  const showOffersLoading = useDelayedLoading(offersLoading)

  const heroStats = useMemo(() => (
    <AdminHeroStatRow data-eos-id="src/pages/admin/partners.tsx#3">
      <AdminHeroStat data-eos-id="src/pages/admin/partners.tsx#4" value={organisations?.length ?? 0} label="Organisations" icon={<Building2 data-eos-id="src/pages/admin/partners.tsx#5" size={18} />} color="bark" delay={0} reducedMotion={false} />
      <AdminHeroStat data-eos-id="src/pages/admin/partners.tsx#6" value={offers?.length ?? 0} label="Offers" icon={<Gift data-eos-id="src/pages/admin/partners.tsx#7" size={18} />} color="sprout" delay={1} reducedMotion={false} />
    </AdminHeroStatRow>
  ), [organisations?.length, offers?.length])

  useAdminHeader('Partners & Sponsors', { heroContent: heroStats })

  /* ---- Create org (optimistic) ---- */
  const createOrgMutation = useMutation({
    mutationFn: async (form: typeof orgForm) => {
      const { data, error } = await supabase
        .from('organisations')
        .insert(form)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onMutate: async (form) => {
      await queryClient.cancelQueries({ queryKey: ['admin-organisations'] })
      const previous = queryClient.getQueryData<Record<string, unknown>[]>(['admin-organisations'])

      const optimistic = {
        id: `temp-${crypto.randomUUID()}`,
        ...form,
        logo_url: null,
        created_at: new Date().toISOString(),
      }

      queryClient.setQueryData<Record<string, unknown>[]>(['admin-organisations'], (old = []) =>
        [...old, optimistic].sort((a, b) => (a.name as string).localeCompare(b.name as string)),
      )

      setShowCreateOrg(false)
      setOrgForm({ name: '', type: 'corporate', website: '', contact_name: '', contact_email: '', description: '' })

      return { previous }
    },
    onError: (_err, _form, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin-organisations'], context.previous)
      }
      toast.error('Failed to add organisation')
    },
    onSuccess: () => {
      toast.success('Organisation added')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-organisations'] })
    },
  })

  /* ---- Create offer (optimistic) ---- */
  const createOfferMutation = useMutation({
    mutationFn: async (form: typeof offerForm) => {
      const org = organisations?.find((o) => o.id === form.organisation_id)
      const { data, error } = await supabase
        .from('partner_offers')
        .insert({
          partner_name: org?.name ?? form.title,
          title: form.title,
          description: form.description,
          organisation_id: form.organisation_id || null,
          category: form.category,
          terms_and_conditions: form.terms,
        })
        .select('*, organisations(name, logo_url)')
        .single()
      if (error) throw error
      return data
    },
    onMutate: async (form) => {
      await queryClient.cancelQueries({ queryKey: ['admin-partner-offers'] })
      const previous = queryClient.getQueryData<Record<string, unknown>[]>(['admin-partner-offers'])

      const matchedOrg = organisations?.find((o) => o.id === form.organisation_id)
      const optimistic = {
        id: `temp-${crypto.randomUUID()}`,
        title: form.title,
        description: form.description,
        organisation_id: form.organisation_id || null,
        category: form.category,
        terms_and_conditions: form.terms,
        organisations: matchedOrg ? { name: matchedOrg.name, logo_url: matchedOrg.logo_url } : null,
        created_at: new Date().toISOString(),
      }

      queryClient.setQueryData<Record<string, unknown>[]>(['admin-partner-offers'], (old = []) =>
        [optimistic, ...old],
      )

      setShowCreateOffer(false)
      setOfferForm({ title: '', description: '', organisation_id: '', category: '', terms: '' })

      return { previous }
    },
    onError: (_err, _form, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin-partner-offers'], context.previous)
      }
      toast.error('Failed to add offer')
    },
    onSuccess: () => {
      toast.success('Offer added')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-partner-offers'] })
    },
  })

  /* ---- Delete (optimistic) ---- */
  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      const table = type === 'org' ? 'organisations' : 'partner_offers'
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, type }) => {
      const orgKey = ['admin-organisations']
      const offerKey = ['admin-partner-offers']

      await queryClient.cancelQueries({ queryKey: orgKey })
      await queryClient.cancelQueries({ queryKey: offerKey })

      const previousOrgs = queryClient.getQueryData<Record<string, unknown>[]>(orgKey)
      const previousOffers = queryClient.getQueryData<Record<string, unknown>[]>(offerKey)

      if (type === 'org') {
        queryClient.setQueryData<Record<string, unknown>[]>(orgKey, (old = []) =>
          old.filter((o) => o.id !== id),
        )
      } else {
        queryClient.setQueryData<Record<string, unknown>[]>(offerKey, (old = []) =>
          old.filter((o) => o.id !== id),
        )
      }

      setDeleteTarget(null)

      return { previousOrgs, previousOffers }
    },
    onError: (_err, { type }, context) => {
      if (context?.previousOrgs) {
        queryClient.setQueryData(['admin-organisations'], context.previousOrgs)
      }
      if (context?.previousOffers) {
        queryClient.setQueryData(['admin-partner-offers'], context.previousOffers)
      }
      toast.error(`Failed to delete ${type === 'org' ? 'organisation' : 'offer'}`)
    },
    onSuccess: (_data, { type }) => {
      toast.success(`${type === 'org' ? 'Organisation' : 'Offer'} deleted`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-organisations'] })
      queryClient.invalidateQueries({ queryKey: ['admin-partner-offers'] })
    },
  })

  const shouldReduceMotion = useReducedMotion()
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <div data-eos-id="src/pages/admin/partners.tsx#8">
        <motion.div data-eos-id="src/pages/admin/partners.tsx#9" variants={stagger} initial="hidden" animate="visible">
          <motion.div data-eos-id="src/pages/admin/partners.tsx#10" variants={fadeUp}>
            <TabBar data-eos-id="src/pages/admin/partners.tsx#11"
              tabs={tabs}
              activeTab={activeTab}
              onChange={setActiveTab}
              className="mb-4"
            />
          </motion.div>

      {/* Organisations tab */}
      {activeTab === 'organisations' && (
        <>
          <div data-eos-id="src/pages/admin/partners.tsx#12" className="flex justify-end mb-4">
            <Button data-eos-id="src/pages/admin/partners.tsx#13"
              variant="primary"
              size="sm"
              icon={<Plus data-eos-id="src/pages/admin/partners.tsx#14" size={16} />}
              onClick={() => setShowCreateOrg(true)}
            >
              Add Organisation
            </Button>
          </div>

          {showOrgsLoading ? (
            <Skeleton data-eos-id="src/pages/admin/partners.tsx#15" variant="list-item" count={4} />
          ) : orgsLoading ? null : !organisations?.length ? (
            <EmptyState data-eos-id="src/pages/admin/partners.tsx#16"
              illustration="empty"
              title="No organisations"
              description="Add partner organisations that Co-Exist collaborates with"
              action={{ label: 'Add Organisation', onClick: () => setShowCreateOrg(true) }}
            />
          ) : (
            <StaggeredList data-eos-id="src/pages/admin/partners.tsx#17" className="space-y-2">
              {organisations.map((org) => (
                <StaggeredItem data-eos-id="src/pages/admin/partners.tsx#18"
                  key={org.id}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-sm bg-white shadow-sm',
                    String(org.id).startsWith('temp-') && 'opacity-60',
                  )}
                >
                  {org.logo_url ? (
                    <img data-eos-src="dynamic" data-eos-src-label="Logo url" data-eos-id="src/pages/admin/partners.tsx#19"
                      src={org.logo_url}
                      alt=""
                      className="w-10 h-10 rounded-sm object-contain bg-white shrink-0"
                    />
                  ) : (
                    <div data-eos-id="src/pages/admin/partners.tsx#20" className="w-10 h-10 rounded-sm bg-neutral-50 shadow-sm flex items-center justify-center shrink-0">
                      <Building2 data-eos-id="src/pages/admin/partners.tsx#21" size={18} className="text-neutral-400" />
                    </div>
                  )}

                  <div data-eos-id="src/pages/admin/partners.tsx#22" className="flex-1 min-w-0">
                    <div data-eos-id="src/pages/admin/partners.tsx#23" className="flex items-center gap-2">
                      <p data-eos-id="src/pages/admin/partners.tsx#24" data-eos-var="org.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">
                        {org.name}
                      </p>
                      <span data-eos-id="src/pages/admin/partners.tsx#25" data-eos-var="org.type" data-eos-var-label="Type" data-eos-var-scope="item" className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-white text-neutral-400 shrink-0">
                        {org.type}
                      </span>
                    </div>
                    <div data-eos-id="src/pages/admin/partners.tsx#26" className="flex items-center gap-3 mt-0.5 text-xs text-neutral-400">
                      {org.contact_name && <span data-eos-id="src/pages/admin/partners.tsx#27" data-eos-var="org.contact_name" data-eos-var-label="Contact name" data-eos-var-scope="item">{org.contact_name}</span>}
                      {org.website && (
                        <a data-eos-href="dynamic" data-eos-href-label="Website" data-eos-href-scope="item" data-eos-id="src/pages/admin/partners.tsx#28"
                          href={org.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 hover:text-neutral-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe data-eos-id="src/pages/admin/partners.tsx#29" size={10} /> Website
                        </a>
                      )}
                    </div>
                  </div>

                  <button data-eos-id="src/pages/admin/partners.tsx#30"
                    type="button"
                    onClick={() => setDeleteTarget({ id: org.id, type: 'org' })}
                    className="p-1.5 min-h-11 min-w-11 flex items-center justify-center rounded-sm text-neutral-400 hover:bg-error-50 hover:text-error-600 cursor-pointer"
                    aria-label={`Delete ${org.name}`}
                  >
                    <Trash2 data-eos-id="src/pages/admin/partners.tsx#31" size={16} />
                  </button>
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </>
      )}

      {/* Partner Offers tab */}
      {activeTab === 'offers' && (
        <>
          <div data-eos-id="src/pages/admin/partners.tsx#32" className="flex justify-end mb-4">
            <Button data-eos-id="src/pages/admin/partners.tsx#33"
              variant="primary"
              size="sm"
              icon={<Plus data-eos-id="src/pages/admin/partners.tsx#34" size={16} />}
              onClick={() => setShowCreateOffer(true)}
            >
              Add Offer
            </Button>
          </div>

          {showOffersLoading ? (
            <Skeleton data-eos-id="src/pages/admin/partners.tsx#35" variant="list-item" count={4} />
          ) : offersLoading ? null : !offers?.length ? (
            <EmptyState data-eos-id="src/pages/admin/partners.tsx#36"
              illustration="empty"
              title="No partner offers"
              description="Create offers and discounts from partner organisations"
              action={{ label: 'Add Offer', onClick: () => setShowCreateOffer(true) }}
            />
          ) : (
            <StaggeredList data-eos-id="src/pages/admin/partners.tsx#37" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {offers.map((offer) => (
                <StaggeredItem data-eos-id="src/pages/admin/partners.tsx#38"
                  key={offer.id}
                  className={cn(
                    'p-4 rounded-sm bg-white shadow-sm',
                    String(offer.id).startsWith('temp-') && 'opacity-60',
                  )}
                >
                  <div data-eos-id="src/pages/admin/partners.tsx#39" className="flex items-start justify-between gap-2">
                    <div data-eos-id="src/pages/admin/partners.tsx#40">
                      <h3 data-eos-id="src/pages/admin/partners.tsx#41" data-eos-var="offer.title" data-eos-var-label="Title" data-eos-var-scope="item" className="font-heading text-sm font-semibold text-neutral-900">
                        {offer.title}
                      </h3>
                      {offer.organisations?.name && (
                        <p data-eos-id="src/pages/admin/partners.tsx#42" data-eos-var="offer.organisations.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-xs text-neutral-400 mt-0.5">
                          by {offer.organisations.name}
                        </p>
                      )}
                    </div>
                    <button data-eos-id="src/pages/admin/partners.tsx#43"
                      type="button"
                      onClick={() => setDeleteTarget({ id: offer.id, type: 'offer' })}
                      className="p-1 rounded text-neutral-400 hover:text-error-600 cursor-pointer"
                      aria-label="Delete offer"
                    >
                      <Trash2 data-eos-id="src/pages/admin/partners.tsx#44" size={14} />
                    </button>
                  </div>
                  {offer.description && (
                    <p data-eos-id="src/pages/admin/partners.tsx#45" data-eos-var="offer.description" data-eos-var-label="Description" data-eos-var-scope="item" className="text-xs text-neutral-400 mt-2 line-clamp-2">
                      {offer.description}
                    </p>
                  )}
                  {offer.category && (
                    <span data-eos-id="src/pages/admin/partners.tsx#46" data-eos-var="offer.category" data-eos-var-label="Category" data-eos-var-scope="item" className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-50 shadow-sm text-neutral-900">
                      <Tag data-eos-id="src/pages/admin/partners.tsx#47" size={10} />
                      {offer.category}
                    </span>
                  )}
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </>
      )}

      {/* Corporate Programs tab */}
      {activeTab === 'corporate' && (
        <div data-eos-id="src/pages/admin/partners.tsx#48" className="space-y-4">
          <div data-eos-id="src/pages/admin/partners.tsx#49" className="p-6 rounded-sm bg-white border border-neutral-100 shadow-sm">
            <h3 data-eos-id="src/pages/admin/partners.tsx#50" className="font-heading text-base font-semibold text-neutral-900 mb-2">
              Corporate Volunteer Programs
            </h3>
            <p data-eos-id="src/pages/admin/partners.tsx#51" className="text-sm text-neutral-900 mb-4">
              Track corporate partner volunteering, generate CSR reports, and manage
              sponsored challenges.
            </p>
            <div data-eos-id="src/pages/admin/partners.tsx#52" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div data-eos-id="src/pages/admin/partners.tsx#53" className="p-3 rounded-sm bg-white/70">
                <Handshake data-eos-id="src/pages/admin/partners.tsx#54" size={18} className="text-neutral-400 mb-1" />
                <p data-eos-id="src/pages/admin/partners.tsx#55" className="text-sm font-medium text-neutral-900">Corporate Events</p>
                <p data-eos-id="src/pages/admin/partners.tsx#56" className="text-xs text-neutral-400">
                  Tag events with corporate partners for separate tracking
                </p>
              </div>
              <div data-eos-id="src/pages/admin/partners.tsx#57" className="p-3 rounded-sm bg-white/70">
                <Receipt data-eos-id="src/pages/admin/partners.tsx#58" size={18} className="text-neutral-400 mb-1" />
                <p data-eos-id="src/pages/admin/partners.tsx#59" className="text-sm font-medium text-neutral-900">Invoice Generation</p>
                <p data-eos-id="src/pages/admin/partners.tsx#60" className="text-xs text-neutral-400">
                  Generate branded invoices for corporate sponsors
                </p>
              </div>
              <div data-eos-id="src/pages/admin/partners.tsx#61" className="p-3 rounded-sm bg-white/70">
                <Trophy data-eos-id="src/pages/admin/partners.tsx#62" size={18} className="text-neutral-400 mb-1" />
                <p data-eos-id="src/pages/admin/partners.tsx#63" className="text-sm font-medium text-neutral-900">Sponsored Challenges</p>
                <p data-eos-id="src/pages/admin/partners.tsx#64" className="text-xs text-neutral-400">
                  Link challenges to sponsor organisations
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create org modal */}
      <BottomSheet data-eos-id="src/pages/admin/partners.tsx#65" open={showCreateOrg} onClose={() => setShowCreateOrg(false)}>
        {/* Header */}
        <div data-eos-id="src/pages/admin/partners.tsx#66" className="flex items-center justify-between mb-4">
          <h2 data-eos-id="src/pages/admin/partners.tsx#67" className="font-heading text-lg font-semibold text-neutral-900">Add Organisation</h2>
          <button data-eos-id="src/pages/admin/partners.tsx#68"
            onClick={() => setShowCreateOrg(false)}
            className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
            aria-label="Close"
          >
            <X data-eos-id="src/pages/admin/partners.tsx#69" size={20} />
          </button>
        </div>
        <div data-eos-id="src/pages/admin/partners.tsx#70" className="space-y-4">
          <Input data-eos-id="src/pages/admin/partners.tsx#71"
            label="Organisation Name"
            value={orgForm.name}
            onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <Dropdown data-eos-id="src/pages/admin/partners.tsx#72"
            options={orgTypeOptions}
            value={orgForm.type}
            onChange={(v) => setOrgForm((p) => ({ ...p, type: v }))}
            label="Type"
          />
          <Input data-eos-id="src/pages/admin/partners.tsx#73"
            label="Website"
            value={orgForm.website}
            onChange={(e) => setOrgForm((p) => ({ ...p, website: e.target.value }))}
            placeholder="https://..."
          />
          <div data-eos-id="src/pages/admin/partners.tsx#74" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input data-eos-id="src/pages/admin/partners.tsx#75"
              label="Contact Name"
              value={orgForm.contact_name}
              onChange={(e) =>
                setOrgForm((p) => ({ ...p, contact_name: e.target.value }))
              }
            />
            <Input data-eos-id="src/pages/admin/partners.tsx#76"
              label="Contact Email"
              type="email"
              value={orgForm.contact_email}
              onChange={(e) =>
                setOrgForm((p) => ({ ...p, contact_email: e.target.value }))
              }
            />
          </div>
          <Input data-eos-id="src/pages/admin/partners.tsx#77"
            type="textarea"
            label="Description"
            value={orgForm.description}
            onChange={(e) =>
              setOrgForm((p) => ({ ...p, description: e.target.value }))
            }
          />
          <Button data-eos-id="src/pages/admin/partners.tsx#78"
            variant="primary"
            fullWidth
            onClick={() => createOrgMutation.mutate(orgForm)}
            loading={createOrgMutation.isPending}
            disabled={!orgForm.name.trim()}
          >
            Add Organisation
          </Button>
        </div>
      </BottomSheet>

      {/* Create offer modal */}
      <BottomSheet data-eos-id="src/pages/admin/partners.tsx#79" open={showCreateOffer} onClose={() => setShowCreateOffer(false)}>
        {/* Header */}
        <div data-eos-id="src/pages/admin/partners.tsx#80" className="flex items-center justify-between mb-4">
          <h2 data-eos-id="src/pages/admin/partners.tsx#81" className="font-heading text-lg font-semibold text-neutral-900">Add Partner Offer</h2>
          <button data-eos-id="src/pages/admin/partners.tsx#82"
            onClick={() => setShowCreateOffer(false)}
            className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
            aria-label="Close"
          >
            <X data-eos-id="src/pages/admin/partners.tsx#83" size={20} />
          </button>
        </div>
        <div data-eos-id="src/pages/admin/partners.tsx#84" className="space-y-4">
          <Input data-eos-id="src/pages/admin/partners.tsx#85"
            label="Offer Title"
            value={offerForm.title}
            onChange={(e) =>
              setOfferForm((p) => ({ ...p, title: e.target.value }))
            }
            required
          />
          <Input data-eos-id="src/pages/admin/partners.tsx#86"
            type="textarea"
            label="Description"
            value={offerForm.description}
            onChange={(e) =>
              setOfferForm((p) => ({ ...p, description: e.target.value }))
            }
          />
          {organisations && organisations.length > 0 && (
            <Dropdown data-eos-id="src/pages/admin/partners.tsx#87"
              options={[
                { value: '', label: 'Select organisation...' },
                ...organisations.map((o) => ({ value: o.id, label: o.name })),
              ]}
              value={offerForm.organisation_id}
              onChange={(v) =>
                setOfferForm((p) => ({ ...p, organisation_id: v }))
              }
              label="Organisation"
            />
          )}
          <Input data-eos-id="src/pages/admin/partners.tsx#88"
            label="Category"
            value={offerForm.category}
            onChange={(e) =>
              setOfferForm((p) => ({ ...p, category: e.target.value }))
            }
            placeholder="e.g. Outdoor Gear, Food & Drink"
          />
          <Input data-eos-id="src/pages/admin/partners.tsx#89"
            type="textarea"
            label="Terms & Conditions"
            value={offerForm.terms}
            onChange={(e) =>
              setOfferForm((p) => ({ ...p, terms: e.target.value }))
            }
          />
          <Button data-eos-id="src/pages/admin/partners.tsx#90"
            variant="primary"
            fullWidth
            onClick={() => createOfferMutation.mutate(offerForm)}
            loading={createOfferMutation.isPending}
            disabled={!offerForm.title.trim()}
          >
            Add Offer
          </Button>
        </div>
      </BottomSheet>

      <ConfirmationSheet data-eos-id="src/pages/admin/partners.tsx#91"
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="Delete"
        description="This will permanently delete this item."
        confirmLabel="Delete"
        variant="danger"
      />
        </motion.div>
    </div>
  )
}
