/** Unified role type - same values for profiles.role and collective_members.role */
type UnifiedRole = 'participant' | 'assist_leader' | 'co_leader' | 'leader' | 'national_leader' | 'manager' | 'admin'

/* ------------------------------------------------------------------ */
/*  Capability definitions                                             */
/* ------------------------------------------------------------------ */

export interface CapabilityDef {
  key: string
  label: string
  description: string
  category: 'users' | 'content' | 'operations' | 'finance' | 'system'
}

export const CAPABILITIES: CapabilityDef[] = [
  // Users & Collectives
  { key: 'manage_users', label: 'Manage Users', description: 'View/edit/deactivate user profiles and roles', category: 'users' },
  { key: 'manage_collectives', label: 'Manage Collectives', description: 'Create/archive/reassign collectives', category: 'users' },

  // Content & Moderation
  { key: 'manage_content', label: 'Manage Content', description: 'Moderate photos, chat messages', category: 'content' },
  { key: 'send_announcements', label: 'Send Updates', description: 'Create/publish global updates', category: 'content' },
  { key: 'manage_email', label: 'Manage Email', description: 'Create and send email campaigns', category: 'content' },

  // Operations
  { key: 'manage_events', label: 'Manage Events', description: 'Create/edit/cancel events across collectives', category: 'operations' },
  { key: 'manage_workflows', label: 'Manage Workflows', description: 'Create/edit task templates and view KPI dashboard', category: 'operations' },
  { key: 'manage_partners', label: 'Manage Partners', description: 'Partner CRUD and sponsorship management', category: 'operations' },
  { key: 'manage_challenges', label: 'Manage Challenges', description: 'Create/edit/manage challenges', category: 'operations' },
  { key: 'manage_surveys', label: 'Manage Surveys', description: 'Create/edit surveys and view responses', category: 'operations' },

  // Finance & Merch
  { key: 'manage_merch', label: 'Manage Merch', description: 'Product CRUD, inventory, orders', category: 'finance' },
  { key: 'manage_finances', label: 'Manage Finances', description: 'View donations, refunds, financial reports', category: 'finance' },
  { key: 'manage_charity', label: 'Manage Charity', description: 'Charity settings and donation config', category: 'finance' },

  // System & Reports
  { key: 'view_reports', label: 'View Reports', description: 'Access reports and analytics pages', category: 'system' },
  { key: 'manage_exports', label: 'Manage Exports', description: 'Export data from the platform', category: 'system' },
  { key: 'view_audit_log', label: 'View Audit Log', description: 'Access system audit log', category: 'system' },
  { key: 'manage_system', label: 'Manage System', description: 'System settings and configuration', category: 'system' },
]

export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key)
export type CapabilityKey = typeof CAPABILITY_KEYS[number]

/** Category labels for grouping in UI */
export const CATEGORY_LABELS: Record<CapabilityDef['category'], string> = {
  users: 'Users & Collectives',
  content: 'Content & Moderation',
  operations: 'Operations',
  finance: 'Finance & Merch',
  system: 'System & Reports',
}

/* ------------------------------------------------------------------ */
/*  Role → default capabilities mapping                                */
/* ------------------------------------------------------------------ */

/**
 * Which capabilities each role gets by default.
 *
 * 1.8.5 polish item 7 (fork_moy0xmrx_158384). Tate verbatim 16:44 AEST
 * 9 May 2026: "leaders can't see or access admin pages."
 *
 * Admin pages (under /admin) are gated by these capabilities AND the
 * minRole=manager route guard on /admin in App.tsx. Collective leaders +
 * co_leaders + assist_leaders use /leader (the leader dashboard) for
 * their collective-scoped operations. The global 'leader' role
 * (national_leader legacy alias) is therefore an audit / observation
 * tier with NO admin-page caps - global admin operations require
 * manager or admin.
 *
 * Per-user grants via staff_roles.permissions can still elevate a
 * specific leader to a specific cap if needed; the route guard at
 * /admin (minRole=manager) still blocks them from the admin shell, so
 * any per-user grant requires also bumping the user's role.
 */
export const ROLE_DEFAULT_CAPS: Record<UnifiedRole, readonly string[]> = {
  participant: [],
  assist_leader: [],
  co_leader: [],
  // Global 'leader' role (and national_leader legacy alias): no admin-page
  // caps. Collective-scope work happens through /leader + RequireLeaderAccess.
  leader: [],
  national_leader: [],
  manager: [
    'manage_users',
    'manage_collectives',
    'manage_content',
    'manage_events',
    'manage_workflows',
    'manage_partners',
    'manage_challenges',
    'manage_surveys',
    'manage_merch',
    'send_announcements',
    'manage_email',
    'manage_charity',
    'view_reports',
    'manage_exports',
    'view_audit_log',
  ],
  admin: CAPABILITY_KEYS,
}

/* ------------------------------------------------------------------ */
/*  Resolver                                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolves the final set of capabilities for a user given their global role
 * and any per-user overrides stored in staff_roles.permissions.
 *
 * Override values:
 *   true  → grant (even if role default doesn't include it)
 *   false → revoke (even if role default includes it)
 *   absent → use role default
 */
export function resolveCapabilities(
  role: string,
  overrides?: Record<string, boolean> | null,
): Set<string> {
  const normalizedRole = (role === 'national_leader' || role === 'national_staff') ? 'leader'
    : (role === 'national_admin') ? 'manager'
    : (role === 'super_admin') ? 'admin'
    : (role === 'member') ? 'participant'
    : role
  const defaults = new Set(ROLE_DEFAULT_CAPS[normalizedRole as UnifiedRole] ?? [])

  if (!overrides) return defaults

  for (const [key, granted] of Object.entries(overrides)) {
    if (granted) {
      defaults.add(key)
    } else {
      defaults.delete(key)
    }
  }

  return defaults
}

/** Simple check against a resolved capability set */
export function hasCapability(caps: Set<string>, key: string): boolean {
  return caps.has(key)
}
