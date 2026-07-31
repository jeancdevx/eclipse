import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { instances } from '@eclipse/db'
import { connectionSettingsSchema } from '@eclipse/shared'

import {
  resolveConnection,
  setJoinOverride
} from '../domain/join-address.js'
import { env } from '../env.js'
import {
  restartActive,
  startActive,
  stopActive
} from '../services/instance-lifecycle.js'
import { db, gameHost } from '../services/runtime.js'

export const lifecycleRouter = new Hono()

lifecycleRouter.get('/status', async (c) => {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  const status = await gameHost.getStatus(active?.id ?? null)
  return c.json({ status, activeInstance: active ?? null })
})

lifecycleRouter.get('/capabilities', async (c) => {
  return c.json({
    curseforgeConfigured: Boolean(env.cfApiKey)
  })
})

lifecycleRouter.get('/connection', async (c) => {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  const status = await gameHost.getStatus(active?.id ?? null)
  const online = status.container === 'running'

  const connection = resolveConnection({
    joinHost: env.joinHost,
    joinPort: env.joinPort,
    publicIp: env.publicIp,
    gameHost: env.gameHost,
    online
  })

  return c.json(connection)
})

lifecycleRouter.post('/connection', async (c) => {
  const body = connectionSettingsSchema.parse(await c.req.json())
  setJoinOverride({ host: body.host, port: body.port })
  return c.json({
    ok: true,
    host: body.host,
    port: body.port,
    address: `${body.host}:${body.port}`,
    source: 'settings'
  })
})

lifecycleRouter.post('/start', async (c) => {
  const result = await startActive()
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json({ ok: true, env: result.env })
})

lifecycleRouter.post('/stop', async (c) => {
  await stopActive()
  return c.json({ ok: true })
})

lifecycleRouter.post('/restart', async (c) => {
  const result = await restartActive()
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json({ ok: true })
})

lifecycleRouter.post('/rcon', async (c) => {
  const body = await c.req.json()
  const command = String(body.command ?? '')
  if (!command) return c.json({ error: 'command required' }, 400)
  const result = await gameHost.execRcon(command)
  return c.json({ result })
})

lifecycleRouter.get('/logs', async (_c) => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const line of gameHost.streamLogs()) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(line)}\n\n`)
          )
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify(err instanceof Error ? err.message : 'log error')}\n\n`
          )
        )
      } finally {
        controller.close()
      }
    }
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  })
})
