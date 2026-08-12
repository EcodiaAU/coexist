-- Campaign send reliability + real per-recipient tracking + Resend webhook ingestion.
-- Origin: 2026-08-12 investigation. send-campaign fired 50 concurrent requests
-- against a 10 req/s Resend limit and swallowed the ~41/50 resulting 429s,
-- counting them as "delivered". campaign_recipients wrote 0 rows (unchecked
-- insert). email_events was dead SendGrid-era infra (no Resend webhook). This
-- migration makes per-recipient tracking real and idempotent, and stands up a
-- Resend-vocabulary event table for the webhook handler.

-- 1. Per-recipient upsert key + Resend message id correlation.
alter table public.campaign_recipients
  add column if not exists resend_message_id text;

-- Defensive dedupe before the unique index (none expected; existing_dupes=0 as of 2026-08-12).
delete from public.campaign_recipients a
  using public.campaign_recipients b
  where a.campaign_id = b.campaign_id
    and a.profile_id = b.profile_id
    and a.id > b.id;

create unique index if not exists campaign_recipients_campaign_profile_uidx
  on public.campaign_recipients (campaign_id, profile_id);

create index if not exists campaign_recipients_resend_msg_idx
  on public.campaign_recipients (resend_message_id);

-- 2. Resend webhook event sink (Resend vocabulary: email.sent/delivered/bounced/
--    opened/clicked/complained/delivery_delayed). Replaces the unused SendGrid
--    email_events table for the new ingestion path.
create table if not exists public.resend_events (
  id                 uuid primary key default gen_random_uuid(),
  resend_message_id  text,
  event_type         text not null,
  email              text,
  reason             text,
  payload            jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists resend_events_msg_idx  on public.resend_events (resend_message_id);
create index if not exists resend_events_type_idx on public.resend_events (event_type);
create index if not exists resend_events_email_idx on public.resend_events (email);

-- Service-role-only: RLS on, no policies => the webhook (service role) is the
-- only reader/writer. Never client-exposed.
alter table public.resend_events enable row level security;
