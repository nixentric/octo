import { Marked } from 'marked'

// Its own instance, so options other code sets on the shared one never change the comparison.
const marked = new Marked()
// Hugo reads each footnote note (`[^1]: …`) as its own block; this renderer knows no footnotes and would
// run a note into the line above it, so give every note a paragraph of its own first.
const html = (md: string) =>
  marked
    .parse(md.replace(/\n(?=\[\^[^\]\s]+\]:)/g, '\n\n'), { async: false })
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Written exactly as they are or not at all: Hugo expands shortcodes before reading Markdown, and a
 * footnote mark written as `\[^1\]` is plain text to Hugo while the comparison renderer can't tell.
 */
const LITERAL = /\{\{[<%][\s\S]*?[%>]\}\}|\[\^[^\]\s]+\]:?/g

/**
 * Whether two Markdown texts publish the same page: they render to the same HTML and keep the same
 * shortcodes and footnote marks. `*` or `_`, `-` or `*` bullets and blank lines may differ; a dropped
 * escape that turns a line into a list, a lost table or a shortcode written as `&lt;` may not.
 */
export const sameMarkdown = (a: string, b: string) =>
  html(a) === html(b) && String(a.match(LITERAL)) === String(b.match(LITERAL))
