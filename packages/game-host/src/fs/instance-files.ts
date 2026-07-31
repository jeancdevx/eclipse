import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'

export type ListedEntry = {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: string
}

const TEXT_MAX = 2_000_000

export function resolveSandboxed(
  root: string,
  relativePath: string
): string {
  const cleaned = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  if (cleaned.split('/').includes('..')) {
    throw new Error('path traversal not allowed')
  }
  const rootAbs = resolve(root)
  const target = resolve(rootAbs, cleaned)
  const rel = relative(rootAbs, target)
  if (rel.startsWith('..') || rel === '..') {
    throw new Error('path outside sandbox')
  }
  return target
}

export function toRelative(root: string, absolute: string): string {
  const rel = relative(resolve(root), absolute)
  return rel === '' ? '' : rel.split(sep).join('/')
}

export async function listDirEntries(
  root: string,
  relativePath = ''
): Promise<ListedEntry[]> {
  const dir = resolveSandboxed(root, relativePath)
  const names = await readdir(dir)
  const out: ListedEntry[] = []
  for (const name of names.toSorted()) {
    if (name === '.eclipse-runtime.env') continue
    const abs = join(dir, name)
    const s = await stat(abs)
    out.push({
      name,
      path: toRelative(root, abs),
      isDir: s.isDirectory(),
      size: s.isFile() ? s.size : 0,
      mtime: s.mtime.toISOString()
    })
  }
  return out
}

export async function readTextFile(
  root: string,
  relativePath: string
): Promise<string> {
  const abs = resolveSandboxed(root, relativePath)
  const s = await stat(abs)
  if (!s.isFile()) throw new Error('not a file')
  if (s.size > TEXT_MAX) throw new Error('file too large')
  const buf = await readFile(abs)
  if (buf.includes(0)) {
    const err = new Error('binary file') as Error & { status?: number }
    err.status = 415
    throw err
  }
  return buf.toString('utf8')
}

export async function writeTextFile(
  root: string,
  relativePath: string,
  content: string
) {
  if (content.length > TEXT_MAX) throw new Error('content too large')
  const abs = resolveSandboxed(root, relativePath)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, content, 'utf8')
}

export async function writeBinaryFile(
  root: string,
  relativePath: string,
  data: Buffer
) {
  const abs = resolveSandboxed(root, relativePath)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, data)
}

export async function mkdirPath(root: string, relativePath: string) {
  const abs = resolveSandboxed(root, relativePath)
  await mkdir(abs, { recursive: true })
}

export async function deletePath(root: string, relativePath: string) {
  if (!relativePath || relativePath === '.' || relativePath === '/') {
    throw new Error('cannot delete root')
  }
  const abs = resolveSandboxed(root, relativePath)
  await rm(abs, { recursive: true, force: true })
}

export async function movePath(root: string, from: string, to: string) {
  const src = resolveSandboxed(root, from)
  const dest = resolveSandboxed(root, to)
  await mkdir(dirname(dest), { recursive: true })
  await rename(src, dest)
}

export function normalizeUploadRel(name: string): string {
  const n = normalize(name).replace(/^(\.\.(\/|\\|$))+/, '')
  if (n.split(/[/\\]/).includes('..')) throw new Error('invalid upload path')
  return n.split(sep).join('/')
}
