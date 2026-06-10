/**
 * Human-readable labels for DB enum values used across admin pages.
 */

/** Canonical display labels for unified roles */
export const ROLE_LABELS: Record<string, string> = {
  participant: 'Participant',
  member: 'Participant',
  assist_leader: 'Assistant Leader',
  co_leader: 'Co-Leader',
  leader: 'Leader',
  national_leader: 'Leader',
  manager: 'Manager',
  admin: 'Admin',
  // Legacy non-role labels kept for other uses
  social_media: 'Social Media & Content',
  collective_leader: 'Collective Leader',
  assistant_leader: 'Assistant Leader',
  other: 'Other',
}

/** Format a role string for display. Use this instead of role.replace('_', ' ') */
export function formatRole(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export const SKILL_LABELS: Record<string, string> = {
  public_speaking: 'Public Speaking',
  event_organisation: 'Event Organisation',
  event_facilitation: 'Event Facilitation',
  social_media_content: 'Social Media Content Creation',
}
