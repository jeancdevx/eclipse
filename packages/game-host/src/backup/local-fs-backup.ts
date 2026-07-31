import type { BackupStore } from '../types'

import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { createTarGz, ensureDir, extractTarGz } from '../fs/fs-utils'

export class LocalFsBackupStore implements BackupStore {
  constructor(private readonly backupDir: string) {}

  async createArchive(instanceId: string, dataPath: string) {
    const destDir = join(this.backupDir, instanceId)
    await ensureDir(destDir)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const localPath = join(destDir, `${stamp}.tar.gz`)
    const { sizeBytes, sha256 } = await createTarGz(dataPath, localPath)
    return { localPath, sizeBytes, sha256 }
  }

  async upload(_instanceId: string, localPath: string, _sha256: string) {
    return { blobUri: `file://${localPath}` }
  }

  async download(blobUri: string, destPath: string) {
    const { copyFile } = await import('node:fs/promises')
    const src = blobUri.replace(/^file:\/\//, '')
    await copyFile(src, destPath)
  }

  async delete(blobUri: string) {
    const src = blobUri.replace(/^file:\/\//, '')
    await rm(src, { force: true })
  }

  async extractArchive(archivePath: string, dataPath: string) {
    await extractTarGz(archivePath, dataPath)
  }
}
