import { describe, it, expect, beforeEach } from 'vitest'
import {
  queueOfflineCheckIn,
  getPendingCheckInCount,
  queueOfflineAction,
  getPendingActionCount,
  getPendingActions,
  saveChatDraft,
  getChatDraft,
  removeChatDraft,
  setLastSyncTime,
  getLastSyncTime,
  persistQueryCache,
  restoreQueryCache,
} from '@/lib/offline-sync'

describe('offline-sync', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('offline check-in queue', () => {
    it('queues a check-in', () => {
      expect(getPendingCheckInCount()).toBe(0)
      queueOfflineCheckIn('event-1', 'user-1')
      expect(getPendingCheckInCount()).toBe(1)
    })

    it('deduplicates identical check-ins', () => {
      queueOfflineCheckIn('event-1', 'user-1')
      queueOfflineCheckIn('event-1', 'user-1')
      expect(getPendingCheckInCount()).toBe(1)
    })

    it('queues different event/user combinations', () => {
      queueOfflineCheckIn('event-1', 'user-1')
      queueOfflineCheckIn('event-2', 'user-1')
      queueOfflineCheckIn('event-1', 'user-2')
      expect(getPendingCheckInCount()).toBe(3)
    })
  })

  describe('generic offline action queue', () => {
    it('queues an action and returns an id', () => {
      const id = queueOfflineAction('chat-message', { content: 'hello' })
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
    })

    it('increments pending action count', () => {
      expect(getPendingActionCount()).toBe(0)
      queueOfflineAction('chat-message', { content: 'hello' })
      expect(getPendingActionCount()).toBe(1)
    })

    it('returns pending actions', () => {
      queueOfflineAction('chat-message', { content: 'msg1' })
      queueOfflineAction('check-in', { eventId: 'e1' })
      const actions = getPendingActions()
      expect(actions).toHaveLength(2)
      expect(actions[0].type).toBe('chat-message')
      expect(actions[1].type).toBe('check-in')
    })

    it('combined count includes both queues', () => {
      queueOfflineCheckIn('event-1', 'user-1')
      queueOfflineAction('chat-message', { content: 'hello' })
      expect(getPendingActionCount()).toBe(2)
    })
  })

  describe('new offline action types', () => {
    it('queues profile-update actions', () => {
      const id = queueOfflineAction('profile-update', {
        userId: 'user-1',
        updates: { display_name: 'New Name' },
      })
      expect(id).toMatch(/^profile-update-/)
      expect(getPendingActionCount()).toBe(1)
      const actions = getPendingActions()
      expect(actions[0].type).toBe('profile-update')
      // queueOfflineAction auto-stamps a client_action_id (1.8.6 feature 4
      // for server-side replay idempotency via migration 20260509100000).
      // Use objectContaining so the assertion stays focused on caller intent.
      expect(actions[0].payload).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          updates: { display_name: 'New Name' },
        }),
      )
      expect(actions[0].payload.client_action_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    })

    it('queues task-complete actions', () => {
      queueOfflineAction('task-complete', {
        instanceId: 'task-1',
        userId: 'user-1',
        notes: 'Done offline',
        timestamp: '2026-03-31T00:00:00.000Z',
      })
      const actions = getPendingActions()
      expect(actions[0].type).toBe('task-complete')
      expect(actions[0].payload.instanceId).toBe('task-1')
    })

    it('queues task-skip actions', () => {
      queueOfflineAction('task-skip', { instanceId: 'task-2' })
      expect(getPendingActions()[0].type).toBe('task-skip')
    })

    it('queues todo CRUD actions', () => {
      queueOfflineAction('todo-create', { userId: 'u1', title: 'Test todo' })
      queueOfflineAction('todo-update', { id: 'td1', title: 'Updated' })
      queueOfflineAction('todo-toggle', { id: 'td1', completed: true, timestamp: '2026-03-31T00:00:00.000Z' })
      queueOfflineAction('todo-delete', { id: 'td1' })

      const actions = getPendingActions()
      expect(actions).toHaveLength(4)
      expect(actions.map((a) => a.type)).toEqual([
        'todo-create', 'todo-update', 'todo-toggle', 'todo-delete',
      ])
    })

    it('queues report-content actions', () => {
      queueOfflineAction('report-content', {
        contentId: 'msg-1',
        contentType: 'chat_message',
        reason: 'Spam',
        reporterId: 'user-1',
      })
      expect(getPendingActions()[0].payload.contentType).toBe('chat_message')
    })

    it('queues block/unblock user actions', () => {
      queueOfflineAction('block-user', { blockerId: 'u1', blockedId: 'u2', reason: 'Rude' })
      queueOfflineAction('unblock-user', { blockerId: 'u1', blockedId: 'u2' })
      const actions = getPendingActions()
      expect(actions).toHaveLength(2)
      expect(actions[0].type).toBe('block-user')
      expect(actions[1].type).toBe('unblock-user')
    })

    it('queues notification mark-read actions', () => {
      queueOfflineAction('mark-notification-read', { notificationId: 'n1', timestamp: '2026-03-31T00:00:00.000Z' })
      queueOfflineAction('mark-all-notifications-read', { userId: 'u1', timestamp: '2026-03-31T00:00:00.000Z' })
      expect(getPendingActions()).toHaveLength(2)
    })

    it('queues log-impact actions', () => {
      queueOfflineAction('log-impact', {
        impactData: { event_id: 'evt-1', trees_planted: 50 },
        userId: 'user-1',
      })
      expect(getPendingActions()[0].payload.impactData).toEqual({
        event_id: 'evt-1',
        trees_planted: 50,
      })
    })

    it('queues bulk-check-in actions for the leader event-day "Mark All Present" path', () => {
      queueOfflineAction('bulk-check-in', {
        eventId: 'evt-1',
        timestamp: '2026-05-09T07:00:00.000Z',
      })
      const actions = getPendingActions()
      expect(actions[0].type).toBe('bulk-check-in')
      expect(actions[0].payload.eventId).toBe('evt-1')
    })

    it('queues promote-waitlist actions for the leader event-day path', () => {
      queueOfflineAction('promote-waitlist', {
        eventId: 'evt-1',
        userId: 'user-1',
      })
      const actions = getPendingActions()
      expect(actions[0].type).toBe('promote-waitlist')
      expect(actions[0].payload.userId).toBe('user-1')
    })

    it('queues survey-response actions', () => {
      queueOfflineAction('survey-response', {
        surveyId: 's1',
        userId: 'u1',
        answers: { q1: 'Yes', q2: 5 },
        eventId: 'evt-1',
      })
      expect(getPendingActions()[0].type).toBe('survey-response')
    })

    it('queues announcement-response actions', () => {
      queueOfflineAction('announcement-response', {
        announcementId: 'a1',
        userId: 'u1',
        response: 'attending',
      })
      expect(getPendingActions()[0].payload.response).toBe('attending')
    })

    it('queues poll-vote actions', () => {
      queueOfflineAction('poll-vote', {
        pollId: 'p1',
        userId: 'u1',
        optionIds: ['opt1', 'opt2'],
        allowMultiple: true,
      })
      expect(getPendingActions()[0].payload.optionIds).toEqual(['opt1', 'opt2'])
    })

    it('queues module-progress actions', () => {
      queueOfflineAction('module-progress', {
        userId: 'u1',
        moduleId: 'm1',
        status: 'in_progress',
        progressPct: 50,
      })
      expect(getPendingActions()[0].type).toBe('module-progress')
    })

    it('queues section-progress actions', () => {
      queueOfflineAction('section-progress', {
        userId: 'u1',
        sectionId: 's1',
        status: 'completed',
        modulesCompleted: 5,
        modulesTotal: 5,
        progressPct: 100,
      })
      expect(getPendingActions()[0].payload.progressPct).toBe(100)
    })

    it('queues quiz-submit actions', () => {
      queueOfflineAction('quiz-submit', {
        userId: 'u1',
        quizId: 'q1',
        scorePct: 80,
        pointsEarned: 8,
        pointsTotal: 10,
        passed: true,
        timeSpentSec: 120,
        responses: [
          { question_id: 'q1', selected_option_ids: ['a'], is_correct: true, points_earned: 1 },
        ],
      })
      expect(getPendingActions()[0].type).toBe('quiz-submit')
      expect(getPendingActions()[0].payload.passed).toBe(true)
    })

    it('preserves action ordering across types', () => {
      queueOfflineAction('chat-message', { content: 'hi' })
      queueOfflineAction('task-complete', { instanceId: 't1' })
      queueOfflineAction('profile-update', { userId: 'u1', updates: {} })
      queueOfflineAction('todo-create', { userId: 'u1', title: 'x' })

      const types = getPendingActions().map((a) => a.type)
      expect(types).toEqual(['chat-message', 'task-complete', 'profile-update', 'todo-create'])
    })

    it('each action gets a unique id with type prefix', () => {
      const id1 = queueOfflineAction('profile-update', { userId: 'u1', updates: {} })
      const id2 = queueOfflineAction('task-complete', { instanceId: 't1' })
      expect(id1).toMatch(/^profile-update-/)
      expect(id2).toMatch(/^task-complete-/)
      expect(id1).not.toBe(id2)
    })
  })

  describe('chat draft persistence', () => {
    it('saves and retrieves a draft', () => {
      saveChatDraft('col-1', 'Hello world')
      const draft = getChatDraft('col-1')
      expect(draft).not.toBeNull()
      expect(draft!.content).toBe('Hello world')
      expect(draft!.collectiveId).toBe('col-1')
    })

    it('saves draft with replyToId', () => {
      saveChatDraft('col-1', 'Reply text', 'msg-99')
      const draft = getChatDraft('col-1')
      expect(draft!.replyToId).toBe('msg-99')
    })

    it('returns null for unknown collective', () => {
      expect(getChatDraft('nonexistent')).toBeNull()
    })

    it('removes draft when content is empty/whitespace', () => {
      saveChatDraft('col-1', 'Hello')
      saveChatDraft('col-1', '   ')
      expect(getChatDraft('col-1')).toBeNull()
    })

    it('removes a draft', () => {
      saveChatDraft('col-1', 'Hello')
      removeChatDraft('col-1')
      expect(getChatDraft('col-1')).toBeNull()
    })
  })

  describe('last sync time', () => {
    it('returns null when never synced', () => {
      expect(getLastSyncTime()).toBeNull()
    })

    it('sets and gets sync time', () => {
      setLastSyncTime()
      const time = getLastSyncTime()
      expect(time).toBeTruthy()
      expect(new Date(time!).getTime()).toBeGreaterThan(0)
    })
  })

  describe('query cache persistence', () => {
    it('persists and restores cache', () => {
      const state = { queries: [{ key: 'test', data: 42 }] }
      persistQueryCache(state)
      const restored = restoreQueryCache()
      expect(restored).toEqual(state)
    })

    it('returns null when no cache exists', () => {
      expect(restoreQueryCache()).toBeNull()
    })

    it('returns null for corrupted cache', () => {
      localStorage.setItem('coexist-query-cache', 'not-json{{{')
      expect(restoreQueryCache()).toBeNull()
    })
  })
})
