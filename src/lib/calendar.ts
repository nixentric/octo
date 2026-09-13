const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD, the form a date-only field stores. */
export const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const sameDay = (a: Date, b: Date) => toYMD(a) === toYMD(b)

/** Built from calendar parts, so it stays on midnight across daylight-saving changes. */
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** The same day n months away, clamped so 31 January + 1 month is 28 February, not 3 March. */
export function addMonths(d: Date, n: number) {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate()
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last))
}

/**
 * Reads a frontmatter date. A bare YYYY-MM-DD is a calendar day rather than UTC midnight,
 * so it is built in local time and never shows as the day before west of Greenwich.
 */
export function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v)
  if (typeof v !== 'string' || !v.trim()) return null
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  const d = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/** The six weeks shown for the month containing `day`, Monday first. */
export function monthGrid(day: Date) {
  const first = new Date(day.getFullYear(), day.getMonth(), 1)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
