# Production deploy — Topology B

Always-on **control plane** (API + web + bot + Postgres) + **Azure game VM** that deallocates on idle.

```text
Players ──25565──► Game VM (Docker / itzg)
Discord ──────────► Bot ──► API
Panel   ──────────► Web ──► API
API ──SSH DOCKER_HOST + RCON──► Game VM
API ──ARM start/deallocate──► Game VM
API ──Blob───────────────────► Backups
```


| Machine           | Created by                             | Used for                                          |
| ----------------- | -------------------------------------- | ------------------------------------------------- |
| **Control plane** | You (cheap always-on VM / Docker host) | Panel URL, Entra login, `BETTER_AUTH_URL`         |
| **Game VM**       | `terraform apply`                      | Players (`JOIN_HOST`), `DOCKER_HOST`, `RCON_HOST` |


Do **not** put the game VM IP in Entra. Azure does not give you a panel domain; Terraform only outputs the game `public_ip`.

Follow the steps **in this order**. Do not skip ahead to Entra redirect until step 7 (you need the control-plane IP first).

Also see [Azure / Terraform](azure.md).

---

## Step 0 — Prerequisites (before anything else)

Install / have ready:

- [Azure CLI](https://learn.microsoft.com/cli/azure/) → `az login`
- [Terraform](https://developer.hashicorp.com/terraform) ≥ 1.5
- Docker + Compose on the machine that will be the control plane
- This repo cloned (on your laptop and later on the control plane)

Optional: a registered domain. If you have none, you will use the control-plane **public IP** (or `IP.sslip.io`) in later steps.

---

## Step 1 — Create Discord app (tokens only; no IPs needed yet)

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application.
2. **Bot** → Reset Token → save `DISCORD_TOKEN`.
  Also enable (if shown): Message Content Intent only if you need it later — not required for slash commands alone.
3. **OAuth2** → Overview → save `Client ID` as `DISCORD_CLIENT_ID`.
4. Invite the bot to your guild:
  - Left sidebar → **OAuth2** → **URL Generator** (Generador de URL).
  - Under **Scopes**, check **only**:
    - `bot`
    - `applications.commands`
  - Do **not** check `guilds` (that is for user OAuth and forces a redirect URI — the invite URL will stay blocked with “Ingresa un URI de redirección”).
  - Under **Bot permissions**, check at least:
    - Send Messages
    - Use Application Commands  
    (Administrator also works, but is more than needed.)
  - Scroll to the bottom: **Generated URL** / **URL generada** appears as a full `https://discord.com/api/oauth2/authorize?...` link.
  - Copy it, open it in the browser, pick your server, Authorize.
5. Note `DISCORD_GUILD_ID` (Server Settings → Widget, or enable Developer Mode → right‑click server → Copy Server ID) and your Discord user ID(s) for `DISCORD_ADMIN_USER_IDS` (Developer Mode → right‑click your avatar → Copy User ID).

Keep these values for the `.env` in step 8. You do not need any Azure IP yet.

---

## Step 2 — Create Entra app registration (IDs + secret only)

Create the app **now**, but **do not finalize the redirect URI** until step 7 (after the control plane has a public IP).

1. Entra ID → App registrations → New registration.
2. Name it (e.g. `eclipse-panel`). You can skip redirect for now, or add a placeholder and edit later.
3. Certificates & secrets → New client secret → copy the value **once**.
4. Overview → save:
  - Application (client) ID → `MICROSOFT_CLIENT_ID`
  - Directory (tenant) ID → `MICROSOFT_TENANT_ID`
  - Client secret → `MICROSOFT_CLIENT_SECRET`

Redirect URI is configured in **step 7**, not here.

---

## Step 3 — Generate SSH keys on your laptop

```bash
# Admin access to the game VM (you)
ssh-keygen -t ed25519 -f ~/.ssh/eclipse_admin -N ''

# Control plane → game VM (Docker over SSH). Keep the private key for the control plane.
ssh-keygen -t ed25519 -f ~/.ssh/eclipse_game -N ''
```

- `eclipse_admin.pub` → Terraform `ssh_public_key`
- `eclipse_game.pub` → Terraform `control_plane_ssh_pubkey` (step 5 / 6)
- `eclipse_game` (private) → copy to the control plane later; never commit it

Also note **your laptop public IP** for `allowed_ssh_cidr` (e.g. `1.2.3.4/32`).

---

## Step 4 — First Terraform apply (game VM)

You may not know the control-plane IP yet. Apply with admin SSH first; RCON/control-plane rules can wait until step 6.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Fill at least:

```hcl
ssh_public_key           = "ssh-ed25519 AAAA... eclipse_admin.pub"
control_plane_ssh_pubkey = "ssh-ed25519 AAAA... eclipse_game.pub"  # OK to set now
control_plane_cidr       = ""   # fill in step 6 when you know control-plane IP
allowed_ssh_cidr         = "YOUR_LAPTOP_IP/32"
vm_size                  = "Standard_D4s_v5"
```

```bash
terraform init
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

**Write down:**


| Output                                   | Use later as                                                  |
| ---------------------------------------- | ------------------------------------------------------------- |
| `public_ip`                              | `GAME_IP` / `PUBLIC_IP` / `JOIN_HOST` (players + Docker/RCON) |
| `resource_group`                         | `AZURE_RESOURCE_GROUP`                                        |
| `vm_name`                                | `AZURE_VM_NAME`                                               |
| `backup_container_url` / storage account | `AZURE_BACKUP_ACCOUNT_URL`                                    |
| subscription id (`az account show`)      | `AZURE_SUBSCRIPTION_ID`                                       |


Cloud-init installs Docker, writes `/opt/eclipse/compose.guest.yaml`, mounts data at `/var/lib/eclipse`. Minecraft does **not** start on boot.

NSG: `25565` open to players. RCON `25575` opens only when `control_plane_cidr` is set (step 6).

---

## Step 5 — Provision the control plane host

Create a **second** always-on machine (e.g. Azure `Standard_B2s`, or any Docker VPS). This is **not** the game VM from step 4.

**Quota note:** if your Azure regional core limit is only 4 and the game VM already uses 4 vCPUs, you cannot keep a second Azure VM running at the same time. Options: raise the quota to ≥6–8, or run the control plane on your laptop / another non-Azure host (valid for v1).

1. Install Docker Engine + Compose plugin.
2. Clone this repo on that host.
3. Copy `~/.ssh/eclipse_game` (private key) onto the control plane, e.g. `/home/YOU/.ssh/eclipse_game` (`chmod 600`).
4. Note the control plane **public IP** → call it `CONTROL_PLANE_IP`.  
   Also note the **outbound** IP Azure sees when you SSH to the game VM (`echo $SSH_CLIENT` on the game host). ISP multi-egress means `curl ifconfig.me` can differ from the IP NSG must allow.
5. Build images:

```bash
pnpm images:build
```

6. Generate secrets for step 8 (`API_TOKEN`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `RCON_PASSWORD`).
---

## Step 6 — Wire control plane → game VM (Terraform second apply)

On your laptop / wherever you run Terraform, update `terraform.tfvars`:

```hcl
control_plane_ssh_pubkey = "ssh-ed25519 AAAA... eclipse_game.pub"
control_plane_cidr       = "CONTROL_PLANE_IP/32"   # e.g. "20.50.60.70/32"
```

```bash
terraform apply
```

If cloud-init already ran and the pubkey is missing on the game VM, append it manually:

```bash
ssh -i ~/.ssh/eclipse_admin eclipse@GAME_IP \
  'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys' < ~/.ssh/eclipse_game.pub
```

Smoke test **from the control plane**:

```bash
ssh -i ~/.ssh/eclipse_game eclipse@GAME_IP 'docker version'
```

---

## Step 7 — Finish Entra redirect (now that you know CONTROL_PLANE_IP)

In Entra → your app → Authentication → Add a platform → **Web** → Redirect URI.

Pick **one** option and use the **same** base URL in `.env` (`BETTER_AUTH_URL`, `CORS_ORIGIN`).

### Option A — No domain (HTTP + IP)

```text
http://CONTROL_PLANE_IP:3000/api/auth/callback/microsoft
```

`.env`: `BETTER_AUTH_URL=http://CONTROL_PLANE_IP:3000`

If Entra rejects non-localhost HTTP, use Option B.

### Option B — No purchased domain (`sslip.io` + HTTPS)

```text
https://CONTROL_PLANE_IP.sslip.io/api/auth/callback/microsoft
```

`.env`: `BETTER_AUTH_URL=https://CONTROL_PLANE_IP.sslip.io`  
Put Caddy/nginx with TLS in front of port 3000.

### Option C — You own a domain

```text
https://panel.example.com/api/auth/callback/microsoft
```

`.env`: `BETTER_AUTH_URL=https://panel.example.com`  
DNS A/CNAME: `panel…` → `CONTROL_PLANE_IP`. Optional: `play…` → `GAME_IP`.

---

## Step 8 — Write control-plane `.env`

Use the **production** template — do **not** overwrite your laptop `.env`.

```bash
cp deploy/control-plane.env.example deploy/control-plane.env
# fill secrets, then on the CP VM (repo at /opt/eclipse):
scp deploy/control-plane.env eclipse@CONTROL_PLANE_IP:/opt/eclipse/.env
```

Required shape (replace placeholders):

```bash
NODE_ENV=production
AUTH_DEV_BYPASS=false

POSTGRES_PASSWORD=...
DATABASE_URL=postgresql://eclipse:POSTGRES_PASSWORD@postgres:5432/eclipse

API_TOKEN=...                      # server-only; panel uses session BFF
BETTER_AUTH_SECRET=...             # ≥32 chars

# Panel URLs = CONTROL PLANE (from step 7)
BETTER_AUTH_URL=http://CONTROL_PLANE_IP:3000
CORS_ORIGIN=http://CONTROL_PLANE_IP:3000
PUBLIC_API_URL=http://CONTROL_PLANE_IP:4000
API_URL=http://api:4000            # in-compose (web BFF → api)

# Game = Terraform GAME_IP (from step 4) — not the control plane
GAME_HOST=azure
DOCKER_HOST=ssh://eclipse@GAME_IP
SSH_PRIVATE_KEY_PATH=/opt/eclipse/eclipse_game
RCON_HOST=GAME_IP
RCON_PORT=25575
RCON_PASSWORD=...
ECLIPSE_INSTANCES_DIR=/var/lib/eclipse/instances
MC_COMPOSE_FILE=/app/infra/docker/compose.guest.yaml
JOIN_HOST=GAME_IP
JOIN_PORT=25565
PUBLIC_IP=GAME_IP

AZURE_SUBSCRIPTION_ID=...
AZURE_RESOURCE_GROUP=...
AZURE_VM_NAME=...
AZURE_BACKUP_ACCOUNT_URL=https://ACCOUNT.blob.core.windows.net
AZURE_BACKUP_CONTAINER=eclipse-backups

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=...
AUTH_ALLOWLIST=you@outlook.com

DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
DISCORD_ADMIN_USER_IDS=123456789012345678
```

The panel browser never sees `API_TOKEN`. Next proxies `/api/v1/*` to Hono after verifying the Better Auth session.

Compose mounts `SSH_PRIVATE_KEY_PATH` into the API container. For Azure ARM/Blob: managed identity on the CP VM, or a service principal.

**Phase 2 (optional):** Key Vault / HTTPS terminator — not required for v1.

---

## Step 9 — Start Postgres + migrate DB

```bash
# start stack (or at least postgres) so DATABASE_URL is reachable
docker compose -f infra/docker/compose.control-plane.yaml up -d postgres
# wait until healthy, then:
pnpm db:push
```

---

## Step 10 — Start the full control plane

```bash
export POSTGRES_PASSWORD=...   # if compose interpolates it
export PUBLIC_API_URL=...      # same as .env
export BETTER_AUTH_URL=...
export DOCKER_HOST=ssh://eclipse@GAME_IP
export SSH_PRIVATE_KEY_PATH=$HOME/.ssh/eclipse_game

docker compose -f infra/docker/compose.control-plane.yaml up -d
# or: pnpm cp:up

docker compose -f infra/docker/compose.control-plane.yaml ps
curl -fsS http://127.0.0.1:4000/health
```

---

## Step 11 — First login + first instance

1. Open the panel URL from step 7 (e.g. `http://CONTROL_PLANE_IP:3000`).
2. Sign in with Microsoft (email must be in `AUTH_ALLOWLIST`).
3. Create an instance in the panel (dirs are created on the game VM via SSH).

---

## Step 12 — Smoke test

```bash
# Remote Docker
ssh -i "$SSH_PRIVATE_KEY_PATH" eclipse@GAME_IP 'docker ps'
DOCKER_HOST=ssh://eclipse@GAME_IP docker ps

# Lifecycle
curl -fsS -H "Authorization: Bearer $API_TOKEN" \
  http://127.0.0.1:4000/api/v1/server/status
curl -fsS -X POST -H "Authorization: Bearer $API_TOKEN" \
  http://127.0.0.1:4000/api/v1/server/start
curl -fsS -X POST -H "Authorization: Bearer $API_TOKEN" \
  http://127.0.0.1:4000/api/v1/server/stop
```

Discord: `/mc status`, `/mc start`, `/mc stop` (stop deallocates the game VM when `GAME_HOST=azure`).

Idle: leave server empty for `IDLE_MINUTES` → stop container + deallocate VM; data disk persists.

---

## Step 13 — Security checklist

- [ ] `AUTH_DEV_BYPASS=false`
- [ ] Strong unique `API_TOKEN`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `RCON_PASSWORD`
- [ ] Entra redirect matches the exact panel URL (control plane, not game VM)
- [ ] RCON `25575` only from `control_plane_cidr`
- [ ] Admin SSH limited to your laptop CIDR
- [ ] `DISCORD_ADMIN_USER_IDS` set (bot refuses empty list in production)
- [ ] Blob container private; one backup restore tested
- [ ] Prefer HTTPS for the panel when possible (Option B/C)

---

## Day-2 operations (after go-live)


| Task                 | How                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control-plane logs   | `docker compose -f infra/docker/compose.control-plane.yaml logs -f api`                                                                             |
| Game logs            | Panel console, or `docker -H ssh://eclipse@GAME_IP logs -f eclipse-mc`                                                                              |
| Restore backup       | Panel / `POST /api/v1/backups/:id/restore`                                                                                                          |
| Resize game VM       | Change `vm_size` → deallocate → `terraform apply`                                                                                                   |
| Guest compose change | Edit `infra/docker/compose.guest.yaml`, rebuild `eclipse-api` image (API ships the file), re-apply cloud-init or `scp` to `/opt/eclipse/` on the VM |


---

## Order cheat-sheet

```text
0  Prerequisites
1  Discord app (tokens)
2  Entra app (client id/secret/tenant only — no redirect yet)
3  SSH keys (admin + control→game)
4  terraform apply → note GAME_IP
5  Create control plane host → note CONTROL_PLANE_IP; build images; copy private key
6  Set control_plane_cidr → terraform apply again; test SSH to game VM
7  Entra redirect URI = control plane URL (IP / sslip.io / domain)
8  Write .env (panel URLs = control plane; Docker/RCON/join = GAME_IP)
9  db:push
10 compose up control plane
11 First Entra login + create instance
12 Smoke start/stop + Discord
13 Security checklist
```

---

## Out of scope for v1

- Key Vault as the only secret source (phase 2)
- Cloudflare DNS API automation
- CI pushing images to ACR / auto-deploy
- Azure Database for PostgreSQL Flexible Server (compose Postgres on the control plane is enough)

