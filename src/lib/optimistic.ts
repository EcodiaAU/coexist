import type { QueryClient, QueryKey } from '@tanstack/react-query'

/* ------------------------------------------------------------------ */
/*  Optimistic mutation helpers                                        */
/*                                                                     */
/*  One canonical shape for TanStack Query optimistic updates so every */
/*  mutation behaves identically: cancel in-flight refetches, snapshot */
/*  the current cache, apply the optimistic patch, roll back on error, */
/*  reconcile on settle. Doctrine: optimistic surfaces must render     */
/*  identically to confirmed ones (patterns/optimistic-surfaces-...).  */
/*                                                                     */
/*  Usage in a useMutation:                                            */
/*                                                                     */
/*    const opt = makeOptimistic<Row[]>(queryClient, ['admin-events']) */
/*    return useMutation({                                             */
/*      mutationFn: ...,                                               */
/*      onMutate: (vars) =>                                            */
/*        opt.patch((rows) => rows?.map(r =>                           */
/*          r.id === vars.id ? { ...r, ...vars } : r)),               */
/*      onError: (_e, _v, ctx) => opt.rollback(ctx),                   */
/*      onSettled: () => opt.invalidate(),                            */
/*    })                                                               */
/* ------------------------------------------------------------------ */

export interface OptimisticContext<T> {
  /** Snapshots of every query matched by the key, for rollback. */
  previous: Array<[QueryKey, T | undefined]>
}

export interface OptimisticHandle<T> {
  /**
   * Cancel in-flight refetches, snapshot the current cache, and apply
   * `updater` to every query matching the key. Returns a context to pass
   * to `rollback`. Call from `onMutate` and return its awaited result.
   */
  patch: (updater: (current: T | undefined) => T | undefined) => Promise<OptimisticContext<T>>
  /** Restore the snapshot taken in `patch`. Call from `onError`. */
  rollback: (ctx: OptimisticContext<T> | undefined) => void
  /** Reconcile with the server. Call from `onSettled`. */
  invalidate: () => void
}

/**
 * Build an optimistic handle bound to a query key (exact or prefix — it uses
 * `setQueriesData`, so a partial key patches every matching query).
 */
export function makeOptimistic<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
): OptimisticHandle<T> {
  return {
    async patch(updater) {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueriesData<T>({ queryKey })
      queryClient.setQueriesData<T>({ queryKey }, (current) => updater(current))
      return { previous }
    },
    rollback(ctx) {
      if (!ctx) return
      for (const [key, snapshot] of ctx.previous) {
        queryClient.setQueryData(key, snapshot)
      }
    },
    invalidate() {
      queryClient.invalidateQueries({ queryKey })
    },
  }
}

/* ---- List convenience updaters -------------------------------------- */

/** Replace/patch a single item in a list by id. */
export function patchItem<T extends { id: string }>(id: string, updates: Partial<T>) {
  return (rows: T[] | undefined): T[] | undefined =>
    rows?.map((r) => (r.id === id ? { ...r, ...updates } : r))
}

/** Remove a single item from a list by id. */
export function removeItem<T extends { id: string }>(id: string) {
  return (rows: T[] | undefined): T[] | undefined => rows?.filter((r) => r.id !== id)
}

/** Prepend a (temp) item to a list. */
export function prependItem<T>(item: T) {
  return (rows: T[] | undefined): T[] | undefined => [item, ...(rows ?? [])]
}
