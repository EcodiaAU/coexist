import { useState } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { XCircle, AlertTriangle } from 'lucide-react'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { cn } from '@/lib/cn'
import { useEmailBounces, useEmailComplaints, formatDate } from './shared'

export function DeliveryTab() {
  const [subTab, setSubTab] = useState<'bounces' | 'complaints'>('bounces')
  const { data: bounces, isLoading: bouncesLoading } = useEmailBounces()
  const showBouncesLoading = useDelayedLoading(bouncesLoading)
  const { data: complaints, isLoading: complaintsLoading } = useEmailComplaints()
  const showComplaintsLoading = useDelayedLoading(complaintsLoading)

  return (
    <>
      <div className="flex gap-1 bg-white rounded-sm p-1 mb-4">
        <button
          onClick={() => setSubTab('bounces')}
          className={cn(
            'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-sm transition-colors duration-150 cursor-pointer',
            subTab === 'bounces' ? 'bg-primary-50 shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
          )}
        >
          <XCircle size={14} /> Bounces
        </button>
        <button
          onClick={() => setSubTab('complaints')}
          className={cn(
            'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-sm transition-colors duration-150 cursor-pointer',
            subTab === 'complaints' ? 'bg-primary-50 shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
          )}
        >
          <AlertTriangle size={14} /> Complaints
        </button>
      </div>

      {subTab === 'bounces' && (
        <>
          {showBouncesLoading ? (
            <Skeleton variant="list-item" count={5} />
          ) : bouncesLoading ? null : !bounces?.length ? (
            <EmptyState illustration="empty" title="No bounces" description="Email bounces from Resend will appear here" />
          ) : (
            <StaggeredList className="space-y-1">
              {bounces.map((event) => (
                <StaggeredItem key={event.id} className="flex items-center gap-3 p-3 rounded-sm bg-white shadow-sm">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-error-100 shrink-0">
                    <XCircle size={16} className="text-error-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{event.email}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {event.reason ?? 'Hard bounce'} &middot; {formatDate(event.created_at ?? '')}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-error-100 text-error-700 shrink-0">Suppressed</span>
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </>
      )}

      {subTab === 'complaints' && (
        <>
          {showComplaintsLoading ? (
            <Skeleton variant="list-item" count={5} />
          ) : complaintsLoading ? null : !complaints?.length ? (
            <EmptyState illustration="empty" title="No complaints" description="Spam complaints from Resend will appear here" />
          ) : (
            <StaggeredList className="space-y-1">
              {complaints.map((event) => (
                <StaggeredItem key={event.id} className="flex items-center gap-3 p-3 rounded-sm bg-white shadow-sm">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-warning-100 shrink-0">
                    <AlertTriangle size={16} className="text-warning-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{event.email}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">Spam complaint &middot; {formatDate(event.created_at ?? '')}</p>
                  </div>
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-warning-100 text-warning-700 shrink-0">Suppressed</span>
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </>
      )}
    </>
  )
}
