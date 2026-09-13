import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sameMarkdown } from './markdown.ts'

// Right-hand sides are what the visual editor wrote back for each left-hand side.
test('spellings that publish the same page count as the same', () => {
  assert.equal(sameMarkdown('_miring_ and __tebal__\n\n* bintang', '*miring* and **tebal**\n\n- bintang\n\n'), true)
  assert.equal(sameMarkdown('\nLocalSend mirip AirDrop.\n', 'LocalSend mirip AirDrop.'), true)
  assert.equal(sameMarkdown('a < b', 'a &lt; b'), true)
  assert.equal(sameMarkdown('Teks[^1]\n[^1]: Satu.\n[^2]: Dua.', 'Teks[^1]\n\n[^1]: Satu.\n\n[^2]: Dua.\n\n'), true)
})

test('changes that alter the page or its shortcodes do not', () => {
  assert.equal(sameMarkdown('1\\. bukan list', '1. bukan list'), false)
  assert.equal(sameMarkdown('Teks\n\n{{< figure src="/a.png" >}}', 'Teks\n\n{{&lt; figure src="/a.png" &gt;}}'), false)
  assert.equal(sameMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', ''), false)
  assert.equal(sameMarkdown('- [ ] todo\n- [x] done', '- todo\n- done\n\n'), false)
  assert.equal(sameMarkdown('<div class="note">Halo</div>\n\nparagraf', 'Halo\n\nparagraf'), false)
  assert.equal(sameMarkdown('Teks[^1]\n\n[^1]: Catatan.', 'Teks\\[^1\\]\n\n\\[^1\\]: Catatan.'), false)
})
