import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { backups, instances } from '@eclipse/db'

import { env } from '../env.js'
import {
  backupStore,
  db,
  ensureGamePlaneReady,
  gameHost
} from '../services/runtime.js'

export const backupsRouter = new Hono()

backupsRouter.get('/', async (c) => {
  const instanceId = c.req.query('instanceId')
  const rows = instanceId
    ? await db
        .select()
        .from(backups)
        .where(eq(backups.instanceId, instanceId))
        .orderBy(desc(backups.createdAt))
    : await db.select().from(backups).orderBy(desc(backups.createdAt))
  return c.json({ backups: rows })
})

backupsRouter.post('/', async (c) => {
  await ensureGamePlaneReady()
  const body = await c.req.json()
  const instanceId = String(body.instanceId ?? '')
  const triggeredBy = String(body.triggeredBy ?? 'manual')
  const [row] = await db
    .select()
    .from(instances)
    .where(eq(instances.id, instanceId))
  if (!row) return c.json({ error: 'instance not found' }, 404)

  await gameHost.stop()
  if (row.isActive) {
    await db
      .update(instances)
      .set({ status: 'idle', updatedAt: new Date() })
      .where(eq(instances.id, row.id))
  }

  const archive = await backupStore.createArchive(row.id, row.dataPath)
  const uploaded = await backupStore.upload(
    row.id,
    archive.localPath,
    archive.sha256
  )
  const [backup] = await db
    .insert(backups)
    .values({
      instanceId: row.id,
      blobUri: uploaded.blobUri,
      sizeBytes: archive.sizeBytes,
      sha256: archive.sha256,
      status: 'ready',
      triggeredBy
    })
    .returning()
  return c.json({ backup }, 201)
})

function backupStagingDir() {
  return join(env.backupDir, '.staging')
}

backupsRouter.post('/:id/restore', async (c) => {
  await ensureGamePlaneReady()
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const [backup] = await db.select().from(backups).where(eq(backups.id, id))
  if (!backup) return c.json({ error: 'not found' }, 404)
  const targetId = String(
    (body as { targetInstanceId?: string }).targetInstanceId ??
      backup.instanceId
  )
  const [target] = await db
    .select()
    .from(instances)
    .where(eq(instances.id, targetId))
  if (!target) return c.json({ error: 'target instance not found' }, 404)

  await gameHost.stop()
  await mkdir(backupStagingDir(), { recursive: true })
  const dest = join(backupStagingDir(), `${backup.id}.tar.gz`)
  await backupStore.download(backup.blobUri, dest)
  await backupStore.extractArchive(dest, target.dataPath)
  return c.json({ ok: true })
})
