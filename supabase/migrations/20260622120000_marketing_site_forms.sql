-- Marketing site forms: newsletter subscribers + contact messages.
-- Both accept anonymous INSERTs from the public marketing site (RLS), but are
-- never readable by anon. Staff read them via service_role / the app admin
-- (the marketing CMS admin + email-targeting integration land in P6).

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  source text not null default 'website',
  status text not null default 'pending',          -- pending | confirmed | unsubscribed
  created_at timestamptz not null default now(),
  unique (email)
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text,
  message text not null,
  source text not null default 'website',
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;
alter table public.contact_messages enable row level security;

-- anon may INSERT (subscribe / send a message) but never SELECT.
drop policy if exists "anon insert newsletter" on public.newsletter_subscribers;
create policy "anon insert newsletter" on public.newsletter_subscribers
  for insert to anon with check (true);

drop policy if exists "anon insert contact" on public.contact_messages;
create policy "anon insert contact" on public.contact_messages
  for insert to anon with check (true);

-- Supabase requires BOTH an RLS policy and a table grant for anon writes.
grant insert on public.newsletter_subscribers to anon;
grant insert on public.contact_messages to anon;
