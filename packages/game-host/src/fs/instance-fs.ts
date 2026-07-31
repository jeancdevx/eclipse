import { join } from 'node:path'

import type { ListedEntry } from './instance-files'
import {
  deletePath as localDeletePath,
  listDirEntries as localListDirEntries,
  mkdirPath as localMkdirPath,
  movePath as localMovePath,
  readTextFile as localReadTextFile,
  resolveSandboxed,
  toRelative,
  writeBinaryFile as localWriteBinaryFile,
  writeTextFile as localWriteTextFile
} from './instance-files'
import type { SshFs } from '../ssh/ssh-fs'

const TEXT_MAX = 2_000_000

/**
 * Instance file I/O that works against local disk or a remote game VM via SSH.
 */
export function createInstanceFs(ssh: SshFs | null) {
  return {
    async listDirEntries(
      root: string,
      relativePath = ''
    ): Promise<ListedEntry[]> {
      if (!ssh) return localListDirEntries(root, relativePath)
      const dir = resolveSandboxed(root, relativePath)
      const rows = await ssh.listDirDetailed(dir)
      return rows.map(r => ({
        name: r.name,
        path: toRelative(root, join(dir, r.name)),
        isDir: r.isDir,
        size: r.size,
        mtime: new Date(r.mtimeMs).toISOString()
      }))
    },

    async readTextFile(root: string, relativePath: string): Promise<string> {
      if (!ssh) return localReadTextFile(root, relativePath)
      const abs = resolveSandboxed(root, relativePath)
      const buf = await ssh.readFile(abs)
      if (buf.length > TEXT_MAX) throw new Error('file too large')
      if (buf.includes(0)) {
        const err = new Error('binary file') as Error & { status?: number }
        err.status = 415
        throw err
      }
      return buf.toString('utf8')
    },

    async writeTextFile(
      root: string,
      relativePath: string,
      content: string
    ) {
      if (!ssh) return localWriteTextFile(root, relativePath, content)
      if (content.length > TEXT_MAX) throw new Error('content too large')
      const abs = resolveSandboxed(root, relativePath)
      await ssh.writeFile(abs, content)
    },

    async writeBinaryFile(
      root: string,
      relativePath: string,
      data: Buffer
    ) {
      if (!ssh) return localWriteBinaryFile(root, relativePath, data)
      const abs = resolveSandboxed(root, relativePath)
      await ssh.writeBinary(abs, data)
    },

    async mkdirPath(root: string, relativePath: string) {
      if (!ssh) return localMkdirPath(root, relativePath)
      const abs = resolveSandboxed(root, relativePath)
      await ssh.mkdirp(abs)
    },

    async deletePath(root: string, relativePath: string) {
      if (!ssh) return localDeletePath(root, relativePath)
      if (!relativePath || relativePath === '.' || relativePath === '/') {
        throw new Error('cannot delete root')
      }
      const abs = resolveSandboxed(root, relativePath)
      await ssh.rm(abs)
    },

    async movePath(root: string, from: string, to: string) {
      if (!ssh) return localMovePath(root, from, to)
      const src = resolveSandboxed(root, from)
      const dest = resolveSandboxed(root, to)
      await ssh.mv(src, dest)
    },

    async mkdirp(path: string) {
      if (!ssh) {
        const { mkdir } = await import('node:fs/promises')
        await mkdir(path, { recursive: true })
        return
      }
      await ssh.mkdirp(path)
    },

    async writeRuntimeEnv(dataPath: string, composeRuntimePath: string, body: string) {
      if (!ssh) {
        const { writeFile } = await import('node:fs/promises')
        await writeFile(join(dataPath, '.eclipse-runtime.env'), body, 'utf8')
        await writeFile(composeRuntimePath, body, 'utf8')
        return
      }
      await ssh.mkdirp(dataPath)
      await ssh.writeFile(join(dataPath, '.eclipse-runtime.env'), body)
      await ssh.writeFile(composeRuntimePath, body)
    },

    /**
     * Delete an instance data directory. `dataPath` must resolve under
     * `instancesDir` (slug folder only — never the instances root itself).
     */
    async removeInstanceDir(dataPath: string, instancesDir: string) {
      const { relative, resolve } = await import('node:path')
      const root = resolve(instancesDir)
      const target = resolve(dataPath)
      const rel = relative(root, target)
      if (!rel || rel === '.' || rel.startsWith('..') || rel.includes('..')) {
        throw new Error('refusing to delete path outside instances dir')
      }
      if (rel.split(/[/\\]/).length !== 1) {
        throw new Error('refusing to delete nested path')
      }
      if (!ssh) {
        const { rm } = await import('node:fs/promises')
        await rm(target, { recursive: true, force: true })
        return
      }
      await ssh.rm(target)
    }
  }
}

export type InstanceFs = ReturnType<typeof createInstanceFs>
