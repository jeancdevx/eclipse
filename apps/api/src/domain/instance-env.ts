import { MEMORY_PRESET_MAP, loaderVersionEnvKey } from '@eclipse/shared'
import type { instances } from '@eclipse/db'

const LOADER_VERSION_KEYS = [
  'NEOFORGE_VERSION',
  'FORGE_VERSION',
  'FABRIC_LOADER_VERSION'
] as const

/** Merge optional loaderVersion into instance env for itzg. */
export function applyLoaderVersion(
  env: Record<string, string>,
  loader: string,
  loaderVersion: string | undefined
): Record<string, string> {
  const key = loaderVersionEnvKey(loader)
  const next = { ...env }
  for (const k of LOADER_VERSION_KEYS) {
    if (k !== key) delete next[k]
  }
  if (!key) return next
  const trimmed = loaderVersion?.trim()
  if (trimmed) next[key] = trimmed
  else delete next[key]
  return next
}

export const DEFAULT_MODRINTH_EXCLUDES = [
  'missingmodschecker',
  'missing-mods-checker'
]

export const DEFAULT_MODRINTH_OVERRIDE_EXCLUDES = [
  'mods/missingmodschecker*.jar',
  'mods/*missingmodschecker*.jar'
]

export function mergeCsvEnv(
  existing: string | undefined,
  extras: string[]
): string {
  const parts = new Set(
    `${existing ?? ''},${extras.join(',')}`
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return [...parts].join(',')
}

export type BuildEnvDeps = {
  gameHost: 'local' | 'azure'
  cfApiKey: string
  hostMemoryMb: number
  clampMemory: (requested: string, hostMemoryMb: number) => string
}

export function buildEnv(
  row: typeof instances.$inferSelect,
  deps: BuildEnvDeps
): Record<string, string> {
  const requested =
    MEMORY_PRESET_MAP[row.memoryPreset as keyof typeof MEMORY_PRESET_MAP] ??
    '8G'
  const base: Record<string, string> = {
    TYPE: row.loader,
    VERSION: row.mcVersion,
    ...row.env,
    MEMORY: deps.clampMemory(row.env?.MEMORY ?? requested, deps.hostMemoryMb)
  }

  if (
    (base.TYPE === 'AUTO_CURSEFORGE' || row.env?.CF_PAGE_URL) &&
    deps.cfApiKey &&
    !base.CF_API_KEY
  ) {
    base.CF_API_KEY = deps.cfApiKey
  }

  if (base.TYPE === 'MODRINTH' || base.MODRINTH_MODPACK) {
    base.MODRINTH_EXCLUDE_FILES = mergeCsvEnv(
      base.MODRINTH_EXCLUDE_FILES,
      DEFAULT_MODRINTH_EXCLUDES
    )
    base.MODRINTH_OVERRIDES_EXCLUSIONS = mergeCsvEnv(
      base.MODRINTH_OVERRIDES_EXCLUSIONS,
      DEFAULT_MODRINTH_OVERRIDE_EXCLUDES
    )
    if (!base.MODRINTH_FORCE_SYNCHRONIZE) {
      base.MODRINTH_FORCE_SYNCHRONIZE = 'true'
    }
  }

  return base
}
