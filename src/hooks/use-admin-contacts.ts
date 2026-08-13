import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase, escapeIlike } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { makeOptimistic, patchItem, removeItem, prependItem } from '@/lib/optimistic'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

type EmergencyContact = Tables<'emergency_contacts'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ContactCategory = 'emergency' | 'wildlife' | 'marine' | 'poison' | 'ses' | 'internal'

export interface ContactCategoryMeta {
  id: ContactCategory
  label: string
  color: string
  iconBg: string
}

export const CONTACT_CATEGORIES: ContactCategoryMeta[] = [
  { id: 'emergency', label: 'Emergency Services', color: 'text-red-600', iconBg: 'bg-red-100' },
  { id: 'wildlife', label: 'Wildlife Rescue', color: 'text-moss-600', iconBg: 'bg-moss-100' },
  { id: 'marine', label: 'Marine Wildlife', color: 'text-sky-600', iconBg: 'bg-sky-100' },
  { id: 'poison', label: 'Poisoning & Snakebite', color: 'text-amber-600', iconBg: 'bg-amber-100' },
  { id: 'ses', label: 'SES & National Parks', color: 'text-primary-600', iconBg: 'bg-primary-100' },
  { id: 'internal', label: 'Co-Exist Internal', color: 'text-plum-600', iconBg: 'bg-plum-100' },
]

export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const
export type AustralianState = (typeof AUSTRALIAN_STATES)[number]

/* ------------------------------------------------------------------ */
/*  Admin: full list (includes inactive)                               */
/* ------------------------------------------------------------------ */

export function useAdminContacts(filters: {
  search: string
  category: string
}) {
  return useQuery({
    queryKey: ['admin-contacts', filters],
    queryFn: async () => {
      let query = supabase
        .from('emergency_contacts')
        .select('*')
        .order('category')
        .order('sort_order')

      if (filters.category) {
        query = query.eq('category', filters.category)
      }

      if (filters.search) {
        const s = escapeIlike(filters.search)
        query = query.or(`name.ilike.%${s}%,note.ilike.%${s}%,phone.ilike.%${s}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as EmergencyContact[]
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: create                                                      */
/* ------------------------------------------------------------------ */

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TablesInsert<'emergency_contacts'>) => {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      await logAudit({ action: 'emergency_contact_created', target_id: data.id, details: { name: input.name } })
      return data
    },
    // Optimistic prepend to the admin list so the new contact shows the instant
    // the modal closes. The real row (with server id + canonical ordering)
    // replaces the temp on invalidate.
    onMutate: async (input) => {
      const opt = makeOptimistic<EmergencyContact[]>(qc, ['admin-contacts'])
      const temp = {
        ...input,
        id: `temp-${Date.now()}`,
        states: input.states ?? [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as EmergencyContact
      const ctxAdmin = await opt.patch(prependItem(temp))
      return { ctxAdmin }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) makeOptimistic<EmergencyContact[]>(qc, ['admin-contacts']).rollback(ctx.ctxAdmin)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-contacts'] })
      qc.invalidateQueries({ queryKey: ['emergency-contacts'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: update                                                      */
/* ------------------------------------------------------------------ */

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'emergency_contacts'> & { id: string }) => {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      await logAudit({ action: 'emergency_contact_updated', target_id: id, details: { name: updates.name } })
      return data
    },
    // Optimistic edit across both the admin list and the public list.
    onMutate: async ({ id, ...updates }) => {
      const optAdmin = makeOptimistic<EmergencyContact[]>(qc, ['admin-contacts'])
      const optPublic = makeOptimistic<EmergencyContact[]>(qc, ['emergency-contacts'])
      const patch = patchItem<EmergencyContact>(id, updates as Partial<EmergencyContact>)
      const [ctxAdmin, ctxPublic] = await Promise.all([optAdmin.patch(patch), optPublic.patch(patch)])
      return { ctxAdmin, ctxPublic }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        makeOptimistic<EmergencyContact[]>(qc, ['admin-contacts']).rollback(ctx.ctxAdmin)
        makeOptimistic<EmergencyContact[]>(qc, ['emergency-contacts']).rollback(ctx.ctxPublic)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-contacts'] })
      qc.invalidateQueries({ queryKey: ['emergency-contacts'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: delete                                                      */
/* ------------------------------------------------------------------ */

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', id)
      if (error) throw error
      await logAudit({ action: 'emergency_contact_deleted', target_id: id })
    },
    // Optimistic removal from both lists; rollback restores on failure.
    onMutate: async (id) => {
      const optAdmin = makeOptimistic<EmergencyContact[]>(qc, ['admin-contacts'])
      const optPublic = makeOptimistic<EmergencyContact[]>(qc, ['emergency-contacts'])
      const remove = removeItem<EmergencyContact>(id)
      const [ctxAdmin, ctxPublic] = await Promise.all([optAdmin.patch(remove), optPublic.patch(remove)])
      return { ctxAdmin, ctxPublic }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        makeOptimistic<EmergencyContact[]>(qc, ['admin-contacts']).rollback(ctx.ctxAdmin)
        makeOptimistic<EmergencyContact[]>(qc, ['emergency-contacts']).rollback(ctx.ctxPublic)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-contacts'] })
      qc.invalidateQueries({ queryKey: ['emergency-contacts'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Public: active contacts, optionally filtered by state              */
/* ------------------------------------------------------------------ */

export function useEmergencyContacts(eventState?: string | null) {
  return useQuery({
    queryKey: ['emergency-contacts', eventState ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('sort_order')
      if (error) throw error

      // Client-side state filter: include contacts where states is empty (all-states)
      // or where the event state is in the contact's states array
      if (eventState) {
        return (data as EmergencyContact[]).filter(
          (c) => c.states.length === 0 || c.states.includes(eventState),
        )
      }
      return data as EmergencyContact[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
