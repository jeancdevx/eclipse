import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function findRepoRoot(start: string): string {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(here, '../../..')
}

export const repoRoot = findRepoRoot(here)

config({ path: resolve(repoRoot, '.env') })
config({ path: resolve(repoRoot, '.env.local'), override: true })

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

function fromRepo(pathValue: string): string {
  if (isAbsolute(pathValue)) return pathValue
  return resolve(repoRoot, pathValue)
}

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: required(
    'DATABASE_URL',
    'postgresql://eclipse:eclipse@localhost:5432/eclipse'
  ),
  apiToken: required('API_TOKEN', 'dev-api-token-change-me'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  idleMinutes: Number(process.env.IDLE_MINUTES ?? 30),
  gameHost: (process.env.GAME_HOST ?? 'local') as 'local' | 'azure',
  instancesDir: fromRepo(
    process.env.ECLIPSE_INSTANCES_DIR ?? 'infra/docker/data/instances'
  ),
  containerName: process.env.MC_CONTAINER_NAME ?? 'eclipse-mc',
  composeFile: fromRepo(
    process.env.MC_COMPOSE_FILE ?? 'infra/docker/compose.mc.yaml'
  ),
  rconHost: process.env.RCON_HOST ?? '127.0.0.1',
  rconPort: Number(process.env.RCON_PORT ?? 25575),
  rconPassword: process.env.RCON_PASSWORD ?? 'eclipse',
  backupDir: fromRepo(process.env.BACKUP_DIR ?? 'infra/docker/backups'),
  joinHost: process.env.JOIN_HOST ?? '',
  joinPort: Number(process.env.JOIN_PORT ?? 25565),
  publicIp: process.env.PUBLIC_IP ?? '',
  cfApiKey: process.env.CF_API_KEY ?? '',
  azure: {
    subscriptionId: process.env.AZURE_SUBSCRIPTION_ID ?? '',
    resourceGroup: process.env.AZURE_RESOURCE_GROUP ?? '',
    vmName: process.env.AZURE_VM_NAME ?? '',
    backupConnectionString: process.env.AZURE_BACKUP_CONNECTION_STRING ?? '',
    backupContainer: process.env.AZURE_BACKUP_CONTAINER ?? 'eclipse-backups',
    backupAccountUrl: process.env.AZURE_BACKUP_ACCOUNT_URL ?? ''
  }
}
