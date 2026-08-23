# Ticketing self-service + organiser hold-a-spot: design and verification record

Built 2026-08-24 (worker be06d9b1) for Angelica. Reconstructed into this repo
because the original lived in a dispatched worktree that is pruned on
`signal_done`, which took the first five screenshots with it. Durable artifacts
belong in the repo, not in a worker's scratch tree.

## The two gaps

Angelica raised both in the same week.

1. **Members could not self-serve.** A holder who needed out had to get an
   organiser to do it by hand. `cancel_my_pending_ticket` only ever covered a
   mid-checkout `pending` row, and person-to-person transfer did not exist at
   all: `transfer_event_ticket` moves a ticket between EVENTS, never between
   PEOPLE.
2. **Comp was all-or-nothing.** `grant-event-ticket` issues a FREE ticket, so
   once an event filled there was no way to hold a spot for someone who was
   still going to pay. She hit this on her own Wild Mountains ticket and again
   comping Max Sonderman.

## Why a sixth status and not `pending`

Both grounds were probed before choosing:

- `expire_stale_pending_tickets()` cancels ANY `pending` row older than 15
  minutes, unconditionally. A hold would silently evaporate.
- `reserve_event_ticket` cancels the caller's own `pending` row for the event
  before re-reserving, and the fresh reserve then hits the capacity check. An
  invitee paying for their own over-capacity hold was told "Sold out". That is
  the exact bug being fixed.

So `reserved` gets its own lifecycle and its own clock (`hold_expires_at`, swept
by `expire_lapsed_ticket_holds`, pg_cron job 28, every 15 min).

## Status-consumer map

A hold OCCUPIES a seat but is NOT paid revenue and NOT a confirmed attendance.

| Consumer | Treatment |
|---|---|
| `event_spots_taken` | counts `reserved` (the seat is genuinely held) |
| `get_event_ticket_availability` | counts `reserved` as sold |
| `reserve_event_ticket` | counts it in capacity; never cancels a reserved row |
| `transfer_event_ticket` | counts it in the sold sum; reserved is not movable |
| `reconcile_ticket_membership` | reserved is NOT valid, so no campout chat, no `registered` |
| `expire_stale_pending_tickets` | untouched (matches `pending` only) |
| `stripe-webhook` | confirms `reserved` alongside `pending` |
| `create-checkout` | reuses the caller's own reserved row, preserving the over-capacity seat |
| FE `SPOT_TAKING` / `INVENTORY_HOLD` | both include `reserved`; `PAID_TICKET_STATUSES` deliberately does not |

`reserve_spot_for_user` writes NO `event_registrations` row on purpose:
`handle_event_registration()` is a BEFORE INSERT trigger that rewrites any
status to `waitlisted` once an event is at capacity, so an `invited` row for a
held spot landed as `waitlisted` and the roster read "did not get in" for the
person whose spot was being held. Registration is derived from valid tickets;
the reconciler creates it via UPDATE on payment, which bypasses that trigger.

## Probes run, and what each discriminates

| Probe | Result |
|---|---|
| At-capacity event, `reserve_event_ticket` | `Sold out - only 0 tickets remaining` (Angelica's bug, reproduced) |
| Same event, `reserve_spot_for_user` | succeeded, `spots_taken` 2 of capacity 1 |
| `get_my_ticket_self_service` as authed owner | can_refund true, can_transfer true |
| Same RPC as a DIFFERENT authed member | `found: false` |
| Same RPC as `anon` | `permission denied for function` |
| `claim_ticket_transfer`, bogus token | `This transfer link is not valid` |
| `claim_ticket_transfer`, by the SENDER | `You cannot claim your own transfer` |
| `claim_ticket_transfer`, by recipient | `user_id` moved, `price_cents` 8000 unchanged (no refund-and-rebuy) |
| Reconciler after transfer | old holder `cancelled`, new holder `registered` |
| anon reads | 45 published events, 0 `event_tickets`, 0 `event_ticket_transfers` |

Authed probes were run as `set local role authenticated` with real
participant-role users, never as the stored test account: `creds.coexist` is an
ADMIN (uid 4cc11fa1), so a participant-tier check run with it falsely passes.

## Open, and owed

**The member-facing TERMS wording is owed by Angelica + Tate.** Not invented
here. `src/lib/ticket-terms.ts` keeps `TICKET_TERMS_PENDING = true` with
placeholder copy, and every per-event flag defaults FALSE. Verified live: 0
published events carry either flag.

**No real Stripe refund has ever fired.** The self-refund path was exercised
only on a ticket with no payment intent, so `stripe.refunds.create` in
`self-service-ticket` has not run in anger. Watch the first live member refund.

**Capacity parity needs a second look.** The leader ticket-sales panel and the
event banner have diverged before on this app (Myall Park, 25 vs 22). `reserved`
now counts in both; confirm they still agree.

## Two bugs I shipped and then found

1. The claim-transfer success CTA navigated to `/tickets`, which is not a route
   (My Tickets is `/profile/tickets`). Fixed in `915d732b`.
2. `/tickets/claim-transfer/:token` hung forever on "Claiming your ticket..."
   for a SIGNED-IN visitor: the claim effect paired a once-only `attempted` ref
   with a `cancelled` flag from its own cleanup, so when `user` changed identity
   on auth hydration the effect re-ran, the first pass's result was discarded
   and the second returned early on the ref. Evidence in
   `shots/06-PROD-HANG-EVIDENCE.png`, taken against the deployed url. Both bugs
   were found by driving the real app, not by reading the code.

## Process notes worth keeping

- A verification fixture on a CLIENT database is production data. Mine was
  created `status='published'` with the self-service flags ON, which made it
  member-visible on the live app carrying the very UI the T&C gate exists to
  withhold. The conductor caught it. Fixtures must be born `draft` and removed
  in the same run.
- A Python read-modify-write on a CRLF file silently rewrites it as LF. That
  turned a 12-line change into 756 insertions and 744 deletions on `App.tsx`.
  Use `open(p, newline='')` on this repo.
- Artifacts written into a dispatched worktree do not survive `signal_done`.

## Found while verifying, NOT caused by this work

The public guest-checkout page (`/event/:id`) ignores ticket availability. On the
4 Sep Wild Mountains campout it renders "25 spots" and a live "Get ticket -
$80.00" button while `get_event_ticket_availability` returns `remaining: 0`
(sold 26 of capacity 25). A guest can start a purchase that the reserve RPC will
refuse at checkout.

Proven pre-existing, not a regression from the `reserved` status: that event has
0 reserved rows (26 confirmed, 12 cancelled, 1 refunded), so the new
reserved-aware sold count is arithmetically identical to the old one there.

Found by looking at the deployed page rather than trusting the query, which is
the whole argument for an eyes-on-pixels check: the RPC was right and the page
was wrong, and no amount of SQL would have shown it.
