# Co-Exist App - CLAUDE.md

> Youth Conservation Movement | "Explore. Connect. Protect."
> CEO/Founder: Kurt Jones | coexistaus.org
> Master TODO: `D:/.code/TODO-MASTER.md` (1,083 tasks, 57 sections)

---

## WHAT THIS IS

A mobile-first app for Co-Exist Australia - a national youth-led environmental nonprofit (ages 18-30) that runs conservation events through local groups called **Collectives**. Think: the love child of Strava's social UX + GoodGym's movement model + iNaturalist's conservation data. This is not a corporate charity platform - it's a youth movement. The tech must feel like it.

---

## STACK - NON-NEGOTIABLE

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | **React + TypeScript** (Vite) | Single codebase for app + web |
| Mobile | **Capacitor** | NOT React Native. Static bundle into native shells |
| Backend | **Supabase** | Auth, Postgres, Storage, Edge Functions, Realtime. No other backend. |
| Styling | **TailwindCSS** | Custom theme config, all colours via CSS custom properties |
| State | **Zustand or Jotai** | Client state |
| Server state | **TanStack Query** | Caching, stale-while-revalidate |
| Animation | **Framer Motion** | All transitions, micro-interactions, page choreography |
| Payments | **Stripe** | Checkout for donations + merch. Subscriptions for recurring donations |
| Email | **Resend** | Transactional + marketing via Edge Functions |
| Maps | **Mapbox or Leaflet** | Custom styled pins everywhere, never default markers |
| Routing | **React Router** | SPA routing, works in Capacitor + Vercel |

### Build & Deploy Pipeline

> **Ship rule**: when a change needs to reach a device or store to matter, run the full pipeline. Don't stop at "assets generated" or "code updated" - commit, push, switch instances, pull, install, build, sync, archive, upload. If blocked, say so explicitly.

**Corazon (this Windows machine)** is where code lives: `D:/.code/coexist`. Always start here, end with `git push`.

**SY094 (Mac-in-Cloud)** is the only place iOS archives get built + uploaded to App Store Connect. Reach it via API. Signing creds are pre-configured there - don't rotate them.

#### Android ship (Corazon, end-to-end)
```
cd D:/.code/coexist
git status                      # confirm clean slate
npm install                     # only if deps changed
npm run build                   # web bundle
npx cap sync android            # copy into native shell
cd android && ./gradlew bundleRelease    # signed AAB at android/app/build/outputs/bundle/release/
# → upload AAB to Play Console → internal testing track
```
Rebuild fully after any res/ change (splash, icons) - Gradle caches res aggressively.

#### iOS ship (Corazon → SY094 handoff)
1. **On Corazon:** commit, `git push`. Both local and remote must be in sync.
2. **On SY094:**
   ```
   cd ~/projects/coexist
   git pull
   npm install
   npm run build
   npx cap sync ios
   npx cap open ios         # launches Xcode
   ```
3. **In Xcode (GUI):** scheme Co-Exist, destination "Any iOS Device (arm64)" → Product → Archive → Organizer → Distribute App → App Store Connect → Upload.
4. Verify on a real device via TestFlight before telling Tom it's shipped.

#### Web ship
Vercel auto-deploys from `git push` to `main`. SPA routing via `vercel.json` rewrites. Nothing else required.

Same React app serves all three targets. Platform detection via `Capacitor.isNativePlatform()`.

---

## PROJECT STRUCTURE

```
src/
  assets/         fonts/, icons/, images/, sounds/
  components/     Shared UI: Button, Card, Avatar, Input, Modal, BottomSheet, etc.
  features/       Feature modules (events/, collectives/, chat/, profile/, etc.)
  hooks/          useAuth, useLayout, useOffline, useRealtime, etc.
  lib/            supabase.ts, stripe.ts, constants.ts, utils.ts
  pages/          Route-level page components (lazy-loaded)
  styles/         globals.css, tailwind theme config
  types/          TypeScript types and Supabase generated types
```

### Naming Conventions
- **Files**: `kebab-case.tsx` for components, `use-kebab-case.ts` for hooks
- **Components**: `PascalCase` exports
- **Types**: `PascalCase`, suffixed with purpose (`EventCard`, `ProfileFormData`)
- **Database**: `snake_case` for tables, columns, functions
- **CSS**: Tailwind utility classes. No CSS modules. No styled-components.
- **Imports**: Always use path aliases (`@/components/Button`, `@/hooks/useAuth`)

---

## DESIGN SYSTEM - ABSOLUTE RULES

### Brand
- **Logo**: Black text wordmark on white background with sage/nature elements. Circle variant exists.
- **Tagline**: "Explore. Connect. Protect."
- **Philosophy**: "Do good, feel good"
- **Tone**: Inclusive, action-oriented, grassroots authentic. Never corporate. Never preachy.
- **Photography**: Real people, real events, documentary style. NEVER stock photos.

### Colour
- All colours defined in ONE theme config file (`src/styles/theme.ts` or `tailwind.config.ts`).
- Palette uses CSS custom properties so the entire look can be swapped by changing one file.
- Primary: sage green family. Secondary: warm earth tone. Accent: energetic CTA colour.
- Neutrals: warm greys (not cold). Never pure black `#000` for text - use charcoal.
- All combos must pass WCAG 2.1 AA contrast (4.5:1 body text, 3:1 large text).

### Typography
- Self-hosted fonts only. No Google Fonts CDN.
- Headings: bold, modern, movement feel (Satoshi, General Sans, or similar).
- Body: clean, readable (Inter, DM Sans, or similar).
- Minimum 14px body on mobile. 16px for inputs (prevents iOS zoom).

### Icons
- One library only (Lucide, Phosphor, or Heroicons). Be consistent.
- **Icons in buttons MUST be flex-centered** - `items-center justify-center gap-2`. Never padding hacks.
- Custom conservation icons for activity types (tree, wave, habitat, etc.).

### Cards - NEVER Generic
Every card must feel crafted. Specific patterns:
- **Event cards**: hero image + gradient overlay + activity badge overlapping image + warm shadow + rounded-2xl
- **Stat cards**: subtle gradient bg or glassmorphism, large bold numbers, trend arrows
- **Chat bubbles**: rounded with directional tails, sent (sage bg) vs received (neutral bg)
- No flat cards. No default shadows. Use the defined shadow tokens with warm tint.

### Shadows
- Three levels: `shadow-sm`, `shadow-md`, `shadow-lg` - all with warm tint (not cold grey).
- Card press state: `scale(0.98)` + shadow reduction. Smooth 150ms transition.

---

## MOBILE-FIRST - THIS IS THE LAW

Every screen is designed for mobile FIRST, then adapted up for tablet and desktop.

1. **Touch targets**: minimum 44x44px. No exceptions.
2. **Thumb zone**: primary actions in bottom 60% of screen.
3. **Bottom CTAs**: sticky action buttons anchor to bottom, not top.
4. **No hover states as primary interaction** - everything must work on tap.
5. **One-handed operation**: all core flows completable with one thumb.
6. **No footer in native app**. Bottom tab bar is the only persistent bottom element.
7. **Web gets a footer** (About, Privacy, Terms, socials, app download links, Aboriginal acknowledgment).
8. **Orientation**: portrait-locked in native app, flexible on web.
9. **Safe areas**: always respect notch, home indicator, camera cutout, Android nav bar.
10. **Fast tap**: `touch-action: manipulation` everywhere. No 300ms delay.

### Responsive Breakpoints
- Mobile: `<640px` - bottom tab nav, full-width
- Tablet: `640-1024px` - side nav or bottom tabs, two-column where useful
- Desktop: `>1024px` - top nav (no bottom tabs), sidebar, max-width container, multi-column

### Platform Detection
```typescript
import { Capacitor } from '@capacitor/core';
const isNative = Capacitor.isNativePlatform();
const isWeb = !isNative;
```
Use this to conditionally enable: camera, push notifications, native share, biometrics.

---

## SUPABASE PATTERNS

### Client Setup
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### Rules
- **RLS on EVERY table**. No exceptions. No `public` access without a policy.
- **Anon key only** in client code. Service role key ONLY in Edge Functions.
- **Generated types**: run `supabase gen types typescript` after every migration. Types live in `src/types/database.types.ts`.
- **Edge Functions** for: Resend emails, Stripe webhooks, PDF generation, push notifications, any server-side logic.
- **Realtime** enabled on: `chat_messages`, `notifications`, `event_registrations`, `posts`, `global_announcements`.
- **PostGIS** for all location data. Store as `geography(Point, 4326)`. Query with `ST_DWithin` for distance.
- **Storage buckets**: public for avatars/event-images/merch, authenticated for chat-images/voice/video.
- **Image transforms**: always use Supabase transforms for thumbnails (200x200), medium (600x600), large (1200x1200). Never serve full-res to mobile.

### Data Fetching Pattern
```typescript
// Always use TanStack Query for data fetching
const { data, isLoading, error } = useQuery({
  queryKey: ['events', collectiveId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('collective_id', collectiveId);
    if (error) throw error;
    return data;
  },
  staleTime: 5 * 60 * 1000, // 5 min
});
```

### Realtime Pattern
```typescript
// Subscribe to collective chat
useEffect(() => {
  const channel = supabase.channel(`chat:${collectiveId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `collective_id=eq.${collectiveId}`,
    }, (payload) => {
      queryClient.setQueryData(['chat', collectiveId], (old) => [...old, payload.new]);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [collectiveId]);
```

### Mutation Pattern
```typescript
const registerForEvent = useMutation({
  mutationFn: async (eventId: string) => {
    const { error } = await supabase
      .from('event_registrations')
      .insert({ event_id: eventId, user_id: user.id, status: 'registered' });
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    queryClient.invalidateQueries({ queryKey: ['my-events'] });
    toast.success("You're registered!");
  },
});
```

---

## ROLES & PERMISSIONS

7 roles, two scopes:

**Global roles** (on `profiles.role`):
| Role | Access |
|------|--------|
| `participant` | Default. Standard app features. |
| `national_leader` | Admin dashboard with granular permissions via `staff_roles` table. |
| `manager` | Manages assigned collectives (set via `staff_roles.managed_collectives`). Has most admin capabilities scoped to their collectives. |
| `admin` | Everything + staff management + impersonation + feature flags. Sees all collectives. |

**Collective roles** (on `collective_members.role`):
| Role | Access |
|------|--------|
| `member` | View, chat, register for events. |
| `assist_leader` | + Moderate chat (pin/delete/mute), help with check-ins. |
| `co_leader` | + Create events, manage members. |
| `leader` | + Full collective management, assign roles. |

A user can be in **multiple collectives** with different roles in each.

### Auth Hook
```typescript
const { user, profile, role, isLeader, isAssistLeader, isStaff, isAdmin, isSuperAdmin } = useAuth();
```

### Role Gate
```tsx
<RoleGate minRole="leader" collectiveId={id}>
  <EventCreateButton />
</RoleGate>
```

### Route Guard
```tsx
<Route path="/admin/*" element={<RequireRole minRole="national_leader"><AdminLayout /></RequireRole>} />
```

---

## ANIMATION & INTERACTION RULES

### Timing
| Category | Duration | Examples |
|----------|----------|---------|
| Fast | 150ms | Tap feedback, toggles, tab switch |
| Normal | 250ms | Page transitions, reveals, toasts |
| Slow | 400ms | Bottom sheets, complex transitions |
| Celebration | 800-1200ms | Badge unlock, tier up, confetti |

### Easing
- Entrances: `ease-out`
- Exits: `ease-in`
- Transitions: `ease-in-out`
- Bouncy: `{ type: "spring", stiffness: 300, damping: 20 }`

### Core Patterns
- **Page push**: slide from right (250ms)
- **Tab switch**: crossfade (150ms)
- **Bottom sheet**: spring slide-up with slight overshoot
- **Card press**: `scale(0.98)` + shadow reduce (150ms)
- **List items**: staggered fade-in, 30ms between items
- **Stat counters**: count-up on load, sequenced left to right
- **Skeleton loading**: shimmer. Never blank screens. Never spinners for initial loads.
- **Confetti**: on check-in, badge unlock, tier up - particles only
- **Always respect `prefers-reduced-motion`** - disable all non-essential animation

### Shared Element Transitions
- Event card → Event detail: card image expands into hero
- Avatar tap → Profile: avatar grows into header position
- Badge grid → Badge detail: icon expands into modal centre

### Sound (Optional)
- Gated behind settings toggle + system silent mode
- <50KB each. Lazy loaded.
- Check-in: wooden chime. Badge: ascending tone. Send message: whoosh. Error: soft bonk.

### Haptics
- Pruned to discrete-intentional-gesture confirmation only. Kept on long-press
  (`use-long-press.ts`, Web Vibration API, Android-only). Removed from tab
  navigation, message-reaction taps, and any decorative tap/scroll feedback.
- Do not add Haptics.impact / @capacitor/haptics back unless the trigger is a
  critical CTA, an error/destructive confirmation, or a scan/capture success.

---

## COMPONENT PATTERNS

### Every component must:
1. Accept `className` prop for Tailwind overrides
2. Be typed with explicit props interface
3. Handle loading state (skeleton variant)
4. Handle empty state where applicable
5. Work at all breakpoints
6. Have accessible labels (aria-label, role, alt text)
7. Respect `prefers-reduced-motion`

### Button
```tsx
<Button variant="primary" size="md" icon={<TreeIcon />} loading={isSubmitting}>
  Register
</Button>
```
Icons ALWAYS flex-centered: `flex items-center justify-center gap-2`.

### Page Layout
```tsx
export default function EventDetailPage() {
  const { id } = useParams();
  const { data, isLoading } = useEventDetail(id);

  if (isLoading) return <EventDetailSkeleton />;
  if (!data) return <EmptyState type="event-not-found" />;

  return (
    <Page header={<Header title={data.title} back />}>
      {/* content */}
      <StickyBottomCTA>
        <Button variant="primary" size="lg" fullWidth>Register</Button>
      </StickyBottomCTA>
    </Page>
  );
}
```

### Empty State - Always Actionable
```tsx
<EmptyState
  illustration="no-events"
  title="No upcoming events"
  description="Check back soon or explore collectives near you"
  action={{ label: "Explore Collectives", to: "/explore" }}
/>
```
Never just "No items found." Every empty state guides the user somewhere useful.

### Error Boundary
```tsx
<ErrorBoundary fallback={<ErrorScreen onRetry={() => window.location.reload()} />}>
  <App />
</ErrorBoundary>
```
On every route. Catch, show branded error screen, auto-report to Sentry.

---

## COHESIVE EXPERIENCE PRINCIPLES

These are not optional polish - they are the architecture of the experience.

### No Dead Ends
- Every entity is tappable everywhere (event name in chat → event detail, user avatar → profile, badge anywhere → badge detail)
- Every completion suggests the next step ("What's next?" prompts after check-in, badge earn, donation, etc.)
- Every empty state has a specific, relevant CTA

### Consistent Patterns Everywhere
- Pull-to-refresh on every scrollable list
- Swipe-to-action (swipe left on event → cancel, notification → mark read, message → reply)
- Long-press for contextual actions
- Destructive actions always use same confirmation bottom sheet with red button
- Loading: skeleton → content. Never blank. Never blocking.
- Small wins → toast. Medium wins → card. Big wins → full-screen celebration.
- Scroll position memory - returning to a list preserves position

### Feature Pipelines (Automatic Chains)
- **Event → Impact → Stats → Badge**: attending auto-updates stats, which auto-checks badge criteria, which auto-triggers celebration
- **Event → Photo → Feed**: photos at events auto-suggest posting to feed
- **Chat ↔ Events**: new events auto-post to collective chat as rich cards
- **QR check-in → instant gratification chain**: scan → checked in → points animation → badge earned → share card

### Progressive Disclosure
- New users see simplified home feed (discovery focus, onboarding CTAs)
- Active users (5+ events) see impact stats, leaderboard, challenges
- Power users (20+ events) see referral tools, leadership opportunities, advanced stats
- New leaders get guided tooltips, not a jarring layout change

### Contextual Intelligence
- Event day: home screen shows countdown, directions, check-in button
- Post-event: photo sharing CTA, survey nudge, impact summary
- Smart pre-fills: event creation from collective defaults, impact from activity type
- Badge proximity: "2 events away from Shore Keeper!" on relevant event cards

---

## PERFORMANCE TARGETS

| Metric | Target |
|--------|--------|
| Initial load (LCP) | <3s on 4G |
| Subsequent navigation | <1s |
| Lighthouse Performance | >90 |
| Lighthouse Accessibility | >95 |
| Initial JS bundle | <2MB |
| Total with lazy chunks | <5MB |
| Image delivery | Always transforms, never full-res on mobile |
| Lists | Virtual scroll for >50 items |
| Realtime | Unsubscribe from channels not in view |

Every page lazy-loaded:
```typescript
const EventDetailPage = lazy(() => import('@/pages/events/event-detail'));
```

---

## GIT & WORKFLOW

- **Branch strategy**: `main` (production → Vercel) → `develop` (staging) → `feature/*`
- **Commits**: conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`)
- **PRs**: always into `develop` first, then `develop` → `main` for release
- **Migrations**: Supabase CLI, committed to `supabase/migrations/`
- **Env vars**: `.env.local` (dev), `.env.production` (prod). Never commit secrets.

---

## KEY DOMAIN CONCEPTS

| Term | Meaning |
|------|---------|
| **Collective** | A local volunteer group in a geographic area (e.g. "Byron Bay Collective"). Has leader, co-leaders, assist-leaders, members. |
| **Event** | A conservation activity run by a collective. Has registration, check-in, impact logging. Can be co-hosted with external organisations. |
| **Impact** | Measurable conservation outcome: trees planted, rubbish collected, hours volunteered, area restored, species planted. Logged by leaders post-event via in-app form. |
| **Badge** | Achievement earned by meeting criteria. |
| **Tier** | Membership level: Seedling → Sapling → Native → Canopy → Elder. |
| **Challenge** | Time-bound national campaign with collective/individual goals. |
| **Announcement** | Broadcast from staff to users/leaders/collectives. Connected to notifications. |
| **Impact Logging** | The in-app form leaders/assist-leaders fill out after an event - activity-specific fields, photos, before/after evidence, species tracking, GPS polygon. This is a core flow, not an afterthought. |

---

## WHAT NOT TO DO

- **No CSS modules or styled-components.** Tailwind only.
- **No SSR.** SPA (Vite) → static bundle for Capacitor + Vercel.
- **No separate admin app.** Admin is routes within same app, behind role gates.
- **No REST API layer.** Supabase client direct (with RLS). Edge Functions for server-only logic.
- **No `any` types.** Supabase generated types everywhere.
- **No default map markers.** Always custom Co-Exist branded pins.
- **No stock photography.** Illustrations or real Co-Exist photos.
- **No footer in native app.** Web footer only.
- **No hover-only interactions.** Everything works on tap.
- **No blocking spinners.** Skeletons for loads, inline spinners for actions, optimistic updates for instant feel.
- **No dead-end screens.** Every empty state, error, completion guides to next action.
- **No pure black (#000).** Warm charcoal for text.
- **No cold greys.** Warm-tinted neutrals only.
- **No generic UI.** Every surface must feel crafted.
- **No padding-based icon centering.** Flexbox only.
- **No arbitrary colour values inline.** All from theme config.
- **No uncaught errors.** Error boundaries on every route.
- **No features without loading + empty + error states.** All three, always.

---

## CONTEXT FOR CLAUDE

- The founder/CEO is **Kurt Jones**. The developer (me) is his best friend. We'll refer to him as Kurt.
- Co-Exist is an **Australian registered charity**. ACNC reporting obligations. Potential DGR status for tax-deductible donations.
- The website (coexistaus.org) is on Squarespace - the app replaces their fragmented tools.
- Current stats: **5,500 volunteers, 13 collectives, 35,500 native plants, 4,900 kg litter removed**.
- Socials: **@coexistaus** on Instagram and Facebook. Contact: hello@coexistaus.org
- Aboriginal and Torres Strait Islander acknowledgment in About page + web footer. Important to the org.
- Target audience: **18-30 year olds**. Digitally native. Expect consumer-grade UX. If it feels like enterprise software, we've failed.
- The master TODO at **`D:/.code/TODO-MASTER.md`** is the single source of truth for all tasks (1,083 items, 57 sections).
- **Southern Hemisphere** - Summer is Dec-Feb, Winter is Jun-Aug. All seasonal UI and campaigns follow this.
- **Impact logging is core** - leaders/assist-leaders fill out detailed in-app forms post-event with activity-specific fields, photos, species, GPS data. This is what makes the data valuable for charity reporting, grant applications, and advocacy. Treat it as a first-class feature, not admin busywork.
- The app should feel like **joining a movement, not signing up for a service**. Every interaction should reinforce belonging, progress, and real-world impact.
