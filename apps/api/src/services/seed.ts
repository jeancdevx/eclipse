import { eq } from 'drizzle-orm'

import { instances } from '@eclipse/db'

import { db, instanceDataPath } from './runtime.js'

/** Seed a default instance row without touching remote/local game FS. */
export async function seedDefaultInstance() {
  const slug = 'default'
  const [existing] = await db
    .select()
    .from(instances)
    .where(eq(instances.slug, slug))

  if (existing) return existing

  const dataPath = instanceDataPath(slug)
  const loader = (process.env.DEFAULT_MC_LOADER ?? 'VANILLA').toUpperCase()
  const mcVersion = process.env.DEFAULT_MC_VERSION ?? '1.21.1'

  await db.update(instances).set({ isActive: false })

  const [row] = await db
    .insert(instances)
    .values({
      name: 'Default',
      slug,
      loader,
      mcVersion,
      memoryPreset: 'light',
      env: {},
      dataPath,
      isActive: true,
      status: 'idle'
    })
    .returning()

  // eslint-disable-next-line no-console
  console.info(
    `[seed] created default instance (${loader} ${mcVersion}) at ${dataPath}`
  )
  return row
}
