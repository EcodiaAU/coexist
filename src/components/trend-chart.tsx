import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import type { TrendMonth } from '@/hooks/use-admin-dashboard'

/* ------------------------------------------------------------------ */
/*  Bar chart - elevated style                                         */
/*                                                                      */
/*  Hand-built animated bar chart (no recharts dependency). Lives as a  */
/*  shared component so both the admin dashboard and the Insights page  */
/*  render member-growth / event-frequency trends from one source.     */
/* ------------------------------------------------------------------ */

export function TrendChart({
  data,
  dataKey,
  label,
  icon,
  accentFrom,
  accentTo,
}: {
  data: TrendMonth[]
  dataKey: string
  label: string
  icon: React.ReactNode
  accentFrom: string
  accentTo: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const values = data.map((d) => (d[dataKey as keyof TrendMonth] as number) ?? 0)
  const max = Math.max(...values, 1)
  const total = values.reduce((a, b) => a + b, 0)
  const allZero = max <= 0 || total <= 0

  // Placeholder staircase when there's no data
  const placeholders = [35, 55, 42, 70, 48, 62]

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="group relative overflow-hidden rounded-md bg-white border border-neutral-100 shadow-sm transition-colors duration-200 p-5 sm:p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-sm bg-neutral-50 group-hover:bg-neutral-100 transition-colors duration-200">
              {icon}
            </span>
            <div>
              <h3 className="font-heading text-sm font-bold text-neutral-900 tracking-tight">{label}</h3>
              <p className="text-xs text-neutral-400 font-medium mt-0.5">
                {allZero ? 'No data yet' : `${total.toLocaleString()} total`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-3 h-36 sm:h-44">
          {data.map((d, i) => {
            const val = (d[dataKey as keyof TrendMonth] as number) ?? 0
            const pct = allZero
              ? placeholders[i % placeholders.length]!
              : Math.round(Math.max((val / max) * 100, val > 0 ? 12 : 4))
            const isMax = !allZero && val === max && val > 0
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                {/* Value label */}
                <span className={cn(
                  'text-[11px] sm:text-xs font-semibold tabular-nums',
                  allZero ? 'text-transparent' : isMax ? 'text-neutral-800' : 'text-neutral-400',
                )}>
                  {val > 0 ? val : ' '}
                </span>

                {/* Bar track - relative with defined flex-1 height so % children work */}
                <div className="relative w-full flex-1">
                  <motion.div
                    className="absolute bottom-0 left-[15%] right-[15%] rounded-sm"
                    style={{
                      background: allZero
                        ? 'var(--color-neutral-200)'
                        : `linear-gradient(to top, ${accentFrom}, ${accentTo})`,
                    }}
                    initial={shouldReduceMotion ? { height: `${pct}%` } : { height: '0%' }}
                    animate={{ height: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                  />
                </div>

                {/* Month label */}
                <span className={cn(
                  'text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide',
                  isMax ? 'text-neutral-600' : 'text-neutral-300',
                )}>{d.month}</span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}
