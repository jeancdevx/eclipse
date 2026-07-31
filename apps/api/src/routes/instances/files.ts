import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { join } from 'node:path'

import { instances } from '@eclipse/db'
import { normalizeUploadRel } from '@eclipse/game-host'
import {
  mkdirSchema,
  moveFileSchema,
  writeFileSchema
} from '@eclipse/shared'

import { db, ensureGamePlaneReady, instanceFs } from '../../services/runtime.js'

export const filesRouter = new Hono()

filesRouter.use('*', async (c, next) => {
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

filesRouter.get('/:id/files', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const path = c.req.query('path') ?? ''
  try {
    const entries = await instanceFs.listDirEntries(row.dataPath, path)
    return c.json({ entries })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'list failed' },
      400
    )
  }
})

filesRouter.get('/:id/files/content', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const path = c.req.query('path') ?? ''
  try {
    const content = await instanceFs.readTextFile(row.dataPath, path)
    return c.json({ content, path })
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: number }).status)
        : 400
    return c.json(
      { error: err instanceof Error ? err.message : 'read failed' },
      status === 415 ? 415 : 400
    )
  }
})

filesRouter.put('/:id/files/content', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = writeFileSchema.parse(await c.req.json())
  try {
    await instanceFs.writeTextFile(row.dataPath, body.path, body.content)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'write failed' },
      400
    )
  }
})

filesRouter.post('/:id/files/upload', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const form = await c.req.parseBody({ all: true })
  const basePath = String(form.path ?? '')
  const raw = form.files ?? form.file
  const files = Array.isArray(raw) ? raw : raw ? [raw] : []
  if (files.length === 0) return c.json({ error: 'files required' }, 400)

  const written: string[] = []
  try {
    for (const file of files) {
      if (typeof file === 'string') continue
      const rel = normalizeUploadRel(file.name)
      const dest = basePath ? join(basePath, rel) : rel
      const buf = Buffer.from(await file.arrayBuffer())
      await instanceFs.writeBinaryFile(row.dataPath, dest, buf)
      written.push(dest)
    }
    return c.json({ ok: true, written })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'upload failed' },
      400
    )
  }
})

filesRouter.post('/:id/files/mkdir', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = mkdirSchema.parse(await c.req.json())
  try {
    await instanceFs.mkdirPath(row.dataPath, body.path)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'mkdir failed' },
      400
    )
  }
})

filesRouter.delete('/:id/files', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const path = c.req.query('path') ?? ''
  try {
    await instanceFs.deletePath(row.dataPath, path)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'delete failed' },
      400
    )
  }
})

filesRouter.post('/:id/files/move', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = moveFileSchema.parse(await c.req.json())
  try {
    await instanceFs.movePath(row.dataPath, body.from, body.to)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'move failed' },
      400
    )
  }
})
