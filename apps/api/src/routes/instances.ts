import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { mkdir, writeFile } from 'node:fs/promises'
import { networkInterfaces, totalmem } from 'node:os'
import { join } from 'node:path'

import { backups, instances } from '@eclipse/db'
import {
  deletePath,
  listDirEntries,
  mkdirPath,
  movePath,
  normalizeUploadRel,
  readTextFile,
  writeBinaryFile,
  writeTextFile
} from '@eclipse/game-host'
import {
  connectionSettingsSchema,
  createInstanceSchema,
  installModpackSchema,
  MEMORY_PRESET_MAP,
  mkdirSchema,
  moveFileSchema,
  updateInstanceSchema,
  writeFileSchema
} from '@eclipse/shared'

import {
  backupStore,
  db,
  gameHost,
  instanceDataPath
} from '../services/runtime.js'

import { env } from '../env.js'

export const instancesRouter = new Hono()

instancesRouter.get('/', async (c) => {
  const rows = await db
    .select()
    .from(instances)
    .orderBy(desc(instances.createdAt))
  return c.json({ instances: rows })
})

instancesRouter.post('/', async (c) => {
  const body = createInstanceSchema.parse(await c.req.json())
  const dataPath = instanceDataPath(body.slug)
  await mkdir(join(dataPath, 'mods'), { recursive: true })
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

instancesRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ instance: row })
})

instancesRouter.patch('/:id', async (c) => {
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

instancesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.isActive)
    return c.json({ error: 'cannot delete active instance' }, 400)
  await db.delete(instances).where(eq(instances.id, id))
  return c.json({ ok: true })
})

instancesRouter.get('/:id/mods', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const mods = await gameHost.listMods(row.dataPath)
  return c.json({ mods })
})

instancesRouter.post('/:id/mods', async (c) => {
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
  const dest = join(row.dataPath, 'mods', name)
  await mkdir(join(row.dataPath, 'mods'), { recursive: true })
  await writeFile(dest, buf)
  return c.json({ ok: true, name })
})

instancesRouter.delete('/:id/mods/:name', async (c) => {
  const id = c.req.param('id')
  const name = c.req.param('name')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  await deletePath(row.dataPath, `mods/${name}`)
  return c.json({ ok: true })
})

function parseMemoryToMb(value: string): number {
  const match = /^(\d+(?:\.\d+)?)([GM])$/i.exec(value.trim())
  if (!match?.[1] || !match[2]) return 8192
  const n = Number(match[1])
  return match[2].toUpperCase() === 'G' ? Math.round(n * 1024) : Math.round(n)
}

function formatMemoryMb(mb: number): string {
  if (mb >= 1024) return `${Math.max(1, Math.floor(mb / 1024))}G`
  return `${Math.max(512, mb)}M`
}

/** On local hosts, cap JVM heap so presets like 16G/24G don't OOM (~exit 137). */
function clampMemoryForHost(requested: string): string {
  if (env.gameHost !== 'local') return requested
  const totalMb = Math.floor(totalmem() / 1024 / 1024)
  // Leave headroom for OS, Docker, Postgres, Node
  const maxMb = Math.max(2048, Math.floor(totalMb * 0.45))
  const want = parseMemoryToMb(requested)
  if (want <= maxMb) return requested
  const capped = formatMemoryMb(maxMb)
  console.warn(
    `[memory] clamping ${requested} → ${capped} (host ${totalMb}MB, GAME_HOST=local)`
  )
  return capped
}

/** Client/GUI mods that crash dedicated (headless) servers if left in /mods. */
const DEFAULT_MODRINTH_EXCLUDES = [
  'missingmodschecker',
  'missing-mods-checker'
]

/** Ant-style paths under mrpack overrides/ (BMC packs dump client jars here). */
const DEFAULT_MODRINTH_OVERRIDE_EXCLUDES = [
  'mods/missingmodschecker*.jar',
  'mods/*missingmodschecker*.jar'
]

function mergeCsvEnv(existing: string | undefined, extras: string[]): string {
  const parts = new Set(
    `${existing ?? ''},${extras.join(',')}`
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean)
  )
  return [...parts].join(',')
}

function buildEnv(row: typeof instances.$inferSelect): Record<string, string> {
  const requested =
    MEMORY_PRESET_MAP[row.memoryPreset as keyof typeof MEMORY_PRESET_MAP] ??
    '8G'
  const base: Record<string, string> = {
    TYPE: row.loader,
    VERSION: row.mcVersion,
    ...row.env,
    MEMORY: clampMemoryForHost(row.env?.MEMORY ?? requested)
  }

  if (
    (base.TYPE === 'AUTO_CURSEFORGE' || row.env?.CF_PAGE_URL) &&
    env.cfApiKey &&
    !base.CF_API_KEY
  ) {
    base.CF_API_KEY = env.cfApiKey
  }

  // itzg re-syncs Modrinth packs on recreate. Client jars often live in
  // overrides/ (EXCLUDE_FILES alone does not remove those — need OVERRIDES_EXCLUSIONS).
  if (base.TYPE === 'MODRINTH' || base.MODRINTH_MODPACK) {
    base.MODRINTH_EXCLUDE_FILES = mergeCsvEnv(
      base.MODRINTH_EXCLUDE_FILES,
      DEFAULT_MODRINTH_EXCLUDES
    )
    base.MODRINTH_OVERRIDES_EXCLUSIONS = mergeCsvEnv(
      base.MODRINTH_OVERRIDES_EXCLUSIONS,
      DEFAULT_MODRINTH_OVERRIDE_EXCLUDES
    )
    if (!base.MODRINTH_FORCE_SYNCHRONIZE) {
      base.MODRINTH_FORCE_SYNCHRONIZE = 'true'
    }
  }

  return base
}

async function writeInstanceRuntimeEnv(
  dataPath: string,
  envVars: Record<string, string>
) {
  const lines = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const body = `${lines}\n`
  await writeFile(join(dataPath, '.eclipse-runtime.env'), body, 'utf8')
  // Stable compose env_file (infra/docker/data/.eclipse-runtime.env)
  await writeFile(join(env.instancesDir, '..', '.eclipse-runtime.env'), body, 'utf8')
}

instancesRouter.post('/:id/activate', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)

  await db.update(instances).set({ isActive: false, status: 'idle' })
  await db
    .update(instances)
    .set({ isActive: true, status: 'starting', updatedAt: new Date() })
    .where(eq(instances.id, id))

  try {
    const envVars = buildEnv(row)
    await writeInstanceRuntimeEnv(row.dataPath, envVars)
    await gameHost.switchInstance(row.id, row.dataPath, envVars)
    await db
      .update(instances)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(instances.id, id))
    return c.json({ ok: true, env: envVars })
  } catch (err) {
    await db
      .update(instances)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(instances.id, id))
    return c.json(
      { error: err instanceof Error ? err.message : 'activate failed' },
      500
    )
  }
})

instancesRouter.post('/:id/modpacks/install', async (c) => {
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
        ? body.excludeFiles.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
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

  const envVars = buildEnv(updated)
  await writeInstanceRuntimeEnv(updated.dataPath, envVars)

  return c.json({ ok: true, instance: updated, env: envVars })
})

instancesRouter.post('/:id/modpacks/upload', async (c) => {
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
  await mkdir(join(row.dataPath, 'modpacks'), { recursive: true })
  await writeBinaryFile(row.dataPath, `modpacks/${name}`, buf)

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

  const envVars = buildEnv(updated)
  await writeInstanceRuntimeEnv(updated.dataPath, envVars)
  return c.json({ ok: true, instance: updated, path: containerPath })
})

instancesRouter.get('/:id/files', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const path = c.req.query('path') ?? ''
  try {
    const entries = await listDirEntries(row.dataPath, path)
    return c.json({ entries })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'list failed' },
      400
    )
  }
})

instancesRouter.get('/:id/files/content', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const path = c.req.query('path') ?? ''
  try {
    const content = await readTextFile(row.dataPath, path)
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

instancesRouter.put('/:id/files/content', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = writeFileSchema.parse(await c.req.json())
  try {
    await writeTextFile(row.dataPath, body.path, body.content)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'write failed' },
      400
    )
  }
})

instancesRouter.post('/:id/files/upload', async (c) => {
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
      await writeBinaryFile(row.dataPath, dest, buf)
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

instancesRouter.post('/:id/files/mkdir', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = mkdirSchema.parse(await c.req.json())
  try {
    await mkdirPath(row.dataPath, body.path)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'mkdir failed' },
      400
    )
  }
})

instancesRouter.delete('/:id/files', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const path = c.req.query('path') ?? ''
  try {
    await deletePath(row.dataPath, path)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'delete failed' },
      400
    )
  }
})

instancesRouter.post('/:id/files/move', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return c.json({ error: 'not found' }, 404)
  const body = moveFileSchema.parse(await c.req.json())
  try {
    await movePath(row.dataPath, body.from, body.to)
    return c.json({ ok: true })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'move failed' },
      400
    )
  }
})

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

function detectLanIp(): string | null {
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

lifecycleRouter.get('/connection', async (c) => {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  const status = await gameHost.getStatus(active?.id ?? null)
  const online = status.container === 'running'

  const host =
    joinOverride.host ||
    env.joinHost ||
    env.publicIp ||
    (env.gameHost === 'local' ? detectLanIp() || 'localhost' : 'localhost')
  const port = joinOverride.port || env.joinPort || 25565
  const address = `${host}:${port}`
  const source = joinOverride.host
    ? 'settings'
    : env.joinHost
      ? 'JOIN_HOST'
      : env.publicIp
        ? 'PUBLIC_IP'
        : env.gameHost === 'local'
          ? 'lan'
          : 'default'

  return c.json({ host, port, address, source, online })
})

lifecycleRouter.post('/connection', async (c) => {
  const body = connectionSettingsSchema.parse(await c.req.json())
  joinOverride = { host: body.host, port: body.port }
  return c.json({
    ok: true,
    host: body.host,
    port: body.port,
    address: `${body.host}:${body.port}`,
    source: 'settings'
  })
})

lifecycleRouter.post('/start', async (c) => {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  if (!active) return c.json({ error: 'no active instance' }, 400)
  await db
    .update(instances)
    .set({ status: 'starting', updatedAt: new Date() })
    .where(eq(instances.id, active.id))
  try {
    const envVars = buildEnv(active)
    await writeInstanceRuntimeEnv(active.dataPath, envVars)
    await gameHost.start(active.id, active.dataPath, envVars)
    await db
      .update(instances)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(instances.id, active.id))
    return c.json({ ok: true, env: envVars })
  } catch (err) {
    await db
      .update(instances)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(instances.id, active.id))
    return c.json(
      { error: err instanceof Error ? err.message : 'start failed' },
      500
    )
  }
})

lifecycleRouter.post('/stop', async (c) => {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  if (active) {
    await db
      .update(instances)
      .set({ status: 'stopping', updatedAt: new Date() })
      .where(eq(instances.id, active.id))
  }
  await gameHost.stop()
  if (active) {
    await db
      .update(instances)
      .set({ status: 'idle', updatedAt: new Date() })
      .where(eq(instances.id, active.id))
  }
  return c.json({ ok: true })
})

lifecycleRouter.post('/restart', async (c) => {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  if (!active) return c.json({ error: 'no active instance' }, 400)
  const envVars = buildEnv(active)
  await writeInstanceRuntimeEnv(active.dataPath, envVars)
  await gameHost.restart(active.id, active.dataPath, envVars)
  await db
    .update(instances)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(instances.id, active.id))
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
