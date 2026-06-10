# Co-Exist Audit Findings — TO VERIFY against live DB (2026-06-08)

Source: 5 static-only audit agents. These claims MUST be adversarially verified against
the running Supabase project `tjutlbzekfouwsiaplbr` and the repo at `/Users/ecodia/.code/coexist`.

## CONFIRMED GROUND TRUTH (already verified inline, do not re-litigate, build on it)
- GT1. Floating-local model is real: Morialta event `date_start='2026-06-14 09:30:00+00'`, `timezone=NULL`,
  collective=Adelaide (`Australia/Adelaide`). Host typed "9:30am", stored literally as 09:30Z, displayed 9:30am. DISPLAY IS CORRECT.
- GT2. ALL 378 events have `events.timezone = NULL` (0 overrides, 0 'UTC'). Audience tz always = `collective.timezone`.
- GT3. LIVE trigger `enforce_event_day_check_in_window` uses `(e.date_start AT TIME ZONE 'Australia/Sydney')::date` — HARDCODED Sydney, per-event-tz reverted.
- GT4. Event wall-hour distribution: hours 7-13 = 300 events; hours 14-21 = 22 events; hours 22-23 = 56 events.
  The 22:00/23:00 cluster is SUSPECTED legacy real-UTC events (pre-2026-05-26 floating-local cutover). MUST CONFIRM: is the events table MIXED (legacy real-UTC + new floating)? This is the single most important open question.
- GT5. Live crons all active: event-reminders-30min (*/30), event-day-notify (7,22,37,52), carpool-archive-sweep (:17),
  event-post-photo-invite (:23), event-post-survey-invite (:41), maybe-event-reminders (:0).

## DB-ACCESS METHOD (every agent: use this)
```
set -a; . /Users/ecodia/PRIVATE/ecodia-creds/supabase.env; set +a
REF=tjutlbzekfouwsiaplbr
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"<SQL>"}'
```
To exercise auth-gated RLS/trigger paths, wrap SQL in: `begin; set local role authenticated; set local request.jwt.claims='{"sub":"<uuid>","role":"authenticated"}'; <stmt>; rollback;`
Edge function source: `/Users/ecodia/.code/coexist/supabase/functions/<name>/index.ts`. My already-shipped fixes are in `event-reminders` + `event-day-notify` (commit 80c5a4b) — VERIFY THEM TOO, they may be wrong/regressions.

---

## CLUSTER 1 — DB triggers (claimed P0)
- C1.1 `enforce_event_day_check_in_window` hardcoded Sydney → breaks check-in for events with wall-hour >= 14:00 (rolls to next day in Sydney). File migrations/20260601000000_post_impact_leader_unblock.sql.
- C1.2 `enforce_walk_in_day_window` same hardcoded Sydney.
- C1.3 `enforce_walk_in_mutation_window` same hardcoded Sydney.
- VERIFY: pull ALL live trigger defs touching date_start. For each, compute behaviour for (a) a 9:30am Adelaide floating event, (b) a 7pm floating event, (c) a legacy real-UTC 22:00Z event. Quantify how many REAL events fall in the broken bucket. Is the bug masked by morning-only data + legacy-correction? Run the actual trigger via simulated authenticated JWT against a real future event row and observe accept/reject.

## CLUSTER 2 — Edge function cron timing (claimed P0/P1)
- C2.1 public-event-check-in/index.ts:49-66,160-164 — own `todayAEST()`/`eventDateAEST()` hardcoded Sydney, same bug as triggers. Public QR.
- C2.2 event-post-photo-invite — 30min post-end window vs real-UTC now → fires audience-offset late, may miss entirely.
- C2.3 event-post-survey-invite — 1h post-end window vs real-UTC now → same.
- C2.4 carpool-archive-sweep:57-59,104,178 — 22h/24h cutoffs on date_end vs real-UTC now → warn/delete late.
- C2.5 migrations/045_rsvp_event_actions.sql maybe-event-reminders — `e.date_start > now()` keeps ended events in future pool ~offset hours.
- VERIFY each against real upcoming events. Does the floating vs legacy mix change the conclusion? For C2.1 simulate the function's date logic in SQL against real Adelaide/Perth events.

## CLUSTER 3 — My shipped fix (event-reminders, event-day-notify) — VERIFY NOT A REGRESSION
- C3.1 Does `wallClockNowInTz(collective.timezone)` + per-event diff fire 24h/2h reminders at the correct wall-clock moment for a 9:30am Adelaide event? Walk it numerically.
- C3.2 Does it BREAK for legacy real-UTC events (the 22:00Z cluster)? A legacy 8am-AEST event stored 22:00Z: pre-fix fired correctly (real instant), post-fix may now fire wrong. THIS IS THE KEY REGRESSION RISK. Quantify.
- C3.3 The ±12h SQL pre-filter padding — any event double-counted or missed?

## CLUSTER 4 — FE display/sort/filter (claimed P0/P1)
- C4.1 use-events.ts:1869-1873,2049-2054 — ICS + Google Calendar export pin `DTSTART...Z` → wrong time for non-UTC viewers. (Note: this only matters for floating events; verify the actual generated string.)
- C4.2 use-event-proximity.ts:195,227-232 — `new Date()` vs `new Date(date_start)` mix → proximity check-in prompt window wrong.
- C4.3 use-home-feed.ts:427,440-442 — "happening now" sort uses Date.now() vs wall-clock start → never fires for AU viewers.
- C4.4 use-leader-events.ts:34,154 + use-admin-events.ts:45,96-97 — upcoming/past split uses real-UTC now → ended events linger.
- C4.5 use-impact-form-tasks.ts:159-163 — leader "log impact" task surfaces offset-hours late.
- C4.6 leader/tasks.tsx:568-588 — overdue/due-today badges off by offset.
- C4.7 use-tasks.ts:715-719,759,776 + use-timeline-rules.ts:248-253 — dynamic task due_date stored per-viewer-tz (setDate/setHours local) → cross-leader DB inconsistency.
- C4.8 use-auto-survey.ts:52,75-76 — pending-surveys-7d window offset.
- C4.9 admin/events.tsx:114 isPast; admin/collective-detail.tsx:477-490 date overlay off-by-day.
- VERIFY each: read the actual code (line numbers may be wrong), confirm whether it uses Date.now()/new Date() vs wallClockNow(). Many of these the agents may have MISREAD — several files already use wallClockNow() correctly. Reconcile with the user's report that DISPLAYED times look correct.

## CLUSTER 5 — Push system + SECURITY (claimed P0/P1)
- C5.1 [SECURITY P0] send-push/index.ts:188-247 — authenticates any user JWT but NO authorization that the caller owns userIds/collectiveId → any signed-in user can push to anyone with arbitrary data.route (forced nav incl /admin/*). VERIFY: read the function; is there any role/ownership check? Is the function deployed with verify_jwt? Can a plain authenticated user actually invoke it (test the function endpoint or read its config)?
- C5.2 [SECURITY P0] debug-push/index.ts:26 — hardcoded passphrase fallback `'coexist-debug-2026'`. VERIFY: is DEBUG_PUSH_PASSPHRASE env var SET on the deployed function (check function secrets/config)? If set, fallback is dead. If unset, live hole.
- C5.3 send-push:303-309 — pref filter short-circuits true when data.type missing/unknown; photo-invite uses 'event_updated', survey-invite uses 'event_reminder', notify-application uses 'collective_application' (not in union). VERIFY against NotificationPreferences type + the actual send-push filter code.
- C5.4 send-push:329-345 — quiet-hours `Intl.DateTimeFormat('en-AU', hour12:false)` may emit "24:00" at midnight in Deno ICU. VERIFY: actually run the format in Deno (or node ICU) for midnight en-AU; is the 24:00 claim real?
- C5.5 use-push.ts:332-378 — iOS APNs/FCM token lifecycle; APNs token sent to FCM → INVALID_ARGUMENT → deleted. Upsert key (user_id,token) not (user_id,platform) → dead-token accumulation. VERIFY against push_tokens schema + actual rows (any dup user_id? any APNs-shaped tokens?).
- C5.6 event-reminders/event-day-notify record tracking row AFTER push fan-out → crash mid-loop re-pushes. VERIFY ordering in code.
- C5.7 use-push.ts:438-462 tap mark-read matches (user_id,type,5min) → wrong-row. C5.8 main.tsx pendingPushRoute no freshness check.
- C5.9 [P3] notify-report writes notifications.data as JSON string not object → deep link undefined. VERIFY notifications.data column type (jsonb?) + the insert.

## CLUSTER 6 — Auth / logout (claimed P0/P1) — "what kicked Jess out"
- C6.1 [P0] .env.production MISSING VITE_APP_URL → use-auth.ts:585,640,665,673,702 falls to window.location.origin = capacitor://localhost on native → email verify / magic link / password reset / OAuth web redirect broken on iOS. VERIFY: grep .env.production for VITE_APP_URL; read those use-auth lines; confirm native social login bypasses redirectTo.
- C6.2 [P0] lib/supabase.ts:7-13 — no `storage:` adapter; Supabase JS uses localStorage while use-auth.ts:110-128 keeps a parallel Capacitor Preferences mirror → dual-substrate race. VERIFY actual createClient config.
- C6.3 [P0] use-auth.ts:406-447 — no TOKEN_REFRESHED-failure branch → expired refresh token silently nulls session → RequireAuth → /login, no UI. VERIFY onAuthStateChange handler.
- C6.4 lazy-with-retry.ts:55-65 — window.location.reload() races auth-restore; sessionStorage guard may not survive iOS webview recycle. Could this + asset bug explain Jess's "/admin/assets + kicked out"?
- C6.5 route-guard.tsx:42-99 — 10s profile-fetch timeout with "Back to login" → signOut().
- VERIFY the causal chain for Jess. Is the logout independent of the (now-fixed) asset bug?

## CLUSTER 7 — Capacitor / SPA routing (claimed P0/P1)
- C7.1 [P0] public/manifest.json MISSING but public/sw.js:27-32 precaches it → cache.addAll atomic reject → SW never activates → offline fallback dead. VERIFY: does public/manifest.json exist? Does index.html reference a manifest? Does sw.js precache it? curl https://app.coexistaus.org/manifest.json for live 404.
- C7.2 capacitor.config.ts allowNavigation lacks apex coexistaus.org. C7.3 error-boundary.tsx:43 reload→'/' loses route (sentry boundary uses reload()). C7.4 main.tsx:1-27 boot overlay dup without __APP_MOUNTED gate.
- C7.5 use-deep-link.ts default branch → coexist://home resolves to /home which isn't a route → WelcomePage after verify.
- VERIFY each against actual files (line numbers may drift).

## CLUSTER 8 — COMPLETENESS CRITIC (new)
With live DB access the static audit didn't have: what did it MISS or get WRONG?
- The mixed legacy/floating data model (GT4) — does it create NEW bugs the audit never considered? (e.g. my fix regressing legacy events; triggers being right-for-legacy-wrong-for-new).
- Any event already mis-handled in production (check audit_log / check-in failure patterns if such tables exist).
- Is there a data-migration that rewrote legacy events to floating? Search migrations + check created_at vs date_start hour correlation.
- Re-derive the SINGLE correct mental model and whether the codebase is internally consistent under it.
