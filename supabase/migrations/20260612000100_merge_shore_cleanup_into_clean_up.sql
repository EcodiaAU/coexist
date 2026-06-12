-- =====================================================================
-- Merge shore_cleanup events into clean_up
-- =====================================================================
-- Tate 2026-06-12: "Pretty sure shore cleanup and cleanup should be
-- merged." Treat shore_cleanup as a specialised clean_up (the events
-- are beach + foreshore + waterway cleanups, conceptually the same act
-- as a clean_up just at the water's edge).
--
-- 55 events affected at write time, spread across 12 collectives:
-- Cairns (11), Northern Rivers (11), Melbourne City (10), Townsville (8),
-- Geelong (3), Perth (2), Mornington Peninsula (2), Gold Coast (2),
-- Hobart (2), Sunshine Coast (2), Adelaide (1), Brisbane (1).
--
-- The 'shore_cleanup' enum value stays defined (dropping a Postgres enum
-- value requires recreating the type with all dependent columns rewritten,
-- which is risky for a value that will simply have zero rows). The UI
-- filter list drops the option in the same PR so it's unreachable from
-- the dropdown; if any code path tries to write 'shore_cleanup' again it
-- will land in a degenerate-but-valid state until a follow-up enum
-- rewrite migration.
-- =====================================================================

UPDATE public.events
SET activity_type = 'clean_up'
WHERE activity_type = 'shore_cleanup';
