import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
  Tag,
  MapPin,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { Button } from '@/components/button'
import { SearchBar } from '@/components/search-bar'
import { BottomSheet } from '@/components/bottom-sheet'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { type EmailTag, useSubscribers, useTags } from './shared'
import { TagPill } from './shared-ui'

function initialsOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function SubscriberAvatar({ url, name }: { url: string | null | undefined; name: string | null | undefined }) {
  const [failed, setFailed] = useState(false)
  const showImg = !!url && !failed
  return (
    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 shrink-0 overflow-hidden">
      {showImg ? (
        <img
          src={url ?? ''}
          alt=""
          loading="lazy"
          width={36}
          height={36}
          className="w-9 h-9 rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-primary-700 tabular-nums">
          {initialsOf(name)}
        </span>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Assign Tags Sheet                                                  */
/* ================================================================== */

function AssignTagsSheet({
  open,
  onClose,
  profileId,
  profileName,
  currentTags,
}: {
  open: boolean
  onClose: () => void
  profileId: string
  profileName: string
  currentTags: EmailTag[]
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: allTags } = useTags()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentTags.map((t) => t.id)),
  )
  const [saving, setSaving] = useState(false)

  const toggle = (tagId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)

    // Optimistic: update subscriber tags in cache immediately
    const prevSubscribers = queryClient.getQueryData(['admin-email-subscribers', '', null])
    const newTags = (allTags ?? []).filter((t) => selectedIds.has(t.id))
    queryClient.setQueryData(['admin-email-subscribers', '', null], (old: Array<Record<string, unknown>>) =>
      (old ?? []).map((sub) =>
        (sub as { id: string }).id === profileId ? { ...sub, tags: newTags } : sub,
      ),
    )
    onClose()

    try {
      // Must check the delete error - otherwise a failed delete combined with
      // a successful insert leaves the old tags in place AND adds the new
      // ones (duplicates), with no indication to the admin anything went wrong.
      const { error: delErr } = await supabase.from('profile_tags').delete().eq('profile_id', profileId)
      if (delErr) throw delErr

      if (selectedIds.size > 0) {
        const rows = Array.from(selectedIds).map((tag_id) => ({
          profile_id: profileId,
          tag_id,
        }))
        const { error } = await supabase.from('profile_tags').insert(rows)
        if (error) throw error
      }

      toast.success(`Tags updated for ${profileName}`)
    } catch (err: unknown) {
      // Rollback
      if (prevSubscribers) queryClient.setQueryData(['admin-email-subscribers', '', null], prevSubscribers)
      toast.error(err instanceof Error ? err.message : 'Failed to update tags')
    } finally {
      setSaving(false)
      queryClient.invalidateQueries({ queryKey: ['admin-email-subscribers'] })
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.5]}>
      <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-1">Manage Tags</h2>
      <p className="text-sm text-neutral-400 mb-4">{profileName}</p>
      <div className="flex flex-wrap gap-2 mb-6">
        {allTags?.map((tag) => (
          <button
            key={tag.id}
            onClick={() => toggle(tag.id)}
            className={cn(
              'inline-flex items-center rounded-full text-sm font-medium px-3.5 min-h-11 transition-colors duration-150 cursor-pointer',
              selectedIds.has(tag.id)
                ? 'ring-2 ring-offset-1 shadow-sm'
                : 'opacity-50 hover:opacity-100',
            )}
            style={{
              backgroundColor: `${tag.colour}20`,
              color: tag.colour,
            }}
          >
            {selectedIds.has(tag.id) && <CheckCircle2 size={12} className="mr-1" />}
            {tag.name}
          </button>
        )) ?? <p className="text-sm text-neutral-400">No tags available</p>}
      </div>
      <Button variant="primary" fullWidth loading={saving} onClick={handleSave}>
        Save Tags
      </Button>
    </BottomSheet>
  )
}

/* ================================================================== */
/*  Subscribers Tab                                                    */
/* ================================================================== */

export function SubscribersTab() {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: tags } = useTags()
  const { data: subscribers, isLoading } = useSubscribers(search, tagFilter)
  const showLoading = useDelayedLoading(isLoading)
  const [syncing, setSyncing] = useState(false)

  const [taggingProfile, setTaggingProfile] = useState<{
    id: string
    name: string
    tags: EmailTag[]
  } | null>(null)

  const handleSyncTags = async () => {
    setSyncing(true)
    try {
      const { error } = await supabase.rpc('sync_auto_tags')
      if (error) throw error
      toast.success('Auto-tags synced from interests, collectives, tiers, and activity')
      queryClient.invalidateQueries({ queryKey: ['admin-email-subscribers'] })
      queryClient.invalidateQueries({ queryKey: ['admin-email-tags'] })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to sync tags')
    } finally {
      setSyncing(false)
    }
  }

  const optedIn = useMemo(
    () => subscribers?.filter((s: Record<string, unknown>) => s.marketing_opt_in !== false) ?? [],
    [subscribers],
  )
  const optedOut = useMemo(
    () => subscribers?.filter((s: Record<string, unknown>) => s.marketing_opt_in === false) ?? [],
    [subscribers],
  )

  return (
    <>
      {/* Auto-sync bar */}
      <div className="flex items-center justify-between gap-3 mb-4 rounded-sm bg-white border border-neutral-100 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-neutral-700">Auto-tagging</p>
          <p className="text-[11px] text-neutral-400">
            Syncs tags from onboarding interests, collectives, tiers, attendance, and location
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSyncTags}
          loading={syncing}
          icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
        >
          Sync Now
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search subscribers..." compact className="flex-1" />
        {tags && tags.length > 0 && (
          <Dropdown
            options={[
              { value: '', label: 'All Tags' },
              ...tags.map((t) => ({ value: t.id, label: t.name })),
            ]}
            value={tagFilter ?? ''}
            onChange={(v) => setTagFilter(v || null)}
            placeholder="Filter by tag"
          />
        )}
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 rounded-sm bg-success-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-success-600">Opted In</p>
          <p className="text-lg font-bold text-success-700 tabular-nums">{optedIn.length}</p>
        </div>
        <div className="flex-1 rounded-sm bg-neutral-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Opted Out</p>
          <p className="text-lg font-bold text-neutral-600 tabular-nums">{optedOut.length}</p>
        </div>
      </div>

      {showLoading ? (
        <Skeleton variant="list-item" count={8} />
      ) : !subscribers?.length ? (
        <EmptyState
          illustration="empty"
          title="No subscribers found"
          description={search ? 'Try a different search term' : 'Users who sign up will appear here'}
        />
      ) : (
        <StaggeredList className="space-y-1">
          {subscribers.map((sub) => (
            <StaggeredItem key={sub.id} className="flex items-center gap-3 p-3 rounded-sm bg-white shadow-sm">
              <SubscriberAvatar url={sub.avatar_url} name={sub.display_name} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {sub.display_name || 'Anonymous'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {sub.location && (
                    <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
                      <MapPin size={9} />{sub.location}
                    </span>
                  )}
                  {sub.marketing_opt_in === false && (
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                      Opted out
                    </span>
                  )}
                </div>
                {sub.tags?.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {sub.tags.map((tag: EmailTag) => (
                      <TagPill key={tag.id} tag={tag} size="xs" />
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setTaggingProfile({
                  id: sub.id,
                  name: sub.display_name || 'User',
                  tags: sub.tags ?? [],
                })}
                className="flex items-center justify-center min-w-11 min-h-11 rounded-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors cursor-pointer shrink-0"
                aria-label="Manage tags"
              >
                <Tag size={14} />
              </button>
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      {taggingProfile && (
        <AssignTagsSheet
          open={!!taggingProfile}
          onClose={() => setTaggingProfile(null)}
          profileId={taggingProfile.id}
          profileName={taggingProfile.name}
          currentTags={taggingProfile.tags}
        />
      )}
    </>
  )
}
