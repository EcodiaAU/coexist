import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { useToast } from '@/components/toast'
import { queueOfflineAction } from '@/lib/offline-sync'

interface ReportContentParams {
  contentId: string
  contentType: 'chat_message' | 'photo' | 'post' | 'profile'
  reason: string
}

export function useReportContent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ contentId, contentType, reason }: ReportContentParams) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('report-content', {
          contentId,
          contentType,
          reason,
          reporterId: user.id,
        })
        return
      }

      const { data, error } = await supabase
        .from('content_reports')
        .insert({
          content_id: contentId,
          content_type: contentType,
          reason,
          reporter_id: user.id,
          status: 'pending',
        })
        .select('id')
        .single()

      if (error) throw error

      // Notify admins via edge function (best-effort, don't fail the report)
      try {
        await supabase.functions.invoke('notify-report', {
          body: {
            record: {
              id: data.id,
              content_id: contentId,
              content_type: contentType,
              reason,
              reporter_id: user.id,
            },
          },
        })
      } catch (notifyErr) {
        console.error('Failed to notify admins:', notifyErr)
      }
    },
    onSuccess: () => {
      if (isOffline) {
        toast.info('Report saved offline - will be submitted when back online')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] })
    },
  })
}
