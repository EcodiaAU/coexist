/**
 * Aboriginal and Torres Strait Islander flags, rendered as inline SVG so they
 * are crisp at any size and need no asset files. Shown with the Acknowledgement
 * of Country in the footer.
 */
export function AcknowledgementFlags({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden>
      {/* Aboriginal flag: black over red, centred yellow sun */}
      <svg width="33" height="22" viewBox="0 0 30 20" className="rounded-[2px] shadow-sm">
        <rect width="30" height="10" fill="#000000" />
        <rect y="10" width="30" height="10" fill="#CC0000" />
        <circle cx="15" cy="10" r="4.2" fill="#FFCC00" />
      </svg>
      {/* Torres Strait Islander flag: green / blue / green with black dividers,
          white dhari (headdress) and five-pointed star */}
      <svg width="33" height="22" viewBox="0 0 30 20" className="rounded-[2px] shadow-sm">
        <rect width="30" height="20" fill="#0A3B8C" />
        <rect width="30" height="3.2" fill="#1A7A3C" />
        <rect y="2.4" width="30" height="0.8" fill="#000000" />
        <rect y="16.8" width="30" height="3.2" fill="#1A7A3C" />
        <rect y="16.8" width="30" height="0.8" fill="#000000" />
        {/* dhari arc */}
        <path d="M9 11.2c1.6-2.4 4-3.6 6-3.6s4.4 1.2 6 3.6" fill="none" stroke="#ffffff" strokeWidth="1" />
        {/* five-pointed star */}
        <path
          d="M15 8.0l0.85 1.9 2.05 0.2-1.55 1.37 0.46 2.0L15 12.4l-1.81 1.07 0.46-2.0-1.55-1.37 2.05-0.2z"
          fill="#ffffff"
        />
      </svg>
    </div>
  )
}
