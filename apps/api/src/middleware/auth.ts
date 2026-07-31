import { timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'

import { env } from '../env.js'

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function requireApiToken(c: Context, next: Next) {
  const header = c.req.header('authorization')
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : c.req.header('x-api-token')
  if (!token || !safeEqualString(token, env.apiToken)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
}
