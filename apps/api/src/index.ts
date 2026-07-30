import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { API_PREFIX } from '@eclipse/shared'

import { env } from './env'
import { requireApiToken } from './middleware/auth'
import {
  backupsRouter,
  instancesRouter,
  lifecycleRouter
} from './routes/instances'
import { startIdleWatcher } from './services/idle-watcher'
import { seedDefaultInstance } from './services/seed'

const app = new Hono()

app.use(
  '*',
  cors({
    origin: env.corsOrigin,
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-token'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  })
)

app.get('/health', c => c.json({ ok: true, service: 'eclipse-api' }))

const v1 = new Hono()
v1.use('*', requireApiToken)
v1.route('/instances', instancesRouter)
v1.route('/server', lifecycleRouter)
v1.route('/backups', backupsRouter)

app.route(API_PREFIX, v1)

startIdleWatcher()

void seedDefaultInstance()
  .catch(err => {
    // eslint-disable-next-line no-console
    console.warn('[seed] skipped:', err)
  })
  .finally(() => {
    serve({ fetch: app.fetch, port: env.port }, info => {
      // eslint-disable-next-line no-console
      console.info(`Eclipse API listening on http://localhost:${info.port}`)
    })
  })

export default app
