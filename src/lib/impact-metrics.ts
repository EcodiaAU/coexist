/**
 * Canonical Impact Metrics Registry
 *
 * Single source of truth for impact metric types and helpers.
 * The DB table `impact_metric_defs` is the live source; the
 * FALLBACK_METRIC_DEFS array provides instant rendering while
 * the DB query loads.
 *
 * "Leaders Trained/Empowered" is NOT an impact metric - it's
 * a cumulative counter in app_settings, incremented by DB trigger
 * when users are assigned leadership roles.
 */

/* ------------------------------------------------------------------ */
/*  Core types                                                         */
/* ------------------------------------------------------------------ */

export interface ImpactMetricDef {
  id?: string
  /** DB column name (built-in) or custom key */
  key: string
  /** Human-readable label */
  label: string
  /** Display unit (e.g. 'kg', 'trees') */
  unit: string
  /** Icon key for fieldIcons mapping */
  icon: string
  /** Whether this is a decimal type (true) or integer (false) */
  decimal: boolean
  /** Display order */
  sort_order: number
  /** Whether this metric is currently enabled */
  is_active: boolean
  /** Whether this can be linked to survey questions */
  survey_linkable: boolean
}

/* ------------------------------------------------------------------ */
/*  Built-in columns                                                   */
/* ------------------------------------------------------------------ */

/**
 * The set of metric keys that map to real columns on event_impact.
 * Custom (admin-created) keys are stored in the custom_metrics jsonb
 * column instead. This set is immutable - DB schema changes are the
 * only way to add a built-in column.
 */
export const BUILTIN_COLUMNS = new Set([
  'trees_planted',
  'native_plants',
  'invasive_weeds_pulled',
  'rubbish_kg',
  'area_restored_sqm',
  'wildlife_sightings',
  'coastline_cleaned_m',
  'hours_total',
  'attendees',
  // Column exists in DB (added in migration 041) but is intentionally not
  // displayed or aggregated - "leaders empowered" uses a cumulative counter
  // in app_settings (migration 073), not event logging. Listed here so
  // isBuiltinMetric() routes it correctly if it ever appears as an impact_metric
  // tag on a survey question, instead of silently dumping it into custom_metrics.
  'leaders_trained',
])

export function isBuiltinMetric(key: string): boolean {
  return BUILTIN_COLUMNS.has(key)
}

/* ------------------------------------------------------------------ */
/*  Fallback / seed definitions                                        */
/* ------------------------------------------------------------------ */

/**
 * Hardcoded fallback used as placeholderData while the DB loads.
 * Matches the seed data in migration 063.
 */
export const FALLBACK_METRIC_DEFS: readonly ImpactMetricDef[] = [
  { key: 'trees_planted',         label: 'Trees Planted',         unit: 'trees',     icon: 'tree',  decimal: false, sort_order: 0, is_active: true, survey_linkable: true  },
  { key: 'native_plants',         label: 'Native Plants',         unit: 'plants',    icon: 'leaf',  decimal: false, sort_order: 1, is_active: true, survey_linkable: true  },
  { key: 'invasive_weeds_pulled', label: 'Invasive Weeds Pulled', unit: 'weeds',     icon: 'weed',  decimal: false, sort_order: 2, is_active: true, survey_linkable: true  },
  { key: 'rubbish_kg',            label: 'Rubbish Collected',     unit: 'kg',        icon: 'trash', decimal: true,  sort_order: 3, is_active: true, survey_linkable: true  },
  { key: 'area_restored_sqm',     label: 'Area Restored',         unit: 'sqm',       icon: 'area',  decimal: true,  sort_order: 4, is_active: true, survey_linkable: true  },
  { key: 'wildlife_sightings',    label: 'Wildlife Sightings',    unit: 'sightings', icon: 'eye',   decimal: false, sort_order: 5, is_active: true, survey_linkable: true  },
  { key: 'coastline_cleaned_m',   label: 'Coastline Cleaned',     unit: 'm',         icon: 'wave',  decimal: true,  sort_order: 6, is_active: true, survey_linkable: true  },
  { key: 'hours_total',           label: 'Est. Volunteer Hours',   unit: 'hours',     icon: 'clock', decimal: true,  sort_order: 7, is_active: true, survey_linkable: false },
]

/* ------------------------------------------------------------------ */
/*  Static derived helpers (don't need the hook)                       */
/* ------------------------------------------------------------------ */

/**
 * The DB columns to SELECT when fetching event_impact for aggregation.
 * Always selects all built-in columns + custom_metrics jsonb.
 * This is static because built-in columns never change at runtime.
 */
export const IMPACT_SELECT_COLUMNS =
  Array.from(BUILTIN_COLUMNS).join(', ') + ', custom_metrics, notes, logged_by, event_id'

/**
 * Sum a specific metric key across an array of impact rows.
 * Handles both built-in columns (top-level) and custom metrics (inside jsonb).
 */
export function sumMetric(rows: Record<string, unknown>[], key: string): number {
  if (BUILTIN_COLUMNS.has(key)) {
    return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)
  }
  // Custom metric - stored in custom_metrics jsonb
  return rows.reduce((s, r) => {
    const cm = r.custom_metrics as Record<string, unknown> | null
    return s + (Number(cm?.[key]) || 0)
  }, 0)
}

/* ------------------------------------------------------------------ */
/*  Multi-host attribution                                             */
/* ------------------------------------------------------------------ */

/**
 * Per-host share of an event's impact. host_index is the deterministic order
 * of the host inside event_hosts (primary = 0). With host_count=3 and
 * host_index=0 the host gets ceil(value/3); the remaining hosts get
 * floor(value/3). Per-collective totals therefore add up exactly to the
 * full event total - no double counting, no fractional units shown.
 */
export interface EventHostShare {
  /** Total number of host collectives for the event */
  host_count: number
  /** This host's index (0 = primary). Determines who absorbs the remainder */
  host_index: number
}

/**
 * Distribute an integer value across `host_count` hosts so the per-host
 * portions sum to the original value, with the remainder going to the
 * earliest hosts (host_index 0..r-1). Decimal-style metrics (e.g. kg) are
 * rounded the same way - call sites that care about decimals should round
 * once at the very end.
 */
export function shareValue(value: number, share: EventHostShare): number {
  if (!value || share.host_count <= 1) return value
  const base = Math.floor(value / share.host_count)
  const remainder = value - base * share.host_count
  // The first `remainder` hosts (by host_index) get one extra unit.
  return share.host_index < remainder ? base + 1 : base
}

/**
 * Sum a metric across rows weighted by each row's host share. Pass a
 * `shareByEventId` map (built from the event_hosts view, scoped to the
 * collective being aggregated). Rows without a matching share entry are
 * dropped - they belong to a different collective.
 */
export function sumMetricWeighted(
  rows: Record<string, unknown>[],
  key: string,
  shareByEventId: Map<string, EventHostShare>,
): number {
  const isCustom = !BUILTIN_COLUMNS.has(key)
  let total = 0
  for (const r of rows) {
    const eventId = r.event_id as string | undefined
    if (!eventId) continue
    const share = shareByEventId.get(eventId)
    if (!share) continue
    const raw = isCustom
      ? Number((r.custom_metrics as Record<string, unknown> | null)?.[key]) || 0
      : Number(r[key]) || 0
    if (!raw) continue
    total += shareValue(raw, share)
  }
  return total
}

/**
 * Compute total estimated volunteer hours from impact rows that include
 * notes (for legacy attendance) and event timing.
 *
 * - App-logged events: hours_total is already set by the log-impact form
 * - Legacy imports: hours_total is 0; attendance is in notes, so we compute
 *   attendance × duration
 *
 * Pass rows that have: hours_total, notes, and nested events.date_start / date_end
 */
const SEED_ADMIN = 'a0000000-0000-0000-0000-000000000001'

export function computeEstimatedHours(
  rows: {
    hours_total?: number | null
    notes?: string | null
    logged_by?: string | null
    events?: { date_start: string; date_end: string | null } | null
  }[],
): number {
  let total = 0
  for (const r of rows) {
    const isLegacy =
      r.logged_by === SEED_ADMIN ||
      ((r.notes ?? '').startsWith('Legacy import'))

    if (!isLegacy) {
      // App-logged: use hours_total directly
      total += Number(r.hours_total) || 0
    } else {
      // Legacy: parse attendance from notes, multiply by duration
      const m = r.notes?.match(/Legacy import:\s*(\d+)\s*attendees/)
      const att = m ? parseInt(m[1]) : 0
      if (att <= 0) continue
      const start = r.events ? new Date(r.events.date_start).getTime() : 0
      const end = r.events?.date_end ? new Date(r.events.date_end).getTime() : 0
      const dur = end > start ? (end - start) / 3_600_000 : 3
      total += Math.round(att * dur)
    }
  }
  return Math.round(total)
}

/* ------------------------------------------------------------------ */
/*  Legacy re-exports for backward compatibility                       */
/* ------------------------------------------------------------------ */

/** @deprecated Use useImpactMetricDefs() hook for live data */
export const IMPACT_METRIC_DEFS = FALLBACK_METRIC_DEFS

/** @deprecated Use useImpactMetricDefs().validKeys */
export const VALID_IMPACT_METRICS = new Set(FALLBACK_METRIC_DEFS.map((m) => m.key))

/** @deprecated Use useImpactMetricDefs().surveyLinkableMetrics */
export const SURVEY_LINKABLE_METRICS = FALLBACK_METRIC_DEFS
  .filter((m) => m.survey_linkable)
  .map((m) => ({ key: m.key, label: m.label }))

/** @deprecated Use useImpactMetricDefs().metricLabels */
export const METRIC_LABELS: Record<string, string> = Object.fromEntries(
  FALLBACK_METRIC_DEFS.map((m) => [m.key, m.label]),
)

/** @deprecated Use useImpactMetricDefs().metricByKey */
export const METRIC_BY_KEY: Record<string, ImpactMetricDef> = Object.fromEntries(
  FALLBACK_METRIC_DEFS.map((m) => [m.key, m]),
)
