import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, useState, useCallback, useEffect } from 'react'
import { lazyWithRetry as lazy, clearChunkReloadGuard } from '@/lib/lazy-with-retry'
import { ErrorBoundary } from '@/components/error-boundary'
import { RequireAuth, RequireRole, RequireLeaderAccess, RequireCapability } from '@/components/route-guard'
import { AppShell } from '@/components/app-shell'
import { AnimatedOutlet } from '@/components/animated-outlet'
import { AdminLayout as AdminLayoutRoute } from '@/components/admin-layout'
import { LeaderLayout as LeaderLayoutRoute } from '@/components/leader-layout'
import { MaintenanceMode } from '@/components/maintenance-mode'
import { UpdateRequired } from '@/components/update-required'
import { useAppUpdate } from '@/hooks/use-app-update'
import { useAuth } from '@/hooks/use-auth'
import { useDeepLink } from '@/hooks/use-deep-link'
import SplashPage from '@/pages/splash'

/* ------------------------------------------------------------------ */
/*  Lazy-loaded pages                                                  */
/*                                                                     */
/*  Core pages (bottom tabs + sidebar links) are eagerly preloaded     */
/*  after mount via requestIdleCallback so chunks are cached before    */
/*  the user taps anything. This eliminates the white Suspense gap.    */
/* ------------------------------------------------------------------ */

// Public pages (no auth required)
const PublicEventPage = lazy(() => import('@/pages/public/event'))
const PublicCampoutsPage = lazy(() => import('@/pages/public/campouts'))
const CampoutTypePage = lazy(() => import('@/pages/public/campout-type'))
const PublicCollectivePage = lazy(() => import('@/pages/public/collective'))
const DownloadPage = lazy(() => import('@/pages/public/download'))
const AccountDeletionPage = lazy(() => import('@/pages/public/account-deletion'))
const DataDeletionPage = lazy(() => import('@/pages/public/data-deletion'))
const UnsubscribePage = lazy(() => import('@/pages/public/unsubscribe'))
const PublicCheckInPage = lazy(() => import('@/pages/public/check-in'))

// Design showcase (dev only)
const EventEditorialShowcase = lazy(() => import('@/pages/design/event-editorial'))

// Legal
const TermsOfServicePage = lazy(() => import('@/pages/legal/terms'))
const PrivacyPolicyPage = lazy(() => import('@/pages/legal/privacy'))
const AboutPage = lazy(() => import('@/pages/legal/about'))
const AccessibilityPage = lazy(() => import('@/pages/legal/accessibility'))
const CookiePolicyPage = lazy(() => import('@/pages/legal/cookies'))
const DataPolicyPage = lazy(() => import('@/pages/legal/data-policy'))
const DisclaimerPage = lazy(() => import('@/pages/legal/disclaimer'))

// Public / Auth
const WelcomePage = lazy(() => import('@/pages/auth/welcome'))
const NotFoundPage = lazy(() => import('@/pages/not-found'))
const SignUpPage = lazy(() => import('@/pages/auth/sign-up'))
const LoginPage = lazy(() => import('@/pages/auth/login'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/forgot-password'))
const EmailVerificationPage = lazy(() => import('@/pages/auth/email-verification'))
const AuthCallbackPage = lazy(() => import('@/pages/auth/auth-callback'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/reset-password'))
const SuspendedAccountPage = lazy(() => import('@/pages/auth/suspended-account'))
const AcceptTermsPage = lazy(() => import('@/pages/auth/accept-terms'))

// Onboarding
const OnboardingPage = lazy(() => import('@/pages/onboarding/onboarding'))
const LeaderWelcomePage = lazy(() => import('@/pages/onboarding/leader-welcome'))
const WelcomeBackPage = lazy(() => import('@/pages/onboarding/welcome-back'))
const ClaimTicketPage = lazy(() => import('@/pages/claim-ticket'))

// Main app
const HomePage = lazy(() => import('@/pages/home'))

// Collectives
const CollectiveDetailPage = lazy(() => import('@/pages/collectives/collective-detail'))
const CollectiveManagePage = lazy(() => import('@/pages/collectives/manage'))

// Chat
const ChatListPage = lazy(() => import('@/pages/chat/index'))
const ChatRoomPage = lazy(() => import('@/pages/chat/chat-room'))

// Tasks (staff)
const TasksPage = lazy(() => import('@/pages/tasks/index'))

// Settings
const SettingsPage = lazy(() => import('@/pages/settings/index'))
const SettingsNotificationsPage = lazy(() => import('@/pages/settings/notifications'))
const SettingsPrivacyPage = lazy(() => import('@/pages/settings/privacy'))
const SettingsAccountPage = lazy(() => import('@/pages/settings/account'))

// Profile, Impact
const ProfilePage = lazy(() => import('@/pages/profile/index'))
const ViewProfilePage = lazy(() => import('@/pages/profile/view-profile'))
const EditProfilePage = lazy(() => import('@/pages/profile/edit-profile'))

const ReferralPage = lazy(() => import('@/pages/referral/index'))

// Explore (unified events + collectives page)
const ExplorePage = lazy(() => import('@/pages/events/index'))
const EventDetailPage = lazy(() => import('@/pages/events/event-detail'))
const CreateEventPage = lazy(() => import('@/pages/events/create-event'))
const CheckInPage = lazy(() => import('@/pages/events/check-in'))
const ProfileSurveyPage = lazy(() => import('@/pages/events/profile-survey'))
const EventDayPage = lazy(() => import('@/pages/events/event-day'))
const LogImpactPage = lazy(() => import('@/pages/events/log-impact'))
const PostEventSurveyPage = lazy(() => import('@/pages/events/post-event-survey'))
const EditEventPage = lazy(() => import('@/pages/events/edit-event'))
const TicketConfirmationPage = lazy(() => import('@/pages/events/ticket-confirmation'))
const MyTicketsPage = lazy(() => import('@/pages/events/my-tickets'))

// Notifications
const NotificationsPage = lazy(() => import('@/pages/notifications/index'))

// Updates
const UpdatesPage = lazy(() => import('@/pages/updates/index'))
const AdminUpdatesPage = lazy(() => import('@/pages/admin/updates'))

// Donations
const DonatePage = lazy(() => import('@/pages/donate/index'))
const DonateThankYouPage = lazy(() => import('@/pages/donate/thank-you'))
const DonorWallPage = lazy(() => import('@/pages/donate/donor-wall'))

// Shop
const ShopPage = lazy(() => import('@/pages/shop/index'))
const ProductDetailPage = lazy(() => import('@/pages/shop/product-detail'))
const CartPage = lazy(() => import('@/pages/shop/cart'))
const CheckoutPage = lazy(() => import('@/pages/shop/checkout'))
const OrderConfirmationPage = lazy(() => import('@/pages/shop/order-confirmation'))
const OrdersPage = lazy(() => import('@/pages/shop/orders'))
const OrderDetailPage = lazy(() => import('@/pages/shop/order-detail'))

// Admin - Merch
const AdminMerchPage = lazy(() => import('@/pages/admin/merch/index'))

// Admin - Dashboards & Management
const AdminDashboardPage = lazy(() => import('@/pages/admin/index'))
const AdminCollectivesPage = lazy(() => import('@/pages/admin/collectives'))
const AdminCollectiveDetailPage = lazy(() => import('@/pages/admin/collective-detail'))
const AdminUsersPage = lazy(() => import('@/pages/admin/users'))
const AdminEventsPage = lazy(() => import('@/pages/admin/events'))
const AdminSurveysPage = lazy(() => import('@/pages/admin/surveys'))
const AdminApplicationsPage = lazy(() => import('@/pages/admin/applications'))
const AdminCreateSurveyPage = lazy(() => import('@/pages/admin/create-survey'))
const AdminAuditLogPage = lazy(() => import('@/pages/admin/audit-log'))
const AdminEmailPage = lazy(() => import('@/pages/admin/email'))
const AdminInsightsPage = lazy(() => import('@/pages/admin/insights'))
const AdminWorkflowsPage = lazy(() => import('@/pages/admin/workflows'))
const AdminCreatePage = lazy(() => import('@/pages/admin/create'))
const DevToolsPage = lazy(() => import('@/pages/admin/dev-tools'))
const AdminPartnersPage = lazy(() => import('@/pages/admin/partners'))
const AdminChallengesPage = lazy(() => import('@/pages/admin/challenges'))
const ModerationQueuePage = lazy(() => import('@/pages/admin/moderation/index'))
const AdminContactsPage = lazy(() => import('@/pages/admin/contacts'))
const AdminLegalPagesPage = lazy(() => import('@/pages/admin/legal-pages'))
// /admin/impact, /admin/metrics, /admin/reports, /admin/exports redirect to
// /admin/insights with a hash anchor (single canonical analytics surface).
const AdminPhotosPage = lazy(() => import('@/pages/admin/photos'))

// Admin Development (L&D)
const AdminDevelopmentPage = lazy(() => import('@/pages/admin/development/index'))
const AdminCreateModulePage = lazy(() => import('@/pages/admin/development/create-module'))
const AdminEditModulePage = lazy(() => import('@/pages/admin/development/edit-module'))
const AdminModuleDetailPage = lazy(() => import('@/pages/admin/development/module-detail'))
const AdminCreateSectionPage = lazy(() => import('@/pages/admin/development/create-section'))
const AdminEditSectionPage = lazy(() => import('@/pages/admin/development/edit-section'))
const AdminCreateQuizPage = lazy(() => import('@/pages/admin/development/create-quiz'))
const AdminEditQuizPage = lazy(() => import('@/pages/admin/development/edit-quiz'))
const AdminDevResultsPage = lazy(() => import('@/pages/admin/development/results'))

// Contact, Partners, Leadership
const ContactPage = lazy(() => import('@/pages/contact'))
const PartnersPage = lazy(() => import('@/pages/partners'))
const LeadershipPage = lazy(() => import('@/pages/leadership'))
const LeadACollectivePage = lazy(() => import('@/pages/lead-a-collective'))

// Leader Dashboard & sub-pages
const LeaderDashboardPage = lazy(() => import('@/pages/leader/index'))
const LeaderEventsPage = lazy(() => import('@/pages/leader/events'))
const LeaderTasksPage = lazy(() => import('@/pages/leader/tasks'))
const LeaderReportsPage = lazy(() => import('@/pages/reports/index'))
const LeaderFeedbackPage = lazy(() => import('@/pages/leader/feedback'))

// Learner pages (My Leadership Journey)
const LearnIndexPage = lazy(() => import('@/pages/learn/index'))
const LearnModulePage = lazy(() => import('@/pages/learn/module'))
const LearnSectionPage = lazy(() => import('@/pages/learn/section'))
const LearnQuizPage = lazy(() => import('@/pages/learn/quiz'))
const LearnCompletePage = lazy(() => import('@/pages/learn/complete'))

// Reports & National Impact
const ReportsPage = lazy(() => import('@/pages/reports/index'))
const NationalImpactPage = lazy(() => import('@/pages/impact/national'))

/* ------------------------------------------------------------------ */
/*  Eager preload moved to useRolePrefetch hook (role-aware).          */
/*  Downloads the user's top 5 pages first based on their role,        */
/*  then remaining common pages. See hooks/use-role-prefetch.ts.       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Loading fallback                                                   */
/* ------------------------------------------------------------------ */

function PageFallback() {
  // Minimal shimmer that matches the page background  prevents
  // jarring blank flashes while lazy chunks download.
  // The opacity animation is CSS-only (no JS) for zero overhead.
  return (
    <div data-eos-id="src/App.tsx#0"
      className="flex-1 flex flex-col min-h-0 bg-surface-1 animate-pulse"
      style={{ opacity: 0.4 }}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Bare routes (no app shell chrome)                                  */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Catch-all (unknown routes)                                         */
/*  Authed members get a real 404; logged-out visitors get Welcome.    */
/*  QA P3-4: the old catch-all always rendered Welcome, which looked   */
/*  like being signed out to authed users on any typo'd URL.           */
/* ------------------------------------------------------------------ */

function CatchAllRoute() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  return (
    <AppShell data-eos-id="src/App.tsx#1" bare>
      {user ? <NotFoundPage data-eos-id="src/App.tsx#2" /> : <WelcomePage data-eos-id="src/App.tsx#3" />}
    </AppShell>
  )
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const { maintenanceMode, maintenanceMessage, forceUpdate, latestVersion, installedVersion } = useAppUpdate()
  useDeepLink()

  // Clear the chunk-reload guard after a successful mount. If the user
  // previously hit a stale-chunk reload, we reset the guard so a future
  // deploy within the same session can trigger another reload instead of
  // falling straight through to ErrorBoundary.
  useEffect(() => {
    clearChunkReloadGuard()
    // Signal "React mounted" to the index.html boot-error overlay so it
    // stops painting visibly on post-mount errors. See index.html scope
    // comment; mounted = working app, so a transient error shouldn't
    // blank the screen.
    ;(window as unknown as { __APP_MOUNTED?: boolean }).__APP_MOUNTED = true
    // Drop the index.html boot cover now that React is painting. Until this
    // runs the user sees the branded cover instead of an empty white body.
    document.getElementById('boot-splash')?.remove()
  }, [])

  const handleSplashReady = useCallback(() => {
    setShowSplash(false)
  }, [])

  if (maintenanceMode) {
    return <MaintenanceMode data-eos-id="src/App.tsx#4" message={maintenanceMessage} />
  }

  if (forceUpdate) {
    return <UpdateRequired data-eos-id="src/App.tsx#5" latestVersion={latestVersion} installedVersion={installedVersion} />
  }

  return (
    <>
    {showSplash && <SplashPage data-eos-id="src/App.tsx#6" onReady={handleSplashReady} />}
{/* Scroll management handled by Page component  saves position per
         history entry and restores on back-nav, scrolls to top for new routes */}
    <ErrorBoundary data-eos-id="src/App.tsx#7">
    <Suspense data-eos-id="src/App.tsx#8" fallback={<PageFallback data-eos-id="src/App.tsx#9" />}>
      {/* Page enter/exit transitions are scoped to the <Outlet/> INSIDE each
          persistent layout shell (AppShell / AdminLayout / LeaderLayout) via
          AnimatedOutlet, NOT keyed around the whole <Routes>. Keying <Routes>
          by pathname remounted the layout shells on every nav and reset the
          sidebar scroll to 0 (2026-06-22 bug). React Router now reconciles the
          shells by type and keeps the sidebar mounted across navigation. */}
      <Routes data-eos-id="src/App.tsx#10">
        {/* ---- Bare routes (no app shell) ---- */}
        <Route data-eos-id="src/App.tsx#11"
          path="/welcome"
          element={
            <AppShell data-eos-id="src/App.tsx#12" bare>
              <WelcomePage data-eos-id="src/App.tsx#13" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#14"
          path="/signup"
          element={
            <AppShell data-eos-id="src/App.tsx#15" bare>
              <SignUpPage data-eos-id="src/App.tsx#16" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#17"
          path="/login"
          element={
            <AppShell data-eos-id="src/App.tsx#18" bare>
              <LoginPage data-eos-id="src/App.tsx#19" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#20"
          path="/forgot-password"
          element={
            <AppShell data-eos-id="src/App.tsx#21" bare>
              <ForgotPasswordPage data-eos-id="src/App.tsx#22" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#23"
          path="/verify-email"
          element={
            <AppShell data-eos-id="src/App.tsx#24" bare>
              <EmailVerificationPage data-eos-id="src/App.tsx#25" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#26"
          path="/auth/callback"
          element={
            <AppShell data-eos-id="src/App.tsx#27" bare>
              <AuthCallbackPage data-eos-id="src/App.tsx#28" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#29"
          path="/reset-password"
          element={
            <AppShell data-eos-id="src/App.tsx#30" bare>
              <ResetPasswordPage data-eos-id="src/App.tsx#31" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#32"
          path="/suspended"
          element={
            <AppShell data-eos-id="src/App.tsx#33" bare>
              <SuspendedAccountPage data-eos-id="src/App.tsx#34" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#35"
          path="/accept-terms"
          element={
            <AppShell data-eos-id="src/App.tsx#36" bare>
              <AcceptTermsPage data-eos-id="src/App.tsx#37" />
            </AppShell>
          }
        />

        {/* ---- Onboarding (auth required, bare shell) ---- */}
        <Route data-eos-id="src/App.tsx#38"
          path="/onboarding"
          element={
            <RequireAuth data-eos-id="src/App.tsx#39">
              <AppShell data-eos-id="src/App.tsx#40" bare>
                <OnboardingPage data-eos-id="src/App.tsx#41" />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route data-eos-id="src/App.tsx#42"
          path="/leader-welcome"
          element={
            <RequireAuth data-eos-id="src/App.tsx#43">
              <AppShell data-eos-id="src/App.tsx#44" bare>
                <LeaderWelcomePage data-eos-id="src/App.tsx#45" />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route data-eos-id="src/App.tsx#46"
          path="/welcome-back"
          element={
            <RequireAuth data-eos-id="src/App.tsx#47">
              <AppShell data-eos-id="src/App.tsx#48" bare>
                <WelcomeBackPage data-eos-id="src/App.tsx#49" />
              </AppShell>
            </RequireAuth>
          }
        />

        {/* ============================================================ */}
        {/*  Protected routes - AppShell mounted ONCE via layout route    */}
        {/* ============================================================ */}
        <Route data-eos-id="src/App.tsx#50" element={<RequireAuth data-eos-id="src/App.tsx#51"><AppShell data-eos-id="src/App.tsx#52"><AnimatedOutlet data-eos-id="src/App.tsx#53" /></AppShell></RequireAuth>}>

          {/* ---- Member pages (animated by AnimatedOutlet in AppShell) ---- */}
          <Route data-eos-id="src/App.tsx#54" path="/" element={<ErrorBoundary data-eos-id="src/App.tsx#55"><HomePage data-eos-id="src/App.tsx#56" /></ErrorBoundary>} />
          {/* Canonical home is /, never /home (stale links / deep-link fallbacks). */}
          <Route data-eos-id="src/App.tsx#57" path="/home" element={<Navigate data-eos-id="src/App.tsx#58" to="/" replace />} />
          <Route data-eos-id="src/App.tsx#59" path="/explore" element={<ExplorePage data-eos-id="src/App.tsx#60" />} />
          <Route data-eos-id="src/App.tsx#61" path="/events" element={<Navigate data-eos-id="src/App.tsx#62" to="/explore" replace />} />
          <Route data-eos-id="src/App.tsx#63" path="/events/create" element={<CreateEventPage data-eos-id="src/App.tsx#64" />} />
          <Route data-eos-id="src/App.tsx#65" path="/events/:id" element={<ErrorBoundary data-eos-id="src/App.tsx#66"><EventDetailPage data-eos-id="src/App.tsx#67" /></ErrorBoundary>} />
          <Route data-eos-id="src/App.tsx#68" path="/events/:id/check-in" element={<CheckInPage data-eos-id="src/App.tsx#69" />} />
          <Route data-eos-id="src/App.tsx#70" path="/events/:id/profile-survey" element={<ProfileSurveyPage data-eos-id="src/App.tsx#71" />} />
          <Route data-eos-id="src/App.tsx#72" path="/events/:id/day" element={<EventDayPage data-eos-id="src/App.tsx#73" />} />
          <Route data-eos-id="src/App.tsx#74" path="/events/:id/impact" element={<ErrorBoundary data-eos-id="src/App.tsx#75"><LogImpactPage data-eos-id="src/App.tsx#76" /></ErrorBoundary>} />
          <Route data-eos-id="src/App.tsx#77" path="/events/:id/survey" element={<PostEventSurveyPage data-eos-id="src/App.tsx#78" />} />
          <Route data-eos-id="src/App.tsx#79" path="/events/:id/edit" element={<EditEventPage data-eos-id="src/App.tsx#80" />} />
          <Route data-eos-id="src/App.tsx#81" path="/events/:id/ticket-confirmation" element={<TicketConfirmationPage data-eos-id="src/App.tsx#82" />} />
          <Route data-eos-id="src/App.tsx#83" path="/collectives" element={<Navigate data-eos-id="src/App.tsx#84" to="/explore?tab=collectives" replace />} />
          <Route data-eos-id="src/App.tsx#85" path="/collectives/:slug" element={<CollectiveDetailPage data-eos-id="src/App.tsx#86" />} />
          <Route data-eos-id="src/App.tsx#87" path="/collectives/:slug/manage" element={<CollectiveManagePage data-eos-id="src/App.tsx#88" />} />
          <Route data-eos-id="src/App.tsx#89" path="/tasks" element={<TasksPage data-eos-id="src/App.tsx#90" />} />
          <Route data-eos-id="src/App.tsx#91" path="/chat" element={<ChatListPage data-eos-id="src/App.tsx#92" />} />
          <Route data-eos-id="src/App.tsx#93" path="/chat/channel/:channelId" element={<ErrorBoundary data-eos-id="src/App.tsx#94"><ChatRoomPage data-eos-id="src/App.tsx#95" /></ErrorBoundary>} />
          <Route data-eos-id="src/App.tsx#96" path="/chat/:collectiveId" element={<ErrorBoundary data-eos-id="src/App.tsx#97"><ChatRoomPage data-eos-id="src/App.tsx#98" /></ErrorBoundary>} />
          <Route data-eos-id="src/App.tsx#99" path="/profile" element={<ProfilePage data-eos-id="src/App.tsx#100" />} />
          <Route data-eos-id="src/App.tsx#101" path="/profile/edit" element={<EditProfilePage data-eos-id="src/App.tsx#102" />} />
          <Route data-eos-id="src/App.tsx#103" path="/profile/tickets" element={<MyTicketsPage data-eos-id="src/App.tsx#104" />} />
          <Route data-eos-id="src/App.tsx#105" path="/profile/:userId" element={<ViewProfilePage data-eos-id="src/App.tsx#106" />} />
          <Route data-eos-id="src/App.tsx#107" path="/impact" element={<Navigate data-eos-id="src/App.tsx#108" to="/profile" replace />} />
          <Route data-eos-id="src/App.tsx#109" path="/referral" element={<ReferralPage data-eos-id="src/App.tsx#110" />} />
          <Route data-eos-id="src/App.tsx#111" path="/notifications" element={<NotificationsPage data-eos-id="src/App.tsx#112" />} />
          <Route data-eos-id="src/App.tsx#113" path="/updates" element={<UpdatesPage data-eos-id="src/App.tsx#114" />} />
          <Route data-eos-id="src/App.tsx#115" path="/settings" element={<SettingsPage data-eos-id="src/App.tsx#116" />} />
          <Route data-eos-id="src/App.tsx#117" path="/settings/notifications" element={<SettingsNotificationsPage data-eos-id="src/App.tsx#118" />} />
          <Route data-eos-id="src/App.tsx#119" path="/settings/privacy" element={<SettingsPrivacyPage data-eos-id="src/App.tsx#120" />} />
          {/* 1.8.4 item 4 (fork_motzkqf5_016150) - canonical privacy lives at
              /settings/privacy; legacy deep-links from earlier builds resolve here. */}
          <Route data-eos-id="src/App.tsx#121" path="/profile/privacy" element={<Navigate data-eos-id="src/App.tsx#122" to="/settings/privacy" replace />} />
          <Route data-eos-id="src/App.tsx#123" path="/privacy/settings" element={<Navigate data-eos-id="src/App.tsx#124" to="/settings/privacy" replace />} />
          <Route data-eos-id="src/App.tsx#125" path="/settings/account" element={<SettingsAccountPage data-eos-id="src/App.tsx#126" />} />

          <Route data-eos-id="src/App.tsx#127" path="/contact" element={<ContactPage data-eos-id="src/App.tsx#128" />} />
          <Route data-eos-id="src/App.tsx#129" path="/partners" element={<PartnersPage data-eos-id="src/App.tsx#130" />} />
          <Route data-eos-id="src/App.tsx#131" path="/leadership" element={<LeadershipPage data-eos-id="src/App.tsx#132" />} />
          <Route data-eos-id="src/App.tsx#133" path="/lead-a-collective" element={<LeadACollectivePage data-eos-id="src/App.tsx#134" />} />
          <Route data-eos-id="src/App.tsx#135" path="/donate" element={<DonatePage data-eos-id="src/App.tsx#136" />} />
          <Route data-eos-id="src/App.tsx#137" path="/donate/thank-you" element={<DonateThankYouPage data-eos-id="src/App.tsx#138" />} />
          <Route data-eos-id="src/App.tsx#139" path="/donate/donors" element={<DonorWallPage data-eos-id="src/App.tsx#140" />} />
          <Route data-eos-id="src/App.tsx#141" path="/shop" element={<ShopPage data-eos-id="src/App.tsx#142" />} />
          <Route data-eos-id="src/App.tsx#143" path="/shop/cart" element={<CartPage data-eos-id="src/App.tsx#144" />} />
          <Route data-eos-id="src/App.tsx#145" path="/shop/checkout" element={<CheckoutPage data-eos-id="src/App.tsx#146" />} />
          <Route data-eos-id="src/App.tsx#147" path="/shop/order-confirmation" element={<OrderConfirmationPage data-eos-id="src/App.tsx#148" />} />
          <Route data-eos-id="src/App.tsx#149" path="/shop/orders" element={<OrdersPage data-eos-id="src/App.tsx#150" />} />
          <Route data-eos-id="src/App.tsx#151" path="/shop/orders/:orderId" element={<OrderDetailPage data-eos-id="src/App.tsx#152" />} />
          <Route data-eos-id="src/App.tsx#153" path="/shop/:slug" element={<ProductDetailPage data-eos-id="src/App.tsx#154" />} />
          <Route data-eos-id="src/App.tsx#155" path="/reports" element={<ReportsPage data-eos-id="src/App.tsx#156" />} />
          <Route data-eos-id="src/App.tsx#157" path="/impact/national" element={<NationalImpactPage data-eos-id="src/App.tsx#158" />} />

          {/* ---- My Leadership Journey (learner) ---- */}
          <Route data-eos-id="src/App.tsx#159" path="/learn" element={<LearnIndexPage data-eos-id="src/App.tsx#160" />} />
          <Route data-eos-id="src/App.tsx#161" path="/learn/module/:moduleId" element={<LearnModulePage data-eos-id="src/App.tsx#162" />} />
          <Route data-eos-id="src/App.tsx#163" path="/learn/section/:sectionId" element={<LearnSectionPage data-eos-id="src/App.tsx#164" />} />
          <Route data-eos-id="src/App.tsx#165" path="/learn/quiz/:quizId" element={<LearnQuizPage data-eos-id="src/App.tsx#166" />} />
          <Route data-eos-id="src/App.tsx#167" path="/learn/complete" element={<LearnCompletePage data-eos-id="src/App.tsx#168" />} />

          {/* ---- Leader Dashboard & sub-pages ---- */}
          <Route data-eos-id="src/App.tsx#169" path="/leader" element={<RequireLeaderAccess data-eos-id="src/App.tsx#170"><ErrorBoundary data-eos-id="src/App.tsx#171"><LeaderLayoutRoute data-eos-id="src/App.tsx#172" /></ErrorBoundary></RequireLeaderAccess>}>
            <Route data-eos-id="src/App.tsx#173" index element={<LeaderDashboardPage data-eos-id="src/App.tsx#174" />} />
            {/* Canonical home is /leader, never /leader/home (stale links / notifications). */}
            <Route data-eos-id="src/App.tsx#175" path="home" element={<Navigate data-eos-id="src/App.tsx#176" to="/leader" replace />} />
            <Route data-eos-id="src/App.tsx#177" path="events" element={<LeaderEventsPage data-eos-id="src/App.tsx#178" />} />
            <Route data-eos-id="src/App.tsx#179" path="tasks" element={<LeaderTasksPage data-eos-id="src/App.tsx#180" />} />
            <Route data-eos-id="src/App.tsx#181" path="feedback" element={<LeaderFeedbackPage data-eos-id="src/App.tsx#182" />} />
            <Route data-eos-id="src/App.tsx#183" path="reports" element={<LeaderReportsPage data-eos-id="src/App.tsx#184" />} />
          </Route>

          {/* ---- Admin routes (manager+) - 1.8.5 item 7, fork_moy0xmrx_158384.
              Tate verbatim 16:44 AEST 9 May 2026: "leaders can't see or access
              admin pages." Global 'leader' (national_leader alias) and below
              are denied; managers + admins only.
              Defence-in-depth: also gated by per-page <RequireCapability> +
              capability resolver in capabilities.ts (leader caps now empty)
              + RLS is_admin_tier() helper in 20260509300000_admin_rls_audit.sql. */}
          <Route data-eos-id="src/App.tsx#185" path="/admin" element={<RequireRole data-eos-id="src/App.tsx#186" minRole="manager"><ErrorBoundary data-eos-id="src/App.tsx#187"><AdminLayoutRoute data-eos-id="src/App.tsx#188" /></ErrorBoundary></RequireRole>}>
            <Route data-eos-id="src/App.tsx#189" index element={<AdminDashboardPage data-eos-id="src/App.tsx#190" />} />
            {/* Canonical home is /admin, never /admin/home (stale links / notifications). */}
            <Route data-eos-id="src/App.tsx#191" path="home" element={<Navigate data-eos-id="src/App.tsx#192" to="/admin" replace />} />
            <Route data-eos-id="src/App.tsx#193" path="collectives" element={<RequireCapability data-eos-id="src/App.tsx#194" cap="manage_collectives"><AdminCollectivesPage data-eos-id="src/App.tsx#195" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#196" path="collectives/:collectiveId" element={<RequireCapability data-eos-id="src/App.tsx#197" cap="manage_collectives"><AdminCollectiveDetailPage data-eos-id="src/App.tsx#198" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#199" path="users" element={<RequireCapability data-eos-id="src/App.tsx#200" cap="manage_users"><AdminUsersPage data-eos-id="src/App.tsx#201" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#202" path="create" element={<RequireCapability data-eos-id="src/App.tsx#203" cap="manage_workflows"><AdminCreatePage data-eos-id="src/App.tsx#204" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#205" path="updates" element={<RequireCapability data-eos-id="src/App.tsx#206" cap="send_announcements"><AdminUpdatesPage data-eos-id="src/App.tsx#207" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#208" path="tasks" element={<RequireCapability data-eos-id="src/App.tsx#209" cap="manage_workflows"><AdminWorkflowsPage data-eos-id="src/App.tsx#210" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#211" path="events" element={<RequireCapability data-eos-id="src/App.tsx#212" cap="manage_events"><AdminEventsPage data-eos-id="src/App.tsx#213" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#214" path="events/create" element={<RequireCapability data-eos-id="src/App.tsx#215" cap="manage_events"><CreateEventPage data-eos-id="src/App.tsx#216" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#217" path="surveys" element={<RequireCapability data-eos-id="src/App.tsx#218" cap="manage_surveys"><AdminSurveysPage data-eos-id="src/App.tsx#219" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#220" path="applications" element={<RequireCapability data-eos-id="src/App.tsx#221" cap="manage_users"><AdminApplicationsPage data-eos-id="src/App.tsx#222" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#223" path="surveys/create" element={<RequireCapability data-eos-id="src/App.tsx#224" cap="manage_surveys"><AdminCreateSurveyPage data-eos-id="src/App.tsx#225" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#226" path="surveys/:id/edit" element={<RequireCapability data-eos-id="src/App.tsx#227" cap="manage_surveys"><AdminCreateSurveyPage data-eos-id="src/App.tsx#228" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#229" path="national-impact" element={<RequireCapability data-eos-id="src/App.tsx#230" cap="view_reports"><NationalImpactPage data-eos-id="src/App.tsx#231" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#232" path="email" element={<RequireCapability data-eos-id="src/App.tsx#233" cap="manage_email"><AdminEmailPage data-eos-id="src/App.tsx#234" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#235" path="audit-log" element={<RequireCapability data-eos-id="src/App.tsx#236" cap="view_audit_log"><AdminAuditLogPage data-eos-id="src/App.tsx#237" /></RequireCapability>} />
            {/* Insights is the merged surface for Impact + Attendance (Metrics) + Reports.
                The three legacy URLs redirect to the right tab via hash anchor (2026-06-10). */}
            <Route data-eos-id="src/App.tsx#238" path="insights" element={<RequireCapability data-eos-id="src/App.tsx#239" cap="view_reports"><AdminInsightsPage data-eos-id="src/App.tsx#240" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#241" path="impact" element={<Navigate data-eos-id="src/App.tsx#242" to="/admin/insights#impact" replace />} />
            <Route data-eos-id="src/App.tsx#243" path="metrics" element={<Navigate data-eos-id="src/App.tsx#244" to="/admin/insights#attendance" replace />} />
            <Route data-eos-id="src/App.tsx#245" path="reports" element={<Navigate data-eos-id="src/App.tsx#246" to="/admin/insights#reports" replace />} />
            <Route data-eos-id="src/App.tsx#247" path="exports" element={<Navigate data-eos-id="src/App.tsx#248" to="/admin/insights#reports" replace />} />
            <Route data-eos-id="src/App.tsx#249" path="photos" element={<RequireCapability data-eos-id="src/App.tsx#250" cap="view_reports"><AdminPhotosPage data-eos-id="src/App.tsx#251" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#252" path="shop" element={<RequireCapability data-eos-id="src/App.tsx#253" cap="manage_merch"><AdminMerchPage data-eos-id="src/App.tsx#254" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#255" path="partners" element={<RequireCapability data-eos-id="src/App.tsx#256" cap="manage_partners"><AdminPartnersPage data-eos-id="src/App.tsx#257" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#258" path="challenges" element={<RequireCapability data-eos-id="src/App.tsx#259" cap="manage_challenges"><AdminChallengesPage data-eos-id="src/App.tsx#260" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#261" path="moderation" element={<RequireCapability data-eos-id="src/App.tsx#262" cap="manage_content"><ModerationQueuePage data-eos-id="src/App.tsx#263" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#264" path="contacts" element={<RequireCapability data-eos-id="src/App.tsx#265" cap="manage_users"><AdminContactsPage data-eos-id="src/App.tsx#266" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#267" path="legal-pages" element={<RequireCapability data-eos-id="src/App.tsx#268" cap="manage_system"><AdminLegalPagesPage data-eos-id="src/App.tsx#269" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#270" path="dev-tools" element={<RequireCapability data-eos-id="src/App.tsx#271" cap="manage_system"><DevToolsPage data-eos-id="src/App.tsx#272" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#273" path="development" element={<RequireCapability data-eos-id="src/App.tsx#274" cap="manage_content"><AdminDevelopmentPage data-eos-id="src/App.tsx#275" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#276" path="development/modules/new" element={<RequireCapability data-eos-id="src/App.tsx#277" cap="manage_content"><AdminCreateModulePage data-eos-id="src/App.tsx#278" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#279" path="development/modules/:moduleId" element={<RequireCapability data-eos-id="src/App.tsx#280" cap="manage_content"><AdminModuleDetailPage data-eos-id="src/App.tsx#281" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#282" path="development/modules/:moduleId/edit" element={<RequireCapability data-eos-id="src/App.tsx#283" cap="manage_content"><AdminEditModulePage data-eos-id="src/App.tsx#284" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#285" path="development/sections/new" element={<RequireCapability data-eos-id="src/App.tsx#286" cap="manage_content"><AdminCreateSectionPage data-eos-id="src/App.tsx#287" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#288" path="development/sections/:sectionId/edit" element={<RequireCapability data-eos-id="src/App.tsx#289" cap="manage_content"><AdminEditSectionPage data-eos-id="src/App.tsx#290" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#291" path="development/quizzes/new" element={<RequireCapability data-eos-id="src/App.tsx#292" cap="manage_content"><AdminCreateQuizPage data-eos-id="src/App.tsx#293" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#294" path="development/quizzes/:quizId/edit" element={<RequireCapability data-eos-id="src/App.tsx#295" cap="manage_content"><AdminEditQuizPage data-eos-id="src/App.tsx#296" /></RequireCapability>} />
            <Route data-eos-id="src/App.tsx#297" path="development/results" element={<RequireCapability data-eos-id="src/App.tsx#298" cap="manage_content"><AdminDevResultsPage data-eos-id="src/App.tsx#299" /></RequireCapability>} />
          </Route>

        </Route>

        {/* ---- Legal pages (no auth required) ---- */}
        <Route data-eos-id="src/App.tsx#300"
          path="/terms"
          element={
            <AppShell data-eos-id="src/App.tsx#301" bare>
              <TermsOfServicePage data-eos-id="src/App.tsx#302" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#303"
          path="/privacy"
          element={
            <AppShell data-eos-id="src/App.tsx#304" bare>
              <PrivacyPolicyPage data-eos-id="src/App.tsx#305" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#306"
          path="/about"
          element={
            <AppShell data-eos-id="src/App.tsx#307" bare>
              <AboutPage data-eos-id="src/App.tsx#308" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#309"
          path="/accessibility"
          element={
            <AppShell data-eos-id="src/App.tsx#310" bare>
              <AccessibilityPage data-eos-id="src/App.tsx#311" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#312"
          path="/cookies"
          element={
            <AppShell data-eos-id="src/App.tsx#313" bare>
              <CookiePolicyPage data-eos-id="src/App.tsx#314" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#315"
          path="/data-policy"
          element={
            <AppShell data-eos-id="src/App.tsx#316" bare>
              <DataPolicyPage data-eos-id="src/App.tsx#317" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#318"
          path="/disclaimer"
          element={
            <AppShell data-eos-id="src/App.tsx#319" bare>
              <DisclaimerPage data-eos-id="src/App.tsx#320" />
            </AppShell>
          }
        />

        {/* ---- Public pages (no auth required) ---- */}
        <Route data-eos-id="src/App.tsx#321"
          path="/campouts"
          element={
            <AppShell data-eos-id="src/App.tsx#322" bare>
              <PublicCampoutsPage data-eos-id="src/App.tsx#323" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#324"
          path="/campouts/:type"
          element={
            <AppShell data-eos-id="src/App.tsx#325" bare>
              <CampoutTypePage data-eos-id="src/App.tsx#326" />
            </AppShell>
          }
        />
        {/* Eventbrite migration claim link. Public so it can greet signed-out
            invitees, stash the target, and send them to log in / sign up;
            after onboarding it resumes here and grants the free ticket. */}
        <Route data-eos-id="src/App.tsx#327"
          path="/claim/:eventId/:token"
          element={
            <AppShell data-eos-id="src/App.tsx#328" bare>
              <ClaimTicketPage data-eos-id="src/App.tsx#329" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#330"
          path="/event/:id"
          element={
            <AppShell data-eos-id="src/App.tsx#331" bare>
              <PublicEventPage data-eos-id="src/App.tsx#332" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#333"
          path="/check-in/:token"
          element={
            <AppShell data-eos-id="src/App.tsx#334" bare>
              <PublicCheckInPage data-eos-id="src/App.tsx#335" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#336"
          path="/collective/:slug"
          element={
            <AppShell data-eos-id="src/App.tsx#337" bare>
              <PublicCollectivePage data-eos-id="src/App.tsx#338" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#339"
          path="/download"
          element={
            <AppShell data-eos-id="src/App.tsx#340" bare>
              <DownloadPage data-eos-id="src/App.tsx#341" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#342"
          path="/account-deletion"
          element={
            <AppShell data-eos-id="src/App.tsx#343" bare>
              <AccountDeletionPage data-eos-id="src/App.tsx#344" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#345"
          path="/data-deletion"
          element={
            <AppShell data-eos-id="src/App.tsx#346" bare>
              <DataDeletionPage data-eos-id="src/App.tsx#347" />
            </AppShell>
          }
        />
        <Route data-eos-id="src/App.tsx#348"
          path="/unsubscribe"
          element={
            <AppShell data-eos-id="src/App.tsx#349" bare>
              <UnsubscribePage data-eos-id="src/App.tsx#350" />
            </AppShell>
          }
        />

        {/* Design showcase (dev only) */}
        <Route data-eos-id="src/App.tsx#351" path="/design/events" element={<EventEditorialShowcase data-eos-id="src/App.tsx#352" />} />

        {/* Catch-all: authed users get a friendly 404 (QA P3-4 - they used
            to see the logged-out Welcome screen); visitors get Welcome. */}
        <Route data-eos-id="src/App.tsx#353" path="*" element={<CatchAllRoute data-eos-id="src/App.tsx#354" />} />

      </Routes>
    </Suspense>
    </ErrorBoundary>
    </>
  )
}

export default App
