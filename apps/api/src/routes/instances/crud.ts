import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { instances } from '@eclipse/db'
import {
  createInstanceSchema,
  loaderVersionEnvKey,
  updateInstanceSchema
} from '@eclipse/shared'

import { applyLoaderVersion } from '../../domain/instance-env.js'
import { env } from '../../env.js'
import {
  db,
  ensureGamePlaneReady,
  instanceDataPath,
  instanceFs
} from '../../services/runtime.js'

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
  const instanceEnv = applyLoaderVersion(
    body.env ?? {},
    body.loader,
    body.loaderVersion
  )
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
      env: instanceEnv,
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
  const [existing] = await db
    .select()
    .from(instances)
    .where(eq(instances.id, id))
  if (!existing) return c.json({ error: 'not found' }, 404)

  const loader = body.loader ?? existing.loader
  let nextEnv = { ...(existing.env ?? {}), ...(body.env ?? {}) }
  if (body.loaderVersion !== undefined || body.loader !== undefined) {
    const key = loaderVersionEnvKey(loader)
    const currentPin = key ? nextEnv[key] : undefined
    nextEnv = applyLoaderVersion(
      nextEnv,
      loader,
      body.loaderVersion !== undefined ? body.loaderVersion : currentPin
    )
  }

  const [row] = await db
    .update(instances)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.loader !== undefined ? { loader: body.loader } : {}),
      ...(body.mcVersion !== undefined ? { mcVersion: body.mcVersion } : {}),
      ...(body.memoryPreset !== undefined
        ? { memoryPreset: body.memoryPreset }
        : {}),
      env: nextEnv,
      updatedAt: new Date()
    })
    .where(eq(instances.id, id))
    .returning()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ instance: row })
})

crudRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.isActive) {
    return c.json({ error: 'cannot delete active instance' }, 400)
  }

  let dataRemoved = false
  let dataWarning: string | undefined
  try {
    await ensureGamePlaneReady()
    await instanceFs.removeInstanceDir(row.dataPath, env.instancesDir)
    dataRemoved = true
  } catch (err) {
    dataWarning =
      err instanceof Error
        ? err.message
        : 'could not remove instance data on disk'
  }

  await db.delete(instances).where(eq(instances.id, id))
  return c.json({ ok: true, dataRemoved, dataWarning })
})
