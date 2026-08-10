/* ------------------------------------------------------------------ */
/*  Client-side printable report (real "Save as PDF")                  */
/*                                                                     */
/*  The reports page Export-PDF button was a silent no-op (a `// TODO`)*/
/*  and the national dashboard's was an `alert()` stub. Both now build */
/*  a complete, branded, self-printing HTML document from the data     */
/*  already on screen and open it in a new tab, where the browser's    */
/*  print dialog offers "Save as PDF".                                 */
/*                                                                     */
/*  Client-side (not the admin-gated generate-pdf edge function) so it */
/*  works identically for a leader and an admin, respects the exact    */
/*  metric selection / scope shown, and has no server dependency.      */
/* ------------------------------------------------------------------ */

export interface ReportSection {
  heading?: string
  rows: { label: string; value: string }[]
}

function esc(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build a complete, self-printing HTML report document. Styled to match the
 * server generate-pdf chrome (editorial, print-first) so both PDF paths read
 * the same.
 */
export function buildReportHtml(opts: {
  title: string
  meta?: string[]
  sections: ReportSection[]
}): string {
  const metaHtml = (opts.meta ?? [])
    .filter(Boolean)
    .map((m) => `<p class="meta">${esc(m)}</p>`)
    .join('')

  const sectionsHtml = opts.sections
    .filter((s) => s.rows.length > 0)
    .map((s) => {
      const rows = s.rows
        .map(
          (r) =>
            `<tr><td>${esc(r.label)}</td><td class="v">${esc(r.value)}</td></tr>`,
        )
        .join('')
      return `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}<table><tbody>${rows}</tbody></table>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<style>
  :root { --ink:#1a1a1a; --ink-soft:#555; --line:#d8d8d8; }
  * { box-sizing:border-box; }
  body { font-family:"Segoe UI",Calibri,Arial,sans-serif; color:var(--ink); margin:40px 50px; font-size:11pt; line-height:1.45; }
  h1 { font-size:22pt; font-weight:700; margin:0 0 4px 0; letter-spacing:-0.01em; }
  h2 { font-size:13pt; font-weight:700; margin:28px 0 10px 0; border-bottom:1px solid var(--line); padding-bottom:6px; }
  .doc-header { margin-bottom:24px; padding-bottom:14px; border-bottom:2px solid var(--ink); }
  .meta { color:var(--ink-soft); font-size:10pt; margin:2px 0; }
  table { width:100%; border-collapse:collapse; font-size:10.5pt; margin:0 0 6px 0; }
  td { padding:6px 8px; border-bottom:1px solid #ececec; }
  td.v { text-align:right; font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
  .print-btn { display:inline-block; margin:0 0 20px 0; padding:9px 16px; font-size:11pt; font-weight:600;
               color:#fff; background:#2f6d3b; border:none; border-radius:6px; cursor:pointer; }
  @media print { .print-btn { display:none; } body { margin:0; } @page { margin:1.8cm; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
  <div class="doc-header">
    <h1>${esc(opts.title)}</h1>
    ${metaHtml}
  </div>
  ${sectionsHtml || '<p class="meta">No data for the selected filters.</p>'}
  <script>window.onload = function () { setTimeout(function () { try { window.print(); } catch (e) {} }, 400); };</script>
</body>
</html>`
}

/**
 * Open an HTML document in a new tab. MUST be called synchronously inside the
 * click handler (before any await) or the popup is blocked; pass a placeholder
 * first, then call writeReportWindow once async data resolves.
 */
export function openReportWindow(): Window | null {
  const w = window.open('', '_blank')
  if (w) {
    w.document.open()
    w.document.write(
      '<!doctype html><meta charset="utf-8"><title>Generating report</title>' +
        '<body style="font-family:sans-serif;padding:2.5rem;color:#555">Generating report&hellip;</body>',
    )
    w.document.close()
  }
  return w
}

/** Write the final report HTML into an already-open window. */
export function writeReportWindow(w: Window | null, html: string): void {
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}
