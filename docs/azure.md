# Azure deployment

> **Full production walkthrough (Topology B):** [production.md](production.md) — Entra, Discord, Terraform, control-plane compose, DNS, smoke tests, security checklist.

## What Terraform creates

- Resource group, VNet, subnet, NSG (`25565` public; RCON `25575` + SSH from `control_plane_cidr`; optional admin SSH from `allowed_ssh_cidr`)
- Linux VM (Docker via cloud-init) + **Premium SSD data disk** mounted at `/var/lib/eclipse`
- Guest compose at `/opt/eclipse/compose.guest.yaml` + minimal `.eclipse-runtime.env` (MC not started on boot)
- Public static IP
- User-assigned managed identity (VM contributor + Key Vault + Blob)
- Storage account + container `eclipse-backups`
- Key Vault (secrets placeholders)
- Optional: backend state storage documented in `infra/terraform/backend.tf.example`

## Apply

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit ssh keys, control_plane_cidr, allowed_ssh_cidr, vm_size
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Outputs: `public_ip`, `vm_id`, `backup_container_url`, `resource_group`.

Set `control_plane_ssh_pubkey` to the control plane’s public key and `control_plane_cidr` to its public IP `/32` so the API can use `DOCKER_HOST=ssh://…` and RCON safely. Details in [production.md](production.md).

## DNS / join address

1. Set `PUBLIC_IP` (or `JOIN_HOST`) in the control-plane `.env` to the Terraform `public_ip` output (or a hostname).
2. Optionally create a DNS **A** or **CNAME** record (e.g. `play.example.com` → public IP) and set `JOIN_HOST=play.example.com`.
3. The panel Overview connection card shows that address for players. Cloudflare/API automation is out of scope for v1 — manage DNS in your registrar or Cloudflare UI.

Open NSG `25565` to players (already in Terraform NSG). Keep RCON (`25575`) locked to `control_plane_cidr`.

## Game VM lifecycle

Control plane (API) uses `@azure/arm-compute` + managed identity:

1. `ensureVmRunning()` — start + wait
2. Remote Docker over `DOCKER_HOST=ssh://eclipse@…` with guest compose + active symlink under `/var/lib/eclipse`
3. On idle/stop: stop container → deallocate VM (data disk persists)

## Backups

`AzureBlobBackupStore` creates a remote `tar.gz` over SSH when configured, uploads to Blob; metadata in Postgres.
Restore downloads and extracts onto the game VM instance path via SSH.

## Control plane hosting

See [production.md](production.md). v1: small always-on VM running `infra/docker/compose.control-plane.yaml` (`api` + `web` + `bot` + Postgres 17). Point `GAME_HOST=azure`, `DOCKER_HOST`, `RCON_HOST`, and Azure env vars at the game VM.
