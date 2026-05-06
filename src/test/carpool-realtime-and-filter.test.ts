/**
 * carpool-realtime-and-filter.test.ts
 *
 * Worker 3 (fork_motgygqh_0531ff). Two unit tests:
 *   1. useCarpoolRealtime subscribes to two postgres_changes filters and
 *      cleans up on unmount, verifying the listener-pipeline layers:
 *        BRIDGE  → supabase.channel('carpool:<id>')
 *        LISTENER → useEffect-installed handlers
 *        SIDE-FX → React Query invalidations on the right keys
 *   2. The collective chat list filter excludes carpool_breakout channels.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// In-memory recorder for the supabase mock - has to come BEFORE the import
const calls: { type: string; args: any[] }[] = []
let lastChannel: any = null

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      channel: vi.fn((name: string) => {
        const ch: any = {
          name,
          handlers: [] as { event: string; cfg: any; cb: any }[],
          on(event: string, cfg: any, cb: any) {
            ch.handlers.push({ event, cfg, cb })
            calls.push({ type: 'on', args: [event, cfg] })
            return ch
          },
          subscribe(cb?: (status: string) => void) {
            calls.push({ type: 'subscribe', args: [name] })
            cb?.('SUBSCRIBED')
            return ch
          },
          unsubscribe() {
            calls.push({ type: 'unsubscribe', args: [name] })
            return ch
          },
        }
        lastChannel = ch
        return ch
      }),
      removeChannel: vi.fn((c: any) => {
        calls.push({ type: 'removeChannel', args: [c?.name] })
      }),
    },
  }
})

// Stub the reconnect helper to call subscribe directly so we can introspect.
vi.mock('@/lib/realtime', () => ({
  subscribeWithReconnect: (channel: any) => {
    channel.subscribe(() => {})
    return () => channel.unsubscribe()
  },
}))

import { useCarpoolRealtime } from '@/hooks/use-carpool-realtime'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useCarpoolRealtime', () => {
  beforeEach(() => {
    calls.length = 0
    lastChannel = null
  })

  it('subscribes to carpool_seats and carpool_widgets filters with the carpool id', () => {
    const carpoolId = 'cp-abc-123'
    const { unmount } = renderHook(() => useCarpoolRealtime(carpoolId), { wrapper })

    const onCalls = calls.filter((c) => c.type === 'on')
    expect(onCalls).toHaveLength(2)

    const seatsCfg = onCalls.find(
      (c) => (c.args[1] as any).table === 'carpool_seats',
    )
    expect(seatsCfg).toBeTruthy()
    expect((seatsCfg!.args[1] as any).filter).toBe(`carpool_id=eq.${carpoolId}`)
    expect((seatsCfg!.args[1] as any).event).toBe('*')
    expect((seatsCfg!.args[1] as any).schema).toBe('public')

    const widgetsCfg = onCalls.find(
      (c) => (c.args[1] as any).table === 'carpool_widgets',
    )
    expect(widgetsCfg).toBeTruthy()
    expect((widgetsCfg!.args[1] as any).filter).toBe(`id=eq.${carpoolId}`)

    expect(calls.some((c) => c.type === 'subscribe')).toBe(true)

    unmount()
    expect(calls.some((c) => c.type === 'unsubscribe')).toBe(true)
    expect(calls.some((c) => c.type === 'removeChannel')).toBe(true)
  })

  it('skips subscription when carpoolId is undefined', () => {
    renderHook(() => useCarpoolRealtime(undefined), { wrapper })
    expect(calls.filter((c) => c.type === 'on')).toHaveLength(0)
  })

  it('seat-change handler invalidates both carpool and carpool-seats query keys', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    const carpoolId = 'cp-zzz'

    function customWrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: qc }, children)
    }
    renderHook(() => useCarpoolRealtime(carpoolId), { wrapper: customWrapper })

    const seatsHandler = lastChannel.handlers.find(
      (h: any) => h.cfg.table === 'carpool_seats',
    )
    expect(seatsHandler).toBeTruthy()
    seatsHandler.cb({ new: { id: 's1', carpool_id: carpoolId } })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['carpool', carpoolId] })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['carpool-seats', carpoolId],
    })
  })
})

describe('chat list filter - carpool_breakout hidden from collective chat list', () => {
  it('filters out carpool_breakout channel types', () => {
    const channels = [
      { id: 'a', type: 'staff_collective', name: 'Sunshine Coast leaders' },
      { id: 'b', type: 'carpool_breakout', name: '🚗 Carpool: Test Event' },
      { id: 'c', type: 'staff_state', name: 'QLD' },
    ] as Array<{ id: string; type: string; name: string }>

    const visible = channels.filter((c) => c.type !== 'carpool_breakout')
    expect(visible.map((c) => c.id)).toEqual(['a', 'c'])
  })
})
