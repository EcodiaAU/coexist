# Floating-local v2 - scenario simulations

Branch: `feat/floating-local-v2-2026-05-26` (not pushed)
Status: code complete, typecheck + 194 tests + build all green

Each scenario below traces the actual code path on the feature branch (the file/line refs are real, the data values are computed by hand from the actual helpers).

---

## What the model is

- `events.date_start` and `date_end` store the host's wall-clock as UTC. "9am 31 May Brisbane" → `2026-05-31T09:00:00.000Z`. No tz tag, no offset.
- Every renderer pins `Intl.DateTimeFormat({ timeZone: 'UTC' })` so the wall-clock comes back verbatim regardless of viewer device tz.
- Every "compare event date to now" routes through `wallClockNow()` - a Date whose UTC value equals the viewer's local clock numerals. Audit timestamps (`created_at`, `updated_at`, `logged_at`, `checked_in_at`) stay on real `Date.now()`.
- Date arithmetic on stored event dates uses `getUTCDate/setUTCDate` etc so "+N days" never crosses a DST boundary unexpectedly.

---

## Scenario 1 - Sunshine Coast admin creates a Perth event at 9am

Path: [src/pages/events/create-event.tsx](../src/pages/events/create-event.tsx) → [src/components/date-picker.tsx](../src/components/date-picker.tsx) → [src/lib/date-format.ts](../src/lib/date-format.ts)

1. Admin opens `/events/create`, picks **Sat 31 May 9:00am** in the date picker.
2. The hidden `<input type="datetime-local">` emits `"2026-05-31T09:00"`.
3. [date-picker.tsx:81](../src/components/date-picker.tsx#L81) `inputValueToDate('2026-05-31T09:00', 'datetime')` → [date-format.ts:wallClockToUtcIso](../src/lib/date-format.ts) returns `"2026-05-31T09:00:00.000Z"` → `new Date(...)` = Date with UTC = `09:00 31 May`.
4. `fields.date_start` = that Date.
5. Picker button preview ([date-picker.tsx:30](../src/components/date-picker.tsx#L30) `formatDate(date, mode)`) runs `Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ... }).format(date)` → **"31 May 2026, 9:00 am"** ✓
6. Review preview block in [create-event.tsx:1330](../src/pages/events/create-event.tsx#L1330) uses `Intl.DateTimeFormat('en-AU', { ..., timeZone: 'UTC' }).format(...)` → **"Sat, 31 May, 9:00 am"** ✓
7. Publish: [create-event.tsx:1802](../src/pages/events/create-event.tsx#L1802) `date_start: form.fields.date_start!.toISOString()` → **`"2026-05-31T09:00:00.000Z"`** stored in DB. ✓

## Scenario 2 - Viewers in different tz see the same event

Stored: `2026-05-31T09:00:00+00:00`.

- Brisbane viewer (UTC+10) opens event card / detail:
  - [date-format.ts:formatTime](../src/lib/date-format.ts) `new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso))` → **"9:00 am"** ✓
- Perth viewer (UTC+8): same formatter, same input → **"9:00 am"** ✓
- Wellington viewer (UTC+13): → **"9:00 am"** ✓

Every device displays the host's wall-clock verbatim. The event card never says "tz: AWST" or "9:00 am Perth" - the address/collective name carries the where.

## Scenario 3 - Sunshine Coast admin at 11am Saturday looks at the same event

`event.date_start = "2026-05-31T09:00:00Z"` (wall-clock 9am).

Admin device clock: Sat 31 May 11:00am Brisbane (real UTC: 01:00 UTC).

- [date-format.ts:wallClockNow](../src/lib/date-format.ts): `Date.now() - new Date().getTimezoneOffset() * 60_000`. For Brisbane: `01:00 UTC + 10h = 11:00 UTC` (a Date whose `.toISOString()` is `"2026-05-31T11:00:00.000Z"`).
- [use-events.ts:isPastEvent](../src/hooks/use-events.ts#L170):
  - `start` = `Date("...T09:00Z").getTime()` = 09:00 UTC ms
  - `end` = `start + 3h` = 12:00 UTC ms (no explicit `date_end`)
  - `now.getTime()` = 11:00 UTC ms
  - `end < now`? `12:00 < 11:00` → **false** → event is NOT past. ✓ Register CTA shown.

Same admin at 1:30pm Brisbane (real UTC 03:30, wallClockNow returns 13:30 UTC):
- `12:00 < 13:30` → **true** → event IS past. ✓ Register CTA hidden, post-event flow.

## Scenario 4 - Discover feed at 8pm Brisbane on Friday 30 May

[use-events.ts:useNearbyEvents](../src/hooks/use-events.ts) builds:
- `wcNow = wallClockNow()` → Date with UTC `2026-05-30T20:00:00Z` (8pm Friday).
- `now = wcNow.toISOString()` → `"2026-05-30T20:00:00.000Z"`
- `cutoff = stillActiveStartCutoffIso(wcNow)` → 3h before = `"2026-05-30T17:00:00.000Z"`

Supabase filter: `.or('date_end.gte.${now},and(date_end.is.null,date_start.gte.${cutoff})')`

For each candidate event:
- "Sat 31 May 9am Brisbane" (date_start `09:00Z May 31`, no end): does `09:00Z May 31 >= 17:00Z May 30`? Yes. → **included** ✓
- "Sat 31 May 9am Perth" (date_start `09:00Z May 31`, no end): same value, same logic → **included** ✓
- "Fri 30 May 6pm Brisbane" (date_start `18:00Z May 30`, no end): `18:00Z >= 17:00Z`? Yes. **included** (still in grace window - event started 2h ago) ✓
- "Fri 30 May 2pm Brisbane" (date_start `14:00Z May 30`, no end): `14:00 >= 17:00`? No. → **excluded** ✓ (ended 4h ago wall-clock)
- "Thu 29 May 9am Brisbane" (date_start `09:00Z May 29`, no end): No. → **excluded** ✓

## Scenario 5 - Recurring event fanout, weekly Sat 9am ×4

[create-event.tsx:1875](../src/pages/events/create-event.tsx#L1875) (post-fix uses `setUTCDate`):

```js
const start = new Date(form.fields.date_start!.getTime())  // Date(09:00Z 31 May)
// i = 1
start.setUTCDate(start.getUTCDate() + 7)
// getUTCDate = 31, setUTCDate(38) → rolls over to June 7, time preserved
// start is now Date(09:00Z 7 Jun)
start.toISOString() === "2026-06-07T09:00:00.000Z"
```

Iterations:
- i=1: `2026-06-07T09:00:00.000Z` (Sat 7 Jun 9am) ✓
- i=2: `2026-06-14T09:00:00.000Z` (Sat 14 Jun 9am) ✓
- i=3: `2026-06-21T09:00:00.000Z` (Sat 21 Jun 9am) ✓

Note: `setUTCDate` (not `setDate`) means DST transitions on the host machine cannot bump the wall-clock by ±1h. AEDT→AEST in April: same wall-clock "9am" preserved.

## Scenario 6 - Edit event (existing event with proper wall-clock-as-UTC data)

Path: [src/pages/events/edit-event.tsx:79-104](../src/pages/events/edit-event.tsx) → `form.resetFields({ date_start: new Date(event.date_start), ... })`.

For an event stored as `"2026-05-31T09:00:00+00:00"`:
- `new Date("2026-05-31T09:00:00+00:00")` → Date with UTC = `09:00 31 May`.
- `fields.date_start` = that Date.
- Picker `dateToInputValue(date, 'datetime')` calls `utcIsoToWallClock(date.toISOString())` → `"2026-05-31T09:00"` → set as native input value.
- Picker button preview: `formatDate(date, 'datetime')` with `timeZone: 'UTC'` → **"31 May 2026, 9:00 am"** ✓

## Scenario 7 - Day-of mode, leader rides into event at 9:30am

[event-detail.tsx:436](../src/pages/events/event-detail.tsx#L436) `isEventActive`:

```js
const start = new Date(event.date_start).getTime()  // 09:00 UTC ms
const end = event.date_end ? new Date(event.date_end).getTime() : start + 3 * 60 * 60 * 1000
const earlyWindow = start - checkinWindowMinutes * 60 * 1000  // 08:30 UTC ms (30min before)
return now >= earlyWindow && now <= end
```

At 9:30am Brisbane: `now = wallClockNow().getTime() = 09:30 UTC ms`.
- `09:30 >= 08:30`? Yes
- `09:30 <= 12:00`? Yes
- **true** → Check In Now button visible ✓

At 12:30pm Brisbane (after grace): `now = 12:30 UTC ms`. `12:30 <= 12:00`? No. → false. CTA hidden ✓.

## Scenario 8 - Multi-collective viewer in Perth opening Sydney event

Sydney admin creates event "Sun 7 Jun 6am" (early hike). Stored as `"2026-06-07T06:00:00.000Z"`.

Perth viewer (UTC+8) opens it:
- Card: `formatTime(date)` with `timeZone:'UTC'` → **"6:00 am"** ✓
- Detail: `formatEventLong(iso)` with `timeZone:'UTC'` → **"Sun, 7 Jun 2026, 6:00 am"** ✓

Perth viewer's clock says it's 6am Sun 7 Jun? No - when it's 6am Sydney it's 4am Perth real. But for the wall-clock-as-floating-local convention, the card says "6am" and the address says Sydney - Perth viewer knows "6am Sydney = 4am my time" (the 2-second mental math).

## Scenario 9 - DST boundary (Sydney admin schedules event across April 6 2026, DST end)

April 6 2026 02:00 AEDT becomes 01:00 AEST in Sydney. Stored wall-clock-as-UTC values are tz-agnostic, but Date math could trip:

- Event at `"2026-04-05T22:00:00Z"` (10pm AEDT 5 Apr wall-clock).
- Recurring +7d: `setUTCDate(5 + 7) = 12` → `"2026-04-12T22:00:00Z"` (10pm wall-clock 12 Apr). ✓
- Same with `setDate/getDate` on the host: returns local-tz, in Sydney `getDate()` on `Date(22:00Z 5 Apr)` is 6 (local 8am 6 Apr AEDT). `setDate(13)` jumps to 13 Apr local. Internally Date is now `22:00Z 13 Apr` - 1 day later than intended, NOT the +7d intent.

Switching to UTC accessors fixes this. ✓

## Scenario 10 - Leader dashboard "events this month" on first day of month at 8am

Leader in Adelaide (UTC+9:30), 1 June 8:00am ACST. Real UTC = `2026-05-31T22:30:00Z`.

[use-leader-dashboard.ts:fetchLeaderDashboard](../src/hooks/use-leader-dashboard.ts):
- `now = wallClockNow()` → Date with UTC = `2026-06-01T08:00:00Z` (viewer wall-clock "08:00 1 Jun").
- `startOfMonth = new Date(Date.UTC(2026, 5, 1, 0, 0, 0, 0)).toISOString()` → `"2026-06-01T00:00:00.000Z"` (1 June UTC midnight). ✓
- Filter: `.gte('date_start', '2026-06-01T00:00:00Z')` - counts events whose wall-clock-as-UTC stored date_start is in June. ✓

Without `wallClockNow`: leader at 8am ACST is at real UTC `22:30 prev day`. `monthStart` built from local `(year, month, 1, 0, 0, 0, 0)` would be `1 June 00:00 ACST` = `31 May 14:30 UTC` → would include any "11pm wall-clock" event on May 31 that survived migration. Edge-case noise, but the wallClockNow version is cleaner.

---

## What still needs to happen before code can ship

**This is the critical coordination piece, not a code problem.**

The new code expects events stored as wall-clock-as-UTC. Current production data is in **real-UTC encoding** (because I reverted the May 25 migration earlier today to unbreak the native app). So if I push this code without re-running the forward migration, every event in production will display +viewer-tz-offset (the same bug Jess hit before).

**Coordinated rollout required:**

1. ✋ **Do not push this feature branch yet.** Local builds work; production won't until the data migration is back in place.
2. **Ship native app build with the new code first.** Submit iOS via SY094 path, submit Android. Both reviews take 12-72h.
3. **Wait for adoption.** When 80%+ of active native users are on the new version (visible via App Store / Play Console analytics), proceed.
4. **Coordinate single deploy window** (10-15 min):
   a. Run forward migration SQL on Co-Exist Supabase:
      ```sql
      UPDATE events e SET
        date_start = ((e.date_start AT TIME ZONE coalesce(e.timezone, c.timezone, 'Australia/Sydney'))::timestamp AT TIME ZONE 'UTC'),
        date_end   = CASE WHEN e.date_end IS NULL THEN NULL ELSE ((e.date_end AT TIME ZONE coalesce(e.timezone, c.timezone, 'Australia/Sydney'))::timestamp AT TIME ZONE 'UTC') END
      FROM collectives c WHERE c.id = e.collective_id;
      ```
   b. `git push origin feat/floating-local-v2-2026-05-26:main` → Vercel auto-deploys.
   c. Verify a known event renders the same time on web (new) and native (new) and a side-by-side timezone shift.
5. **Old-version native users** (the long tail) will display +tz-shifted until they update. App store nudge / version-gate flag if you want to force upgrade.

If you want the rollout to be safe even for un-upgraded native users, add a `events.tz_encoding` column where `null` = real-UTC (legacy) and `'wall-clock'` = post-migration. Then both code paths can read both encodings during the transition. That's an extra ~1-day code add I haven't done yet - flag if you want it.

## Files changed on the feature branch

Hooks (12): `use-events.ts`, `use-event-form.ts`, `use-home-feed.ts`, `use-leader-dashboard.ts`, `use-timeline-rules.ts`, `use-tasks.ts`, `use-nearby.ts`, `use-impact-form-tasks.ts`, `use-data-prefetch.ts`, `use-collective.ts`, `use-admin-impact-observations.ts`, `use-admin-dashboard.ts`, `use-public-stats.ts`

Components (1): `date-picker.tsx`

Pages (8): `create-event.tsx`, `edit-event.tsx`, `event-detail.tsx`, `post-event-survey.tsx`, `leader/index.tsx`, `public/collective.tsx`, `onboarding/welcome-back.tsx`, `onboarding/steps/step-first-event.tsx`, `impact/national.tsx`

Lib (2): `date-format.ts` (added `wallClockNow`), `event-form-fields.tsx` (removed `timeZone` prop forwarding)

Tests (1): `event-past-window.test.ts` (rewritten to inject `now` instead of faking system time)

## Verification status

- `tsc --noEmit`: clean
- `vitest run` (full suite): 194 tests pass across 17 files
- `vitest run` (date-related subset): 42 tests pass
- `npm run build`: green (41s)
- Em-dash check on diff: 0 occurrences in new lines
- Dev server: not yet started - `npm run dev` ready to launch for manual verification

## Anti-symmetric warning

If you find me about to push this branch to main before the data migration is in place, **stop me.** That is the exact failure mode that broke production this morning.
