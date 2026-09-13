import { useSyncExternalStore } from 'react'

/**
 * How the content editor's header behaves on a phone: it scrolls away with the form, or it
 * stays at the top, sliding out while scrolling down and back in on the way up.
 */
export type EditorHeaderMode = 'scroll' | 'autohide'

const KEY = 'editor-header'
const listeners = new Set<() => void>()

function read(): EditorHeaderMode {
  try {
    return localStorage.getItem(KEY) === 'autohide' ? 'autohide' : 'scroll'
  } catch {
    // A browser blocking site data keeps the default.
    return 'scroll'
  }
}

export function setEditorHeaderMode(mode: EditorHeaderMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Not remembered between visits, but still applied now.
  }
  listeners.forEach((notify) => notify())
}

export const useEditorHeaderMode = () =>
  useSyncExternalStore((notify) => {
    listeners.add(notify)
    return () => listeners.delete(notify)
  }, read)
