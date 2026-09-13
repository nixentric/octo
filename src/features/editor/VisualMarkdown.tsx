import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, Bold, Code as CodeIcon, GripVertical, Heading, ImageIcon,
  Asterisk, Italic, Link as LinkIcon, List, Minus, Quote, Strikethrough, Superscript as SuperscriptIcon, Table, Trash2, type LucideIcon,
} from 'lucide-react'
import { Popover } from 'radix-ui'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import { NodeSelection } from '@tiptap/pm/state'
import { Markdown } from '@tiptap/markdown'
import { EditorContent, mergeAttributes, useEditor, useEditorState, type ChainedCommands, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sameMarkdown } from '@/core/markdown'
import { MediaPicker } from '@/features/media/MediaPicker'
import { cn } from '@/lib/utils'
import { FootnoteDef, FootnoteRef, insertFootnote } from './footnotes'
import { CODES, HEADINGS, LISTS, MoreToolsButton, SCRIPTS, ToolMenu, useAllTools, type HeadingLevel } from './ToolMenu'

/**
 * The editor keeps an empty paragraph after a closing code block or table so the caret can get below
 * it, and writes that paragraph as `&nbsp;`. At the very end it is only a place to click, not content.
 */
const markdownOf = (editor: Editor) => editor.getMarkdown().replace(/(?:\n+&nbsp;)+\s*$/, '')

/**
 * Markdown edited as formatted text. The value going in and out is always Markdown; content the
 * editor could not write back unchanged (shortcodes, HTML) is reported instead of shown,
 * so opening an entry here can never rewrite what it does not understand.
 */
export default function VisualMarkdown({ id, value, onChange, onUnsupported, displaySrc, toolbarEnd, className, toolbarClassName }: {
  id: string
  value: string
  onChange: (markdown: string) => void
  onUnsupported: () => void
  /** Where an image path can be loaded from inside the CMS. */
  displaySrc: (src: string) => string
  toolbarEnd: ReactNode
  /** For the editing area's wrapper, e.g. a taller editor. */
  className?: string
  toolbarClassName?: string
}) {
  const emitted = useRef(value)
  const [picking, setPicking] = useState(false)
  // The top-level block under the pointer, which the grip in the gutter drags.
  const [block, setBlock] = useState<{ pos: number; top: number } | null>(null)
  const dragging = useRef(false)

  const extensions = useMemo(
    () => [
      StarterKit.configure({ underline: false, link: { openOnClick: false } }), // Markdown has no underline
      Markdown.configure({ indentation: { style: 'space', size: 2 } }),
      TableKit.configure({ table: { resizable: false } }), // Markdown tables have no column widths
      TaskList,
      FootnoteRef,
      FootnoteDef,
      TaskItem.configure({ nested: true }),
      // Markdown has none of these, so they are written back as the HTML they came in as, like H<sub>2</sub>O.
      Subscript.extend({ renderMarkdown: (node, h) => `<sub>${h.renderChildren(node)}</sub>` }),
      Superscript.extend({ renderMarkdown: (node, h) => `<sup>${h.renderChildren(node)}</sup>` }),
      // The file keeps the site's image path; only what is drawn here points at the CMS copy.
      Image.extend({
        renderHTML({ HTMLAttributes }) {
          return ['img', mergeAttributes(HTMLAttributes, { src: displaySrc(String(HTMLAttributes.src ?? '')) })]
        },
      }),
    ],
    [displaySrc],
  )

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editorProps: { attributes: { id, class: 'octo-prose min-h-[24rem] py-2 pr-3 pl-8 focus:outline-none' } },
    onCreate: ({ editor }) => {
      if (!sameMarkdown(value, markdownOf(editor))) onUnsupported()
    },
    onUpdate: ({ editor }) => {
      emitted.current = markdownOf(editor)
      onChange(emitted.current)
    },
  })

  // A value from elsewhere (a restored version, a reload) replaces the document.
  useEffect(() => {
    if (!editor || value === emitted.current) return
    emitted.current = value
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    if (!sameMarkdown(value, markdownOf(editor))) onUnsupported()
  }, [editor, value, onUnsupported])

  return (
    <div className="space-y-1.5">
      <Toolbar editor={editor} onImage={() => setPicking(true)} end={toolbarEnd} className={toolbarClassName} />
      {editor && <TableControls editor={editor} />}
      <div
        className={cn('relative rounded-md border bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30', className)}
        onMouseMove={(e) => {
          if (!editor || dragging.current) return
          const next = blockAt(editor, e)
          setBlock((b) => (b?.pos === next?.pos && b?.top === next?.top ? b : next))
        }}
        onMouseLeave={() => !dragging.current && setBlock(null)}
      >
        <EditorContent editor={editor} />
        {editor && block && (
          <div
            draggable
            title="Drag to move"
            aria-hidden
            onDragStart={(e) => {
              dragging.current = true
              startDrag(editor, block.pos, e)
            }}
            onDragEnd={() => {
              // The grip is outside ProseMirror's own element, so it never hears the drag end. Left
              // set, a drop from anywhere later would still move this block.
              editor.view.dragging = null
              dragging.current = false
              setBlock(null)
            }}
            // Fills the text's left padding, inside the box, so the pointer can go from the text to the grip.
            className="absolute left-0 flex h-6 w-8 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
            style={{ top: block.top }}
          >
            <GripVertical className="size-4" />
          </div>
        )}
      </div>
      <MediaPicker
        open={picking}
        imagesOnly
        onClose={() => setPicking(false)}
        onPick={(src) => editor?.chain().focus().setImage({ src, alt: '' }).run()}
      />
    </div>
  )
}

/** The top-level block (a paragraph, a list, a table) at the pointer's height, and where to put its grip. */
function blockAt(editor: Editor, e: React.MouseEvent<HTMLElement>) {
  const { view } = editor
  const text = view.dom.getBoundingClientRect()
  // Over the gutter the pointer is left of the text, so look straight across into it.
  const hit = view.posAtCoords({ left: Math.max(e.clientX, text.left + 40), top: e.clientY })
  if (!hit) return null
  const $pos = view.state.doc.resolve(hit.pos)
  const pos = $pos.depth > 0 ? $pos.before(1) : hit.inside
  const dom = pos >= 0 ? view.nodeDOM(pos) : null
  if (!(dom instanceof HTMLElement)) return null
  const lineHeight = parseFloat(getComputedStyle(dom).lineHeight) || 24
  const top = dom.getBoundingClientRect().top - e.currentTarget.getBoundingClientRect().top + (lineHeight - 24) / 2
  return { pos, top: Math.round(top) }
}

/**
 * Starts dragging a whole block. Selecting it first and handing ProseMirror the slice lets its own
 * drop handling move it, with the drop cursor showing where it will land.
 */
function startDrag(editor: Editor, pos: number, e: React.DragEvent) {
  const { view } = editor
  const selection = NodeSelection.create(view.state.doc, pos)
  view.dispatch(view.state.tr.setSelection(selection))
  const slice = selection.content()
  const { dom, text } = view.serializeForClipboard(slice)
  e.dataTransfer.clearData()
  e.dataTransfer.setData('text/html', dom.innerHTML)
  e.dataTransfer.setData('text/plain', text)
  e.dataTransfer.effectAllowed = 'move'
  const node = view.nodeDOM(pos)
  if (node instanceof HTMLElement) e.dataTransfer.setDragImage(node, 0, 0)
  // With the node attached, the drop removes this exact block. Tables turn a selected table into
  // selected cells, and deleting that selection would only empty them and leave a copy behind.
  view.dragging = { slice, move: true, node: selection } as typeof view.dragging
}

function Toolbar({ editor, onImage, end, className }: { editor: Editor | null; onImage: () => void; end: ReactNode; className?: string }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: !!e?.isActive('bold'),
      italic: !!e?.isActive('italic'),
      strike: !!e?.isActive('strike'),
      script: e?.isActive('subscript') ? ('sub' as const) : e?.isActive('superscript') ? ('sup' as const) : undefined,
      heading: ([2, 3, 4, 5, 6] as const).find((level) => e?.isActive('heading', { level })) ?? 0,
      link: !!e?.isActive('link'),
      // A task list is also a bullet list underneath, so it is checked first.
      list: e?.isActive('taskList') ? ('task' as const) : e?.isActive('bulletList') ? ('bullet' as const) : e?.isActive('orderedList') ? ('ordered' as const) : undefined,
      blockquote: !!e?.isActive('blockquote'),
      code: e?.isActive('codeBlock') ? ('block' as const) : e?.isActive('code') ? ('inline' as const) : undefined,
      table: !!e?.isActive('table'),
    }),
  })
  const run = () => editor!.chain().focus()
  const all = useAllTools()

  return (
    <div className={cn('flex flex-wrap items-center gap-0.5 rounded-md border p-1', className)}>
      <ToolButton label="Bold" on={active?.bold} onClick={() => run().toggleBold().run()} disabled={!editor}><Bold className="size-4" /></ToolButton>
      <ToolButton label="Italic" on={active?.italic} onClick={() => run().toggleItalic().run()} disabled={!editor}><Italic className="size-4" /></ToolButton>
      <ToolMenu
        label="Heading"
        icon={Heading}
        choices={HEADINGS}
        current={(active?.heading || undefined) as HeadingLevel | undefined}
        disabled={!editor}
        onPick={(level) => (level ? run().setHeading({ level }).run() : run().setParagraph().run())}
      />
      <ToolMenu
        label="List"
        icon={List}
        choices={LISTS}
        current={active?.list}
        disabled={!editor}
        // Picking the list already in use turns it back into paragraphs.
        onPick={(kind) => {
          const chain = run()
          if (kind === 'bullet') chain.toggleBulletList().run()
          else if (kind === 'ordered') chain.toggleOrderedList().run()
          else chain.toggleTaskList().run()
        }}
      />
      <LinkButton editor={editor} on={!!active?.link} />
      <ToolButton label="Insert image" onClick={onImage} disabled={!editor}><ImageIcon className="size-4" /></ToolButton>
      {all && (
        <>
          <ToolButton label="Strikethrough" on={active?.strike} onClick={() => run().toggleStrike().run()} disabled={!editor}>
            <Strikethrough className="size-4" />
          </ToolButton>
          <ToolMenu
            label="Subscript or superscript"
            icon={SuperscriptIcon}
            choices={SCRIPTS}
            current={active?.script}
            disabled={!editor}
            onPick={(kind) => (kind === 'sub' ? run().toggleSubscript().run() : run().toggleSuperscript().run())}
          />
          <ToolButton label="Quote" on={active?.blockquote} onClick={() => run().toggleBlockquote().run()} disabled={!editor}>
            <Quote className="size-4" />
          </ToolButton>
          <ToolMenu
            label="Code"
            icon={CodeIcon}
            choices={CODES}
            current={active?.code}
            disabled={!editor}
            onPick={(kind) => (kind === 'inline' ? run().toggleCode().run() : run().toggleCodeBlock().run())}
          />
          {/* A table inside a table is not possible; rows and columns are edited on the table itself. */}
          <ToolButton
            label="Insert table"
            onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            disabled={!editor || active?.table}
          >
            <Table className="size-4" />
          </ToolButton>
          <ToolButton label="Footnote" onClick={() => insertFootnote(editor!)} disabled={!editor}><Asterisk className="size-4" /></ToolButton>
        </>
      )}
      <MoreToolsButton />
      <div className="ml-auto">{end}</div>
    </div>
  )
}

const TABLE_GROUPS: { label: string; tools: { label: string; icon: LucideIcon; run: (chain: ChainedCommands) => ChainedCommands }[] }[] = [
  {
    label: 'Row',
    tools: [
      { label: 'Add row above', icon: BetweenHorizontalStart, run: (c) => c.addRowBefore() },
      { label: 'Add row below', icon: BetweenHorizontalEnd, run: (c) => c.addRowAfter() },
      { label: 'Delete row', icon: Minus, run: (c) => c.deleteRow() },
    ],
  },
  {
    label: 'Column',
    tools: [
      { label: 'Add column left', icon: BetweenVerticalStart, run: (c) => c.addColumnBefore() },
      { label: 'Add column right', icon: BetweenVerticalEnd, run: (c) => c.addColumnAfter() },
      { label: 'Delete column', icon: Minus, run: (c) => c.deleteColumn() },
    ],
  },
]

/** The table the caret is in, for pinning its controls to it. */
function tableAt(editor: Editor) {
  const { node } = editor.view.domAtPos(editor.state.selection.from)
  return (node instanceof HTMLElement ? node : node.parentElement)?.closest('table') ?? null
}

/** Row and column controls that sit on the table's top edge while the caret is inside it. */
function TableControls({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableControls"
      shouldShow={({ editor: e }) => e.isEditable && e.isActive('table')}
      getReferencedVirtualElement={() => {
        const table = tableAt(editor)
        return table && { getBoundingClientRect: () => table.getBoundingClientRect() }
      }}
      // The page scrolls inside the app's <main>, not the window.
      options={{ placement: 'top-end', offset: 6, flip: true, shift: { padding: 8 }, scrollTarget: document.querySelector('main') ?? window }}
      className="z-20 flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-end gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {TABLE_GROUPS.map((group) => (
        <div key={group.label} role="group" aria-label={group.label} className="flex items-center gap-0.5 border-r pr-1">
          <span className="px-0.5 text-xs text-muted-foreground">{group.label}</span>
          {group.tools.map((t) => (
            <ToolButton key={t.label} label={t.label} className="size-7" onClick={() => t.run(editor.chain().focus()).run()}>
              <t.icon className="size-4" />
            </ToolButton>
          ))}
        </div>
      ))}
      <ToolButton label="Delete table" className="size-7 text-destructive hover:text-destructive" onClick={() => editor.chain().focus().deleteTable().run()}>
        <Trash2 className="size-4" />
      </ToolButton>
    </BubbleMenu>
  )
}

function ToolButton({ label, on, className, children, ...props }: { label: string; on?: boolean; children: ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={cn('size-8', on && 'bg-accent text-foreground', className)}
      {...props}
    >
      {children}
    </Button>
  )
}

function LinkButton({ editor, on }: { editor: Editor | null; on: boolean }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')

  function apply() {
    const chain = editor!.chain().focus().extendMarkRange('link')
    const url = href.trim()
    if (!url) chain.unsetLink().run()
    else if (editor!.state.selection.empty && !on) chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    else chain.setLink({ href: url }).run()
    setOpen(false)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (o) setHref(String(editor?.getAttributes('link').href ?? ''))
        setOpen(o)
      }}
    >
      <Popover.Trigger asChild>
        <ToolButton label="Link" on={on} disabled={!editor}><LinkIcon className="size-4" /></ToolButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-72 rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              apply()
            }}
          >
            <Input autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://" aria-label="Link address" className="h-8" />
            <Button type="submit" size="sm">{href.trim() || !on ? 'Apply' : 'Remove'}</Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
