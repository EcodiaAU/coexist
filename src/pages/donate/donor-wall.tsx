import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Heart } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Avatar } from '@/components/avatar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useDonorWall } from '@/hooks/use-donations'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'

const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.05, delayChildren: 0.15 } } }
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } },
}

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function DonorWallPage() {
  const { data: donors, isLoading, isError, refetch } = useDonorWall()
  const showLoading = useDelayedLoading(isLoading)
  const shouldReduceMotion = useReducedMotion()

  return (
    <Page swipeBack header={<Header title="Donor Wall" back />}>
      <div className="max-w-2xl mx-auto w-full py-5">
        {/* Intro */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-50">
            <Heart size={20} className="text-primary-600" />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-neutral-900">
              Our generous donors
            </h2>
            <p className="text-sm text-neutral-500">
              People & organisations making conservation happen
            </p>
          </div>
        </motion.div>

        {showLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="text" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            illustration="error"
            title="Something went wrong"
            description="We couldn't load the donor wall."
            action={{ label: 'Try again', onClick: () => refetch() }}
          />
        ) : !donors || donors.length === 0 ? (
          <EmptyState
            illustration="empty"
            title="No donors yet"
            description="Be the first to make a public donation!"
            action={{ label: 'Donate now', to: '/donate' }}
          />
        ) : (
          <motion.div
            variants={shouldReduceMotion ? undefined : stagger}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {donors.map((donor) => (
              <motion.div
                key={donor.id}
                variants={fadeUp}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl',
                  'bg-white border border-neutral-100 shadow-sm',
                )}
              >
                <Avatar
                  src={donor.avatar_url}
                  name={donor.on_behalf_of ?? donor.display_name ?? 'Anonymous'}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {donor.on_behalf_of ?? donor.display_name ?? 'Anonymous'}
                  </p>
                  {donor.message && (
                    <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">
                      "{donor.message}"
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-neutral-500">
                    ${Number(donor.amount).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatRelativeDate(donor.created_at)}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </Page>
  )
}
