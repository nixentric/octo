import type { Commit, FileEntry, RepoInfo } from '@/core/types'

export type FileContent = { path: string; sha: string; content: string }
export type FileMeta = { path: string; sha: string; text: string | null; lastCommit?: Commit }
export type WriteResult = { sha: string; commitSha: string }

export class GitError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface GitProvider {
  getRepository(): Promise<RepoInfo>
  listFiles(path: string): Promise<FileEntry[]>
  getFile(path: string, ref?: string): Promise<FileContent>
  getFileRaw(path: string, ref?: string): Promise<ArrayBuffer>
  getFilesWithMeta(paths: string[]): Promise<FileMeta[]>
  createFile(args: { path: string; content: string; message: string }): Promise<WriteResult>
  updateFile(args: { path: string; content: string; sha: string; message: string }): Promise<WriteResult>
  deleteFile(args: { path: string; sha: string; message: string }): Promise<void>
  uploadFile(args: { path: string; bytes: Uint8Array; message: string; sha?: string }): Promise<WriteResult>
  getHistory(path?: string, limit?: number): Promise<Commit[]>
}
