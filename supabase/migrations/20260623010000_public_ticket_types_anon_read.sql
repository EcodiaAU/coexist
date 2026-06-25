-- =====================================================================
-- Anon read of ticket types for public, published, ticketed events
-- =====================================================================
-- Origin: Tate 2026-06-23, guest ticket checkout. The public event page
-- (/event/:id, anon) must show the ticket price before a guest buys, but
-- event_ticket_types only had ticket_types_select FOR SELECT TO authenticated.
-- Prices for public events are public info (they are on the marketing site),
-- so expose active ticket types for public+published+ticketed events to anon.
-- Additive; the authenticated policy is unchanged. Idempotent.
-- =====================================================================

DROP POLICY IF EXISTS ticket_types_public_select ON public.event_ticket_types;
CREATE POLICY ticket_types_public_select ON public.event_ticket_types
  FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_ticket_types.event_id
        AND e.is_public = true
        AND e.is_ticketed = true
        AND e.status = 'published'
    )
  );
