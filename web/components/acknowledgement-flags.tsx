/**
 * Aboriginal and Torres Strait Islander flags (the real flag artwork used on the
 * live coexistaus.org footer), shown with the Acknowledgement of Country.
 */
export function AcknowledgementFlags({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden>
      {/* eslint-disable @next/next/no-img-element */}
      <img src="/images/flags/aboriginal.png" alt="Aboriginal flag" className="h-5 w-auto rounded-[2px] shadow-sm" />
      <img src="/images/flags/torres.jpg" alt="Torres Strait Islander flag" className="h-5 w-auto rounded-[2px] shadow-sm" />
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  )
}
