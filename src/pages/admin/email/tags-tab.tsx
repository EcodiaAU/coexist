import { useState } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Tag, Plus, Trash2, GitMerge, Loader2, ArrowRight } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { type EmailTag, useTags, formatDate } from './shared'

/* ================================================================== */
/*  Merge Duplicates Sheet                                             */
/* ================================================================== */

interface DedupGroup {
  canon: string
  tag_ids: string[]
  tag_names: string[]
}

function MergeDuplicatesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [mergingCanon, setMergingCanon] = useState<string | null>(null)

  // Server surfaces near-duplicate tag groups (case/whitespace folded,
  // trailing "collective" stripped). Only fetched while the sheet is open.
  const { data: groups, isLoading, refetch } = useQuery({
    queryKey: ['admin-email-tag-dedup'],
    enabled: open,
    queryFn: async (): Promise<DedupGroup[]> => {
      const { data, error } = await supabase.rpc('email_tag_dedup_candidates')
      if (error) throw error
      return (data ?? []) as DedupGroup[]
    },
  })

  // Merge a group into its first tag (the canonical keeper). Every other
  // tag in the group is folded in via merge_email_tags, which moves the
  // profile assignments then deletes the deprecated tag.
  async function mergeGroup(group: DedupGroup) {
    if (group.tag_ids.length < 2) return
    setMergingCanon(group.canon)
    const [canonicalId, ...rest] = group.tag_ids
    try {
      for (const deprecatedId of rest) {
        const { error } = await supabase.rpc('merge_email_tags', {
          p_canonical_id: canonicalId,
          p_deprecated_id: deprecatedId,
        })
        if (error) throw error
      }
      toast.success(`Merged ${group.tag_names.length} tags into "${group.tag_names[0]}"`)
      await refetch()
      queryClient.invalidateQueries({ queryKey: ['admin-email-tags'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-subscribers'] })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setMergingCanon(null)
    }
  }

  return (
    <BottomSheet data-eos-id="src/pages/admin/email/tags-tab.tsx#0" data-eos-v="2" open={open} onClose={onClose} snapPoints={[0.7]}>
      <h2 data-eos-id="src/pages/admin/email/tags-tab.tsx#1" className="font-heading text-lg font-semibold text-neutral-900 mb-1">Merge duplicate tags</h2>
      <p data-eos-id="src/pages/admin/email/tags-tab.tsx#2" className="text-xs text-neutral-500 mb-4">
        We group tags that look like the same thing (e.g. "Brisbane" and "Brisbane Collective").
        Merging keeps the first name and moves every subscriber onto it.
      </p>

      {isLoading ? (
        <Skeleton data-eos-id="src/pages/admin/email/tags-tab.tsx#3" variant="list-item" count={3} />
      ) : !groups?.length ? (
        <div data-eos-id="src/pages/admin/email/tags-tab.tsx#4" className="py-10 text-center">
          <div data-eos-id="src/pages/admin/email/tags-tab.tsx#5" className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600 mx-auto mb-3">
            <GitMerge data-eos-id="src/pages/admin/email/tags-tab.tsx#6" size={20} />
          </div>
          <p data-eos-id="src/pages/admin/email/tags-tab.tsx#7" className="text-sm font-semibold text-neutral-900">No duplicates found</p>
          <p data-eos-id="src/pages/admin/email/tags-tab.tsx#8" className="text-xs text-neutral-500 mt-1">Every tag is unique. Nothing to merge.</p>
        </div>
      ) : (
        <div data-eos-id="src/pages/admin/email/tags-tab.tsx#9" className="space-y-3 max-h-[55vh] overflow-y-auto">
          {groups.map((g) => (
            <div data-eos-id="src/pages/admin/email/tags-tab.tsx#10" key={g.canon} className="rounded-sm border border-neutral-200 bg-white p-3.5">
              <div data-eos-id="src/pages/admin/email/tags-tab.tsx#11" className="flex items-center gap-2 flex-wrap mb-2.5">
                {g.tag_names.map((n, i) => (
                  <span data-eos-id="src/pages/admin/email/tags-tab.tsx#12" key={n} className="inline-flex items-center gap-1.5 text-xs">
                    <span data-eos-id="src/pages/admin/email/tags-tab.tsx#13"
                      className={cn(
                        'px-2 py-0.5 rounded-full font-medium',
                        i === 0
                          ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
                          : 'bg-neutral-100 text-neutral-500 line-through',
                      )}
                    >
                      {n}
                    </span>
                    {i === 0 && g.tag_names.length > 1 && (
                      <span data-eos-id="src/pages/admin/email/tags-tab.tsx#14" className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider">keep</span>
                    )}
                  </span>
                ))}
              </div>
              <Button data-eos-id="src/pages/admin/email/tags-tab.tsx#15"
                variant="secondary"
                size="sm"
                icon={mergingCanon === g.canon ? <Loader2 data-eos-id="src/pages/admin/email/tags-tab.tsx#16" size={13} className="animate-spin" /> : <ArrowRight data-eos-id="src/pages/admin/email/tags-tab.tsx#17" size={13} />}
                loading={mergingCanon === g.canon}
                onClick={() => mergeGroup(g)}
              >
                Merge into "{g.tag_names[0]}"
              </Button>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

/* ================================================================== */
/*  Tag Manager Sheet                                                  */
/* ================================================================== */

function TagManagerSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [colour, setColour] = useState('#10B981')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const presetColours = [
    '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  ]

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Tag name is required')
      return
    }
    setSaving(true)

    // Optimistic: add tag immediately
    const tempId = crypto.randomUUID()
    const optimisticTag: EmailTag = {
      id: tempId,
      name: name.trim(),
      colour,
      description: description.trim() || null,
      created_at: new Date().toISOString(),
    }
    queryClient.setQueryData<EmailTag[]>(['admin-email-tags'], (old) =>
      [...(old ?? []), optimisticTag].sort((a, b) => a.name.localeCompare(b.name)),
    )
    const savedName = name
    setName('')
    setDescription('')
    onClose()

    try {
      const { error } = await supabase
        .from('email_tags')
        .insert({
          name: savedName.trim(),
          colour,
          description: optimisticTag.description,
        })
      if (error) throw error
      toast.success(`Tag "${savedName}" created`)
    } catch (err: unknown) {
      // Rollback
      queryClient.setQueryData<EmailTag[]>(['admin-email-tags'], (old) =>
        (old ?? []).filter((t) => t.id !== tempId),
      )
      toast.error(err instanceof Error ? err.message : 'Failed to create tag')
    } finally {
      setSaving(false)
      queryClient.invalidateQueries({ queryKey: ['admin-email-tags'] })
    }
  }

  return (
    <BottomSheet data-eos-id="src/pages/admin/email/tags-tab.tsx#18" open={open} onClose={onClose} snapPoints={[0.55]}>
      <h2 data-eos-id="src/pages/admin/email/tags-tab.tsx#19" className="font-heading text-lg font-semibold text-neutral-900 mb-4">Create Tag</h2>
      <div data-eos-id="src/pages/admin/email/tags-tab.tsx#20" className="space-y-4">
        <Input data-eos-id="src/pages/admin/email/tags-tab.tsx#21"
          label="Tag Name"
          placeholder="e.g. VIP, Active, Byron Bay"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div data-eos-id="src/pages/admin/email/tags-tab.tsx#22">
          <label data-eos-id="src/pages/admin/email/tags-tab.tsx#23" className="block text-xs font-medium text-neutral-400 mb-2">Colour</label>
          <div data-eos-id="src/pages/admin/email/tags-tab.tsx#24" className="flex flex-wrap gap-2">
            {presetColours.map((c) => (
              <button data-eos-id="src/pages/admin/email/tags-tab.tsx#25"
                key={c}
                onClick={() => setColour(c)}
                className={cn(
                  'w-8 h-8 rounded-full transition-colors duration-150 cursor-pointer',
                  colour === c ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105',
                )}
                style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </div>
        <Input data-eos-id="src/pages/admin/email/tags-tab.tsx#26"
          label="Description (optional)"
          placeholder="What this tag is used for"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button data-eos-id="src/pages/admin/email/tags-tab.tsx#27" variant="primary" fullWidth loading={saving} onClick={handleCreate} icon={<Tag data-eos-id="src/pages/admin/email/tags-tab.tsx#28" size={14} />}>
          Create Tag
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ================================================================== */
/*  Tags Tab                                                           */
/* ================================================================== */

export function TagsTab() {
  const { data: tags, isLoading } = useTags()
  const showLoading = useDelayedLoading(isLoading)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('profile_tags').delete().eq('tag_id', id)
      const { error } = await supabase.from('email_tags').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin-email-tags'] })
      const prev = queryClient.getQueryData<EmailTag[]>(['admin-email-tags'])
      queryClient.setQueryData<EmailTag[]>(['admin-email-tags'], (old) =>
        (old ?? []).filter((t) => t.id !== id),
      )
      setDeletingId(null)
      return { prev }
    },
    onSuccess: () => toast.success('Tag deleted'),
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin-email-tags'], ctx.prev)
      toast.error('Failed to delete tag')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-email-tags'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-subscribers'] })
    },
  })

  return (
    <>
      <div data-eos-id="src/pages/admin/email/tags-tab.tsx#29" className="flex items-center gap-2 mb-4">
        <Button data-eos-id="src/pages/admin/email/tags-tab.tsx#30" variant="primary" size="sm" icon={<Plus data-eos-id="src/pages/admin/email/tags-tab.tsx#31" size={14} />} onClick={() => setShowCreate(true)}>
          New Tag
        </Button>
        <Button data-eos-id="src/pages/admin/email/tags-tab.tsx#32" variant="secondary" size="sm" icon={<GitMerge data-eos-id="src/pages/admin/email/tags-tab.tsx#33" size={14} />} onClick={() => setShowMerge(true)}>
          Merge duplicates
        </Button>
      </div>

      {showLoading ? (
        <Skeleton data-eos-id="src/pages/admin/email/tags-tab.tsx#34" variant="list-item" count={4} />
      ) : !tags?.length ? (
        <EmptyState data-eos-id="src/pages/admin/email/tags-tab.tsx#35"
          illustration="empty"
          title="No tags"
          description="Create tags to organise and segment your subscribers for targeted campaigns"
          action={{ label: 'Create Tag', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <StaggeredList data-eos-id="src/pages/admin/email/tags-tab.tsx#36" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <StaggeredItem data-eos-id="src/pages/admin/email/tags-tab.tsx#37" key={tag.id} className="bg-white rounded-sm shadow-sm p-4 flex items-start justify-between gap-3">
              <div data-eos-id="src/pages/admin/email/tags-tab.tsx#38" className="flex-1 min-w-0">
                <div data-eos-id="src/pages/admin/email/tags-tab.tsx#39" className="flex items-center gap-2 mb-1">
                  <span data-eos-id="src/pages/admin/email/tags-tab.tsx#40" className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.colour }} />
                  <p data-eos-id="src/pages/admin/email/tags-tab.tsx#41" data-eos-var="tag.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900">{tag.name}</p>
                </div>
                {tag.description && <p data-eos-id="src/pages/admin/email/tags-tab.tsx#42" data-eos-var="tag.description" data-eos-var-label="Description" data-eos-var-scope="item" className="text-xs text-neutral-400 mt-0.5">{tag.description}</p>}
                <p data-eos-id="src/pages/admin/email/tags-tab.tsx#43" data-eos-var="tag.created_at" data-eos-var-label="Created at" data-eos-var-scope="item" className="text-[11px] text-neutral-400 mt-1.5">Created {formatDate(tag.created_at)}</p>
              </div>
              <button data-eos-id="src/pages/admin/email/tags-tab.tsx#44"
                onClick={() => setDeletingId(tag.id)}
                className="flex items-center justify-center min-w-11 min-h-11 rounded-sm text-neutral-400 hover:bg-error-100 hover:text-error-600 transition-colors cursor-pointer shrink-0"
                aria-label="Delete tag"
              >
                <Trash2 data-eos-id="src/pages/admin/email/tags-tab.tsx#45" size={14} />
              </button>
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      <TagManagerSheet data-eos-id="src/pages/admin/email/tags-tab.tsx#46" open={showCreate} onClose={() => setShowCreate(false)} />
      <MergeDuplicatesSheet data-eos-id="src/pages/admin/email/tags-tab.tsx#47" open={showMerge} onClose={() => setShowMerge(false)} />

      <ConfirmationSheet data-eos-id="src/pages/admin/email/tags-tab.tsx#48"
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        title="Delete Tag"
        description="This tag will be removed from all subscribers. Existing campaigns won't be affected."
        confirmLabel="Delete"
      />
    </>
  )
}
