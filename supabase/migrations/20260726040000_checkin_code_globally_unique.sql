-- Make event check-in codes globally unique at generation time.
--
-- Incident 2026-07-26: the entire "National Tree Day Planting - Corso Park"
-- event could not check in with code 887. generate_event_check_in_code()
-- only avoided codes held by NON-terminal events (status NOT IN completed,
-- cancelled) and deliberately reused codes from completed/cancelled events.
-- prevent_check_in_code_change() forbids ever clearing a code, so a completed
-- Jan-2025 event still held 887 and a new live event was legitimately handed
-- the same code. The client looked the event up with .maybeSingle(), which
-- ERRORS on more than one match, surfacing as a generic "Check-in failed" for
-- everyone at the event.
--
-- The client lookup was scoped to non-terminal events in the same fix (coexist
-- app), but native app installs keep the old lookup until a store rebuild.
-- Avoiding EVERY existing code at generation time closes the root cause for
-- web and native at once: a new event can never be assigned a code an older
-- event still holds. 32^3 = 32768 three-char codes with a four-char fallback,
-- so global uniqueness is comfortable for years.
--
-- Applied to production directly during the incident; this migration keeps the
-- repo in parity (CREATE OR REPLACE is idempotent).

create or replace function public.generate_event_check_in_code()
 returns text
 language plpgsql
as $function$
declare
  code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I to avoid confusion
  attempts int := 0;
begin
  loop
    code := '';
    for i in 1..3 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (
      select 1 from events where check_in_code = code
    );
    attempts := attempts + 1;
    if attempts > 200 then
      code := '';
      for i in 1..4 loop
        code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      end loop;
      exit when not exists (
        select 1 from events where check_in_code = code
      );
    end if;
  end loop;
  return code;
end;
$function$;
