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
      <BottomSheet data-eos-id="src/pages/chat/chat-leader-panel.tsx#0" open={open} onClose={onClose}>
        <div data-eos-id="src/pages/chat/chat-leader-panel.tsx#1" className="pb-2">
          <div data-eos-id="src/pages/chat/chat-leader-panel.tsx#2" className="flex items-center gap-2.5 px-4 pb-3">
            <Users data-eos-id="src/pages/chat/chat-leader-panel.tsx#3" size={18} className="text-neutral-500" />
            <p data-eos-id="src/pages/chat/chat-leader-panel.tsx#4" className="text-sm font-bold text-neutral-800">Manage Members</p>
          </div>

          {removableMembers.length === 0 ? (
            <p data-eos-id="src/pages/chat/chat-leader-panel.tsx#5" className="px-4 py-4 text-sm text-neutral-500 text-center">No removable members</p>
          ) : (
            <div data-eos-id="src/pages/chat/chat-leader-panel.tsx#6" className="max-h-72 overflow-y-auto space-y-0.5">
              {removableMembers.map((m) => (
                <div data-eos-id="src/pages/chat/chat-leader-panel.tsx#7"
                  key={m.user_id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Avatar data-eos-id="src/pages/chat/chat-leader-panel.tsx#8"
                    src={m.profiles?.avatar_url}
                    name={m.profiles?.display_name}
                    size="sm"
                  />
                  <div data-eos-id="src/pages/chat/chat-leader-panel.tsx#9" className="flex-1 min-w-0">
                    <span data-eos-id="src/pages/chat/chat-leader-panel.tsx#10" data-eos-var="m.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-800 truncate block">
                      {m.profiles?.display_name ?? 'Member'}
                    </span>
                    {m.role !== 'participant' && (
                      <span data-eos-id="src/pages/chat/chat-leader-panel.tsx#11" data-eos-var="m.role" data-eos-var-label="Role" data-eos-var-scope="item" className="text-[11px] font-semibold text-neutral-500">
                        {formatRole(m.role!)}
                      </span>
                    )}
                  </div>
                  <button data-eos-id="src/pages/chat/chat-leader-panel.tsx#12"
                    type="button"
                    onClick={() => setConfirmRemove(m.user_id)}
                    className="flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold text-error-600 hover:bg-error-50 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11"
                  >
                    <UserMinus data-eos-id="src/pages/chat/chat-leader-panel.tsx#13" size={14} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmationSheet data-eos-id="src/pages/chat/chat-leader-panel.tsx#14"
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
      <CreatePollSheet data-eos-id="src/pages/chat/chat-leader-panel.tsx#15"
        open={showPollSheet}
        onClose={onClosePollSheet}
        onSubmit={onCreatePoll}
        loading={pollLoading}
      />

      {/* Announcement creation sheet */}
      <CreateAnnouncementSheet data-eos-id="src/pages/chat/chat-leader-panel.tsx#16"
        open={showAnnouncementSheet}
        onClose={onCloseAnnouncementSheet}
        onSubmit={onCreateAnnouncement}
        onInviteCollectives={isCollective ? onInviteCollectives : undefined}
        loading={announcementLoading}
        defaultType={announcementType}
        collectiveId={isCollective ? collectiveId : undefined}
      />

      {/* Broadcast notification sheet */}
      <BroadcastNotificationSheet data-eos-id="src/pages/chat/chat-leader-panel.tsx#17"
        open={showBroadcastSheet}
        onClose={onCloseBroadcastSheet}
        onSend={onBroadcast}
        loading={broadcastLoading}
        recentBroadcasts={broadcastLog}
        collectiveName={isCollective ? collectiveName ?? undefined : channelName ?? undefined}
      />

      {/* Member management sheet (collective only) */}
      {isCollective && isLeaderOrAbove && (
        <ManageMembersSheet data-eos-id="src/pages/chat/chat-leader-panel.tsx#18"
          open={showManageMembers}
          onClose={onCloseManageMembers}
          collectiveId={collectiveId}
        />
      )}
    </>
  )
}
