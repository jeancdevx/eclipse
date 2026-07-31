import { eq } from 'drizzle-orm'

import { instances } from '@eclipse/db'

import { env } from '../env.js'
import { stopActive } from './instance-lifecycle.js'
import { db, gameHost } from './runtime.js'

let emptySince: number | null = null
let timer: ReturnType<typeof setInterval> | null = null

export function startIdleWatcher() {
  if (timer) return
  const intervalMs = 60_000
  timer = setInterval(() => {
    void tick()
  }, intervalMs)
}

async function tick() {
  try {
    const [active] = await db
      .select()
      .from(instances)
      .where(eq(instances.isActive, true))
    if (!active || active.status !== 'running') {
      emptySince = null
      return
    }
    const status = await gameHost.getStatus(active.id)
    if (status.container !== 'running') {
      emptySince = null
      return
    }
    if (status.playersOnline > 0) {
      emptySince = null
      return
    }
    if (emptySince === null) {
      emptySince = Date.now()
      return
    }
    const idleMs = env.idleMinutes * 60_000
    if (Date.now() - emptySince >= idleMs) {
      // eslint-disable-next-line no-console
      console.info('[idle] shutting down after empty period')
      await stopActive()
      emptySince = null
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[idle] tick failed', err)
  }
}
