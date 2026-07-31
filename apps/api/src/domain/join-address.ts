import { networkInterfaces } from 'node:os'

export function detectLanIp(): string | null {
  const nets = networkInterfaces()
  for (const entries of Object.values(nets)) {
    if (!entries) continue
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return null
}

let joinOverride: { host?: string; port?: number } = {}

export function getJoinOverride(): { host?: string; port?: number } {
  return { ...joinOverride }
}

export function setJoinOverride(override: { host?: string; port?: number }) {
  joinOverride = { host: override.host, port: override.port }
}

export type ResolveConnectionInput = {
  joinHost: string
  joinPort: number
  publicIp: string
  gameHost: 'local' | 'azure'
  online: boolean
}

export type ResolvedConnection = {
  host: string
  port: number
  address: string
  source: string
  online: boolean
}

export function resolveConnection(
  input: ResolveConnectionInput
): ResolvedConnection {
  const override = getJoinOverride()
  const host =
    override.host ||
    input.joinHost ||
    input.publicIp ||
    (input.gameHost === 'local' ? detectLanIp() || 'localhost' : 'localhost')
  const port = override.port || input.joinPort || 25565
  const address = `${host}:${port}`
  const source = override.host
    ? 'settings'
    : input.joinHost
      ? 'JOIN_HOST'
      : input.publicIp
        ? 'PUBLIC_IP'
        : input.gameHost === 'local'
          ? 'lan'
          : 'default'

  return { host, port, address, source, online: input.online }
}
