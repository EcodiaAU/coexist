import { useState } from 'react'
import { Users, UserMinus, X } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { formatRole } from '@/lib/labels-and-enums'
import { useToast } from '@/components/toast'
import { CreatePollSheet } from '@/components/create-poll-sheet'
import { CreateAnnouncementSheet } from '@/components/create-announcement-sheet'
import { BroadcastNotificationSheet } from '@/components/broadcast-notification-sheet'
import { useAuth } from '@/hooks/use-auth'
import { useCollectiveMembers, useRemoveMember } from '@/hooks/use-collective'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import type { Json } from '@/types/database.types'
import type { BroadcastLogEntry } from '@/hooks/use-chat'

/* ------------------------------------------------------------------ */
/*  Member management sheet (collective mode only)                     */
/* ------------------------------------------------------------------ */

import { COLLECTIVE_ROLE_RANK as MANAGE_ROLE_RANK } from '@/lib/constants'

function ManageMembersSheet({
  open,
  onClose,
  collectiveId,
}: {
  open: boolean
  onClose: () => void
  collectiveId: string | undefined
}) {
  const { user, isStaff, isAdmin, isSuperAdmin } = useAuth()
  const { data: members = [] } = useCollectiveMembers(open ? collectiveId : undefined)
  const { role: myCollectiveRole } = useCollectiveRole(collectiveId)
  const removeMember = useRemoveMember()
  const { toast } = useToast()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const handleRemove = async (userId: string) => {
    if (!collectiveId) return
    try {
      await removeMember.mutateAsync({ collectiveId, userId })
      toast.success('Member removed from chat')
    } catch {
      toast.error('Failed to remove member')
    }
    setConfirmRemove(null)
  }

  const isGlobalStaff = isStaff || isAdmin || isSuperAdmin
  const myRank = isGlobalStaff ? 99 : (myCollectiveRole ? MANAGE_ROLE_RANK[myCollectiveRole] ?? -1 : -1)

  const removableMembers = members.filter(
    (m) => m.user_id !== user?.id && (MANAGE_ROLE_RANK[m.role!] ?? 0) < myRank,
  )

  return (
    <>
      <BottomSheet open={open} onClose={onClose}>
        <div className="pb-2">
          <div className="flex items-center gap-2.5 px-4 pb-3">
            <Users size={18} className="text-neutral-500" />
            <p className="text-sm font-bold text-neutral-800">Manage Members</p>
          </div>

          {removableMembers.length === 0 ? (
            <p className="px-4 py-4 text-sm text-neutral-500 text-center">No removable members</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {removableMembers.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Avatar
                    src={m.profiles?.avatar_url}
                    name={m.profiles?.display_name}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-neutral-800 truncate block">
                      {m.profiles?.display_name ?? 'Member'}
                    </span>
                    {m.role !== 'participant' && (
                      <span className="text-[11px] font-semibold text-neutral-500">
                        {formatRole(m.role!)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(m.user_id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11"
                  >
                    <UserMinus size={14} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmationSheet
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && handleRemove(confirmRemove)}
        title="Remove this member?"
        description="They will be removed from this collective's chat and will need to rejoin the collective to access it again."
        confirmLabel="Remove Member"
        variant="danger"
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ChatLeaderPanelProps {
  /** Whether we're in collective mode */
  isCollective: boolean
  /** Whether the user has leader-or-above permissions */
  isLeaderOrAbove: boolean
  /** Collective ID (for collective mode) */
  collectiveId?: string
  /** Channel ID (for channel mode) */
  channelId?: string
  /** Channel's collective_id (for channel mode) */
  channelCollectiveId?: string | null
  /** Collective name (for broadcast display) */
  collectiveName?: string | null
  /** Channel name (for broadcast display) */
  channelName?: string

  /** Poll sheet state */
  showPollSheet: boolean
  onClosePollSheet: () => void
  onCreatePoll: (data: {
    question: string
    options: string[]
    allowMultiple: boolean
    anonymous: boolean
  }) => void
  pollLoading: boolean

  /** Announcement sheet state */
  showAnnouncementSheet: boolean
  onCloseAnnouncementSheet: () => void
  onCreateAnnouncement: (data: {
    type: 'announcement' | 'event_invite' | 'rsvp'
    title: string
    body?: string
    metadata?: Record<string, unknown>
  }) => void
  onInviteCollectives?: (data: {
    eventId: string
    collectiveIds: string[]
    message?: string
  }) => void
  announcementLoading: boolean
  announcementType: 'announcement' | 'event_invite' | 'rsvp'

  /** Broadcast sheet state */
  showBroadcastSheet: boolean
  onCloseBroadcastSheet: () => void
  onBroadcast: (data: { title: string; body: string }) => void
  broadcastLoading: boolean
  broadcastLog: BroadcastLogEntry[]

  /** Manage members sheet state */
  showManageMembers: boolean
  onCloseManageMembers: () => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ChatLeaderPanel({
  isCollective,
  isLeaderOrAbove,
  collectiveId,
  collectiveName,
  channelName,

  showPollSheet,
  onClosePollSheet,
  onCreatePoll,
  pollLoading,

  showAnnouncementSheet,
  onCloseAnnouncementSheet,
  onCreateAnnouncement,
  onInviteCollectives,
  announcementLoading,
  announcementType,

  showBroadcastSheet,
  onCloseBroadcastSheet,
  onBroadcast,
  broadcastLoading,
  broadcastLog,

  showManageMembers,
  onCloseManageMembers,
}: ChatLeaderPanelProps) {
  return (
    <>
      {/* Poll creation sheet */}
      <CreatePollSheet
        open={showPollSheet}
        onClose={onClosePollSheet}
        onSubmit={onCreatePoll}
        loading={pollLoading}
      />

      {/* Announcement creation sheet */}
      <CreateAnnouncementSheet
        open={showAnnouncementSheet}
        onClose={onCloseAnnouncementSheet}
        onSubmit={onCreateAnnouncement}
        onInviteCollectives={isCollective ? onInviteCollectives : undefined}
        loading={announcementLoading}
        defaultType={announcementType}
        collectiveId={isCollective ? collectiveId : undefined}
      />

      {/* Broadcast notification sheet */}
      <BroadcastNotificationSheet
        open={showBroadcastSheet}
        onClose={onCloseBroadcastSheet}
        onSend={onBroadcast}
        loading={broadcastLoading}
        recentBroadcasts={broadcastLog}
        collectiveName={isCollective ? collectiveName ?? undefined : channelName ?? undefined}
      />

      {/* Member management sheet (collective only) */}
      {isCollective && isLeaderOrAbove && (
        <ManageMembersSheet
          open={showManageMembers}
          onClose={onCloseManageMembers}
          collectiveId={collectiveId}
        />
      )}
    </>
  )
}
