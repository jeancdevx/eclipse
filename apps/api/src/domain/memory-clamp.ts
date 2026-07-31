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

/** On local hosts, cap JVM heap so presets like 16G/24G don't OOM (~exit 137). */
export function clampMemoryForHost(
  requested: string,
  gameHost: 'local' | 'azure'
): string {
  if (gameHost !== 'local') return requested
  const totalMb = Math.floor(totalmem() / 1024 / 1024)
  // Leave headroom for OS, Docker, Postgres, Node
  const maxMb = Math.max(2048, Math.floor(totalMb * 0.45))
  const want = parseMemoryToMb(requested)
  if (want <= maxMb) return requested
  const capped = formatMemoryMb(maxMb)
  console.warn(
    `[memory] clamping ${requested} → ${capped} (host ${totalMb}MB, GAME_HOST=local)`
  )
  return capped
}
