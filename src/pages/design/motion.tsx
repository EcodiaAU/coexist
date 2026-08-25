import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Heart, Leaf, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/button'
import { SegmentedControl } from '@/components/segmented-control'
import { Toggle } from '@/components/toggle'
import { Chip } from '@/components/chip'
import { Input } from '@/components/input'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

/*
 * Motion showcase - the living version of the signed-off @ecodia/motion
 * prototype bar, built from Co-Exist's REAL primitives so what Tate eyeballs on
 * /design/motion is exactly what ships across every screen. Dev-only surface,
 * public route (no auth) so it can be CDP-screenshotted and hand-reviewed.
 *
 * Everything reads the olive semantic tokens; every state change animates on the
 * shared motion contract (easing + duration tokens, ec-* keyframes, the
 * elevation ladder). Nothing here is product logic.
 */

function Section({
  title,
  sub,
  children,
}: {
  title: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-surface-0 p-5 shadow-[var(--ec-sh-1)]">
      <h3 className="text-sm font-bold tracking-tight text-neutral-900">{title}</h3>
      <p className="mb-4 mt-0.5 text-caption text-neutral-500">{sub}</p>
      {children}
    </section>
  )
}

export default function MotionShowcase() {
  const { toast } = useToast()

  // Async morph button (spinner -> drawn check).
  const [saveState, setSaveState] = useState<'idle' | 'loading' | 'success'>('idle')
  const timers = useRef<number[]>([])
  const runSave = useCallback(() => {
    if (saveState !== 'idle') return
    setSaveState('loading')
    timers.current.push(
      window.setTimeout(() => setSaveState('success'), 1150),
      window.setTimeout(() => setSaveState('idle'), 1150 + 1600),
    )
  }, [saveState])

  // Segmented + chips + toggles state.
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  const [scope, setScope] = useState<'national' | 'collective'>('national')
  const [notifications, setNotifications] = useState(true)
  const [digest, setDigest] = useState(false)
  const [causes, setCauses] = useState<Set<string>>(new Set(['restoration']))
  const toggleCause = (id: string) =>
    setCauses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Skeleton -> content cross-fade.
  const [loaded, setLoaded] = useState(true)
  const reload = useCallback(() => {
    setLoaded(false)
    window.setTimeout(() => setLoaded(true), 1400)
  }, [])

  return (
    <div className="min-h-dvh bg-surface-1 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-h2 font-heading text-neutral-900">Motion showcase</h1>
          <p className="mt-1 max-w-prose text-body text-neutral-500">
            Co-Exist on the shared Ecodia motion contract. Every primitive here is
            the real app component; every state change animates on the same easing,
            duration, and elevation the whole fleet moves on. Olive throughout.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Buttons */}
          <Section title="Buttons" sub="Press-scale, hover-lift, async morph (spinner to drawn check).">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger" icon={<Trash2 size={16} />}>
                Delete
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Button
                variant="primary"
                loading={saveState === 'loading'}
                success={saveState === 'success'}
                onClick={runSave}
              >
                {saveState === 'success' ? 'Saved' : 'Save changes'}
              </Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <span className="text-caption font-mono text-neutral-400">click Save changes</span>
            </div>
          </Section>

          {/* Segmented */}
          <Section title="Segmented" sub="Sliding pill FLIPs between options (spring).">
            <div className="space-y-3">
              <SegmentedControl
                aria-label="Time range"
                segments={[
                  { id: 'day', label: 'Day' },
                  { id: 'week', label: 'Week' },
                  { id: 'month', label: 'Month' },
                ]}
                value={range}
                onChange={setRange}
              />
              <SegmentedControl
                aria-label="Scope"
                variant="pill"
                segments={[
                  { id: 'national', label: 'National' },
                  { id: 'collective', label: 'Collective' },
                ]}
                value={scope}
                onChange={setScope}
              />
            </div>
          </Section>

          {/* Toggles */}
          <Section title="Toggles" sub="Thumb springs across; track colour flips on the contract.">
            <div className="space-y-1">
              <Toggle
                label="Notifications"
                description="Event reminders and replies"
                checked={notifications}
                onChange={setNotifications}
              />
              <Toggle
                label="Weekly digest"
                description="A Sunday summary of your collective"
                checked={digest}
                onChange={setDigest}
              />
            </div>
          </Section>

          {/* Chips */}
          <Section title="Filter pills" sub="Select toggles the olive fill; press-scale on tap.">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'restoration', label: 'Restoration', icon: <Leaf size={15} /> },
                { id: 'wildlife', label: 'Wildlife' },
                { id: 'coastal', label: 'Coastal' },
                { id: 'community', label: 'Community' },
              ].map((c) => (
                <Chip
                  key={c.id}
                  label={c.label}
                  icon={c.icon}
                  selected={causes.has(c.id)}
                  onSelect={() => toggleCause(c.id)}
                />
              ))}
            </div>
          </Section>

          {/* Inputs */}
          <Section title="Inputs" sub="Floating label springs up; focus grows the olive ring.">
            <div className="space-y-3">
              <Input label="Your name" />
              <Input label="Search events" type="search" icon={<Search size={18} />} />
            </div>
          </Section>

          {/* Toasts */}
          <Section title="Toasts" sub="Stack in from the top, spring in, self-dismiss.">
            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" icon={<Bell size={16} />} onClick={() => toast.success('Saved to your collective')}>
                Success
              </Button>
              <Button variant="ghost" onClick={() => toast.info('Synced across the fleet')}>
                Info
              </Button>
              <Button variant="ghost" onClick={() => toast.error('Something needs a retry')}>
                Error
              </Button>
            </div>
          </Section>

          {/* Skeleton */}
          <Section title="Skeleton to content" sub="Shimmer shell cross-fades into the loaded row.">
            <div className="min-h-[92px]">
              <AnimatePresence mode="wait" initial={false}>
                {loaded ? (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700">
                        <Heart size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">Coastal restoration</p>
                        <p className="truncate text-caption text-neutral-500">4,200 trees planted this season</p>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="skeleton" exit={{ opacity: 0 }}>
                    <Skeleton variant="list-item" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={reload}>
                Reload
              </Button>
            </div>
          </Section>
        </div>

        <p className="mt-6 text-caption font-mono text-neutral-400">
          /design/motion · real Co-Exist primitives · shared @ecodia/motion contract · reduced-motion honoured
        </p>
      </div>
    </div>
  )
}
