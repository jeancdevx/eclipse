export type { BackupStore, GameHost, GameHostConfig } from './types'
export { DockerComposeHost } from './docker/compose-host'
/** @deprecated Use DockerComposeHost */
export { DockerComposeHost as LocalDockerHost } from './docker/compose-host'
export { AzureVmDockerHost } from './azure/vm-docker-host'
export type { AzureVmConfig } from './azure/vm-docker-host'
export { LocalFsBackupStore } from './backup/local-fs-backup'
export { AzureBlobBackupStore } from './backup/azure-blob-backup'
export type { AzureBlobBackupConfig } from './backup/azure-blob-backup'
export {
  deletePath,
  listDirEntries,
  mkdirPath,
  movePath,
  normalizeUploadRel,
  readTextFile,
  resolveSandboxed,
  writeBinaryFile,
  writeTextFile,
  type ListedEntry
} from './fs/instance-files'
export { createInstanceFs, type InstanceFs } from './fs/instance-fs'
export {
  parseDockerSshHost,
  SshFs,
  sha256LocalFile,
  statLocalSize
} from './ssh/ssh-fs'
export {
  escapeComposeEnvValue,
  formatComposeEnvFile,
  unescapeComposeEnvValue
} from './docker/compose-env'
