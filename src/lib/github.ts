import type { RepoRef } from '@/core/types'

const segments = (path: string) => path.split('/').map(encodeURIComponent).join('/')

/** A folder (`tree`) or file (`blob`) of the connected repository, on its branch, on GitHub. */
export const githubUrl = (repo: RepoRef, kind: 'tree' | 'blob', path = '') =>
  `https://github.com/${repo.owner}/${repo.name}/${kind}/${segments(repo.branch)}${path ? `/${segments(path)}` : ''}`
