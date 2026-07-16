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
      <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#0" className="flex gap-1 bg-white rounded-sm p-1 mb-4">
        <button data-eos-id="src/pages/admin/email/delivery-tab.tsx#1"
          onClick={() => setSubTab('bounces')}
          className={cn(
            'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-sm transition-colors duration-150 cursor-pointer',
            subTab === 'bounces' ? 'bg-primary-50 shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
          )}
        >
          <XCircle data-eos-id="src/pages/admin/email/delivery-tab.tsx#2" size={14} /> Bounces
        </button>
        <button data-eos-id="src/pages/admin/email/delivery-tab.tsx#3"
          onClick={() => setSubTab('complaints')}
          className={cn(
            'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-sm transition-colors duration-150 cursor-pointer',
            subTab === 'complaints' ? 'bg-primary-50 shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
          )}
        >
          <AlertTriangle data-eos-id="src/pages/admin/email/delivery-tab.tsx#4" size={14} /> Complaints
        </button>
      </div>

      {subTab === 'bounces' && (
        <>
          {showBouncesLoading ? (
            <Skeleton data-eos-id="src/pages/admin/email/delivery-tab.tsx#5" variant="list-item" count={5} />
          ) : bouncesLoading ? null : !bounces?.length ? (
            <EmptyState data-eos-id="src/pages/admin/email/delivery-tab.tsx#6" illustration="empty" title="No bounces" description="Email bounces from Resend will appear here" />
          ) : (
            <StaggeredList data-eos-id="src/pages/admin/email/delivery-tab.tsx#7" className="space-y-1">
              {bounces.map((event) => (
                <StaggeredItem data-eos-id="src/pages/admin/email/delivery-tab.tsx#8" key={event.id} className="flex items-center gap-3 p-3 rounded-sm bg-white shadow-sm">
                  <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#9" className="flex items-center justify-center w-8 h-8 rounded-full bg-error-100 shrink-0">
                    <XCircle data-eos-id="src/pages/admin/email/delivery-tab.tsx#10" size={16} className="text-error-500" />
                  </div>
                  <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#11" className="flex-1 min-w-0">
                    <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#12" data-eos-var="event.email" data-eos-var-label="Email" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 truncate">{event.email}</p>
                    <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#13" data-eos-var="event.reason,event.created_at" data-eos-var-label="Reason, Created at" data-eos-var-scope="item" className="text-xs text-neutral-400 mt-0.5">
                      {event.reason ?? 'Hard bounce'} &middot; {formatDate(event.created_at ?? '')}
                    </p>
                  </div>
                  <span data-eos-id="src/pages/admin/email/delivery-tab.tsx#14" className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-error-100 text-error-700 shrink-0">Suppressed</span>
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </>
      )}

      {subTab === 'complaints' && (
        <>
          {showComplaintsLoading ? (
            <Skeleton data-eos-id="src/pages/admin/email/delivery-tab.tsx#15" variant="list-item" count={5} />
          ) : complaintsLoading ? null : !complaints?.length ? (
            <EmptyState data-eos-id="src/pages/admin/email/delivery-tab.tsx#16" illustration="empty" title="No complaints" description="Spam complaints from Resend will appear here" />
          ) : (
            <StaggeredList data-eos-id="src/pages/admin/email/delivery-tab.tsx#17" className="space-y-1">
              {complaints.map((event) => (
                <StaggeredItem data-eos-id="src/pages/admin/email/delivery-tab.tsx#18" key={event.id} className="flex items-center gap-3 p-3 rounded-sm bg-white shadow-sm">
                  <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#19" className="flex items-center justify-center w-8 h-8 rounded-full bg-warning-100 shrink-0">
                    <AlertTriangle data-eos-id="src/pages/admin/email/delivery-tab.tsx#20" size={16} className="text-warning-500" />
                  </div>
                  <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#21" className="flex-1 min-w-0">
                    <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#22" data-eos-var="event.email" data-eos-var-label="Email" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 truncate">{event.email}</p>
                    <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#23" data-eos-var="event.created_at" data-eos-var-label="Created at" data-eos-var-scope="item" className="text-xs text-neutral-400 mt-0.5">Spam complaint &middot; {formatDate(event.created_at ?? '')}</p>
                  </div>
                  <span data-eos-id="src/pages/admin/email/delivery-tab.tsx#24" className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-warning-100 text-warning-700 shrink-0">Suppressed</span>
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </>
      )}
    </>
  )
}
