/*
 * Per-event group chats (Tate 2026-09-24).
 *
 * A chat_channels row of type 'campout' is THE per-event group chat. Camp-outs
 * always get one. Since migration 20260924120000 any other event gets one when
 * its organiser switches events.group_chat_enabled on (create or edit event),
 * and its members are everyone going (registered / attended), the host
 * collective's leaders and national staff.
 *
 * The channel type is shared on purpose: event-photo RLS, the carpool widget,
 * the channel push and national-role seeding all key on 'campout', so a second
 * type would have meant re-proving each of them. What the member READS comes
 * from the event's activity_type instead, so a clean-up's chat never calls
 * itself a campout.
 */

export const CAMP_OUT = 'camp_out'

/** Strict: only a camp-out is a camp-out. An unchosen form value ('') is not. */
export function isCampoutActivity(activityType: string | null | undefined): boolean {
  return activityType === CAMP_OUT
}

/* ------------------------------------------------------------------ */
/*  The create / edit event toggle                                     */
/* ------------------------------------------------------------------ */

/** Camp-outs always have a chat, so their toggle renders on and locked. */
export function isGroupChatLocked(activityType: string | null | undefined): boolean {
  return isCampoutActivity(activityType)
}

/** The value the form sends: a camp-out is always on, anything else is the toggle. */
export function effectiveGroupChatEnabled(
  activityType: string | null | undefined,
  toggled: boolean,
): boolean {
  return isCampoutActivity(activityType) || toggled
}

export const GROUP_CHAT_TOGGLE_LABEL = 'Group chat for attendees'

export function groupChatToggleDescription(activityType: string | null | undefined): string {
  return isGroupChatLocked(activityType)
    ? 'Camp-outs always get a group chat for everyone with a ticket.'
    : 'Creates a chat for everyone registered, plus your collective leaders. People join and leave it as they register or cancel.'
}

/* ------------------------------------------------------------------ */
/*  What the chat says about itself                                    */
/* ------------------------------------------------------------------ */

export interface EventChatCopy {
  isCampout: boolean
  /** Chat list and switcher section heading. */
  sectionLabel: string
  /** Short type label on a chat list row. */
  rowLabel: string
  /** Empty-state heading inside the room. */
  title: string
  /** Empty-state line inside the room. */
  emptyBody: string
  /** Composer placeholder. */
  placeholder: string
  /** Message log aria-label. */
  ariaLabel: string
  /** Subtitle on the event page's group chat card. */
  cardSubtitle: string
}

const CAMPOUT_COPY: EventChatCopy = {
  isCampout: true,
  sectionLabel: 'Campouts',
  rowLabel: 'Campout',
  title: 'Campout group chat',
  emptyBody: 'Say hi to everyone coming to this campout',
  placeholder: 'Message the campout...',
  ariaLabel: 'Campout chat messages',
  cardSubtitle: 'Chat with everyone coming to this campout',
}

const EVENT_COPY: EventChatCopy = {
  isCampout: false,
  sectionLabel: 'Event chats',
  rowLabel: 'Event',
  title: 'Event group chat',
  emptyBody: 'Say hi to everyone coming to this event',
  placeholder: 'Message the group...',
  ariaLabel: 'Event chat messages',
  cardSubtitle: 'Chat with everyone coming to this event',
}

/**
 * Copy for an event group chat. An unknown activity type (the event embed not
 * loaded yet) keeps the camp-out wording, because every chat that existed
 * before the toggle is a camp-out's.
 */
export function eventChatCopy(activityType: string | null | undefined): EventChatCopy {
  if (activityType == null || isCampoutActivity(activityType)) return CAMPOUT_COPY
  return EVENT_COPY
}

/* ------------------------------------------------------------------ */
/*  Visibility                                                         */
/* ------------------------------------------------------------------ */

/**
 * An event group chat switched OFF with history in it is archived by the
 * database (never deleted), and an archived event chat is hidden everywhere a
 * member would find it. Carpool breakouts have their own archive sweep and
 * their visibility is deliberately left as it was.
 */
export function isArchivedEventChat(
  type: string | null | undefined,
  lifecycleStatus: string | null | undefined,
): boolean {
  return type === 'campout' && lifecycleStatus === 'archived'
}
