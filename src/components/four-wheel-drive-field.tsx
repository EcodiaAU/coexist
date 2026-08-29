/* ------------------------------------------------------------------ */
/*  Four-wheel-drive yes/no field                                      */
/*                                                                     */
/*  One home for the fourth member of the retreat safety set, because  */
/*  this set has drifted three times already: 65646d56 added the       */
/*  emergency contact to two of the three surfaces and missed the      */
/*  signed-in buy path, campout-type.tsx dropped three fields on the   */
/*  floor while type-checking clean, and the app-open backstop         */
/*  filtered out organiser holds. The predicates were hoisted into     */
/*  lib/dietary.ts for exactly that reason; this is the rendering      */
/*  half of the same argument.                                         */
/*                                                                     */
/*  The value is boolean | null and null is a real state: it means     */
/*  never answered, which is what keeps the intake gates armed. So     */
/*  neither button is pre-selected and there is no default.            */
/*                                                                     */
/*  Visual idiom is the boolean question in ticket-questions-modal so  */
/*  a member who answers the per-event "Will you have a 4WD at the     */
/*  camp-out?" sees the same control here.                             */
/* ------------------------------------------------------------------ */

interface Props {
  value: boolean | null
  onChange: (value: boolean) => void
  disabled?: boolean
  /** Shown under the buttons. Camp-outs sit at the end of unsealed road, so
   *  the reason we ask is worth stating where we ask it. */
  helpText?: string
}

export function FourWheelDriveField({ value, onChange, disabled, helpText }: Props) {
  return (
    <div data-eos-id="src/components/four-wheel-drive-field.tsx#1" className="space-y-1.5">
      <label data-eos-id="src/components/four-wheel-drive-field.tsx#2" className="block text-sm font-medium text-neutral-700">
        Do you have a four-wheel drive?
      </label>
      <div data-eos-id="src/components/four-wheel-drive-field.tsx#3" role="group" aria-label="Do you have a four-wheel drive?" className="flex gap-2">
        {([['Yes', true], ['No', false]] as const).map(([label, val]) => {
          const active = value === val
          return (
            <button data-eos-id="src/components/four-wheel-drive-field.tsx#4"
              key={label}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(val)}
              className={`flex-1 h-10 rounded-sm text-sm font-semibold transition-colors disabled:opacity-60 ${
                active ? 'bg-primary-600 text-white' : 'bg-surface-3 text-neutral-700'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {helpText && (
        <p data-eos-id="src/components/four-wheel-drive-field.tsx#5" className="text-xs text-neutral-500 leading-relaxed">{helpText}</p>
      )}
    </div>
  )
}

/** The one sentence explaining why we ask, so every surface says the same
 *  thing and nobody has to invent a rationale at the call site. */
export const FOUR_WHEEL_DRIVE_HELP =
  'Camp-out sites sit at the end of unsealed roads, so leaders plan lifts and gear runs around who can get in.'
