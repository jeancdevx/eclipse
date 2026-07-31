import { join } from 'node:path'

import { createDb, type Db } from '@eclipse/db'
import {
  AzureBlobBackupStore,
  AzureVmDockerHost,
  createInstanceFs,
  DockerComposeHost,
  LocalFsBackupStore,
  type BackupStore,
  type GameHost,
  type InstanceFs,
  type SshFs
} from '@eclipse/game-host'

import { env } from '../env.js'

export const db: Db = createDb(env.databaseUrl)

function baseHostConfig() {
  return {
    instancesDir: env.instancesDir,
    containerName: env.containerName,
    composeFile: env.composeFile,
    rconHost: env.rconHost,
    rconPort: env.rconPort,
    rconPassword: env.rconPassword,
    dockerHost: env.dockerHost || undefined,
    sshPrivateKeyPath: env.sshPrivateKeyPath || undefined
  }
}

export function createGameHost(): GameHost {
  const base = baseHostConfig()
  if (env.gameHost === 'azure') {
    return new AzureVmDockerHost({
      ...base,
      subscriptionId: env.azure.subscriptionId,
      resourceGroup: env.azure.resourceGroup,
      vmName: env.azure.vmName,
      manageVmPower: Boolean(env.azure.subscriptionId)
    })
  }
  return new DockerComposeHost(base)
}

export const gameHost = createGameHost()

export function remoteFs(): SshFs | null {
  if (gameHost instanceof AzureVmDockerHost) return gameHost.getSshFs()
  if (gameHost instanceof DockerComposeHost) return gameHost.getSshFs()
  return null
}

export function createBackupStore(): BackupStore {
  const ssh = remoteFs()
  if (
    env.gameHost === 'azure' &&
    (env.azure.backupConnectionString || env.azure.backupAccountUrl)
  ) {
    return new AzureBlobBackupStore({
      containerName: env.azure.backupContainer,
      connectionString: env.azure.backupConnectionString || undefined,
      accountUrl: env.azure.backupAccountUrl || undefined,
      stagingDir: join(env.backupDir, '.staging'),
      sshFs: ssh
    })
  }
  return new LocalFsBackupStore(env.backupDir)
}

export const backupStore = createBackupStore()
export const instanceFs: InstanceFs = createInstanceFs(remoteFs())

export function instanceDataPath(slug: string) {
  return join(env.instancesDir, slug)
}

export function composeRuntimeEnvPath() {
  return join(env.instancesDir, '..', '.eclipse-runtime.env')
}

/**
 * Bring the game plane online before SSH/Docker ops.
 * No-op for local Docker without remote SSH.
 */
export async function ensureGamePlaneReady(): Promise<void> {
  if (typeof gameHost.ensureVmRunning === 'function') {
    await gameHost.ensureVmRunning()
    return
  }
  const ssh = remoteFs()
  if (ssh) await ssh.waitUntilReady({ timeoutMs: 60_000 })
}
