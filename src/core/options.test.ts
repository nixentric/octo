import assert from 'node:assert/strict'
import { test } from 'node:test'
import YAML from 'yaml'
import { isDataCandidate, isDataFile, optionsFromData, parseDataFile } from './options.ts'

test('a registry keyed by slug writes the key and shows the name', () => {
  const data = YAML.parse('windows: { name: Windows, icon: monitor }\nself-hosted: { name: Self-hosted }\nweb: Web\ncli: {}')
  assert.deepEqual(optionsFromData(data), [
    { value: 'windows', label: 'Windows' },
    { value: 'self-hosted', label: 'Self-hosted' },
    { value: 'web', label: 'Web' },
    { value: 'cli', label: 'cli' },
  ])
  assert.deepEqual(optionsFromData(YAML.parse('{}')), [])
})

test('lists of names or objects work too, and junk gives nothing', () => {
  assert.deepEqual(optionsFromData(['Free', 3]), [{ value: 'Free', label: 'Free' }, { value: '3', label: '3' }])
  assert.deepEqual(optionsFromData([{ slug: 'ai', title: 'AI' }, { name: 'Design' }, { icon: 'x' }]), [
    { value: 'ai', label: 'AI' },
    { value: 'Design', label: 'Design' },
  ])
  assert.deepEqual(optionsFromData(null), [])
  assert.deepEqual(optionsFromData('text'), [])
})

test('TOML registries read the same way', () => {
  const data = parseDataFile('data/platforms.toml', 'windows = { name = "Windows" }\n[linux]\nname = "Linux"\n')
  assert.deepEqual(optionsFromData(data), [{ value: 'windows', label: 'Windows' }, { value: 'linux', label: 'Linux' }])
})

test('data files are YAML, JSON or TOML, suggested from any folder but not tooling files', () => {
  assert.ok(isDataFile('data/pricing.yaml') && isDataFile('data/a.yml') && isDataFile('data/b.JSON') && isDataFile('data/x.toml'))
  assert.ok(!isDataFile('content/categories'))
  assert.ok(isDataCandidate('data/pricing.yaml') && isDataCandidate('_data/nav.yml') && isDataCandidate('src/data/team.json'))
  assert.ok(!isDataCandidate('hugo.yaml') && !isDataCandidate('package.json'))
  assert.ok(!isDataCandidate('.github/workflows/deploy.yml') && !isDataCandidate('web/node_modules/x/package.json'))
  assert.ok(!isDataCandidate('web/pnpm-lock.yaml') && isDataCandidate('data/blocks.yaml'))
})
