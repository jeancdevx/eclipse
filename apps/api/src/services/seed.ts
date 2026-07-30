import { eq } from 'drizzle-orm'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { instances } from '@eclipse/db'
import { MEMORY_PRESET_MAP } from '@eclipse/shared'

import { env } from '../env'
import { db, instanceDataPath } from './runtime'

export async function seedDefaultInstance() {
  const slug = 'default'
  const [existing] = await db
    .select()
    .from(instances)
    .where(eq(instances.slug, slug))

  if (existing) return existing

  const dataPath = instanceDataPath(slug)
  await mkdir(join(dataPath, 'mods'), { recursive: true })

  const loader = (process.env.DEFAULT_MC_LOADER ?? 'VANILLA').toUpperCase()
  const mcVersion = process.env.DEFAULT_MC_VERSION ?? '1.21.1'
  const memory = MEMORY_PRESET_MAP.light
  const body = `TYPE=${loader}\nVERSION=${mcVersion}\nMEMORY=${memory}\nMOTD=Eclipse local\n`

  await writeFile(join(dataPath, '.eclipse-runtime.env'), body, 'utf8')
  await writeFile(
    join(env.instancesDir, '..', '.eclipse-runtime.env'),
    body,
    'utf8'
  )

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
