// _shared/graph.ts - Microsoft Graph (app-only) helpers shared across edge
// functions. Factored out of excel-sync so the OneDrive mirror can reuse the
// exact client-credentials token flow + retry/backoff. Uses the same GRAPH_*
// project secrets (Files.ReadWrite.All already granted on that app).
//
// Auth: client-credentials, scope https://graph.microsoft.com/.default.
// All folder/upload helpers are NON-DESTRUCTIVE: ensureFolderPath never
// replaces an existing folder (a 'replace' conflictBehavior on a folder would
// delete its contents), and file uploads target unique per-file names.

const GRAPH_TENANT_ID = Deno.env.get('GRAPH_TENANT_ID') ?? ''
const GRAPH_CLIENT_ID = Deno.env.get('GRAPH_CLIENT_ID') ?? ''
const GRAPH_CLIENT_SECRET = Deno.env.get('GRAPH_CLIENT_SECRET') ?? ''

const GRAPH_MAX_RETRIES = 6
const GRAPH_RETRYABLE = new Set([429, 503, 504])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GRAPH_CLIENT_ID,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: GRAPH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    },
  )
  const data = await res.json()
  if (!data.access_token) throw new Error(`Graph auth failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

interface GraphResponse { status: number; json: Record<string, unknown>; text: string }

/** Raw v1.0 Graph fetch with retry on 429/503/504 (honours Retry-After). */
export async function graph(
  token: string,
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: BodyInit } = {},
): Promise<GraphResponse> {
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`
  let last: GraphResponse = { status: 0, json: {}, text: '' }
  for (let attempt = 0; attempt <= GRAPH_MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
      body: opts.body,
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try { json = text ? JSON.parse(text) : {} } catch { /* non-JSON (e.g. 201 empty) */ }
    last = { status: res.status, json, text }
    if (res.ok) return last
    if (GRAPH_RETRYABLE.has(res.status) && attempt < GRAPH_MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500)
      await sleep(backoff)
      continue
    }
    break
  }
  return last
}

/** OneDrive/SharePoint reject \ / : * ? " < > | and trailing dots/spaces. */
export function sanitizeName(name: string): string {
  return (name || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 240) || 'Untitled'
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

export interface DriveItem { id: string; name: string; webUrl: string }

/**
 * Ensure a nested folder path exists under the drive root, creating any missing
 * segment. Never destructive: an existing folder is fetched, only truly-missing
 * segments are created (conflictBehavior 'fail' + re-GET on race).
 */
export async function ensureFolderPath(
  token: string,
  driveId: string,
  base: string,
  segments: string[],
): Promise<DriveItem> {
  let parentPath = base // e.g. "Photos"
  let folder: DriveItem | null = null
  for (const raw of segments) {
    const seg = sanitizeName(raw)
    const path = parentPath ? `${parentPath}/${seg}` : seg
    let r = await graph(token, 'GET', `/drives/${driveId}/root:/${encPath(path)}?$select=id,name,webUrl`)
    if (r.status === 404) {
      const childrenUrl = parentPath
        ? `/drives/${driveId}/root:/${encPath(parentPath)}:/children`
        : `/drives/${driveId}/root/children`
      r = await graph(token, 'POST', childrenUrl, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      })
      if (r.status === 409) {
        r = await graph(token, 'GET', `/drives/${driveId}/root:/${encPath(path)}?$select=id,name,webUrl`)
      }
    }
    if (!r.json?.id) throw new Error(`ensureFolder failed at "${seg}" (${r.status}): ${r.text.slice(0, 200)}`)
    folder = { id: r.json.id as string, name: r.json.name as string, webUrl: r.json.webUrl as string }
    parentPath = path
  }
  if (!folder) throw new Error('ensureFolderPath: no segments')
  return folder
}

const FOUR_MB = 4 * 1024 * 1024

/** Upload bytes into a folder. Simple PUT under 4MB; upload session (video) above. */
export async function uploadFile(
  token: string,
  driveId: string,
  folderId: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<DriveItem> {
  const name = sanitizeName(filename)
  if (bytes.byteLength < FOUR_MB) {
    const r = await graph(
      token,
      'PUT',
      `/drives/${driveId}/items/${folderId}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=replace`,
      { headers: { 'Content-Type': contentType || 'application/octet-stream' }, body: bytes },
    )
    if (!r.json?.id) throw new Error(`upload PUT failed (${r.status}): ${r.text.slice(0, 200)}`)
    return { id: r.json.id as string, name: r.json.name as string, webUrl: r.json.webUrl as string }
  }
  // Large file: create an upload session, PUT in <=60MiB chunks with Content-Range.
  const sess = await graph(
    token,
    'POST',
    `/drives/${driveId}/items/${folderId}:/${encodeURIComponent(name)}:/createUploadSession`,
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
    },
  )
  const uploadUrl = sess.json?.uploadUrl as string | undefined
  if (!uploadUrl) throw new Error(`createUploadSession failed (${sess.status}): ${sess.text.slice(0, 200)}`)
  const CHUNK = 10 * 1024 * 1024 // 10MiB (must be a multiple of 320KiB; 10MiB qualifies)
  const total = bytes.byteLength
  let start = 0
  let final: GraphResponse = { status: 0, json: {}, text: '' }
  while (start < total) {
    const end = Math.min(start + CHUNK, total)
    const chunk = bytes.subarray(start, end)
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${start}-${end - 1}/${total}`,
      },
      body: chunk,
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try { json = text ? JSON.parse(text) : {} } catch { /* 202 Accepted has JSON progress */ }
    final = { status: res.status, json, text }
    if (!res.ok && res.status !== 202) throw new Error(`upload chunk failed (${res.status}): ${text.slice(0, 200)}`)
    start = end
  }
  if (!final.json?.id) throw new Error(`upload session did not finalize (${final.status})`)
  return { id: final.json.id as string, name: final.json.name as string, webUrl: final.json.webUrl as string }
}

/** Create (or return) a sharing link on a drive item. */
export async function createShareLink(
  token: string,
  driveId: string,
  itemId: string,
  type: 'view' | 'edit' = 'view',
  scope: 'anonymous' | 'organization' = 'organization',
): Promise<string | null> {
  const r = await graph(token, 'POST', `/drives/${driveId}/items/${itemId}/createLink`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, scope }),
  })
  const link = r.json?.link as { webUrl?: string } | undefined
  return link?.webUrl ?? null
}
