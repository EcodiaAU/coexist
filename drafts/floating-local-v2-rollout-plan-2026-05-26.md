# Floating-local v2 rollout plan

Started: 2026-05-26
Status: code merged to main, web on previous deploy, native build in progress

This is a multi-day coordinated rollout. The branch is on main but web users are on the previous (real-UTC) deploy. Native apps are being built off main (which has the new floating-local code).

When iOS and Android approvals come back, we run the cutover.

## What "floating-local" means

- Stored event dates are wall-clock-as-UTC. "9am 15 Jun" stored as `2026-06-15T09:00:00.000Z`. No tz tag.
- Every renderer pins `Intl.DateTimeFormat({ timeZone: 'UTC' })` so the stored wall-clock displays verbatim on every device.
- All "compare event date to now" routes through `wallClockNow()` (a Date whose UTC value equals the viewer's local clock numerals). Audit timestamps (`created_at`, `logged_at`) stay on real `Date.now()`.
- Result: a Perth event at 9am shows "9am" to every viewer in every Australian timezone. Address tells you where.

## Current state

| Layer | State | Notes |
|---|---|---|
| Main branch | Has floating-local v2 code | Merged 2026-05-26 |
| Vercel web | On previous deploy (pre-floating-local) | Rolled back after auto-deploy |
| Supabase data | Real-UTC encoding | Reverted from May 25 migration |
| iOS app store | TBD: submit 1.8.13 | Manual release mode |
| Play Console | TBD: submit new bundle | Staged rollout halted at 0% |
| `kv_store.coexist.min_app_version` | NOT YET CREATED | Will gate stragglers post-cutover |

## Pre-flight gaps (still to add before cutover)

1. **Min-version check + "Update required" banner.** App reads `kv_store.coexist.min_app_version` at startup. If local build version < that value, block app with a modal pointing to App Store / Play Store. Without this, native stragglers see broken times silently after cutover instead of being forced to update. ~30 lines.

2. **Postgres trigger `enforce_event_day_check_in_window` update.** The trigger uses `(date_start AT TIME ZONE collective_tz)::date` which over-shifts late-evening events under floating-local encoding (e.g. 9pm-as-UTC viewed AT TIME ZONE Brisbane lands in next day). Replace with `(date_start AT TIME ZONE 'UTC')::date` so the wall-clock day comes through verbatim. SQL is in `floating-local-v2-trigger-fix-2026-05-26.sql`.

Either of these can ship before cutover via separate commits.

## Cutover sequence

When iOS and Android are approved:

1. **Apply trigger fix:**
   ```bash
   curl -X POST https://api.supabase.com/v1/projects/tjutlbzekfouwsiaplbr/database/query \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d @floating-local-v2-trigger-fix-2026-05-26.sql
   ```

2. **Run data migration** (forward, real-UTC → wall-clock-as-UTC). SQL is in `floating-local-v2-cutover-2026-05-26.sql`.

3. **Promote latest Vercel deploy** to current. New web code goes live within seconds. Web users immediately on floating-local.

4. **Release iOS via ASC.** "Manual Release" mode → "Release this version".

5. **Resume Android staged rollout** to 100% in Play Console.

6. **Flip min-version flag** in `kv_store`:
   ```sql
   UPDATE kv_store SET value = '1.8.13' WHERE key = 'coexist.min_app_version';
   ```
   Old native users now see the "Update required" banner.

## Rollback (if cutover goes wrong)

1. **Revert data migration:**
   ```sql
   UPDATE events e SET
     date_start = ((e.date_start AT TIME ZONE 'UTC')::timestamp AT TIME ZONE coalesce(e.timezone, c.timezone, 'Australia/Sydney')),
     date_end   = CASE WHEN e.date_end IS NULL THEN NULL ELSE ((e.date_end AT TIME ZONE 'UTC')::timestamp AT TIME ZONE coalesce(e.timezone, c.timezone, 'Australia/Sydney')) END
   FROM collectives c WHERE c.id = e.collective_id;
   ```
2. **Roll back Vercel** to previous deploy.
3. **Halt native rollouts** in ASC and Play Console.

## Data quirk for cutover

Three events were manually shifted +10h earlier today to compensate for picker-corruption (Briars / Lane Cove / Plane Spotting). They're now in real-UTC encoding same as the other ~356, so the cutover migration applies uniformly. No special handling required.

## File index

| File | Purpose |
|---|---|
| `drafts/floating-local-v2-rollout-plan-2026-05-26.md` | This file. The plan. |
| `drafts/floating-local-v2-cutover-2026-05-26.sql` | The forward migration to run at cutover. |
| `drafts/floating-local-v2-trigger-fix-2026-05-26.sql` | The Postgres day-of trigger fix. |
| `drafts/floating-local-v2-simulation-2026-05-26.md` | Trace-through scenarios verifying the new code. |

## Verification status of main HEAD

- `tsc --noEmit`: clean
- `vitest run`: 194 tests pass, 17 files
- `npm run build`: green
- Em-dash check on diff: 0
