import { useState } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Tag, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.55]}>
      <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-4">Create Tag</h2>
      <div className="space-y-4">
        <Input
          label="Tag Name"
          placeholder="e.g. VIP, Active, Byron Bay"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-2">Colour</label>
          <div className="flex flex-wrap gap-2">
            {presetColours.map((c) => (
              <button
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
        <Input
          label="Description (optional)"
          placeholder="What this tag is used for"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button variant="primary" fullWidth loading={saving} onClick={handleCreate} icon={<Tag size={14} />}>
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
      <div className="flex items-center gap-2 mb-4">
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
          New Tag
        </Button>
      </div>

      {showLoading ? (
        <Skeleton variant="list-item" count={4} />
      ) : !tags?.length ? (
        <EmptyState
          illustration="empty"
          title="No tags"
          description="Create tags to organise and segment your subscribers for targeted campaigns"
          action={{ label: 'Create Tag', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <StaggeredList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <StaggeredItem key={tag.id} className="bg-white rounded-xl shadow-sm p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.colour }} />
                  <p className="text-sm font-semibold text-neutral-900">{tag.name}</p>
                </div>
                {tag.description && <p className="text-xs text-neutral-400 mt-0.5">{tag.description}</p>}
                <p className="text-[11px] text-neutral-400 mt-1.5">Created {formatDate(tag.created_at)}</p>
              </div>
              <button
                onClick={() => setDeletingId(tag.id)}
                className="flex items-center justify-center min-w-11 min-h-11 rounded-lg text-neutral-400 hover:bg-error-100 hover:text-error-600 transition-colors cursor-pointer shrink-0"
                aria-label="Delete tag"
              >
                <Trash2 size={14} />
              </button>
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      <TagManagerSheet open={showCreate} onClose={() => setShowCreate(false)} />

      <ConfirmationSheet
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
