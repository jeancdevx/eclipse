import { eq } from 'drizzle-orm'
import { join } from 'node:path'

import { instances } from '@eclipse/db'

import { buildEnv } from '../domain/instance-env.js'
import { clampMemoryForHost } from '../domain/memory-clamp.js'
import { env } from '../env.js'
import {
  composeRuntimeEnvPath,
  db,
  ensureGamePlaneReady,
  gameHost,
  instanceFs
} from './runtime.js'

async function writeInstanceRuntimeEnv(
  dataPath: string,
  envVars: Record<string, string>
) {
  const lines = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const body = `${lines}\n`
  await instanceFs.writeRuntimeEnv(dataPath, composeRuntimeEnvPath(), body)
}

export function buildInstanceEnv(row: typeof instances.$inferSelect) {
  return buildEnv(row, {
    gameHost: env.gameHost,
    cfApiKey: env.cfApiKey,
    clampMemory: clampMemoryForHost
  })
}

export { writeInstanceRuntimeEnv }

export async function activateInstance(id: string) {
  const [row] = await db.select().from(instances).where(eq(instances.id, id))
  if (!row) return { ok: false as const, error: 'not found', status: 404 as const }

  await db.update(instances).set({ isActive: false, status: 'idle' })
  await db
    .update(instances)
    .set({ isActive: true, status: 'starting', updatedAt: new Date() })
    .where(eq(instances.id, id))

  try {
    // Start Azure VM (if needed) before any SSH file writes
    await ensureGamePlaneReady()
    await instanceFs.mkdirp(join(row.dataPath, 'mods'))
    const envVars = buildInstanceEnv(row)
    await writeInstanceRuntimeEnv(row.dataPath, envVars)
    await gameHost.switchInstance(row.id, row.dataPath, envVars)
    await db
      .update(instances)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(instances.id, id))
    return { ok: true as const, env: envVars }
  } catch (err) {
    await db
      .update(instances)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(instances.id, id))
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'activate failed',
      status: 500 as const
    }
  }
}

export async function startActive() {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  if (!active) {
    return { ok: false as const, error: 'no active instance', status: 400 as const }
  }
  await db
    .update(instances)
    .set({ status: 'starting', updatedAt: new Date() })
    .where(eq(instances.id, active.id))
  try {
    await ensureGamePlaneReady()
    await instanceFs.mkdirp(join(active.dataPath, 'mods'))
    const envVars = buildInstanceEnv(active)
    await writeInstanceRuntimeEnv(active.dataPath, envVars)
    await gameHost.start(active.id, active.dataPath, envVars)
    await db
      .update(instances)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(instances.id, active.id))
    return { ok: true as const, env: envVars }
  } catch (err) {
    await db
      .update(instances)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(instances.id, active.id))
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'start failed',
      status: 500 as const
    }
  }
}

export async function stopActive() {
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
  return { ok: true as const }
}

export async function restartActive() {
  const [active] = await db
    .select()
    .from(instances)
    .where(eq(instances.isActive, true))
  if (!active) {
    return { ok: false as const, error: 'no active instance', status: 400 as const }
  }
  await ensureGamePlaneReady()
  const envVars = buildInstanceEnv(active)
  await writeInstanceRuntimeEnv(active.dataPath, envVars)
  await gameHost.restart(active.id, active.dataPath, envVars)
  await db
    .update(instances)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(instances.id, active.id))
  return { ok: true as const }
}
