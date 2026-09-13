import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addMonths, monthGrid, parseDate, toYMD } from './calendar.ts'

test('monthGrid shows six weeks from the Monday on or before the 1st', () => {
  const september = monthGrid(new Date(2026, 8, 17)) // 1 September 2026 is a Tuesday
  assert.equal(september.length, 42)
  assert.equal(toYMD(september[0]), '2026-08-31')
  assert.equal(toYMD(september[41]), '2026-10-11')
  assert.equal(toYMD(monthGrid(new Date(2026, 5, 20))[0]), '2026-06-01') // June 2026 starts on a Monday
})

test('parseDate reads a bare date as that local day and rejects junk', () => {
  const d = parseDate('2026-09-06')!
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 8, 6, 0])
  assert.equal(toYMD(parseDate('2026-09-06T23:30:00')!), '2026-09-06')
  assert.equal(parseDate('soon'), null)
  assert.equal(parseDate(''), null)
  assert.equal(parseDate(undefined), null)
})

test('addMonths clamps to the end of a shorter month', () => {
  assert.equal(toYMD(addMonths(new Date(2026, 0, 31), 1)), '2026-02-28')
  assert.equal(toYMD(addMonths(new Date(2026, 2, 31), -1)), '2026-02-28')
  assert.equal(toYMD(addMonths(new Date(2026, 11, 15), 1)), '2027-01-15')
})
