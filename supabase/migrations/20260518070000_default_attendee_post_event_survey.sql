-- Ensure there is at least one auto-send, active, attendee-facing
-- post-event survey. Without this, the `useEventSurvey` attendee mode
-- returns null and the post-event banner never fires.
--
-- This survey is generic (no activity_type, so it applies to all events
-- when no activity-specific survey is configured). Admins can customise
-- via /admin/surveys. The migration is idempotent: only inserts if no
-- attendee-facing auto-send survey is currently active.
INSERT INTO public.surveys (
  title,
  description,
  questions,
  status,
  is_active,
  is_impact_form,
  auto_send_after_event,
  activity_type
)
SELECT
  'How was the event?',
  'A quick check-in - takes 30 seconds and helps the leaders learn what worked.',
  '[
    {
      "id": "overall_rating",
      "type": "scale",
      "text": "How would you rate the event overall?",
      "required": true,
      "min_value": 1,
      "max_value": 5,
      "min_label": "Not great",
      "max_label": "Loved it"
    },
    {
      "id": "felt_welcome",
      "type": "scale",
      "text": "Did you feel welcomed by the group?",
      "required": true,
      "min_value": 1,
      "max_value": 5,
      "min_label": "Not really",
      "max_label": "Totally"
    },
    {
      "id": "would_return",
      "type": "multiple_choice",
      "text": "Would you come to another Co-Exist event?",
      "required": true,
      "options": ["Definitely", "Probably", "Maybe", "Probably not"]
    },
    {
      "id": "highlight",
      "type": "free_text",
      "text": "What was your highlight?",
      "required": false,
      "text_multiline": true,
      "placeholder": "Anything that stood out - a moment, a person, a feeling..."
    },
    {
      "id": "improvement",
      "type": "free_text",
      "text": "Anything we could improve next time?",
      "required": false,
      "text_multiline": true,
      "placeholder": "Honest feedback welcome - it helps the next event be better."
    }
  ]'::jsonb,
  'active',
  true,
  false,
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.surveys
  WHERE auto_send_after_event = true
    AND status = 'active'
    AND COALESCE(is_impact_form, false) = false
);
