-- Public walk-in check-in idempotency (F4 remediation, 2026-08-10).
--
-- A re-scan / double-submit of the public QR check-in used to INSERT a fresh
-- event_walk_ins row every time (there was no unique constraint on the public
-- self-check-in path), inflating leader attendee counts and always showing the
-- user a brand-new "success". These partial unique indexes make a repeat
-- check-in for the same person at the same event collide (23505), which the
-- public-event-check-in edge function now catches and returns as an idempotent
-- "already checked in" instead of a duplicate row.
--
-- Scope: created_via = 'public_form' ONLY, so leader-added walk-ins (a leader
-- may legitimately add two people who share a phone, etc.) are never
-- constrained. Verified ZERO existing public_form duplicates for both
-- (event_id, lower(email)) and (event_id, phone) on the live DB before
-- creating, so these indexes build cleanly.
--
-- Additive + reversible. Down (manual):
--   drop index if exists public.event_walk_ins_public_email_uniq;
--   drop index if exists public.event_walk_ins_public_phone_uniq;

create unique index if not exists event_walk_ins_public_email_uniq
  on public.event_walk_ins (event_id, lower(email))
  where created_via = 'public_form' and email is not null;

create unique index if not exists event_walk_ins_public_phone_uniq
  on public.event_walk_ins (event_id, phone)
  where created_via = 'public_form' and phone is not null;
