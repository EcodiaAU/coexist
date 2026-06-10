# Co-Exist Timezone & Push Audit — Final Calibrated Verdict
**Project `tjutlbzekfouwsiaplbr` · 8 Jun 2026 · verified against live DB + deployed function bodies**
**Method:** 5 ground-truth agents + 8 adversarial verifiers + synthesis, all with live DB access. 48 verdicts.

## Headline
Display is correct (Tate's observation holds — floating wall-clock stored verbatim, read back UTC-pinned).
Bugs live only in COMPARISON-LOGIC paths that never touch a screen. The static audit over-claimed;
this verification refuted ~10 findings, downgraded most FE ones, and surfaced 2 things the static pass missed.

## The mixed-data-model verdict
Events table IS mixed but the mix is INERT:
- Model A floating wall-clock-as-UTC: 322/378 events, ALL 27 future events.
- Model B real-UTC instants: 56-58 events = the 22:00/23:00 cluster = ALL synthetic seed data, ALL past.
- No data migration ever rewrote events; FE switched AT-TIME-ZONE→UTC-pin on 2026-05-25, orphaning seed rows (harmless, past).
- Consequence: my reminder fix regression risk = 0 events (no future real-UTC event exists). Fix is SAFE.

## Confirmed real bugs (ranked, verified blast radius)

### P0 SECURITY (timezone-independent, always bite, proven exploited end-to-end)
- **B1 send-push zero authorization.** Any signed-in user (~288, open reg) → arbitrary push (incl forced /admin/* nav)
  to any user OR whole collective, no rate limit, uncapped fan-out. Proven: plain-user JWT → live POST → HTTP 200. [edge-deploy]
- **B2 debug-push hardcoded passphrase IS the live secret.** `DEBUG_PUSH_PASSPHRASE` not in 18 deployed secrets →
  fallback `'coexist-debug-2026'` (public in git) is live. verify_jwt=false + CORS * = internet-reachable by anyone, no Supabase creds.
  Proven: passphrase header, no bearer → auth passed, FCM token minted. Instant mitigation: set the secret (no deploy). [edge-deploy]

### P1 — the real timezone bug
- **B3 hardcoded-Sydney check-in trigger blocks check-in on the real event day** for floating events wall-hour ≥14.
  `(date_start AT TIME ZONE 'Australia/Sydney')::date` rolls +1 day → trigger thinks event is "tomorrow" → rejects (self + leader).
  FE shows open, DB rejects = 1-day FE/DB seam. Verified live (trigger threw against a real registration).
  Blast radius — 5 future events, ~66 registrants:
    Trinity Beach 09-Jun 16:30 Brisbane (0); Whites Hill 13-Jun 17:00 Brisbane (33/26 pending);
    Broken Head 14-Jun 15:30 Sydney (3); Mordialloc 14-Jun 16:00 Melbourne (~24); Orleigh Park 21-Jun 14:00 Brisbane (6).
  **FIX-DIRECTION TRAP (verified):** the "obvious" per-event collective.tz fix gives the SAME wrong +1 roll.
  Only correct fix = `(date_start AT TIME ZONE 'UTC')::date` (matches FE). Delete/neutralise dead event_effective_timezone(). [db-migration]

### P1 — deploy gap
- **B4 the reminder fix (commit 80c5a4b) is committed but NOT deployed.** Deployed event-reminders eszip = OLD code
  (0× wallClockNowInTz, 5× 23.5h). Deploy ts 2026-05-25, 14d before the commit. **The original "wildly wrong push times"
  bug is STILL LIVE** — all 27 future events' reminders fire 8-10h late. Fix code is correct + regression-safe; rung 8 (verify deploy) was skipped. [edge-deploy]

### P2 — confirmed, bounded
- **B5 ICS/Gcal export emits DTSTART...Z** → all 27 future AU events import into external calendars off 8-11h. Fix: TZID=collective.tz. [web-deploy]
- **B6 public-event-check-in** same Sydney bug (LATENT, 0 public-QR rows). Fix UTC-pin alongside B3. [edge-deploy]
- **B7 photo/survey invite crons fire 8-10h late** + photo-invite ~48% structural miss (30min window vs hourly cron → widen ≥60min). [edge-deploy]
- **B8 notify-report jsonb double-encode** → broken moderation deep link (LATENT, 0 rows). One-line: drop JSON.stringify. [edge-deploy]
- **B9 leader/admin Upcoming/Past tab** lingers ~9h (same-day self-corrects); **push_tokens** 45/327 dead APNs tokens, unique key should be (user_id,platform). [web/native]
- **B10 walk-in trigger pair** same Sydney hardcode (P2/P3, 14 walk-ins total, 0 future floating). Fix with B3. [db-migration]

## Refuted / overblown (stop worrying)
- C3.2 reminder-fix regression on legacy events — REFUTED, 0 events exposed.
- C3.3 ±12h pre-filter double-count — REFUTED (per-event check + dedup tables).
- C5.4 quiet-hours 24:00 — REFUTED (Deno ICU emits 00:00; suppresses correctly anyway).
- C5.3 pref-filter bypass — overstated; the named examples map to valid keys and ARE honored.
- C6.5 route-guard timeout→signOut — REFUTED (signOut only on explicit user click).
- C4.7/C4.8/C7.2 — effectively dead (0 event-relative tasks in prod; <0.5d shift on 7d window; apex links open external).
- C2.4/C2.5 carpool/maybe-reminders — REAL_LOW_IMPACT (offset always later not earlier → no premature delete; defer).
- C4.3 home-feed "happening now" — cosmetic (visibility filter already uses wallClockNow; only the float-to-top tiebreak is off).

## What kicked Jess out
NOT auth. Root cause = the Vite base:'./' asset-path bug, ALREADY FIXED in HEAD commit 66b2118 (commit msg names Jess).
Deep route → relative <script> 404 as /admin/assets/index-X.js → Capacitor overlay ending /admin/assets. Native auth restores
across the reload churn, so no real logout. One related live item: **C7.4 duplicate ungated boot-error overlay in main.tsx:6-27**
can paint white over a working app on any post-mount unhandledrejection — delete it. [web-deploy] P1.

## Pre-release fix list (release gated on Xcode anyway; edge/db/web land NOW)
TIER 0 (now, no deploy): set DEBUG_PUSH_PASSPHRASE random → closes B2 instantly.
TIER 1 (before release, ship-now): B1 send-push authz; B2 remove fallback; B3+B6+B10 one UTC-pin migration (use UTC not collective.tz!); B4 deploy reminder fix + verify body; B5 ICS TZID; C7.4 delete dup overlay.
TIER 2: B7 wallClock crons + widen photo window; B8 drop JSON.stringify; B9 tab wallClock + push_tokens key.
TIER 3: quarantine 58 seed rows; add check_in_attempts log; C4.x polish.
