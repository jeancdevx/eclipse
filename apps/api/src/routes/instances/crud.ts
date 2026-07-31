import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { instances } from '@eclipse/db'
import { createInstanceSchema, updateInstanceSchema } from '@eclipse/shared'

import { db, instanceDataPath } from '../../services/runtime.js'

export const crudRouter = new Hono()

crudRouter.get('/', async (c) => {
  const rows = await db
    .select()
    .from(instances)
    .orderBy(desc(instances.createdAt))
  return c.json({ instances: rows })
})

crudRouter.post('/', async (c) => {
  const body = createInstanceSchema.parse(await c.req.json())
  const dataPath = instanceDataPath(body.slug)
  // DB-only create. Remote dirs are created on activate/start after the
  // game VM is running (avoids SSH timeout while deallocated).
  const [row] = await db
    .insert(instances)
    .values({
      name: body.name,
      slug: body.slug,
      loader: body.loader,
      mcVersion: body.mcVersion,
      memoryPreset: body.memoryPreset,
      env: body.env ?? {},
      dataPath,
      status: 'idle'
    })
    .returning()
  return c.json({ instance: row }, 201)
})

crudRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ instance: row })
})

crudRouter.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = updateInstanceSchema.parse(await c.req.json())
  const [row] = await db
    .update(instances)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(instances.id, id))
    .returning()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ instance: row })
})

crudRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.isActive)
    return c.json({ error: 'cannot delete active instance' }, 400)
  await db.delete(instances).where(eq(instances.id, id))
  return c.json({ ok: true })
})
