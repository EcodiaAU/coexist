-- Member self-service (refund before the cutoff, release on resale inside it,
-- transfer to a friend) goes LIVE. Tate approved the terms 2026-09-27
-- ("finish absolutely everything and push it live"); the wording is in
-- src/lib/ticket-terms.ts and TICKET_TERMS_PENDING is false as of this change.
--
-- New events get it by default (the admin event form never sets these
-- columns), and every upcoming published ticketed event is switched on.
-- Scratch probe events (title starting 'ZZ ') are left alone.

ALTER TABLE public.events
  ALTER COLUMN self_service_refund_enabled   SET DEFAULT true,
  ALTER COLUMN self_service_transfer_enabled SET DEFAULT true;

UPDATE public.events
SET self_service_refund_enabled = true,
    self_service_transfer_enabled = true
WHERE is_ticketed = true
  AND status = 'published'
  AND date_start > now()
  AND title NOT ILIKE 'ZZ %';
