/**
 * CSV cell hardening shared across every admin export.
 *
 * Spreadsheet apps (Excel, Google Sheets, LibreOffice) treat a cell whose
 * first character is one of = + - @ TAB CR as a formula and execute it on
 * open. Every user-controllable field we export (names, addresses, survey
 * answers, dietary/medical notes) is therefore a formula-injection vector
 * that can exfiltrate adjacent cells or run WEBSERVICE()/HYPERLINK()/cmd
 * payloads. Prefix an apostrophe so the cell renders verbatim as text.
 *
 * Origin: D1 shipped this guard for the attendee export
 * (use-event-attendees-export.ts) on 2026-08-10; this module lifts the same
 * logic to a single home so the orders CSV and survey-results CSV share it.
 */

const FORMULA_LEADERS = /^[=+\-@\t\r]/

/** Neutralise a leading spreadsheet formula trigger by apostrophe-prefixing. */
export function neutralizeCsvFormula(value: string): string {
  return FORMULA_LEADERS.test(value) ? `'${value}` : value
}

/**
 * Fully escape one CSV cell: neutralise a formula leader, then RFC-4180 quote
 * when the value contains a quote, comma, or newline.
 */
export function escapeCsvCell(value: unknown): string {
  const v = neutralizeCsvFormula(String(value ?? ''))
  if (v.includes('"') || v.includes(',') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}
