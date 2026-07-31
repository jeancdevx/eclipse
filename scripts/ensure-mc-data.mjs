#!/usr/bin/env node
/**
 * Ensures MC data dirs exist before docker compose:
 * - instances/default (+ mods/)
 * - active → instances/default (heals broken symlinks)
 * - data/.eclipse-runtime.env (real file — compose env_file must not go through symlink)
 */
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = join(root, 'infra/docker/data')
const instancesDir = join(dataRoot, 'instances')
const defaultDir = join(instancesDir, 'default')
const activeLink = join(dataRoot, 'active')
/** Stable path for compose env_file (never via symlink). */
const composeRuntimeEnv = join(dataRoot, '.eclipse-runtime.env')

const DEFAULT_ENV = `TYPE=${process.env.DEFAULT_MC_LOADER ?? 'VANILLA'}
VERSION=${process.env.DEFAULT_MC_VERSION ?? '1.21.1'}
MEMORY=4G
MOTD=Eclipse local
`

async function pathExists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function clearActive() {
  try {
    const st = await lstat(activeLink)
    if (st.isSymbolicLink()) {
      await unlink(activeLink)
      return
    }
    if (st.isDirectory()) {
      await mkdir(instancesDir, { recursive: true })
      await rename(activeLink, join(instancesDir, `_recovered_${Date.now()}`))
      return
    }
    await unlink(activeLink)
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT')
      return
    throw err
  }
}

async function symlinkTargetOk(linkPath) {
  try {
    const st = await lstat(linkPath)
    if (!st.isSymbolicLink()) return false
    await realpath(linkPath)
    return true
  } catch {
    return false
  }
}

async function main() {
  await mkdir(join(defaultDir, 'mods'), { recursive: true })

  const instanceRuntime = join(defaultDir, '.eclipse-runtime.env')
  if (!(await pathExists(instanceRuntime))) {
    await writeFile(instanceRuntime, DEFAULT_ENV, 'utf8')
  }

  // Always keep a real compose env_file (Docker fails on broken active → …)
  if (!(await pathExists(composeRuntimeEnv))) {
    const seed = (await pathExists(instanceRuntime))
      ? await readFile(instanceRuntime, 'utf8')
      : DEFAULT_ENV
    await writeFile(composeRuntimeEnv, seed, 'utf8')
  }

  if (!(await symlinkTargetOk(activeLink))) {
    await clearActive()
    await symlink(defaultDir, activeLink)
  }

  let target
  try {
    target = await realpath(activeLink)
  } catch {
    target = defaultDir
  }

  console.info(
    '[ensure-mc-data] ready:',
    activeLink,
    '→',
    target,
    '| env_file:',
    composeRuntimeEnv
  )
}

main().catch(err => {
  console.error('[ensure-mc-data]', err)
  process.exit(1)
})
