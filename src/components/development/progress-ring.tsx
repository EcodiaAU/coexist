import { cn } from '@/lib/cn'

interface ProgressRingProps {
  percent: number
  size?: number
  strokeWidth?: number
  className?: string
}

export function ProgressRing({
  percent,
  size = 40,
  strokeWidth = 3.5,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  const color =
    percent >= 100
      ? 'text-moss-500'
      : percent >= 50
        ? 'text-primary-500'
        : 'text-bark-400'

  return (
    <div data-eos-id="src/components/development/progress-ring.tsx#0" data-eos-v="2" className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg data-eos-id="src/components/development/progress-ring.tsx#1" width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle data-eos-id="src/components/development/progress-ring.tsx#2"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-primary-200/60"
        />
        {/* Progress arc */}
        <circle data-eos-id="src/components/development/progress-ring.tsx#3"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('transition-all duration-500 ease-out', color)}
        />
      </svg>
      {/* Center text */}
      <span data-eos-id="src/components/development/progress-ring.tsx#4" data-eos-var="Math.round" data-eos-var-label="Round" data-eos-var-scope="prop" className={cn('absolute text-[10px] font-bold tabular-nums', color)}>
        {Math.round(percent)}
      </span>
    </div>
  )
}

export default ProgressRing
