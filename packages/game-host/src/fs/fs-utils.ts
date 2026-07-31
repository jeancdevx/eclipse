import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true })
}

export async function listJarMods(dataPath: string): Promise<string[]> {
  const modsDir = join(dataPath, 'mods')
  try {
    const entries = await readdir(modsDir)
    return entries.filter((e) => e.endsWith('.jar')).toSorted()
  } catch {
    return []
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

export async function createTarGz(
  sourceDir: string,
  outFile: string
): Promise<{ sizeBytes: number; sha256: string }> {
  await ensureDir(join(outFile, '..'))
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'tar',
      [
        '-czf',
        outFile,
        '--exclude=logs',
        '--exclude=crash-reports',
        '--exclude=cache',
        '-C',
        sourceDir,
        '.'
      ],
      { stdio: 'inherit' }
    )
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited ${code}`))
    })
  })
  const s = await stat(outFile)
  const sha256 = await sha256File(outFile)
  return { sizeBytes: s.size, sha256 }
}

export async function extractTarGz(archivePath: string, destDir: string) {
  await rm(destDir, { recursive: true, force: true })
  await ensureDir(destDir)
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', destDir], {
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar extract exited ${code}`))
    })
  })
}
