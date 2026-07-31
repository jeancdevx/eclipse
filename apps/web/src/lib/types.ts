export type Instance = {
  id: string
  name: string
  slug: string
  loader: string
  mcVersion: string
  memoryPreset: string
  isActive: boolean
  status: string
  env?: Record<string, string>
  dataPath?: string
}

export type StatusPayload = {
  status: {
    container: string
    playersOnline: number
    activeInstanceId: string | null
    vmPowerState?: string
  }
  activeInstance: Instance | null
}

export type ConnectionPayload = {
  host: string
  port: number
  address: string
  source: string
  online: boolean
}

export type FileEntry = {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: string
}
