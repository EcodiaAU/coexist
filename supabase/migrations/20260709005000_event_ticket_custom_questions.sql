-- =====================================================================
-- Per-event custom ticket questions + answer storage
-- =====================================================================
-- Origin: Tate 2026-07-09. Bring app ticketing to parity with the custom
-- questions Eventbrite used to ask on campout registrations (e.g. "Arriving
-- by 4WD?"). An organiser defines questions per event; attendees answer them
-- at ticket purchase; answers are stored against the ticket and pulled into
-- the attendee export. This migration is purely additive and idempotent.
--
-- Design notes:
--  - Questions are EVENT-scoped (not ticket-type-scoped): the same questions
--    apply to every tier of an event. Simpler to author and export.
--  - Answers live in event_tickets.custom_answers jsonb keyed by question id,
--    written at reserve time by the checkout / claim / grant edge functions
--    (the RPC signature is left unchanged; the edge fns already patch the
--    ticket row after reserve_event_ticket returns).
--  - RLS mirrors event_ticket_types exactly: authenticated read-all, anon read
--    for public+published+ticketed events (guests see questions before buying),
--    manage by event creator or admin/national_leader.
-- =====================================================================

-- 1. Questions table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_ticket_questions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  prompt        text NOT NULL,
  help_text     text,
  question_type text NOT NULL DEFAULT 'short_text'
                  CHECK (question_type IN ('short_text','long_text','boolean','single_select','multi_select')),
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array of option strings, for *_select types
  required      boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_ticket_questions_event_id_idx
  ON public.event_ticket_questions (event_id, sort_order);

-- 2. Answer storage on the ticket ---------------------------------------
-- Keyed by question id -> answer (string, boolean, or array for multi_select).
ALTER TABLE public.event_tickets
  ADD COLUMN IF NOT EXISTS custom_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. RLS -----------------------------------------------------------------
ALTER TABLE public.event_ticket_questions ENABLE ROW LEVEL SECURITY;

-- Authenticated: read all active questions (needed to render the buy form).
DROP POLICY IF EXISTS ticket_questions_select ON public.event_ticket_questions;
CREATE POLICY ticket_questions_select ON public.event_ticket_questions
  FOR SELECT TO authenticated USING (true);

-- Anon: read questions for public, published, ticketed events (guest checkout
-- on /event/:id must render the questions before a guest buys). Mirrors
-- ticket_types_public_select.
DROP POLICY IF EXISTS ticket_questions_public_select ON public.event_ticket_questions;
CREATE POLICY ticket_questions_public_select ON public.event_ticket_questions
  FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_ticket_questions.event_id
        AND e.is_public = true
        AND e.is_ticketed = true
        AND e.status = 'published'
    )
  );

-- Manage: event creator or admin/national_leader. Mirrors ticket_types_manage.
DROP POLICY IF EXISTS ticket_questions_manage ON public.event_ticket_questions;
CREATE POLICY ticket_questions_manage ON public.event_ticket_questions
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_ticket_questions.event_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','national_leader')
          )
        )
    )
  );

-- 4. Explicit grants (RLS still gates row visibility) --------------------
GRANT SELECT ON public.event_ticket_questions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_ticket_questions TO authenticated;

-- 5. keep updated_at fresh ----------------------------------------------
DROP TRIGGER IF EXISTS event_ticket_questions_touch ON public.event_ticket_questions;
CREATE TRIGGER event_ticket_questions_touch
  BEFORE UPDATE ON public.event_ticket_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
