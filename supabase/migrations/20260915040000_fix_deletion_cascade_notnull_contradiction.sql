-- GDPR account deletion has been failing on every nightly run since 2026-07-15.
--
-- WHAT WAS WRONG. Nine columns carry a foreign key declared ON DELETE SET NULL
-- while the column itself is NOT NULL. The two statements contradict each other.
-- When cleanup_deleted_accounts() deletes an expired auth.users row, Postgres
-- honours the FK action and tries to write NULL into the referencing column, the
-- NOT NULL constraint rejects that write, and the whole transaction aborts. One
-- chat message from one departing user is enough to block every account deletion
-- in the system, permanently.
--
-- MEASURED 2026-09-15 on cron.job_run_details for job 22 (gdpr-cleanup-deleted-accounts):
--   1 succeeded  (2026-07-14, the run before any pending row aged past the 30-day grace)
--  63 failed     (2026-07-15 through 2026-09-15, every run, identical error)
-- Error: null value in column "user_id" of relation "chat_messages" violates
-- not-null constraint, raised from the ON DELETE SET NULL cascade. At the time of
-- this migration 14 users sat in pending_deletion, 9 of them past the grace period,
-- the oldest having waited 93 days.
--
-- WHY DROP NOT NULL RATHER THAN CHANGE THE FK. SET NULL is the correct intent:
-- the message stays so the surrounding conversation still makes sense, and its
-- author is anonymised. CASCADE would delete other people's conversation context.
-- The application already reads these columns as nullable (src/pages/chat/
-- chat-message-list.tsx uses `msg.user_id ?? undefined`, chat-room.tsx filters on
-- `!m.user_id`), so the frontend was written for the nullable shape all along and
-- the database constraint is the half that was out of step.
--
-- SCOPE. All nine contradicting columns, not only the one that happened to hold a
-- row. Fixing chat_messages alone moves the identical failure to chat_announcements
-- the first night a departing user leaves one behind.

ALTER TABLE public.chat_messages                  ALTER COLUMN user_id          DROP NOT NULL;
ALTER TABLE public.chat_announcements             ALTER COLUMN created_by       DROP NOT NULL;
ALTER TABLE public.chat_polls                     ALTER COLUMN created_by       DROP NOT NULL;
ALTER TABLE public.chat_broadcast_log             ALTER COLUMN sent_by          DROP NOT NULL;
ALTER TABLE public.collective_event_collaborators ALTER COLUMN invited_by_user  DROP NOT NULL;
ALTER TABLE public.dev_assignments                ALTER COLUMN assigned_by      DROP NOT NULL;
ALTER TABLE public.dev_modules                    ALTER COLUMN created_by       DROP NOT NULL;
ALTER TABLE public.dev_quizzes                    ALTER COLUMN created_by       DROP NOT NULL;
ALTER TABLE public.dev_sections                   ALTER COLUMN created_by       DROP NOT NULL;

-- KNOWN AND DELIBERATELY LEFT ALONE. task_templates.created_by is NOT NULL under an
-- ON DELETE NO ACTION foreign key. That pair is self-consistent rather than
-- contradictory: it means a user who authored a task template cannot be deleted
-- until the template is reassigned. No pending-deletion user currently holds one
-- (probed 2026-09-15, 0 rows), so it blocks nothing today, but it will block a
-- future deletion and the resolution then is a product decision about template
-- ownership, not a constraint change to be made in passing.
