# Post-event check-in (backfill until impact logged)

Date: 2026-05-20
Status: approved, building
Origin: Jess (Co-Exist) - "where should we make it that you can check people in
after the event? currently the check ins close once the events done but if they
lose wifi at the event and can't do it till after or if the partner org does a
sign in sheet then we could add it in after."

## Problem

Check-in slams shut the moment the event's calendar day (AEST) passes. This is
enforced in five places:

- Frontend `isEventToday` gate in `src/pages/events/event-day.tsx` (check-in
  button disabled, walk-in add-and-check-in blocked, uncheck hidden, banner).
- `trg_enforce_event_day_check_in` trigger on `event_registrations`.
- `trg_enforce_walk_in_day_window` trigger on `event_walk_ins`.
- Date guard in the `public-event-check-in` Edge Function (QR path).

The gate was built deliberately on 9 May 2026 after a Brisbane leader checked
someone into TOMORROW's event. The dangerous mistake it prevents is FUTURE
check-in (marking attendance before someone has shown up). Jess needs the
opposite: backfilling the PAST (people did show; the record could not be made in
time - lost wifi, or a partner org ran a paper sign-in sheet transcribed later).

That asymmetry is the key: we can open the past without re-opening the future.

## Decisions (Tate, 2026-05-20)

- Window model: lifecycle, not a clock. Check-in stays open after the event
  UNTIL impact data is logged for that event.
- Who: leaders + admins only. Participant self check-in (3-digit code) and the
  public QR form stay day-of only.
- Canonical "impact logged" signal: existence of an `event_impact` row (the
  `events.status = 'completed'` flip is a best-effort side effect; the row is the
  source of truth). Both the UI and the DB triggers test the same signal.

## Window matrix

| When | Self check-in (code / public QR) | Leader/admin check-in + walk-ins |
|---|---|---|
| Before event day (future) | Blocked | Blocked (preserves 9-May fix) |
| Event day | Open (unchanged) | Open (unchanged) |
| After event day, impact NOT logged | Closed | OPEN - backfill window (new) |
| After event day, impact logged | Closed | Closed (attendance final) |

## Changes

### 1. Shared predicate - `src/lib/date-format.ts`
`isCheckInOpenForLeader(eventDateStartIso, timeZone, impactLogged)`:
- no date -> false
- future (event day > today AEST) -> false
- today -> true
- past -> `!impactLogged`

`isEventToday` and participant-facing `isSignInButtonVisible` are unchanged.

### 2. Leader dashboard - `src/pages/events/event-day.tsx`
- Fetch `impactLogged` via `useEventImpact(eventId)` (row exists).
- Replace the `isEventToday` gate on: check-in button enable, `handleCheckIn`,
  `handleUncheckRequest`, `handleAddAndCheckIn`, walk-in - with
  `isCheckInOpenForLeader(...)`.
- Context-aware banner replacing "Check-in opens day of event":
  - future -> "Check-in opens on event day"
  - past + open -> "Post-event backfill - check-ins stay open until you log
    impact data for this event."
  - past + impact logged -> "Check-in closed - impact has been logged for this
    event."
- AttendeeRow uncheck button + check-in button gate on the new predicate
  (rename the `isEventToday` prop to `checkInOpen`).

### 3. DB triggers - new migration `20260520000000_post_event_checkin_backfill.sql`
Rewrite `enforce_event_day_check_in_window()` (event_registrations):
- service_role bypass (unchanged).
- detect attended-in / attended-out; no-op transitions pass (unchanged).
- future (event_date_local > today_aest) -> RAISE (blocked).
- today -> allow.
- past:
  - if `EXISTS (SELECT 1 FROM event_impact WHERE event_id = NEW.event_id)`
    -> RAISE 'Check-in is closed - impact has been logged for this event.'
  - else require `is_collective_leader_or_above(auth.uid(), <event collective>)`;
    if not -> RAISE 'Post-event check-in is available to leaders only.'
  - else allow.

Rewrite `enforce_walk_in_day_window()` (event_walk_ins, BEFORE INSERT):
- service_role bypass (unchanged) - covers the public_form path via the Edge
  Function, which keeps its own day-of guard, so public QR stays day-of only.
- future -> RAISE.
- today -> allow.
- past -> allow only if no `event_impact` row exists (RLS already requires
  leader for `leader_adhoc` inserts). If impact logged -> RAISE.

Keep ERRCODEs stable (`22023` for walk-ins so the Edge Function's existing
mapping still works; `23514` for registrations).

### 4. Self-code page - `src/pages/events/check-in.tsx`
Map the new "closed"/"leaders only" error to a friendly message
(`event_not_active` kind -> "Check-in for this event has closed.") so a
participant who lands here post-event sees a clear message, not a generic error.

### 5. Entry point - `src/pages/events/event-detail.tsx`
Verify the "Event Day" button in Leader Actions renders for past events (routes
to `/events/:id/day`). Fix if a `past` gate hides it.

## Bonus fix
The offline check-in queue is currently broken for reconnect-next-day: a queued
leader check-in that drains the morning after fails the day-of trigger. The
backfill window fixes that for leaders for free. Deliberate edge: a participant's
offline self-check-in draining next-day is rejected (past-day is leader-only);
the leader backfills that case.

## Unchanged / out of scope
Participant self check-in CTA, public QR (day-of only), the future-event block,
the impact 48-hour edit window. Impact stats are unaffected: attendance counts by
status and impact is bucketed by event date, so backfilled attendees count
correctly into the right reporting period.

## Testing
- Unit: `isCheckInOpenForLeader` (future / today / past-open / past-logged / null).
- Trigger behaviour (manual / SQL): leader past check-in succeeds pre-impact,
  fails post-impact; participant past check-in fails; future fails; day-of
  unaffected; service_role bypass intact.
- Visual verify (iOS sim): past event Event Day page as leader shows backfill
  banner + working check-in; after logging impact it locks.
