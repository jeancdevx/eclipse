import { Hono } from 'hono'

import { activateInstance } from '../../services/instance-lifecycle.js'

export const activateRouter = new Hono()

activateRouter.post('/:id/activate', async (c) => {
  const id = c.req.param('id')
  const result = await activateInstance(id)
  if (!result.ok) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json({ ok: true, env: result.env })
})
