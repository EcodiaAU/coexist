import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Bell,
    Shield,
    Lock,
    Heart,
    FileText,
    ShieldCheck,
    HelpCircle,
    LifeBuoy,
    Cookie,
    Info,
    LogOut,
    ChevronRight,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { Skeleton } from '@/components/skeleton'
import { cn } from '@/lib/cn'
import { EcodiaAttribution } from '@/components/ecodia-attribution'
import { useAuth } from '@/hooks/use-auth'
import { usePlatform } from '@/hooks/use-platform'
import {
    APP_NAME,
    TAGLINE,
    CONTACT_EMAIL,
    WEBSITE_URL,
    INSTAGRAM_URL,
    FACEBOOK_URL,
} from '@/lib/constants'
import { usePush } from '@/hooks/use-push'
import { useAppVersion } from '@/hooks/use-app-version'
import { useLegalPage } from '@/hooks/use-legal-page'
import DOMPurify from 'dompurify'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// Fallback version labels when the legal_pages record (which carries the real
// last-updated date) has not loaded. The app version itself is sourced from the
// build via useAppVersion, never hand-maintained here.
const TOS_VERSION = '1.0'
const PRIVACY_VERSION = '1.0'

/** "March 2026" style stamp from a legal page's updated_at, for the sheet header. */
function formatLegalDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ label, className }: { label: string; className?: string }) {
  return (
    <h3
      className={cn(
        'px-4 pt-6 pb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400',
        className,
      )}
    >
      {label}
    </h3>
  )
}

/* ------------------------------------------------------------------ */
/*  Menu row                                                           */
/* ------------------------------------------------------------------ */

interface MenuRowProps {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onClick?: () => void
  rightContent?: React.ReactNode
  danger?: boolean
  hideDivider?: boolean
}

function MenuRow({
  icon,
  label,
  subtitle,
  onClick,
  rightContent,
  danger = false,
  hideDivider = false,
}: MenuRowProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'flex items-center w-full min-h-[52px] px-4 py-3 text-left',
        'transition-colors duration-100',
        'cursor-pointer hover:bg-surface-3 active:bg-surface-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
        !hideDivider && '',
      )}
      aria-label={label}
    >
      <span
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-sm shrink-0 mr-3',
          danger ? 'bg-error-100 text-error-600' : 'bg-neutral-100 text-neutral-500',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            'block text-sm font-medium truncate',
            danger ? 'text-error-600' : 'text-neutral-900',
          )}
        >
          {label}
        </span>
        {subtitle && (
          <span className="block text-xs text-neutral-500 truncate mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      <span className="flex items-center shrink-0 ml-3 text-neutral-400">
        {rightContent ?? <ChevronRight className="w-5 h-5" aria-hidden="true" />}
      </span>
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/*  About Sheet                                                        */
/* ------------------------------------------------------------------ */

function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isWeb } = usePlatform()
  const { data: legalPage, isLoading } = useLegalPage('about')

  const showDynamic = isWeb && legalPage?.content
  // Sanitise with DOMPurify to prevent stored XSS (defence-in-depth, only staff can author)
  const sanitisedHtml = showDynamic ? DOMPurify.sanitize(legalPage.content) : ''

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.7]}>
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-md bg-primary-100 flex items-center justify-center">
          <Heart size={28} className="text-neutral-400" />
        </div>
        <h2 className="font-heading text-xl font-bold text-neutral-900">
          {APP_NAME}
        </h2>
        <p className="text-sm text-neutral-500 font-medium mt-1">{TAGLINE}</p>

        {isWeb && isLoading && (
          <div className="mt-4 space-y-2">
            <Skeleton variant="text" count={3} />
          </div>
        )}

        {sanitisedHtml ? (
          <div
            className="mt-4 legal-content max-w-none text-sm text-neutral-700 leading-relaxed text-left"
            dangerouslySetInnerHTML={{ __html: sanitisedHtml }}
          />
        ) : (
          <>
            <p className="mt-4 text-sm text-neutral-500 leading-relaxed px-2">
              Co-Exist is a national environmental nonprofit run by young adults that organises
              conservation events through local groups called Collectives. We believe in the
              power of young adults to protect and restore Australia&apos;s natural environment.
            </p>
            <p className="mt-3 text-sm text-neutral-500 leading-relaxed px-2">
              5,500+ volunteers &middot; 13 collectives &middot; 35,500+ native plants &middot;
              4,900+ kg litter removed
            </p>
          </>
        )}

        <div className="mt-5 flex justify-center gap-3">
          <a
            href={WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-4 py-2 text-sm font-medium text-primary-500 hover:bg-primary-100 transition-colors"
          >
            Website
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-4 py-2 text-sm font-medium text-primary-500 hover:bg-primary-100 transition-colors"
          >
            Instagram
          </a>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-4 py-2 text-sm font-medium text-primary-500 hover:bg-primary-100 transition-colors"
          >
            Facebook
          </a>
        </div>

        {/* Aboriginal Acknowledgment */}
        <div className="mt-6 rounded-sm bg-secondary-50/40 shadow-sm p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-900 mb-1.5">
            Acknowledgment of Country
          </p>
          <p className="text-xs text-neutral-900 leading-relaxed">
            Co-Exist acknowledges the Traditional Owners and Custodians of the land on which
            we live, work, and volunteer. We pay our respects to Elders past, present, and
            emerging, and recognise the deep connection Aboriginal and Torres Strait Islander
            peoples have to Country. Sovereignty was never ceded.
          </p>
        </div>

        <div className="mt-5 flex justify-center">
          <EcodiaAttribution />
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Terms of Service Sheet                                             */
/* ------------------------------------------------------------------ */

function TermsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isWeb } = usePlatform()
  const { data: legalPage, isLoading } = useLegalPage('terms')
  const showDynamic = isWeb && legalPage?.content
  // Sanitise with DOMPurify to prevent stored XSS (defence-in-depth, only staff can author)
  const sanitisedHtml = showDynamic ? DOMPurify.sanitize(legalPage.content) : ''

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.85]}>
      <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-1">
        Terms of Service
      </h2>
      <p className="text-xs text-neutral-500 mb-4">
        {formatLegalDate(legalPage?.updated_at)
          ? `Last updated ${formatLegalDate(legalPage?.updated_at)}`
          : `Version ${TOS_VERSION}`}
      </p>

      {isWeb && isLoading && (
        <div className="space-y-2">
          <Skeleton variant="text" count={5} />
        </div>
      )}

      {sanitisedHtml ? (
        <div
          className="legal-content max-w-none text-sm text-neutral-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitisedHtml }}
        />
      ) : (
        <div className="prose prose-sm text-neutral-900 space-y-3 text-sm leading-relaxed">
          <p>
            Welcome to Co-Exist. By using our app, you agree to these terms. Co-Exist is a
            registered Australian charity (ACNC) providing a platform for young adult conservation activities.
          </p>
          <h4 className="font-semibold text-neutral-900 text-sm">1. Eligibility</h4>
          <p>You must be at least 18 years old to create an account. Users under 18 may attend events
            with parental/guardian consent through an approved Collective leader.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">2. Your Account</h4>
          <p>You are responsible for your account credentials and all activity under your account.
            Notify us immediately of any unauthorised use.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">3. Acceptable Use</h4>
          <p>You agree to use Co-Exist respectfully. Harassment, hate speech, spam, or sharing of
            inappropriate content will result in account suspension.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">4. Content</h4>
          <p>You retain ownership of content you post. By posting, you grant Co-Exist a non-exclusive
            licence to use it for promotional and operational purposes.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">5. Events & Safety</h4>
          <p>Co-Exist events involve outdoor conservation activities. Participants assume inherent risks
            and should follow all safety instructions from Collective leaders.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">6. Donations</h4>
          <p>Donations are processed via Stripe. Co-Exist is a registered charity. Tax-deductible status
            depends on current DGR registration.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">7. Termination</h4>
          <p>We may suspend or terminate accounts that violate these terms. You may delete your account
            at any time through Settings.</p>
          <p className="text-xs text-neutral-500 mt-4">
            Last updated: March 2026. Contact: {CONTACT_EMAIL}
          </p>
        </div>
      )}
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Privacy Policy Sheet                                               */
/* ------------------------------------------------------------------ */

function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isWeb } = usePlatform()
  const { data: legalPage, isLoading } = useLegalPage('privacy')
  const showDynamic = isWeb && legalPage?.content
  // Sanitise with DOMPurify to prevent stored XSS (defence-in-depth, only staff can author)
  const sanitisedHtml = showDynamic ? DOMPurify.sanitize(legalPage.content) : ''

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.85]}>
      <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-1">
        Privacy Policy
      </h2>
      <p className="text-xs text-neutral-500 mb-4">
        {formatLegalDate(legalPage?.updated_at)
          ? `Last updated ${formatLegalDate(legalPage?.updated_at)}`
          : `Version ${PRIVACY_VERSION}`}
      </p>

      {isWeb && isLoading && (
        <div className="space-y-2">
          <Skeleton variant="text" count={5} />
        </div>
      )}

      {sanitisedHtml ? (
        <div
          className="legal-content max-w-none text-sm text-neutral-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitisedHtml }}
        />
      ) : (
        <div className="prose prose-sm text-neutral-900 space-y-3 text-sm leading-relaxed">
          <p>
            Co-Exist Australia (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects and processes personal
            information in accordance with the Australian Privacy Act 1988 and GDPR where applicable.
          </p>
          <h4 className="font-semibold text-neutral-900 text-sm">What We Collect</h4>
          <p>Name, email, location (optional), profile photo, event participation history, impact
            data, and device information for push notifications.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">How We Use It</h4>
          <p>To operate the app, facilitate events, track conservation impact, send notifications,
            process donations, and improve our services.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">Third Parties</h4>
          <p>We use Supabase (database), Stripe (payments), Resend (email), and Firebase Cloud
            Messaging (push notifications). We do not sell your data.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">Your Rights</h4>
          <p>You can access, correct, export, or delete your personal data at any time through the
            app settings. Deletion requests are processed within 30 days.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">Data Retention</h4>
          <p>Account data is retained while your account is active. After deletion, data enters a
            30-day grace period before permanent removal. Anonymised impact data is retained for
            charity reporting.</p>
          <h4 className="font-semibold text-neutral-900 text-sm">Children</h4>
          <p>Co-Exist does not knowingly collect information from children under 13. If we become
            aware of data collected from a child under 13, we will delete it promptly.</p>
          <p className="text-xs text-neutral-500 mt-4">
            Contact our privacy team: {CONTACT_EMAIL}
          </p>
        </div>
      )}
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Child Safety Policy Sheet                                          */
/*                                                                     */
/*  Store compliance (Apple/Google both require a durable, readable    */
/*  child-safety statement) needs a real page, not the transient toast */
/*  this used to fire. Renders the legal_pages 'child-safety' record   */
/*  when present (web, admin-editable) and a solid hardcoded fallback  */
/*  otherwise, matching the Terms/Privacy sheets.                      */
/* ------------------------------------------------------------------ */

function ChildSafetySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isWeb } = usePlatform()
  const { data: legalPage, isLoading } = useLegalPage('child-safety')
  const showDynamic = isWeb && legalPage?.content
  const sanitisedHtml = showDynamic ? DOMPurify.sanitize(legalPage.content) : ''

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.75]}>
      <div className="flex items-center gap-2.5 mb-1">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-600">
          <ShieldCheck size={16} />
        </div>
        <h2 className="font-heading text-lg font-semibold text-neutral-900">
          Child Safety Policy
        </h2>
      </div>
      <p className="text-xs text-neutral-500 mb-4">Our commitment to keeping young people safe</p>

      {isWeb && isLoading && (
        <div className="space-y-2">
          <Skeleton variant="text" count={5} />
        </div>
      )}

      {sanitisedHtml ? (
        <div
          className="legal-content max-w-none text-sm text-neutral-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitisedHtml }}
        />
      ) : (
        <div className="prose prose-sm text-neutral-900 space-y-3 text-sm leading-relaxed">
          <p>
            Co-Exist is committed to the safety and wellbeing of every young person who takes part in
            our conservation activities. We have zero tolerance for child abuse, exploitation, or any
            form of harm.
          </p>
          <h4 className="font-semibold text-neutral-900 text-sm">Who can use Co-Exist</h4>
          <p>
            You must be at least 18 years old to create an account. Under-18s may attend Co-Exist
            events only with parental or guardian consent, arranged through an approved Collective
            leader, and are never given an account of their own.
          </p>
          <h4 className="font-semibold text-neutral-900 text-sm">Our safeguards</h4>
          <p>
            Collective leaders are selected for their commitment and are expected to follow our
            safeguarding practices at every event. In-app content can be reported and blocked, and our
            team reviews reports promptly.
          </p>
          <h4 className="font-semibold text-neutral-900 text-sm">Reporting a concern</h4>
          <p>
            If you have any concern about the safety of a child or young person, contact us
            immediately at {CONTACT_EMAIL}. Where there is an immediate risk to a child, always
            contact your local police or emergency services first.
          </p>
          <p className="text-xs text-neutral-500 mt-4">
            We report suspected abuse to the relevant authorities as required by Australian law.
          </p>
        </div>
      )}
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Help / FAQ Sheet                                                   */
/* ------------------------------------------------------------------ */

function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const faqs = [
    { q: 'How do I join a Collective?', a: 'Go to the Explore tab, find a Collective near you, and tap "Join". Leaders will approve your request.' },
    { q: 'How does check-in work?', a: 'At events, the leader will share a 3-digit code. Tap the check-in button on the event page and enter the code to earn your points.' },
    { q: 'Can I cancel an event registration?', a: 'Yes! Go to the event page and tap "Cancel Registration" before the event starts.' },
    { q: 'How do I become a Collective leader?', a: 'Contact Co-Exist national team via the app or email. Leaders are selected based on commitment and location.' },
    { q: 'Is my donation tax-deductible?', a: 'This depends on current DGR status. Check with Co-Exist or your tax advisor.' },
  ]

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.85]}>
      <h2 className="font-heading text-lg font-semibold text-neutral-900 mb-4">
        Help & FAQ
      </h2>
      <div className="space-y-4">
        {faqs.map(({ q, a }) => (
          <div key={q}>
            <h4 className="text-sm font-semibold text-neutral-900">{q}</h4>
            <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{a}</p>
          </div>
        ))}
        <div className="pt-2">
          <p className="text-sm text-neutral-500">
            Still need help?{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-neutral-500 font-medium hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Settings Skeleton                                                  */
/* ------------------------------------------------------------------ */

function SettingsSkeleton() {
  return (
    <div className="space-y-3 py-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} variant="text" className="h-13 rounded-sm" />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Settings Page (menu)                                          */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const { isWeb } = usePlatform()
  const { unregister: unregisterPush } = usePush()
  const shouldReduceMotion = useReducedMotion()
  const appVersion = useAppVersion()

  // Sheet states (About / Legal / Help only - settings sub-pages handle the rest)
  const [showAbout, setShowAbout] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showChildSafety, setShowChildSafety] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = async () => {
    await unregisterPush()
    await signOut()
    navigate('/welcome')
  }

  if (!user || !profile) {
    return (
      <Page noBackground stickyOverlay={<Header title="Settings" back transparent className="collapse-header" />}>
        <div style={{ paddingTop: '3.5rem' }}>
          <SettingsSkeleton />
        </div>
      </Page>
    )
  }

  return (
    <Page noBackground stickyOverlay={<Header title="Settings" back transparent className="collapse-header" />}>
      <div className="relative" style={{ paddingTop: '3.5rem' }}>
        <div className="relative">
          <motion.div
            className="pb-8"
            variants={shouldReduceMotion ? undefined : stagger}
            initial="hidden"
            animate="visible"
          >
            {/* ---- Settings Sections ---- */}
            <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
              <SectionHeader label="Preferences" className="pt-4" />
              <div className="bg-white/90 rounded-md shadow-sm border border-neutral-100 overflow-hidden">
                <MenuRow
                  icon={<Bell size={18} />}
                  label="Notifications"
                  subtitle="Alerts, chat, quiet hours, sounds"
                  onClick={() => navigate('/settings/notifications')}
                />
                <MenuRow
                  icon={<Shield size={18} />}
                  label="Privacy"
                  subtitle="Visibility, marketing, blocked users"
                  onClick={() => navigate('/settings/privacy')}
                />
                <MenuRow
                  icon={<Lock size={18} />}
                  label="Account"
                  subtitle="Password, email, data export, deletion"
                  onClick={() => navigate('/settings/account')}
                  hideDivider
                />
              </div>
            </motion.div>

            {/* ---- About ---- */}
            <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
              <SectionHeader label="About" />
              <div className="bg-white/90 rounded-md shadow-sm border border-neutral-100 overflow-hidden">
                <MenuRow
                  icon={<Heart size={18} />}
                  label="About Co-Exist"
                  subtitle="Our mission and story"
                  onClick={() => setShowAbout(true)}
                />
                <MenuRow
                  icon={<FileText size={18} />}
                  label="Terms of Service"
                  subtitle="Read our terms and conditions"
                  onClick={() => setShowTerms(true)}
                />
                <MenuRow
                  icon={<ShieldCheck size={18} />}
                  label="Privacy Policy"
                  subtitle="How we handle your data"
                  onClick={() => setShowPrivacy(true)}
                />
                <MenuRow
                  icon={<Info size={18} />}
                  label="Child Safety Policy"
                  subtitle="Our commitment to child safety"
                  onClick={() => setShowChildSafety(true)}
                />
                {isWeb && (
                  <MenuRow
                    icon={<Cookie size={18} />}
                    label="Cookie Preferences"
                    subtitle="Manage cookie consent"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('coexist:open-cookie-consent'))
                    }}
                  />
                )}
                <MenuRow
                  icon={<HelpCircle size={18} />}
                  label="Help & FAQ"
                  onClick={() => setShowHelp(true)}
                />
                <MenuRow
                  icon={<LifeBuoy size={18} />}
                  label="Contact Support"
                  subtitle={CONTACT_EMAIL}
                  onClick={() => {
                    window.open(`mailto:${CONTACT_EMAIL}`, '_blank')
                  }}
                  hideDivider
                />
              </div>
            </motion.div>

            {/* ---- App Info ---- */}
            <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="mt-6 flex flex-col items-center gap-1.5">
              <p className="text-xs text-neutral-500">
                {APP_NAME} v{appVersion}
              </p>
              <EcodiaAttribution />
            </motion.div>

            {/* ---- Logout ---- */}
            <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="mt-4">
              <Button
                variant="ghost"
                fullWidth
                icon={<LogOut size={18} />}
                onClick={() => setShowLogoutConfirm(true)}
                className="text-neutral-900"
              >
                Log Out
              </Button>
            </motion.div>

            {/* ---- Bottom Sheets ---- */}
            <AboutSheet open={showAbout} onClose={() => setShowAbout(false)} />
            <TermsSheet open={showTerms} onClose={() => setShowTerms(false)} />
            <PrivacySheet open={showPrivacy} onClose={() => setShowPrivacy(false)} />
            <ChildSafetySheet open={showChildSafety} onClose={() => setShowChildSafety(false)} />
            <HelpSheet open={showHelp} onClose={() => setShowHelp(false)} />

            {/* Logout Confirmation */}
            <ConfirmationSheet
              open={showLogoutConfirm}
              onClose={() => setShowLogoutConfirm(false)}
              onConfirm={handleLogout}
              title="Log Out?"
              description="You'll need to sign in again to access your account."
              confirmLabel="Log Out"
              variant="warning"
            />
          </motion.div>
        </div>
      </div>
    </Page>
  )
}
