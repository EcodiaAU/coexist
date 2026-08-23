# Independent verification pass 2: ticketing self-service + hold-a-spot

Run 2026-08-24 by dispatched worker d9f75736, with no context carried from the
builder (be06d9b1) or from verification pass 1. Every claim below was re-derived
against the live project `tjutlbzekfouwsiaplbr` and the deployed app, not read
off the previous record. Where this pass merely confirms an earlier finding it
says so; where it found something new it says that too.

## Verdict

The feature is real and the design is sound. Six of the seven hunted failure
modes came back clean under live probes. One did not: the leader sales panel
counted unpaid holds as revenue. That is fixed in `1aab345f`.

## What was probed, and what discriminates each result

| Probe | Result |
|---|---|
| `events` flags, whole table not just published | 0 refund, 0 transfer, 0 `ZZ EOS` fixtures, 446 events |
| `event_tickets_status_check` | carries all six values including `reserved` |
| 7 new RPCs present with expected signatures | all present, all SECURITY DEFINER |
| `expire_stale_pending_tickets` body, read live | `WHERE status='pending'` only, cannot touch a hold |
| `expire_lapsed_ticket_holds` body, read live | `status='reserved' AND hold_expires_at < now()` |
| Both crons run for real in one rolled-back tx | pending cron cancelled 0 and both holds survived; hold cron cancelled exactly the lapsed one |
| `reserved_by` foreign key | rejected a non-existent profile uuid |
| anon under `set local role anon` | 0 `event_tickets`, 0 `event_ticket_transfers`, 45 published events |
| `get_my_ticket_self_service` as the OWNER, flag off | `can_refund:false`, `refund_enabled_for_event:false` |
| Same RPC as a DIFFERENT authed member | `{found:false}`, no status/price leak |
| Same RPC with the flag flipped ON inside a rolled-back tx | `can_refund:true` |
| `start_my_ticket_transfer` as owner, flag off | raises `Ticket transfer is not enabled for this event` |
| Both new edge functions over HTTP | 401, against a control name that returns 404 |
| Deployed `/tickets/claim-transfer/:token` SIGNED IN | renders the invalid-link state, no hang |

Two of those deserve emphasis because they are the ones that could have been
faked by a weaker pass.

**The flag gate was proven in both directions.** `can_refund:false` on its own
proves nothing: it could come from ownership, status, the cutoff, or the flag.
Flipping only the flag inside a rolled-back transaction moved it to `true` on
the same ticket and the same user, which is what identifies the flag as the
actual gate. The deny half was then re-proven on the WRITE path, because a read
RPC returning `false` does not establish that the mutation is refused.

**The edge functions were proven deployed against a control.** A migration in
git is not a live function. Both new functions answer 401 while a deliberately
nonsensical function name on the same project answers 404, so the 401 is a
deployed function rejecting anonymous access rather than a routing default.

## Hunt list, one by one

**1. No real Stripe refund has ever fired. STILL TRUE, and still the right call
to leave alone.** `stripe.refunds.create` in `self-service-ticket` has not run
in anger. Firing a real refund would require refunding a real member's real
payment on a live client account, and the path it guards is dark anyway: both
per-event flags are off everywhere, so no member can reach it until the terms
land. Watching the first live refund is the correct control, not manufacturing
one now. Carried forward as the single open item.

**2. Capacity semantics. ONE REAL DEFECT, now fixed.** The SETS agree: the
banner reads `event_spots_taken` (SQL: confirmed, checked_in, reserved) and the
leader panel reads `SPOT_TAKING_TICKET_STATUSES` (TS: the same three), so the
Myall Park style divergence cannot recur on the seat count. But the panel summed
`price_cents` over that same occupancy set, so every unpaid hold added its full
ticket price to the Revenue tile. `event-capacity.ts` already had
`PAID_TICKET_STATUSES` and `ticketSpotsPaid` for precisely this question, with
passing unit tests, and no production code called them. Written, tested, unwired.
Fixed in `1aab345f` by moving the whole panel computation into
`summariseTicketSales()` so sold and revenue are defined once.

**3. Cron isolation. CLEAN, and tested rather than reasoned.** Pass 1 recorded
the correct treatment in a table; this pass executed both functions for real
inside a rolled-back transaction with a lapsed hold and a fresh hold in place.
The pending sweep cancelled nothing and left both holds alive; the hold sweep
cancelled exactly the lapsed one.

**4. Invitee paying for their own hold. CLEAN.** `create-checkout` finds the
held row scoped to `event_id + user_id + status='reserved'`, and `body.user_id`
is bound to the authenticated caller (403 on mismatch, defaulted to `caller.id`
when absent), so one member cannot consume another member's held seat. The patch
keeps `ticket_type_id` and `quantity` consistent with what is actually being
charged. The webhook optimistic lock and the full-comp branch both accept
`['pending','reserved']`.

**5. Holder lands at `registered` on payment. CLEAN, proven end to end on the
real over-capacity event.** Walked in one rolled-back transaction against Wild
Mountains, which is genuinely at 26 of 25 rather than a capacity-1 fixture:
hold created on the full event, `spots_taken` 26 to 27, zero `event_registrations`
rows; then ticket to `confirmed` and the reconciler run, giving `spots_taken`
still 27 (no double count) and registration `registered`, not `waitlisted`. The
insert-then-update in `reconcile_ticket_membership` does clear the BEFORE INSERT
waitlist trigger, and the separate BEFORE UPDATE trigger
(`enforce_event_day_check_in_window`) only constrains transitions into and out of
`attended`, so it does not block the lift.

**6. Diff hygiene. RESOLVED, deliberately left alone.** The conductor owns the
untracked `.gitattributes` and the decision that a repo-wide line-ending change
on a client repo deserves its own reviewable commit. Not swept into anything
here. This pass's own commit was checked both ways: `git diff --stat` and
`git diff --stat -w` are identical, so no renormalisation rode along.

## New finding not previously recorded: a blank hold date never expires

`expire_lapsed_ticket_holds` requires `hold_expires_at IS NOT NULL`, and the
organiser UI offers a blank date with the copy "Leave blank to hold the spot
until the event." Blank reaches the RPC as null, so the hold is never swept, by
that cron or any other: there is no post-event ticket sweep anywhere in the
database. The seat then counts in `event_spots_taken` permanently.

Nothing is damaged today (there are zero `reserved` rows in production), but the
hold path is NOT flag-gated, so it is live and the next blank-dated hold is
permanent. This is left as a decision rather than a unilateral fix because what
"blank" should mean to a member is the same class of member-facing semantic the
terms gate exists to keep humans in charge of. The mechanical options are to
default the expiry in the UI, or to extend the sweep to cancel null-expiry holds
once the event has ended, which is what the current copy already promises.
`release_ticket_hold` gives an organiser a manual out either way.

## Process notes

- Pass 1's canary hit the signed-OUT arm of the claim page and passed while the
  signed-IN arm hung. This pass drove it signed in and confirmed the state with
  `signedIn:true` read off the page before trusting the screenshot. Testing the
  arm that works is not a test.
- The builder's DESIGN.md and VERIFICATION.md were written into a dispatched
  worktree and were gone by the time this pass started, exactly as pass 1 warned.
  This file is in the repo for that reason.
- Every fixture in this pass lived inside a transaction that was rolled back. A
  post-check confirmed 0 `reserved` tickets, 0 transfers, and 0 events carrying
  either flag, so nothing was left behind on a client database.
