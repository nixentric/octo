import { mergeAttributes, Node, type Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'

// Footnotes as Hugo writes them: `text[^1]` in the body and `[^1]: the note` on its own line, usually
// at the end. Both are kept character for character; the comparison in core/markdown checks that.

/** `[^1]` in the text, drawn as a small raised label. */
export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ label: { default: '1' } }),
  parseHTML: () => [{ tag: 'sup[data-footnote]', getAttrs: (el) => ({ label: (el as HTMLElement).dataset.footnote }) }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'sup',
    mergeAttributes(HTMLAttributes, { 'data-footnote': node.attrs.label, class: 'footnote-ref' }),
    `[${node.attrs.label}]`,
  ],
  markdownTokenizer: {
    name: 'footnoteRef',
    level: 'inline',
    start: (src) => src.indexOf('[^'),
    tokenize: (src) => {
      const m = /^\[\^([^\]\s]+)\](?!:)/.exec(src)
      return m ? { type: 'footnoteRef', raw: m[0], label: m[1] } : undefined
    },
  },
  parseMarkdown: (token, h) => h.createNode('footnoteRef', { label: token.label }),
  renderMarkdown: (node) => `[^${node.attrs?.label}]`,
})

/** `[^1]: the note`, one line of text with its label in front. */
export const FootnoteDef = Node.create({
  name: 'footnoteDef',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes: () => ({ label: { default: '1' } }),
  parseHTML: () => [{ tag: 'div[data-footnote-def]', getAttrs: (el) => ({ label: (el as HTMLElement).dataset.footnoteDef }) }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-footnote-def': node.attrs.label, class: 'footnote-def' }),
    0,
  ],
  markdownTokenizer: {
    name: 'footnoteDef',
    level: 'block',
    // Also where a paragraph ends, when a note follows it without a blank line.
    start: (src) => {
      const m = /(^|\n)\[\^[^\]\s]+\]:/.exec(src)
      return m ? m.index + m[1].length : -1
    },
    tokenize: (src, _tokens, lexer) => {
      // ponytail: one-line notes only; an indented continuation leaves the note as plain text, which the
      // comparison then refuses, so the entry stays in Markdown rather than losing the rest.
      const m = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*)(?:\n|$)(?![ \t]+\S)/.exec(src)
      return m ? { type: 'footnoteDef', raw: m[0], label: m[1], tokens: lexer.inlineTokens(m[2]) } : undefined
    },
  },
  parseMarkdown: (token, h) => h.createNode('footnoteDef', { label: token.label }, h.parseInline(token.tokens ?? [])),
  renderMarkdown: (node, h) => `[^${node.attrs?.label}]: ${h.renderChildren(node.content ?? [])}`,
})

/** Adds the next numbered footnote at the caret and its note at the end, with the caret in the note. */
export function insertFootnote(editor: Editor) {
  let label = 1
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteRef' || node.type.name === 'footnoteDef') label = Math.max(label, (parseInt(node.attrs.label, 10) || 0) + 1)
  })
  editor
    .chain()
    .focus()
    .insertContent({ type: 'footnoteRef', attrs: { label: String(label) } })
    .command(({ tr, state }) => {
      // The empty paragraph the editor keeps at the end (to click below a note) gives way to the new note.
      const last = tr.doc.lastChild!
      const trailing = last.type.name === 'paragraph' && last.content.size === 0
      const end = tr.doc.content.size - (trailing ? last.nodeSize : 0)
      tr.replaceWith(end, tr.doc.content.size, state.schema.nodes.footnoteDef.create({ label: String(label) }))
      tr.setSelection(TextSelection.create(tr.doc, end + 1))
      return true
    })
    .scrollIntoView()
    .run()
}
