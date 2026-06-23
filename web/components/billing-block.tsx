/**
 * Decorative billing-block watermark (film-credits style). Dense, cramped,
 * varied-case cream text tucked into a corner of an olive section. Pass a
 * different `text` per section so it never repeats. Parent must be
 * position:relative + overflow-hidden.
 */
export function BillingBlock({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p aria-hidden className={`billing-block ${className}`}>
      {text}
    </p>
  )
}
