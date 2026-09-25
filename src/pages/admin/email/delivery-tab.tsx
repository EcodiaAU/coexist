import { useState } from 'react'
import { XCircle, AlertTriangle, UserX, MailX } from 'lucide-react'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { cn } from '@/lib/cn'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
  useEmailBounces,
  useEmailComplaints,
  useUnreachableMembers,
  unreachableReasonLabel,
  formatDate,
  type UnreachableReason,
} from './shared'

type SubTab = 'unreachable' | 'bounces' | 'complaints'

/** Red for "mail is blocked", amber for "the address itself looks wrong". */
const reasonTone: Record<UnreachableReason, string> = {
  bounced: 'bg-error-100 text-error-700',
  complained: 'bg-error-100 text-error-700',
  suppressed: 'bg-error-100 text-error-700',
  no_address: 'bg-warning-100 text-warning-700',
  no_tld: 'bg-warning-100 text-warning-700',
  malformed: 'bg-warning-100 text-warning-700',
  typo_domain: 'bg-warning-100 text-warning-700',
}

function subTabClass(active: boolean) {
  return cn(
    'flex-1 min-h-11 flex items-center justify-center gap-1.5 text-sm font-medium rounded-sm transition-colors duration-150 cursor-pointer',
    active ? 'bg-primary-50 shadow-sm text-neutral-900' : 'text-neutral-400 hover:text-neutral-600',
  )
}

export function DeliveryTab() {
  const [subTab, setSubTab] = useState<SubTab>('unreachable')
  const { data: bounces, isLoading: bouncesLoading } = useEmailBounces()
  const { data: complaints, isLoading: complaintsLoading } = useEmailComplaints()
  const { data: unreachable, isLoading: unreachableLoading, error: unreachableError } = useUnreachableMembers()
  // White until the 1s delay, then the skeleton; never flash a shell on a fast load.
  const showBouncesLoading = useDelayedLoading(bouncesLoading)
  const showComplaintsLoading = useDelayedLoading(complaintsLoading)
  const showUnreachableLoading = useDelayedLoading(unreachableLoading)

  return (
    <>
      <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#0" data-eos-v="2" className="flex gap-1 bg-white rounded-sm p-1 mb-4">
        <button data-eos-id="src/pages/admin/email/delivery-tab.tsx#25"
          onClick={() => setSubTab('unreachable')}
          className={subTabClass(subTab === 'unreachable')}
        >
          <UserX data-eos-id="src/pages/admin/email/delivery-tab.tsx#26" size={14} /> Unreachable
        </button>
        <button data-eos-id="src/pages/admin/email/delivery-tab.tsx#1"
          onClick={() => setSubTab('bounces')}
          className={subTabClass(subTab === 'bounces')}
        >
          <XCircle data-eos-id="src/pages/admin/email/delivery-tab.tsx#2" size={14} /> Bounces
        </button>
        <button data-eos-id="src/pages/admin/email/delivery-tab.tsx#3"
          onClick={() => setSubTab('complaints')}
          className={subTabClass(subTab === 'complaints')}
        >
          <AlertTriangle data-eos-id="src/pages/admin/email/delivery-tab.tsx#4" size={14} /> Complaints
        </button>
      </div>

      {subTab === 'unreachable' && (
        <>
          {unreachableLoading ? (
            showUnreachableLoading ? <Skeleton data-eos-id="src/pages/admin/email/delivery-tab.tsx#27" variant="list-item" count={5} /> : null
          ) : unreachableError ? (
            <EmptyState data-eos-id="src/pages/admin/email/delivery-tab.tsx#28" illustration="error" title="Couldn't load this list" description="Try again in a minute. If it keeps failing, let Ecodia know." />
          ) : !unreachable?.length ? (
            <EmptyState data-eos-id="src/pages/admin/email/delivery-tab.tsx#29" illustration="empty" title="Everyone can get email" description="Members whose address is wrong or blocked will appear here" />
          ) : (
            <>
              <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#30" className="p-3 mb-3 rounded-sm bg-white shadow-sm">
                <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#31" data-eos-var="unreachable.length" data-eos-var-label="Count" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900">
                  {unreachable.length} {unreachable.length === 1 ? 'member gets' : 'members get'} no Co-Exist email
                </p>
                <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#32" className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Their address is wrong or blocked, so invites, tickets and reminders never reach them. Ask them for the right address (their collective leader can check at the next event) and send it to Ecodia to update. They can't change it in the app themselves, because the app asks them to confirm from the old address first. A suggested address is only a guess, so check it with the member before anything changes.
                </p>
              </div>
              <StaggeredList data-eos-id="src/pages/admin/email/delivery-tab.tsx#33" className="space-y-1">
                {unreachable.map((member) => (
                  <StaggeredItem data-eos-id="src/pages/admin/email/delivery-tab.tsx#34" key={member.user_id} className="flex items-start gap-3 p-3 rounded-sm bg-white shadow-sm">
                    <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#35" className="flex items-center justify-center w-8 h-8 rounded-full bg-warning-100 shrink-0">
                      <MailX data-eos-id="src/pages/admin/email/delivery-tab.tsx#36" size={16} className="text-warning-500" />
                    </div>
                    <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#37" className="flex-1 min-w-0">
                      <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#38" data-eos-var="member.display_name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 truncate">
                        {member.display_name?.trim() || 'Unnamed member'}
                      </p>
                      <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#39" data-eos-var="member.collectives" data-eos-var-label="Collectives" data-eos-var-scope="item" className="text-xs text-neutral-500 mt-0.5">
                        {member.collectives.length ? member.collectives.join(', ') : 'Not active in a collective'}
                        {' '}&middot; joined {formatDate(member.member_since)}
                      </p>
                      <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#40" data-eos-var="member.judged_email" data-eos-var-label="Email" data-eos-var-scope="item" className="text-sm text-neutral-800 mt-1 break-all">
                        {member.judged_email ?? 'No email on the account'}
                      </p>
                      {member.suggested_email && (
                        <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#41" data-eos-var="member.suggested_email" data-eos-var-label="Suggested email" data-eos-var-scope="item" className="text-xs text-primary-700 mt-0.5 break-all">
                          Probably meant <span data-eos-id="src/pages/admin/email/delivery-tab.tsx#42" className="font-semibold">{member.suggested_email}</span>
                        </p>
                      )}
                      <div data-eos-id="src/pages/admin/email/delivery-tab.tsx#43" className="flex flex-wrap items-center gap-1 mt-1.5">
                        {member.reasons.map((reason) => (
                          <span data-eos-id="src/pages/admin/email/delivery-tab.tsx#44" key={reason} className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-full', reasonTone[reason] ?? 'bg-neutral-100 text-neutral-600')}>
                            {unreachableReasonLabel[reason] ?? reason}
                          </span>
                        ))}
                        {member.suppressed_at && (
                          <span data-eos-id="src/pages/admin/email/delivery-tab.tsx#45" data-eos-var="member.suppressed_at" data-eos-var-label="Blocked since" data-eos-var-scope="item" className="text-[11px] text-neutral-400">
                            since {formatDate(member.suppressed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </StaggeredItem>
                ))}
              </StaggeredList>
            </>
          )}
        </>
      )}

      {subTab === 'bounces' && (
        <>
          {bouncesLoading ? (
            showBouncesLoading ? <Skeleton data-eos-id="src/pages/admin/email/delivery-tab.tsx#5" variant="list-item" count={5} /> : null
          ) : !bounces?.length ? (
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
                    <p data-eos-id="src/pages/admin/email/delivery-tab.tsx#13" data-eos-var="event.created_at" data-eos-var-label="Created at" data-eos-var-scope="item" className="text-xs text-neutral-400 mt-0.5">
                      Hard bounce &middot; {formatDate(event.created_at ?? '')}
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
          {complaintsLoading ? (
            showComplaintsLoading ? <Skeleton data-eos-id="src/pages/admin/email/delivery-tab.tsx#15" variant="list-item" count={5} /> : null
          ) : !complaints?.length ? (
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
