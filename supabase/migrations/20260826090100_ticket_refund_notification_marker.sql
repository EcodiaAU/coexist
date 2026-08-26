-- 20260826090100_ticket_refund_notification_marker.sql
--
-- One persisted marker so a refunded member is told EXACTLY ONCE.
--
-- Before this, Stripe's charge.refunded handler sent the refund email with no
-- idempotence guard of any kind. Stripe retries that event on any non-2xx and
-- on its own schedule, so a single refund could deliver four identical emails
-- to one member. An in-memory flag cannot help: each retry may land on a cold
-- edge-function instance.
--
-- The guard is this column plus a single conditional statement:
--
--   update event_tickets
--      set refund_notified_at = now()
--    where id = $1 and refund_notified_at is null
--   returning id;
--
-- Postgres row-locks that UPDATE, so two concurrent deliveries cannot both
-- return a row. Whoever gets the row sends; everyone else is a no-op. The
-- handler releases the marker back to NULL if the send itself fails, so a
-- transient Resend outage does not silently cost the member their only
-- telling.
--
-- BACKFILL IS DELIBERATE SUPPRESSION, NOT A SEND. Every ticket already sitting
-- at status='refunded' is stamped as notified. Without this, the first Stripe
-- retry or event replay after deploy would mail people about refunds that are
-- days or weeks old. Whether any of those members should now be told is a
-- human call, made per person, not a side effect of shipping this migration.
-- To re-enable one deliberately: set refund_notified_at = null for that ticket
-- and replay the charge.refunded event.

alter table public.event_tickets
  add column if not exists refund_notified_at timestamptz;

comment on column public.event_tickets.refund_notified_at is
  'Set when a refund confirmation email is CLAIMED for this ticket (see stripe-webhook charge.refunded). NULL means not yet notified. Claimed by a conditional UPDATE ... WHERE refund_notified_at IS NULL so Stripe retries cannot double-send. Reset to NULL to allow a resend.';

-- Suppress retroactive mail for refunds that predate the notification path.
update public.event_tickets
   set refund_notified_at = coalesce(updated_at, created_at, now())
 where status = 'refunded'
   and refund_notified_at is null;
