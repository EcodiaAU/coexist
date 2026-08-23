# Independent verification pass 3: the held-seat render, on the real surface

Run 2026-08-24 by dispatched worker 76ba7f2d against project `tjutlbzekfouwsiaplbr`
and the deployed app at app.coexistaus.org. Pass 2 fixed the revenue defect and
left two things unproven: nobody had ever WATCHED the corrected panel render with
a hold in place (there were zero `reserved` rows in production), and the blank
hold date needed a decision rather than a silent fix. Both are closed here.

## Verdict

The revenue fix is real. It was rendered, live, with a real hold on a real
over-capacity event, and the Revenue tile did not move. Rendering it also
surfaced a second defect of the identical shape that no static reading had
caught, and that defect is fixed here.

## 1. The render, proven

The discriminating measurement is that REVENUE must not move when a held seat
appears while SOLD must. Pre-fix, an $80 hold moved Revenue by $80.

Wild Mountains Conservation Campout `02947960-dd03-4e93-bd1d-371aaa026b1a`,
genuinely over capacity at 26 of 25, signed in as the admin test account on
app.coexistaus.org.

| | Revenue | Sold | Checked in | Held line |
|---|---|---|---|---|
| Before the hold (scraped live) | `$1280.00` | `26` | `0` | absent |
| With one $80 hold (scraped live) | `$1280.00` | `27` | `0` | present |
| What the pre-fix code would have shown | `$1360.00` | `27` | `0` | n/a |

The held line rendered verbatim: "1 seat is held for someone who has not paid
yet. Held seats count as sold, not as revenue." Screenshots
`shots/p3-01-panel-before-hold.png` and `shots/p3-02-panel-with-hold-RENDERED.png`.

`$1280.00` is independently derivable: the event carries 26 confirmed tickets
summing 128000 cents, and no checked-in or reserved rows. The panel matches the
paid set exactly and ignores the 8000-cent hold.

### The banner scare, and why it was not a defect

The first read after creating the hold showed the capacity banner at `26/25`
against a panel reading `27` sold, which looks exactly like the Myall Park
divergence `event-capacity.ts` exists to prevent. It was not. `event_spots_taken`
is SECURITY DEFINER and does include `reserved` (read live from `pg_proc`), and
the banner calls that RPC. The 26 was the `['event', id, userId]` cache entry,
2-minute staleTime, captured moments before the hold landed. A second reload
moved the banner to `27/25` in agreement with the panel. Recorded because the
first probe would have shipped a false finding: one read is a rumor.

## 2. New defect found by rendering, and fixed: a live hold painted as a dead ticket

The ticket-holder list switched on status inline with a three-branch ternary
falling through to `bg-error-100 text-error-700`. `reserved` is the sixth status
and hit that fall-through, so a deliberate organiser hold rendered in the exact
red of `cancelled`, one line under an amber banner announcing the seat was held.
Confirmed live by computed style, not by reading the class name: the RESERVED
pill and the CANCELLED pill both resolved to `rgb(252, 225, 225)` on
`rgb(149, 44, 44)`.

This is the same failure as the revenue bug, one layer over: a status was added
to a set without visiting every place that switches on status. Static reading
missed it twice because with zero `reserved` rows it never rendered.

Fixed the same way pass 2 fixed the money question, by moving the switch into a
pure, tested function. `ticketStatusBadge()` in `src/lib/event-capacity.ts`
returns the label and treatment for a status, a hold reads amber (seat taken,
money owed, matching `pending` and matching the amber the member already sees on
"A spot is held for you") and is labelled `Held`, which is the word the panel's
own held-seats line already uses. A test iterates `TICKET_STATUSES` and fails any
status that falls to the neutral default, so a seventh status cannot inherit a
treatment silently.

RED proof: restoring `reserved` to `bg-error-100 text-error-700` fails 2 of the
4 new tests with `expected 'bg-error-100 text-error-700' not to be
'bg-error-100 text-error-700'`. Restored, 553/553 pass, `tsc --noEmit` clean,
`vite build` green.

## 3. The blank hold date: decided, implemented, not applied

`expire_lapsed_ticket_holds()` required `hold_expires_at IS NOT NULL`, and the
organiser sheet offers a blank date reading "Leave blank to hold the spot until
the event". A blank date was therefore swept by nothing, and the seat counted in
`event_spots_taken` forever.

Decision: implement the sweep, because "what blank means" was already decided by
whoever wrote that copy. Making the system do what the organiser was told it
does is not inventing a member-facing semantic, and it touches no wording, so it
does not go near the terms gate that Angelica and Tate own.

`supabase/migrations/20260824010000_expire_undated_ticket_holds_after_event.sql`
adds one clause: an undated hold lapses once `COALESCE(date_end, date_start)` has
passed. Proven RED and GREEN in rolled-back transactions on the client database,
five cases, one behavioural delta:

| Fixture | Production function today | With the migration |
|---|---|---|
| dated, lapsed | cancelled | cancelled |
| dated, future | reserved | reserved |
| undated, FUTURE event | reserved | reserved |
| undated, PAST event | **reserved** | **cancelled** |
| confirmed control | confirmed | confirmed |

**NOT APPLIED to production.** A dispatched worker cannot push, so applying a
SECURITY DEFINER change here would leave the client database ahead of the repo
with the migration sitting unpushed. Silent schema drift on a client database is
a worse trade than a latent bug that damages nothing today: there are zero
reserved rows, and the hazard only bites after an event has ended. The apply and
the push belong to the same hand.

One product question genuinely remains for Tate and Angelica, and is not
mechanical: when an undated hold lapses at the end of the event, should the
organiser be told, or does it just close quietly. The sweep is silent today for
dated holds too.

## Restoration

Every fixture in this pass was either inside a rolled-back transaction or, for
the one committed row the render required, deleted in the same run. A hold
carrying a 2-hour expiry was used deliberately so that a crashed run would still
self-clean via the existing cron.

Post-check: `event_spots_taken` on Wild Mountains back to `26` (its recorded
pre-run value), 0 `reserved` rows globally, 39 ticket rows on that event matching
the baseline of 26 confirmed + 12 cancelled + 1 refunded, the test user's
registration untouched at `cancelled`, 0 events carrying either self-service
flag, 0 `ZZ EOS` fixtures, and `expire_lapsed_ticket_holds` still the original
definition in production.
