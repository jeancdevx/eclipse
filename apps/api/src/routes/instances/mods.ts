import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { join } from 'node:path'

import { instances } from '@eclipse/db'

import { db, ensureGamePlaneReady, gameHost, instanceFs } from '../../services/runtime.js'

export const modsRouter = new Hono()

modsRouter.use('*', async (c, next) => {
  try {
    await ensureGamePlaneReady()
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : 'game plane unavailable'
      },
      503
    )
  }
  await next()
})

modsRouter.get('/:id/mods', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const mods = await gameHost.listMods(row.dataPath)
  return c.json({ mods })
})

modsRouter.post('/:id/mods', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const form = await c.req.parseBody()
  const file = form.file
  if (!file || typeof file === 'string') {
    return c.json({ error: 'file required' }, 400)
  }
  const name = file.name.endsWith('.jar') ? file.name : `${file.name}.jar`
  const buf = Buffer.from(await file.arrayBuffer())
  await instanceFs.mkdirp(join(row.dataPath, 'mods'))
  await instanceFs.writeBinaryFile(row.dataPath, `mods/${name}`, buf)
  return c.json({ ok: true, name })
})

modsRouter.delete('/:id/mods/:name', async (c) => {
  const id = c.req.param('id')
  const name = c.req.param('name')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  await instanceFs.deletePath(row.dataPath, `mods/${name}`)
  return c.json({ ok: true })
})
