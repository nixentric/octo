import type { EntrySummary } from './types.ts'

export type CollectionStats = {
  name: string
  label: string
  total: number
  drafts: number
  published: number
  lastUpdated?: string
}

export type DayCount = { date: string; count: number }

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function summarise(name: string, label: string, entries: EntrySummary[]): CollectionStats {
  const drafts = entries.filter((e) => e.status === 'draft').length
  const dates = entries.map((e) => e.updatedAt).filter((d): d is string => !!d)
  return {
    name,
    label,
    total: entries.length,
    drafts,
    published: entries.length - drafts,
    lastUpdated: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined,
  }
}

/**
 * One bucket per day up to and including today, oldest first, so a chart can
 * render a continuous axis without gaps where nothing happened.
 */
export function dailyActivity(timestamps: string[], days: number, now = new Date()): DayCount[] {
  const counts = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    counts.set(isoDay(d), 0)
  }
  for (const t of timestamps) {
    const day = isoDay(new Date(t))
    if (counts.has(day)) counts.set(day, counts.get(day)! + 1)
  }
  return [...counts].map(([date, count]) => ({ date, count }))
}

/** Entries untouched the longest, oldest first. Entries with no date come first. */
export function stalest(entries: EntrySummary[], limit: number): EntrySummary[] {
  return [...entries]
    .sort((a, b) => (a.updatedAt ?? '') < (b.updatedAt ?? '') ? -1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? 1 : 0)
    .slice(0, limit)
}
