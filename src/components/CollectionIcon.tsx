// ponytail: the name → chunk index adds ~33 KB gzip to the main bundle; lazy-import
// lucide-react/dynamic if first load ever gets tight.
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic'

export { iconNames }

const NAMES = new Set<string>(iconNames)
export const isIconName = (name: string | undefined): name is IconName => !!name && NAMES.has(name)

export const DEFAULT_COLLECTION_ICON: IconName = 'file-text'

/** Shown before anything is searched: the kinds of content sites usually hold. */
export const ICON_SUGGESTIONS: IconName[] = [
  'file-text', 'newspaper', 'notebook-pen', 'book-open', 'layout-template', 'briefcase', 'package', 'shopping-bag',
  'calendar', 'users', 'quote', 'circle-help', 'folder-kanban', 'images', 'tag', 'star',
  'map-pin', 'graduation-cap', 'utensils', 'megaphone', 'rocket', 'building-2', 'handshake', 'video',
  'house', 'mail', 'music', 'mic', 'code', 'heart', 'lightbulb', 'trophy',
]

/**
 * The `icon` a collection names in cms.config.yml, from the whole Lucide set.
 * Each icon is its own small chunk, loaded when first shown; unknown names get the default.
 */
export function CollectionIcon({ name, className }: { name?: string; className?: string }) {
  return (
    <DynamicIcon
      name={isIconName(name) ? name : DEFAULT_COLLECTION_ICON}
      className={className}
      // Holds the same box while the chunk loads, so labels do not shift.
      fallback={() => <span className={className} />}
    />
  )
}
