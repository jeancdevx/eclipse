# Eclipse

Personal Minecraft control plane: multi-instance (one active), live console,
Discord bot, auto idle shutdown, and Azure VM + Terraform — powered by
[itzg/docker-minecraft-server](https://github.com/itzg/docker-minecraft-server).

## Stack

| Layer         | Choice                                                      |
| ------------- | ----------------------------------------------------------- |
| Runtime       | Node.js 24 LTS                                              |
| Monorepo      | pnpm workspaces + Turborepo                                 |
| Lint / format | Oxlint + Oxfmt                                              |
| Panel         | Next.js 16 + Tailwind 4 + shadcn/ui                         |
| Auth          | Better Auth + Microsoft Entra ID                            |
| API           | Hono                                                        |
| Bot           | discord.js                                                  |
| DB            | Drizzle + PostgreSQL 17                                     |
| Game          | `itzg/minecraft-server`                                     |
| Cloud         | Azure VM (Premium SSD data disk) + Blob backups + Terraform |

## Quick start (local)

```bash
# Minecraft playground only
pnpm mc:up
pnpm mc:logs
pnpm mc:down

# Full control plane (API + web + postgres + mc)
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

- Panel: http://localhost:3000
- API: http://localhost:4000
- Minecraft: `localhost:25565`

Dev auth: set `AUTH_DEV_BYPASS=true` for local without Entra, or configure Microsoft Entra
(redirect `http://localhost:3000/api/auth/callback/microsoft`). The panel calls same-origin
`/api/v1` (Next BFF) — do not put `API_TOKEN` in `NEXT_PUBLIC_*`.

## Docs

- [Architecture](docs/architecture.md)
- [Local Docker](docs/local-docker.md)
- [Production (Topology B)](docs/production.md)
- [Azure / Terraform](docs/azure.md)
- [Memory presets](docs/presets.md)
- [Modpack runbook (~300 mods)](docs/modpack-runbook.md)

## Monorepo layout

```text
apps/web          Next.js panel
apps/api          Hono control API
apps/bot          Discord bot
packages/shared   Zod schemas + types
packages/db       Drizzle schema
packages/game-host  DockerComposeHost | AzureVmDockerHost + BackupStore
packages/auth     Better Auth config
infra/docker      Compose (local + guest VM)
infra/terraform   Azure IaC
```

## Scripts

| Script                               | Description                     |
| ------------------------------------ | ------------------------------- |
| `pnpm dev`                           | Turbo dev (api, web, bot)       |
| `pnpm lint`                          | Oxlint                          |
| `pnpm format`                        | Oxfmt write                     |
| `pnpm format:check`                  | Oxfmt check                     |
| `pnpm check`                         | lint + format:check + typecheck |
| `pnpm mc:up` / `mc:down` / `mc:logs` | itzg playground                 |
| `pnpm images:build`                  | Build api/web/bot Docker images |
| `pnpm cp:up` / `cp:down`             | Control-plane compose           |
| `pnpm db:push`                       | Drizzle push schema             |
