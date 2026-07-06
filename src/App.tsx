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
const AdminSitePage = lazy(() => import('@/pages/admin/site'))
// AdminImpactPage / AdminMetricsPage / AdminReportsPage are loaded via
// the AdminInsightsPage tabs wrapper since the merge (2026-06-10). The
// /admin/impact, /admin/metrics, /admin/reports, /admin/exports URLs
// redirect to /admin/insights with a hash anchor.
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
    <div
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
    <AppShell bare>
      {user ? <NotFoundPage /> : <WelcomePage />}
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
  }, [])

  const handleSplashReady = useCallback(() => {
    setShowSplash(false)
  }, [])

  if (maintenanceMode) {
    return <MaintenanceMode message={maintenanceMessage} />
  }

  if (forceUpdate) {
    return <UpdateRequired latestVersion={latestVersion} installedVersion={installedVersion} />
  }

  return (
    <>
    {showSplash && <SplashPage onReady={handleSplashReady} />}
{/* Scroll management handled by Page component  saves position per
         history entry and restores on back-nav, scrolls to top for new routes */}
    <ErrorBoundary>
    <Suspense fallback={<PageFallback />}>
      {/* Page enter/exit transitions are scoped to the <Outlet/> INSIDE each
          persistent layout shell (AppShell / AdminLayout / LeaderLayout) via
          AnimatedOutlet, NOT keyed around the whole <Routes>. Keying <Routes>
          by pathname remounted the layout shells on every nav and reset the
          sidebar scroll to 0 (2026-06-22 bug). React Router now reconciles the
          shells by type and keeps the sidebar mounted across navigation. */}
      <Routes>
        {/* ---- Bare routes (no app shell) ---- */}
        <Route
          path="/welcome"
          element={
            <AppShell bare>
              <WelcomePage />
            </AppShell>
          }
        />
        <Route
          path="/signup"
          element={
            <AppShell bare>
              <SignUpPage />
            </AppShell>
          }
        />
        <Route
          path="/login"
          element={
            <AppShell bare>
              <LoginPage />
            </AppShell>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AppShell bare>
              <ForgotPasswordPage />
            </AppShell>
          }
        />
        <Route
          path="/verify-email"
          element={
            <AppShell bare>
              <EmailVerificationPage />
            </AppShell>
          }
        />
        <Route
          path="/auth/callback"
          element={
            <AppShell bare>
              <AuthCallbackPage />
            </AppShell>
          }
        />
        <Route
          path="/reset-password"
          element={
            <AppShell bare>
              <ResetPasswordPage />
            </AppShell>
          }
        />
        <Route
          path="/suspended"
          element={
            <AppShell bare>
              <SuspendedAccountPage />
            </AppShell>
          }
        />
        <Route
          path="/accept-terms"
          element={
            <AppShell bare>
              <AcceptTermsPage />
            </AppShell>
          }
        />

        {/* ---- Onboarding (auth required, bare shell) ---- */}
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <AppShell bare>
                <OnboardingPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/leader-welcome"
          element={
            <RequireAuth>
              <AppShell bare>
                <LeaderWelcomePage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/welcome-back"
          element={
            <RequireAuth>
              <AppShell bare>
                <WelcomeBackPage />
              </AppShell>
            </RequireAuth>
          }
        />

        {/* ============================================================ */}
        {/*  Protected routes - AppShell mounted ONCE via layout route    */}
        {/* ============================================================ */}
        <Route element={<RequireAuth><AppShell><AnimatedOutlet /></AppShell></RequireAuth>}>

          {/* ---- Member pages (animated by AnimatedOutlet in AppShell) ---- */}
          <Route path="/" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
          {/* Canonical home is /, never /home (stale links / deep-link fallbacks). */}
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/events" element={<Navigate to="/explore" replace />} />
          <Route path="/events/create" element={<CreateEventPage />} />
          <Route path="/events/:id" element={<ErrorBoundary><EventDetailPage /></ErrorBoundary>} />
          <Route path="/events/:id/check-in" element={<CheckInPage />} />
          <Route path="/events/:id/profile-survey" element={<ProfileSurveyPage />} />
          <Route path="/events/:id/day" element={<EventDayPage />} />
          <Route path="/events/:id/impact" element={<ErrorBoundary><LogImpactPage /></ErrorBoundary>} />
          <Route path="/events/:id/survey" element={<PostEventSurveyPage />} />
          <Route path="/events/:id/edit" element={<EditEventPage />} />
          <Route path="/events/:id/ticket-confirmation" element={<TicketConfirmationPage />} />
          <Route path="/collectives" element={<Navigate to="/explore?tab=collectives" replace />} />
          <Route path="/collectives/:slug" element={<CollectiveDetailPage />} />
          <Route path="/collectives/:slug/manage" element={<CollectiveManagePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/chat" element={<ChatListPage />} />
          <Route path="/chat/channel/:channelId" element={<ErrorBoundary><ChatRoomPage /></ErrorBoundary>} />
          <Route path="/chat/:collectiveId" element={<ErrorBoundary><ChatRoomPage /></ErrorBoundary>} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/edit" element={<EditProfilePage />} />
          <Route path="/profile/tickets" element={<MyTicketsPage />} />
          <Route path="/profile/:userId" element={<ViewProfilePage />} />
          <Route path="/impact" element={<Navigate to="/profile" replace />} />
          <Route path="/referral" element={<ReferralPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/notifications" element={<SettingsNotificationsPage />} />
          <Route path="/settings/privacy" element={<SettingsPrivacyPage />} />
          {/* 1.8.4 item 4 (fork_motzkqf5_016150) - canonical privacy lives at
              /settings/privacy; legacy deep-links from earlier builds resolve here. */}
          <Route path="/profile/privacy" element={<Navigate to="/settings/privacy" replace />} />
          <Route path="/privacy/settings" element={<Navigate to="/settings/privacy" replace />} />
          <Route path="/settings/account" element={<SettingsAccountPage />} />

          <Route path="/contact" element={<ContactPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/leadership" element={<LeadershipPage />} />
          <Route path="/lead-a-collective" element={<LeadACollectivePage />} />
          <Route path="/donate" element={<DonatePage />} />
          <Route path="/donate/thank-you" element={<DonateThankYouPage />} />
          <Route path="/donate/donors" element={<DonorWallPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/shop/cart" element={<CartPage />} />
          <Route path="/shop/checkout" element={<CheckoutPage />} />
          <Route path="/shop/order-confirmation" element={<OrderConfirmationPage />} />
          <Route path="/shop/orders" element={<OrdersPage />} />
          <Route path="/shop/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/shop/:slug" element={<ProductDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/impact/national" element={<NationalImpactPage />} />

          {/* ---- My Leadership Journey (learner) ---- */}
          <Route path="/learn" element={<LearnIndexPage />} />
          <Route path="/learn/module/:moduleId" element={<LearnModulePage />} />
          <Route path="/learn/section/:sectionId" element={<LearnSectionPage />} />
          <Route path="/learn/quiz/:quizId" element={<LearnQuizPage />} />
          <Route path="/learn/complete" element={<LearnCompletePage />} />

          {/* ---- Leader Dashboard & sub-pages ---- */}
          <Route path="/leader" element={<RequireLeaderAccess><ErrorBoundary><LeaderLayoutRoute /></ErrorBoundary></RequireLeaderAccess>}>
            <Route index element={<LeaderDashboardPage />} />
            {/* Canonical home is /leader, never /leader/home (stale links / notifications). */}
            <Route path="home" element={<Navigate to="/leader" replace />} />
            <Route path="events" element={<LeaderEventsPage />} />
            <Route path="tasks" element={<LeaderTasksPage />} />
            <Route path="feedback" element={<LeaderFeedbackPage />} />
            <Route path="reports" element={<LeaderReportsPage />} />
          </Route>

          {/* ---- Admin routes (manager+) - 1.8.5 item 7, fork_moy0xmrx_158384.
              Tate verbatim 16:44 AEST 9 May 2026: "leaders can't see or access
              admin pages." Global 'leader' (national_leader alias) and below
              are denied; managers + admins only.
              Defence-in-depth: also gated by per-page <RequireCapability> +
              capability resolver in capabilities.ts (leader caps now empty)
              + RLS is_admin_tier() helper in 20260509300000_admin_rls_audit.sql. */}
          <Route path="/admin" element={<RequireRole minRole="manager"><ErrorBoundary><AdminLayoutRoute /></ErrorBoundary></RequireRole>}>
            <Route index element={<AdminDashboardPage />} />
            {/* Canonical home is /admin, never /admin/home (stale links / notifications). */}
            <Route path="home" element={<Navigate to="/admin" replace />} />
            <Route path="collectives" element={<RequireCapability cap="manage_collectives"><AdminCollectivesPage /></RequireCapability>} />
            <Route path="collectives/:collectiveId" element={<RequireCapability cap="manage_collectives"><AdminCollectiveDetailPage /></RequireCapability>} />
            <Route path="users" element={<RequireCapability cap="manage_users"><AdminUsersPage /></RequireCapability>} />
            <Route path="create" element={<RequireCapability cap="manage_workflows"><AdminCreatePage /></RequireCapability>} />
            <Route path="updates" element={<RequireCapability cap="send_announcements"><AdminUpdatesPage /></RequireCapability>} />
            <Route path="tasks" element={<RequireCapability cap="manage_workflows"><AdminWorkflowsPage /></RequireCapability>} />
            <Route path="events" element={<RequireCapability cap="manage_events"><AdminEventsPage /></RequireCapability>} />
            <Route path="events/create" element={<RequireCapability cap="manage_events"><CreateEventPage /></RequireCapability>} />
            <Route path="surveys" element={<RequireCapability cap="manage_surveys"><AdminSurveysPage /></RequireCapability>} />
            <Route path="applications" element={<RequireCapability cap="manage_users"><AdminApplicationsPage /></RequireCapability>} />
            <Route path="surveys/create" element={<RequireCapability cap="manage_surveys"><AdminCreateSurveyPage /></RequireCapability>} />
            <Route path="surveys/:id/edit" element={<RequireCapability cap="manage_surveys"><AdminCreateSurveyPage /></RequireCapability>} />
            <Route path="national-impact" element={<RequireCapability cap="view_reports"><NationalImpactPage /></RequireCapability>} />
            <Route path="email" element={<RequireCapability cap="manage_email"><AdminEmailPage /></RequireCapability>} />
            <Route path="audit-log" element={<RequireCapability cap="view_audit_log"><AdminAuditLogPage /></RequireCapability>} />
            {/* Insights is the merged surface for Impact + Attendance (Metrics) + Reports.
                The three legacy URLs redirect to the right tab via hash anchor (2026-06-10). */}
            <Route path="insights" element={<RequireCapability cap="view_reports"><AdminInsightsPage /></RequireCapability>} />
            <Route path="impact" element={<Navigate to="/admin/insights#impact" replace />} />
            <Route path="metrics" element={<Navigate to="/admin/insights#attendance" replace />} />
            <Route path="reports" element={<Navigate to="/admin/insights#reports" replace />} />
            <Route path="exports" element={<Navigate to="/admin/insights#reports" replace />} />
            <Route path="photos" element={<RequireCapability cap="view_reports"><AdminPhotosPage /></RequireCapability>} />
            <Route path="shop" element={<RequireCapability cap="manage_merch"><AdminMerchPage /></RequireCapability>} />
            <Route path="partners" element={<RequireCapability cap="manage_partners"><AdminPartnersPage /></RequireCapability>} />
            <Route path="challenges" element={<RequireCapability cap="manage_challenges"><AdminChallengesPage /></RequireCapability>} />
            <Route path="moderation" element={<RequireCapability cap="manage_content"><ModerationQueuePage /></RequireCapability>} />
            <Route path="contacts" element={<RequireCapability cap="manage_users"><AdminContactsPage /></RequireCapability>} />
            <Route path="legal-pages" element={<RequireCapability cap="manage_system"><AdminLegalPagesPage /></RequireCapability>} />
            <Route path="site" element={<RequireCapability cap="manage_marketing"><AdminSitePage /></RequireCapability>} />
            <Route path="dev-tools" element={<RequireCapability cap="manage_system"><DevToolsPage /></RequireCapability>} />
            <Route path="development" element={<RequireCapability cap="manage_content"><AdminDevelopmentPage /></RequireCapability>} />
            <Route path="development/modules/new" element={<RequireCapability cap="manage_content"><AdminCreateModulePage /></RequireCapability>} />
            <Route path="development/modules/:moduleId" element={<RequireCapability cap="manage_content"><AdminModuleDetailPage /></RequireCapability>} />
            <Route path="development/modules/:moduleId/edit" element={<RequireCapability cap="manage_content"><AdminEditModulePage /></RequireCapability>} />
            <Route path="development/sections/new" element={<RequireCapability cap="manage_content"><AdminCreateSectionPage /></RequireCapability>} />
            <Route path="development/sections/:sectionId/edit" element={<RequireCapability cap="manage_content"><AdminEditSectionPage /></RequireCapability>} />
            <Route path="development/quizzes/new" element={<RequireCapability cap="manage_content"><AdminCreateQuizPage /></RequireCapability>} />
            <Route path="development/quizzes/:quizId/edit" element={<RequireCapability cap="manage_content"><AdminEditQuizPage /></RequireCapability>} />
            <Route path="development/results" element={<RequireCapability cap="manage_content"><AdminDevResultsPage /></RequireCapability>} />
          </Route>

        </Route>

        {/* ---- Legal pages (no auth required) ---- */}
        <Route
          path="/terms"
          element={
            <AppShell bare>
              <TermsOfServicePage />
            </AppShell>
          }
        />
        <Route
          path="/privacy"
          element={
            <AppShell bare>
              <PrivacyPolicyPage />
            </AppShell>
          }
        />
        <Route
          path="/about"
          element={
            <AppShell bare>
              <AboutPage />
            </AppShell>
          }
        />
        <Route
          path="/accessibility"
          element={
            <AppShell bare>
              <AccessibilityPage />
            </AppShell>
          }
        />
        <Route
          path="/cookies"
          element={
            <AppShell bare>
              <CookiePolicyPage />
            </AppShell>
          }
        />
        <Route
          path="/data-policy"
          element={
            <AppShell bare>
              <DataPolicyPage />
            </AppShell>
          }
        />
        <Route
          path="/disclaimer"
          element={
            <AppShell bare>
              <DisclaimerPage />
            </AppShell>
          }
        />

        {/* ---- Public pages (no auth required) ---- */}
        <Route
          path="/campouts"
          element={
            <AppShell bare>
              <PublicCampoutsPage />
            </AppShell>
          }
        />
        <Route
          path="/campouts/:type"
          element={
            <AppShell bare>
              <CampoutTypePage />
            </AppShell>
          }
        />
        {/* Eventbrite migration claim link. Public so it can greet signed-out
            invitees, stash the target, and send them to log in / sign up;
            after onboarding it resumes here and grants the free ticket. */}
        <Route
          path="/claim/:eventId/:token"
          element={
            <AppShell bare>
              <ClaimTicketPage />
            </AppShell>
          }
        />
        <Route
          path="/event/:id"
          element={
            <AppShell bare>
              <PublicEventPage />
            </AppShell>
          }
        />
        <Route
          path="/check-in/:token"
          element={
            <AppShell bare>
              <PublicCheckInPage />
            </AppShell>
          }
        />
        <Route
          path="/collective/:slug"
          element={
            <AppShell bare>
              <PublicCollectivePage />
            </AppShell>
          }
        />
        <Route
          path="/download"
          element={
            <AppShell bare>
              <DownloadPage />
            </AppShell>
          }
        />
        <Route
          path="/account-deletion"
          element={
            <AppShell bare>
              <AccountDeletionPage />
            </AppShell>
          }
        />
        <Route
          path="/data-deletion"
          element={
            <AppShell bare>
              <DataDeletionPage />
            </AppShell>
          }
        />
        <Route
          path="/unsubscribe"
          element={
            <AppShell bare>
              <UnsubscribePage />
            </AppShell>
          }
        />

        {/* Design showcase (dev only) */}
        <Route path="/design/events" element={<EventEditorialShowcase />} />

        {/* Catch-all: authed users get a friendly 404 (QA P3-4 - they used
            to see the logged-out Welcome screen); visitors get Welcome. */}
        <Route path="*" element={<CatchAllRoute />} />

      </Routes>
    </Suspense>
    </ErrorBoundary>
    </>
  )
}

export default App
