import { z } from 'zod'

export const loaderSchema = z.enum([
  'VANILLA',
  'PAPER',
  'FABRIC',
  'FORGE',
  'NEOFORGE',
  'MODRINTH',
  'AUTO_CURSEFORGE'
])

export type Loader = z.infer<typeof loaderSchema>

/** itzg env var that pins the mod-loader build for a given TYPE. */
export function loaderVersionEnvKey(loader: string): string | null {
  switch (loader.toUpperCase()) {
    case 'NEOFORGE':
    case 'AUTO_CURSEFORGE':
      return 'NEOFORGE_VERSION'
    case 'FORGE':
      return 'FORGE_VERSION'
    case 'FABRIC':
      return 'FABRIC_LOADER_VERSION'
    default:
      return null
  }
}

export function loaderVersionLabel(loader: string): string | null {
  switch (loader.toUpperCase()) {
    case 'NEOFORGE':
    case 'AUTO_CURSEFORGE':
      return 'NeoForge version'
    case 'FORGE':
      return 'Forge version'
    case 'FABRIC':
      return 'Fabric loader version'
    default:
      return null
  }
}

export const memoryPresetSchema = z.enum(['light', 'standard', 'heavy'])

export type MemoryPreset = z.infer<typeof memoryPresetSchema>

export const MEMORY_PRESET_MAP: Record<MemoryPreset, string> = {
  light: '8G',
  standard: '16G',
  heavy: '24G'
}

export const instanceStatusSchema = z.enum([
  'idle',
  'starting',
  'running',
  'stopping',
  'error'
])

export type InstanceStatus = z.infer<typeof instanceStatusSchema>

/** Optional pin e.g. NeoForge `21.1.228` (itzg defaults to latest for the MC version). */
const loaderVersionField = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9._-]*$/, 'invalid loader version')
  .optional()

export const createInstanceSchema = z.object({
  name: z.string().min(1).max(64),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  loader: loaderSchema.default('FABRIC'),
  mcVersion: z.string().default('1.21.1'),
  /** Pins NEOFORGE_VERSION / FORGE_VERSION / FABRIC_LOADER_VERSION when set. */
  loaderVersion: loaderVersionField,
  memoryPreset: memoryPresetSchema.default('light'),
  env: z.record(z.string(), z.string()).optional()
})

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>

export const updateInstanceSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  loader: loaderSchema.optional(),
  mcVersion: z.string().optional(),
  loaderVersion: loaderVersionField,
  memoryPreset: memoryPresetSchema.optional(),
  env: z.record(z.string(), z.string()).optional()
})

export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>

export const serverStatusSchema = z.object({
  container: z.enum(['running', 'exited', 'missing', 'unknown']),
  activeInstanceId: z.string().nullable(),
  playersOnline: z.number().int().nonnegative(),
  maxPlayers: z.number().int().nonnegative().optional(),
  motd: z.string().optional(),
  vmPowerState: z.enum(['running', 'deallocated', 'unknown']).optional()
})

export type ServerStatus = z.infer<typeof serverStatusSchema>

export const rconCommandSchema = z.object({
  command: z.string().min(1).max(256)
})

export const backupRetentionSchema = z.object({
  keepLast: z.number().int().positive().default(10),
  maxAgeDays: z.number().int().positive().optional()
})

export type BackupRetention = z.infer<typeof backupRetentionSchema>

export const installModpackSchema = z.object({
  provider: z.enum(['modrinth', 'curseforge']),
  url: z.string().min(1).max(2048),
  version: z.string().max(128).optional(),
  /** Partial filenames / slugs for itzg MODRINTH_EXCLUDE_FILES */
  excludeFiles: z.string().max(2048).optional()
})

export type InstallModpackInput = z.infer<typeof installModpackSchema>

export const filePathSchema = z
  .string()
  .max(1024)
  .refine(p => !p.includes('..'), { message: 'path traversal not allowed' })

export const writeFileSchema = z.object({
  path: filePathSchema,
  content: z.string().max(2_000_000)
})

export const mkdirSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(1024)
    .refine(p => !p.includes('..'), { message: 'path traversal not allowed' })
})

export const moveFileSchema = z.object({
  from: filePathSchema,
  to: filePathSchema
})

export const connectionSettingsSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535).default(25565)
})
