import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isBundleIndex } from './slug.ts'

test('tells a page bundle index from a single-file entry', () => {
  assert.equal(isBundleIndex('content/about/index.md'), true)
  assert.equal(isBundleIndex('content/tools/_index.md'), true)
  assert.equal(isBundleIndex('content/tools/localsend.md'), false)
  assert.equal(isBundleIndex('content/tools/reindex.md'), false)
})
