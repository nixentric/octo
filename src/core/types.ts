import type { Frontmatter } from './frontmatter'

export type User = { login: string; name: string | null; avatar: string }
export type RepoRef = { owner: string; name: string; branch: string }

export type RepoInfo = {
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  private: boolean
  url: string
}

export type FileEntry = { path: string; name: string; type: 'file' | 'dir'; size: number; sha: string }

export type Commit = {
  sha: string
  message: string
  date: string
  author: { name: string; login?: string; avatar?: string }
}

export type EntryStatus = 'draft' | 'published'

export type EntrySummary = {
  path: string
  slug: string
  sha: string
  title: string
  status: EntryStatus
  updatedAt?: string
  author?: string
  /** Path on the live site, when the adapter can work one out. */
  permalink?: string
}

export type EntryDetail = { path: string; slug: string; sha: string; data: Frontmatter; body: string }

export type ApiError = { error: string; issues?: unknown }
