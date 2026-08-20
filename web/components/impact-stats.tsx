'use client'

import { CountUp } from '@/components/count-up'
import { Reveal } from '@/components/reveal'

export type StatTile = { value: number; suffix: string; label: string }

export function ImpactStats({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="mt-12 grid grid-cols-2 gap-y-10 sm:grid-cols-5">
      {tiles.map((t, i) => (
        <Reveal key={t.label} delay={i * 80} className={`text-center ${i > 0 ? 'sm:border-l sm:border-oncream/15' : ''}`}>
          <div className="text-[3.25rem] font-semibold leading-none tracking-[-0.06em] text-oncream">
            <CountUp end={t.value} suffix={t.suffix} duration={2200} />
          </div>
          <div className="mx-auto mt-2 max-w-[12ch] text-[11px] font-semibold uppercase tracking-[0.18em] text-oncream/70">{t.label}</div>
        </Reveal>
      ))}
    </div>
  )
}
