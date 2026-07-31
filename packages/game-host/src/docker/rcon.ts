import { Rcon } from 'rcon-client'

export type RconConfig = {
  host: string
  port: number
  password: string
  timeout?: number
}

export async function execRcon(
  config: RconConfig,
  command: string
): Promise<string> {
  // Attach 'error' BEFORE connect — otherwise ECONNRESET during auth/restart
  // becomes an unhandled EventEmitter 'error' and kills the API process.
  const rcon = new Rcon({
    host: config.host,
    port: config.port,
    password: config.password,
    timeout: config.timeout ?? 3000
  })
  rcon.on('error', () => undefined)
  try {
    await rcon.connect()
    return await rcon.send(command)
  } finally {
    // end() is async and throws "Not connected" when the socket already died
    // (switch/restart). Must await + catch the rejection, not only sync throws.
    await rcon.end().catch(() => undefined)
  }
}
