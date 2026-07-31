import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { localHostMemoryMb } from '../domain/memory-clamp.js'
import { envSchema } from './schema.js'

function unescapeComposeEnvValue(value: string): string {
  return value.replaceAll('$$', '$')
}

const here = dirname(fileURLToPath(import.meta.url))

function findRepoRoot(start: string): string {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(here, '../../../..')
}

export const repoRoot = findRepoRoot(here)

config({ path: resolve(repoRoot, '.env') })
config({ path: resolve(repoRoot, '.env.local'), override: true })

function fromRepo(pathValue: string): string {
  if (isAbsolute(pathValue)) return pathValue
  return resolve(repoRoot, pathValue)
}

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
  throw new Error(`Invalid environment:\n${details}`)
}

const raw = parsed.data
const gameHost = raw.GAME_HOST ?? 'local'

export const env = {
  port: Number(raw.API_PORT ?? 4000),
  databaseUrl:
    raw.DATABASE_URL ??
    'postgresql://eclipse:eclipse@localhost:5432/eclipse',
  apiToken: raw.API_TOKEN ?? 'dev-api-token-change-me',
  corsOrigin: raw.CORS_ORIGIN ?? 'http://localhost:3000',
  idleMinutes: Number(raw.IDLE_MINUTES ?? 30),
  gameHost: gameHost as 'local' | 'azure',
  instancesDir:
    gameHost === 'azure'
      ? (raw.ECLIPSE_INSTANCES_DIR ?? '/var/lib/eclipse/instances')
      : fromRepo(raw.ECLIPSE_INSTANCES_DIR ?? 'infra/docker/data/instances'),
  containerName: raw.MC_CONTAINER_NAME ?? 'eclipse-mc',
  composeFile:
    gameHost === 'azure'
      ? fromRepo(raw.MC_COMPOSE_FILE ?? 'infra/docker/compose.guest.yaml')
      : fromRepo(raw.MC_COMPOSE_FILE ?? 'infra/docker/compose.mc.yaml'),
  rconHost: raw.RCON_HOST ?? '127.0.0.1',
  rconPort: Number(raw.RCON_PORT ?? 25575),
  rconPassword: raw.RCON_PASSWORD ?? 'eclipse',
  backupDir: fromRepo(raw.BACKUP_DIR ?? 'infra/docker/backups'),
  joinHost: raw.JOIN_HOST ?? '',
  joinPort: Number(raw.JOIN_PORT ?? 25565),
  publicIp: raw.PUBLIC_IP ?? '',
  cfApiKey: unescapeComposeEnvValue(raw.CF_API_KEY ?? ''),
  dockerHost: raw.DOCKER_HOST ?? '',
  sshPrivateKeyPath: raw.SSH_PRIVATE_KEY_PATH ?? '',
  /** Game-plane RAM in MiB. Azure D4 defaults to 16 GiB when unset. */
  gameHostMemoryMb: Number(
    raw.GAME_HOST_MEMORY_MB ??
      (gameHost === 'azure' ? 16384 : localHostMemoryMb())
  ),
  azure: {
    subscriptionId: raw.AZURE_SUBSCRIPTION_ID ?? '',
    resourceGroup: raw.AZURE_RESOURCE_GROUP ?? '',
    vmName: raw.AZURE_VM_NAME ?? '',
    backupConnectionString: raw.AZURE_BACKUP_CONNECTION_STRING ?? '',
    backupContainer: raw.AZURE_BACKUP_CONTAINER ?? 'eclipse-backups',
    backupAccountUrl: raw.AZURE_BACKUP_ACCOUNT_URL ?? ''
  }
}
