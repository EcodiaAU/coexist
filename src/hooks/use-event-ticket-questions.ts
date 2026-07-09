import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Per-event custom ticket questions (Eventbrite parity). Organisers define
 * questions on an event; buyers answer them at ticket purchase; answers are
 * stored on event_tickets.custom_answers and pulled into the attendee export.
 *
 * RLS: readable by authed users and by anon for public+published+ticketed
 * events (guest checkout renders them), managed by event creator / staff.
 */

export type TicketQuestionType =
  | 'short_text'
  | 'long_text'
  | 'boolean'
  | 'single_select'
  | 'multi_select'

export interface EventTicketQuestion {
  id: string
  event_id: string
  prompt: string
  help_text: string | null
  question_type: TicketQuestionType
  options: string[]
  required: boolean
  is_active: boolean
  sort_order: number
}

/** An answer value keyed by question id. */
export type TicketAnswers = Record<string, string | string[] | boolean | number>

export function useEventTicketQuestions(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['event-ticket-questions', eventId],
    queryFn: async (): Promise<EventTicketQuestion[]> => {
      if (!eventId) return []
      const { data, error } = await supabase
        .from('event_ticket_questions')
        .select('id, event_id, prompt, help_text, question_type, options, required, is_active, sort_order')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []).map((q) => ({
        ...(q as Omit<EventTicketQuestion, 'options'>),
        options: Array.isArray((q as { options?: unknown }).options)
          ? ((q as { options: string[] }).options)
          : [],
      }))
    },
    enabled: enabled && !!eventId,
    staleTime: 60 * 1000,
  })
}

export interface TicketQuestionDraft {
  /** DB id for existing rows, temp id for new ones */
  id: string
  prompt: string
  help_text: string
  question_type: TicketQuestionType
  options: string[]
  required: boolean
  sort_order: number
  /** True if this row already exists in the database */
  _persisted?: boolean
}

const SELECT_TYPES: TicketQuestionType[] = ['single_select', 'multi_select']

export function useSaveTicketQuestions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      eventId,
      questions,
      removedIds,
    }: {
      eventId: string
      questions: TicketQuestionDraft[]
      removedIds: string[]
    }) => {
      // Deactivate removed questions (soft delete so historic answers stay resolvable)
      if (removedIds.length > 0) {
        const { error: delErr } = await supabase
          .from('event_ticket_questions')
          .update({ is_active: false })
          .in('id', removedIds)
        if (delErr) throw delErr
      }

      const valid = questions.filter((q) => q.prompt.trim())
      for (let idx = 0; idx < valid.length; idx++) {
        const q = valid[idx]
        const row = {
          event_id: eventId,
          prompt: q.prompt.trim(),
          help_text: q.help_text.trim() || null,
          question_type: q.question_type,
          options: SELECT_TYPES.includes(q.question_type)
            ? q.options.map((o) => o.trim()).filter(Boolean)
            : [],
          required: q.required,
          sort_order: idx,
          is_active: true,
        }

        if (q._persisted) {
          const { error } = await supabase
            .from('event_ticket_questions')
            .update(row)
            .eq('id', q.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('event_ticket_questions').insert(row)
          if (error) throw error
        }
      }

      return { eventId }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['event-ticket-questions', result.eventId] })
    },
  })
}
