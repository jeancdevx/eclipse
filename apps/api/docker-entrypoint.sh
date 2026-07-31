#!/bin/sh
set -eu
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ -n "${SSH_PRIVATE_KEY_PATH:-}" ] && [ -f "$SSH_PRIVATE_KEY_PATH" ]; then
  cp "$SSH_PRIVATE_KEY_PATH" /root/.ssh/id_eclipse
  chmod 600 /root/.ssh/id_eclipse
  cat >/root/.ssh/config <<'EOF'
Host *
  IdentityFile /root/.ssh/id_eclipse
  StrictHostKeyChecking accept-new
  UserKnownHostsFile /root/.ssh/known_hosts
EOF
  chmod 600 /root/.ssh/config
fi
exec "$@"
