#!/usr/bin/env bash
# Deploy all Supabase Edge Functions with --no-verify-jwt
# Required because the project uses ES256 asymmetric JWTs which the
# Supabase API gateway doesn't verify correctly. Functions handle
# their own auth via GoTrue /auth/v1/user calls.

PROJECT_REF="tjutlbzekfouwsiaplbr"

FUNCTIONS=(
  create-checkout
  reserve-event-spot
  self-service-ticket
  stripe-webhook
  manage-membership-plan
  delete-user
  delete-user-data
  data-export
  generate-pdf
  send-push
  send-email
  send-campaign
  generate-email
  event-day-notify
  event-reminders
  event-post-photo-invite
  event-post-survey-invite
  notify-application
  notify-report
  excel-sync
  onedrive-mirror
)

echo "Deploying ${#FUNCTIONS[@]} functions to $PROJECT_REF..."
npx supabase functions deploy "${FUNCTIONS[@]}" --no-verify-jwt --project-ref "$PROJECT_REF"
echo "Done."
