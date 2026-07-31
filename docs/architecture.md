# Eclipse architecture

## Goals

- Host one Minecraft Java server at a time with heavy mod support (~300 mods).
- Keep multiple world/mod **profiles** on disk; switch without losing worlds.
- Admin panel (Entra ID) + Discord bot for lifecycle.
- Local Docker first; Azure VM + Terraform for production.
- Cost control: deallocate game VM when idle; persist data on Premium SSD; cold backups in Blob.

## Planes

```text
┌─────────────────────────────────────────────────────────┐
│ Control plane (always on)                               │
│  apps/web (Next) → apps/api (Hono) ← apps/bot (Discord) │
│  PostgreSQL (instances, backups metadata, sessions)     │
└───────────────────────────┬─────────────────────────────┘
                            │ GameHost + BackupStore
┌───────────────────────────▼─────────────────────────────┐
│ Game plane (on/off)                                     │
│  Local: Docker Compose itzg container                   │
│  Azure: Linux VM + Docker + Premium SSD data disk       │
│  Active instance mount → /data                          │
└─────────────────────────────────────────────────────────┘
```

## Storage

| Path | Where | Purpose |
| ---- | ----- | ------- |
| Hot | VM data disk `/var/lib/eclipse/instances/{id}` | Worlds, mods, configs |
| Cold | Azure Blob `eclipse-backups` | `tar.gz` archives |
| Meta | Postgres | Instance + backup rows |

Azure Files is **not** used for live `/data` (latency/IOPS).

## GameHost contract

```ts
interface GameHost {
  start(instanceId: string): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  switchInstance(instanceId: string): Promise<void>
  getStatus(): Promise<ServerStatus>
  streamLogs(): AsyncIterable<string>
  execRcon(cmd: string): Promise<string>
  listMods(instanceId: string): Promise<string[]>
  // Azure only:
  ensureVmRunning?(): Promise<void>
  deallocateIfIdle?(): Promise<void>
}
```

Mutex: only one instance `running` / `starting` at a time.

## BackupStore contract

```ts
interface BackupStore {
  create(instanceId: string, triggeredBy: string): Promise<Backup>
  list(instanceId?: string): Promise<Backup[]>
  restore(backupId: string, targetInstanceId: string): Promise<void>
  prune(retention: RetentionPolicy): Promise<number>
}
```

Adapters: `LocalFsBackupStore`, `AzureBlobBackupStore`.

## Auth

- Panel UI: Better Auth + Microsoft Entra ID (allowlist via `AUTH_ALLOWLIST`).
- Browser → Next `/api/v1/*` BFF (session cookie) → Hono with server-only `API_TOKEN`.
- Local escape hatch: `AUTH_DEV_BYPASS=true` skips Entra (never in production).
- Discord bot: `DISCORD_ADMIN_USER_IDS`; talks to Hono directly with `API_TOKEN`.

## Idle shutdown

1. Poll player count via RCON / status.
2. If 0 players for `IDLE_MINUTES`, call `stop()`.
3. On Azure (`DockerComposeHost` + `AzureVmDockerHost`), deallocate the game VM after stop.

## Memory presets

| Preset | MEMORY | Use |
| ------ | ------ | --- |
| light | 8G | Vanilla / light packs |
| standard | 16G | Medium packs |
| heavy | 24G | ~300 mods |

## Game host adapters

- `DockerComposeHost` — compose/RCON (local Docker or `DOCKER_HOST=ssh://`)
- `AzureVmDockerHost` — ARM start/deallocate wrapping `DockerComposeHost`
- Backups: local `tar.gz` or Azure Blob (`AzureBlobBackupStore`)
