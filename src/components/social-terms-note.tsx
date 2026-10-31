import { Link } from 'react-router-dom'

/**
 * Shown under the Google and Apple buttons. Those sign-ups never see the email
 * form's terms checkbox, so the terms are stated before the account exists,
 * and the Accept Terms screen then asks for an explicit agreement before
 * anything else (App Review 1.2: terms agreed before reaching shared content).
 */
export function SocialTermsNote() {
  return (
    <p data-testid="social-terms-note" className="mt-3 text-[11px] leading-snug text-neutral-500 text-center">
      By continuing with Google or Apple you agree to the{' '}
      <Link to="/terms" className="font-semibold text-neutral-700 underline">Terms of Service</Link>
      {' '}and{' '}
      <Link to="/privacy" className="font-semibold text-neutral-700 underline">Privacy Policy</Link>
      , including our zero tolerance for objectionable content and abusive behaviour.
    </p>
  )
}
