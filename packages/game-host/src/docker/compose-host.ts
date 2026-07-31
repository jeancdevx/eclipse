import type { GameHost, GameHostConfig } from '../types'

import { spawn } from 'node:child_process'
import {
  access,
  lstat,
  rename,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

import type { ServerStatus } from '@eclipse/shared'

import { ensureDir, listJarMods } from '../fs/fs-utils'
import { shellQuote } from '../ssh/shell-quote'
import { parseDockerSshHost, SshFs } from '../ssh/ssh-fs'
import { docker } from './cli'
import { execRcon } from './rcon'

export class DockerComposeHost implements GameHost {
  private lock = Promise.resolve()
  private lastEnv: Record<string, string> = {}
  private readonly ssh: SshFs | null

  constructor(private readonly config: GameHostConfig) {
    const target = config.dockerHost
      ? parseDockerSshHost(config.dockerHost)
      : null
    this.ssh = target ? new SshFs(target, config.sshPrivateKeyPath) : null
  }

  private composeCwd() {
    return dirname(this.config.composeFile)
  }

  private composeProcessEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...(this.config.dockerHost
        ? { DOCKER_HOST: this.config.dockerHost }
        : {}),
      RCON_PASSWORD: this.config.rconPassword,
      ...this.lastEnv,
      ...extra
    }
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn)
    this.lock = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private activeLinkPath() {
    return join(this.config.instancesDir, '..', 'active')
  }

  private composeRuntimePath() {
    return join(this.config.instancesDir, '..', '.eclipse-runtime.env')
  }

  private async clearActivePath() {
    if (this.ssh) {
      const activeLink = this.activeLinkPath()
      await this.ssh.exec(
        `if [ -L ${shellQuote(activeLink)} ] || [ -e ${shellQuote(activeLink)} ]; then rm -rf ${shellQuote(activeLink)}; fi`
      )
      return
    }
    const activeLink = this.activeLinkPath()
    try {
      const st = await lstat(activeLink)
      if (st.isSymbolicLink()) {
        await unlink(activeLink)
        return
      }
      if (st.isDirectory()) {
        const recovered = join(
          this.config.instancesDir,
          `_recovered_${Date.now()}`
        )
        await rename(activeLink, recovered)
        return
      }
      await unlink(activeLink)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err
    }
  }

  private async linkActive(dataPath: string) {
    const activeLink = this.activeLinkPath()
    if (this.ssh) {
      await this.ssh.mkdirp(this.config.instancesDir)
      await this.ssh.mkdirp(dataPath)
      await this.clearActivePath()
      await this.ssh.symlink(dataPath, activeLink)
      return
    }
    await ensureDir(this.config.instancesDir)
    await ensureDir(dataPath)
    await this.clearActivePath()
    await symlink(dataPath, activeLink)
  }

  private async ensureRuntimeEnv(
    dataPath: string,
    env?: Record<string, string>
  ) {
    const runtimePath = join(dataPath, '.eclipse-runtime.env')
    const composeRuntimePath = this.composeRuntimePath()
    const merged = { ...this.lastEnv, ...env }
    const body =
      Object.keys(merged).length > 0
        ? `${Object.entries(merged)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n')}\n`
        : 'TYPE=VANILLA\nVERSION=1.21.1\nMEMORY=4G\n'

    if (this.ssh) {
      await this.ssh.mkdirp(dataPath)
      await this.ssh.writeFile(runtimePath, body)
      await this.ssh.writeFile(composeRuntimePath, body)
      return
    }

    if (Object.keys(merged).length > 0) {
      await writeFile(runtimePath, body, 'utf8')
      await writeFile(composeRuntimePath, body, 'utf8')
      return
    }
    try {
      await access(runtimePath)
    } catch {
      await writeFile(runtimePath, body, 'utf8')
    }
    try {
      await access(composeRuntimePath)
    } catch {
      await writeFile(composeRuntimePath, body, 'utf8')
    }
  }

  async start(
    _instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void> {
    return this.withLock(async () => {
      if (!this.ssh) await ensureDir(dataPath)
      else await this.ssh.mkdirp(dataPath)
      if (env) this.lastEnv = { ...env }
      await this.ensureRuntimeEnv(dataPath, env)
      await this.linkActive(dataPath)
      const { code, stderr } = await docker(
        [
          'compose',
          '-f',
          this.config.composeFile,
          'up',
          '-d',
          '--force-recreate',
          '--no-deps',
          'mc'
        ],
        { cwd: this.composeCwd(), env: this.composeProcessEnv(env) }
      )
      if (code !== 0) throw new Error(`docker compose up failed: ${stderr}`)
    })
  }

  async stop(): Promise<void> {
    return this.withLock(async () => {
      await docker(['compose', '-f', this.config.composeFile, 'stop', 'mc'], {
        cwd: this.composeCwd(),
        env: this.composeProcessEnv()
      })
    })
  }

  async restart(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void> {
    await this.stop()
    await this.start(instanceId, dataPath, env)
  }

  async switchInstance(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void> {
    await this.stop()
    await this.start(instanceId, dataPath, env)
  }

  async getStatus(activeInstanceId: string | null): Promise<ServerStatus> {
    const { stdout } = await docker(
      ['inspect', '-f', '{{.State.Status}}', this.config.containerName],
      { env: this.composeProcessEnv() }
    )
    const raw = stdout.trim()
    const container =
      raw === 'running'
        ? 'running'
        : raw === 'exited' || raw === 'created'
          ? 'exited'
          : raw
            ? 'unknown'
            : 'missing'

    let playersOnline = 0
    if (container === 'running') {
      try {
        const list = await this.execRcon('list')
        const match = list.match(/There are (\d+)/)
        if (match?.[1]) playersOnline = Number(match[1])
      } catch {
        // RCON not ready
      }
    }

    return {
      container,
      activeInstanceId,
      playersOnline
    }
  }

  async *streamLogs(): AsyncGenerator<string> {
    const child = spawn(
      'docker',
      ['logs', '-f', '--tail', '100', this.config.containerName],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: this.composeProcessEnv()
      }
    )
    child.on('error', () => undefined)
    if (child.stdout) child.stdout.on('error', () => undefined)
    if (child.stderr) child.stderr.on('error', () => undefined)
    const rl = createInterface({
      input: child.stdout!,
      crlfDelay: Infinity
    })
    try {
      for await (const line of rl) {
        yield line
      }
    } catch {
      // closed
    }
  }

  async execRcon(command: string): Promise<string> {
    return execRcon(
      {
        host: this.config.rconHost,
        port: this.config.rconPort,
        password: this.config.rconPassword
      },
      command
    )
  }

  async listMods(dataPath: string): Promise<string[]> {
    if (this.ssh) {
      const names = await this.ssh.listDir(join(dataPath, 'mods'))
      return names.filter((n) => n.endsWith('.jar')).toSorted()
    }
    return listJarMods(dataPath)
  }

  /** Exposed for backup / file helpers when GAME_HOST=azure */
  getSshFs(): SshFs | null {
    return this.ssh
  }
}
