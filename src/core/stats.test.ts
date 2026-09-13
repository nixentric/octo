import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dailyActivity, stalest, summarise } from './stats.ts'
import type { EntrySummary } from './types.ts'

const entry = (slug: string, status: 'draft' | 'published', updatedAt?: string): EntrySummary => ({
  path: `content/posts/${slug}.md`,
  slug,
  sha: slug,
  title: slug,
  status,
  updatedAt,
})

test('counts drafts against published and finds the newest edit', () => {
  const s = summarise('posts', 'Posts', [
    entry('a', 'published', '2026-09-01T00:00:00Z'),
    entry('b', 'draft', '2026-09-10T00:00:00Z'),
    entry('c', 'published', '2026-08-01T00:00:00Z'),
  ])
  assert.deepEqual(s, {
    name: 'posts',
    label: 'Posts',
    total: 3,
    drafts: 1,
    published: 2,
    lastUpdated: '2026-09-10T00:00:00Z',
  })
})

test('an empty collection has no last edit', () => {
  assert.equal(summarise('posts', 'Posts', []).lastUpdated, undefined)
  assert.equal(summarise('posts', 'Posts', []).total, 0)
})

test('activity has one bucket per day, oldest first, zeros included', () => {
  const now = new Date('2026-09-13T12:00:00Z')
  const days = dailyActivity(
    ['2026-09-13T08:00:00Z', '2026-09-13T09:00:00Z', '2026-09-11T10:00:00Z'],
    5,
    now,
  )
  assert.deepEqual(days.map((d) => d.date), ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'])
  assert.deepEqual(days.map((d) => d.count), [0, 0, 1, 0, 2])
})

test('activity ignores timestamps outside the window', () => {
  const now = new Date('2026-09-13T12:00:00Z')
  const days = dailyActivity(['2026-01-01T00:00:00Z', '2026-09-13T00:00:00Z'], 3, now)
  assert.equal(days.reduce((n, d) => n + d.count, 0), 1)
})

test('stalest returns the least recently touched first', () => {
  const entries = [
    entry('fresh', 'published', '2026-09-12T00:00:00Z'),
    entry('old', 'published', '2025-01-01T00:00:00Z'),
    entry('middle', 'published', '2026-05-01T00:00:00Z'),
  ]
  assert.deepEqual(stalest(entries, 2).map((e) => e.slug), ['old', 'middle'])
})

test('stalest puts entries with no date first and leaves the input alone', () => {
  const entries = [entry('dated', 'published', '2026-09-12T00:00:00Z'), entry('undated', 'draft')]
  assert.deepEqual(stalest(entries, 5).map((e) => e.slug), ['undated', 'dated'])
  assert.equal(entries[0].slug, 'dated', 'input order is preserved')
})
