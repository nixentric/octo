import type { Commit, FileEntry, RepoInfo, RepoRef } from '@/core/types'
import { GitError, type FileContent, type FileMeta, type GitProvider, type WriteResult } from './types'

const API = 'https://api.github.com'
const utf8 = { enc: new TextEncoder(), dec: new TextDecoder() }

function toB64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0))

export async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'octo-cms',
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string>),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new GitError(res.status, body.message ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

type GhContent = { name: string; path: string; sha: string; size: number; type: 'file' | 'dir'; content?: string }
type GhCommit = {
  sha: string
  commit: { message: string; author: { name: string; date: string } }
  author?: { login: string; avatar_url: string } | null
}

const toCommit = (c: GhCommit): Commit => ({
  sha: c.sha,
  message: c.commit.message,
  date: c.commit.author.date,
  author: { name: c.commit.author.name, login: c.author?.login, avatar: c.author?.avatar_url },
})

export class GitHubProvider implements GitProvider {
  constructor(
    private token: string,
    private repo: RepoRef,
  ) {}

  private get base() {
    return `/repos/${this.repo.owner}/${this.repo.name}`
  }
  private get branch() {
    return this.repo.branch
  }
  private contents(path: string, ref = this.branch) {
    return `${this.base}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`
  }

  async getRepository(): Promise<RepoInfo> {
    const r = await gh<{
      name: string
      full_name: string
      default_branch: string
      private: boolean
      html_url: string
      owner: { login: string }
    }>(this.token, this.base)
    return {
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
      url: r.html_url,
    }
  }

  async listFiles(path: string): Promise<FileEntry[]> {
    let res: GhContent | GhContent[]
    try {
      res = await gh(this.token, this.contents(path))
    } catch (e) {
      if (e instanceof GitError && e.status === 404) return []
      throw e
    }
    if (!Array.isArray(res)) throw new GitError(400, `${path} is not a directory`)
    return res.map((f) => ({ path: f.path, name: f.name, type: f.type, size: f.size, sha: f.sha }))
  }

  // ponytail: one recursive tree call per listing; GitHub truncates above ~100k
  // entries, at which point this needs per-directory paging instead.
  async listTree(prefix: string): Promise<{ path: string; sha: string }[]> {
    const res = await gh<{ tree: { path: string; type: string; sha: string }[] }>(
      this.token,
      `${this.base}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`,
    )
    return res.tree
      .filter((e) => e.type === 'blob' && e.path.startsWith(`${prefix}/`))
      .map((e) => ({ path: e.path, sha: e.sha }))
  }

  async getFile(path: string, ref?: string): Promise<FileContent> {
    const f = await gh<GhContent>(this.token, this.contents(path, ref))
    if (f.type !== 'file' || f.content == null) throw new GitError(400, `${path} is not a file`)
    return { path: f.path, sha: f.sha, content: utf8.dec.decode(fromB64(f.content)) }
  }

  async getFileRaw(path: string, ref?: string): Promise<ArrayBuffer> {
    const res = await fetch(API + this.contents(path, ref), {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'octo-cms' },
    })
    if (!res.ok) throw new GitError(res.status, res.statusText)
    return res.arrayBuffer()
  }

  async getFilesWithMeta(paths: string[]): Promise<FileMeta[]> {
    const out: FileMeta[] = []
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const hist = chunk
        .map((p, j) => `h${j}: history(first:1, path:${JSON.stringify(p)}) { nodes { oid message committedDate author { name user { login avatarUrl } } } }`)
        .join('\n')
      const blobs = chunk
        .map((p, j) => `f${j}: object(expression:${JSON.stringify(`${this.branch}:${p}`)}) { ... on Blob { oid text } }`)
        .join('\n')
      const query = `query($owner:String!,$name:String!,$ref:String!){ repository(owner:$owner,name:$name){ ref(qualifiedName:$ref){ target { ... on Commit { ${hist} } } } ${blobs} } }`
      const res = await gh<{ data: { repository: Record<string, unknown> }; errors?: { message: string }[] }>(
        this.token,
        '/graphql',
        { method: 'POST', body: JSON.stringify({ query, variables: { owner: this.repo.owner, name: this.repo.name, ref: `refs/heads/${this.branch}` } }) },
      )
      if (res.errors?.length) throw new GitError(502, res.errors[0].message)
      const repo = res.data.repository
      const target = (repo.ref as { target: Record<string, { nodes: GqlCommit[] }> } | null)?.target ?? {}
      chunk.forEach((p, j) => {
        const blob = repo[`f${j}`] as { oid: string; text: string | null } | null
        const n = target[`h${j}`]?.nodes[0]
        out.push({
          path: p,
          sha: blob?.oid ?? '',
          text: blob?.text ?? null,
          lastCommit: n && {
            sha: n.oid,
            message: n.message,
            date: n.committedDate,
            author: { name: n.author.name, login: n.author.user?.login, avatar: n.author.user?.avatarUrl },
          },
        })
      })
    }
    return out
  }

  private async put(path: string, bytes: Uint8Array, message: string, sha?: string): Promise<WriteResult> {
    const r = await gh<{ content: { sha: string }; commit: { sha: string } }>(this.token, `${this.base}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toB64(bytes), branch: this.branch, sha }),
    })
    return { sha: r.content.sha, commitSha: r.commit.sha }
  }

  createFile({ path, content, message }: { path: string; content: string; message: string }) {
    return this.put(path, utf8.enc.encode(content), message)
  }

  updateFile({ path, content, sha, message }: { path: string; content: string; sha: string; message: string }) {
    return this.put(path, utf8.enc.encode(content), message, sha)
  }

  uploadFile({ path, bytes, message, sha }: { path: string; bytes: Uint8Array; message: string; sha?: string }) {
    return this.put(path, bytes, message, sha)
  }

  async deleteFile({ path, sha, message }: { path: string; sha: string; message: string }) {
    await gh(this.token, `${this.base}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch: this.branch }),
    })
  }

  async getHistory(path?: string, limit = 20): Promise<Commit[]> {
    const q = new URLSearchParams({ sha: this.branch, per_page: String(limit) })
    if (path) q.set('path', path)
    const commits = await gh<GhCommit[]>(this.token, `${this.base}/commits?${q}`)
    return commits.map(toCommit)
  }
}

type GqlCommit = {
  oid: string
  message: string
  committedDate: string
  author: { name: string; user: { login: string; avatarUrl: string } | null }
}
