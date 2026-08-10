import { supabase } from '@/lib/supabase'

/**
 * Every event id this collective hosts - PRIMARY host or CO-HOST - resolved
 * through the `event_hosts` view (the canonical host mapping the leader Events
 * tab uses via use-leader-events.ts).
 *
 * The leader dashboard previously resolved its "upcoming events", mini-calendar
 * and "events this month" queries with a bare `.eq('collective_id', id)`, i.e.
 * PRIMARY host only, so a co-hosted event showed on /leader/events (host-aware)
 * but silently vanished from the home dashboard/calendar/count. Routing those
 * three surfaces through this helper makes them agree with the Events tab.
 */
export async function fetchHostedEventIds(collectiveId: string): Promise<string[]> {
  const { data } = await supabase
    .from('event_hosts')
    .select('event_id')
    .eq('collective_id', collectiveId)
  return (data ?? [])
    .map((r) => r.event_id)
    .filter((id): id is string => !!id)
}
