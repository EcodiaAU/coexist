#!/usr/bin/env bash
# Deploy all Supabase Edge Functions with --no-verify-jwt
# Required because the project uses ES256 asymmetric JWTs which the
# Supabase API gateway doesn't verify correctly. Functions handle
# their own auth via GoTrue /auth/v1/user calls.

PROJECT_REF="tjutlbzekfouwsiaplbr"

FUNCTIONS=(
  create-checkout
  stripe-webhook
  delete-user
  delete-user-data
  data-export
  generate-pdf
  generate-wallet-pass
  send-push
  send-email
  send-campaign
  generate-email
  moderate-content
  event-day-notify
  event-reminders
  event-post-photo-invite
  event-post-survey-invite
  notify-application
  notify-report
  excel-sync
)

echo "Deploying ${#FUNCTIONS[@]} functions to $PROJECT_REF..."
npx supabase functions deploy "${FUNCTIONS[@]}" --no-verify-jwt --project-ref "$PROJECT_REF"
echo "Done."
