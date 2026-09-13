import assert from 'node:assert/strict'
import { test } from 'node:test'
import YAML from 'yaml'
import type { Field } from './config.ts'
import { applyEntries, inferDataFields, readEntries, writeDataFile } from './data-file.ts'
import { parseDataFile } from './options.ts'

test('JSON and TOML are written back whole, keeping unknown keys and bare values', () => {
  const entries = [
    { key: 'windows', values: { name: 'Windows 11', icon: 'monitor' } },
    { key: 'web', values: { name: 'Web' } },
    { key: 'ios', values: { name: 'iOS' } },
  ]
  const json = writeDataFile('data/p.json', '{"windows": {"name": "Windows", "extra": 1}, "web": "Web", "linux": {"name": "Linux"}}', fields, entries)
  assert.deepEqual(JSON.parse(json), { windows: { name: 'Windows 11', icon: 'monitor', extra: 1 }, web: 'Web', ios: { name: 'iOS' } })
  const toml = writeDataFile('data/p.toml', 'web = "Web"\n[windows]\nname = "Windows"\nextra = 1\n', fields, entries)
  assert.deepEqual(parseDataFile('data/p.toml', toml), { windows: { name: 'Windows 11', icon: 'monitor', extra: 1 }, web: 'Web', ios: { name: 'iOS' } })
  assert.equal(writeDataFile('data/new.toml', '', fields, [{ key: 'a', values: { name: 'A' } }]).trim(), '[a]\nname = "A"')
})

const fields: Field[] = [
  { id: 'name', label: 'Name', type: 'text', required: true },
  { id: 'icon', label: 'Icon', type: 'text', required: false },
]

test('reads a registry keyed by slug, with bare values as the first field', () => {
  const data = YAML.parse('windows: { name: Windows, icon: monitor }\nweb: Web\n')
  assert.deepEqual(readEntries(data, fields), [
    { key: 'windows', values: { name: 'Windows', icon: 'monitor' } },
    { key: 'web', values: { name: 'Web' } },
  ])
  assert.deepEqual(readEntries(YAML.parse('# only a comment\n'), fields), [])
  assert.equal(readEntries(['a', 'b'], fields), null)
})

test('guesses fields from the values, name first and required', () => {
  const entries = readEntries(YAML.parse('free: { description: No cost, name: Free, featured: true }'), fields)!
  const guessed = inferDataFields(entries)
  assert.deepEqual(guessed.map((f) => [f.id, f.type, f.required]), [['name', 'text', true], ['description', 'text', false], ['featured', 'boolean', false]])
})

test('edits in place: comments, unknown keys, flow style and bare values survive', () => {
  const doc = YAML.parseDocument('# platforms\nwindows: { name: Windows, icon: monitor, extra: 1 }\nweb: Web\nlinux: { name: Linux }\n')
  applyEntries(doc, fields, [
    { key: 'windows', values: { name: 'Windows 11', icon: 'monitor', extra: 1 } },
    { key: 'web', values: { name: 'Web' } },
    { key: 'ios', values: { name: 'iOS', icon: '' } },
  ])
  const out = doc.toString()
  assert.match(out, /^# platforms\n/)
  assert.match(out, /^windows: \{ name: Windows 11, icon: monitor, extra: 1 \}$/m)
  assert.match(out, /^web: Web$/m)
  assert.doesNotMatch(out, /linux/)
  assert.match(out, /^ios: \{ name: iOS \}$/m)
})

test('a category registry keeps its blank lines, and new entries get one too', () => {
  const categoryFields: Field[] = [
    { id: 'name', label: 'Name', type: 'text', required: true },
    { id: 'icon', label: 'Icon', type: 'text', required: false },
    { id: 'parent', label: 'Parent', type: 'select', required: false, options_from: 'data/categories.yaml' },
    { id: 'description', label: 'Description', type: 'textarea', required: false },
  ]
  const src = 'internet:\n  name: Internet\n  icon: globe\n  description: Peramban, jaringan, dan segala hal tentang web.\n\nbrowser-tools:\n  name: Browser Tools\n  icon: puzzle\n  parent: internet\n  description: Ekstensi dan utilitas peramban.\n'
  const doc = YAML.parseDocument(src)
  const entries = readEntries(doc.toJS(), categoryFields)!
  applyEntries(doc, categoryFields, [...entries, { key: 'privacy', values: { name: 'Privacy', icon: 'eye-off', parent: 'internet' } }])
  assert.equal(doc.toString(), `${src}\nprivacy:\n  name: Privacy\n  icon: eye-off\n  parent: internet\n`)
})

test('a commented `{}` file becomes a block map below its comments', () => {
  const doc = YAML.parseDocument('# Registry of categories.\n# key = slug\n{}\n')
  applyEntries(doc, fields, [{ key: 'privacy', values: { name: 'Privacy', icon: 'eye-off' } }])
  assert.equal(doc.toString(), '# Registry of categories.\n# key = slug\nprivacy:\n  name: Privacy\n  icon: eye-off\n')
})
