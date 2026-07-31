import { Hono } from 'hono'

import { activateRouter } from './activate.js'
import { crudRouter } from './crud.js'
import { filesRouter } from './files.js'
import { modpacksRouter } from './modpacks.js'
import { modsRouter } from './mods.js'

export const instancesRouter = new Hono()

instancesRouter.route('/', crudRouter)
instancesRouter.route('/', modsRouter)
instancesRouter.route('/', modpacksRouter)
instancesRouter.route('/', filesRouter)
instancesRouter.route('/', activateRouter)
