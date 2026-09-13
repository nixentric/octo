import assert from 'node:assert/strict'
import { test } from 'node:test'
import YAML from 'yaml'
import { fieldsCommitMessage, reorderSeq } from './config-write.ts'
import { parseConfig } from './config.ts'

const SOURCE = `# Managed by Octo CMS
adapter: hugo

collections:
  # the site's own pages
  - name: pages
    label: Pages
    folder: content
    fields:
      - { id: title, name: Title, type: text, required: true }

  - name: guides
    label: Guides
    folder: content/guides
    fields:
      - { id: title, name: Title, type: text, required: true }

  - name: services
    label: Services
    folder: content/services
    fields:
      - { id: title, name: Title, type: text, required: true }
`

const reorder = (names: string[]) => {
  const doc = YAML.parseDocument(SOURCE)
  const current = ['pages', 'guides', 'services']
  const ok = reorderSeq(doc.get('collections') as YAML.YAMLSeq, current, names)
  return { ok, doc, text: doc.toString() }
}

test('moves collections into the given order', () => {
  const { ok, doc } = reorder(['services', 'pages', 'guides'])
  assert.equal(ok, true)
  const parsed = parseConfig(doc.toJS())
  assert.ok(parsed.success)
  assert.deepEqual(parsed.data.collections.map((c) => c.name), ['services', 'pages', 'guides'])
})

test('keeps comments and formatting on the moved entries', () => {
  const { text } = reorder(['services', 'pages', 'guides'])
  assert.match(text, /# Managed by Octo CMS/)
  assert.match(text, /# the site's own pages/)
  assert.match(text, /\{ id: title, name: Title, type: text, required: true \}/)
})

test('refuses an order that would drop or duplicate a collection', () => {
  assert.equal(reorder(['services', 'pages']).ok, false, 'missing one')
  assert.equal(reorder(['pages', 'pages', 'guides']).ok, false, 'duplicated')
  assert.equal(reorder(['pages', 'guides', 'nope']).ok, false, 'unknown name')
  assert.equal(reorder(['pages', 'guides', 'services']).ok, true, 'unchanged order is fine')
})

test('leaves the document untouched when it refuses', () => {
  const { text } = reorder(['services', 'pages'])
  assert.equal(text, SOURCE)
})

test('commit messages name the single change', () => {
  const field = (id: string) => ({ id, label: id, type: 'text' as const, required: false })
  const before = [field('title'), field('price')]

  assert.equal(fieldsCommitMessage('services', before, [...before, field('warranty')]), 'cms: add field "warranty" to services')
  assert.equal(fieldsCommitMessage('services', before, [field('title')]), 'cms: remove field "price" from services')
  assert.equal(fieldsCommitMessage('services', before, [field('title'), { ...field('price'), required: true }]), 'cms: update field "price" in services')
  assert.equal(fieldsCommitMessage('services', before, [field('price'), field('title')]), 'cms: reorder fields in services')
  assert.equal(fieldsCommitMessage('services', before, [field('title'), field('a'), field('b')]), 'cms: update fields in services')
})
