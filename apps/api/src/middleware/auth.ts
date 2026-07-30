import type { Context, Next } from 'hono'

import { env } from '../env.js'

export async function requireApiToken(c: Context, next: Next) {
  const header = c.req.header('authorization')
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : c.req.header('x-api-token')
  if (token !== env.apiToken) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
}
