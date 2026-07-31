import { totalmem } from 'node:os'

export function parseMemoryToMb(value: string): number {
  const match = /^(\d+(?:\.\d+)?)([GM])$/i.exec(value.trim())
  if (!match?.[1] || !match[2]) return 8192
  const n = Number(match[1])
  return match[2].toUpperCase() === 'G' ? Math.round(n * 1024) : Math.round(n)
}

export function formatMemoryMb(mb: number): string {
  if (mb >= 1024) return `${Math.max(1, Math.floor(mb / 1024))}G`
  return `${Math.max(512, mb)}M`
}

/**
 * Cap JVM heap so it fits the game host.
 * Leaves ~4 GiB for OS/Docker on hosts ≥8 GiB; otherwise ~45%.
 * A 16 GB Azure D4 cannot run MEMORY=16G.
 */
export function clampMemoryForHost(
  requested: string,
  hostMemoryMb: number
): string {
  const totalMb = Math.max(2048, Math.floor(hostMemoryMb))
  const reserveMb = totalMb >= 8192 ? 4096 : Math.floor(totalMb * 0.55)
  const maxMb = Math.max(2048, totalMb - reserveMb)
  const want = parseMemoryToMb(requested)
  if (want <= maxMb) return requested
  const capped = formatMemoryMb(maxMb)
  console.warn(
    `[memory] clamping ${requested} → ${capped} (host ${totalMb}MB, max usable ~${maxMb}MB)`
  )
  return capped
}

/** Detect local Node host RAM (dev laptop). */
export function localHostMemoryMb(): number {
  return Math.floor(totalmem() / 1024 / 1024)
}
