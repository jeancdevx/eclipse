import { join } from 'node:path'

import { createDb, type Db } from '@eclipse/db'
import {
  AzureBlobBackupStore,
  AzureVmDockerHost,
  LocalDockerHost,
  LocalFsBackupStore,
  type BackupStore,
  type GameHost
} from '@eclipse/game-host'

import { env } from '../env.js'

export const db: Db = createDb(env.databaseUrl)

export function createGameHost(): GameHost {
  const base = {
    instancesDir: env.instancesDir,
    containerName: env.containerName,
    composeFile: env.composeFile,
    rconHost: env.rconHost,
    rconPort: env.rconPort,
    rconPassword: env.rconPassword
  }
  if (env.gameHost === 'azure') {
    return new AzureVmDockerHost({
      ...base,
      subscriptionId: env.azure.subscriptionId,
      resourceGroup: env.azure.resourceGroup,
      vmName: env.azure.vmName,
      manageVmPower: Boolean(env.azure.subscriptionId)
    })
  }
  return new LocalDockerHost(base)
}

export function createBackupStore(): BackupStore {
  if (
    env.gameHost === 'azure' &&
    (env.azure.backupConnectionString || env.azure.backupAccountUrl)
  ) {
    return new AzureBlobBackupStore({
      containerName: env.azure.backupContainer,
      connectionString: env.azure.backupConnectionString || undefined,
      accountUrl: env.azure.backupAccountUrl || undefined,
      stagingDir: join(env.backupDir, '.staging')
    })
  }
  return new LocalFsBackupStore(env.backupDir)
}

export const gameHost = createGameHost()
export const backupStore = createBackupStore()

export function instanceDataPath(slug: string) {
  return join(env.instancesDir, slug)
}
