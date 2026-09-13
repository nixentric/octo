import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectCollections, detectSite, inferFields, labelFor, missingCoreFields, recommendFields, STARTER_FIELDS, withCoreFields } from './generate-config.ts'

test('title, date, draft and body are added to whatever was inferred', () => {
  const inferred = inferFields([{ title: 'A', description: 'x', date: '2026-09-06' }], true)
  assert.deepEqual(withCoreFields(inferred).map((f) => f.id), ['title', 'description', 'date', 'draft', 'body'])
  assert.equal(withCoreFields(inferred)[2].type, 'date') // an inferred field wins over the starter one
  const bare = withCoreFields([{ id: 'layout', label: 'Layout', type: 'text', required: false }])
  assert.deepEqual(bare.map((f) => f.id), ['title', 'layout', 'date', 'draft', 'body'])
  assert.deepEqual(missingCoreFields(STARTER_FIELDS), [])
})

test('labels read as words', () => {
  assert.equal(labelFor('starting_price'), 'Starting Price')
  assert.equal(labelFor('device-type'), 'Device Type')
  assert.equal(labelFor('title'), 'Title')
})

test('detects a hugo site from its marker file', () => {
  const site = detectSite(['hugo.toml', 'content/posts/a.md', 'static/images/x.png'])
  assert.equal(site.adapter, 'hugo')
  assert.equal(site.content_dir, 'content')
  assert.equal(site.media_dir, 'static/images')
  assert.equal(site.public_media_path, '/images')
})

test('falls back to generic when nothing identifies the generator', () => {
  const site = detectSite(['src/content/blog/a.md', 'public/images/x.png'])
  assert.equal(site.adapter, 'generic')
  assert.equal(site.content_dir, 'src/content')
  assert.equal(site.media_dir, 'public/images')
  assert.equal(site.public_media_path, '/images')
})

test('finds collections from content subfolders, ignoring section pages', () => {
  const cols = detectCollections(
    ['content/posts/a.md', 'content/posts/b.md', 'content/posts/_index.md', 'content/pages/about.md', 'content/loose.md', 'static/x.png'],
    'content',
  )
  assert.deepEqual(cols.map((c) => [c.name, c.folder, c.files.length]), [
    ['posts', 'content/posts', 2],
    ['pages', 'content/pages', 1],
    ['pages', 'content', 1],
  ])
})

test('infers field types from existing frontmatter', () => {
  const fields = inferFields(
    [
      { title: 'A', price: 350000, featured: true, date: '2026-09-12T10:00:00+07:00', image: '/images/a.jpg', tags: ['news'], site: 'https://example.com' },
      { title: 'B', price: 120000, featured: false, date: '2026-08-01T09:00:00+07:00', image: '/images/b.png', tags: ['promo', 'news'] },
    ],
    true,
  )
  const byId = Object.fromEntries(fields.map((f) => [f.id, f]))
  assert.equal(byId.title.type, 'text')
  assert.equal(byId.title.required, true)
  assert.equal(byId.price.type, 'integer')
  assert.equal(byId.featured.type, 'boolean')
  assert.equal(byId.date.type, 'datetime')
  assert.equal(byId.image.type, 'image')
  assert.equal(byId.tags.type, 'tags')
  assert.equal(byId.site.type, 'url')
  assert.deepEqual(byId.tags.options?.map((o) => o.value).sort(), ['news', 'promo'])
})

test('title comes first and the body comes last', () => {
  const fields = inferFields([{ draft: false, title: 'A' }], true)
  assert.equal(fields[0].id, 'title')
  assert.equal(fields.at(-1)!.id, 'body')
})

test('widens to a type that fits every sample', () => {
  const fields = inferFields([{ n: 1 }, { n: 1.5 }, { s: 'x' }, { s: 'y'.repeat(200) }], false)
  const byId = Object.fromEntries(fields.map((f) => [f.id, f]))
  assert.equal(byId.n.type, 'decimal')
  assert.equal(byId.s.type, 'textarea')
})


test('recommends a type from how the samples use each key', () => {
  const recs = recommendFields(
    [
      { status: 'draft', featured: true, parent: 'internet', layout: 'docs', opens: '09:30' },
      { status: 'published', featured: false, parent: 'internet', layout: 'docs' },
      { status: 'published', featured: true, parent: 'tools', layout: 'docs', links: ['tools'] },
      { status: 'draft', parent: 'tools', layout: 'docs', links: ['internet', 'tools'] },
    ],
    [{ from: 'data/categories.yaml', label: 'Categories', keys: ['internet', 'tools'] }],
  )
  const byId = Object.fromEntries(recs.map((r) => [r.field.id, r]))
  assert.equal(byId.status.field.type, 'select')
  assert.deepEqual(byId.status.field.options?.map((o) => o.value), ['draft', 'published'])
  assert.equal(byId.featured.field.type, 'boolean')
  assert.equal(byId.featured.uses, 3)
  assert.equal(byId.parent.field.type, 'select')
  assert.equal(byId.parent.field.options_from, 'data/categories.yaml')
  assert.equal(byId.parent.field.options, undefined)
  assert.equal(byId.parent.habit, 'Always keys from Categories')
  assert.equal(byId.links.field.type, 'multiselect')
  assert.equal(byId.layout.field.type, 'text') // one value everywhere is not a choice
  assert.equal(byId.layout.habit, 'Always “docs”')
  assert.equal(byId.opens.field.type, 'time')
})

test('a few samples are not enough to call repeated values a choice', () => {
  const [rec] = recommendFields([{ kind: 'a' }, { kind: 'b' }, { kind: 'a' }])
  assert.equal(rec.field.type, 'text')
})
