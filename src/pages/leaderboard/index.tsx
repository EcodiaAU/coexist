import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Trophy, TreePine, Calendar, Star, Users } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Avatar } from '@/components/avatar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { SegmentedControl, type Segment } from '@/components/segmented-control'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useMyCollectives } from '@/hooks/use-collective'
import {
  usePoints,
  useCollectiveMemberLeaderboard,
  useNationalCollectiveLeaderboard,
  type LeaderboardPeriod,
} from '@/hooks/use-points'

/* ------------------------------------------------------------------ */
/*  Shared bits                                                        */
/* ------------------------------------------------------------------ */

type Board = 'members' | 'collectives'

const BOARD_SEGMENTS: Segment<Board>[] = [
  { id: 'members', label: 'My Collective', icon: <Users size={15} /> },
  { id: 'collectives', label: 'Collectives', icon: <TreePine size={15} /> },
]

const PERIOD_SEGMENTS: Segment<LeaderboardPeriod>[] = [
  { id: 'all_time', label: 'All time' },
  { id: 'year', label: 'Year' },
  { id: 'month', label: 'Month' },
]

/** Rank badge: gold/silver/bronze for the top three, neutral otherwise. */
function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? 'bg-[#f2c14e] text-[#5a4a12]'
      : rank === 2
        ? 'bg-neutral-300 text-neutral-700'
        : rank === 3
          ? 'bg-[#cd8b5b] text-[#4a2f18]'
          : 'bg-neutral-100 text-neutral-500'
  return (
    <span
      className={cn(
        'flex items-center justify-center w-7 h-7 shrink-0 rounded-full text-xs font-bold tabular-nums',
        medal,
      )}
      aria-hidden="true"
    >
      {rank}
    </span>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-2 mt-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="list-item" />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Members board                                                      */
/* ------------------------------------------------------------------ */

function MembersBoard({ period }: { period: LeaderboardPeriod }) {
  const { user } = useAuth()
  const { data: myCollectives, isLoading: collectivesLoading } = useMyCollectives()
  const collectives = (myCollectives ?? [])
    .map((m) => m.collectives)
    .filter((c): c is NonNullable<typeof c> => Boolean(c))

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const activeCollectiveId = selectedId ?? collectives[0]?.id
  const { data: rows, isLoading } = useCollectiveMemberLeaderboard(
    activeCollectiveId,
    period,
  )

  if (collectivesLoading) return <BoardSkeleton />

  if (collectives.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          illustration="empty"
          title="Join a collective"
          description="Leaderboards rank members within a collective. Join one to see where you stand and start earning points together."
        />
      </div>
    )
  }

  return (
    <div className="mt-4">
      {collectives.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {collectives.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={cn(
                'shrink-0 snap-start min-h-9 px-3 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors duration-150',
                c.id === activeCollectiveId
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <BoardSkeleton />
      ) : !rows || rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            illustration="empty"
            title="No points yet"
            description="Nobody in this collective has earned points yet. Attend an event or check in to get on the board."
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((m, i) => {
            const isMe = m.user_id === user?.id
            return (
              <li
                key={m.user_id}
                className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2.5 shadow-sm',
                  isMe
                    ? 'bg-primary-50 border-primary-200'
                    : 'bg-white border-neutral-100',
                )}
              >
                <RankBadge rank={i + 1} />
                <Avatar src={m.avatar_url} name={m.display_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">
                    {m.display_name || 'Member'}
                    {isMe && (
                      <span className="ml-1.5 text-[11px] font-bold text-primary-600">
                        You
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-neutral-400">
                    <Calendar size={11} aria-hidden="true" />
                    {m.events_attended} events
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 text-primary-700">
                  <Star size={14} className="text-primary-500" aria-hidden="true" />
                  <span className="text-sm font-bold tabular-nums">
                    {m.total_points}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Collectives board                                                  */
/* ------------------------------------------------------------------ */

function CollectivesBoard({ period }: { period: LeaderboardPeriod }) {
  const { data: rows, isLoading } = useNationalCollectiveLeaderboard(period)

  if (isLoading) return <BoardSkeleton />

  if (!rows || rows.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          illustration="empty"
          title="No collectives yet"
          description="Completed events with logged impact will rank collectives here."
        />
      </div>
    )
  }

  return (
    <ul className="mt-4 space-y-2">
      {rows.map((c, i) => (
        <li
          key={c.collective_id}
          className="flex items-center gap-3 rounded-md border border-neutral-100 bg-white px-3 py-2.5 shadow-sm"
        >
          <RankBadge rank={i + 1} />
          <Avatar src={c.cover_image_url} name={c.collective_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-neutral-900">
              {c.collective_name || 'Collective'}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-neutral-400">
              <Calendar size={11} aria-hidden="true" />
              {c.total_events} events
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-primary-700">
            <TreePine size={14} className="text-primary-600" aria-hidden="true" />
            <span className="text-sm font-bold tabular-nums">
              {c.total_trees}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LeaderboardPage() {
  const rm = !!useReducedMotion()
  const [board, setBoard] = useState<Board>('members')
  const [period, setPeriod] = useState<LeaderboardPeriod>('all_time')
  const { data: myPoints } = usePoints()

  return (
    <Page header={<Header title="Leaderboard" back />}>
      <div className="py-4 space-y-4">
        {/* Your points */}
        <motion.div
          initial={rm ? undefined : { opacity: 0, y: 12 }}
          animate={rm ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center gap-3 rounded-md bg-primary-600 px-4 py-3.5 text-white shadow-sm"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/15">
            <Trophy size={20} />
          </div>
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-white/70">
              Your points
            </p>
            <p className="text-2xl font-heading font-bold tabular-nums leading-tight">
              {myPoints ?? 0}
            </p>
          </div>
          <Star size={22} className="text-white/80" aria-hidden="true" />
        </motion.div>

        <SegmentedControl
          segments={BOARD_SEGMENTS}
          value={board}
          onChange={setBoard}
          aria-label="Leaderboard type"
        />
        <SegmentedControl
          segments={PERIOD_SEGMENTS}
          value={period}
          onChange={setPeriod}
          variant="pill"
          aria-label="Time period"
        />

        {board === 'members' ? (
          <MembersBoard period={period} />
        ) : (
          <CollectivesBoard period={period} />
        )}
      </div>
    </Page>
  )
}
