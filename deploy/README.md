# Deploy artifacts (gitignored secrets)

Tracked here:

- [`control-plane.env.example`](control-plane.env.example) — production env template

Gitignored (local machine only):

- `control-plane.env` — filled production secrets (sync to `/opt/eclipse/.env`)
- Image tarballs, ad-hoc notes

## Canonical compose

Use only [`infra/docker/compose.control-plane.yaml`](../infra/docker/compose.control-plane.yaml) (api + web + bot + postgres).

On the control-plane VM, keep a full repo checkout at `/opt/eclipse` so `env_file: ../../.env` resolves to `/opt/eclipse/.env`.

```bash
# laptop
pnpm images:build
docker save eclipse-api:local eclipse-web:local eclipse-bot:local \
  | gzip > deploy/cp-images.tar.gz
scp deploy/cp-images.tar.gz deploy/control-plane.env \
  eclipse@CONTROL_PLANE_IP:/opt/eclipse/

# control plane
cd /opt/eclipse
gunzip -c cp-images.tar.gz | docker load
cp control-plane.env .env   # or scp directly to .env
mkdir -p infra/docker
# sync compose.control-plane.yaml into infra/docker/
unset DOCKER_HOST   # host Docker must stay local; api gets DOCKER_HOST from .env
docker compose -p eclipse --env-file .env \
  -f infra/docker/compose.control-plane.yaml up -d
```

See [docs/production.md](../docs/production.md) for the full runbook.
