# Local Docker (itzg)

## Minecraft only

From repo root:

```bash
pnpm mc:up      # docker compose -f infra/docker/compose.mc.yaml up -d
pnpm mc:logs
pnpm mc:down
```

Data lives under `infra/docker/data/default/` (world, mods, config).

Drop JARs into `infra/docker/data/default/mods/` or set `MODRINTH_PROJECTS` in the compose env.

## Full stack

```bash
pnpm stack:up   # postgres + mc + (run api/web/bot via pnpm dev)
```

Or use `infra/docker/compose.yaml` which includes Postgres and Azurite (optional Blob emulator).

## Env

Copy `.env.example` → `.env`. Important vars:

- Paths (`ECLIPSE_INSTANCES_DIR`, `MC_COMPOSE_FILE`, `BACKUP_DIR`) are **relative to the repo root**, not `apps/api`
- `ECLIPSE_INSTANCES_DIR` — default `infra/docker/data/instances`
- `MC_COMPOSE_FILE` — compose uses `env_file: ./data/.eclipse-runtime.env` (stable file; also copied into each instance dir)
- `pnpm stack:up` / `pnpm mc:up` run `scripts/ensure-mc-data.mjs` first so `data/active` + `.eclipse-runtime.env` exist on a fresh clone (heals broken `active` symlinks)
- `MC_CONTAINER_NAME` — default `eclipse-mc`
- `RCON_PASSWORD`
- `AUTH_DEV_BYPASS=true` for local panel without Entra
- Dashboard calls same-origin `/api/v1` (Next BFF); set server-only `API_TOKEN` (never `NEXT_PUBLIC_API_TOKEN`)
- `JOIN_HOST` / `JOIN_PORT` — address shown on the Overview connection card (defaults to LAN IP or `localhost`)
- `CF_API_KEY` — required for CurseForge modpack installs

On `GAME_HOST=local`, the API clamps `MEMORY` to ~45% of host RAM so presets like `standard` (16G) do not OOM-kill Java (exit 137) on laptops.

## Connection (join address)

The panel Overview card calls `GET /api/v1/server/connection` and shows `host:port` with copy. Resolution order:

1. Settings override (runtime)
2. `JOIN_HOST` env
3. `PUBLIC_IP` env
4. Detected LAN IPv4 / `localhost`

Players connect to that address on Java Minecraft (default port `25565`).

## RCON

Enabled on `25575`. The API uses it for commands and player counts.

## Troubleshooting

### `failed to add the host (veth…) <=> sandbox (veth…) pair interfaces: operation not supported`

This is a **host Docker/kernel** issue (very common on Manjaro/Arch after a package update), not an Eclipse compose bug.

Docker needs the `veth` kernel module for bridge networking. After a kernel upgrade, modules for the *running* kernel are often gone until reboot.

**Fix (almost always):**

```bash
# Confirm mismatch (optional)
uname -r
ls /lib/modules/$(uname -r)/kernel/drivers/net/veth.ko* 2>/dev/null || echo "veth module missing for running kernel — reboot"

sudo reboot
```

After reboot:

```bash
pnpm stack:down   # cleans leftover stopped containers if any
pnpm stack:up
```

If it still fails after reboot:

```bash
sudo modprobe veth
sudo systemctl restart docker
pnpm stack:up
```

### Cleanup leftover failed start

```bash
pnpm stack:down
# or:
docker compose -f infra/docker/compose.yaml down --remove-orphans
```

### Postgres: `data in /var/lib/postgresql/data (unused mount/volume)` (18+)

Eclipse pins **Postgres 17** with the classic mount `…/data`. If you previously pulled Postgres 18 (or have a broken volume), reset the local DB volume (destroys local DB data only):

```bash
pnpm stack:down
docker volume ls | grep eclipse_pg
docker volume rm docker_eclipse_pg   # name may be eclipse_pg or <project>_eclipse_pg
pnpm stack:up
pnpm db:push
```
