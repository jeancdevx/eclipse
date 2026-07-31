import type { ServerStatus } from '@eclipse/shared'

export type GameHostConfig = {
  instancesDir: string
  containerName: string
  composeFile: string
  rconHost: string
  rconPort: number
  rconPassword: string
  /** e.g. ssh://eclipse@1.2.3.4 — when set, docker CLI targets remote daemon */
  dockerHost?: string
  /** SSH private key for DOCKER_HOST=ssh:// and remote filesystem ops */
  sshPrivateKeyPath?: string
}

export interface GameHost {
  start(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void>
  stop(): Promise<void>
  restart(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void>
  switchInstance(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void>
  getStatus(activeInstanceId: string | null): Promise<ServerStatus>
  streamLogs(): AsyncGenerator<string>
  execRcon(command: string): Promise<string>
  listMods(dataPath: string): Promise<string[]>
  ensureVmRunning?(): Promise<void>
  deallocateIfIdle?(): Promise<void>
}

export interface BackupStore {
  createArchive(
    instanceId: string,
    dataPath: string
  ): Promise<{ localPath: string; sizeBytes: number; sha256: string }>
  upload(
    instanceId: string,
    localPath: string,
    sha256: string
  ): Promise<{ blobUri: string }>
  download(blobUri: string, destPath: string): Promise<void>
  delete(blobUri: string): Promise<void>
  extractArchive(archivePath: string, dataPath: string): Promise<void>
}
