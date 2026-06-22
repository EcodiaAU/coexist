import { useState, useEffect, useCallback } from 'react'
import { Save, Plus, Trash2, Globe } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { useToast } from '@/components/toast'
import { supabase } from '@/lib/supabase'

/**
 * Marketing-site CMS editor. Edits the content the public Next.js site at
 * coexistaus.org reads: site_content singletons, team_members, partners.
 * Gated by RequireCapability cap="manage_marketing" + the /admin minRole=manager
 * route guard. RLS on these tables also restricts writes to manager/admin.
 *
 * The CMS tables are not in the generated database.types yet, so the typed
 * client is cast for these reads/writes (type regen is a follow-up cleanup).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const CONTENT_FIELDS: { key: string; label: string; multiline?: boolean }[] = [
  { key: 'home_hero_title', label: 'Home hero title' },
  { key: 'home_hero_subtitle', label: 'Home hero subtitle', multiline: true },
  { key: 'mission', label: 'Mission', multiline: true },
  { key: 'vision', label: 'Vision', multiline: true },
  { key: 'founder_quote', label: 'Founder quote', multiline: true },
  { key: 'founder_name', label: 'Founder name & title' },
]

interface TeamMember {
  id: string
  name: string
  role_title: string | null
  team_group: string
  sort_order: number
  is_published: boolean
}
interface Partner {
  id: string
  name: string
  url: string | null
  logo_url: string | null
  sort_order: number
  is_published: boolean
}

const inputCls =
  'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400'

export default function AdminSitePage() {
  useAdminHeader('Marketing Site')
  const { toast } = useToast()
  const notify = (err: unknown, ok: string, bad: string) =>
    err ? toast.error(bad) : toast.success(ok)

  const [content, setContent] = useState<Record<string, string>>({})
  const [team, setTeam] = useState<TeamMember[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [savingContent, setSavingContent] = useState(false)

  const load = useCallback(async () => {
    const [c, t, p] = await Promise.all([
      db.from('site_content').select('key, value'),
      db.from('team_members').select('*').order('sort_order'),
      db.from('partners').select('*').order('sort_order'),
    ])
    const cm: Record<string, string> = {}
    for (const r of c.data ?? []) cm[r.key] = typeof r.value === 'string' ? r.value : (r.value?.text ?? '')
    setContent(cm)
    setTeam((t.data ?? []) as TeamMember[])
    setPartners((p.data ?? []) as Partner[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveContent() {
    setSavingContent(true)
    const rows = CONTENT_FIELDS.map((f) => ({ key: f.key, value: { text: content[f.key] ?? '' } }))
    const { error } = await db.from('site_content').upsert(rows, { onConflict: 'key' })
    setSavingContent(false)
    notify(error, 'Site copy saved', 'Could not save copy')
  }

  async function addTeam() {
    const { error } = await db
      .from('team_members')
      .insert({ name: 'New person', role_title: '', team_group: 'core', sort_order: team.length })
    if (error) return toast.error('Could not add')
    void load()
  }
  async function saveTeam(m: TeamMember) {
    const { error } = await db
      .from('team_members')
      .update({ name: m.name, role_title: m.role_title, team_group: m.team_group, sort_order: m.sort_order, is_published: m.is_published })
      .eq('id', m.id)
    notify(error, 'Saved', 'Could not save')
  }
  async function delTeam(id: string) {
    await db.from('team_members').delete().eq('id', id)
    void load()
  }

  async function addPartner() {
    const { error } = await db
      .from('partners')
      .insert({ name: 'New partner', sort_order: partners.length })
    if (error) return toast.error('Could not add')
    void load()
  }
  async function savePartner(p: Partner) {
    const { error } = await db
      .from('partners')
      .update({ name: p.name, url: p.url, logo_url: p.logo_url, sort_order: p.sort_order, is_published: p.is_published })
      .eq('id', p.id)
    notify(error, 'Saved', 'Could not save')
  }
  async function delPartner(id: string) {
    await db.from('partners').delete().eq('id', id)
    void load()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-5">
      <p className="flex items-center gap-2 text-sm text-neutral-500">
        <Globe size={16} /> Changes here update the public site at coexistaus.org within a few minutes.
      </p>

      {/* Site copy */}
      <section>
        <h2 className="text-lg font-bold text-neutral-900">Site copy</h2>
        <div className="mt-4 space-y-4">
          {CONTENT_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-semibold text-neutral-600">{f.label}</span>
              {f.multiline ? (
                <textarea
                  rows={3}
                  value={content[f.key] ?? ''}
                  onChange={(e) => setContent((c) => ({ ...c, [f.key]: e.target.value }))}
                  className={`mt-1 ${inputCls}`}
                />
              ) : (
                <input
                  value={content[f.key] ?? ''}
                  onChange={(e) => setContent((c) => ({ ...c, [f.key]: e.target.value }))}
                  className={`mt-1 ${inputCls}`}
                />
              )}
            </label>
          ))}
          <Button onClick={saveContent} loading={savingContent} variant="primary">
            <Save size={16} /> Save copy
          </Button>
        </div>
      </section>

      {/* Team */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Team members</h2>
          <Button onClick={addTeam} variant="secondary" size="sm"><Plus size={15} /> Add</Button>
        </div>
        <div className="mt-4 space-y-3">
          {team.map((m, i) => (
            <div key={m.id} className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <input className={inputCls} value={m.name} placeholder="Name"
                  onChange={(e) => setTeam((t) => t.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={inputCls} value={m.role_title ?? ''} placeholder="Role / title"
                  onChange={(e) => setTeam((t) => t.map((x, j) => (j === i ? { ...x, role_title: e.target.value } : x)))} />
                <select className={inputCls} value={m.team_group}
                  onChange={(e) => setTeam((t) => t.map((x, j) => (j === i ? { ...x, team_group: e.target.value } : x)))}>
                  <option value="board">Board</option>
                  <option value="core">Core team</option>
                  <option value="leader">Collective leader</option>
                </select>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  <input type="checkbox" checked={m.is_published}
                    onChange={(e) => setTeam((t) => t.map((x, j) => (j === i ? { ...x, is_published: e.target.checked } : x)))} />
                  Published
                </label>
                <div className="flex gap-2">
                  <Button onClick={() => saveTeam(team[i])} variant="primary" size="sm">Save</Button>
                  <Button onClick={() => delTeam(m.id)} variant="ghost" size="sm"><Trash2 size={15} /></Button>
                </div>
              </div>
            </div>
          ))}
          {team.length === 0 && <p className="text-sm text-neutral-400">No team members yet.</p>}
        </div>
      </section>

      {/* Partners */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Partners</h2>
          <Button onClick={addPartner} variant="secondary" size="sm"><Plus size={15} /> Add</Button>
        </div>
        <div className="mt-4 space-y-3">
          {partners.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <input className={inputCls} value={p.name} placeholder="Partner name"
                  onChange={(e) => setPartners((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={inputCls} value={p.url ?? ''} placeholder="Website URL"
                  onChange={(e) => setPartners((ps) => ps.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <input className={inputCls} value={p.logo_url ?? ''} placeholder="Logo URL"
                  onChange={(e) => setPartners((ps) => ps.map((x, j) => (j === i ? { ...x, logo_url: e.target.value } : x)))} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  <input type="checkbox" checked={p.is_published}
                    onChange={(e) => setPartners((ps) => ps.map((x, j) => (j === i ? { ...x, is_published: e.target.checked } : x)))} />
                  Published
                </label>
                <div className="flex gap-2">
                  <Button onClick={() => savePartner(partners[i])} variant="primary" size="sm">Save</Button>
                  <Button onClick={() => delPartner(p.id)} variant="ghost" size="sm"><Trash2 size={15} /></Button>
                </div>
              </div>
            </div>
          ))}
          {partners.length === 0 && <p className="text-sm text-neutral-400">No partners yet.</p>}
        </div>
      </section>
    </div>
  )
}
