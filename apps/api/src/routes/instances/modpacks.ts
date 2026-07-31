import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { join } from 'node:path'

import { instances } from '@eclipse/db'
import { installModpackSchema } from '@eclipse/shared'

import {
  DEFAULT_MODRINTH_EXCLUDES,
  DEFAULT_MODRINTH_OVERRIDE_EXCLUDES,
  mergeCsvEnv
} from '../../domain/instance-env.js'
import { env } from '../../env.js'
import {
  buildInstanceEnv,
  writeInstanceRuntimeEnv
} from '../../services/instance-lifecycle.js'
import { db, ensureGamePlaneReady, instanceFs } from '../../services/runtime.js'

export const modpacksRouter = new Hono()

modpacksRouter.use('*', async (c, next) => {
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

modpacksRouter.post('/:id/modpacks/install', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = installModpackSchema.parse(await c.req.json())

  const nextEnv: Record<string, string> = { ...row.env }
  let loader = row.loader

  if (body.provider === 'modrinth') {
    loader = 'MODRINTH'
    nextEnv.MODRINTH_MODPACK = body.url
    if (body.version) nextEnv.MODRINTH_VERSION = body.version
    nextEnv.MODRINTH_EXCLUDE_FILES = mergeCsvEnv(
      mergeCsvEnv(nextEnv.MODRINTH_EXCLUDE_FILES, DEFAULT_MODRINTH_EXCLUDES),
      body.excludeFiles
        ? body.excludeFiles
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    )
    nextEnv.MODRINTH_OVERRIDES_EXCLUSIONS = mergeCsvEnv(
      nextEnv.MODRINTH_OVERRIDES_EXCLUSIONS,
      DEFAULT_MODRINTH_OVERRIDE_EXCLUDES
    )
    nextEnv.MODRINTH_FORCE_SYNCHRONIZE = 'true'
    delete nextEnv.CF_PAGE_URL
  } else {
    if (!env.cfApiKey) {
      return c.json({ error: 'CF_API_KEY not configured on server' }, 400)
    }
    loader = 'AUTO_CURSEFORGE'
    nextEnv.CF_PAGE_URL = body.url
    nextEnv.CF_API_KEY = env.cfApiKey
    delete nextEnv.MODRINTH_MODPACK
    delete nextEnv.MODRINTH_VERSION
  }

  const [updated] = await db
    .update(instances)
    .set({
      loader,
      env: nextEnv,
      updatedAt: new Date()
    })
    .where(eq(instances.id, id))
    .returning()

  if (!updated) return c.json({ error: 'update failed' }, 500)

  const envVars = buildInstanceEnv(updated)
  await writeInstanceRuntimeEnv(updated.dataPath, envVars)

  return c.json({ ok: true, instance: updated, env: envVars })
})

modpacksRouter.post('/:id/modpacks/upload', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const form = await c.req.parseBody()
  const file = form.file
  if (!file || typeof file === 'string') {
    return c.json({ error: 'file required' }, 400)
  }
  const provider =
    String(form.provider ?? '') === 'curseforge' ? 'curseforge' : 'modrinth'
  const name = file.name
  const buf = Buffer.from(await file.arrayBuffer())
  await instanceFs.mkdirp(join(row.dataPath, 'modpacks'))
  await instanceFs.writeBinaryFile(row.dataPath, `modpacks/${name}`, buf)

  const containerPath = `/data/modpacks/${name}`
  const nextEnv: Record<string, string> = { ...row.env }
  let loader = row.loader

  if (provider === 'modrinth' || name.endsWith('.mrpack')) {
    loader = 'MODRINTH'
    nextEnv.MODRINTH_MODPACK = containerPath
    delete nextEnv.CF_PAGE_URL
  } else {
    if (!env.cfApiKey) {
      return c.json({ error: 'CF_API_KEY not configured on server' }, 400)
    }
    loader = 'AUTO_CURSEFORGE'
    nextEnv.CF_PAGE_URL = containerPath
    nextEnv.CF_API_KEY = env.cfApiKey
    delete nextEnv.MODRINTH_MODPACK
  }

  const [updated] = await db
    .update(instances)
    .set({ loader, env: nextEnv, updatedAt: new Date() })
    .where(eq(instances.id, id))
    .returning()

  if (!updated) return c.json({ error: 'update failed' }, 500)

  const envVars = buildInstanceEnv(updated)
  await writeInstanceRuntimeEnv(updated.dataPath, envVars)
  return c.json({ ok: true, instance: updated, path: containerPath })
})
