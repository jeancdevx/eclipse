import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import { shellQuote } from './shell-quote'

export type SshTarget = {
  user: string
  host: string
  port: number
  identityFile?: string
}

export function parseDockerSshHost(dockerHost: string): SshTarget | null {
  if (!dockerHost.startsWith('ssh://')) return null
  try {
    const u = new URL(dockerHost)
    if (!u.hostname) return null
    return {
      user: u.username || 'eclipse',
      host: u.hostname,
      port: u.port ? Number(u.port) : 22,
      identityFile: undefined
    }
  } catch {
    return null
  }
}

export class SshFs {
  constructor(
    private readonly target: SshTarget,
    private readonly identityFile?: string
  ) {}

  private identityArgs(): string[] {
    const key = this.identityFile ?? this.target.identityFile
    return key ? ['-i', key] : []
  }

  private commonOpts(): string[] {
    return [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ConnectTimeout=15',
      ...this.identityArgs()
    ]
  }

  private sshArgs(remoteCommand: string): string[] {
    return [
      ...this.commonOpts(),
      '-p',
      String(this.target.port),
      `${this.target.user}@${this.target.host}`,
      remoteCommand
    ]
  }

  private scpArgs(localPath: string, remotePath: string): string[] {
    return [
      ...this.commonOpts(),
      '-P',
      String(this.target.port),
      localPath,
      `${this.target.user}@${this.target.host}:${remotePath}`
    ]
  }

  async exec(
    remoteCommand: string
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn('ssh', this.sshArgs(remoteCommand))
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => {
        stdout += String(d)
      })
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('close', (code) => {
        resolve({ code: code ?? 1, stdout, stderr })
      })
    })
  }

  async execOrThrow(remoteCommand: string) {
    const { code, stdout, stderr } = await this.exec(remoteCommand)
    if (code !== 0) {
      throw new Error(
        `ssh failed (${code}): ${stderr || stdout || remoteCommand}`
      )
    }
    return stdout
  }

  /** Poll until SSH accepts connections (e.g. after Azure VM start). */
  async waitUntilReady(opts?: {
    timeoutMs?: number
    intervalMs?: number
  }): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 180_000
    const intervalMs = opts?.intervalMs ?? 5_000
    const deadline = Date.now() + timeoutMs
    let lastErr = 'timeout'
    while (Date.now() < deadline) {
      const { code, stderr, stdout } = await this.exec('echo ok')
      if (code === 0 && stdout.includes('ok')) return
      lastErr = stderr || stdout || `exit ${code}`
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    throw new Error(`SSH not ready after ${timeoutMs}ms: ${lastErr}`)
  }

  async writeFile(remotePath: string, content: string) {
    const b64 = Buffer.from(content, 'utf8').toString('base64')
    const dir = dirname(remotePath)
    await this.execOrThrow(
      `mkdir -p ${shellQuote(dir)} && echo ${shellQuote(b64)} | base64 -d > ${shellQuote(remotePath)}`
    )
  }

  async mkdirp(remotePath: string) {
    await this.execOrThrow(`mkdir -p ${shellQuote(remotePath)}`)
  }

  async symlink(target: string, linkPath: string) {
    await this.execOrThrow(
      `mkdir -p ${shellQuote(dirname(linkPath))} && rm -rf ${shellQuote(linkPath)} && ln -sfn ${shellQuote(target)} ${shellQuote(linkPath)}`
    )
  }

  async listDir(remotePath: string): Promise<string[]> {
    const out = await this.execOrThrow(
      `ls -1 ${shellQuote(remotePath)} 2>/dev/null || true`
    )
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  async readFile(remotePath: string): Promise<Buffer> {
    const { code, stdout, stderr } = await this.exec(
      `base64 -w0 ${shellQuote(remotePath)} 2>/dev/null || base64 ${shellQuote(remotePath)}`
    )
    if (code !== 0) throw new Error(`ssh read failed: ${stderr}`)
    return Buffer.from(stdout.trim(), 'base64')
  }

  async writeBinary(remotePath: string, data: Buffer) {
    const dir = await mkdtemp(join(tmpdir(), 'eclipse-scp-'))
    const local = join(dir, 'payload')
    try {
      await writeFile(local, data)
      await this.scpToRemote(local, remotePath)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  async scpToRemote(localPath: string, remotePath: string) {
    await this.mkdirp(dirname(remotePath))
    await new Promise<void>((resolve, reject) => {
      const child = spawn('scp', this.scpArgs(localPath, remotePath))
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`scp failed: ${stderr}`))
      })
    })
  }

  async rm(remotePath: string) {
    await this.execOrThrow(`rm -rf ${shellQuote(remotePath)}`)
  }

  async mv(from: string, to: string) {
    await this.mkdirp(dirname(to))
    await this.execOrThrow(`mv ${shellQuote(from)} ${shellQuote(to)}`)
  }

  async listDirDetailed(
    remotePath: string
  ): Promise<
    Array<{ name: string; isDir: boolean; size: number; mtimeMs: number }>
  > {
    const script = `python3 - <<'PY'
import json, os, sys
path = ${JSON.stringify(remotePath)}
out = []
try:
  names = sorted(os.listdir(path))
except FileNotFoundError:
  print("[]")
  sys.exit(0)
for name in names:
  if name == ".eclipse-runtime.env":
    continue
  abs = os.path.join(path, name)
  try:
    st = os.stat(abs)
  except OSError:
    continue
  out.append({
    "name": name,
    "isDir": os.path.isdir(abs),
    "size": st.st_size if os.path.isfile(abs) else 0,
    "mtimeMs": int(st.st_mtime * 1000),
  })
print(json.dumps(out))
PY`
    const stdout = await this.execOrThrow(script)
    return JSON.parse(stdout.trim()) as Array<{
      name: string
      isDir: boolean
      size: number
      mtimeMs: number
    }>
  }

  async createTarGzToLocal(remoteDir: string, localOut: string) {
    await mkdir(dirname(localOut), { recursive: true })
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ssh', [
        ...this.sshArgs(
          `tar -czf - --exclude=logs --exclude=crash-reports --exclude=cache -C ${shellQuote(remoteDir)} .`
        )
      ])
      const out = createWriteStream(localOut)
      child.stdout.pipe(out)
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      out.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`remote tar failed: ${stderr}`))
      })
    })
  }

  async extractTarGzFromLocal(localArchive: string, remoteDir: string) {
    await this.mkdirp(remoteDir)
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ssh', [
        ...this.sshArgs(
          `rm -rf ${shellQuote(remoteDir)}/* ${shellQuote(remoteDir)}/.[!.]* 2>/dev/null; mkdir -p ${shellQuote(remoteDir)} && tar -xzf - -C ${shellQuote(remoteDir)}`
        )
      ])
      const input = spawn('cat', [localArchive])
      input.stdout.pipe(child.stdin!)
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`remote extract failed: ${stderr}`))
      })
    })
  }
}

export async function sha256LocalFile(filePath: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

export async function statLocalSize(filePath: string): Promise<number> {
  const { stat } = await import('node:fs/promises')
  return (await stat(filePath)).size
}
