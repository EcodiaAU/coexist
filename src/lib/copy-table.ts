/**
 * Clipboard helpers for the admin stats surface.
 *
 * Staff paste these into grant acquittals, applications and impact
 * reports (Google Docs, Word, Sheets). So we put BOTH a rich HTML
 * table (pastes as a real formatted table in Docs/Word) and a
 * tab-separated plain-text version (pastes as cells in Sheets/Excel)
 * on the clipboard. No Co-Exist branding - it is the recipient's
 * document, not ours.
 */

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export interface TableSpec {
  /** Optional caption shown above the table (e.g. the scope line). */
  title?: string
  headers: string[]
  rows: (string | number)[][]
}

/** Build a clean, unbranded HTML table string. */
export function tableToHtml(spec: TableSpec): string {
  const th = 'style="text-align:left;padding:7px 14px;border:1px solid #d8d8d2;background:#f3f4ef;font-weight:600;"'
  const td = 'style="padding:7px 14px;border:1px solid #d8d8d2;"'
  const tdNum = 'style="padding:7px 14px;border:1px solid #d8d8d2;text-align:right;"'
  const isNum = (c: unknown) => typeof c === 'number'
  return (
    `<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f2421;">` +
    (spec.title ? `<caption style="text-align:left;font-weight:700;padding:0 0 6px;font-size:13px;">${esc(spec.title)}</caption>` : '') +
    `<thead><tr>${spec.headers.map((h) => `<th ${th}>${esc(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${spec.rows
      .map((r) => `<tr>${r.map((c) => `<td ${isNum(c) ? tdNum : td}>${esc(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`
  )
}

/** Build the tab-separated plain-text fallback. */
export function tableToTsv(spec: TableSpec): string {
  const lines: string[] = []
  if (spec.title) lines.push(spec.title)
  lines.push(spec.headers.join('\t'))
  for (const r of spec.rows) lines.push(r.map((c) => String(c ?? '')).join('\t'))
  return lines.join('\n')
}

/** Build a comma-separated CSV (RFC-4180 quoting). */
export function tableToCsv(spec: TableSpec): string {
  const q = (c: unknown) => {
    const s = String(c ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = []
  lines.push(spec.headers.map(q).join(','))
  for (const r of spec.rows) lines.push(r.map(q).join(','))
  return lines.join('\n')
}

/**
 * Copy one or more tables to the clipboard as rich HTML + TSV.
 * Returns true if the rich path succeeded, false if it fell back to
 * plain text.
 */
export async function copyTables(specs: TableSpec[]): Promise<boolean> {
  const html = specs.map(tableToHtml).join('<br><br>')
  const tsv = specs.map(tableToTsv).join('\n\n')
  try {
    if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ])
      return true
    }
  } catch {
    /* fall through to plain text */
  }
  await navigator.clipboard.writeText(tsv)
  return false
}

/** Trigger a CSV file download in the browser. */
export function downloadCsv(filename: string, spec: TableSpec): void {
  const blob = new Blob([tableToCsv(spec)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
