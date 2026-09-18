import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * A campout group chat must follow its event.
 *
 * Reported 2026-09-18 (Angelica Choppin, and Tate the same morning): the Wild
 * Mountains campout chat still carried the generic title after the event was
 * renamed for a special camp. Root cause was that chat_channels.name is a
 * denormalised copy re-synced only on a title edit, so a rename that predated
 * the sync rule - or any PATCH that did not include `title` - left it stale.
 */

const MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260918020000_campout_chat_follows_its_event.sql',
)
const sql = readFileSync(MIGRATION, 'utf8')
const hook = readFileSync(resolve(__dirname, '../hooks/use-staff-channels.ts'), 'utf8')
const survey = readFileSync(resolve(__dirname, '../pages/events/profile-survey.tsx'), 'utf8')

describe('campout chat name follows the event', () => {
  it('heals the stored name inside ensure, not only on a title edit', () => {
    const ensure = sql.slice(
      sql.indexOf('FUNCTION public.ensure_campout_chat_channel'),
      sql.indexOf('FUNCTION public.tg_ensure_campout_chat_channel'),
    )
    expect(ensure).toMatch(/UPDATE public\.chat_channels\s+SET name = v_title/)
    expect(ensure).toContain('name IS DISTINCT FROM v_title')
  })

  it('fires on ANY event update, because a PATCH omits untouched columns', () => {
    expect(sql).toContain('AFTER INSERT OR UPDATE ON public.events')
    // The old narrow column list is what let an image-only edit skip the sync.
    expect(sql).not.toContain('UPDATE OF activity_type, status, title ON public.events')
  })

  it('trims the title, so a trailing space never reaches a chat name', () => {
    expect(sql).toContain('btrim(COALESCE(v_event.title')
    expect(sql).toMatch(/UPDATE public\.events\s+SET title = btrim\(title\)/)
  })

  it('derives the displayed name from the event, so the screen cannot drift', () => {
    expect(hook).toContain('events(title, cover_image_url')
    expect(hook).toContain('const eventTitle = ch.events?.title?.trim()')
    expect(hook).toContain('name: eventTitle || ch.name')
  })
})

describe('national-role admins can see every campout chat', () => {
  it('seeds a profile BORN with a national role, not only one promoted later', () => {
    expect(sql).toContain('AFTER INSERT ON public.profiles')
    expect(sql).toContain('seed_new_national_into_campout_channels')
  })

  it('tops up existing channels in the same migration', () => {
    const backfill = sql.slice(sql.indexOf('-- 4. Backfill'))
    expect(backfill).toContain('_is_national_role(p.role::text)')
    expect(backfill).toContain('ON CONFLICT DO NOTHING')
  })
})

describe('membership is NOT widened to invited-but-not-registered people', () => {
  it('never adds event_registrations rows to a campout chat', () => {
    // Murbpook carries 134 'invited' registrations. They are not attendees and
    // must stay out of a paying campout's group chat.
    expect(sql).not.toMatch(/INSERT INTO public\.chat_channel_members[\s\S]{0,400}event_registrations/)
  })

  it('still keys membership on a live ticket', () => {
    expect(sql).toContain("t.status IN ('confirmed', 'checked_in')")
  })
})

describe('the camp-out survey reveals why it refused to submit', () => {
  it('toasts, scrolls and focuses instead of returning silently', () => {
    expect(survey).toContain('const revealError = (')
    expect(survey).toContain('toast.error(message)')
    expect(survey).toContain('scrollIntoView(')
    expect(survey).toContain("focusable?.focus({ preventScroll: true })")
  })

  it('points at the FIRST blank of dietary/medical', () => {
    expect(survey).toContain("const target = !dietaryRequirements.trim() ? dietaryRef : medicalRef")
  })

  it('routes every early return through revealError, leaving none silent', () => {
    const submit = survey.slice(
      survey.indexOf('const handleSubmit'),
      survey.indexOf('const handleSkip'),
    )
    const setters = submit.match(/set(ReqError|EmailError|AgeError)\(/g) ?? []
    // Each error setter appears only as a clear-to-null, never as a bare
    // set-then-return: the failure paths go through revealError.
    const bareFailures = submit.match(/set(ReqError|EmailError|AgeError)\('/g) ?? []
    expect(setters.length).toBeGreaterThan(0)
    expect(bareFailures).toHaveLength(0)
    expect((submit.match(/revealError\(/g) ?? []).length).toBe(3)
  })
})
