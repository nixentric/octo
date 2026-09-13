export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Whether an entry is a page bundle's index (`about/index.md`): its folder holds the page's own images
 * and files, so a new slug would mean moving all of them, not renaming one file.
 */
export const isBundleIndex = (path: string) => /(^|\/)_?index\.[^/]+$/.test(path)
