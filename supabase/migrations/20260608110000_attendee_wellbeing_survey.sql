-- =====================================================================
-- Upgrade the attendee post-event survey to wellbeing-focused questions
-- =====================================================================
-- Origin: Tate 2026-06-08, Co-Exist team meeting. "Upgrade the post event
-- survey for attendees (not the leader impact one) so it has real quality
-- questions covering wellbeing - if they felt better after the event compared
-- to before, if they connected with community. Still 5 questions max."
--
-- Replaces the generic "How was the event?" set (overall_rating, felt_welcome,
-- would_return, highlight, improvement) with a wellbeing + connection set.
-- The two anchors Tate named are mood_delta (better after vs before) and
-- community_connection. nature_connection is on-brand (Co-Exist = environment),
-- would_return is the retention signal that pairs with the new metrics engine,
-- and one open reflection. Exactly 5, all attendee-facing.
--
-- Targets the canonical default attendee survey (auto-send, non-impact-form,
-- active). 0 prior responses at time of writing, so no answers are orphaned.
-- questions is read through parseSurveyQuestions() which accepts a jsonb array.
-- =====================================================================

UPDATE public.surveys
SET
  title = 'How are you feeling?',
  description = 'A quick wellbeing check-in - takes 30 seconds and helps us understand the difference today made.',
  questions = '[
    {
      "id": "mood_delta",
      "type": "scale",
      "text": "Compared to before the event, how do you feel now?",
      "required": true,
      "min_value": 1,
      "max_value": 5,
      "min_label": "Worse",
      "max_label": "A lot better"
    },
    {
      "id": "community_connection",
      "type": "scale",
      "text": "How connected to the people around you did you feel today?",
      "required": true,
      "min_value": 1,
      "max_value": 5,
      "min_label": "Not at all",
      "max_label": "Very connected"
    },
    {
      "id": "nature_connection",
      "type": "scale",
      "text": "Did today deepen your connection to nature?",
      "required": true,
      "min_value": 1,
      "max_value": 5,
      "min_label": "Not really",
      "max_label": "Definitely"
    },
    {
      "id": "would_return",
      "type": "multiple_choice",
      "text": "Would you come to another Co-Exist event?",
      "required": true,
      "options": ["Definitely", "Probably", "Maybe", "Probably not"]
    },
    {
      "id": "reflection",
      "type": "free_text",
      "text": "Anything you would like to share - a highlight, or how you are feeling now?",
      "required": false,
      "text_multiline": true,
      "placeholder": "A moment, a person, how today left you feeling..."
    }
  ]'::jsonb
WHERE auto_send_after_event = true
  AND COALESCE(is_impact_form, false) = false
  AND status = 'active';
