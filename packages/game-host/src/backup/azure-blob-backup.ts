import type { BackupStore } from '../types'

import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient } from '@azure/storage-blob'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import { createTarGz, extractTarGz } from '../fs/fs-utils'
import {
  sha256LocalFile,
  statLocalSize,
  type SshFs
} from '../ssh/ssh-fs'

export type AzureBlobBackupConfig = {
  containerName: string
  connectionString?: string
  accountUrl?: string
  stagingDir: string
  /** When set, archives are created/extracted on the remote game VM via SSH */
  sshFs?: SshFs | null
}

export class AzureBlobBackupStore implements BackupStore {
  private readonly containerClient

  constructor(private readonly config: AzureBlobBackupConfig) {
    let service: BlobServiceClient
    if (config.connectionString) {
      service = BlobServiceClient.fromConnectionString(config.connectionString)
    } else if (config.accountUrl) {
      service = new BlobServiceClient(
        config.accountUrl,
        new DefaultAzureCredential()
      )
    } else {
      throw new Error(
        'AzureBlobBackupStore requires connectionString or accountUrl'
      )
    }
    this.containerClient = service.getContainerClient(config.containerName)
  }

  async createArchive(instanceId: string, dataPath: string) {
    await mkdir(this.config.stagingDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const localPath = join(
      this.config.stagingDir,
      `${instanceId}-${stamp}.tar.gz`
    )
    if (this.config.sshFs) {
      await this.config.sshFs.createTarGzToLocal(dataPath, localPath)
      return {
        localPath,
        sizeBytes: await statLocalSize(localPath),
        sha256: await sha256LocalFile(localPath)
      }
    }
    const { sizeBytes, sha256 } = await createTarGz(dataPath, localPath)
    return { localPath, sizeBytes, sha256 }
  }

  async upload(instanceId: string, localPath: string, sha256: string) {
    await this.containerClient.createIfNotExists()
    const name = localPath.split('/').pop() ?? 'backup.tar.gz'
    const blobName = `backups/${instanceId}/${name}`
    const block = this.containerClient.getBlockBlobClient(blobName)
    await block.uploadFile(localPath, {
      metadata: { sha256 },
      blobHTTPHeaders: { blobContentType: 'application/gzip' }
    })
    return { blobUri: block.url }
  }

  async download(blobUri: string, destPath: string) {
    await mkdir(dirname(destPath), { recursive: true })
    const url = new URL(blobUri)
    const parts = url.pathname.split('/').filter(Boolean)
    const blobPath = parts.slice(1).join('/')
    const block = this.containerClient.getBlockBlobClient(blobPath)
    const download = await block.download()
    if (!download.readableStreamBody) {
      throw new Error('Empty blob body')
    }
    await pipeline(download.readableStreamBody, createWriteStream(destPath))
  }

  async delete(blobUri: string) {
    const url = new URL(blobUri)
    const parts = url.pathname.split('/').filter(Boolean)
    const blobPath = parts.slice(1).join('/')
    await this.containerClient.getBlockBlobClient(blobPath).deleteIfExists()
  }

  async extractArchive(archivePath: string, dataPath: string) {
    if (this.config.sshFs) {
      await this.config.sshFs.extractTarGzFromLocal(archivePath, dataPath)
      return
    }
    await extractTarGz(archivePath, dataPath)
  }
}
