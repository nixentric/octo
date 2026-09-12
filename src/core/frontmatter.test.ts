import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.ts'

test('frontmatter round-trips and preserves unknown fields', () => {
  const raw = `---\ntitle: "Promo September"\ndate: 2026-09-12\ndraft: false\ncustom_field: keep me\n---\nMarkdown **content** here.\n`
  const entry = parseFrontmatter(raw)
  assert.equal(entry.data.title, 'Promo September')
  assert.equal(entry.data.date, '2026-09-12')
  assert.equal(entry.data.draft, false)
  assert.equal(entry.body, 'Markdown **content** here.\n')

  entry.data.title = 'Edited'
  const out = serializeFrontmatter(entry)
  assert.match(out, /^---\n/)
  assert.match(out, /custom_field: keep me/)
  assert.deepEqual(parseFrontmatter(out), entry)
})

test('plain markdown without frontmatter', () => {
  assert.deepEqual(parseFrontmatter('# Hello\n'), { data: {}, body: '# Hello\n' })
  assert.equal(serializeFrontmatter({ data: {}, body: '# Hello\n' }), '# Hello\n')
})
