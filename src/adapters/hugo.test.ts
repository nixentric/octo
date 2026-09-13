import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hugo } from './hugo.ts'

const slug = (path: string) => hugo.pathToSlug('content/posts', path, 'md')

test('maps hugo file layouts to slugs', () => {
  assert.equal(slug('content/posts/promo.md'), 'promo')
  assert.equal(slug('content/posts/promo/index.md'), 'promo')
  assert.equal(slug('content/posts/2026/promo.md'), '2026/promo')
  assert.equal(slug('content/posts/2026/promo/index.md'), '2026/promo')
})

test('ignores files that are not entries', () => {
  assert.equal(slug('content/posts/_index.md'), null)
  assert.equal(slug('content/posts/promo/cover.jpg'), null)
  assert.equal(slug('content/pages/about.md'), null)
  assert.equal(slug('content/posts/index.md'), null, 'the folder index is the section page')
})

test('entryPaths covers both layouts, single file first', () => {
  assert.deepEqual(hugo.entryPaths('content/posts', 'promo', 'md'), [
    'content/posts/promo.md',
    'content/posts/promo/index.md',
  ])
})

test('round-trips every slug back to a path that maps to it', () => {
  for (const s of ['promo', '2026/promo']) {
    for (const path of hugo.entryPaths('content/posts', s, 'md')) {
      assert.equal(slug(path), s, path)
    }
  }
})

const link = (folder: string, slug: string, data = {}) => hugo.permalink('content', folder, slug, data)

test('builds the published URL from section and slug', () => {
  assert.equal(link('content/posts', 'promo'), '/posts/promo/')
  assert.equal(link('content/guides', 'cara-membuat-konten'), '/guides/cara-membuat-konten/')
  assert.equal(link('content', 'about'), '/about/')
  assert.equal(link('content/posts', '2026/arsip'), '/posts/2026/arsip/')
})

test('frontmatter overrides win over the file name', () => {
  assert.equal(link('content/posts', 'promo', { slug: 'promo-september' }), '/posts/promo-september/')
  assert.equal(link('content/posts', 'promo', { url: '/deals/september' }), '/deals/september/')
  assert.equal(link('content/posts', 'promo', { url: 'deals/' }), '/deals/')
})

test('published URLs are lowercase', () => {
  assert.equal(link('content/posts', 'Promo-September'), '/posts/promo-september/')
})
