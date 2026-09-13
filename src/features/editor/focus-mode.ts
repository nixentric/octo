import { createContext } from 'react'

/**
 * Lets a page offer focus mode on its Markdown fields: everything but the field steps aside. Pages
 * without a provider, like data files, show no button for it. In a file of its own so editing the
 * field registry during development does not replace the context under a page that provides it.
 */
export const FocusMode = createContext<{ focused: boolean; toggle: () => void } | null>(null)
