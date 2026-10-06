import { Info } from 'lucide-react'

/** Inline heads-up shown on signup when the DOB makes someone 30+. See src/lib/community-age.ts. */
export function CommunityAgeNotice() {
  return (
    <div
      role="status"
      data-testid="community-age-notice"
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-sm bg-neutral-50 border border-neutral-200/60"
    >
      <Info size={15} className="text-neutral-400 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-[12px] text-neutral-600 leading-relaxed">
        Just a heads up: Co-Exist is built for the under-30s community, so that's who
        you'll mostly be connecting with. You're still very welcome to join.
      </p>
    </div>
  )
}
