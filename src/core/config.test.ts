import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIELD_TYPE_GROUPS, FIELD_TYPES, groupCollections, isIgnored, parseConfig } from './config.ts'

test('the type picker lists every field type exactly once', () => {
  const listed = FIELD_TYPE_GROUPS.flatMap((g) => g.types)
  assert.deepEqual([...listed].sort(), [...FIELD_TYPES].sort())
})
import { validateEntry } from './validate.ts'

test('collections sit under their group heading, headings in first-seen order', () => {
  const groups = groupCollections([
    { name: 'pages' },
    { name: 'categories', group: 'Taxonomy' },
    { name: 'tools', group: '  ' },
    { name: 'tags', group: 'taxonomy' },
  ])
  assert.deepEqual(
    groups.map((g) => [g.name, g.collections.map((c) => c.name)]),
    [['Content', ['pages', 'tools']], ['Taxonomy', ['categories', 'tags']]],
  )
})

const wrap = (fields: unknown[]) => ({
  collections: [{ name: 'posts', label: 'Posts', folder: 'content/posts', fields }],
})

const fieldsOf = (raw: unknown) => {
  const r = parseConfig(raw)
  assert.ok(r.success, r.success ? '' : JSON.stringify(r.error.issues))
  return r.data.collections[0].fields
}

test('reads the documented id/name spelling', () => {
  const [f] = fieldsOf(wrap([{ id: 'starting_price', name: 'Starting Price', type: 'integer' }]))
  assert.equal(f.id, 'starting_price')
  assert.equal(f.label, 'Starting Price')
  assert.equal(f.type, 'integer')
  assert.equal(f.required, false)
})

test('still reads the older name/label spelling', () => {
  const [f] = fieldsOf(wrap([{ name: 'title', label: 'Title', type: 'text', required: true, hint: 'Shown first' }]))
  assert.equal(f.id, 'title')
  assert.equal(f.label, 'Title')
  assert.equal(f.help, 'Shown first')
  assert.equal(f.required, true)
})

test('expands plain string options into label/value pairs', () => {
  const [f] = fieldsOf(wrap([{ id: 'category', name: 'Category', type: 'select', options: ['News', 'Promo'] }]))
  assert.deepEqual(f.options, [
    { label: 'News', value: 'News' },
    { label: 'Promo', value: 'Promo' },
  ])
})

test('keeps explicit option labels and values apart', () => {
  const [f] = fieldsOf(
    wrap([{ id: 'device', name: 'Device', type: 'select', options: [{ label: 'iPhone', value: 'iphone' }] }]),
  )
  assert.deepEqual(f.options, [{ label: 'iPhone', value: 'iphone' }])
})

test('rejects duplicate and malformed ids', () => {
  const dupes = parseConfig(wrap([
    { id: 'title', name: 'Title', type: 'text' },
    { id: 'title', name: 'Title again', type: 'text' },
  ]))
  assert.equal(dupes.success, false)

  assert.equal(parseConfig(wrap([{ id: '2cool', name: 'Bad', type: 'text' }])).success, false)
  assert.equal(parseConfig(wrap([{ id: 'has space', name: 'Bad', type: 'text' }])).success, false)
})

test('nested groups and repeaters carry their own fields', () => {
  const [seo, features] = fieldsOf(wrap([
    { id: 'seo', name: 'SEO', type: 'object', fields: [{ id: 'title', name: 'Meta Title', type: 'text' }] },
    { id: 'features', name: 'Features', type: 'repeater', fields: [{ id: 'title', name: 'Title', type: 'text' }] },
  ]))
  assert.equal(seo.fields?.[0].id, 'title')
  assert.equal(features.type, 'repeater')
  assert.equal(parseConfig(wrap([{ id: 'seo', name: 'SEO', type: 'object' }])).success, false, 'a group needs children')
})

test('validates entry values against the field rules', () => {
  const fields = fieldsOf(wrap([
    { id: 'title', name: 'Title', type: 'text', required: true },
    { id: 'price', name: 'Price', type: 'integer', min: 0 },
    { id: 'contact', name: 'Contact', type: 'email' },
    { id: 'device', name: 'Device', type: 'select', options: [{ label: 'iPhone', value: 'iphone' }] },
  ]))

  assert.deepEqual(validateEntry(fields, { title: 'ok', price: 10, device: 'iphone' }, ''), {})
  assert.equal(validateEntry(fields, {}, '').title, 'Required')
  assert.ok(validateEntry(fields, { title: 'ok', price: -5 }, '').price)
  assert.ok(validateEntry(fields, { title: 'ok', contact: 'nope' }, '').contact)
  assert.ok(validateEntry(fields, { title: 'ok', device: 'nokia' }, '').device)
})

test('leaves values the schema does not describe alone', () => {
  const fields = fieldsOf(wrap([{ id: 'title', name: 'Title', type: 'text', required: true }]))
  assert.deepEqual(validateEntry(fields, { title: 'ok', legacy_parameter: 'keep me' }, ''), {})
})

test('optional fields accept being absent or blank', () => {
  const fields = fieldsOf(wrap([
    { id: 'title', name: 'Title', type: 'text', required: true },
    { id: 'subtitle', name: 'Subtitle', type: 'text' },
  ]))
  assert.deepEqual(validateEntry(fields, { title: 'ok' }, ''), {})
  assert.deepEqual(validateEntry(fields, { title: 'ok', subtitle: '' }, ''), {})
})

test('ignored paths leave out an entry or everything in a folder, not look-alike names', () => {
  const ignore = ['tools/', 'recent']
  assert.equal(isIgnored(ignore, 'tools/localsend'), true)
  assert.equal(isIgnored(ignore, 'recent'), true)
  assert.equal(isIgnored(ignore, 'recent/old'), true)
  assert.equal(isIgnored(ignore, 'toolshed'), false)
  assert.equal(isIgnored(ignore, 'about'), false)
  assert.equal(isIgnored(['/'], 'about'), false)
  assert.equal(isIgnored(undefined, 'about'), false)
})
